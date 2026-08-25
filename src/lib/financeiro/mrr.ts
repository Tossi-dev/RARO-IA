/** Métricas recorrentes puras: não lê banco, relógio ou configuração externa. */

export type CobrancaMRR = {
  competencia?: string;
  mentoradoId?: string | null;
  mentorado_id?: string | null;
  valor?: number;
  valorCentavos?: number;
  valor_centavos?: number;
  status?: string;
};

export type MentoradoLTV = { id: string };

export type ResultadoMRR = {
  mrr: number | null;
  mrrCentavos: number | null;
  porMentorado: LinhaMRR[];
  semBase: boolean;
};

export type LinhaMRR = {
  mentoradoId: string | null;
  mrr: number;
  mrrCentavos: number;
};

export type ResultadoARR = {
  arr: number | null;
  arrCentavos: number | null;
  semBase: boolean;
  motivo?: "mes-invalido" | "serie-insuficiente" | "sem-mrr";
};

export type LinhaLTV = {
  mentoradoId: string;
  ltv: number | null;
  ltvCentavos: number | null;
  semBase: boolean;
};

export type ResultadoLTV = {
  porMentorado: LinhaLTV[];
  semBase: boolean;
};

const STATUS_MRR = new Set(["paga"]);
const SEM_MENTORADO = "__sem_mentorado__";

export function mrrDe(cobrancas: CobrancaMRR[], mesIso: string): ResultadoMRR {
  if (!mesValido(mesIso)) return vazioMRR();
  const mes = mesIso.slice(0, 7);
  let total = 0;
  const porMentorado = new Map<string, number>();
  let encontrou = false;
  for (const cobranca of cobrancas) {
    if (!competenciaValida(cobranca.competencia) || cobranca.competencia!.slice(0, 7) !== mes) continue;
    if (!STATUS_MRR.has(cobranca.status ?? "")) continue;
    const centavos = centavosDe(cobranca);
    if (centavos === null) continue;
    if (!Number.isSafeInteger(total + centavos)) return vazioMRR();
    total += centavos;
    const chave = cobranca.mentoradoId ?? cobranca.mentorado_id ?? SEM_MENTORADO;
    const totalDoMentorado = (porMentorado.get(chave) ?? 0) + centavos;
    if (!Number.isSafeInteger(totalDoMentorado)) return vazioMRR();
    porMentorado.set(chave, totalDoMentorado);
    encontrou = true;
  }
  return encontrou
    ? {
        mrr: total / 100,
        mrrCentavos: total,
        porMentorado: [...porMentorado].map(([id, centavos]) => ({
          mentoradoId: id === SEM_MENTORADO ? null : id,
          mrr: centavos / 100,
          mrrCentavos: centavos,
        })),
        semBase: false,
      }
    : vazioMRR();
}

/** Anualiza apenas quando a entrada contém uma série de três competências. */
export function arrDe(cobrancas: CobrancaMRR[], mesIso?: string): ResultadoARR {
  const mes = mesIso ?? ultimaCompetencia(cobrancas);
  if (!mes || !mesValido(mes)) return { arr: null, arrCentavos: null, semBase: true, motivo: "mes-invalido" };
  const serie = tresMesesConsecutivos(mes);
  if (!serie || serie.some((competencia) => mrrDe(cobrancas, `${competencia}-01`).semBase)) {
    return { arr: null, arrCentavos: null, semBase: true, motivo: "serie-insuficiente" };
  }
  const mrr = mrrDe(cobrancas, mes);
  if (mrr.mrrCentavos === null) return { arr: null, arrCentavos: null, semBase: true, motivo: "sem-mrr" };
  const arrCentavos = mrr.mrrCentavos * 12;
  if (!Number.isSafeInteger(arrCentavos)) return { arr: null, arrCentavos: null, semBase: true, motivo: "sem-mrr" };
  return { arr: arrCentavos / 100, arrCentavos, semBase: false };
}

export function ltvDe(mentorados: MentoradoLTV[], cobrancas: CobrancaMRR[]): ResultadoLTV {
  const pagos = new Map<string, number>();
  const semBasePorOverflow = new Set<string>();
  for (const cobranca of cobrancas) {
    if (cobranca.status !== "paga") continue;
    const id = cobranca.mentoradoId ?? cobranca.mentorado_id;
    const centavos = centavosDe(cobranca);
    if (!id || centavos === null) continue;
    if (semBasePorOverflow.has(id)) continue;
    const total = (pagos.get(id) ?? 0) + centavos;
    if (!Number.isSafeInteger(total)) {
      pagos.delete(id);
      semBasePorOverflow.add(id);
      continue;
    }
    pagos.set(id, total);
  }
  const porMentorado = mentorados.map(({ id }) => {
    const centavos = pagos.get(id);
    return semBasePorOverflow.has(id) || centavos === undefined
      ? { mentoradoId: id, ltv: null, ltvCentavos: null, semBase: true }
      : { mentoradoId: id, ltv: centavos / 100, ltvCentavos: centavos, semBase: false };
  });
  return { porMentorado, semBase: porMentorado.every((linha) => linha.semBase) };
}

function vazioMRR(): ResultadoMRR {
  return { mrr: null, mrrCentavos: null, porMentorado: [], semBase: true };
}

function centavosDe(cobranca: CobrancaMRR): number | null {
  const valor = cobranca.valorCentavos ?? cobranca.valor_centavos;
  if (valor !== undefined) return Number.isSafeInteger(valor) && valor >= 0 ? valor : null;
  if (typeof cobranca.valor !== "number" || !Number.isFinite(cobranca.valor) || cobranca.valor < 0) return null;
  const centavos = Math.round(cobranca.valor * 100);
  return Number.isSafeInteger(centavos) && Math.abs(cobranca.valor * 100 - centavos) < 1e-7 ? centavos : null;
}

function ultimaCompetencia(cobrancas: CobrancaMRR[]): string | null {
  const meses = cobrancas
    .filter((c) => STATUS_MRR.has(c.status ?? "") && competenciaValida(c.competencia) && centavosDe(c) !== null)
    .map((c) => c.competencia!.slice(0, 7));
  return meses.length ? `${meses.sort().at(-1)}-01` : null;
}

function competenciaValida(texto: unknown): texto is string {
  return typeof texto === "string" && /^\d{4}-\d{2}-\d{2}$/.test(texto) && mesValido(texto);
}

function mesValido(texto: string): boolean {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
  if (!partes) return false;
  const ano = Number(partes[1]);
  const mes = Number(partes[2]);
  const dia = Number(partes[3]);
  const max = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return ano >= 1 && mes >= 1 && mes <= 12 && dia >= 1 && dia <= max;
}

function tresMesesConsecutivos(mesIso: string): string[] | null {
  const partes = /^(\d{4})-(\d{2})$/.exec(mesIso.slice(0, 7));
  if (!partes) return null;
  const ano = Number(partes[1]);
  const mes = Number(partes[2]);
  if (ano < 1 || mes < 1 || mes > 12) return null;

  return [-2, -1, 0].map((deslocamento) => {
    const total = ano * 12 + (mes - 1) + deslocamento;
    return `${Math.floor(total / 12).toString().padStart(4, "0")}-${((total % 12) + 1).toString().padStart(2, "0")}`;
  });
}
