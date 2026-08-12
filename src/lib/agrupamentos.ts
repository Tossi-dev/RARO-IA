// Utilitários puros sobre a lista de agrupamentos cadastrados pelo usuário.
// Módulo NEUTRO (sem "use client", sem next/headers): server components e
// client components importam os dois lados sem risco de vazar API de
// servidor ou de navegador pro lado errado.
//
// Agrupamento é CADASTRO OPCIONAL (ver `Agrupamento` em src/lib/types.ts):
// o usuário cria quantos quiser, com o nome e a cor que quiser — ou nenhum.
// `temAgrupamentos` é o portão que as telas usam para decidir se a seção
// "por agrupamento" aparece: sem cadastro, ela some, e não cai em três
// valores padrão esperando para aparecer de qualquer jeito.

import type { Agrupamento } from "./types";

/**
 * Id sentinela do bucket "sem agrupamento" nos agregados por agrupamento
 * (desempenhoPorBraco, serieBracos12m — metrics-comando.ts): responsável
 * cadastrado sem `braco` atribuído (célula `Braco` em branco na planilha).
 * Essa receita não pode desaparecer da conta só por não ter lente estrutural,
 * mas também não é nenhum agrupamento de verdade — por isso um id fixo, fora
 * do formato que os cadastros ganham (`AGR-N` na planilha, uuid no Supabase),
 * que nunca colide com um cadastro real do usuário.
 */
export const SEM_AGRUPAMENTO = "sem-agrupamento";

/** Só agrupamentos ativos contam para exibição, filtro e cálculo de participação. */
export function agrupamentosAtivos(lista: Agrupamento[]): Agrupamento[] {
  return lista.filter((a) => a.ativo);
}

/** Acha um agrupamento cadastrado pelo id; undefined se não existir (ou id vazio/nulo). */
export function acharAgrupamento(
  id: string | null | undefined,
  lista: Agrupamento[],
): Agrupamento | undefined {
  if (!id) return undefined;
  return lista.find((a) => a.id === id);
}

/** Ordena pela `ordem` cadastrada; empate cai no nome (ordem alfabética pt-BR). */
export function ordenarAgrupamentos(lista: Agrupamento[]): Agrupamento[] {
  return [...lista].sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, "pt-BR"));
}

/**
 * Nome do agrupamento pelo id, pronto para tela. Sem cadastro correspondente,
 * cai no próprio id (nunca deixa "undefined" vazar pra interface); id vazio
 * ou nulo vira travessão, o marcador padrão de "sem valor" no produto.
 */
export function rotularAgrupamento(id: string | null | undefined, lista: Agrupamento[]): string {
  if (!id) return "—";
  return acharAgrupamento(id, lista)?.nome ?? id;
}

/**
 * Portão de opcionalidade: toda tela com seção "por agrupamento" chama isto
 * para decidir se a seção existe. Sem nenhum agrupamento ATIVO cadastrado, a
 * seção não aparece — opcional de verdade, não opcional com três valores
 * padrão à espreita.
 */
export function temAgrupamentos(lista: Agrupamento[]): boolean {
  return agrupamentosAtivos(lista).length > 0;
}
