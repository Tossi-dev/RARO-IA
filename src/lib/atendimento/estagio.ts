// Estágio do funil decidido por EVENTO OBSERVADO — módulo puro.
//
// POR QUE ESTE ARQUIVO EXISTE SEPARADO DA TEMPERATURA
// ---------------------------------------------------
// `temperatura.ts` responde "quão vivo está este contato agora" e é sempre
// recalculada, nunca gravada. Este arquivo responde outra pergunta, mais
// perigosa: "o estágio do funil deste cliente deveria MUDAR?". A resposta aqui
// pode virar escrita — e escrita no funil é o que aparece no Kanban do dono,
// no relatório de conversão e nas metas. Errar aqui não some quando a tela
// recarrega.
//
// A REGRA QUE GOVERNA O ARQUIVO INTEIRO
// -------------------------------------
// Nada é decidido por palpite. Toda sugestão nasce de um EVENTO COM DATA — uma
// mensagem que chegou, uma compra que aconteceu — e carrega junto a data que a
// sustenta. Não existe "parece que esfriou", "provavelmente desistiu" nem
// leitura de conteúdo de mensagem procurando intenção. Se o único argumento
// disponível for a passagem do tempo, isso está marcado (ver `inequivoca`).
//
// E ESTA FUNÇÃO NÃO GRAVA NADA
// ----------------------------
// Ela devolve uma sugestão. Quem grava é a camada de dados, e só quando a
// sugestão é inequívoca. A separação existe porque o dono precisa poder
// discordar: uma sugestão que se escreve sozinha não deixa espaço para
// discordância, e a primeira vez que o funil se mexer sozinho errado o sistema
// inteiro perde a confiança dele.

import type { DirecaoMensagem } from "./contrato";

/**
 * O vocabulário NEUTRO de estágio que este módulo entende.
 *
 * Deliberadamente não é `StatusFunil` nem `Estagio.id`: a planilha chama de
 * "Ganho" o que o demo chama de "est-novo", e o Supabase pode chamar de outra
 * coisa amanhã. Traduzir o vocabulário de cada base é trabalho da camada de
 * dados; aqui a regra fala de fato observado, não de nome de coluna.
 */
export type EstagioObservado = "cliente" | "em_conversa" | "em_risco";

/** Uma interação já registrada, reduzida ao que a regra precisa. */
export interface InteracaoObservada {
  /** ISO datetime. */
  quando: string;
  direcao: DirecaoMensagem;
}

/** Uma compra já registrada (matrícula), reduzida ao que a regra precisa. */
export interface CompraObservada {
  /** ISO date ou datetime — o que a matrícula guardar. */
  quando: string;
}

export interface SugestaoEstagio {
  /** `null` quando não há nenhum evento datado: não se sugere sobre o nada. */
  estagio: EstagioObservado | null;
  /** A sugestão difere do estágio atual? Só então há o que fazer. */
  mudar: boolean;
  /** O porquê, em linguagem de dono, já com a data do evento que sustenta. */
  motivo: string;
  /** ISO do evento que produziu a sugestão. `""` quando não houve evento. */
  observadoEm: string;
  /**
   * A sugestão pode ser gravada sem consultar uma pessoa?
   *
   * É verdadeira só quando um fato ACONTECEU: comprou, respondeu. É falsa
   * quando o argumento é a AUSÊNCIA de fatos — silêncio não é evento, é a falta
   * dele, e a mesma ausência pode significar "perdemos o cliente" ou "ele está
   * viajando". Ausência sugere para um humano; ela não escreve no funil.
   */
  inequivoca: boolean;
}

/**
 * Dias de silêncio a partir dos quais o contato entra em risco.
 *
 * Decisão de NEGÓCIO, e por isso numa constante nomeada: o dono pode achar que
 * trinta dias é pouco para o ciclo dele e trocar em uma linha.
 */
export const CORTE_RISCO_DIAS = 30;

const DIA = 24 * 60 * 60 * 1000;

interface EventoDatado {
  em: number;
  iso: string;
}

