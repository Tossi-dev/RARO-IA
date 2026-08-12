// Filtro global persistente (Blueprint v3 §0.3, revisado): fonte de renda ×
// período. Parte CLIENT-SAFE (sem next/headers): tipos e presets, usados
// tanto pela topbar (client) quanto pelos server components. A leitura dos
// cookies vive em ./filtros-server (server-only).
//
// MUDANÇA DE EIXO — correção do erro de produto descrito no contrato desta
// obra: a lente global da topbar deixa de ser "braço" (posicionamento fixo
// de UM cliente, com só três valores possíveis) e passa a ser FONTE DE
// RENDA: "todos" mais uma pílula por produto ativo cadastrado. Serve pra ver
// o desempenho individual de cada produto/curso/lançamento e a participação
// dele na empresa — o que "braço" nunca serviu pra fazer fora daquele
// cliente.
//
// DECISÃO: `braco` SAIU de FiltroGlobal, não ficou como filtro secundário.
// A regra usada pra decidir (ver contrato): se nenhuma tela continua
// filtrando por agrupamento NA BARRA, ele sai — e depois que a lente global
// vira fonte, nenhuma tela filtra mais por agrupamento ali. Agrupamento
// virou cadastro opcional (src/lib/agrupamentos.ts); uma tela que precise
// filtrar por ele agora usa um filtro LOCAL da própria tela, não a lente
// global. Isso quebra temporariamente quem lia `filtro.braco` (dashboard,
// lançamentos, financeiro, metrics-comando) — esses agentes migram para
// `filtro.fonte`, que é o eixo novo.

import { rotularAgrupamento } from "./agrupamentos";

/** "todos" ou o id de um produto (fonte de renda) ativo cadastrado. */
export type FiltroFonte = string;

export interface FiltroGlobal {
  fonte: FiltroFonte;
  rangeDias: number; // 7 | 30 | 90 | 365
}

export const RANGES = [
  { dias: 7, rotulo: "7 dias" },
  { dias: 30, rotulo: "30 dias" },
  { dias: 90, rotulo: "90 dias" },
  { dias: 365, rotulo: "12 meses" },
] as const;

/**
 * Substitui o antigo `BRACO_LABEL` (Record fixo de três palavras): rótulo de
 * um agrupamento pelo id, a partir da lista cadastrada — não existe mais
 * lista fixa pra indexar. Lógica canônica mora em ./agrupamentos; reexportada
 * aqui porque telas que consomem a lente global também rotulam agrupamento
 * em textos de apoio (ex.: "filtrado por <nome>").
 */
export { rotularAgrupamento };
