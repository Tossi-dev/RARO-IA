// Transcrição de áudio (speech-to-text) — Groq Whisper atrás de env.
// Sem GROQ_API_KEY → modo demo (texto fixo, claramente marcado).

export interface ResultadoTranscricao {
  texto: string;
  provider: "groq" | "demo";
}

export function sttConfigurado(): boolean {
  return Boolean(process.env.GROQ_API_KEY);
}

export async function transcreverAudio(
  arquivo: Blob,
  nomeArquivo = "audio.mp3"
): Promise<ResultadoTranscricao> {
  if (!sttConfigurado()) {
    return {
      provider: "demo",
      texto:
        "[TRANSCRIÇÃO DEMO — configure GROQ_API_KEY para transcrever áudio real]\n" +
        "Jefson: Pessoal, bem-vindos à call da turma. Hoje vamos revisar o protocolo da semana um. " +
        "Aluno: Minha dúvida é como encaixar os treinos com o trabalho em escala. " +
        "Jefson: Ótima pergunta — a regra é ancorar o treino no turno fixo e proteger o sono. " +
        "Dra. Helena: Sobre os exames, quem ainda não enviou, manda até sexta pra eu liberar o ajuste do plano.",
    };
  }
  const form = new FormData();
  form.append("file", arquivo, nomeArquivo);
  form.append("model", "whisper-large-v3");
  form.append("language", "pt");
  form.append("response_format", "json");

  const r = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    body: form,
  });
  if (!r.ok) {
    const erro = await r.text();
    throw new Error(`Groq ${r.status}: ${erro.slice(0, 200)}`);
  }
  const data = (await r.json()) as { text?: string };
  return { texto: (data.text ?? "").trim(), provider: "groq" };
}
