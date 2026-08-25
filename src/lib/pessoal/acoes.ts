"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseConfigurado } from "../data";
import { criarSupabaseServer } from "../supabase/server";

const CAMINHO = "/pessoal";
const CLASSES = ["imovel", "veiculo", "reserva", "investimento", "outro"] as const;

function texto(form: FormData, campo: string): string { return String(form.get(campo) ?? "").trim(); }
function valor(form: FormData, campo: string): number | null {
  const bruto = texto(form, campo);
  if (!bruto) return null;
  const convertido = Number(bruto);
  return Number.isFinite(convertido) && convertido >= 0 ? convertido : null;
}
function falhaControle(ex: unknown): boolean {
  const digest = typeof ex === "object" && ex !== null ? (ex as { digest?: unknown }).digest : undefined;
  return typeof digest === "string" && digest.startsWith("NEXT_");
}
function erro(mensagem: string): void { redirect(`${CAMINHO}?erro=${encodeURIComponent(mensagem)}`); }
function pronto(): void { revalidatePath(CAMINHO); }

export async function registrarPatrimonio(formData: FormData): Promise<void> {
  const nome = texto(formData, "nome");
  const classe = texto(formData, "classe");
  const valorPatrimonial = valor(formData, "valor");
  if (!nome || !(CLASSES as readonly string[]).includes(classe) || valorPatrimonial === null) {
    erro("Informe nome, classe e valor válido do patrimônio.");
    return;
  }
  if (!supabaseConfigurado()) return;
  try {
    const { error } = await criarSupabaseServer().from("patrimonio").insert({ nome, classe, valor: valorPatrimonial });
    if (error) { erro("Não foi possível salvar agora. Tente novamente em instantes."); return; }
  } catch (ex) {
    if (falhaControle(ex)) throw ex;
    erro("Não foi possível salvar agora. Tente novamente em instantes.");
    return;
  }
  pronto();
}

export async function registrarInvestimento(formData: FormData): Promise<void> {
  const nome = texto(formData, "nome");
  const aportado = valor(formData, "aportado");
  const valorAtual = valor(formData, "valorAtual");
  if (!nome || aportado === null || valorAtual === null) {
    erro("Informe nome, valor aportado e valor atual válidos.");
    return;
  }
  if (!supabaseConfigurado()) return;
  try {
    const { error } = await criarSupabaseServer().from("investimento").insert({ nome, aportado, valor_atual: valorAtual });
    if (error) { erro("Não foi possível salvar agora. Tente novamente em instantes."); return; }
  } catch (ex) {
    if (falhaControle(ex)) throw ex;
    erro("Não foi possível salvar agora. Tente novamente em instantes.");
    return;
  }
  pronto();
}
