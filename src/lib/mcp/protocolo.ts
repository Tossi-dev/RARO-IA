// JSON-RPC 2.0 e o enquadramento do MCP — a camada que não sabe nada do negócio.
//
// POR QUE ESTE ARQUIVO É SEPARADO DAS FERRAMENTAS
// -----------------------------------------------
// O que o Claude fala com este servidor tem duas metades independentes: o
// ENVELOPE (JSON-RPC 2.0, versão de protocolo, códigos de erro) e o CONTEÚDO
// (buscar cliente, ler faturamento). Misturar as duas produz o erro clássico
// de quem implementa protocolo "de ouvido": uma ferramenta que falha começa a
// devolver `{"erro": "..."}` com status 500, o cliente não reconhece nada
// daquilo e a conexão inteira cai em vez de o modelo ler "essa ferramenta
// falhou, tento outra". Aqui o envelope é escrito uma vez, testado sozinho, e
// nenhuma ferramenta consegue quebrá-lo.
//
// A ESPECIFICAÇÃO QUE ESTE ARQUIVO SEGUE
// --------------------------------------
// modelcontextprotocol.io, revisão 2025-06-18 (Base Protocol / Lifecycle /
// Transports / Server → Tools). As decisões que a especificação deixa em
// aberto estão comentadas no ponto onde foram tomadas, com o motivo.

/**
 * As revisões que este servidor sabe falar, da mais nova para a mais velha.
 *
 * Existe mais de uma porque a negociação da especificação manda o servidor
 * ECOAR a versão pedida quando ele a suporta, e só cair na sua preferida
 * quando não suporta. Um servidor que responde sempre "2025-06-18" força
 * cliente antigo a desconectar — e o dono não tem como saber que o problema
 * era esse.
 */
export const VERSOES_PROTOCOLO = ["2025-06-18", "2025-03-26", "2024-11-05"] as const;

export type VersaoProtocolo = (typeof VERSOES_PROTOCOLO)[number];

/** A que este servidor implementa de verdade; as outras são compatibilidade. */
export const VERSAO_PREFERIDA: VersaoProtocolo = "2025-06-18";

export function versaoSuportada(v: unknown): v is VersaoProtocolo {
  return typeof v === "string" && (VERSOES_PROTOCOLO as readonly string[]).includes(v);
}

/**
 * Os códigos do JSON-RPC 2.0. Ficam nomeados porque `-32602` no meio de um
 * `return` não diz nada a quem lê seis meses depois — e trocar um pelo outro
 * muda o comportamento do cliente (parâmetro inválido é erro do chamador;
 * erro interno é do servidor, e alguns clientes tentam de novo).
 */
export const CODIGO_ERRO = {
  jsonInvalido: -32700, // Parse error
  pedidoInvalido: -32600, // Invalid Request
  metodoInexistente: -32601, // Method not found
  parametroInvalido: -32602, // Invalid params
  erroInterno: -32603, // Internal error
} as const;

/** O `id` de um pedido. A especificação do MCP proíbe `null` aqui. */
export type IdJsonRpc = string | number;

export interface PedidoJsonRpc {
  jsonrpc: "2.0";
  id: IdJsonRpc;
  metodo: string;
  params: Record<string, unknown>;
}

export interface NotificacaoJsonRpc {
  jsonrpc: "2.0";
  metodo: string;
  params: Record<string, unknown>;
}

export interface RespostaOk {
  jsonrpc: "2.0";
  id: IdJsonRpc;
  result: unknown;
}

export interface RespostaErro {
  jsonrpc: "2.0";
  id: IdJsonRpc | null;
  error: { code: number; message: string; data?: unknown };
}

export type RespostaJsonRpc = RespostaOk | RespostaErro;

/**
 * O que chegou no corpo do POST, já classificado.
 *
 * A distinção entre PEDIDO e NOTIFICAÇÃO não é detalhe: pedido tem `id` e
 * exige resposta; notificação não tem `id` e a especificação do transporte
 * manda responder `202 Accepted` com corpo VAZIO. Devolver um JSON-RPC de
 * resposta para uma notificação é erro de protocolo — o cliente fica com uma
 * resposta órfã que não casa com pedido nenhum.
 */
export type MensagemEntrada =
  | { tipo: "pedido"; pedido: PedidoJsonRpc }
  | { tipo: "notificacao"; notificacao: NotificacaoJsonRpc }
  | { tipo: "invalido"; motivo: string; id: IdJsonRpc | null };

function ehObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Classifica UMA mensagem recebida.
 *
 * O `id` é recuperado mesmo quando a mensagem é inválida por outro motivo:
 * uma resposta de erro que consegue citar o `id` do pedido é uma resposta que
 * o cliente casa com a chamada dele; sem o `id`, ele só sabe que "alguma
 * coisa deu errado" e costuma derrubar a sessão inteira.
 */
export function classificarMensagem(bruto: unknown): MensagemEntrada {
  if (!ehObjeto(bruto)) {
    return { tipo: "invalido", motivo: "A mensagem precisa ser um objeto JSON.", id: null };
  }

  const id = typeof bruto.id === "string" || typeof bruto.id === "number" ? bruto.id : null;

  if (bruto.jsonrpc !== "2.0") {
    return { tipo: "invalido", motivo: 'O campo "jsonrpc" precisa ser exatamente "2.0".', id };
  }

  const metodo = bruto.method;
  if (typeof metodo !== "string" || metodo === "") {
    return { tipo: "invalido", motivo: 'O campo "method" precisa ser um texto não vazio.', id };
  }

  // `params` é opcional na especificação; normalizar para objeto vazio aqui
  // evita um `?? {}` espalhado por cada método lá na frente.
  const params = ehObjeto(bruto.params) ? bruto.params : {};

  // Sem `id` é notificação — inclusive quando o cliente mandou `id: null`,
  // que a especificação do MCP proíbe em pedido.
  if (!("id" in bruto) || bruto.id === null || bruto.id === undefined) {
    return { tipo: "notificacao", notificacao: { jsonrpc: "2.0", metodo, params } };
  }

  if (id === null) {
    return { tipo: "invalido", motivo: 'O campo "id" precisa ser texto ou número.', id: null };
  }

  return { tipo: "pedido", pedido: { jsonrpc: "2.0", id, metodo, params } };
}

export function respostaOk(id: IdJsonRpc, result: unknown): RespostaOk {
  return { jsonrpc: "2.0", id, result };
}

/**
 * `data` fica de fora quando não há nada estruturado a dizer — e NUNCA carrega
 * detalhe de configuração deste servidor. Quem chamou errado precisa saber que
 * errou, não aprender como o servidor é montado por dentro.
 */
export function respostaErro(
  id: IdJsonRpc | null,
  code: number,
  message: string,
  data?: unknown
): RespostaErro {
  return { jsonrpc: "2.0", id, error: data === undefined ? { code, message } : { code, message, data } };
}

/**
 * Um evento SSE com uma mensagem JSON-RPC dentro.
 *
 * O `\n\n` final é o que fecha o evento no padrão Server-Sent Events; sem ele
 * o cliente segura a mensagem esperando mais dados e a chamada "trava" sem
 * erro nenhum aparecer nos dois lados — o tipo de bug que só se descobre com
 * um cliente real na frente.
 */
export function eventoSse(mensagem: unknown): string {
  return `data: ${JSON.stringify(mensagem)}\n\n`;
}
