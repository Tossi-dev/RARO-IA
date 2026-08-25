import { criarSupabaseServer } from "@/lib/supabase/server";
import { lerOportunidade } from "@/lib/comercial/dados";
import { OportunidadeVisao, type AnaliseCallDaOportunidade } from "./visao";

type Linha = Record<string, unknown>;
function texto(valor: unknown): string { return typeof valor === "string" ? valor.trim() : ""; }
function textos(valor: unknown): string[] { return Array.isArray(valor) ? valor.filter((item): item is string => typeof item === "string") : []; }

async function lerAnalises(oportunidadeId: string): Promise<{ analises: AnaliseCallDaOportunidade[]; motivo: string }> {
  try {
    const { data, error } = await criarSupabaseServer().from("analise_call").select("id, score, objecoes, sugestoes, modelo, gerada_por, gerada_em").eq("oportunidade_id", oportunidadeId).order("gerada_em", { ascending: false });
    if (error) return { analises: [], motivo: "Não foi possível carregar as análises agora. Tente novamente em instantes." };
    const analises = (data ?? []).flatMap((linha): AnaliseCallDaOportunidade[] => {
      const item = linha as Linha; const id = texto(item.id); const modelo = texto(item.modelo); const geradaPor = texto(item.gerada_por); const geradaEm = texto(item.gerada_em); const score = typeof item.score === "number" && Number.isInteger(item.score) && item.score >= 0 && item.score <= 100 ? item.score : null;
      return id && modelo && geradaPor && geradaEm ? [{ id, score, objecoes: textos(item.objecoes), sugestoes: textos(item.sugestoes), modelo, geradaPor, geradaEm }] : [];
    });
    return { analises, motivo: "" };
  } catch { return { analises: [], motivo: "Não foi possível carregar as análises agora. Tente novamente em instantes." }; }
}

export const dynamic = "force-dynamic";

export default async function Oportunidade({ params }: { params: { id: string } }) {
  const detalhe = await lerOportunidade(params.id);
  const resultado = detalhe.conectado && detalhe.oportunidade ? await lerAnalises(detalhe.oportunidade.id) : { analises: [], motivo: "" };
  return <OportunidadeVisao detalhe={detalhe} analises={resultado.analises} motivoAnalises={resultado.motivo} />;
}
