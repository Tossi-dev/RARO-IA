// Início do "Entrar com o Google" para a agenda.
//
// Gera um `state` aleatório, guarda numa cookie curta e manda o navegador para
// a tela de consentimento. O `state` existe para o retorno provar que a volta
// veio DESTE início, e não de um link plantado por terceiros (CSRF).

import { randomBytes } from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { googleAppConfigurado, urlDeConsentimento } from "@/lib/integracoes/google-agenda";

export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  if (!googleAppConfigurado()) {
    return NextResponse.redirect(new URL("/agenda?erro=sem-credenciais", req.url));
  }

  const estado = randomBytes(16).toString("hex");
  // A origem sai da requisição: assim o mesmo código funciona em localhost, em
  // preview da Vercel e em produção, sem variável para lembrar de trocar.
  const origem = req.nextUrl.origin;

  const resposta = NextResponse.redirect(urlDeConsentimento(estado, origem));
  resposta.cookies.set("raro_google_state", estado, {
    httpOnly: true,
    secure: req.nextUrl.protocol === "https:",
    sameSite: "lax",
    path: "/",
    maxAge: 600, // 10 minutos: é o tempo de escolher a conta, não mais
  });
  return resposta;
}
