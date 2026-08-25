import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { codigoValido } from "@/lib/marketing/link";

const DOMINIOS_DO_NEGOCIO = new Set(["raro-ia.vercel.app"]);
const RESPOSTA_NAO_ENCONTRADO = { erro: "link não encontrado" };

function naoEncontrado() {
  return NextResponse.json(RESPOSTA_NAO_ENCONTRADO, { status: 404 });
}

function clientePublico() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !chave) return null;
  return createClient(url, chave, { auth: { persistSession: false, autoRefreshToken: false } });
}

function hostDoReferer(requisicao: Request): string {
  try {
    return new URL(requisicao.headers.get("referer") ?? "").hostname.toLocaleLowerCase("pt-BR").slice(0, 253);
  } catch {
    return "";
  }
}

function destinoPermitido(destino: unknown): destino is string {
  if (typeof destino !== "string") return false;
  try {
    const url = new URL(destino);
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    const extras = (process.env.MARKETING_DOMINIOS_PERMITIDOS ?? "")
      .split(",")
      .map((dominio) => dominio.trim().toLocaleLowerCase("pt-BR"))
      .filter(Boolean);
    return DOMINIOS_DO_NEGOCIO.has(url.hostname) || extras.includes(url.hostname);
  } catch {
    return false;
  }
}

export async function GET(requisicao: Request, contexto: { params: { codigo: string } }) {
  const codigo = contexto.params.codigo;
  if (!codigoValido(codigo)) return naoEncontrado();

  const supabase = clientePublico();
  if (!supabase) return naoEncontrado();

  const agente = requisicao.headers.get("user-agent") ?? "";
  const { data: destino, error } = await supabase.rpc("registrar_clique", {
    p_codigo: codigo,
    p_referer_host: hostDoReferer(requisicao),
    p_agente_hash: createHash("sha256").update(agente).digest("hex"),
  });
  if (error || !destinoPermitido(destino)) return naoEncontrado();

  return NextResponse.redirect(destino, 302);
}
