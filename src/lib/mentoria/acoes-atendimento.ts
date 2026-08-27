"use server";

import { revalidatePath } from "next/cache";
import { criarSupabaseServer } from "../supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ERRO_SALVAR = "Não foi possível salvar agora. Tente novamente em instantes.";

export type ResultadoAcaoAtendimento = { ok: true } | { ok: false; erro: string };

function texto(formulario: FormData, campo: string): string {
  return String(formulario.get(campo) ?? "").trim();
}

export async function registrarReflexaoAtendimento(formulario: FormData): Promise<ResultadoAcaoAtendimento> {
  const mentoradoId = texto(formulario, "mentoradoId");
  const reflexao = texto(formulario, "texto");
  const origem = texto(formulario, "origem");
  const visibilidade = texto(formulario, "visibilidade");

  if (!UUID.test(mentoradoId) || reflexao === "" || reflexao.length > 10_000) {
    return { ok: false, erro: ERRO_SALVAR };
  }
  if (!(origem === "cliente" || origem === "profissional")) return { ok: false, erro: ERRO_SALVAR };
  if (!(visibilidade === "privada_profissional" || visibilidade === "compartilhavel")) {
    return { ok: false, erro: ERRO_SALVAR };
  }

  try {
    const { error } = await criarSupabaseServer().from("atendimento_reflexao").insert({
      mentorado_id: mentoradoId,
      texto: reflexao,
      origem,
      visibilidade,
    });
    if (error) return { ok: false, erro: ERRO_SALVAR };
    revalidatePath(`/mentoria/${mentoradoId}`);
    return { ok: true };
  } catch {
    return { ok: false, erro: ERRO_SALVAR };
  }
}
