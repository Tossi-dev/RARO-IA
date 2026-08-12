// Agenda — módulo NEUTRO (sem "use client", sem next/headers).
//
// Tudo aqui trabalha na hora de parede de São Paulo, e não na do servidor.
// O Vercel roda em UTC: "hoje" calculado com getDate() vira o dia seguinte a
// partir das 21h de Brasília, e a reunião das 22h apareceria em amanhã. Toda
// conversão passa por Intl com timeZone explícito.

import { paredeParaInstante, type EventoAgenda } from "./integracoes/ics";

export const FUSO = "America/Sao_Paulo";

export type VisaoAgenda = "dia" | "semana" | "mes";

export const VISAO_LABEL: Record<VisaoAgenda, string> = {
  dia: "Dia",
  semana: "Semana",
  mes: "Mês",
};

export function visaoValida(v: string | undefined | null): VisaoAgenda {
  return v === "dia" || v === "semana" || v === "mes" ? v : "semana";
}

interface Partes {
  ano: number;
  mes: number;
  dia: number;
  hora: number;
  minuto: number;
  /** 0 = domingo */
  diaSemana: number;
}

const FORMATADOR = new Intl.DateTimeFormat("en-CA", {
  timeZone: FUSO,
  hour12: false,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  weekday: "short",
});

const SEMANA: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Componentes da data COMO SÃO VISTOS em São Paulo. */
export function partesLocais(d: Date): Partes {
  const p: Record<string, string> = {};
  for (const parte of FORMATADOR.formatToParts(d)) p[parte.type] = parte.value;
  return {
    ano: Number(p.year),
    mes: Number(p.month),
    dia: Number(p.day),
    hora: Number(p.hour) % 24,
    minuto: Number(p.minute),
    diaSemana: SEMANA[p.weekday] ?? 0,
  };
}

/** "2026-08-06" do instante, no fuso de São Paulo. É a chave de agrupamento. */
export function chaveDia(d: Date): string {
  const p = partesLocais(d);
  return `${p.ano}-${String(p.mes).padStart(2, "0")}-${String(p.dia).padStart(2, "0")}`;
}

/** "2026-08-06" → meia-noite daquele dia em São Paulo, como instante. */
export function inicioDoDia(iso: string): Date {
  const [a, m, d] = iso.split("-").map(Number);
  return paredeParaInstante(a, m, d, 0, 0, 0, FUSO);
}

/** Soma dias a uma chave "YYYY-MM-DD" sem passar por instante (não erra no DST). */
export function somarDias(iso: string, dias: number): string {
  const [a, m, d] = iso.split("-").map(Number);
  const base = new Date(Date.UTC(a, m - 1, d + dias));
  return `${base.getUTCFullYear()}-${String(base.getUTCMonth() + 1).padStart(2, "0")}-${String(
    base.getUTCDate()
  ).padStart(2, "0")}`;
}

export function hojeISO(agora: Date = new Date()): string {
  return chaveDia(agora);
}

export function isoValido(v: string | undefined | null, agora: Date = new Date()): string {
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : hojeISO(agora);
}

export interface JanelaAgenda {
  /** Primeiro dia mostrado, "YYYY-MM-DD". */
  primeiro: string;
  /** Último dia mostrado, inclusivo. */
  ultimo: string;
  /** Todos os dias da grade, em ordem. */
  dias: string[];
  /** Instante do começo do primeiro dia. */
  de: Date;
  /** Instante do fim do último dia. */
  ate: Date;
  rotulo: string;
  anterior: string;
  proximo: string;
}

const MESES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

const DIAS_CURTOS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/** Dia da semana (0=domingo) de uma chave "YYYY-MM-DD", sem passar por fuso. */
export function diaDaSemana(iso: string): number {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
}

/**
 * A grade de cada visão.
 *
 * Semana começa no DOMINGO, como no Google Agenda em português. O mês mostra
 * a grade fechada (as sobras do mês anterior e do seguinte), senão a primeira
 * linha fica torta e o dono perde a referência visual.
 */
