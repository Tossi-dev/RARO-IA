// A conversão do funil — módulo PURO. Sem banco, sem Next, sem relógio.
//
// ============================================================
// A REGRA DESTE ARQUIVO: NENHUM NÚMERO INVENTADO
// ============================================================
//
// Um funil serve para uma coisa só — decidir onde o time perde negócio. Um
// número errado aqui não é um pixel torto: é o dono mudando o discurso da
// equipe por causa de uma conta que ninguém conferiu. Por isso este módulo
// prefere DIZER QUE NÃO SABE a devolver um número plausível, em três lugares:
//
//   1. `taxa` é `null`, e não 0, quando ninguém entrou na etapa. "Não deu
//      para calcular" e "calculei e deu zero" são leituras opostas — a
//      primeira pede dado, a segunda pede ação. Mesma disciplina de
//      `src/lib/health.ts` e de `estadoDoOnboarding`;
//
//   2. `cicloMedio` é `null` sem nenhuma oportunidade fechada;
//
//   3. o que não dá para ler (status fora do enum, etapa que não existe,
//      valor negativo) não é normalizado em silêncio: vai para
//      `inconsistentes`, com o id, para alguém consertar na origem.
//
// ============================================================
// ⚠ O MÓDULO NUNCA ASSUME O CAMINHO
// ============================================================
//
// A pergunta "quantas oportunidades passaram pela etapa de reunião?" parece
// ter uma resposta óbvia: todas as que hoje estão adiante dela. É óbvia e é
// falsa — funil real tem oportunidade que entra direto na proposta (indicação
// de cliente), que volta de etapa, que pula. Contar por dedução transformaria
// a taxa de conversão numa profecia que se cumpre sozinha.
//
// Então só conta o que tem EVIDÊNCIA:
//
//   - a oportunidade está na etapa hoje (`etapaId`), ou
//   - existe registro de passagem por ela (`passagens`).
//
// Quando há oportunidade ADIANTE de uma etapa sem registro de passagem por
// ela, a linha daquela etapa volta com `parcial: true`, e o resultado inteiro
// também. É o módulo dizendo, com todas as letras: "o que eu mostro aqui é o
// que eu vi; pode ter passado gente que ninguém anotou".
//
// A tabela de passagens ainda não existe no banco (0024 guarda a etapa ATUAL
// da oportunidade, não o histórico). Por isso `passagens` é opcional e a
// aridade declarada é DOIS: hoje toda chamada real recebe duas listas e
// recebe de volta `parcial: true`, que é a verdade. No dia em que a passagem
// virar tabela, nada aqui muda de forma — os números só param de ser parciais.
//
// ============================================================
// PERDIDA NÃO É AVANÇO, E ISSO É O PONTO
// ============================================================
//
// Uma oportunidade perdida na etapa 3 passou pela 1 e pela 2, mas não avançou
// a partir delas: morreu adiante. Contá-la como avanço da etapa 1 faria a
// primeira etapa parecer excelente exatamente nos funis que mais perdem. O
// avanço é sempre "saiu daqui para frente e continua viva (ou fechou
// ganhando)".

/** Os três valores do enum `status_oportunidade` (migração 0024). */
export type StatusOportunidade = "aberta" | "ganha" | "perdida";

const STATUS_VALIDOS: readonly string[] = ["aberta", "ganha", "perdida"];

/** Um dia em milissegundos — a única constante de tempo deste arquivo. */
const DIA_MS = 86_400_000;

export interface EtapaDoFunil {
  id: string;
  chave: string;
  nome: string;
  ordem: number;
  ativa: boolean;
}

export interface OportunidadeDoFunil {
  id: string;
  etapaId: string;
  /** Vem do banco como texto; pode ser qualquer coisa em runtime. */
  status: string;
  valor: number;
  criadoEm: string;
  fechadoEm: string | null;
}

/** O registro de que uma oportunidade esteve numa etapa. Ver o cabeçalho. */
export interface PassagemPorEtapa {
  oportunidadeId: string;
  etapaId: string;
}