function instante(iso: string): number | null {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

function dataBR(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getUTCFullYear()}`;
}

export interface EntradaEstagio {
  interacoes: InteracaoObservada[];
  compras: CompraObservada[];
  /** O estágio em que o cliente está hoje; `null` quando não se sabe. */
  estagioAtual: EstagioObservado | null;
  /** Entra por parâmetro para a decisão ser determinística e reprocessável. */
  agora: Date;
}

/**
 * Decide se o estágio deveria mudar, e diz por quê.
 *
 * ORDEM DAS REGRAS, E POR QUE ESTA ORDEM
 * --------------------------------------
 * 1. Silêncio acima do corte vem PRIMEIRO. "Comprou" e "respondeu" são fatos do
 *    passado e continuam verdadeiros para sempre — se avaliados antes, um
 *    cliente que sumiu há seis meses seguiria eternamente classificado como
 *    cliente ativo, que é exatamente a mentira que este módulo existe para
 *    impedir. O risco é o único critério que fala do presente.
 * 2. Comprou -> cliente. Compra é o evento mais forte que existe no funil.
 * 3. Respondeu -> em conversa. Mensagem recebida prova interesse; mensagem
 *    enviada por nós prova apenas que nós falamos, e não move ninguém de
 *    estágio (senão bastaria disparar mensagem para "qualificar" a base).
 */
export function sugerirEstagio(entrada: EntradaEstagio): SugestaoEstagio {
  const { estagioAtual } = entrada;
  const agora = entrada.agora.getTime();

  const interacoes: (EventoDatado & { direcao: DirecaoMensagem })[] = [];
  for (const i of entrada.interacoes ?? []) {
    const em = instante(i.quando);
    if (em !== null) interacoes.push({ em, iso: i.quando, direcao: i.direcao });
  }
  interacoes.sort((a, b) => a.em - b.em);

  const compras: EventoDatado[] = [];
  for (const c of entrada.compras ?? []) {
    const em = instante(c.quando);
    if (em !== null) compras.push({ em, iso: c.quando });
  }
  compras.sort((a, b) => a.em - b.em);

  const nada: SugestaoEstagio = {
    estagio: null,
    mudar: false,
    motivo: "Nenhum evento com data registrado — não há em cima de que decidir.",
    observadoEm: "",
    inequivoca: false,
  };
  if (interacoes.length === 0 && compras.length === 0) return nada;

  // O relógio do silêncio conta do evento mais recente de QUALQUER natureza:
  // um cliente que comprou ontem e nunca escreveu não está sumido.
  const ultimoEvento = [...interacoes, ...compras].reduce((a, b) => (a.em >= b.em ? a : b));
  const diasParado = Math.floor((agora - ultimoEvento.em) / DIA);

  if (diasParado > CORTE_RISCO_DIAS) {
    return resposta(
      "em_risco",
      `Sem nenhum sinal desde ${dataBR(ultimoEvento.iso)} — ${diasParado} dias parado, acima do corte de ${CORTE_RISCO_DIAS}.`,
      ultimoEvento.iso,
      // Silêncio é ausência de evento, não evento. Nunca grava sozinho.
      false,
      estagioAtual
    );
  }

  const primeiraCompra = compras[0];
  if (primeiraCompra) {
    return resposta(
      "cliente",
      `Compra registrada em ${dataBR(primeiraCompra.iso)}.`,
      primeiraCompra.iso,
      true,
      estagioAtual
    );
  }

  const primeiraResposta = interacoes.find((i) => i.direcao === "recebida");
  if (primeiraResposta) {
    return resposta(
      "em_conversa",
      `Respondeu pela primeira vez em ${dataBR(primeiraResposta.iso)}.`,
      primeiraResposta.iso,
      true,
      estagioAtual
    );
  }

  // Sobrou só mensagem NOSSA, dentro do prazo. Falar com alguém não é a mesma
  // coisa que essa pessoa ter entrado em conversa, e fingir que é infla o funil.
  return {
    estagio: null,
    mudar: false,
    motivo: "Só houve mensagem nossa até agora — falar com alguém não move essa pessoa de estágio.",
    observadoEm: interacoes[interacoes.length - 1]?.iso ?? "",
    inequivoca: false,
  };
}

function resposta(
  estagio: EstagioObservado,
  motivo: string,
  observadoEm: string,
  inequivoca: boolean,
  estagioAtual: EstagioObservado | null
): SugestaoEstagio {
  return { estagio, mudar: estagio !== estagioAtual, motivo, observadoEm, inequivoca };
}

/**
 * O atalho que a camada de dados usa: a sugestão só vira escrita quando ela
 * muda alguma coisa E é inequívoca. Existe como função (em vez de cada provider
 * repetir o `&&`) porque esquecer um dos dois lados em um dos quatro providers
 * é o jeito silencioso de o funil começar a se mexer sozinho num modo só.
 */
export function podeGravarSozinha(s: SugestaoEstagio): boolean {
  return s.mudar && s.inequivoca && s.estagio !== null;
}
