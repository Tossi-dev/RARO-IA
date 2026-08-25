import { describe, expect, it } from "vitest";
import { resumoPatrimonial } from "./patrimonio";

describe("resumoPatrimonial", () => {
  it("lista vazia não inventa patrimônio nem alocação", () => {
    expect(resumoPatrimonial([], [])).toMatchObject({ total: null, alocacao: [], dividas: [] });
  });

  it("fecha os percentuais em 100,00 pela distribuição do centésimo restante", () => {
    const resumo = resumoPatrimonial([
      { classe: "reserva", valor: 1 },
      { classe: "investimento", valor: 1 },
      { classe: "veiculo", valor: 1 },
    ], []);

    expect(resumo.alocacao).toEqual([
      { classe: "investimento", valor: 1, percentual: 33.34 },
      { classe: "reserva", valor: 1, percentual: 33.33 },
      { classe: "veiculo", valor: 1, percentual: 33.33 },
    ]);
    expect(resumo.alocacao.reduce((soma, item) => soma + item.percentual, 0)).toBe(100);
  });

  it("mantém dívida separada e a desconta do total", () => {
    const resumo = resumoPatrimonial([{ classe: "imovel", valor: 1000 }, { classe: "divida", valor: -250 }], []);

    expect(resumo.total).toBe(750);
    expect(resumo.dividas).toEqual([{ classe: "divida", valor: -250 }]);
    expect(resumo.alocacao).toEqual([{ classe: "imovel", valor: 1000, percentual: 100 }]);
  });

  it("trata investimento negativo como dívida, fora da alocação", () => {
    const resumo = resumoPatrimonial([{ classe: "imovel", valor: 100 }], [{ nome: "Posição negativa", aportado: 100, valorAtual: -50 }]);

    expect(resumo.total).toBe(50);
    expect(resumo.dividas).toEqual([{ classe: "investimento", valor: -50 }]);
    expect(resumo.alocacao).toEqual([{ classe: "imovel", valor: 100, percentual: 100 }]);
  });

  it("aporte zero retorna rentabilidade nula, nunca número fabricado", () => {
    const resumo = resumoPatrimonial([], [{ nome: "Caixa", aportado: 0, valorAtual: 120 }]);

    expect(resumo.investimentos).toEqual([{ nome: "Caixa", aportado: 0, valorAtual: 120, rentabilidade: null }]);
    expect(resumo.investimentos[0].rentabilidade).not.toEqual(expect.any(Number));
  });
});
