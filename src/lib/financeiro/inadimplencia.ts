export type DegrauRegua = "D-3" | "D+1" | "D+3" | "D+7" | "D+15";

export type CobrancaRegua = {
  id: string;
  vencimento: string;
  status?: string;
  mentoradoNome?: string;
  valor?: number;
  envios?: Array<string | { degrau?: string; tipo?: string }>;
  degrausEnviados?: string[];
  [campo: string]: unknown;
};

export type LembreteInadimplencia = {
  cobrancaId: string;
  degrau: DegrauRegua;
  texto: string;
};

export type InconsistenteInadimplencia = {
  cobrancaId: string;
  motivo: "vencimento-invalido";
};

export type ResultadoRegua = {
  lembretes: LembreteInadimplencia[];
  inconsistentes: InconsistenteInadimplencia[];
};

const DEGRAUS: readonly [number, DegrauRegua][] = [
  [-3, "D-3"],
  [1, "D+1"],
  [3, "D+3"],
  [7, "D+7"],
  [15, "D+15"],
];

/** Calcula, sem efeitos colaterais, o lembrete devido em cada marco da régua. */
export function reguaDe(cobrancas: CobrancaRegua[], agoraIso: string): ResultadoRegua {
  const agora = dataCivil(agoraIso);
  if (agora === null) return { lembretes: [], inconsistentes: [] };

  const lembretes: LembreteInadimplencia[] = [];
  const inconsistentes: InconsistenteInadimplencia[] = [];

  for (const cobranca of cobrancas) {
    if (cobranca.status === "paga" || cobranca.status === "cancelada") continue;
    const vencimento = dataCivil(cobranca.vencimento);
    if (vencimento === null) {
      inconsistentes.push({ cobrancaId: cobranca.id, motivo: "vencimento-invalido" });
      continue;
    }

    const diferenca = diasEntre(vencimento, agora);
    const degrau = DEGRAUS.find(([dias]) => dias === diferenca)?.[1];
    if (!degrau || jaEnviado(cobranca, degrau)) continue;

    const nomeLimpo = typeof cobranca.mentoradoNome === "string" ? semEmoji(cobranca.mentoradoNome).trim() : "";
    const nome = nomeLimpo
      ? ` ${nomeLimpo}`
      : "";
    lembretes.push({
      cobrancaId: cobranca.id,
      degrau,
      texto: `Lembrete de cobrança${nome}: a parcela está no marco ${degrau}. Confira o pagamento e faça o contato necessário.`,
    });
  }

  return { lembretes, inconsistentes };
}

function jaEnviado(cobranca: CobrancaRegua, degrau: DegrauRegua): boolean {
  const registros: unknown[] = [
    ...(Array.isArray(cobranca.envios) ? cobranca.envios : []),
    ...(Array.isArray(cobranca.degrausEnviados) ? cobranca.degrausEnviados : []),
  ];
  return registros.some((registro) => {
    if (typeof registro === "string") return registro === degrau;
    if (!registro || typeof registro !== "object") return false;
    const r = registro as { degrau?: unknown; tipo?: unknown };
    return r.degrau === degrau || r.tipo === degrau;
  });
}

function dataCivil(texto: unknown): number | null {
  if (typeof texto !== "string") return null;
  const partes = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(?:Z|([+-])(\d{2}):(\d{2}))?)?$/.exec(texto);
  if (!partes) return null;
  const ano = Number(partes[1]);
  const mes = Number(partes[2]);
  const dia = Number(partes[3]);
  const hora = partes[4] === undefined ? null : Number(partes[4]);
  const minuto = partes[5] === undefined ? null : Number(partes[5]);
  const segundo = partes[6] === undefined ? null : Number(partes[6]);
  const horaOffset = partes[8] === undefined ? null : Number(partes[8]);
  const minutoOffset = partes[9] === undefined ? null : Number(partes[9]);
  if (ano < 1 || mes < 1 || mes > 12 || dia < 1 || dia > diasNoMes(ano, mes)) return null;
  if (hora !== null && (hora > 23 || minuto === null || minuto > 59 || (segundo !== null && segundo > 59))) return null;
  if (horaOffset !== null && (horaOffset > 23 || minutoOffset === null || minutoOffset > 59)) return null;
  return diasDesdeInicio(ano, mes, dia);
}

function diasEntre(vencimento: number, agora: number): number {
  return agora - vencimento;
}

function diasNoMes(ano: number, mes: number): number {
  if (mes === 2) return ano % 4 === 0 && (ano % 100 !== 0 || ano % 400 === 0) ? 29 : 28;
  return [4, 6, 9, 11].includes(mes) ? 30 : 31;
}

function diasDesdeInicio(ano: number, mes: number, dia: number): number {
  const anosCompletos = ano - 1;
  const bissextos = Math.floor(anosCompletos / 4) - Math.floor(anosCompletos / 100) + Math.floor(anosCompletos / 400);
  const diasAntesDoMes = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334][mes - 1];
  const ajusteBissexto = mes > 2 && diasNoMes(ano, 2) === 29 ? 1 : 0;

  return anosCompletos * 365 + bissextos + diasAntesDoMes + ajusteBissexto + dia - 1;
}

function semEmoji(texto: string): string {
  return texto
    .replace(/[\p{Extended_Pictographic}\p{Regional_Indicator}\p{Emoji_Modifier}\u20E3]/gu, "")
    .replace(/[\uFE0F\u200D\u{E0020}-\u{E007F}]/gu, "");
}
