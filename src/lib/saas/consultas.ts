import { criarSupabaseServer } from "@/lib/supabase/server";
import type { StatusSaas } from "./estado";

export type TesteDaPlataforma = {
  workspace_id: string;
  workspace_nome: string;
  dono_nome: string;
  dono_email: string;
  dono_whatsapp: string;
  iniciado_em: string;
  termina_em: string;
  status: StatusSaas;
};

export async function estadoDaAssinaturaAtual(): Promise<{ status: StatusSaas | null; terminaEm: string | null }> {
  const supabase = criarSupabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { status: null, terminaEm: null };
  const { data: perfil } = await supabase.from("profiles").select("workspace_id").eq("id", auth.user.id).maybeSingle();
  if (!perfil?.workspace_id) return { status: null, terminaEm: null };
  const { data } = await supabase
    .from("saas_teste")
    .select("status, termina_em")
    .eq("workspace_id", perfil.workspace_id)
    .maybeSingle();
  return data ? { status: data.status as StatusSaas, terminaEm: data.termina_em } : { status: null, terminaEm: null };
}

export async function plataformaEhAdmin(): Promise<boolean> {
  const supabase = criarSupabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return false;
  const { data, error } = await supabase.rpc("plataforma_eh_admin");
  return !error && data === true;
}

export async function listarTestesDaPlataforma(): Promise<TesteDaPlataforma[]> {
  if (!(await plataformaEhAdmin())) return [];
  const { data, error } = await criarSupabaseServer()
    .from("saas_teste")
    .select("workspace_id, workspace_nome, dono_nome, dono_email, dono_whatsapp, iniciado_em, termina_em, status")
    .order("iniciado_em", { ascending: false });
  return error || !data ? [] : (data as TesteDaPlataforma[]);
}
