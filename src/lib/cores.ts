// Cores do design system (Blueprint v3, Anexo A) — módulo NEUTRO.
// Precisa ficar fora de qualquer arquivo "use client": server components
// (ex.: o dashboard) importam este módulo diretamente, e um módulo
// "use client" não pode exportar dados consumidos no servidor
// (React Client Manifest → 500 em runtime).

import type { Agrupamento } from "./types";

/** Paleta categórica completa, em ordem de máxima separação. */
export const CORES_CATEGORICAS = [
  "#8D70FF",
  "#E4C077",
  "#46B6F0",
  "#35D6A0",
  "#FF7A5C",
  "#F5A524",
  "#E86FC4",
  "#6E7BF2",
] as const;

/**
 * Paleta oferecida ao usuário ao cadastrar um agrupamento — mesmos hex já
 * usados no resto do design system, sem inventar cor nova. Reaproveita
 * CORES_CATEGORICAS (separação máxima entre vizinhas) mais os dois tons que
 * o demo já usava para "mente" e "espirito".
 */
export const PALETA_AGRUPAMENTO = [...CORES_CATEGORICAS, "#46B6F0", "#9B7BFF"] as const;

/**
 * Cor de um agrupamento: a cadastrada, se existir; senão uma cor neutra
 * determinística derivada do próprio id (hash simples → índice na paleta).
 * Precisa ser determinística — nunca `Math.random()` — porque uma cor que
 * muda a cada carregamento destrói a leitura de um gráfico.
 */
export function corDoAgrupamento(id: string, agrupamentos: Agrupamento[]): string {
  const cadastrado = agrupamentos.find((a) => a.id === id);
  if (cadastrado) return cadastrado.cor;
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return CORES_CATEGORICAS[hash % CORES_CATEGORICAS.length];
}

export const CORES_FUNIL: Record<string, string> = {
  Potencial: "#E4C077",
  Novo: "#46B6F0",
  Recorrente: "#35D6A0",
  Inativo: "#E86FC4",
};

// ===== P1 — camada de caixa =====

/**
 * Cores semânticas do dinheiro. Regra de leitura do dono:
 * verde = entrou, magenta = saiu, violeta = saldo, ouro = ainda é promessa
 * (previsto/a vencer), laranja = alerta (atraso, saldo negativo, teto de chargeback).
 */
export const CORES_CAIXA: Record<
  "entrada" | "saida" | "saldo" | "previsto" | "alerta",
  string
> = {
  entrada: "#35D6A0",
  saida: "#E86FC4",
  saldo: "#8D70FF",
  previsto: "#E4C077",
  alerta: "#FF7A5C",
};

/**
 * Cor por categoria do plano de contas do fluxo de caixa direto.
 * As chaves espelham o tipo `CategoriaCaixa` (src/lib/types.ts); mantidas como
 * string para este módulo continuar neutro e sem dependência de tipos de domínio.
 */
export const CORES_CATEGORIA_CAIXA: Record<string, string> = {
  vendas: "#35D6A0",
  outras_receitas: "#6E7BF2",
  trafego: "#8D70FF",
  comissoes: "#E4C077",
  taxas_gateway: "#46B6F0",
  impostos: "#E86FC4",
  folha_prolabore: "#FF7A5C",
  saas_ferramentas: "#F5A524",
  producao_conteudo: "#9B7BFF",
  reembolsos: "#D55181",
  outros: "#6F6D7E",
};
