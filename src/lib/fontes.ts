// Fontes de renda — módulo NEUTRO (sem "use client", sem next/headers).
// Categoriza produtos/serviços vendidos, independente de braço ou lançamento:
// um produto pode migrar de "curso" para "assinatura" sem mudar de braço.

export type CategoriaFonte =
  | "curso"
  | "mentoria"
  | "servico"
  | "produto"
  | "assinatura"
  | "evento";

/** Ordem de exibição em filtros e legendas — do mais recorrente ao mais raro no negócio. */
export const CATEGORIAS_FONTE: readonly CategoriaFonte[] = [
  "curso",
  "mentoria",
  "servico",
  "produto",
  "assinatura",
  "evento",
] as const;

export const CATEGORIA_FONTE_LABEL: Record<CategoriaFonte, string> = {
  curso: "Curso",
  mentoria: "Mentoria",
  servico: "Serviço",
  produto: "Produto",
  assinatura: "Assinatura",
  evento: "Evento",
};

/** Frase curta para quem não é da área — usada em tooltip/glossário. */
export const CATEGORIA_FONTE_DESCRICAO: Record<CategoriaFonte, string> = {
  curso: "Conteúdo gravado ou ao vivo, com trilha e prazo definidos, vendido uma vez por aluno.",
  mentoria: "Acompanhamento próximo, individual ou em grupo pequeno, cobrado pelo tempo do mentor.",
  servico: "Entrega sob demanda feita pela equipe para o cliente, fora do formato de curso.",
  produto: "Item físico ou digital avulso, sem trilha de aulas nem acompanhamento contínuo.",
  assinatura: "Cobrança recorrente que dá acesso contínuo a conteúdo, comunidade ou ferramenta.",
  evento: "Encontro pontual, presencial ou online, com data marcada e ingresso próprio.",
};

// Reaproveita hex já usados em CORES_CATEGORICAS (src/lib/cores.ts) — não inventa cor nova.
export const CORES_CATEGORIA_FONTE: Record<CategoriaFonte, string> = {
  curso: "#46B6F0",
  mentoria: "#8D70FF",
  servico: "#F5A524",
  produto: "#35D6A0",
  assinatura: "#6E7BF2",
  evento: "#E86FC4",
};

/** Valida entrada solta (form/URL/import) contra o enum; cai em "curso" quando inválida ou ausente. */
export function categoriaValida(v: string | undefined | null): CategoriaFonte {
  return (CATEGORIAS_FONTE as readonly string[]).includes(v ?? "")
    ? (v as CategoriaFonte)
    : "curso";
}
