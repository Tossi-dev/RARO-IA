// Proxy de IA (Anthropic) — a chave nunca vai ao browser.
// Sem ANTHROPIC_API_KEY → resposta demo claramente marcada.

import { NextResponse } from "next/server";
import { guardarApi } from "@/lib/guarda-api";
import { gerarTexto } from "@/lib/integracoes/ia";

export async function POST(req: Request) {
  // Sem isto, no dia em que ANTHROPIC_API_KEY entrar em produção, qualquer
  // pessoa com o endereço passa a gastar o crédito do dono — ver
  // src/lib/guarda-api.ts para o porquê completo.
  const recusa = await guardarApi(req);
  if (recusa) return recusa;

  try {
    const body = (await req.json()) as { prompt?: string; system?: string };
    const prompt = (body.prompt ?? "").slice(0, 12000);
    if (!prompt.trim()) {
      return NextResponse.json({ erro: "prompt vazio" }, { status: 400 });
    }
    const r = await gerarTexto(prompt, body.system ?? "");
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