export function janelaAgenda(visao: VisaoAgenda, refISO: string): JanelaAgenda {
  const [ano, mes, dia] = refISO.split("-").map(Number);

  let primeiro: string;
  let ultimo: string;
  let rotulo: string;
  let anterior: string;
  let proximo: string;

  if (visao === "dia") {
    primeiro = refISO;
    ultimo = refISO;
    rotulo = `${dia} de ${MESES[mes - 1]} de ${ano}`;
    anterior = somarDias(refISO, -1);
    proximo = somarDias(refISO, 1);
  } else if (visao === "semana") {
    primeiro = somarDias(refISO, -diaDaSemana(refISO));
    ultimo = somarDias(primeiro, 6);
    const [, mA, dA] = primeiro.split("-").map(Number);
    const [, mB, dB] = ultimo.split("-").map(Number);
    rotulo =
      mA === mB
        ? `${dA} a ${dB} de ${MESES[mA - 1]} de ${ano}`
        : `${dA} de ${MESES[mA - 1]} a ${dB} de ${MESES[mB - 1]}`;
    anterior = somarDias(refISO, -7);
    proximo = somarDias(refISO, 7);
  } else {
    const primeiroDoMes = `${ano}-${String(mes).padStart(2, "0")}-01`;
    primeiro = somarDias(primeiroDoMes, -diaDaSemana(primeiroDoMes));
    const diasNoMes = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
    const ultimoDoMes = `${ano}-${String(mes).padStart(2, "0")}-${String(diasNoMes).padStart(2, "0")}`;
    ultimo = somarDias(ultimoDoMes, 6 - diaDaSemana(ultimoDoMes));
    rotulo = `${MESES[mes - 1]} de ${ano}`;
    anterior = mes === 1 ? `${ano - 1}-12-01` : `${ano}-${String(mes - 1).padStart(2, "0")}-01`;
    proximo = mes === 12 ? `${ano + 1}-01-01` : `${ano}-${String(mes + 1).padStart(2, "0")}-01`;
  }

  const dias: string[] = [];
  for (let d = primeiro; ; d = somarDias(d, 1)) {
    dias.push(d);
    if (d === ultimo) break;
    if (dias.length > 45) break; // trava
  }

  return {
    primeiro,
    ultimo,
    dias,
    de: inicioDoDia(primeiro),
    ate: inicioDoDia(somarDias(ultimo, 1)),
    rotulo,
    anterior,
    proximo,
  };
}

export function rotuloDiaCurto(iso: string): string {
  return DIAS_CURTOS[diaDaSemana(iso)];
}

export function numeroDoDia(iso: string): number {
  return Number(iso.split("-")[2]);
}

export function mesDoISO(iso: string): number {
  return Number(iso.split("-")[1]);
}

/** "09:30" no fuso de São Paulo. */
export function horaLocal(d: Date): string {
  const p = partesLocais(d);
  return `${String(p.hora).padStart(2, "0")}:${String(p.minuto).padStart(2, "0")}`;
}

/** Faixa "09:30 – 10:30", ou "dia inteiro". */
export function faixaHoraria(e: EventoAgenda): string {
  if (e.diaInteiro) return "dia inteiro";
  return `${horaLocal(e.inicio)} – ${horaLocal(e.fim)}`;
}

/**
 * Agrupa por dia. Um evento que atravessa a meia-noite aparece em cada dia que
 * ele toca — quem olha a terça precisa ver que tem compromisso ocupando a
 * manhã, mesmo que ele tenha começado na segunda.
 */
export function agruparPorDia(
  eventos: EventoAgenda[],
  dias: string[]
): Record<string, EventoAgenda[]> {
  const mapa: Record<string, EventoAgenda[]> = {};
  for (const d of dias) mapa[d] = [];
  for (const e of eventos) {
    // caminha do dia de início até o dia de fim
    let d = chaveDia(e.inicio);
    // evento que termina exatamente à meia-noite pertence só ao dia anterior
    const fimAjustado = new Date(e.fim.getTime() - 1);
    const ultimo = chaveDia(fimAjustado < e.inicio ? e.inicio : fimAjustado);
    for (let i = 0; i < 60; i++) {
      if (mapa[d]) mapa[d].push(e);
      if (d === ultimo) break;
      d = somarDias(d, 1);
    }
  }
  for (const d of dias) {
    mapa[d].sort((a, z) => {
      if (a.diaInteiro !== z.diaInteiro) return a.diaInteiro ? -1 : 1;
      return a.inicio.getTime() - z.inicio.getTime();
    });
  }
  return mapa;
}
