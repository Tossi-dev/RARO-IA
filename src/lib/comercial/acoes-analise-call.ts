"use server";

import { gerarTexto } from "../integracoes/ia";
import { transcreverAudio } from "../integracoes/stt";
import { criarSupabaseServer } from "../supabase/server";
import { lerResposta, montarPrompt } from "./analise-call";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function texto(formData: FormData, campo: string): string {
  return String(formData.get(campo) ?? "").trim();
}

/** Ação humana: só persiste análise real, legível e atribuída a quem clicou. */
export async function analisarCall(formData: FormData): Promise<void> {
  const oportunidadeId = texto(formData, "oportunidadeId");
  if (!UUID.test(oportunidadeId)) return;

  let transcricao = texto(formData, "transcricao");
  if (!transcricao) {
    const audio = formData.get("audio");
    if (audio instanceof File && audio.size > 0) {
      const resultado = await transcreverAudio(audio, audio.name);
      if (resultado.provider === "demo") return;
      transcricao = resultado.texto.trim();
    }
  }
  if (!transcricao) return;

  const resposta = await gerarTexto(montarPrompt({ transcricao }, {}));
  if (resposta.provider === "demo") return;
  const analise = lerResposta(resposta.texto);
  if (!analise) return;

  const supabase = criarSupabaseServer();
  const { data } = await supabase.auth.getUser();
  if (!data.user?.id) return;
  await supabase.from("analise_call").insert({
    oportunidade_id: oportunidadeId,
    transcricao,
    score: analise.score,
    objecoes: analise.objecoes,
    sugestoes: analise.sugestoes,
    modelo: resposta.provider,
    gerada_por: data.user.id,
  });
}
