// Testes dos utilitários puros de agrupamento.
// O que está sendo protegido: agrupamento é cadastro OPCIONAL — sem nenhum
// cadastrado, `temAgrupamentos` tem que dizer "não" de verdade, e nada aqui
// pode assumir que "corpo", "mente" ou "espirito" existem.

import { describe, expect, it } from "vitest";
import {
  acharAgrupamento,
  agrupamentosAtivos,
  ordenarAgrupamentos,
  rotularAgrupamento,
  temAgrupamentos,
} from "./agrupamentos";
import type { Agrupamento } from "./types";

const CORPO: Agrupamento = { id: "corpo", nome: "Corpo", cor: "#FF7A5C", ordem: 1, ativo: true };
const MENTE: Agrupamento = { id: "mente", nome: "Mente", cor: "#46B6F0", ordem: 2, ativo: true };
const ESPIRITO: Agrupamento = {
  id: "espirito",
  nome: "Espírito",
  cor: "#9B7BFF",
  ordem: 3,
  ativo: false,
};

describe("agrupamentosAtivos", () => {
  it("devolve lista vazia quando não há nenhum agrupamento cadastrado", () => {
    expect(agrupamentosAtivos([])).toEqual([]);
  });

  it("filtra fora os inativos", () => {
    const r = agrupamentosAtivos([CORPO, MENTE, ESPIRITO]);
    expect(r.map((a) => a.id)).toEqual(["corpo", "mente"]);
  });
});

describe("acharAgrupamento", () => {
  it("acha pelo id", () => {
    expect(acharAgrupamento("mente", [CORPO, MENTE])?.nome).toBe("Mente");
  });

  it("devolve undefined para id não cadastrado", () => {
    expect(acharAgrupamento("qualquer-outra-coisa", [CORPO, MENTE])).toBeUndefined();
  });

  it("devolve undefined para id vazio ou nulo, sem lançar", () => {
    expect(acharAgrupamento("", [CORPO])).toBeUndefined();
    expect(acharAgrupamento(null, [CORPO])).toBeUndefined();
    expect(acharAgrupamento(undefined, [CORPO])).toBeUndefined();
  });
});

describe("ordenarAgrupamentos", () => {
  it("ordena pelo campo ordem", () => {
    const r = ordenarAgrupamentos([ESPIRITO, CORPO, MENTE]);
    expect(r.map((a) => a.id)).toEqual(["corpo", "mente", "espirito"]);
  });

  it("em caso de empate na ordem, cai no nome (pt-BR)", () => {
    const zebra: Agrupamento = { id: "z", nome: "Zebra", cor: "#000", ordem: 1, ativo: true };
    const abelha: Agrupamento = { id: "a", nome: "Abelha", cor: "#111", ordem: 1, ativo: true };
    const r = ordenarAgrupamentos([zebra, abelha]);
    expect(r.map((a) => a.nome)).toEqual(["Abelha", "Zebra"]);
  });

  it("não muta a lista original", () => {
    const original = [ESPIRITO, CORPO];
    ordenarAgrupamentos(original);
    expect(original.map((a) => a.id)).toEqual(["espirito", "corpo"]);
  });
});

describe("rotularAgrupamento", () => {
  it("devolve o nome cadastrado", () => {
    expect(rotularAgrupamento("corpo", [CORPO, MENTE])).toBe("Corpo");
  });

  it("sem cadastro, cai no próprio id em vez de sumir ou virar 'undefined'", () => {
    expect(rotularAgrupamento("id-desconhecido", [CORPO])).toBe("id-desconhecido");
  });

  it("id vazio ou nulo vira travessão", () => {
    expect(rotularAgrupamento(null, [CORPO])).toBe("—");
    expect(rotularAgrupamento(undefined, [CORPO])).toBe("—");
    expect(rotularAgrupamento("", [CORPO])).toBe("—");
  });
});

describe("temAgrupamentos", () => {
  it("é falso quando a lista está vazia — nada de três valores padrão à espreita", () => {
    expect(temAgrupamentos([])).toBe(false);
  });

  it("é falso quando só existem agrupamentos inativos", () => {
    expect(temAgrupamentos([ESPIRITO])).toBe(false);
  });

  it("é verdadeiro assim que existe ao menos um agrupamento ativo", () => {
    expect(temAgrupamentos([ESPIRITO, CORPO])).toBe(true);
  });
});
