import "server-only";

import { supabaseConfigurado } from "../data";
import { criarSupabaseServer } from "../supabase/server";
import { arrDe, mrrDe, type CobrancaMRR, type ResultadoARR, type ResultadoMRR } from "./mrr";
import { reguaDe, type CobrancaRegua, type ResultadoRegua } from "./inadimplencia";

type Row = Record<string, unknown>;

export interface CobrancaLida extends CobrancaMRR, CobrancaRegua {
  id: string;
  mentoradoId: string;
  matriculaId: string | null;
  competencia: string;
  vencimento: string;
  valor: number;
  valorCentavos: number;
  status: string;
  pagoEm: string | null;
  forma: string | null;
  movimentoId: string | null;
  criadoEm: string;
}

export interface ContratoLido {
  id: string;
  mentoradoId: string;
  matriculaId: string | null;
  documentoId: string | null;
  assinadoEm: string | null;
  vigenciaInicio: string | null;
  vigenciaFim: string | null;
  valorTotal: number;
  valorTotalCentavos: number;
  status: string;
  criadoEm: string;
}

export interface FiltroCobrancas {
  status?: string;
  mentoradoId?: string;
  matriculaId?: string;
  competencia?: string;
  limite?: number;
}

export interface LeituraCobrancas {
  conectado: boolean;
  motivo: string;
  parcial: boolean;
  limitado: boolean;
  cobrancas: CobrancaLida[];
}

export interface LeituraContratos {
  conectado: boolean;
  motivo: string;
  parcial: boolean;
  contratos: ContratoLido[];
}

export interface IndicadoresRecorrencia {
  conectado: boolean;
  motivo: string;
  parcial: boolean;
  cobrancas: CobrancaLida[];
  contratos: ContratoLido[];
  mrr: ResultadoMRR["mrr"];
  arr: ResultadoARR["arr"];
  regua: ResultadoRegua | null;
  reguaLimitada: boolean;
}

const SEM_CONEXAO = "Nenhuma conexão com o banco de dados configurada. O financeiro não pode ser carregado agora.";
const ERRO_LEITURA = "Não foi possível carregar o financeiro agora. Tente novamente em instantes.";

function centavos(valor: unknown): number {
  const numero = typeof valor === "number" ? valor : Number(valor);
  return Number.isFinite(numero) ? Math.round(numero * 100) : 0;
}

function cobrancaDaLinha(r: Row): CobrancaLida {
  const valor = typeof r.valor === "number" ? r.valor : Number(r.valor ?? 0);
  return {
    id: String(r.id ?? ""), mentoradoId: String(r.mentorado_id ?? ""), matriculaId: (r.matricula_id as string | null) ?? null,
    competencia: String(r.competencia ?? ""), vencimento: String(r.vencimento ?? ""), valor, valorCentavos: centavos(r.valor),
    status: String(r.status ?? ""), pagoEm: (r.pago_em as string | null) ?? null, forma: (r.forma as string | null) ?? null,
    movimentoId: (r.movimento_id as string | null) ?? null, criadoEm: String(r.criado_em ?? ""),
  };
}

function contratoDaLinha(r: Row): ContratoLido {
  const valor = typeof r.valor_total === "number" ? r.valor_total : Number(r.valor_total ?? 0);
  return {
    id: String(r.id ?? ""), mentoradoId: String(r.mentorado_id ?? ""), matriculaId: (r.matricula_id as string | null) ?? null,
    documentoId: (r.documento_id as string | null) ?? null, assinadoEm: (r.assinado_em as string | null) ?? null,
    vigenciaInicio: (r.vigencia_inicio as string | null) ?? null, vigenciaFim: (r.vigencia_fim as string | null) ?? null,
    valorTotal: valor, valorTotalCentavos: centavos(r.valor_total), status: String(r.status ?? ""), criadoEm: String(r.criado_em ?? ""),
  };
}

function resultadoErro<T>(itens: T[], motivo = ERRO_LEITURA) {
  return { conectado: false, motivo, parcial: false, itens };
}

export async function lerCobrancas(filtro: FiltroCobrancas = {}): Promise<LeituraCobrancas> {
  if (!supabaseConfigurado()) return { conectado: false, motivo: SEM_CONEXAO, parcial: false, limitado: false, cobrancas: [] };
  try {
    let q = criarSupabaseServer().from("cobranca").select("*").order("vencimento", { ascending: true });
    if (filtro.status) q = q.eq("status", filtro.status);
    if (filtro.mentoradoId) q = q.eq("mentorado_id", filtro.mentoradoId);
    if (filtro.matriculaId) q = q.eq("matricula_id", filtro.matriculaId);
    if (filtro.competencia) q = q.eq("competencia", filtro.competencia);
    if (filtro.limite !== undefined) q = q.limit(filtro.limite);
    const { data, error } = await q;
    if (error) return { conectado: false, motivo: ERRO_LEITURA, parcial: false, limitado: false, cobrancas: [] };
    const linhas = (data ?? []) as Row[];
    const limitado = filtro.limite !== undefined && linhas.length >= filtro.limite;
    return { conectado: true, motivo: limitado ? "A leitura está limitada; os indicadores dependentes da lista completa não foram calculados." : "", parcial: limitado, limitado, cobrancas: linhas.map(cobrancaDaLinha) };
  } catch { return { conectado: false, motivo: ERRO_LEITURA, parcial: false, limitado: false, cobrancas: [] }; }
}

export async function lerContratos(): Promise<LeituraContratos> {
  if (!supabaseConfigurado()) return { conectado: false, motivo: SEM_CONEXAO, parcial: false, contratos: [] };
  try {
    const { data, error } = await criarSupabaseServer().from("contrato").select("*").order("criado_em", { ascending: false });
    if (error) return { conectado: false, motivo: ERRO_LEITURA, parcial: false, contratos: [] };
    return { conectado: true, motivo: "", parcial: false, contratos: ((data ?? []) as Row[]).map(contratoDaLinha) };
  } catch { return { conectado: false, motivo: ERRO_LEITURA, parcial: false, contratos: [] }; }
}

export async function lerIndicadoresRecorrencia(agoraIso: string, filtro: FiltroCobrancas = {}): Promise<IndicadoresRecorrencia> {
  if (!supabaseConfigurado()) return { conectado: false, motivo: SEM_CONEXAO, parcial: false, cobrancas: [], contratos: [], mrr: null, arr: null, regua: null, reguaLimitada: false };
  const [cobrancas, contratos] = await Promise.all([lerCobrancas(filtro), lerContratos()]);
  const parcial = cobrancas.parcial || contratos.parcial || !cobrancas.conectado || !contratos.conectado;
  if (parcial) return { conectado: true, motivo: "Não foi possível completar a leitura do financeiro; os indicadores foram omitidos.", parcial: true, cobrancas: cobrancas.cobrancas, contratos: contratos.contratos, mrr: null, arr: null, regua: null, reguaLimitada: cobrancas.limitado };
  const base = cobrancas.cobrancas;
  const mes = agoraIso.slice(0, 7) + "-01";
  const mrr = mrrDe(base, mes);
  const arr = arrDe(base, mes);
  return { conectado: true, motivo: "", parcial: false, cobrancas: base, contratos: contratos.contratos, mrr: mrr.mrr, arr: arr.arr, regua: reguaDe(base, agoraIso), reguaLimitada: false };
}
