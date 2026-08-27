import "server-only";

import { supabaseConfigurado } from "../data";
import { criarSupabaseServer } from "../supabase/server";

type Linha = Record<string, unknown>;

export interface AtendimentoLido {
  conectado: boolean;
  encontrado: boolean;
  mapa: Linha[];
  metas: Linha[];
  passos: Linha[];
  reflexoes: Linha[];
  consentimentos: Linha[];
}

const vazio = (conectado: boolean, encontrado: boolean): AtendimentoLido => ({
  conectado,
  encontrado,
  mapa: [],
  metas: [],
  passos: [],
  reflexoes: [],
  consentimentos: [],
});

export async function lerAtendimento(mentoradoId: string): Promise<AtendimentoLido> {
  if (!supabaseConfigurado()) return vazio(false, false);

  try {
    const supabase = criarSupabaseServer();
    const mentorado = await supabase.from("mentorado").select("id").eq("id", mentoradoId).maybeSingle();
    if (mentorado.error || !mentorado.data) return vazio(!mentorado.error, false);

    const resultados = await Promise.all(
      ["atendimento_mapa", "atendimento_meta", "atendimento_passo", "atendimento_reflexao", "atendimento_consentimento"].map(
        (tabela) => supabase.from(tabela).select("*").eq("mentorado_id", mentoradoId),
      ),
    );
    if (resultados.some((resultado) => resultado.error)) return vazio(false, false);

    const [mapa, metas, passos, reflexoes, consentimentos] = resultados.map((resultado) =>
      Array.isArray(resultado.data) ? (resultado.data as Linha[]) : [],
    );
    return { conectado: true, encontrado: true, mapa, metas, passos, reflexoes, consentimentos };
  } catch {
    return vazio(false, false);
  }
}
