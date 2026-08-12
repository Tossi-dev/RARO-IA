// O endpoint MCP da MentorOS — transporte "Streamable HTTP" da especificação
// 2025-06-18 (modelcontextprotocol.io → Base Protocol → Transports).
//
// QUEM BATE AQUI
// --------------
// Não é o navegador do dono nem o agente local do WhatsApp: é a infraestrutura
// da Anthropic, fazendo a chamada em nome do Claude dele. O dono cola a URL
// deste endpoint em Personalizar → Conectores, e a partir daí o Claude enxerga
// as ferramentas de `src/lib/mcp/ferramentas.ts`. Por isso o endereço precisa
// ser público — e por isso a porta precisa ser levada a sério.
//
// O QUE ESTE ARQUIVO FAZ, E SÓ
// ----------------------------
// Traduz HTTP ↔ JSON-RPC. A conferência do token está em `src/lib/mcp/token.ts`,
// o protocolo em `protocolo.ts`, o despacho em `servidor.ts` e o negócio em
// `ferramentas.ts`. Aqui só moram as decisões que são de HTTP mesmo: método,
// cabeçalho, código de status e a escolha entre responder JSON ou SSE.
//
// AS DECISÕES DE TRANSPORTE, COM O MOTIVO
// ---------------------------------------
// · SEM SESSÃO (`Mcp-Session-Id`). A especificação permite que o servidor
//   atribua uma; este não atribui. Em produção isto roda em função serverless
//   na Vercel, onde duas requisições seguidas caem em instâncias diferentes:
//   uma sessão guardada em memória seria encontrada às vezes e perdida às
//   vezes, e o cliente receberia 404 aleatório no meio da conversa. Sem estado
//   a se perder, cada POST se basta.
// · GET E DELETE RESPONDEM 405. GET só existe para o servidor EMPURRAR
//   mensagem por SSE; este servidor não empurra nada (sem `listChanged`, sem
//   amostragem, sem progresso). DELETE só encerra sessão, e não há sessão.
//   A especificação prevê 405 para os dois casos, então dizer "não ofereço"
//   é a resposta certa — não um erro.
// · SEM `WWW-Authenticate` NO 401. A especificação de autorização do MCP usa
//   esse cabeçalho para apontar o servidor OAuth. Este conector NÃO fala
//   OAuth: mandar o cabeçalho colocaria o cliente numa dança de descoberta,
//   `/authorize` e registro dinâmico que terminaria em erro confuso. Um 401
//   seco é a verdade — a credencial não bateu, e não há fluxo alternativo.

import { NextResponse } from "next/server";
import {
  classificarMensagem,
  CODIGO_ERRO,
  eventoSse,
  respostaErro,
  VERSOES_PROTOCOLO,
} from "@/lib/mcp/protocolo";
import { despachar } from "@/lib/mcp/servidor";
import { conectorAtivado, HEADER_AUTORIZACAO, tokenConfere, tokenConfigurado } from "@/lib/mcp/token";

export const dynamic = "force-dynamic";

/**
 * Quando o cliente não manda `MCP-Protocol-Version`, a especificação manda
 * assumir esta versão — é o comportamento definido para compatibilidade com
 * clientes anteriores ao cabeçalho.
 */
const VERSAO_ASSUMIDA = "2025-03-26";

function json(corpo: unknown, status: number): NextResponse {
  return NextResponse.json(corpo, { status });
}

/**
 * Resposta de recusa no envelope do JSON-RPC, com `id: null`.
 *
 * Podia ser um texto solto, mas cliente MCP que recebe corpo desconhecido
 * costuma reportar "resposta inválida do servidor" — e o dono ficaria com uma
 * mensagem que não diz nada. No envelope certo, ele lê o motivo.
 *
 * A mensagem NUNCA cita o token: nem o valor, nem o tamanho, nem se o header
 * veio ausente ou errado. Quem tem a credencial não precisa de explicação;
 * quem não tem, não merece uma.
 */
function recusa(status: number, mensagem: string): NextResponse {
  return json(respostaErro(null, CODIGO_ERRO.pedidoInvalido, mensagem), status);
}

/**
 * Defesa contra reamarração de DNS, exigida pela especificação do transporte.
 *
 * Um cliente MCP legítimo é servidor falando com servidor e NÃO manda
 * `Origin`; quem manda é página aberta num navegador. Então: sem `Origin`,
 * segue; com `Origin` de outro host, recusa. Vale como cinto e suspensório —
 * a credencial aqui é um token em cabeçalho, não um cookie, e cabeçalho o
 * navegador de terceiro não consegue forjar sozinho.
 */
