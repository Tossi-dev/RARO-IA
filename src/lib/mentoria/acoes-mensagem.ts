// Ações locais da conversa de mentoria. Não enviam e-mail, WhatsApp ou outro
// serviço: apenas registram uma mensagem privada sob RLS.

import { z } from "zod";
import { criarSupabaseServer } from "../supabase/server";

const TextoSchema = z.string().trim().min(1, "Escreva uma mensagem.").max(4000, "A mensagem é muito longa.");
const IdSchema = z.string().trim().min(1, "Mentorado inválido.").max(100, "Mentorado inválido.");

export type ResultadoMensagem = { ok: true } | { ok: false; erro: string };

function linha(valor: unknown): Record<string, unknown> | null {
  return valor !== null && typeof valor === "object" && !Array.isArray(valor) ? valor as Record<string, unknown> : null;
}

function texto(valor: unknown): string {
  return typeof valor === "string" ? valor.trim() : "";
}

async function inserir(s: ReturnType<typeof criarSupabaseServer>, workspaceId: string, mentoradoId: string, direcao: "gestao_para_mentorado" | "mentorado_para_gestao", conteudo: string): Promise<ResultadoMensagem> {
  const { error } = await s.from("mensagem_mentoria").insert({
    workspace_id: workspaceId,
    mentorado_id: mentoradoId,
    direcao,
    texto: conteudo,
  });
  return error ? { ok: false, erro: "Não foi possível registrar a mensagem agora." } : { ok: true };
}

export async function enviarMensagemDaGestao(formData: FormData): Promise<ResultadoMensagem> {
  const entrada = z.object({ mentoradoId: IdSchema, texto: TextoSchema }).safeParse({
    mentoradoId: String(formData.get("mentoradoId") ?? ""),
    texto: String(formData.get("texto") ?? ""),
  });
  if (!entrada.success) return { ok: false, erro: entrada.error.issues[0]?.message ?? "Mensagem inválida." };
  const s = criarSupabaseServer();
  const { data, error } = await s.from("mentorado").select("id, workspace_id").eq("id", entrada.data.mentoradoId).maybeSingle();
  if (error) return { ok: false, erro: "Não foi possível carregar o mentorado agora." };
  const mentorado = linha(data);
  const workspaceId = texto(mentorado?.workspace_id);
  if (texto(mentorado?.id) !== entrada.data.mentoradoId || workspaceId === "") return { ok: false, erro: "Mentorado não encontrado." };
  return inserir(s, workspaceId, entrada.data.mentoradoId, "gestao_para_mentorado", entrada.data.texto);
}

export async function enviarMensagemDoMentorado(formData: FormData): Promise<ResultadoMensagem> {
  const conteudo = TextoSchema.safeParse(String(formData.get("texto") ?? ""));
  if (!conteudo.success) return { ok: false, erro: conteudo.error.issues[0]?.message ?? "Mensagem inválida." };
  const s = criarSupabaseServer();
  const { data: mentoradoAtual, error: erroAtual } = await s.rpc("mentorado_atual");
  const mentoradoId = texto(mentoradoAtual);
  if (erroAtual || mentoradoId === "") return { ok: false, erro: "Não foi possível identificar o mentorado agora." };
  const { data, error } = await s.from("mentorado").select("id, workspace_id").eq("id", mentoradoId).maybeSingle();
  if (error) return { ok: false, erro: "Não foi possível carregar o mentorado agora." };
  const mentorado = linha(data);
  const workspaceId = texto(mentorado?.workspace_id);
  if (texto(mentorado?.id) !== mentoradoId || workspaceId === "") return { ok: false, erro: "Mentorado não encontrado." };
  return inserir(s, workspaceId, mentoradoId, "mentorado_para_gestao", conteudo.data);
}
