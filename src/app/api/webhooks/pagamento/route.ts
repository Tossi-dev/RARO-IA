// Webhook de gateway de pagamento (Hotmart / Kiwify / Eduzz / Stripe) — Módulo J.
// P0: endpoint com validação de assinatura pronta; o PARSER específico do
// gateway entra quando o Jefson definir qual usa (decisão pendente).
//
// Fluxo alvo (Fase 0→1 do Blueprint v3):
//   gateway → POST aqui → valida secret → grava webhook_eventos (auditoria)
//   → mapeia produto externo → cria/atualiza matrícula ou reembolso.

import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const secret = process.env.WEBHOOK_SECRET;

  // Sem secret configurado = integração ainda não ativada (honesto, sem fingir).
  if (!secret) {
    return NextResponse.json(
      {
        erro: "Webhook ainda não configurado — aguardando definição do gateway de pagamento.",
        proximo_passo:
          "Definir gateway (Hotmart/Kiwify/Eduzz/Stripe), configurar WEBHOOK_SECRET e mapear o payload para matriculas/reembolsos.",
      },
      { status: 501 }
    );
  }

  // Validação de assinatura: header padrão + variantes comuns dos gateways.
  const assinatura =
    req.headers.get("x-webhook-secret") ??
    req.headers.get("x-hotmart-hottok") ??
    req.headers.get("x-kiwify-signature") ??
    "";
  if (assinatura !== secret) {
    return NextResponse.json({ erro: "Assinatura inválida." }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ erro: "Payload não é JSON válido." }, { status: 400 });
  }

  // TODO (ativação real): gravar em webhook_eventos (migração 0003) com o payload
  // bruto, mapear produto externo→interno e criar a matrícula/reembolso.
  // Mantido enxuto até a decisão do gateway para não inventar parser errado.
  return NextResponse.json({
    recebido: true,
    aviso: "Evento aceito. Parser específico do gateway será ativado após a definição (Hotmart/Kiwify/Eduzz/Stripe).",
    bytes: JSON.stringify(payload).length,
  });
}
