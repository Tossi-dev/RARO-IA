import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { lerUtm } from "@/lib/marketing/utm";
import { limitarCaptura } from "@/lib/marketing/rate-limit";
import { decisaoDeContato } from "@/lib/marketing/consentimento";

const CORPO_MAXIMO_BYTES = 200 * 1024;

function texto(valor: unknown, limite: number, minusculo = false): string {
  if (typeof valor !== "string") return "";
  const limpo = valor.replace(/\p{Cc}/gu, "").trim().slice(0, limite);
  return minusculo ? limpo.toLocaleLowerCase("pt-BR") : limpo;
}

function ipDaRequisicao(requisicao: Request): string {
  const encaminhado = requisicao.headers.get("x-vercel-forwarded-for") ?? requisicao.headers.get("x-forwarded-for");
  return texto(encaminhado?.split(",")[0], 64) || "desconhecido";
}

function clientePublico() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !chave) return null;
  return createClient(url, chave, { auth: { persistSession: false, autoRefreshToken: false } });
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

  const decisao = decisaoDeContato(corpo.consentimentoMarketing === true, corpo.cancelarMarketing === true);
  // Cancelar vence qualquer consentimento. Não há envio ativo e, por isso,
  // não registramos nem limitamos uma captura que a pessoa acabou de negar.
  if (corpo.cancelarMarketing === true) return new NextResponse(null, { status: 204 });
  if (!decisao.podeCapturar) return NextResponse.json({ erro: "consentimento necessário" }, { status: 403 });

  const permitido = await limitarCaptura(ipDaRequisicao(requisicao));
  if (permitido === null) return NextResponse.json({ erro: "serviço indisponível" }, { status: 503 });
  if (!permitido) {
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
