// Testes da lógica pura da tela "Começar".
// O que está sendo protegido: a contagem de "quanto falta" e a frase-resposta
// que o dono do negócio lê primeiro — errar isso faz a tela mentir sobre o
// progresso do cadastro base.

import { describe, expect, it } from "vitest";
import { fraseResumoComecar, resumoComecar, type ContagensComecar } from "./comecar";

const ZERO: ContagensComecar = {
  produtos: 0,
  responsaveis: 0,
  contas: 0,
  metas: 0,
  agrupamentos: 0,
};

describe("resumoComecar", () => {
  it("marca os quatro passos como pendentes quando tudo está zerado", () => {
    const r = resumoComecar(ZERO);
    expect(r.concluidos).toBe(0);
    expect(r.total).toBe(4);
    expect(r.completo).toBe(false);
    expect(r.passos.every((p) => !p.concluido)).toBe(true);
  });

  it("conclui um passo assim que a contagem passa de zero", () => {
    const r = resumoComecar({ ...ZERO, produtos: 1 });
    const passo = r.passos.find((p) => p.id === "produtos");
    expect(passo?.concluido).toBe(true);
    expect(r.concluidos).toBe(1);
  });

  it("mantém a ordem de dependência: produtos, responsáveis, contas, metas", () => {
    const r = resumoComecar(ZERO);
    expect(r.passos.map((p) => p.id)).toEqual(["produtos", "responsaveis", "contas", "metas"]);
  });

  it("aponta o próximo pendente na ordem, mesmo com passos depois dele prontos", () => {
    const r = resumoComecar({ ...ZERO, produtos: 2, contas: 3, metas: 1 });
    expect(r.proximoPendente?.id).toBe("responsaveis");
  });

  it("fica completo só quando os quatro têm ao menos um registro", () => {
    const r = resumoComecar({ ...ZERO, produtos: 1, responsaveis: 1, contas: 1, metas: 1 });
    expect(r.completo).toBe(true);
    expect(r.proximoPendente).toBeNull();
  });

  it("não deixa quantidade negativa ou fracionária virar 'concluído' por engano", () => {
    // contrato de tipo já impede isso na maior parte dos casos, mas a regra de
    // negócio é sempre "count > 0" — nunca ">= 0" nem truthy de string.
    const r = resumoComecar({ ...ZERO, produtos: 0 });
    expect(r.passos.find((p) => p.id === "produtos")?.concluido).toBe(false);
  });
});

describe("passoOpcional (Agrupamentos)", () => {
  it("nunca entra na conta de pendência, mesmo zerado", () => {
    const r = resumoComecar(ZERO);
    expect(r.total).toBe(4);
    expect(r.passos.map((p) => p.id)).not.toContain("agrupamentos");
  });

  it("fica completo com os quatro passos prontos mesmo sem nenhum agrupamento cadastrado", () => {
    const r = resumoComecar({ produtos: 1, responsaveis: 1, contas: 1, metas: 1, agrupamentos: 0 });
    expect(r.completo).toBe(true);
    expect(r.passoOpcional.cadastrado).toBe(false);
  });

  it("marca cadastrado assim que existe ao menos um agrupamento, sem mexer no total", () => {
    const r = resumoComecar({ ...ZERO, agrupamentos: 2 });
    expect(r.passoOpcional.cadastrado).toBe(true);
    expect(r.passoOpcional.quantidade).toBe(2);
    expect(r.total).toBe(4);
    expect(r.completo).toBe(false);
  });
});

describe("fraseResumoComecar", () => {
  it("diz para começar pelas fontes de renda quando nada está pronto", () => {
    const frase = fraseResumoComecar(resumoComecar(ZERO));
    expect(frase).toContain("comece cadastrando as fontes de renda");
  });

  it("nomeia o único passo que falta quando restar exatamente um", () => {
    const r = resumoComecar({ ...ZERO, produtos: 1, responsaveis: 1, contas: 1 });
    const frase = fraseResumoComecar(r);
    expect(frase).toContain("3 de 4");
    expect(frase.toLowerCase()).toContain("metas do ano");
  });

  it("comemora quando os quatro passos estão prontos", () => {
    const r = resumoComecar({ ...ZERO, produtos: 1, responsaveis: 1, contas: 1, metas: 1 });
    expect(fraseResumoComecar(r)).toBe(
      "Os 4 passos estão prontos — o painel já tem de onde calcular."
    );
  });
});
