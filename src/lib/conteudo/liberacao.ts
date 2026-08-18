// Liberação gradual das aulas de uma trilha.
//
// Módulo PURO: `agoraIso` entra por parâmetro, nada aqui lê o relógio da
// máquina. Mesma disciplina de `src/lib/mentoria/progresso.ts` — sem isso, o
// teste de fronteira ("abre exatamente à meia-noite") seria impossível de
// escrever, porque a resposta mudaria a cada execução.
//
// A REGRA
// -------
// Uma aula com `liberaEmDias: N` abre no primeiro instante do dia
// `inicio + N`, contado em DIAS CIVIS DE SÃO PAULO. `N: 0` abre junto com a
// trilha.
//
// POR QUE DIA CIVIL, E NÃO JANELA DE 24 HORAS
// --------------------------------------------
// Somar `N * 24h` ao INSTANTE do início parece equivalente e não é. Se a
// pessoa começou às 23:00, a aula do dia 1 abriria às 23:00 do dia seguinte —
// ou seja, ela passaria o dia inteiro olhando para uma aula fechada que, para
// quem começou de manhã, já estava aberta. "Libera em 1 dia" é uma promessa
// sobre o CALENDÁRIO, não sobre um cronômetro.
//
// E o dia civil precisa ser o de São Paulo, não o de UTC: 23:00 em São Paulo é
// 02:00 do dia SEGUINTE em UTC. Uma implementação que lesse a data em UTC
// começaria a trilha um dia adiante para quem se matriculou à noite — o erro
// mais silencioso possível, porque só aparece para parte dos usuários e some
// no dia seguinte.
//
// SEM DATA DE INÍCIO, NADA ABRE
// ------------------------------
// Liberar por omissão entregaria a trilha inteira a quem acabou de entrar. E
// seria invisível: uma trilha aberta demais não dá erro, não aparece em log,
// e ninguém reclama de ter recebido conteúdo cedo. Fail-closed, com o motivo
// escrito para a tela poder dizer o que houve.

import { paredeParaInstante } from "../integracoes/ics";

const FUSO_BRASIL = "America/Sao_Paulo";
const MS_POR_DIA = 24 * 60 * 60 * 1000;

export const MOTIVO_SEM_INICIO = "sem data de início";

/**
 * Motivo distinto do de cima, e a distinção não é preciosismo: com um
 * `agoraIso` torto a data de início pode estar perfeita, e dizer "sem data de
 * início" mandaria quem for investigar olhar para o campo errado. Este caso
 * não deveria acontecer (o `agoraIso` nasce na borda da rota), e é justamente
 * por isso que ele precisa de nome próprio quando acontecer.
 */
export const MOTIVO_SEM_AGORA = "sem hora de referência";

export interface AulaParaLiberacao {
  id: string;
  /** Dias após o início da trilha para esta aula abrir. 0 abre junto. */
  liberaEmDias: number;
}

export interface AulaLiberada {
  id: string;
  liberada: boolean;
  /** O instante exato em que abre, ISO. `null` quando não há base para calcular. */
  abreEm: string | null;
  /** O dia civil de São Paulo em que abre, "AAAA-MM-DD". `null` sem base. */
  abreNoDia: string | null;
  /** Dias inteiros que faltam. Nunca negativo; 0 quando já abriu. `null` sem base. */
  diasQueFaltam: number | null;
  /** Vazio quando liberada. Texto humano quando não — a tela imprime como veio. */
  motivo: string;
}

const REGEX_DATA_PURA = /^(\d{4})-(\d{2})-(\d{2})$/;

interface DataCivil {
  ano: number;
  mes: number;
  dia: number;
}

function ultimoDiaDoMes(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

function civilValida(d: DataCivil): boolean {
  if (!Number.isInteger(d.ano) || !Number.isInteger(d.mes) || !Number.isInteger(d.dia)) return false;
  if (d.mes < 1 || d.mes > 12) return false;
  return d.dia >= 1 && d.dia <= ultimoDiaDoMes(d.ano, d.mes);
}

/**
 * O dia civil de São Paulo de um instante.
 *
 * Não é uma segunda versão de `dataHoraCurtaSp` (em `mentoria/calendario.ts`):
 * aquela FORMATA para leitura humana, esta devolve os três números para
 * calcular. Se um terceiro chamador precisar disto, aí vale mudar de casa —
 * duas cópias de uma conversão de fuso é o tipo de coisa que diverge sem
 * ninguém perceber.
 */
function diaCivilEmSaoPaulo(instante: Date): DataCivil {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO_BRASIL,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instante);
  const pega = (tipo: string): number => Number(partes.find((p) => p.type === tipo)?.value ?? Number.NaN);
  return { ano: pega("year"), mes: pega("month"), dia: pega("day") };
}

/**
 * O dia civil em que a trilha começou.
 *
 * Aceita as duas formas que a origem produz: "AAAA-MM-DD" (é o tipo `date` de
 * `trilha_matricula.inicio`) e um instante ISO completo (caso alguém passe um
 * `timestamptz`). Qualquer outra coisa é `null`, e `null` fecha tudo.
 */
