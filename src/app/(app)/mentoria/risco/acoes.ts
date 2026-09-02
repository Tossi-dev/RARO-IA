"use server";

import { revalidatePath } from "next/cache";
import { supabaseConfigurado } from "@/lib/data";
import { criarSupabaseServer } from "@/lib/supabase/server";

function texto(valor: unknown): string {
  return typeof valor === "string" ? valor.trim() : "";
}

export async function resolverAlerta(formData: FormData): Promise<void> {
  const alertaId = texto(formData.get("alertaId"));
  if (!alertaId || !supabaseConfigurado()) return;
  try {
    const supabase = criarSupabaseServer();
    const { error } = await supabase
      .from("alerta_risco")
      .update({ resolvido: true, resolvido_em: new Date().toISOString() })
      .eq("id", alertaId)
      .eq("resolvido", false);
    if (error) return;
    revalidatePath("/mentoria/risco");
  } catch {
    return;
  }
}
