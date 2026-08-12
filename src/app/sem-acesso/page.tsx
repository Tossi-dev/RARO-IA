// A tela para onde o middleware manda quem está logado mas cujo PAPEL não
// abre a rota que tentou (um mentorado tentando /financeiro, por exemplo —
// ver a regra 4 de `decidirAcessoSupabase` em src/lib/portao.ts).
//
// POR QUE ELA FICA FORA DO GRUPO `(app)`
// ---------------------------------------
// O layout de `(app)` desenha a sidebar com o menu de rotas do sistema. Se
// esta tela usasse esse layout, quem foi barrado veria justamente o mapa do
// que existe do outro lado — o oposto do que a regra abaixo pede. Por isso
// esta página é standalone, só com o root layout por cima, do mesmo jeito
// que /login e /acesso.
//
// REGRA 1 (a que mais importa aqui): ESTA TELA NÃO PODE VAZAR NADA.
// -------------------------------------------------------------------
// Quem foi barrado não ganha um mapa do que existe do outro lado. Por isso:
//   - não diz qual papel a pessoa TEM (revelaria a hierarquia do sistema a
//     alguém que já demonstrou não ter acesso a parte dela);
//   - não diz qual papel SERIA necessário para a rota tentada (é a mesma
//     informação, só que apontada para o outro lado);
//   - não mostra o caminho que ela tentou abrir (confirmaria que a rota
//     existe — hoje ela pode nem saber);
//   - não lista rotas existentes (nem no texto, nem em nenhum menu).
// O botão "voltar" resolve isso te levando para a SUA primeira rota sem
// nomear nem o papel nem o destino em termos técnicos ("Voltar para o
// início", nunca "Ir para /crm porque você é comercial"). A parte testável
// desta regra (os textos fixos e a conta do destino) vive em ./texto.ts —
// sem-acesso.test.ts é quem garante que uma edição futura bem-intencionada
// não reintroduz um vazamento aqui.
//
// REGRA 2: funciona mesmo SEM Supabase configurado.
// -------------------------------------------------------------------
// Alguém pode abrir /sem-acesso na mão em modo planilha (sem sessão, sem
// papel — o middleware nem redireciona para cá nesse modo, mas a URL é
// pública). Sem Supabase configurado, esta página nunca tenta consultar
// nada: mostra a mesma tela, com o botão voltando para "/". Qualquer falha
// na leitura do papel (rede, sessão expirada no meio da leitura) também cai
// no mesmo caminho — nunca lança.

import type { Metadata } from "next";
import { Marca } from "@/components/sidebar";
import { Botao, Card } from "@/components/ui";
import { sair } from "@/lib/actions";
import { supabaseConfigurado } from "@/lib/data";
import { papelDe, type Papel } from "@/lib/papeis";
import { criarSupabaseServer } from "@/lib/supabase/server";
import { destinoDeVolta, TEXTO_SEM_ACESSO } from "./texto";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sem acesso — MentorOS",
};

/**
 * Descobre o papel de quem está logado, só para saber para onde o botão
 * "voltar" aponta — nunca para decidir se a tela mostra ou esconde algo
 * (o middleware já decidiu que ela chegou aqui). `null` cobre "sem Supabase
 * configurado" e "qualquer falha ao ler a sessão/o perfil": nos dois casos o
 * botão volta para "/", o único destino que não pressupõe sessão nenhuma.
 */
async function papelDeQuemEstaLogado(): Promise<Papel | null> {
  if (!supabaseConfigurado()) return null;

  try {
    const supabase = criarSupabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: perfil } = await supabase
      .from("profiles")
      .select("papel")
      .eq("id", user.id)
      .maybeSingle();

    return papelDe(perfil?.papel);
  } catch {
    // Falha de rede, sessão expirada no meio da leitura, o que for: a tela
    // continua de pé, só com o botão voltando para "/" em vez da primeira
    // rota do papel.
    return null;
  }
}

export default async function SemAcessoPage() {
  const papel = await papelDeQuemEstaLogado();
  const destino = destinoDeVolta(papel);

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <Marca />
        </div>

        <Card>
          <h1 className="font-display text-[20px] font-fino tracking-tight text-texto">
            {TEXTO_SEM_ACESSO.titulo}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-texto-2">{TEXTO_SEM_ACESSO.explicacao}</p>

          <a
            href={destino.href}
            className="trans toque mt-5 block rounded-full bg-primaria px-4 py-2.5 text-center text-sm font-medium text-white hover:bg-primaria-2"
          >
            {destino.rotulo}
          </a>

          <form action={sair} className="mt-3">
            <Botao tipo="fantasma" className="w-full">
              Sair
            </Botao>
          </form>

          <p className="mt-5 text-xs text-texto-3">{TEXTO_SEM_ACESSO.rodape}</p>
        </Card>
      </div>
    </main>
  );
}