export type MotivoInconsistente =
  | "status-ilegivel"
  | "etapa-desconhecida"
  | "valor-negativo"
  | "valor-ilegivel";

export interface Inconsistencia {
  oportunidadeId: string;
  motivo: MotivoInconsistente;
}

export interface LinhaDaConversao {
  etapaId: string;
  chave: string;
  nome: string;
  ordem: number;
  /** Quantas há evidência de que entraram — nunca dedução. */
  entraram: number;
  avancaram: number;
  /** 0 a 100, ou `null` quando `entraram` é 0. Nunca 0 no lugar de null. */
  taxa: number | null;
  /** Soma do valor das ABERTAS que estão nesta etapa hoje. */
  valorEmAberto: number;
  /** Há oportunidade adiante desta etapa sem registro de passagem por ela. */
  parcial: boolean;
}

export interface ConversaoDoFunil {
  linhas: LinhaDaConversao[];
  /** `true` se qualquer linha for parcial. */
  parcial: boolean;
  inconsistentes: Inconsistencia[];
}

/** O texto do banco virando enum, ou `null`. Nunca chuta "aberta". */
export function statusDaOportunidade(valor: unknown): StatusOportunidade | null {
  return typeof valor === "string" && STATUS_VALIDOS.includes(valor)
    ? (valor as StatusOportunidade)
    : null;
}

interface Analisada {
  oportunidade: OportunidadeDoFunil;
  status: StatusOportunidade | null;
  etapaAtual: EtapaDoFunil | null;
  valorSomavel: boolean;
}

/**
 * A conversão etapa a etapa.
 *
 * DOIS parâmetros obrigatórios — ver o cabeçalho sobre `passagens`.
 * Não altera nenhuma das listas recebidas.
 */
export function conversaoPorEtapa(
  oportunidades: OportunidadeDoFunil[],
  etapas: EtapaDoFunil[],
  passagens: PassagemPorEtapa[] = [],
): ConversaoDoFunil {
  const porId = new Map(etapas.map((e) => [e.id, e]));
  // Ordem, e `chave` como desempate: duas etapas com a mesma ordem não podem
  // trocar de lugar entre um carregamento e outro.
  const ordenadas = [...etapas].sort((a, b) => a.ordem - b.ordem || a.chave.localeCompare(b.chave));

  // Passagem para etapa que não existe é ruído de dado antigo, e some
  // sozinha: as linhas saem de `ordenadas`, então um id que não está entre as
  // etapas nunca é perguntado. Havia aqui um `if (!porId.has(...)) continue`
  // que nenhum mutante conseguia derrubar — código que não defendia de nada,
  // e por isso saiu. O teste que prova o comportamento continua.
  const passouPor = new Map<string, Set<string>>();
  for (const p of passagens) {
    const conjunto = passouPor.get(p.oportunidadeId) ?? new Set<string>();
    conjunto.add(p.etapaId);
    passouPor.set(p.oportunidadeId, conjunto);
  }

  const inconsistentes: Inconsistencia[] = [];
  const analisadas: Analisada[] = [];

  for (const o of oportunidades) {
    const status = statusDaOportunidade(o.status);
    if (status === null) inconsistentes.push({ oportunidadeId: o.id, motivo: "status-ilegivel" });

    const etapaAtual = porId.get(o.etapaId) ?? null;
    if (etapaAtual === null) inconsistentes.push({ oportunidadeId: o.id, motivo: "etapa-desconhecida" });

    const numero = typeof o.valor === "number" && Number.isFinite(o.valor);
    if (!numero) {
      inconsistentes.push({ oportunidadeId: o.id, motivo: "valor-ilegivel" });
    } else if (o.valor < 0) {
      // Negativo não é desconto: é dado errado. Somar viraria um funil que
      // encolhe quando alguém digita um sinal a mais.
      inconsistentes.push({ oportunidadeId: o.id, motivo: "valor-negativo" });
    }

    analisadas.push({ oportunidade: o, status, etapaAtual, valorSomavel: numero && o.valor >= 0 });
  }

  const linhas: LinhaDaConversao[] = ordenadas.map((etapa) => {
    let entraram = 0;
    let avancaram = 0;
    let valorEmAberto = 0;
    let parcial = false;

    for (const a of analisadas) {
      const naEtapa = a.etapaAtual !== null && a.etapaAtual.id === etapa.id;
      const temRegistro = passouPor.get(a.oportunidade.id)?.has(etapa.id) ?? false;

      if (naEtapa || temRegistro) {
        entraram += 1;
        if (naEtapa && a.status === "aberta" && a.valorSomavel) valorEmAberto += a.oportunidade.valor;
        if (avancou(a, etapa)) avancaram += 1;
      } else if (estaAdiante(a, etapa)) {
        // Adiante e sem registro: pode ter passado por aqui, pode ter entrado
        // direto lá na frente. A resposta honesta é "não sei".
        parcial = true;
      }
    }

    return {
      etapaId: etapa.id,
      chave: etapa.chave,
      nome: etapa.nome,
      ordem: etapa.ordem,
      entraram,
      avancaram,
      taxa: entraram === 0 ? null : Math.round((avancaram / entraram) * 100),
      valorEmAberto,
      parcial,
    };
  });

  return { linhas, parcial: linhas.some((l) => l.parcial), inconsistentes };
}

