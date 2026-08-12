// O unico ponto do programa que fala com a internet.
//
// POR QUE SO SAI, NUNCA ENTRA
// ---------------------------
// O dono nao tem servidor e nao quer ter. O Mac dele fica atras do roteador de
// casa, do 4G do celular, do wi-fi do hotel. Qualquer desenho em que o servidor
// PRECISE alcancar a maquina dele exige tunel, porta aberta ou IP fixo — tres
// coisas que ele nao vai manter e que abrem a maquina pessoal dele para a
// internet. Entao a regra e absoluta: quem inicia toda conversa e este arquivo.
// Ate a fila de envio, que e informacao vindo do servidor, e uma PERGUNTA feita
// daqui de dentro.
//
// AS DUAS ESPECIES DE FALHA, E POR QUE A DIFERENCA IMPORTA
// --------------------------------------------------------
// Falha temporaria (rede fora, servidor de pe mas com erro, segredo trocado)
// mantem o item na fila local: e so uma questao de tentar de novo. Falha
// permanente (corpo que o servidor recusa) tira o item da fila: repetir o mesmo
// corpo para sempre e um laco infinito que trava tudo que esta atras dele.
// Confundir as duas ou perde mensagem, ou entope a fila — os dois erros que
// este programa existe para nao cometer.

/** Nome do header combinado com o servidor. Um lugar só, nos dois lados. */
export const HEADER_AGENTE = "x-raro-agente";

/** Tempo máximo de uma requisição. Sem isto, uma conexão que abre e nunca
 *  responde (portal de wi-fi de hotel é campeão nisso) trava o laço para
 *  sempre, sem erro nenhum aparecer no log. */
export const TIMEOUT_PADRAO_MS = 20_000;

/** Vale tentar de novo mais tarde; o item continua na fila. */
export class FalhaTemporaria extends Error {
  constructor(mensagem, opcoes = {}) {
    super(mensagem);
    this.name = "FalhaTemporaria";
    this.status = opcoes.status ?? 0;
    /** Sinaliza que o problema é de configuração (segredo, URL) e não de rede,
     *  para o log conseguir dizer ao dono o que conferir em vez de repetir
     *  "sem internet" durante horas com o wi-fi funcionando. */
    this.configuracao = opcoes.configuracao === true;
  }
}

/** Não adianta repetir: o item sai da fila. */
export class FalhaPermanente extends Error {
  constructor(mensagem, opcoes = {}) {
    super(mensagem);
    this.name = "FalhaPermanente";
    this.status = opcoes.status ?? 0;
  }
}

/**
 * O MOTIVO QUE O SERVIDOR MANDOU JUNTO — e por que ele precisa aparecer.
 *
 * O servidor responde 500 com `{ "erro": "..." }` no corpo, dizendo o que
 * falhou (aba faltando na planilha, ID que não voltou, escrita recusada). O
 * agente jogava esse corpo fora e registrava só "O servidor respondeu 500",
 * repetido por horas. Duas causas completamente diferentes davam a mesma
 * linha, e a única saída era abrir o servidor — que roda longe daqui.
 *
 * O corte em 300 caracteres é para uma pilha de erro inteira não tomar a tela
 * do dono; o começo do texto é onde mora a causa.
 */
function motivoDoCorpo(texto) {
  const bruto = String(texto ?? "").trim();
  if (bruto === "") return "";
  try {
    const json = JSON.parse(bruto);
    const erro = String(json?.erro ?? json?.error ?? "").trim();
    if (erro !== "") return erro.slice(0, 300);
  } catch {
    // Corpo que não é JSON (página de erro da hospedagem, por exemplo): o
    // texto cru ainda diz mais que o número do status sozinho.
  }
  return bruto.startsWith("<") ? "" : bruto.slice(0, 300);
}

