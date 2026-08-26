import { DIMENSOES_VIDA, type DimensaoVida } from "./mapa-cliente";

export type OrigemReflexao = "cliente" | "profissional";
export type VisibilidadeReflexao = "privada_profissional" | "compartilhavel";

export type ContextoPerguntas = Readonly<{ dor?: string; medo?: string; objetivo?: string }>;

export type Reflexao = Readonly<{
  clienteId: string;
  texto: string;
  origem: OrigemReflexao;
  visibilidade: VisibilidadeReflexao;
}>;

export type EntradaReflexao = Readonly<{
  clienteId: unknown;
  texto: unknown;
  origem: unknown;
  visibilidade: unknown;
}>;

export type ResultadoReflexao = Readonly<{ ok: true; valor: Reflexao }> | Readonly<{ ok: false; erro: string }>;

const PERGUNTA_BASE: Readonly<Record<DimensaoVida, readonly string[]>> = {
  espiritual: ["O que tem sustentado seu senso de propósito nesta fase?", "Que prática gostaria de explorar com mais presença?"],
  familia_parentes: ["Que conversa familiar merece mais atenção neste momento?", "O que você gostaria de compreender melhor nessa relação?"],
  casamento_conjuge: ["O que você percebe na relação que gostaria de conversar com cuidado?", "Como seria uma pequena melhora observável nessa área?"],
  filhos: ["O que você gostaria de estar mais presente para perceber com seus filhos?", "Que mudança pequena faria diferença nesta semana?"],
  social: ["Que relação social você gostaria de fortalecer?", "O que torna essa conexão importante para você?"],
  saude: ["O que seu corpo tem sinalizado para você observar com mais atenção?", "Que cuidado possível você quer considerar nesta semana?"],
  servir: ["De que forma servir está presente nas suas escolhas hoje?", "O que faria esse valor aparecer de modo concreto?"],
  intelectual: ["Que assunto desperta sua curiosidade agora?", "Como você reconheceria que aprendeu algo relevante?"],
  financeiro: ["O que você percebe na sua relação com as escolhas financeiras?", "Que clareza você gostaria de construir antes da próxima decisão?"],
  profissional: ["O que você percebe no trabalho que merece ser explorado?", "Que mudança seria observável na sua rotina profissional?"],
  emocional: ["O que você percebe quando essa emoção aparece?", "O que ajudaria você a compreender melhor esse momento?"],
};

function textoDe(valor: unknown): string {
  return typeof valor === "string" ? valor.replace(/\s+/g, " ").trim() : "";
}

/** Sugestões abertas: o profissional decide se, quando e como usá-las. */
function ehDimensaoVida(valor: unknown): valor is DimensaoVida {
  return typeof valor === "string" && (DIMENSOES_VIDA as readonly string[]).includes(valor);
}

export function perguntasPara(dimensao: unknown, contexto: ContextoPerguntas = {}): readonly string[] {
  if (!ehDimensaoVida(dimensao)) return [];
  const perguntas = [...PERGUNTA_BASE[dimensao]];
  const objetivo = textoDe(contexto.objetivo);
  if (objetivo) perguntas.unshift(`Considerando o objetivo “${objetivo}”, o que parece mais importante explorar agora?`);
  return perguntas.slice(0, 5);
}

function ehOrigem(valor: unknown): valor is OrigemReflexao {
  return valor === "cliente" || valor === "profissional";
}

function ehVisibilidade(valor: unknown): valor is VisibilidadeReflexao {
  return valor === "privada_profissional" || valor === "compartilhavel";
}

/** Valida uma reflexão explícita sem inferir fatos a partir do seu texto. */
export function registrarReflexao(entrada: EntradaReflexao): ResultadoReflexao {
  const clienteId = textoDe(entrada.clienteId);
  const texto = textoDe(entrada.texto);
  if (!clienteId) return { ok: false, erro: "Informe o cliente da reflexão." };
  if (!texto) return { ok: false, erro: "Informe a reflexão." };
  if (texto.length > 2000) return { ok: false, erro: "A reflexão deve ter no máximo 2000 caracteres." };
  if (!ehOrigem(entrada.origem)) return { ok: false, erro: "Informe a origem da reflexão." };
  if (!ehVisibilidade(entrada.visibilidade)) return { ok: false, erro: "Informe a visibilidade da reflexão." };
  return { ok: true, valor: { clienteId, texto, origem: entrada.origem, visibilidade: entrada.visibilidade } };
}
