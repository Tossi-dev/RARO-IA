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
import { ambienteAtual, COOKIE_ACESSO, modoAcesso, seloConfere } from "@/lib/acesso";
import { decidirAcesso } from "@/lib/portao";

export async function middleware(req: NextRequest) {
  const modo = modoAcesso(ambienteAtual());

  if (modo === "supabase") {
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

    const ehLogin = req.nextUrl.pathname.startsWith("/login");
    if (!user && !ehLogin) return NextResponse.redirect(new URL("/login", req.url));
    if (user && ehLogin) return NextResponse.redirect(new URL("/", req.url));
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
