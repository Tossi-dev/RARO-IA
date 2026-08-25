"use server";

import { revalidatePath } from "next/cache";
import { criarSupabaseServer } from "../supabase/server";
import { lerHistorico } from "./dados-historico";

function semanaDe(agoraIso: string): string | null {
  const data = new Date(agoraIso);
  if (!Number.isFinite(data.getTime())) return null;
  const dia = data.getUTCDay() || 7;
  data.setUTCDate(data.getUTCDate() - dia + 1);
  return data.toISOString().slice(0, 10);
}

export async function gravarScoreSemanal(formData: FormData, agoraIso = new Date().toISOString()): Promise<void> {
  const mentoradoId = String(formData.get("mentoradoId") ?? "").trim();
  const semana = semanaDe(agoraIso);
  if (!mentoradoId || !semana) return;
  const historico = await lerHistorico(mentoradoId, agoraIso);
  if (!historico.conectado || historico.parcial || historico.saude.score === null) return;
  const { error } = await criarSupabaseServer().from("score_evolucao").upsert(
    { mentorado_id: mentoradoId, semana, score: historico.saude.score },
    { onConflict: "mentorado_id,semana" },
  );
  if (!error) revalidatePath(`/mentoria/${mentoradoId}`);
}
