export type SessaoParaAnalise = { resumo: string };
export type MentoradoParaAnalise = { nome: string; telefone?: string; email?: string; valorContrato?: string };
export type HistoricoResumido = { mentoradoNome: string; resumo: string };
export type RespostaAnaliseSessao = { pontosFortes: string[]; riscos: string[]; recomendacoes: string[] };

const LIMITE_PADRAO = 4_000;

function escaparRegex(texto: string): string { return texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function semEmoji(texto: string): string {
  return texto.replace(/[\p{Extended_Pictographic}\p{Regional_Indicator}\p{Emoji_Modifier}\uFE0E\uFE0F\u200D\u20E3\u{E0020}-\u{E007F}]/gu, "");
}

function limparContexto(texto: string, nomesProibidos: string[]): string {
  let limpo = semEmoji(String(texto ?? ""))
    .replace(/\S+@\S+/g, "[contato removido]")
    .replace(/\+?\d[\d\s().-]{7,}\d/g, "[contato removido]")
    .replace(/R\$\s*[\d.,]+/gi, "[valor removido]");
  for (const nome of nomesProibidos.filter(Boolean)) limpo = limpo.replace(new RegExp(escaparRegex(nome), "gi"), "[outra pessoa]");
  return limpo.replace(/@/g, "").replace(/\s+/g, " ").trim();
}

function cortarNoFim(texto: string, limite: number): string {
  if (texto.length <= limite) return texto;
  const corte = texto.slice(0, Math.max(0, limite));
  return corte.replace(/\s+\S*$/, "").trimEnd();
}

/** Monta contexto mínimo, sem contato, contrato ou histórico de outras pessoas. */
export function montarPrompt(
  sessao: SessaoParaAnalise,
  mentorado: MentoradoParaAnalise,
  historicoResumido: HistoricoResumido[],
  limite = LIMITE_PADRAO,
): string {
  const nome = limparContexto(mentorado.nome, []);
  const outrosNomes = historicoResumido.map((item) => item.mentoradoNome).filter((item) => item.trim().toLocaleLowerCase("pt-BR") !== nome.toLocaleLowerCase("pt-BR"));
  const resumoSessao = limparContexto(sessao.resumo, outrosNomes);
  const historicoDoMentorado = historicoResumido
    .filter((item) => item.mentoradoNome.trim().toLocaleLowerCase("pt-BR") === nome.toLocaleLowerCase("pt-BR"))
    .map((item) => limparContexto(item.resumo, outrosNomes))
    .filter(Boolean)
    .join(" ");
  const cabecalho = `Analise somente a evolução de ${nome}.\nSessão: ${resumoSessao}\n`;
  const corpo = `${historicoDoMentorado ? `Histórico resumido: ${historicoDoMentorado}\n` : ""}Responda exatamente nas seções PONTOS FORTES, RISCOS e RECOMENDAÇÕES, cada item em lista.`;
  return cortarNoFim(`${cabecalho}${corpo}`, Math.max(cabecalho.length, limite));
}

function lista(secao: string): string[] | null {
  const linhas = secao.split("\n").map((linha) => linha.trim());
  if (linhas.some((linha) => !/^[-*]\s+.+$/.test(linha))) return null;
  const itens = linhas
    .map((linha) => linha.match(/^[-*]\s+(.+)$/)?.[1]?.trim() ?? "")
    .map(semEmoji)
    .map((item) => item.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  return itens.length > 0 ? itens : null;
}

/** Lê apenas o formato completo e explícito produzido pelo prompt; qualquer desvio falha fechado. */
export function lerResposta(texto: string): RespostaAnaliseSessao | null {
  if (typeof texto !== "string" || !texto.trim()) return null;
  const resposta = semEmoji(texto).replace(/\r/g, "").trim();
  const partes = /^PONTOS FORTES:\s*\n([\s\S]+?)\nRISCOS:\s*\n([\s\S]+?)\nRECOMENDAÇÕES:\s*\n([\s\S]+)$/i.exec(resposta);
  if (!partes) return null;
  const pontosFortes = lista(partes[1]);
  const riscos = lista(partes[2]);
  const recomendacoes = lista(partes[3]);
  return pontosFortes && riscos && recomendacoes ? { pontosFortes, riscos, recomendacoes } : null;
}
