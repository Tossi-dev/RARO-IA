// GET do convite `.ics` de uma sessão.
//
// POR QUE UMA ROTA, E NÃO UM BOTÃO DE FORMULÁRIO
// -----------------------------------------------
// Um `.ics` é um arquivo para baixar, e download é GET. Tentar entregá-lo pela
// Server Action que já existe daria um POST que responde com redirecionamento
// — e não há para onde redirecionar um arquivo.
//
// A ROTA NUNCA ESCREVE, EM LUGAR NENHUM
// --------------------------------------
// Ela chama `conviteDaSessao`, que é a versão read-only: monta o arquivo e não
// toca no Google. A sincronização de verdade continua sendo POST. Isso não é
// preciosismo de HTTP: navegador pré-carrega link, antivírus abre URL, e
// extensão de navegador segue `href` sozinha. Se este GET escrevesse na agenda
// de alguém, bastaria a ficha ficar aberta.
//
// QUEM PODE BAIXAR
// ----------------
// Quem a RLS deixar ler a sessão. `conviteDaSessao` usa o cliente autenticado
// do servidor, então uma sessão de outro workspace volta como "não
// encontrada" — a mesma resposta de uma que não existe, de propósito: separar
// as duas contaria a quem perguntou que a sessão existe em algum lugar.

import { conviteDaSessao } from "@/lib/mentoria/acoes-calendario";

export const dynamic = "force-dynamic";

export async function GET(
  _requisicao: Request,
  { params }: { params: { sessaoId: string } },
): Promise<Response> {
  const resultado = await conviteDaSessao(params.sessaoId);

  if (!resultado.ics) {
    // Sem arquivo, o motivo humano vai como texto puro e status 404/500 —
    // nunca um `.ics` vazio, que o calendário do dono importaria calado.
    return new Response(resultado.erro ?? "Não foi possível gerar o convite.", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  return new Response(resultado.ics.conteudo, {
    status: 200,
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      // `attachment` força o download em vez de o navegador tentar renderizar.
      "content-disposition": `attachment; filename="${resultado.ics.nomeArquivo}"`,
      // Convite carrega nome e horário de uma pessoa: nunca em cache
      // compartilhado, nunca em proxy.
      "cache-control": "private, no-store",
    },
  });
}
