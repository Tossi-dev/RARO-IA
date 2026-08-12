// O despachante MCP: uma mensagem JSON-RPC entra, uma resposta sai.
//
// POR QUE ESTA CAMADA NÃO CONHECE HTTP
// ------------------------------------
// Aqui não existe `Request`, `Response`, header nem status. O que entra é uma
// mensagem já classificada; o que sai é uma resposta JSON-RPC (ou `null`, para
// notificação, que não tem resposta). Quem traduz isso para HTTP é
// `src/app/api/mcp/route.ts`, e essa separação é o que permite testar o
// protocolo inteiro sem subir servidor — protocolo testado só por curl é
// protocolo que quebra no primeiro caso que ninguém lembrou de curlar.

import {
  CATALOGO,
  ArgumentoInvalido,
  executarFerramenta,
  ferramentaExiste,
} from "./ferramentas";
import {
  CODIGO_ERRO,
  respostaErro,
  respostaOk,
  VERSAO_PREFERIDA,
  VERSOES_PROTOCOLO,
  versaoSuportada,
  type MensagemEntrada,
  type RespostaJsonRpc,
} from "./protocolo";

/** O que o cliente vê no `serverInfo`. */
export const INFO_SERVIDOR = {
  name: "raro-ia",
  title: "Raro.ia — negócio e CRM",
  version: "1.0.0",
} as const;

/**
 * As `instructions` do `initialize`.
 *
 * Não é enfeite nem marketing: é onde se diz ao modelo como NÃO usar estas
 * ferramentas. As duas frases que mais importam são "repita a origem" e "não
 * some nada por conta própria" — sem elas, o comportamento natural de um
 * assistente é justamente somar dois resultados e apresentar o total como se
 * o sistema tivesse calculado.
 */
const INSTRUCOES = [
  "Ferramentas de LEITURA do Raro.ia, o sistema de gestão e CRM desta mentoria. Não existe nenhuma ferramenta de escrita: nada aqui cria, altera, aprova ou envia — se o dono pedir uma ação, explique que esta versão só lê e descreva o que ele mesmo precisa fazer no sistema.",
  "Todo resultado traz uma linha 'Origem:' dizendo de qual base e de qual função o número veio. REPITA essa linha ao dono. Se ela disser DEMONSTRAÇÃO, avise em primeiro lugar que os números são fictícios, antes de comentar qualquer valor.",
  "Não recalcule, não some e não projete nada por conta própria a partir destes resultados: os números vêm do mesmo núcleo de métricas que desenha o painel, e um total inventado por você seria uma segunda verdade que o dono não tem como conferir.",
  "Quando um resultado disser que falta base (sem extrato, sem meta cadastrada, nenhuma conversa registrada), diga isso ao dono em vez de tratar zero como resposta.",
].join(" ");

/**
 * Despacha UMA mensagem. Devolve `null` quando não há resposta a dar —
 * notificação, por definição.
 */
export async function despachar(entrada: MensagemEntrada): Promise<RespostaJsonRpc | null> {
  if (entrada.tipo === "invalido") {
    return respostaErro(entrada.id, CODIGO_ERRO.pedidoInvalido, entrada.motivo);
  }

  if (entrada.tipo === "notificacao") {
    // `notifications/initialized` e `notifications/cancelled` são as que o
    // Claude manda hoje. Notificação desconhecida é ignorada de propósito: a
    // especificação manda aceitar, e responder erro a uma notificação seria
    // mandar uma resposta sem pedido — pior que o silêncio.
    return null;
  }

  const { id, metodo, params } = entrada.pedido;

  try {
    switch (metodo) {
      case "initialize":
        return respostaOk(id, iniciar(params));

      // `ping` existe na especificação como verificação de vida e o resultado
      // é um objeto vazio. Sem ele, um cliente que faz keep-alive receberia
      // "método inexistente" e concluiria que o servidor caiu.
      case "ping":
        return respostaOk(id, {});

      case "tools/list":
        return respostaOk(id, { tools: CATALOGO });

      case "tools/call":
        return respostaOk(id, await chamarFerramenta(params));

      default:
        return respostaErro(id, CODIGO_ERRO.metodoInexistente, `Método não suportado: ${metodo}`);
    }
  } catch (erro) {
    if (erro instanceof ArgumentoInvalido) {
      return respostaErro(id, CODIGO_ERRO.parametroInvalido, erro.message);
    }
    // Qualquer outra exceção é falha DESTE servidor. A mensagem não é ecoada:
    // um erro do provider de dados pode carregar URL, id de planilha ou trecho
    // de consulta, e nada disso tem por que atravessar para o outro lado.
    return respostaErro(id, CODIGO_ERRO.erroInterno, "Falha interna ao atender o pedido.");
  }
}

