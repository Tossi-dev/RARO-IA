// Início do "Entrar com o Google" para a agenda.
//
// Gera um `state` aleatório no servidor e manda o navegador para a tela de
// consentimento. O retorno só aceita esse state uma vez, para a pessoa e o
// workspace que iniciaram a conexão (proteção contra CSRF e replay).

import { NextResponse, type NextRequest } from "next/server";
import { googleAppConfigurado, urlDeConsentimento } from "@/lib/integracoes/google-agenda";
import { criarEstadoOAuthGoogle } from "@/lib/integracoes/google-conexao-servidor";
import { contaUatSinteticaAtual } from "@/lib/uat/isolamento";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (await contaUatSinteticaAtual()) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 403 });
  }
  if (!googleAppConfigurado()) {
    return NextResponse.redirect(new URL("/agenda?erro=sem-credenciais", req.url));
  }

  const estado = await criarEstadoOAuthGoogle();
  if (!estado.ok) {
    return NextResponse.redirect(new URL("/agenda?erro=conexao", req.url));
  }
  // Não use a origem da requisição: em preview ela faria o Google voltar para
  // um domínio efêmero. `urlDeRetorno` usa NEXT_PUBLIC_SITE_URL (ou localhost)
  // como endereço canônico, igual à troca de código no retorno.
  return NextResponse.redirect(urlDeConsentimento(estado.state));
}
