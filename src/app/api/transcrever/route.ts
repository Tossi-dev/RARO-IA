// Upload de áudio → transcrição (Groq Whisper) → resumo (IA) → salva na reunião.
// Sem chaves, roda em modo demo (texto/resumo sinalizados como demonstração).

import { NextResponse } from "next/server";
import { getDB } from "@/lib/data";
import { guardarApi } from "@/lib/guarda-api";
import { resumirTranscricao } from "@/lib/integracoes/ia";
import { transcreverAudio } from "@/lib/integracoes/stt";

export const maxDuration = 60;

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB (limite do Whisper)

export async function POST(req: Request) {
  // Sem isto, no dia em que GROQ_API_KEY/ANTHROPIC_API_KEY entrarem em
  // produção, qualquer pessoa com o endereço passa a gastar o crédito do
  // dono — ver src/lib/guarda-api.ts para o porquê completo.
  const recusa = await guardarApi(req);
  if (recusa) return recusa;

  try {
    const form = await req.formData();
    const arquivo = form.get("audio");
    const reuniaoId = String(form.get("reuniaoId") ?? "");
    if (!(arquivo instanceof Blob) || !reuniaoId) {
      return NextResponse.json({ erro: "audio + reuniaoId obrigatórios" }, { status: 400 });
    }
    if (arquivo.size > MAX_BYTES) {
      return NextResponse.json({ erro: "arquivo acima de 25 MB" }, { status: 413 });
    }
    const nome = arquivo instanceof File ? arquivo.name : "audio.mp3";
    const t = await transcreverAudio(arquivo, nome);
    let resumo = "";
    try {
      resumo = (await resumirTranscricao(t.texto)).texto;
    } catch {
      resumo = "";
    }
    await getDB().addTranscricao({ reuniaoId, origem: "audio_ia", texto: t.texto, resumo });
    return NextResponse.json({ ok: true, provider: t.provider });
  } catch (e) {
    return NextResponse.json({ erro: (e as Error).message }, { status: 500 });
  }
}
