/**
 * Mapa voluntário usado pelo profissional para organizar uma conversa.
 *
 * As notas são autoavaliações informadas pelo cliente. Este módulo não calcula
 * risco, não interpreta saúde nem sugere uma decisão; ele só preserva o que
 * foi explicitamente registrado de forma válida.
 */

export const DIMENSOES_VIDA = [
  "espiritual",
  "familia_parentes",
  "casamento_conjuge",
  "filhos",
  "social",
  "saude",
  "servir",
  "intelectual",
  "financeiro",
  "profissional",
  "emocional",
] as const;

export type DimensaoVida = (typeof DIMENSOES_VIDA)[number];

export type MapaCliente = Readonly<{
  clienteId: string;
  dor?: string;
  medo?: string;
  objetivo?: string;
  notas: Readonly<Partial<Record<DimensaoVida, number>>>;
}>;

export type ResultadoValidacaoMapa =
  | Readonly<{ ok: true; valor: MapaCliente }>
  | Readonly<{ ok: false; erro: string }>;

export type EntradaMapaCliente = Readonly<{
  clienteId: unknown;
  dor?: unknown;
  medo?: unknown;
  objetivo?: unknown;
  notas?: Readonly<Record<string, unknown>>;
}>;

const LIMITE_TEXTO = 1000;

function textoDe(valor: unknown): string | null {
  if (valor === undefined || valor === null) return "";
  if (typeof valor !== "string") return null;
  return valor.replace(/\s+/g, " ").trim();
}

function erroTexto(nome: "dor" | "medo" | "objetivo", valor: unknown): string | null {
  const texto = textoDe(valor);
  if (texto === null) return `A ${nome} deve ser um texto.`;
  if (texto.length > LIMITE_TEXTO) return `A ${nome} deve ter no máximo ${LIMITE_TEXTO} caracteres.`;
  return null;
}

function ehDimensaoVida(valor: string): valor is DimensaoVida {
  return (DIMENSOES_VIDA as readonly string[]).includes(valor);
}

/** Valida a entrada sem preencher dimensões que o cliente não autoavaliou. */
export function validarMapaCliente(entrada: EntradaMapaCliente): ResultadoValidacaoMapa {
  const clienteId = textoDe(entrada.clienteId);
  if (!clienteId) return { ok: false, erro: "Informe o cliente do mapa." };

  for (const [nome, valor] of [
    ["dor", entrada.dor],
    ["medo", entrada.medo],
    ["objetivo", entrada.objetivo],
  ] as const) {
    const erro = erroTexto(nome, valor);
    if (erro) return { ok: false, erro };
  }

  const notas: Partial<Record<DimensaoVida, number>> = {};
  for (const [dimensao, nota] of Object.entries(entrada.notas ?? {})) {
    if (!ehDimensaoVida(dimensao)) {
      return { ok: false, erro: `A dimensão '${dimensao}' não pertence ao mapa do cliente.` };
    }
    if (typeof nota !== "number" || !Number.isInteger(nota) || nota < 0 || nota > 10) {
      return { ok: false, erro: `A nota de '${dimensao}' deve ser um inteiro de 0 a 10.` };
    }
    notas[dimensao] = nota;
  }

  const valor: {
    clienteId: string;
    dor?: string;
    medo?: string;
    objetivo?: string;
    notas: Partial<Record<DimensaoVida, number>>;
  } = { clienteId, notas };

  const dor = textoDe(entrada.dor);
  const medo = textoDe(entrada.medo);
  const objetivo = textoDe(entrada.objetivo);
  if (dor) valor.dor = dor;
  if (medo) valor.medo = medo;
  if (objetivo) valor.objetivo = objetivo;

  return { ok: true, valor };
}
