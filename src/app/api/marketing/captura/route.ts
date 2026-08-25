import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { lerUtm } from "@/lib/marketing/utm";

const CORPO_MAXIMO_BYTES = 200 * 1024;
const JANELA_POR_IP_MS = 60_000;
const IPS_RASTREADOS_MAXIMO = 1024;
const ultimasCapturasPorIp = new Map<string, number>();

function texto(valor: unknown, limite: number, minusculo = false): string {
  if (typeof valor !== "string") return "";
  const limpo = valor.replace(/\p{Cc}/gu, "").trim().slice(0, limite);
  return minusculo ? limpo.toLocaleLowerCase("pt-BR") : limpo;
}

function ipDaRequisicao(requisicao: Request): string {
  return texto(requisicao.headers.get("x-forwarded-for")?.split(",")[0], 64) || "desconhecido";
}

function limiteDeFrequenciaAtingido(ip: string, agora: number): boolean {
  const anterior = ultimasCapturasPorIp.get(ip);
  if (anterior !== undefined && agora - anterior < JANELA_POR_IP_MS) return true;

  // A proteção é deliberadamente local: esta tarefa não cria infraestrutura
  // compartilhada. Ainda assim, IPs forjados ou tráfego amplo não podem fazer
  // este processo acumular memória indefinidamente.
  for (const [ipAnterior, instante] of ultimasCapturasPorIp) {
    if (agora - instante >= JANELA_POR_IP_MS) ultimasCapturasPorIp.delete(ipAnterior);
  }
  if (ultimasCapturasPorIp.size >= IPS_RASTREADOS_MAXIMO) {
    const ipMaisAntigo = ultimasCapturasPorIp.keys().next().value;
    if (ipMaisAntigo) ultimasCapturasPorIp.delete(ipMaisAntigo);
  }
  ultimasCapturasPorIp.set(ip, agora);
  return false;
}

function clientePublico() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !chave) return null;
  return createClient(url, chave, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Exportado apenas para isolar estado de processo entre cenários de teste. */
export function resetarLimiteCapturaParaTeste(): void {
  ultimasCapturasPorIp.clear();
}

export function quantidadeDeIpsLimitadosParaTeste(): number {
  return ultimasCapturasPorIp.size;
}

export async function POST(requisicao: Request) {
  const tamanhoInformado = Number(requisicao.headers.get("content-length"));
  if (Number.isFinite(tamanhoInformado) && tamanhoInformado > CORPO_MAXIMO_BYTES) {
    return NextResponse.json({ erro: "corpo muito grande" }, { status: 413 });
  }

  let bruto: string;
  try {
    bruto = await requisicao.text();
  } catch {
    return NextResponse.json({ erro: "corpo inválido" }, { status: 400 });
  }
  if (new TextEncoder().encode(bruto).byteLength > CORPO_MAXIMO_BYTES) {
    return NextResponse.json({ erro: "corpo muito grande" }, { status: 413 });
  }

  let corpo: Record<string, unknown>;
  try {
    const lido: unknown = JSON.parse(bruto);
    if (!lido || typeof lido !== "object" || Array.isArray(lido)) throw new Error("objeto esperado");
    corpo = lido as Record<string, unknown>;
  } catch {
    return NextResponse.json({ erro: "corpo inválido" }, { status: 400 });
  }

  const email = texto(corpo.email, 254, true);
  const telefone = texto(corpo.telefone, 40);
  if (!email && !telefone) return NextResponse.json({ erro: "contato obrigatório" }, { status: 400 });

  if (limiteDeFrequenciaAtingido(ipDaRequisicao(requisicao), Date.now())) {
    return NextResponse.json({ erro: "tente novamente mais tarde" }, { status: 429 });
  }

  const supabase = clientePublico();
  if (!supabase) return NextResponse.json({ erro: "serviço indisponível" }, { status: 503 });

  const utm = lerUtm(corpo);
  const { error } = await supabase.rpc("registrar_captura", {
    p_nome: texto(corpo.nome, 120),
    p_email: email,
    p_telefone: telefone,
    ...Object.fromEntries(Object.entries(utm).map(([campo, valor]) => [`p_${campo}`, valor])),
    p_pagina: texto(corpo.pagina, 500),
  });
  if (error) return NextResponse.json({ erro: "não foi possível registrar" }, { status: 500 });

  return NextResponse.json({ ok: true }, { status: 201 });
}
