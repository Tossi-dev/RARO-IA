import "server-only";
import { supabaseConfigurado } from "../data";
import { criarSupabaseServer } from "../supabase/server";

export interface AtendimentoMapa { id?: string | null; mentorado_id?: string | null; dimensao?: string | null; nota?: number | null; dor?: string | null; medo?: string | null; objetivo?: string | null; registrado_em?: string | null; }
export interface AtendimentoMeta { id?: string | null; mentorado_id?: string | null; titulo?: string | null; prazo?: string | null; status?: string | null; visibilidade?: string | null; criada_em?: string | null; }
export interface AtendimentoPasso { id?: string | null; mentorado_id?: string | null; meta_id?: string | null; descricao?: string | null; responsavel?: string | null; ordem?: number | null; status?: string | null; }
export interface AtendimentoReflexao { id?: string | null; mentorado_id?: string | null; texto?: string | null; origem?: string | null; visibilidade?: string | null; criada_em?: string | null; }
export interface AtendimentoConsentimento { id?: string | null; mentorado_id?: string | null; categoria?: string | null; consentido?: boolean | null; atualizado_em?: string | null; }
export interface AtendimentoLido { conectado: boolean; encontrado: boolean; mapa: AtendimentoMapa[]; metas: AtendimentoMeta[]; passos: AtendimentoPasso[]; reflexoes: AtendimentoReflexao[]; consentimentos: AtendimentoConsentimento[]; }

const vazio = (conectado: boolean, encontrado: boolean): AtendimentoLido => ({ conectado, encontrado, mapa: [], metas: [], passos: [], reflexoes: [], consentimentos: [] });
type Linha = Record<string, unknown>;
const linhaDe = (valor: unknown): Linha => typeof valor === "object" && valor !== null && !Array.isArray(valor) ? valor as Linha : {};
const texto = (valor: unknown): string | null => typeof valor === "string" ? valor : null;
const numero = (valor: unknown): number | null => typeof valor === "number" && Number.isFinite(valor) ? valor : null;
const booleano = (valor: unknown): boolean | null => typeof valor === "boolean" ? valor : null;
const mapaDe = (valor: unknown): AtendimentoMapa => { const r = linhaDe(valor); return { id: texto(r.id), mentorado_id: texto(r.mentorado_id), dimensao: texto(r.dimensao), nota: numero(r.nota), dor: texto(r.dor), medo: texto(r.medo), objetivo: texto(r.objetivo), registrado_em: texto(r.registrado_em) }; };
const metaDe = (valor: unknown): AtendimentoMeta => { const r = linhaDe(valor); return { id: texto(r.id), mentorado_id: texto(r.mentorado_id), titulo: texto(r.titulo), prazo: texto(r.prazo), status: texto(r.status), visibilidade: texto(r.visibilidade), criada_em: texto(r.criada_em) }; };
const passoDe = (valor: unknown): AtendimentoPasso => { const r = linhaDe(valor); return { id: texto(r.id), mentorado_id: texto(r.mentorado_id), meta_id: texto(r.meta_id), descricao: texto(r.descricao), responsavel: texto(r.responsavel), ordem: numero(r.ordem), status: texto(r.status) }; };
const reflexaoDe = (valor: unknown): AtendimentoReflexao => { const r = linhaDe(valor); return { id: texto(r.id), mentorado_id: texto(r.mentorado_id), texto: texto(r.texto), origem: texto(r.origem), visibilidade: texto(r.visibilidade), criada_em: texto(r.criada_em) }; };
const consentimentoDe = (valor: unknown): AtendimentoConsentimento => { const r = linhaDe(valor); return { id: texto(r.id), mentorado_id: texto(r.mentorado_id), categoria: texto(r.categoria), consentido: booleano(r.consentido), atualizado_em: texto(r.atualizado_em) }; };
const COLUNAS = { mapa: "id,mentorado_id,dimensao,nota,dor,medo,objetivo,registrado_em", meta: "id,mentorado_id,titulo,prazo,status,visibilidade,criada_em", passo: "id,mentorado_id,meta_id,descricao,responsavel,ordem,status", reflexao: "id,mentorado_id,texto,origem,visibilidade,criada_em", consentimento: "id,mentorado_id,categoria,consentido,atualizado_em" } as const;

export async function lerAtendimento(mentoradoId: string): Promise<AtendimentoLido> {
  if (!supabaseConfigurado()) return vazio(false, false);
  try {
    const supabase = criarSupabaseServer();
    const mentorado = await supabase.from("mentorado").select("id").eq("id", mentoradoId).maybeSingle();
    if (mentorado.error || !mentorado.data) return vazio(!mentorado.error, false);
    const resultados = await Promise.all([
      supabase.from("atendimento_mapa").select(COLUNAS.mapa).eq("mentorado_id", mentoradoId),
      supabase.from("atendimento_meta").select(COLUNAS.meta).eq("mentorado_id", mentoradoId),
      supabase.from("atendimento_passo").select(COLUNAS.passo).eq("mentorado_id", mentoradoId),
      supabase.from("atendimento_reflexao").select(COLUNAS.reflexao).eq("mentorado_id", mentoradoId),
      supabase.from("atendimento_consentimento").select(COLUNAS.consentimento).eq("mentorado_id", mentoradoId),
    ]);
    if (resultados.some((resultado) => resultado.error)) return vazio(false, false);
    return { conectado: true, encontrado: true, mapa: Array.isArray(resultados[0].data) ? resultados[0].data.map(mapaDe) : [], metas: Array.isArray(resultados[1].data) ? resultados[1].data.map(metaDe) : [], passos: Array.isArray(resultados[2].data) ? resultados[2].data.map(passoDe) : [], reflexoes: Array.isArray(resultados[3].data) ? resultados[3].data.map(reflexaoDe) : [], consentimentos: Array.isArray(resultados[4].data) ? resultados[4].data.map(consentimentoDe) : [] };
  } catch { return vazio(false, false); }
}
