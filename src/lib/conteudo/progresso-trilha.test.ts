// Testes de `progressoDaTrilha` e `temDireitoAoCertificado`.
//
// O QUE ESTA SUÍTE PROVA
// ----------------------
// 1) TRILHA SEM AULA NÃO TEM PERCENTUAL. `pct: null`, nunca `0` — zero por
//    cento lê como "não começou" para quem não tem nada a começar, e é a
//    mesma classe de mentira do score que este projeto já removeu do painel
//    ("sem base para calcular", nunca um número redondo sobre denominador
//    vazio);
// 2) MARCA ÓRFÃ NÃO INFLA O NUMERADOR. Uma marca de progresso apontando para
//    aula que não é desta trilha é ignorada — senão o mentorado apareceria com
//    12 de 10 aulas feitas;
// 3) O CERTIFICADO EXIGE AS DUAS CONTAS: 100% das aulas liberadas E 100% das
//    totais. Certificado com aula ainda por liberar é certificado de trilha
//    incompleta, e o papel diria o contrário.

import { describe, expect, it } from "vitest";
import {
  progressoDaTrilha,
  temDireitoAoCertificado,
  type MarcaDeProgresso,
} from "./progresso-trilha";
import type { AulaLiberada } from "./liberacao";

function aula(id: string, liberada: boolean): AulaLiberada {
  return {
    id,
    liberada,
    abreEm: "2026-08-01T03:00:00.000Z",
    abreNoDia: "2026-08-01",
    diasQueFaltam: liberada ? 0 : 3,
    motivo: liberada ? "" : "abre em 04/08/2026",
  };
}

function marca(aulaId: string, concluida = true): MarcaDeProgresso {
  return { aulaId, concluida };
}

describe("progressoDaTrilha", () => {
  it("trilha sem aula nenhuma devolve pct null — nunca 0", () => {
    const r = progressoDaTrilha([], []);

    expect(r.total).toBe(0);
    expect(r.concluidas).toBe(0);
    expect(r.pct).toBeNull();
    // A asserção que dá nome ao teste: 0 leria como "não começou".
    expect(r.pct).not.toBe(0);
  });

  it("trilha com aulas e nenhuma marca é 0% de verdade — aí o zero é honesto", () => {
    const r = progressoDaTrilha([aula("a", true), aula("b", true)], []);

    expect(r.total).toBe(2);
    expect(r.concluidas).toBe(0);
    expect(r.pct).toBe(0);
  });

  it("conta as concluídas e arredonda o percentual", () => {
    const aulas = [aula("a", true), aula("b", true), aula("c", true)];
    const r = progressoDaTrilha(aulas, [marca("a"), marca("b")]);

    expect(r.concluidas).toBe(2);
    expect(r.total).toBe(3);
    expect(r.pct).toBe(67);
  });

  it("marca de aula que não é desta trilha é ignorada", () => {
    const aulas = [aula("a", true), aula("b", true)];
    const r = progressoDaTrilha(aulas, [marca("a"), marca("de-outra-trilha"), marca("inventada")]);

    expect(r.concluidas).toBe(1);
    // O que este teste realmente impede: aparecer "3 de 2 aulas feitas".
    expect(r.concluidas).toBeLessThanOrEqual(r.total);
    expect(r.pct).toBe(50);
  });

  it("duas marcas para a mesma aula contam uma vez", () => {
    const aulas = [aula("a", true), aula("b", true)];
    const r = progressoDaTrilha(aulas, [marca("a"), marca("a"), marca("a")]);

    expect(r.concluidas).toBe(1);
    expect(r.pct).toBe(50);
  });

  it("marca com concluida:false não conta, mesmo existindo a linha", () => {
    // A linha de progresso existe (o mentorado marcou e depois desmarcou),
    // e o que vale é o estado, não a existência do registro.
    const aulas = [aula("a", true), aula("b", true)];
    const r = progressoDaTrilha(aulas, [marca("a", false), marca("b", true)]);

    expect(r.concluidas).toBe(1);
  });

  it("aula que aparece duas vezes na lista não conta em dobro", () => {
    const r = progressoDaTrilha([aula("a", true), aula("a", true)], [marca("a")]);

    expect(r.total).toBe(1);
    expect(r.concluidas).toBe(1);
    expect(r.pct).toBe(100);
  });

  it("conta TODAS as aulas no total, liberadas ou não", () => {
    // O denominador é a trilha inteira. Contar só as liberadas mostraria
    // "100% concluído" para quem fez as duas primeiras de dez.
    const r = progressoDaTrilha([aula("a", true), aula("b", false), aula("c", false)], [marca("a")]);

    expect(r.total).toBe(3);
    expect(r.concluidas).toBe(1);
    expect(r.pct).toBe(33);
  });
});

describe("temDireitoAoCertificado", () => {
  it("todas as aulas liberadas e todas concluídas: tem direito", () => {
    const aulas = [aula("a", true), aula("b", true)];

    expect(temDireitoAoCertificado(aulas, [marca("a"), marca("b")])).toBe(true);
  });

  // O CASO QUE DÁ NOME À FUNÇÃO. Fez tudo o que estava aberto, mas a trilha
  // ainda tem aula por liberar: o papel diria "concluiu a trilha", e seria
  // mentira.
  it("todas as LIBERADAS feitas, mas ainda há aula por liberar: NÃO tem direito", () => {
    const aulas = [aula("a", true), aula("b", true), aula("c", false)];

    expect(temDireitoAoCertificado(aulas, [marca("a"), marca("b")])).toBe(false);
  });

  it("todas as aulas liberadas, mas uma sem concluir: não tem direito", () => {
    const aulas = [aula("a", true), aula("b", true)];

    expect(temDireitoAoCertificado(aulas, [marca("a")])).toBe(false);
  });

  // Só é possível marcar aula liberada, então este é um estado que não
  // deveria existir. Se existir, a trilha ainda não está completa.
  it("aula não liberada mas marcada como feita não dá direito ao certificado", () => {
    const aulas = [aula("a", true), aula("b", false)];

    expect(temDireitoAoCertificado(aulas, [marca("a"), marca("b")])).toBe(false);
  });

  it("trilha sem aula nenhuma NÃO dá certificado", () => {
    // Vacuamente "100% concluída" — e um certificado de trilha vazia é o
    // documento mais fácil de emitir e o mais difícil de explicar.
    expect(temDireitoAoCertificado([], [])).toBe(false);
    expect(temDireitoAoCertificado([], [marca("qualquer")])).toBe(false);
  });

  // Este teste existe por causa de um mutante que sobreviveu: comparar as
  // concluídas com `aulas.filter(liberada).length` em vez de com o `total`
  // deduplicado dá o mesmo resultado em toda lista sã, e só diverge quando a
  // mesma aula aparece duas vezes. A conta certa é sobre aulas DISTINTAS.
  it("aula repetida na lista não impede o certificado", () => {
    const aulas = [aula("a", true), aula("a", true), aula("b", true)];

    expect(temDireitoAoCertificado(aulas, [marca("a"), marca("b")])).toBe(true);
  });

  it("marca órfã não compra certificado", () => {
    const aulas = [aula("a", true), aula("b", true)];

    expect(temDireitoAoCertificado(aulas, [marca("a"), marca("de-outra-trilha")])).toBe(false);
  });
});
