// Progresso de uma trilha, e o direito ao certificado.
//
// Módulo PURO: recebe as aulas já resolvidas por `aulasLiberadas`
// (`./liberacao.ts`) e as marcas de progresso já lidas do banco. Nada aqui
// consulta nada, e nada lê o relógio.
//
// POR QUE `pct` PODE SER `null`
// ------------------------------
// Trilha sem aula nenhuma não tem percentual. Devolver `0` seria dizer "não
// começou" para quem não tem o que começar — e a tela desenharia uma barra
// vazia, que é uma afirmação sobre o esforço da pessoa. É a mesma regra que
// tirou o score inventado do painel deste projeto: sem base, a resposta é
// "sem base", nunca um número redondo sobre denominador vazio.
//
// O denominador é a trilha INTEIRA, não só o que já foi liberado. Contar só as
// liberadas mostraria "100% concluído" para quem fez as duas primeiras aulas
// de dez — e a pessoa fecharia a tela achando que acabou.

import type { AulaLiberada } from "./liberacao";

export interface MarcaDeProgresso {
  aulaId: string;
  concluida: boolean;
}

export interface ProgressoDaTrilha {
  /** Quantas aulas a trilha tem, liberadas ou não. */
  total: number;
  /** Quantas dessas aulas estão concluídas. Nunca maior que `total`. */
  concluidas: number;
  /** 0 a 100, inteiro. `null` quando `total` é 0 — ver o cabeçalho. */
  pct: number | null;
}

/**
 * Os ids das aulas concluídas, considerando SÓ as aulas que pertencem à
 * lista recebida.
 *
 * Um `Set` faz três trabalhos de uma vez, e os três importam:
 *   - marca órfã (apontando para aula de outra trilha) não entra, então
 *     `concluidas` nunca passa de `total` — sem isso a tela mostraria
 *     "12 de 10 aulas feitas";
 *   - duas marcas para a mesma aula contam uma vez;
 *   - aula repetida na lista de entrada não conta em dobro.
 */
function idsConcluidos(
  aulas: readonly AulaLiberada[],
  marcas: readonly MarcaDeProgresso[],
): Set<string> {
  const daTrilha = new Set(aulas.map((a) => a.id));
  const feitas = new Set<string>();
  for (const marca of marcas) {
    // `concluida: false` é uma linha que existe e diz que NÃO está feita (o
    // mentorado marcou e depois desmarcou). O que vale é o estado, não a
    // existência do registro.
    if (marca.concluida && daTrilha.has(marca.aulaId)) feitas.add(marca.aulaId);
  }
  return feitas;
}

export function progressoDaTrilha(
  aulas: readonly AulaLiberada[],
  marcas: readonly MarcaDeProgresso[],
): ProgressoDaTrilha {
  const total = new Set(aulas.map((a) => a.id)).size;
  const concluidas = idsConcluidos(aulas, marcas).size;

  return {
    total,
    concluidas,
    pct: total === 0 ? null : Math.round((concluidas / total) * 100),
  };
}

/**
 * O mentorado concluiu a trilha inteira?
 *
 * Exige as DUAS contas, e a segunda é a que não é óbvia:
 *
 *   1. todas as aulas LIBERADAS estão concluídas;
 *   2. não sobrou aula por liberar.
 *
 * Só a primeira daria certificado a quem fez tudo o que estava aberto na
 * segunda semana de uma trilha de três meses. O papel diria "concluiu a
 * trilha", e seria mentira — uma mentira impressa, assinada e enviada, que é
 * a pior espécie.
 *
 * Trilha sem aula nenhuma NÃO dá certificado, apesar de satisfazer as duas
 * condições por vacuidade: certificado de trilha vazia é o documento mais
 * fácil de emitir e o mais difícil de explicar depois.
 */
export function temDireitoAoCertificado(
  aulas: readonly AulaLiberada[],
  marcas: readonly MarcaDeProgresso[],
): boolean {
  const { total, concluidas } = progressoDaTrilha(aulas, marcas);
  if (total === 0) return false;

  const faltaLiberar = aulas.some((a) => !a.liberada);
  if (faltaLiberar) return false;

  return concluidas === total;
}
