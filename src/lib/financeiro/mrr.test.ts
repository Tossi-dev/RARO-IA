import { describe, expect, it } from "vitest";
import { arrDe, ltvDe, mrrDe } from "./mrr";

const cobranca = (overrides: Record<string, unknown> = {}) => ({
  id: "c-1",
  mentorado_id: "m-1",
  competencia: "2026-08-01",
  valor: 100.01,
  status: "aberta",
  ...overrides,
});

describe("mrrDe", () => {
  it("não inventa MRR quando não há cobrança", () => {
    expect(mrrDe([], "2026-08-01")).toMatchObject({ mrr: null, semBase: true });
  });

  it("soma somente a receita paga do mês em centavos", () => {
    const resultado = mrrDe(
      [
        cobranca({ id: "a", valor: 100.01 }),
        cobranca({ id: "b", mentorado_id: "m-2", valor: 49.99, status: "paga" }),
        cobranca({ id: "c", valor: 700, status: "cancelada" }),
        cobranca({ id: "d", valor: 800, status: "prevista" }),
        cobranca({ id: "e", valor: 900, competencia: "2026-07-01" }),
      ],
      "2026-08-01",
    );
    expect(resultado).toMatchObject({ mrr: 49.99, mrrCentavos: 4999, semBase: false });
  });

  it("reconcilia o MRR total com as linhas por mentorado", () => {
    const resultado = mrrDe(
      [cobranca({ mentorado_id: "m-1", valor: 100.01, status: "paga" }), cobranca({ mentorado_id: "m-2", valor: 49.99, status: "paga" })],
      "2026-08-01",
    );
    expect(resultado.porMentorado).toEqual([
      { mentoradoId: "m-1", mrr: 100.01, mrrCentavos: 10001 },
      { mentoradoId: "m-2", mrr: 49.99, mrrCentavos: 4999 },
    ]);
    expect(resultado.porMentorado.reduce((total, linha) => total + linha.mrrCentavos, 0)).toBe(resultado.mrrCentavos);
  });

  it("recusa mês inválido", () => {
    expect(mrrDe([cobranca()], "2026-02-30")).toMatchObject({ mrr: null, semBase: true });
  });
});

describe("arrDe", () => {
  it("não anualiza série com menos de três meses e explica o motivo", () => {
    const cobrancas = [cobranca({ competencia: "2026-07-01" }), cobranca({ competencia: "2026-08-01" })];
    expect(arrDe(cobrancas, "2026-08-01")).toMatchObject({ arr: null, semBase: true, motivo: "serie-insuficiente" });
  });

  it("anualiza o MRR quando a série tem pelo menos três meses", () => {
    const cobrancas = [
      cobranca({ competencia: "2026-06-01", status: "paga" }),
      cobranca({ competencia: "2026-07-01", status: "paga" }),
      cobranca({ competencia: "2026-08-01", status: "paga" }),
    ];
    expect(arrDe(cobrancas, "2026-08-01")).toMatchObject({ arr: 1200.12, arrCentavos: 120012, semBase: false });
  });

  it("não anualiza série com buraco ou cobrança sem valor válido", () => {
    expect(
      arrDe([cobranca({ competencia: "2026-05-01", status: "paga" }), cobranca({ competencia: "2026-07-01", status: "paga" }), cobranca({ competencia: "2026-08-01", status: "paga" })], "2026-08-01"),
    ).toMatchObject({ arr: null, semBase: true, motivo: "serie-insuficiente" });
    expect(
      arrDe([cobranca({ competencia: "2026-06-01", status: "paga" }), cobranca({ competencia: "2026-07-01", status: "paga", valor: Number.NaN }), cobranca({ competencia: "2026-08-01", status: "paga" })], "2026-08-01"),
    ).toMatchObject({ arr: null, semBase: true, motivo: "serie-insuficiente" });
  });

  it("falha fechada se a soma em centavos não for segura", () => {
    expect(
      mrrDe([cobranca({ status: "paga", valorCentavos: Number.MAX_SAFE_INTEGER }), cobranca({ status: "paga", valorCentavos: 1 })], "2026-08-01"),
    ).toMatchObject({ mrr: null, mrrCentavos: null, semBase: true });
  });
});

describe("ltvDe", () => {
  it("usa apenas receita paga e deixa sem pagamento como null", () => {
    const resultado = ltvDe(
      [{ id: "m-1" }, { id: "m-2" }],
      [cobranca({ mentorado_id: "m-1", valor: 100.01, status: "paga" }), cobranca({ mentorado_id: "m-1", valor: 50, status: "aberta" })],
    );
    expect(resultado.porMentorado).toEqual([
      { mentoradoId: "m-1", ltv: 100.01, ltvCentavos: 10001, semBase: false },
      { mentoradoId: "m-2", ltv: null, ltvCentavos: null, semBase: true },
    ]);
  });

  it("não recria LTV parcial depois de um overflow", () => {
    const resultado = ltvDe(
      [{ id: "m-1" }],
      [
        cobranca({ mentorado_id: "m-1", status: "paga", valorCentavos: Number.MAX_SAFE_INTEGER }),
        cobranca({ mentorado_id: "m-1", status: "paga", valorCentavos: 1 }),
        cobranca({ mentorado_id: "m-1", status: "paga", valorCentavos: 1 }),
      ],
    );
    expect(resultado.porMentorado).toEqual([
      { mentoradoId: "m-1", ltv: null, ltvCentavos: null, semBase: true },
    ]);
  });
});
