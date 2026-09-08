import "server-only";

import { randomBytes } from "node:crypto";
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
  | "registro_invalido"
  | "estado_invalido";

export type ResultadoConexaoGoogle = { ok: true } | { ok: false; motivo: MotivoConexaoGoogle };
export type ResultadoLeituraConexaoGoogle =
  | { ok: true; refreshToken: string }
  | { ok: false; motivo: MotivoConexaoGoogle };

export type ResultadoEstadoOAuthGoogle =
  | { ok: true; state: string }
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

function stateOAuthValido(state: string): boolean {
  return /^[a-f0-9]{64}$/.test(state);
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

/**
 * Informa se o workspace atual possui conexão utilizável sem trazer material
 * criptográfico à memória. É a fonte da UI, não um cookie de navegador.
 */
export async function conexaoGoogleAtivaDaOrganizacao(): Promise<ResultadoConexaoGoogle> {
  const contexto = await contextoDeGestaoGoogle();
  if (!contexto) return { ok: false, motivo: "nao_autorizado" };

  if (!chaveDoCofreGoogle()) return { ok: false, motivo: "cofre_nao_configurado" };

  const servico = criarSupabaseServico();
  if (!servico) return { ok: false, motivo: "servico_nao_configurado" };

  const { data, error } = await servico
    .from("google_calendar_conexao")
    .select("revogado_em")
    .eq("workspace_id", contexto.workspaceId)
    .maybeSingle();

  if (error) return { ok: false, motivo: "erro_de_armazenamento" };
  if (!data) return { ok: false, motivo: "nao_conectado" };
  return data.revogado_em ? { ok: false, motivo: "conexao_revogada" } : { ok: true };
}

/**
 * Desconecta o Google para o workspace atual. A revogação é lógica para que o
 * token cifrado não volte a ser usado mesmo antes da pessoa removê-lo no Google.
 */
export async function revogarConexaoGoogleDaOrganizacao(): Promise<ResultadoConexaoGoogle> {
  const contexto = await contextoDeGestaoGoogle();
  if (!contexto) return { ok: false, motivo: "nao_autorizado" };

  const servico = criarSupabaseServico();
  if (!servico) return { ok: false, motivo: "servico_nao_configurado" };

  const { error } = await servico
    .from("google_calendar_conexao")
    .update({ revogado_em: new Date().toISOString(), atualizado_em: new Date().toISOString() })
    .eq("workspace_id", contexto.workspaceId);

  return error ? { ok: false, motivo: "erro_de_armazenamento" } : { ok: true };
}

/**
 * Cria um nonce de OAuth no servidor. O registro vincula a volta à pessoa e ao
 * workspace da sessão atual; sua expiração é deliberadamente curta.
 */
export async function criarEstadoOAuthGoogle(): Promise<ResultadoEstadoOAuthGoogle> {
  const contexto = await contextoDeGestaoGoogle();
  if (!contexto) return { ok: false, motivo: "nao_autorizado" };
  if (!chaveDoCofreGoogle()) return { ok: false, motivo: "cofre_nao_configurado" };

  const servico = criarSupabaseServico();
  if (!servico) return { ok: false, motivo: "servico_nao_configurado" };

  const state = randomBytes(32).toString("hex");
  const { error } = await servico.from("google_oauth_estado").insert({
    state,
    workspace_id: contexto.workspaceId,
    usuario_id: contexto.usuarioId,
    conexao: "google_calendar",
    expira_em: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  });

  return error ? { ok: false, motivo: "erro_de_armazenamento" } : { ok: true, state };
}

/**
 * Consome o state na própria atualização SQL. Os filtros fazem a segunda
 * resposta paralela, uma volta expirada, ou uma sessão diferente falharem sem
 * que o código do Google seja trocado.
 */
export async function consumirEstadoOAuthGoogle(state: string): Promise<ResultadoConexaoGoogle> {
  if (!stateOAuthValido(state)) return { ok: false, motivo: "estado_invalido" };

  const contexto = await contextoDeGestaoGoogle();
  if (!contexto) return { ok: false, motivo: "nao_autorizado" };

  const servico = criarSupabaseServico();
  if (!servico) return { ok: false, motivo: "servico_nao_configurado" };

  const agora = new Date().toISOString();
  const { data, error } = await servico
    .from("google_oauth_estado")
    .update({ consumido_em: agora })
    .eq("state", state)
    .eq("workspace_id", contexto.workspaceId)
    .eq("usuario_id", contexto.usuarioId)
    .eq("conexao", "google_calendar")
    .is("consumido_em", null)
    .gt("expira_em", agora)
    .select("state")
    .maybeSingle();

  if (error) return { ok: false, motivo: "erro_de_armazenamento" };
  return data ? { ok: true } : { ok: false, motivo: "estado_invalido" };
}
