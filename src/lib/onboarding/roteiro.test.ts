// Testes de `estadoDoOnboarding` — o roteiro de entrada de um mentorado.
//
// O QUE ESTA SUÍTE PROVA
// ----------------------
// 1) `pct` é `null` quando não há etapa obrigatória, NUNCA 0. São coisas
//    diferentes: "não há o que cumprir" e "não cumpriu nada". Um 0% na tela
//    de quem acabou de entrar num roteiro vazio é uma acusação;
// 2) etapa inativa não conta em número nenhum — nem no denominador, nem nas
//    pendências, nem na próxima;
// 3) `concluido` olha só as OBRIGATÓRIAS: etapa opcional pendente não segura
//    o onboarding de ninguém;
// 4) responsável desconhecido cai no MENTOR. Fail-closed no sentido que
//    importa aqui: o pior caso é o time ver uma etapa a mais, nunca o cliente
//    receber uma tarefa que não é dele.

import { describe, expect, it } from "vitest";
import {
  estadoDoOnboarding,
  responsavelDaEtapa,
  type EtapaDeOnboarding,
  type MarcaDeOnboarding,
} from "./roteiro";

function etapa(over: Partial<EtapaDeOnboarding> = {}): EtapaDeOnboarding {
  return {
    id: "e1",
    ordem: 1,
    titulo: "Assinar o contrato",
    responsavel: "mentorado",
    obrigatoria: true,
    ativa: true,
    ...over,
  };
}

const feita = (etapaId: string): MarcaDeOnboarding => ({ etapaId, concluida: true });
const aberta = (etapaId: string): MarcaDeOnboarding => ({ etapaId, concluida: false });

const ids = (lista: EtapaDeOnboarding[]) => lista.map((e) => e.id);

describe("responsavelDaEtapa — fail-closed para o lado do time", () => {
  it("reconhece os dois valores do enum", () => {
    expect(responsavelDaEtapa("mentor")).toBe("mentor");
    expect(responsavelDaEtapa("mentorado")).toBe("mentorado");
  });

  it("qualquer outra coisa vira 'mentor'", () => {
    // A escolha do lado seguro: uma etapa com responsável ilegível aparece
    // para o time (que pode consertar) e não para o cliente (que receberia
    // uma tarefa que talvez não seja dele).
    for (const valor of ["", "MENTOR", " mentorado ", "aluno", null, undefined, 42, ["mentor"], {}]) {
      expect([valor, responsavelDaEtapa(valor)]).toEqual([valor, "mentor"]);
    }
  });
});

describe("estadoDoOnboarding — pct", () => {
  it("sem etapa nenhuma: pct é null, nunca 0", () => {
    const estado = estadoDoOnboarding([], []);
    expect(estado.pct).toBeNull();
    expect(estado.pct).not.toBe(0);
  });

  it("só etapa OPCIONAL: pct continua null — não há o que cumprir", () => {
    const estado = estadoDoOnboarding([etapa({ obrigatoria: false })], []);
    expect(estado.pct).toBeNull();
  });

  it("só etapa INATIVA: pct continua null", () => {
    const estado = estadoDoOnboarding([etapa({ ativa: false })], []);
    expect(estado.pct).toBeNull();
  });

  it("conta só as obrigatórias ativas, e arredonda para inteiro", () => {
    const estado = estadoDoOnboarding(
      [
        etapa({ id: "a" }),
        etapa({ id: "b", ordem: 2 }),
        etapa({ id: "c", ordem: 3 }),
        etapa({ id: "opcional", ordem: 4, obrigatoria: false }),
        etapa({ id: "inativa", ordem: 5, ativa: false }),
      ],
      [feita("a"), feita("opcional"), feita("inativa")],
    );

    // 1 de 3 obrigatórias ativas — as duas outras marcas não entram na conta.
    expect(estado.pct).toBe(33);
  });

  it("arredonda para o inteiro mais próximo, não para baixo", () => {
    // 2 de 3 é 66,67. `Math.floor` diria 66, e a diferença entre 66 e 67
    // parece nada — até a pessoa somar os passos na cabeça e não bater.
    const estado = estadoDoOnboarding(
      [etapa({ id: "a" }), etapa({ id: "b", ordem: 2 }), etapa({ id: "c", ordem: 3 })],
      [feita("a"), feita("b")],
    );
    expect(estado.pct).toBe(67);
  });

  it("tudo feito é 100, e nunca passa disso", () => {
    const estado = estadoDoOnboarding([etapa({ id: "a" }), etapa({ id: "b", ordem: 2 })], [feita("a"), feita("b")]);
    expect(estado.pct).toBe(100);
  });

  it("marca duplicada não empurra o número para cima", () => {
    // O banco tem `unique (mentorado_id, etapa_id)`; isto é a rede para dado
    // que chegar por outro caminho.
    const estado = estadoDoOnboarding([etapa({ id: "a" }), etapa({ id: "b", ordem: 2 })], [feita("a"), feita("a")]);
    expect(estado.pct).toBe(50);
  });
});

