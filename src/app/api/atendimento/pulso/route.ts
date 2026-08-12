// POST /api/atendimento/pulso — o sinal de vida do agente local.
//
// No desenho escolhido o WhatsApp só funciona com o notebook do dono aberto.
// Uma tela que finge estar conectada quando não está é pior que tela nenhuma:
// o dono aprova mensagens que ficam paradas na fila achando que já saíram. Este
// endpoint existe para a tela poder dizer a verdade.
//
// O pulso é guardado em MEMÓRIA (ver lib/atendimento/pulso.ts): ele só vale por
// alguns minutos, e persistir cada batida encheria a planilha de linhas para
// representar um estado que ninguém vai querer ler amanhã.

import { NextResponse } from "next/server";
import type { PulsoAgente } from "@/lib/atendimento/contrato";
import { estadoDoAgente, registrarPulso } from "@/lib/atendimento/pulso";
import { conferirAgente, corpoJson } from "../porta";

export const dynamic = "force-dynamic";

function lerPulso(bruto: unknown): PulsoAgente {
  const p = (bruto ?? {}) as Record<string, unknown>;
  const visto = typeof p.visto === "string" && Number.isFinite(Date.parse(p.visto)) ? p.visto : "";
  return {
    // Sem `visto` legível, vale o instante em que a batida chegou: a mensagem
    // existe, e datá-la com o relógio do servidor é mais honesto do que
    // descartar o único sinal de vida que temos por causa do formato.
    visto: visto !== "" ? visto : new Date().toISOString(),
    sessaoAberta: p.sessaoAberta === true,
    precisaQr: p.precisaQr === true,
    versao: typeof p.versao === "string" ? p.versao.slice(0, 40) : "",
    // A string do QR, quando o agente está esperando leitura. É o que permite
    // a tela do CRM desenhar o código e a pessoa conectar sem abrir terminal
    // nenhum. O teto de tamanho existe porque este campo vem de fora: QR de
    // WhatsApp tem algumas centenas de caracteres, e nada legítimo chega perto
    // de 2000.
    ...(typeof p.qr === "string" && p.qr.trim() !== ""
      ? { qr: p.qr.slice(0, 2000) }
      : {}),
  };
}

export async function POST(req: Request) {
  const recusa = conferirAgente(req);
  if (recusa) return recusa;

  const bruto = await corpoJson(req);
  if (bruto === null) {
    return NextResponse.json({ erro: "Corpo não é JSON válido." }, { status: 400 });
  }

  registrarPulso(lerPulso(bruto));
  // Devolve o estado já interpretado para o agente conseguir conferir que o
  // servidor entendeu o que ele quis dizer (principalmente `precisaQr`).
  return NextResponse.json({ estado: estadoDoAgente(new Date()) });
}