function inicioCivil(inicioIso: string): DataCivil | null {
  const texto = String(inicioIso ?? "").trim();
  if (texto === "") return null;

  const pura = REGEX_DATA_PURA.exec(texto);
  if (pura) {
    const d = { ano: Number(pura[1]), mes: Number(pura[2]), dia: Number(pura[3]) };
    return civilValida(d) ? d : null;
  }

  const instante = new Date(texto);
  if (!Number.isFinite(instante.getTime())) return null;
  const d = diaCivilEmSaoPaulo(instante);
  return civilValida(d) ? d : null;
}

/**
 * Um instante ISO, ou `null`.
 *
 * Não basta `new Date(x)` não ser inválida: o parser do V8 é leniente e
 * ACEITA data civil impossível, rolando para a frente — `2026-02-31` vira
 * `2026-03-03`, três dias de diferença, sem erro nenhum. Foi esse mesmo
 * comportamento que fez `eventoDaSessao` (Tarefa 14) precisar de uma guarda
 * igual. Aqui a conta é sobre dias: três dias de deslocamento silencioso é
 * uma aula abrindo na hora errada.
 */
function instanteValido(iso: string): Date | null {
  const texto = String(iso ?? "").trim();
  if (texto === "") return null;

  const civil = /^(\d{4})-(\d{2})-(\d{2})/.exec(texto);
  if (civil) {
    const d = { ano: Number(civil[1]), mes: Number(civil[2]), dia: Number(civil[3]) };
    if (!civilValida(d)) return null;
  }

  const instante = new Date(texto);
  return Number.isFinite(instante.getTime()) ? instante : null;
}

/** "AAAA-MM-DD" a partir dos três números. */
function comoTexto(d: DataCivil): string {
  const dois = (n: number): string => String(n).padStart(2, "0");
  return `${d.ano}-${dois(d.mes)}-${dois(d.dia)}`;
}

/** Formato brasileiro, para o motivo que a tela imprime. */
function comoBr(d: DataCivil): string {
  const dois = (n: number): string => String(n).padStart(2, "0");
  return `${dois(d.dia)}/${dois(d.mes)}/${d.ano}`;
}

function somarDias(d: DataCivil, dias: number): DataCivil {
  const base = new Date(Date.UTC(d.ano, d.mes - 1, d.dia));
  base.setUTCDate(base.getUTCDate() + dias);
  return { ano: base.getUTCFullYear(), mes: base.getUTCMonth() + 1, dia: base.getUTCDate() };
}

/**
 * Dias de espera de uma aula, sempre um inteiro >= 0.
 *
 * Negativo viraria 0 em vez de abrir a aula ANTES do início da trilha — o
 * banco já barra isso (`check (libera_em_dias >= 0)` em 0019), e aqui a
 * defesa se repete porque este módulo é puro e pode receber dado de qualquer
 * origem, inclusive de um teste ou de uma importação futura.
 */
function diasDeEspera(valor: number): number {
  if (!Number.isFinite(valor)) return 0;
  return Math.max(0, Math.floor(valor));
}

function semBase(aulas: readonly AulaParaLiberacao[], motivo: string): AulaLiberada[] {
  return aulas.map((a) => ({
    id: a.id,
    liberada: false,
    abreEm: null,
    abreNoDia: null,
    diasQueFaltam: null,
    motivo,
  }));
}

/**
 * Para cada aula: se já está liberada e, quando não está, em que dia libera.
 *
 * A ordem e a identidade da lista recebida são preservadas — quem chama
 * costuma casar o resultado com a própria lista por índice.
 */
export function aulasLiberadas(
  aulas: readonly AulaParaLiberacao[],
  inicioIso: string,
  agoraIso: string,
): AulaLiberada[] {
  if (aulas.length === 0) return [];

  const inicio = inicioCivil(inicioIso);
  if (inicio === null) return semBase(aulas, MOTIVO_SEM_INICIO);

  const agora = instanteValido(agoraIso);
  if (agora === null) return semBase(aulas, MOTIVO_SEM_AGORA);

  return aulas.map((aula) => {
    const espera = diasDeEspera(aula.liberaEmDias);
    const dia = somarDias(inicio, espera);
    // Meia-noite de São Paulo daquele dia — `paredeParaInstante` (de
    // `integracoes/ics.ts`) pergunta ao ICU o deslocamento VIGENTE naquela
    // data, então o cálculo continua certo em qualquer regra de horário de
    // verão, passada ou futura.
    const abre = paredeParaInstante(dia.ano, dia.mes, dia.dia, 0, 0, 0, FUSO_BRASIL);
    const liberada = agora.getTime() >= abre.getTime();

    // Dias que faltam, arredondando PARA CIMA: faltando 30 horas, faltam
    // "2 dias" na linguagem de quem lê, nunca "1".
    const faltam = liberada ? 0 : Math.max(0, Math.ceil((abre.getTime() - agora.getTime()) / MS_POR_DIA));

    return {
      id: aula.id,
      liberada,
      abreEm: abre.toISOString(),
      abreNoDia: comoTexto(dia),
      diasQueFaltam: faltam,
      motivo: liberada ? "" : `abre em ${comoBr(dia)}`,
    };
  });
}