describe("estadoDoOnboarding — o que é ignorado", () => {
  it("progresso apontando para etapa inexistente é ignorado", () => {
    const estado = estadoDoOnboarding([etapa({ id: "a" })], [feita("fantasma")]);
    expect(estado.pct).toBe(0);
    expect(estado.concluido).toBe(false);
  });

  it("etapa inativa não aparece em pendência nenhuma, nem como próxima", () => {
    const estado = estadoDoOnboarding(
      [etapa({ id: "viva", ordem: 2 }), etapa({ id: "morta", ordem: 1, ativa: false })],
      [],
    );

    expect(ids(estado.pendentesDoMentorado)).toEqual(["viva"]);
    expect(estado.proximaEtapa?.id).toBe("viva");
  });

  it("marca de etapa inativa não conta como concluída", () => {
    const estado = estadoDoOnboarding(
      [etapa({ id: "viva" }), etapa({ id: "morta", ordem: 2, ativa: false })],
      [feita("morta")],
    );
    expect(estado.pct).toBe(0);
  });

  it("marca com `concluida: false` é o mesmo que não ter marca", () => {
    const estado = estadoDoOnboarding([etapa({ id: "a" })], [aberta("a")]);
    expect(estado.pct).toBe(0);
    expect(ids(estado.pendentesDoMentorado)).toEqual(["a"]);
  });

  it("entrada que não é lista não quebra e devolve o estado vazio", () => {
    expect(estadoDoOnboarding(null as never, []).pct).toBeNull();
    expect(estadoDoOnboarding([etapa()], null as never).pendentesDoMentorado).toHaveLength(1);
  });
});

describe("estadoDoOnboarding — proximaEtapa", () => {
  it("é a de menor `ordem` ainda pendente", () => {
    const estado = estadoDoOnboarding(
      [etapa({ id: "terceira", ordem: 3 }), etapa({ id: "primeira", ordem: 1 }), etapa({ id: "segunda", ordem: 2 })],
      [feita("primeira")],
    );
    expect(estado.proximaEtapa?.id).toBe("segunda");
  });

  it("empate de ordem é resolvido pelo título, de forma estável", () => {
    const estado = estadoDoOnboarding(
      [etapa({ id: "z", ordem: 1, titulo: "Zebra" }), etapa({ id: "a", ordem: 1, titulo: "Arara" })],
      [],
    );
    expect(estado.proximaEtapa?.id).toBe("a");
  });

  it("etapa OPCIONAL também pode ser a próxima — o roteiro é uma sequência", () => {
    const estado = estadoDoOnboarding(
      [etapa({ id: "opcional", ordem: 1, obrigatoria: false }), etapa({ id: "obrigatoria", ordem: 2 })],
      [],
    );
    expect(estado.proximaEtapa?.id).toBe("opcional");
  });

  it("nada pendente devolve null, e não a primeira da lista", () => {
    const estado = estadoDoOnboarding([etapa({ id: "a" })], [feita("a")]);
    expect(estado.proximaEtapa).toBeNull();
  });
});

describe("estadoDoOnboarding — as duas pendências", () => {
  it("separa por responsável, em ordem", () => {
    const estado = estadoDoOnboarding(
      [
        etapa({ id: "m2", ordem: 2, responsavel: "mentor" }),
        etapa({ id: "a1", ordem: 1, responsavel: "mentorado" }),
        etapa({ id: "m1", ordem: 3, responsavel: "mentor" }),
        etapa({ id: "feita", ordem: 4, responsavel: "mentorado" }),
      ],
      [feita("feita")],
    );

    expect(ids(estado.pendentesDoMentor)).toEqual(["m2", "m1"]);
    expect(ids(estado.pendentesDoMentorado)).toEqual(["a1"]);
  });

  it("responsável desconhecido entra na lista do MENTOR, nunca na do mentorado", () => {
    const estado = estadoDoOnboarding([etapa({ id: "torta", responsavel: "quem-sabe" })], []);

    expect(ids(estado.pendentesDoMentor)).toEqual(["torta"]);
    expect(estado.pendentesDoMentorado).toEqual([]);
  });

  it("não muta a lista recebida", () => {
    const original = [etapa({ id: "b", ordem: 2 }), etapa({ id: "a", ordem: 1 })];
    const copia = [...original];
    estadoDoOnboarding(original, []);
    expect(original).toEqual(copia);
  });
});

describe("estadoDoOnboarding — concluido", () => {
  it("todas as obrigatórias feitas: concluído, mesmo com opcional pendente", () => {
    const estado = estadoDoOnboarding(
      [etapa({ id: "a" }), etapa({ id: "opcional", ordem: 2, obrigatoria: false })],
      [feita("a")],
    );

    expect(estado.concluido).toBe(true);
    expect(estado.pct).toBe(100);
    // A opcional continua aparecendo como pendente — concluído não é o mesmo
    // que "não há mais nada a fazer".
    expect(ids(estado.pendentesDoMentorado)).toEqual(["opcional"]);
  });

  it("uma obrigatória pendente segura tudo", () => {
    const estado = estadoDoOnboarding([etapa({ id: "a" }), etapa({ id: "b", ordem: 2 })], [feita("a")]);
    expect(estado.concluido).toBe(false);
  });

  it("roteiro sem obrigatória NENHUMA não é 'concluído'", () => {
    // Dizer que alguém concluiu um roteiro vazio é afirmar uma coisa que
    // ninguém verificou. Mesma escolha de `temDireitoAoCertificado` para a
    // trilha sem aula.
    expect(estadoDoOnboarding([], []).concluido).toBe(false);
    expect(estadoDoOnboarding([etapa({ obrigatoria: false })], []).concluido).toBe(false);
    expect(estadoDoOnboarding([etapa({ ativa: false })], []).concluido).toBe(false);
  });
});
