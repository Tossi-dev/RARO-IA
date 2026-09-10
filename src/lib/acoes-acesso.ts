"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { supabaseConfigurado } from "./data";
import { criarSupabaseServer } from "./supabase/server";

const CadastroSaasSchema = z
  .object({
    nome: z.string().trim().min(2).max(120),
    workspaceNome: z.string().trim().min(2).max(120),
    email: z.string().trim().email().max(160),
    senha: z.string().min(12).max(128),
    confirmarSenha: z.string().min(1).max(128),
  })
  .refine((dados) => dados.senha === dados.confirmarSenha, {
    path: ["confirmarSenha"],
  });

function urlDeConfirmacao(): string | undefined {
  const base = process.env.NEXT_PUBLIC_SITE_URL;
  if (!base) return undefined;

  try {
    const url = new URL("/auth/confirm", base);
    url.searchParams.set("next", "/login?confirmado=1");
    return url.toString();
  } catch {
    return undefined;
  }
}

export async function criarContaSaas(formData: FormData) {
  if (!supabaseConfigurado()) return redirect("/login");

  const resultado = CadastroSaasSchema.safeParse({
    nome: String(formData.get("nome") ?? ""),
    workspaceNome: String(formData.get("workspaceNome") ?? ""),
    email: String(formData.get("email") ?? ""),
    senha: String(formData.get("senha") ?? ""),
    confirmarSenha: String(formData.get("confirmarSenha") ?? ""),
  });

  if (!resultado.success) return redirect("/criar-conta?erro=campos");

  const dados = resultado.data;
  const { error } = await criarSupabaseServer().auth.signUp({
    email: dados.email,
    password: dados.senha,
    options: {
      data: {
        nome: dados.nome,
        workspace_nome: dados.workspaceNome,
        criar_workspace: true,
      },
      emailRedirectTo: urlDeConfirmacao(),
    },
  });

  // A tela não pode servir como oráculo para descobrir quais e-mails já
  // pertencem a uma conta. Depois da validação local, sucesso e recusa do
  // provedor mostram o mesmo próximo passo. O detalhe fica só no log do
  // servidor, sem e-mail, senha ou outro dado da pessoa.
  if (error) console.warn("[cadastro] Supabase recusou a criação:", error.code ?? "sem-codigo");
  return redirect("/criar-conta?sucesso=1");
}
