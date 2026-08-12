// Volta do "Entrar com o Google".
//
// Confere o `state`, troca o código pelos tokens e guarda o refresh_token no
// cookie httpOnly. O access_token NÃO é guardado: ele dura uma hora e é
// buscado de novo a cada leitura — guardar os dois seria dobrar a superfície
// de risco por nada.

import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_GOOGLE, trocarCodigoPorTokens } from "@/lib/integracoes/google-agenda";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const paraAgenda = (params: string) => NextResponse.redirect(new URL(`/agenda${params}`, req.url));

  // O usuário pode simplesmente ter clicado em "Cancelar" na tela do Google.
  const erroDoGoogle = url.searchParams.get("error");
  if (erroDoGoogle) return paraAgenda("?erro=recusado");

  const code = url.searchParams.get("code");
  const estadoVindo = url.searchParams.get("state");
  const estadoGuardado = req.cookies.get("raro_google_state")?.value;

  if (!code || !estadoVindo || !estadoGuardado || estadoVindo !== estadoGuardado) {
    return paraAgenda("?erro=estado");
  }

  const r = await trocarCodigoPorTokens(code, url.origin);
  if (!r.ok || !r.refreshToken) {
    // O motivo entra na URL só como código curto; o texto completo fica no log
    // do servidor. `redirect_uri_mismatch` é o erro mais comum aqui, e quer
    // dizer que a URL de retorno cadastrada no Google Cloud está diferente.
    console.error("[agenda/google] falha ao trocar código:", r.erro);
    return paraAgenda("?erro=token");
  }

  const resposta = paraAgenda("?conectado=1");
  resposta.cookies.set(COOKIE_GOOGLE, r.refreshToken, {
    httpOnly: true,
    secure: url.protocol === "https:",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 180, // 180 dias
  });
  resposta.cookies.delete("raro_google_state");
  return resposta;
}
