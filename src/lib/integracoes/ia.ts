// IA generativa (resumos, insights, roteiros) — Anthropic atrás de env.
// Sem ANTHROPIC_API_KEY → modo demo (textos canned, claramente marcados).
// Padrão herdado do LA Beauty: a chave NUNCA vai ao browser.

export interface RespostaIA {
  texto: string;
  provider: "anthropic" | "demo";
}

const MODELO = () => process.env.CLAUDE_MODEL || "claude-sonnet-4-6";

export function iaConfigurada(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function gerarTexto(prompt: string, system = ""): Promise<RespostaIA> {
  if (!iaConfigurada()) {
    return { texto: textoDemo(prompt), provider: "demo" };
  }
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODELO(),
      max_tokens: 1200,
      system:
        system ||
        "Você é o copiloto de gestão da Raro.ia. Responda em português do Brasil, direto e acionável.",
      messages: [{ role: "user", content: prompt.slice(0, 12000) }],
    }),
  });
  if (!r.ok) {
    const erro = await r.text();
    throw new Error(`Anthropic ${r.status}: ${erro.slice(0, 200)}`);
  }
  const data = (await r.json()) as { content?: { type: string; text?: string }[] };
  const texto = (data.content ?? [])
    .filter((b) => b.type === "text" && b.text)
    .map((b) => b.text)
    .join("\n")
    .trim();
  return { texto: texto || "(resposta vazia)", provider: "anthropic" };
}

export async function resumirTranscricao(texto: string): Promise<RespostaIA> {
  return gerarTexto(
    `Resuma a transcrição de call abaixo em até 6 bullets: decisões, dúvidas dos alunos, pendências e próximos passos.\n\n---\n${texto}`,
    "Você resume calls de mentoria para o gestor. Português do Brasil, bullets curtos e acionáveis."
  );
}

// Textos demo determinísticos por tipo de pedido
function textoDemo(prompt: string): string {
  const p = prompt.toLowerCase();
  if (p.includes("roteiro")) {
    return [
      "ROTEIRO SUGERIDO (demo — conecte a ANTHROPIC_API_KEY para gerar com IA real)",
      "",
      "GANCHO (0–3s): \"Você faz tudo certo e MESMO ASSIM não vê resultado? O problema não é o esforço.\"",
      "DESENVOLVIMENTO (3–35s): mostre o erro comum, 3 cortes rápidos do dia a dia real, 1 prova social de cliente com antes/depois.",
      "CTA (35–45s): \"Comenta AQUI que eu te mando o passo a passo gratuito.\"",
      "",
      "Padrões aplicados: gancho de contradição + prova social + CTA de comentário (maior alcance orgânico).",
    ].join("\n");
  }
  if (p.includes("resuma") || p.includes("transcrição") || p.includes("transcricao")) {
    return [
      "Resumo (demo — conecte a ANTHROPIC_API_KEY para resumo real):",
      "• Alinhamento geral da turma e revisão dos treinos da semana.",
      "• Dúvida recorrente: encaixe do protocolo na rotina de trabalho.",
      "• Pendência: 3 alunos com anamnese incompleta.",
      "• Próximo passo: call de acompanhamento individual agendada.",
    ].join("\n");
  }
  if (p.includes("copy") || p.includes("campanha")) {
    return [
      "COPY SUGERIDA (demo)",
      "Headline: \"O método que resolve isso de vez — em 30 dias.\"",
      "Corpo: dor → mecanismo único → prova → oferta.",
      "CTA: \"Quero meu diagnóstico\" (formulário de aplicação).",
    ].join("\n");
  }
  return "Análise (demo): conecte a ANTHROPIC_API_KEY no ambiente para gerar textos com IA real. Os dados desta tela continuam 100% funcionais.";
}