function classificar(status, corpo = "") {
  const motivo = motivoDoCorpo(corpo);
  const detalhe = motivo === "" ? "" : ` Motivo: ${motivo}`;
  if (status === 400) {
    return new FalhaPermanente(
      `O servidor recusou o formato deste lote (400). O lote foi descartado para não travar a fila.${detalhe}`,
      { status }
    );
  }
  if (status === 401 || status === 403) {
    // A mensagem fala do NOME da variável e nunca do valor: erro que compara
    // segredos é erro que imprime segredos.
    return new FalhaTemporaria(
      "O servidor não autorizou (401). Confira se RARO_AGENTE_SEGREDO é o mesmo no .env e no servidor.",
      { status, configuracao: true }
    );
  }
  if (status === 404) {
    return new FalhaTemporaria("Endereço não encontrado (404). Confira a BASE_URL no .env.", {
      status,
      configuracao: true,
    });
  }
  if (status === 503) {
    return new FalhaTemporaria(
      "A integração não está ativada no servidor (503). Falta configurar o segredo lá.",
      { status, configuracao: true }
    );
  }
  return new FalhaTemporaria(`O servidor respondeu ${status}.${detalhe}`, { status });
}

/**
 * Cria o cliente. `fetchImpl` entra por parâmetro para o teste conseguir
 * apontar para um servidor de mentira — e é assim que o ciclo completo é
 * provado sem nenhum WhatsApp e sem nenhuma Vercel.
 */
export function criarApi({
  baseUrl,
  segredo,
  fetchImpl = globalThis.fetch,
  timeoutMs = TIMEOUT_PADRAO_MS,
}) {
  const raiz = String(baseUrl ?? "").replace(/\/+$/, "");

  async function chamar(caminho, { metodo = "GET", corpo } = {}) {
    const controle = new AbortController();
    const alarme = setTimeout(() => controle.abort(), timeoutMs);

    let resposta;
    try {
      resposta = await fetchImpl(`${raiz}${caminho}`, {
        method: metodo,
        headers: {
          [HEADER_AGENTE]: segredo,
          ...(corpo === undefined ? {} : { "content-type": "application/json" }),
        },
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
        signal: controle.signal,
      });
    } catch (erro) {
      // Aqui cai tudo que é rede: DNS, recusa de conexão, timeout, tampa
      // fechada no meio. A mensagem original é preservada porque ela é o que
      // diferencia "sem wi-fi" de "DNS quebrado" quando o dono pedir ajuda —
      // e ela nunca contém o segredo, que viaja em header, não em URL.
      throw new FalhaTemporaria(
        `Não consegui falar com o servidor: ${erro instanceof Error ? erro.message : "falha de rede"}.`
      );
    } finally {
      clearTimeout(alarme);
    }

    if (!resposta.ok) {
      // O corpo é lido ANTES de classificar: é ele que carrega o motivo, e
      // uma resposta só pode ser lida uma vez.
      let corpo = "";
      try {
        corpo = await resposta.text();
      } catch {
        // Corpo ilegível não pode virar exceção diferente da do status.
      }
      throw classificar(resposta.status, corpo);
    }

    try {
      return await resposta.json();
    } catch {
      // 200 com corpo ilegível é servidor com problema, não lote errado: vale
      // tentar de novo em vez de descartar o que o dono já capturou.
      throw new FalhaTemporaria("O servidor respondeu algo que não é JSON.");
    }
  }

  return {
    /** Sobe as mensagens capturadas. A deduplicação por `idExterno` é do
     *  servidor: aqui a gente só evita mandar o óbvio duas vezes. */
    async enviarMensagens(mensagens) {
      return chamar("/api/atendimento/receber", { metodo: "POST", corpo: { mensagens } });
    },

    /** Pergunta o que uma PESSOA aprovou para enviar. O agente nunca decide
     *  isso sozinho — ele só executa o que já foi aprovado lá. */
    async lerFila() {
      const r = await chamar("/api/atendimento/fila");
      return Array.isArray(r?.envios) ? r.envios : [];
    },

    /** Baixa a fila do servidor com o que deu certo e o que não deu. */
    async reportarResultados(resultados) {
      return chamar("/api/atendimento/enviado", { metodo: "POST", corpo: { resultados } });
    },

    /** O sinal de vida, para a tela do CRM não mentir sobre o WhatsApp estar
     *  ligado quando o notebook está fechado. */
    async baterPulso(pulso) {
      return chamar("/api/atendimento/pulso", { metodo: "POST", corpo: pulso });
    },
  };
}
