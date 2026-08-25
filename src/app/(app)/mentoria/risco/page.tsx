import { revalidatePath } from "next/cache";
import { supabaseConfigurado } from "@/lib/data";
import { criarSupabaseServer } from "@/lib/supabase/server";
import { PainelRiscoVisao, type AlertaParaPainel, type AnaliseParaPainel } from "./visao";

type Linha = Record<string, unknown>;

function texto(valor: unknown): string {
  return typeof valor === "string" ? valor.trim() : "";
}

function textos(valor: unknown): string[] {
  return Array.isArray(valor) ? valor.filter((item): item is string => typeof item === "string") : [];
}

function tipo(valor: unknown): AlertaParaPainel["tipo"] | null {
  return valor === "queda_score" || valor === "silencio" || valor === "faltas" || valor === "tarefas_atrasadas" ? valor : null;
}

function severidade(valor: unknown): AlertaParaPainel["severidade"] | null {
  return valor === "baixa" || valor === "media" || valor === "alta" ? valor : null;
}

async function lerPainel(): Promise<{ alertas: AlertaParaPainel[]; analises: AnaliseParaPainel[]; motivo: string }> {
  if (!supabaseConfigurado()) return { alertas: [], analises: [], motivo: "Nenhuma conexão com o banco de dados configurada. O painel não pode ser carregado agora." };
  try {
    const supabase = criarSupabaseServer();
    const [alertasResposta, analisesResposta] = await Promise.all([
      supabase.from("alerta_risco").select("id, mentorado_id, tipo, severidade, detalhe").eq("resolvido", false).order("criado_em", { ascending: false }),
      supabase.from("analise_sessao").select("id, mentorado_id, sessao_id, modelo, gerada_por, gerada_em, pontos_fortes, riscos").order("gerada_em", { ascending: false }).limit(30),
    ]);
    if (alertasResposta.error || analisesResposta.error) return { alertas: [], analises: [], motivo: "Não foi possível carregar o painel agora. Tente novamente em instantes." };
    const ids = [...new Set([...(alertasResposta.data ?? []), ...(analisesResposta.data ?? [])].map((linha) => texto((linha as Linha).mentorado_id)).filter(Boolean))];
    const nomesResposta = ids.length ? await supabase.from("mentorado").select("id, nome").in("id", ids) : { data: [], error: null };
    if (nomesResposta.error) return { alertas: [], analises: [], motivo: "Não foi possível carregar o painel agora. Tente novamente em instantes." };
    const nomes = new Map((nomesResposta.data ?? []).map((linha) => [texto((linha as Linha).id), texto((linha as Linha).nome)]));
    const alertas = (alertasResposta.data ?? []).flatMap((linha): AlertaParaPainel[] => {
      const item = linha as Linha; const id = texto(item.id); const mentoradoId = texto(item.mentorado_id); const itemTipo = tipo(item.tipo); const itemSeveridade = severidade(item.severidade);
      return id && mentoradoId && itemTipo && itemSeveridade ? [{ id, mentoradoId, nome: nomes.get(mentoradoId) || "Mentorado", tipo: itemTipo, severidade: itemSeveridade, detalhe: texto(item.detalhe) }] : [];
    });
    const analises = (analisesResposta.data ?? []).flatMap((linha): AnaliseParaPainel[] => {
      const item = linha as Linha; const id = texto(item.id); const mentoradoId = texto(item.mentorado_id); const sessaoId = texto(item.sessao_id);
      return id && mentoradoId && sessaoId ? [{ id, mentoradoId, nome: nomes.get(mentoradoId) || "Mentorado", sessaoId, modelo: texto(item.modelo), geradaPor: texto(item.gerada_por), geradaEm: texto(item.gerada_em), pontosFortes: textos(item.pontos_fortes), riscos: textos(item.riscos) }] : [];
    });
    return { alertas, analises, motivo: "" };
  } catch {
    return { alertas: [], analises: [], motivo: "Não foi possível carregar o painel agora. Tente novamente em instantes." };
  }
}

export async function resolverAlerta(formData: FormData): Promise<void> {
  "use server";
  const alertaId = texto(formData.get("alertaId"));
  if (!alertaId || !supabaseConfigurado()) return;
  try {
    const supabase = criarSupabaseServer();
    const { error } = await supabase.from("alerta_risco").update({ resolvido: true, resolvido_em: new Date().toISOString() }).eq("id", alertaId).eq("resolvido", false);
    if (error) return;
    revalidatePath("/mentoria/risco");
  } catch {
    return;
  }
}

export const dynamic = "force-dynamic";

export default async function Risco() {
  const painel = await lerPainel();
  return <PainelRiscoVisao {...painel} resolverAlerta={resolverAlerta} />;
}
