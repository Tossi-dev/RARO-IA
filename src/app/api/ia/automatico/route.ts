import { NextRequest, NextResponse } from "next/server";

function autorizado(request: NextRequest): boolean {
  const segredo = process.env.CRON_SECRET;
  return Boolean(segredo) && request.headers.get("authorization") === `Bearer ${segredo}`;
}

export async function GET(request: NextRequest) {
  if (!autorizado(request)) return NextResponse.json({ ligado: false, motivo: "cron não autorizado" }, { status: 401 });
  if (process.env.IA_AUTOMATICA !== "1") {
    return NextResponse.json({ ligado: false, motivo: "IA automática desligada; exige IA_AUTOMATICA=1." });
  }
  // O processamento permanece deliberadamente fora desta rota até haver
  // autorização operacional para chamar IA e banco em agendamento real.
  return NextResponse.json({ ligado: false, motivo: "gatilho automático ainda não autorizado para executar." }, { status: 503 });
}
