// Volta do "Entrar com o Google".
//
// Confere e consome o `state`, troca o código pelos tokens e envia somente o
// refresh_token ao cofre cifrado do workspace no servidor. O navegador não
// recebe token algum.

import { NextResponse, type NextRequest } from "next/server";
import { ESCOPO_AGENDA, trocarCodigoPorTokens } from "@/lib/integracoes/google-agenda";
import {
  consumirEstadoOAuthGoogle,
  salvarRefreshTokenGoogleDaOrganizacao,
} from "@/lib/integracoes/google-conexao-servidor";
import { contaUatSinteticaAtual } from "@/lib/uat/isolamento";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (await contaUatSinteticaAtual()) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 403 });
  }
  const url = req.nextUrl;
  const paraAgenda = (params: string) => {
    const resposta = NextResponse.redirect(new URL(`/agenda${params}`, req.url));
    // Limpa somente um cookie legado de instalações antigas. O state atual
    // existe no servidor e é consumido atomicamente abaixo.
    resposta.cookies.delete("raro_google_state");
    return resposta;
  };

  const code = url.searchParams.get("code");
  const estadoVindo = url.searchParams.get("state");

  if (!estadoVindo) {
    return paraAgenda("?erro=estado");
  }
  const estado = await consumirEstadoOAuthGoogle(estadoVindo);
  if (!estado.ok) return paraAgenda("?erro=estado");

  // O usuário pode simplesmente ter clicado em "Cancelar" na tela do Google.
  const erroDoGoogle = url.searchParams.get("error");
  if (erroDoGoogle) return paraAgenda("?erro=recusado");

  if (!code) return paraAgenda("?erro=estado");

  // A troca usa a mesma URL canônica do início. Passar `url.origin` aqui faria
  // preview e produção divergirem e o Google recusaria o callback.
  const r = await trocarCodigoPorTokens(code);
  if (!r.ok || !r.refreshToken) {
    return paraAgenda("?erro=token");
  }

  const persistencia = await salvarRefreshTokenGoogleDaOrganizacao({
    refreshToken: r.refreshToken,
    escopos: ESCOPO_AGENDA.split(" "),
  });
  return persistencia.ok ? paraAgenda("?conectado=1") : paraAgenda("?erro=conexao");
}
