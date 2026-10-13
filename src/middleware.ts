// Portão de entrada do sistema.
//
// POR QUE MUDOU: até hoje só existia proteção quando havia Supabase
// configurado — sem ele, todo mundo passava, inclusive com a planilha real
// do dono plugada (faturamento, lucro, saldo, alunos com telefone, tudo
// aberto na internet). Agora toda rota passa por `modoAcesso()`
// (src/lib/acesso.ts), que falha FECHADO: sem forma de identificar quem
// entrou, tranca em vez de mostrar.
//
// Roda em Edge Runtime — por isso a conferência do cookie usa `seloConfere`
// (que usa só `crypto.subtle`, disponível lá) e nada daqui importa `fs`,
// `Buffer` ou o módulo `crypto` do Node.

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { ambienteAtual, COOKIE_ACESSO, modoAcesso, rotaLivre, rotaSemConsultaDeSessao, seloConfere } from "@/lib/acesso";
import { papelDe, PAPEL_PADRAO } from "@/lib/papeis";
import { decidirAcesso, decidirAcessoAssinatura, decidirAcessoSupabase } from "@/lib/portao";
import { acessoSaasLiberado, type EstadoSaas } from "@/lib/saas/estado";

function controleSaasAtivo(): boolean {
  return process.env.MENTOROS_SAAS_TESTES_ATIVOS === "1";
}

export async function middleware(req: NextRequest) {
  const modo = modoAcesso(ambienteAtual());

  if (modo === "supabase") {
    // Recuperação e callback trocam um token próprio do Supabase; não são
    // sessão normal. Tentar renová-la antes dessa etapa só adiciona uma
    // chamada remota que pode expirar e impedir justamente a recuperação.
    if (rotaSemConsultaDeSessao(req.nextUrl.pathname)) return NextResponse.next();

    // Comportamento de hoje, intocado: cada pessoa tem login próprio, com
    // sessão renovada a cada request. É o destino final do portão — os
    // outros três modos existem só para os degraus até aqui.
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    let res = NextResponse.next({ request: req });
    const supabase = createServerClient(url, key, {
      cookies: {
        get(name: string) {
          return req.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: Record<string, unknown>) {
          req.cookies.set({ name, value, ...options });
          res = NextResponse.next({ request: req });
          res.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: Record<string, unknown>) {
          req.cookies.set({ name, value: "", ...options });
          res = NextResponse.next({ request: req });
          res.cookies.set({ name, value: "", ...options });
        },
      },
    });

    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Sessão existe, mas sessão não é papel: `/financeiro` não é "logado
    // abre", é "dono e gestor abrem". A linha de `profiles` é quem sabe o
    // papel, e a política de RLS (supabase/migrations/0008.sql linha 421)
    // garante que esta consulta só pode ler a PRÓPRIA linha — ninguém
    // descobre o papel de outra pessoa por aqui.
    //
    // FALHA FECHADA: erro de rede, linha ausente (perfil ainda não
    // preenchido), `papel` nulo ou um valor fora do enum — todos passam por
    // `papelDe()` e viram "mentorado", o papel MENOS privilegiado. Um
    // problema no banco não pode, por acidente, virar acesso de dono; o pior
    // caso possível é um usuário legítimo ver menos do que devia por um
    // instante, nunca mais do que devia.
    let papel = PAPEL_PADRAO;
    let workspaceId = "";
    if (user) {
      try {
        const { data: perfil, error } = await supabase
          .from("profiles")
          .select("papel, workspace_id")
          .eq("id", user.id)
          .maybeSingle();
        // `maybeSingle()` do supabase-js NÃO lança em erro de RLS/rede — ele
        // devolve `{data:null, error:{...}}`. Sem este `if`, o try/catch
        // abaixo nunca dispara nesse caminho e um DONO legítimo cuja
        // consulta falhe vira "mentorado" e é barrado do próprio financeiro
        // SEM NENHUM RASTRO para diagnosticar. O comportamento fail-closed
        // não muda (ainda cai em `papelDe(undefined)` = PAPEL_PADRAO) — só
        // ganha um log. `error.code`/`error.message` são detalhe técnico da
        // consulta, nunca id, e-mail ou token: aqueles vazariam quem é a
        // pessoa barrada num log que qualquer operador da infraestrutura lê.
        if (error) {
          console.warn(
            "[portao] papel não pôde ser lido, acesso rebaixado ao mínimo:",
            error.code,
            error.message
          );
        }
        papel = papelDe(perfil?.papel);
        workspaceId = typeof perfil?.workspace_id === "string" ? perfil.workspace_id : "";
      } catch {
        // Exceção nunca derruba o middleware — o site inteiro ficaria fora
        // do ar por um soluço de rede. O papel padrão, já falho fechado,
        // resolve.
        papel = PAPEL_PADRAO;
      }
    }

    const decisao = decidirAcessoSupabase({
      pathname: req.nextUrl.pathname,
      usuario: user ? { papel } : null,
    });

    // "passa" devolve `res`, não `NextResponse.next()` cru: `res` é quem
    // carrega os cookies renovados que os callbacks `set`/`remove` acima
    // foram escrevendo durante `getUser()`. Um `NextResponse.next()` novo
    // aqui perderia essa renovação e deslogaria o usuário aos poucos.
    if (decisao.tipo !== "passa") {
      const resposta = NextResponse.redirect(new URL(decisao.para, req.url));
      for (const cookie of res.cookies.getAll()) resposta.cookies.set(cookie);
      return resposta;
    }

    // A cobrança só entra em vigor depois de a migration estar aplicada e a
    // variável privada ligar o controle. Antes disso, o produto legado segue
    // intacto; depois disso, uma falha de leitura bloqueia a operação em vez
    // de liberar por acidente um teste vencido.
    if (user && controleSaasAtivo() && !rotaLivre(req.nextUrl.pathname) && !req.nextUrl.pathname.startsWith("/assinatura")) {
      let estado: EstadoSaas | null = null;
      let leituraFalhou = workspaceId === "";
      if (!leituraFalhou) {
        try {
          const { data, error } = await supabase
            .from("saas_teste")
            .select("status, termina_em")
            .eq("workspace_id", workspaceId)
            .maybeSingle();
          if (error) leituraFalhou = true;
          else if (data) estado = { status: data.status as EstadoSaas["status"], terminaEm: data.termina_em };
        } catch {
          leituraFalhou = true;
        }
      }
      const decisaoSaas = decidirAcessoAssinatura(req.nextUrl.pathname, !leituraFalhou && acessoSaasLiberado(estado));
      if (decisaoSaas.tipo !== "passa") {
        const resposta = NextResponse.redirect(new URL(decisaoSaas.para, req.url));
        for (const cookie of res.cookies.getAll()) resposta.cookies.set(cookie);
        return resposta;
      }
    }

    return res;
  }

  // Demais modos (senha / aberto / trancado): a decisão em si é pura — vive
  // em `decidirAcesso` para dar para testar sem subir middleware nenhum. O
  // único trabalho assíncrono daqui é conferir o cookie contra a senha.
  const seloOk = await seloConfere(req.cookies.get(COOKIE_ACESSO)?.value, ambienteAtual().senha);
  const decisao = decidirAcesso({ pathname: req.nextUrl.pathname, modo, seloOk });

  if (decisao.tipo === "passa") return NextResponse.next();
  return NextResponse.redirect(new URL(decisao.para, req.url));
}

export const config = {
  // /api fora do portão de propósito: as rotas de API validam a si mesmas
  // (ou são webhook de terceiro, que não carrega cookie de navegador).
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|api/).*)"],
};
