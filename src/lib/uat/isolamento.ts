import { criarSupabaseServer } from "@/lib/supabase/server";

const DOMINIO_UAT = "@audit.invalid";

/** Identidades reservadas à homologação; nunca representam uma pessoa real. */
export function emailEhUatSintetico(email: string | null | undefined): boolean {
  return typeof email === "string" && email.trim().toLowerCase().endsWith(DOMINIO_UAT);
}

/**
 * Resolve somente o domínio reservado. Ausência/erro de sessão não significa
 * UAT: instalações por senha, planilha, demo e chamadas de cron não têm uma
 * sessão Supabase e não podem ser confundidas com uma conta sintética.
 */
export async function contaUatSinteticaAtual(): Promise<boolean> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return false;
  try {
    const { data, error } = await criarSupabaseServer().auth.getUser();
    if (error) return true;
    return emailEhUatSintetico(data.user?.email);
  } catch {
    return true;
  }
}
