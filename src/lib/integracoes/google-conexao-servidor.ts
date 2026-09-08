import "server-only";

import { criarSupabaseServer } from "@/lib/supabase/server";
import { criarSupabaseServico } from "@/lib/supabase/servico";
import {
  chaveDoCofreGoogle,
  cifrarRefreshTokenGoogle,
  decifrarRefreshTokenGoogle,
} from "./google-cofre";

export type MotivoConexaoGoogle =
  | "cofre_nao_configurado"
  | "servico_nao_configurado"
  | "erro_de_armazenamento"
  | "nao_autorizado"
  | "nao_conectado"
  | "conexao_revogada"
  | "registro_invalido";

export type ResultadoConexaoGoogle = { ok: true } | { ok: false; motivo: MotivoConexaoGoogle };
export type ResultadoLeituraConexaoGoogle =
  | { ok: true; refreshToken: string }
  | { ok: false; motivo: MotivoConexaoGoogle };

export type EntradaSalvarConexaoGoogle = {
  refreshToken: string;
  escopos: string[];
};

function identificadorValido(valor: string): boolean {
  return typeof valor === "string" && valor.trim().length > 0 && valor.length <= 100;
}

function escoposSeguros(escopos: string[]): string[] {
  return [...new Set(escopos.filter((escopo) => typeof escopo === "string" && escopo.startsWith("https://www.googleapis.com/auth/")))];
}

type ContextoGestaoGoogle = { workspaceId: string; usuarioId: string };

/**
 * A chave de serviço ignora RLS, por isso a fronteira que a usa não aceita
 * workspace nem usuário de parâmetro. A identidade vem da sessão atual e a
 * associação usuário → workspace é relida pelo cliente sujeito ao RLS.
 */
async function contextoDeGestaoGoogle(): Promise<ContextoGestaoGoogle | null> {
  const supabase = criarSupabaseServer();
  const { data: autenticacao, error: erroAutenticacao } = await supabase.auth.getUser();
  const usuarioId = autenticacao.user?.id;
  if (erroAutenticacao || !usuarioId || !identificadorValido(usuarioId)) return null;

  const { data: perfil, error: erroPerfil } = await supabase
    .from("profiles")
    .select("id,workspace_id,papel")
    .eq("id", usuarioId)
    .maybeSingle();
  if (erroPerfil || !perfil) return null;

  const workspaceId = String(perfil.workspace_id ?? "");
  const papel = String(perfil.papel ?? "");
  if (!identificadorValido(workspaceId) || (papel !== "dono" && papel !== "gestor")) return null;
  return { workspaceId, usuarioId };
}

/**
 * Persiste exclusivamente dados já cifrados e só é chamável no servidor.
 * A autorização de pessoa e workspace deve ocorrer antes desta fronteira.
 */
export async function salvarRefreshTokenGoogleDaOrganizacao(
  entrada: EntradaSalvarConexaoGoogle,
): Promise<ResultadoConexaoGoogle> {
  const contexto = await contextoDeGestaoGoogle();
  if (!contexto) return { ok: false, motivo: "nao_autorizado" };

  const chave = chaveDoCofreGoogle();
  if (!chave) return { ok: false, motivo: "cofre_nao_configurado" };

  const servico = criarSupabaseServico();
  if (!servico) return { ok: false, motivo: "servico_nao_configurado" };

  const cifrado = cifrarRefreshTokenGoogle(entrada.refreshToken, chave);
  const { error } = await servico.from("google_calendar_conexao").upsert(
    {
      workspace_id: contexto.workspaceId,
      refresh_token_cifrado: cifrado.cifra,
      iv: cifrado.iv,
      tag_autenticacao: cifrado.tag,
      versao_chave: cifrado.versaoChave,
      escopos: escoposSeguros(entrada.escopos),
      conectado_por: contexto.usuarioId,
      conectado_em: new Date().toISOString(),
      atualizado_em: new Date().toISOString(),
      revogado_em: null,
    },
    { onConflict: "workspace_id" },
  );

  return error ? { ok: false, motivo: "erro_de_armazenamento" } : { ok: true };
}

/**
 * Recupera o token apenas para uso transitório de uma chamada Google no
 * servidor. Nenhum componente, rota pública ou HTML recebe esse valor.
 */
export async function lerRefreshTokenGoogleDaOrganizacao(
): Promise<ResultadoLeituraConexaoGoogle> {
  const contexto = await contextoDeGestaoGoogle();
  if (!contexto) return { ok: false, motivo: "nao_autorizado" };

  const chave = chaveDoCofreGoogle();
  if (!chave) return { ok: false, motivo: "cofre_nao_configurado" };

  const servico = criarSupabaseServico();
  if (!servico) return { ok: false, motivo: "servico_nao_configurado" };

  const { data, error } = await servico
    .from("google_calendar_conexao")
    .select("refresh_token_cifrado,iv,tag_autenticacao,versao_chave,revogado_em")
    .eq("workspace_id", contexto.workspaceId)
    .maybeSingle();

  if (error) return { ok: false, motivo: "erro_de_armazenamento" };
  if (!data) return { ok: false, motivo: "nao_conectado" };
  if (data.revogado_em) return { ok: false, motivo: "conexao_revogada" };

  const refreshToken = decifrarRefreshTokenGoogle(
    {
      cifra: String(data.refresh_token_cifrado ?? ""),
      iv: String(data.iv ?? ""),
      tag: String(data.tag_autenticacao ?? ""),
      versaoChave: Number(data.versao_chave),
    },
    chave,
  );

  return refreshToken ? { ok: true, refreshToken } : { ok: false, motivo: "registro_invalido" };
}