/** Saiu desta etapa para frente e continua viva, ou fechou ganhando. */
function avancou(a: Analisada, etapa: EtapaDoFunil): boolean {
  if (a.status === null) return false;
  if (a.status === "perdida") return false;
  if (a.status === "ganha") return true;
  return a.etapaAtual !== null && a.etapaAtual.ordem > etapa.ordem;
}

/**
 * Está hoje depois desta etapa — e a conta é POSICIONAL, só isso.
 *
 * Houve aqui um ramo a mais: `status === "ganha"` devolvia `true` para
 * qualquer etapa, "porque ganhar é o fim do funil". Estava errado, e um
 * mutante mostrou. Uma oportunidade GANHA NA PRIMEIRA ETAPA (indicação que
 * fechou na primeira conversa) não está adiante da etapa de proposta: ela
 * nunca chegou lá. O ramo marcava como parciais etapas por onde não havia
 * motivo nenhum para achar que alguém passou — inflando a dúvida em vez de
 * informar.
 */
function estaAdiante(a: Analisada, etapa: EtapaDoFunil): boolean {
  return a.etapaAtual !== null && a.etapaAtual.ordem > etapa.ordem;
}

/**
 * Média de dias entre criação e fechamento das oportunidades FECHADAS.
 *
 * `null` quando não há nenhuma — e não 0, que leria como "fecha no mesmo dia",
 * o oposto do que se sabe.
 *
 * A perdida entra na conta junto com a ganha, de propósito: o funil aprende
 * tanto com o que demorou para fechar quanto com o que demorou para morrer.
 *
 * Fechada sem data, data ilegível e fechamento anterior à criação ficam de
 * fora. Nenhum desses casos vira "hoje": um número que muda a cada
 * carregamento de tela é pior do que um número que falta.
 */
export function cicloMedio(oportunidades: OportunidadeDoFunil[]): number | null {
  const dias: number[] = [];

  for (const o of oportunidades) {
    const status = statusDaOportunidade(o.status);
    if (status !== "ganha" && status !== "perdida") continue;
    // Sem `?? ""` isto nem compila (`fechadoEm` é `string | null`), e com ele
    // a data ausente cai no mesmo lugar que a data ilegível: `NaN`, e fora da
    // média. Havia aqui uma guarda explícita para nulo e vazio; ela não
    // mudava resultado nenhum, e saiu pelo mesmo motivo da de cima.
    const inicio = Date.parse(o.criadoEm);
    const fim = Date.parse(o.fechadoEm ?? "");
    if (!Number.isFinite(inicio) || !Number.isFinite(fim)) continue;

    const duracao = (fim - inicio) / DIA_MS;
    if (duracao < 0) continue;

    dias.push(duracao);
  }

  if (dias.length === 0) return null;

  const media = dias.reduce((soma, d) => soma + d, 0) / dias.length;
  return Math.round(media * 10) / 10;
}