/**
 * Negociação de versão, do jeito que o `Lifecycle` manda: se o servidor
 * suporta a versão pedida, ele ECOA a mesma; se não, responde a mais nova que
 * ele suporta e deixa o cliente decidir se desconecta. Recusar com erro seria
 * mais fácil e derrubaria clientes que funcionariam bem.
 */
function iniciar(params: Record<string, unknown>): Record<string, unknown> {
  const pedida = params.protocolVersion;
  const protocolVersion = versaoSuportada(pedida) ? pedida : VERSAO_PREFERIDA;

  return {
    protocolVersion,
    capabilities: {
      // `listChanged: false` porque o catálogo é fixo em código: prometer
      // notificação de mudança que nunca vai chegar faz o cliente segurar
      // uma lista velha para sempre esperando um aviso.
      tools: { listChanged: false },
    },
    serverInfo: INFO_SERVIDOR,
    instructions: INSTRUCOES,
  };
}

async function chamarFerramenta(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const nome = params.name;
  if (typeof nome !== "string" || nome === "") {
    throw new ArgumentoInvalido('O campo "name" é obrigatório em tools/call.');
  }
  if (!ferramentaExiste(nome)) {
    // Ferramenta inexistente é erro de PROTOCOLO na especificação (-32602),
    // não resultado com `isError` — o cliente pediu algo que o `tools/list`
    // nunca ofereceu.
    throw new ArgumentoInvalido(`Ferramenta desconhecida: ${nome}`);
  }

  const bruto = params.arguments;
  const args: Record<string, unknown> =
    typeof bruto === "object" && bruto !== null && !Array.isArray(bruto)
      ? (bruto as Record<string, unknown>)
      : {};

  try {
    const r = await executarFerramenta(nome, args);
    return {
      content: [{ type: "text", text: r.texto }],
      // O mesmo conteúdo em JSON, para o modelo não precisar reinterpretar o
      // texto que já formatamos. Sem `outputSchema` declarado de propósito:
      // declarar um esquema obriga a resposta a conformar com ele, e um
      // esquema que envelhece em silêncio é pior que nenhum.
      structuredContent: { ...r.dados, origem: r.origem },
      isError: r.falhou === true,
    };
  } catch (erro) {
    if (erro instanceof ArgumentoInvalido) throw erro;
    // Falha ao LER a base (planilha fora do ar, Supabase recusando) não é erro
    // de protocolo: é resultado de ferramenta que deu errado. Devolver assim
    // deixa o modelo dizer "não consegui ler o financeiro agora" em vez de a
    // conversa inteira cair.
    return {
      content: [
        {
          type: "text",
          text: `Não foi possível ler a base para atender "${nome}" agora. Tente de novo em alguns instantes; se persistir, verifique a conexão da base no próprio Raro.ia.`,
        },
      ],
      isError: true,
    };
  }
}

/** As versões que este servidor anuncia — exportado para o teste e para o 400. */
export const VERSOES_ACEITAS: readonly string[] = VERSOES_PROTOCOLO;
