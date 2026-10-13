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
    whatsapp: z.string().regex(/^[1-9][0-9]{9,14}$/),
    senha: z.string().min(12).max(128),
    confirmarSenha: z.string().min(1).max(128),
    consentimento: z.literal("sim"),
  })
  .refine((dados) => dados.senha === dados.confirmarSenha, {
    path: ["confirmarSenha"],
  });

function normalizarWhatsapp(valor: string): string {
  // Remove apenas formatação de telefone legítima. Letras ou outros símbolos
  // não podem virar um número aparentemente válido depois da normalização.
  if (!/^[0-9+()\s-]+$/.test(valor.trim())) return "";
  return valor.replace(/\D/g, "");
}

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

function urlDeRedefinicao(): string | undefined {
  const base = process.env.NEXT_PUBLIC_SITE_URL;
  if (!base) return undefined;

  try {
    const url = new URL("/auth/confirm", base);
    url.searchParams.set("next", "/redefinir-senha");
    return url.toString();
  } catch {
    return undefined;
  }
}

const RedefinicaoSchema = z
  .object({
    senha: z.string().min(12).max(128),
    confirmarSenha: z.string().min(1).max(128),
  })
  .refine((dados) => dados.senha === dados.confirmarSenha, {
    path: ["confirmarSenha"],
  });

export async function criarContaSaas(formData: FormData) {
  if (!supabaseConfigurado()) return redirect("/login");

  const resultado = CadastroSaasSchema.safeParse({
    nome: String(formData.get("nome") ?? ""),
    workspaceNome: String(formData.get("workspaceNome") ?? ""),
    email: String(formData.get("email") ?? ""),
    whatsapp: normalizarWhatsapp(String(formData.get("whatsapp") ?? "")),
    senha: String(formData.get("senha") ?? ""),
    confirmarSenha: String(formData.get("confirmarSenha") ?? ""),
    consentimento: String(formData.get("consentimento") ?? ""),
  });

  if (!resultado.success) return redirect("/criar-conta?erro=campos");

  const dados = resultado.data;
  const { data, error } = await criarSupabaseServer().auth.signUp({
    email: dados.email,
    password: dados.senha,
    options: {
      data: {
        nome: dados.nome,
        workspace_nome: dados.workspaceNome,
        whatsapp: dados.whatsapp,
        consentimento_comercial: true,
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
  // Quando a confirmação de e-mail estiver desativada, o Supabase já devolve
  // a sessão (e o cliente SSR grava os cookies). Nesse caso o teste começa
  // imediatamente, sem instruir a pessoa a esperar um e-mail que não virá.
  if (!error && data?.session) return redirect("/entrada");
  return redirect("/criar-conta?sucesso=1");
}

/**
 * Dispara a recuperação sem revelar se o e-mail possui conta. A resposta
 * uniforme evita que a tela se torne uma forma de descobrir usuários do
 * MentorOS; o Supabase decide silenciosamente se há link a enviar.
 */
export async function solicitarRedefinicaoSenha(formData: FormData) {
  if (!supabaseConfigurado()) return redirect("/login");

  const email = String(formData.get("email") ?? "").trim();
  if (!z.string().email().max(160).safeParse(email).success) {
    return redirect("/esqueci-senha?erro=campos");
  }

  const { error } = await criarSupabaseServer().auth.resetPasswordForEmail(email, {
    redirectTo: urlDeRedefinicao(),
  });
  if (error) console.warn("[recuperacao-senha] Supabase recusou a solicitação:", error.code ?? "sem-codigo");
  return redirect("/esqueci-senha?sucesso=1");
}

export async function redefinirSenha(formData: FormData) {
  if (!supabaseConfigurado()) return redirect("/login");

  const resultado = RedefinicaoSchema.safeParse({
    senha: String(formData.get("senha") ?? ""),
    confirmarSenha: String(formData.get("confirmarSenha") ?? ""),
  });
  if (!resultado.success) return redirect("/redefinir-senha?erro=campos");

  const supabase = criarSupabaseServer();
  const { data: usuario, error: erroUsuario } = await supabase.auth.getUser();
  if (erroUsuario || !usuario.user) return redirect("/login?erro=recuperacao");

  const { error } = await supabase.auth.updateUser({ password: resultado.data.senha });
  if (error) return redirect("/redefinir-senha?erro=salvar");
  return redirect("/login?redefinida=1");
}
