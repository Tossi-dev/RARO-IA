import { describe, expect, it } from "vitest";
import { parcelasDe } from "./recorrencia";

describe("parcelasDe", () => {
  it("vence no último dia possível quando o dia escolhido não existe no mês", () => {
    expect(
      parcelasDe({ inicio: "2024-04-15", periodicidade: "mensal", quantidade: 1, valor: 100, diaVencimento: 31 }),
    ).toEqual([
      { competencia: "2024-04-01", vencimento: "2024-04-30", valor: 100, valorCentavos: 10000 },
    ]);
  });

  it("trata fevereiro em ano comum e bissexto", () => {
    expect(
      parcelasDe({ inicio: "2023-02-10", periodicidade: "mensal", quantidade: 1, valor: 1, diaVencimento: 31 }),
    ).toMatchObject([{ competencia: "2023-02-01", vencimento: "2023-02-28" }]);
    expect(
      parcelasDe({ inicio: "2024-02-10", periodicidade: "mensal", quantidade: 1, valor: 1, diaVencimento: 31 }),
    ).toMatchObject([{ competencia: "2024-02-01", vencimento: "2024-02-29" }]);
  });

  it("falha fechada para quantidade, data ou periodicidade inválidas", () => {
    const base = { inicio: "2024-01-15", periodicidade: "mensal", quantidade: 1, valor: 10, diaVencimento: 10 };

    expect(parcelasDe({ ...base, quantidade: 0 })).toEqual([]);
    expect(parcelasDe({ ...base, quantidade: -1 })).toEqual([]);
    expect(parcelasDe({ ...base, inicio: "2024-02-30" })).toEqual([]);
    expect(parcelasDe({ ...base, inicio: "início inválido" })).toEqual([]);
    expect(parcelasDe({ ...base, periodicidade: "quinzenal" })).toEqual([]);
  });

  it("recusa fração menor que um centavo e quantidade não segura", () => {
    const base = { inicio: "2024-01-15", periodicidade: "mensal", quantidade: 1, valor: 10, diaVencimento: 10 };

    expect(parcelasDe({ ...base, valor: 10.075 })).toEqual([]);
    expect(parcelasDe({ ...base, quantidade: Number.MAX_SAFE_INTEGER + 1 })).toEqual([]);
    expect(parcelasDe({ ...base, quantidade: 1201 })).toEqual([]);
    expect(parcelasDe({ ...base, quantidade: 4_294_967_296 })).toEqual([]);
  });

  it("mantém o valor em centavos por doze parcelas", () => {
    const parcelas = parcelasDe({
      inicio: "2024-01-15",
      periodicidade: "mensal",
      quantidade: 12,
      valor: 10.01,
      diaVencimento: 15,
    });

    expect(parcelas).toHaveLength(12);
    expect(parcelas.every((parcela) => parcela.valor === 10.01 && parcela.valorCentavos === 1001)).toBe(true);
    expect(parcelas.reduce((total, parcela) => total + parcela.valorCentavos, 0)).toBe(12012);
  });

  it("gera meses civis sem deslocar competência por UTC", () => {
    expect(
      parcelasDe({ inicio: "2024-01-31", periodicidade: "mensal", quantidade: 3, valor: 20, diaVencimento: 31 }),
    ).toMatchObject([
      { competencia: "2024-01-01", vencimento: "2024-01-31" },
      { competencia: "2024-02-01", vencimento: "2024-02-29" },
      { competencia: "2024-03-01", vencimento: "2024-03-31" },
    ]);
  });
});