function origemEstranha(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  const host = req.headers.get("host");
  try {
    return new URL(origin).host !== host;
  } catch {
    return true; // Origin que não é URL não é de cliente honesto.
  }
}

/**
 * O cliente aceita JSON? Quando ele só aceita `text/event-stream`, a resposta
 * TEM que ser um fluxo SSE — devolver JSON nesse caso é servir um tipo que o
 * outro lado declarou não entender.
 */
function exigeSse(req: Request): boolean {
  const accept = (req.headers.get("accept") ?? "").toLowerCase();
  if (!accept.includes("text/event-stream")) return false;
  return !accept.includes("application/json") && !accept.includes("*/*");
}

/**
 * Uma resposta JSON-RPC embrulhada em Server-Sent Events.
 *
 * O fluxo carrega um evento só e fecha, porque este servidor não tem nada a
 * mandar antes da resposta: não há progresso a reportar, não há pergunta a
 * fazer de volta. Manter o fluxo aberto depois da resposta só faria o cliente
 * esperar por algo que nunca vem.
 */
function sse(mensagem: unknown): Response {
  return new Response(eventoSse(mensagem), {
    status: 200,
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-store",
      connection: "keep-alive",
    },
  });
}

export async function POST(req: Request): Promise<Response> {
  if (origemEstranha(req)) {
    return recusa(403, "Origem não permitida.");
  }

  // A versão do protocolo é conferida ANTES da credencial de propósito: é
  // informação pública sobre o que este servidor fala, e um cliente
  // incompatível merece saber disso mesmo que o token dele esteja errado.
  const versao = req.headers.get("mcp-protocol-version") ?? VERSAO_ASSUMIDA;
  if (!VERSOES_PROTOCOLO.includes(versao as (typeof VERSOES_PROTOCOLO)[number])) {
    return recusa(
      400,
      `Versão de protocolo MCP não suportada: ${versao}. Este servidor fala ${VERSOES_PROTOCOLO.join(", ")}.`
    );
  }

  const esperado = tokenConfigurado();
  if (!conectorAtivado(esperado)) {
    // FALHA FECHADO: sem variável, o conector não existe — nunca "passa
    // porque ninguém configurou". Diz o que FALTA (o nome da variável),
    // nunca o que ela deveria conter.
    return json(
      respostaErro(
        null,
        CODIGO_ERRO.erroInterno,
        "O conector do Claude não está ativado neste servidor. Defina RARO_MCP_TOKEN no ambiente (mínimo 12 caracteres) e reinicie."
      ),
      503
    );
  }

  if (!tokenConfere(req.headers.get(HEADER_AUTORIZACAO), esperado)) {
    return recusa(401, "Não autorizado.");
  }

  let bruto: unknown;
  try {
    bruto = await req.json();
  } catch {
    return json(respostaErro(null, CODIGO_ERRO.jsonInvalido, "Corpo não é JSON válido."), 400);
  }

  if (Array.isArray(bruto)) {
    // O lote do JSON-RPC saiu da especificação na revisão 2025-06-18. Aceitar
    // "para ser gentil" abriria um caminho que o resto do código não trata —
    // e meia implementação de lote é pior que nenhuma.
    return json(
      respostaErro(
        null,
        CODIGO_ERRO.pedidoInvalido,
        "Lote (array) de mensagens não é suportado nesta versão do protocolo. Envie uma mensagem por requisição."
      ),
      400
    );
  }

  const entrada = classificarMensagem(bruto);
  const resposta = await despachar(entrada);

  // Notificação não tem resposta: a especificação do transporte manda
  // `202 Accepted` com corpo VAZIO. Mandar um JSON aqui deixaria o cliente com
  // uma resposta órfã, sem pedido para casar.
  if (resposta === null) return new Response(null, { status: 202 });

  return exigeSse(req) ? sse(resposta) : json(resposta, 200);
}

/**
 * GET abriria um fluxo SSE para o SERVIDOR falar sem ser perguntado. Este não
 * fala: o catálogo de ferramentas é fixo, não há progresso a reportar e não há
 * nada a pedir de volta ao cliente. A especificação prevê exatamente o 405
 * para dizer isso.
 */
export async function GET(): Promise<Response> {
  return json(
    respostaErro(
      null,
      CODIGO_ERRO.metodoInexistente,
      "Este endpoint MCP não abre fluxo SSE por GET. Envie as mensagens JSON-RPC por POST."
    ),
    405
  );
}

/** DELETE encerraria uma sessão; este servidor não abre sessão nenhuma. */
export async function DELETE(): Promise<Response> {
  return json(
    respostaErro(
      null,
      CODIGO_ERRO.metodoInexistente,
      "Este endpoint MCP não mantém sessão, então não há sessão a encerrar."
    ),
    405
  );
}
