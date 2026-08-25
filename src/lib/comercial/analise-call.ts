export type CallParaAnalise = { transcricao: string };
export type OportunidadeParaAnalise = { titulo?: string; valorProposta?: string; telefone?: string };
export type RespostaAnaliseCall = { score: number | null; objecoes: string[]; sugestoes: string[]; parcial: boolean };

function semEmoji(texto: string): string {
  return texto.replace(/[\p{Extended_Pictographic}\p{Regional_Indicator}\p{Emoji_Modifier}\uFE0E\uFE0F\u200D\u20E3\u{E0020}-\u{E007F}]/gu, "");
}

function limparTranscricao(texto: string): string {
  return semEmoji(String(texto ?? ""))
    .replace(/\S+@\S+/g, "[contato removido]")
    .replace(/\+?\d[\d\s().-]{7,}\d/g, "[contato removido]")
    .replace(/R\$\s*[\d.,]+/gi, "[valor removido]")
    .replace(/\s+/g, " ")
    .trim();
}

/** Monta contexto mínimo da call atual; valores e contatos comerciais não entram no prompt. */
export function montarPrompt(call: CallParaAnalise, _oportunidade: OportunidadeParaAnalise): string {
  const transcricao = limparTranscricao(call.transcricao);
  return `Analise somente esta call comercial.\nTranscrição: ${transcricao}\nResponda nas seções SCORE, OBJEÇÕES e SUGESTÕES. SCORE deve ser um inteiro de 0 a 100; listas usam itens iniciados por hífen.`;
}

function lista(secao: string): string[] | null {
  const linhas = secao.split("\n").map((linha) => linha.trim()).filter(Boolean);
  if (linhas.some((linha) => !/^[-*]\s+.+$/.test(linha))) return null;
  return linhas.map((linha) => semEmoji(linha.replace(/^[-*]\s+/, "")).replace(/\s+/g, " ").trim()).filter(Boolean);
}

function scoreDe(texto: string | undefined): number | null {
  if (!texto || !/^\d+$/.test(texto.trim())) return null;
  const score = Number(texto.trim());
  return Number.isInteger(score) && score >= 0 && score <= 100 ? score : null;
}

/** Lê apenas as três seções esperadas; formato livre ou resposta vazia falha fechado. */
export function lerResposta(texto: string): RespostaAnaliseCall | null {
  if (typeof texto !== "string" || !texto.trim()) return null;
  const resposta = semEmoji(texto).replace(/\r/g, "").trim();
  const partes = /^(?:SCORE:[ \t]*(.*?)\n)?OBJEÇÕES:[ \t]*\n([\s\S]*?)SUGESTÕES:[ \t]*\n([\s\S]*)$/i.exec(resposta);
  if (!partes) return null;
  const objecoes = lista(partes[2]);
  const sugestoes = lista(partes[3]);
  if (objecoes === null || sugestoes === null) return null;
  const score = scoreDe(partes[1]);
  return { score, objecoes, sugestoes, parcial: score === null || objecoes.length === 0 || sugestoes.length === 0 };
}
