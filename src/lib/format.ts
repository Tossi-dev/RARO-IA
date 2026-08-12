// Formatação pt-BR

export function fmtBRL(v: number): string {
  return (Number(v) || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: v >= 1000 ? 0 : 2,
  });
}

export function fmtBRLExato(v: number): string {
  return (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function fmtNum(v: number): string {
  return (Number(v) || 0).toLocaleString("pt-BR");
}

export function fmtPct(v: number, casas = 1): string {
  return `${(Number(v) || 0).toLocaleString("pt-BR", { maximumFractionDigits: casas })}%`;
}

export function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  const dt = new Date(`${d.slice(0, 10)}T12:00:00`);
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString("pt-BR");
}

/** ISO datetime → '18/07 14:32' (log de eventos). */
export function fmtDateTime(d: string | null | undefined): string {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  return `${dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} ${dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** '2026-07' → 'jul/26' */
export function ymLabel(ym: string): string {
  const [ano, mes] = ym.split("-").map(Number);
  if (!ano || !mes) return ym;
  return `${MESES_CURTOS[mes - 1]}/${String(ano).slice(2)}`;
}

/** índice do mês (1-12) → 'jan' */
export function mesCurto(m: number): string {
  return MESES_CURTOS[m - 1] ?? String(m);
}

export function ymAtual(ref = new Date()): string {
  return `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, "0")}`;
}
