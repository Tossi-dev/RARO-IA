import { describe, expect, it } from "vitest";
import { reguaDe } from "./inadimplencia";

const cobranca = (overrides: Record<string, unknown> = {}) => ({
  id: "c-1",
  mentoradoNome: "Ana",
  vencimento: "2026-08-10",
  status: "aberta",
  envios: [],
  ...overrides,
});

describe("reguaDe", () => {
  it("sugere D-3 e os degraus de atraso no dia exato", () => {
    expect(reguaDe([cobranca({ vencimento: "2026-08-10" })], "2026-08-07").lembretes).toMatchObject([
      { cobrancaId: "c-1", degrau: "D-3" },
    ]);
    expect(reguaDe([cobranca({ vencimento: "2026-08-10" })], "2026-08-11").lembretes).toMatchObject([
      { degrau: "D+1" },
    ]);
    for (const [agora, degrau] of [
      ["2026-08-13", "D+3"],
      ["2026-08-17", "D+7"],
      ["2026-08-25", "D+15"],
    ] as const) {
      expect(reguaDe([cobranca()], agora).lembretes[0].degrau).toBe(degrau);
    }
  });

  it("não gera D+1 no próprio vencimento", () => {
    expect(reguaDe([cobranca()], "2026-08-10").lembretes).toEqual([]);
  });

  it("ignora cobranças pagas e canceladas", () => {
    expect(
      reguaDe(
        [cobranca({ id: "paga", status: "paga" }), cobranca({ id: "cancelada", status: "cancelada" })],
        "2026-08-11",
      ).lembretes,
    ).toEqual([]);
  });

  it("não repete um degrau já enviado e preserva outros degraus", () => {
    const r = reguaDe(
      [cobranca({ envios: [{ degrau: "D+1" }] })],
      "2026-08-11",
    );
    expect(r.lembretes).toEqual([]);
    expect(reguaDe([cobranca({ envios: [{ degrau: "D+1" }] })], "2026-08-13").lembretes[0].degrau).toBe("D+3");
  });

  it("manda vencimento inválido para inconsistentes", () => {
    const r = reguaDe([cobranca({ vencimento: "2026-02-30" })], "2026-08-11");
    expect(r.lembretes).toEqual([]);
    expect(r.inconsistentes).toContainEqual({ cobrancaId: "c-1", motivo: "vencimento-invalido" });
  });

  it("texto não usa emoji nem valor de outra cobrança", () => {
    const r = reguaDe([cobranca({ valor: 9700, mentoradoNome: "Ana 😊🇧🇷1️⃣👍🏽" })], "2026-08-11");
    expect(r.lembretes[0].texto).not.toMatch(/\p{Extended_Pictographic}/u);
    expect(r.lembretes[0].texto).not.toContain("🇧🇷");
    expect(r.lembretes[0].texto).not.toContain("\u20e3");
    expect(r.lembretes[0].texto).not.toContain("🏽");
    expect(r.lembretes[0].texto).not.toContain("9.700");
    expect(r.lembretes[0].texto).not.toContain("R$");
  });

  it("falha fechada quando agoraIso é inválido", () => {
    expect(reguaDe([cobranca()], "agora inválido")).toEqual({ lembretes: [], inconsistentes: [] });
  });

  it("aceita timestamp ISO sem deslocar a data civil", () => {
    expect(reguaDe([cobranca()], "2026-08-11T00:00:00.000Z").lembretes[0]).toMatchObject({
      cobrancaId: "c-1",
      degrau: "D+1",
    });
  });

  it("aceita a primeira data civil válida e recusa offset ISO impossível", () => {
    expect(reguaDe([cobranca({ vencimento: "0001-01-01" })], "0001-01-02").lembretes[0]).toMatchObject({
      degrau: "D+1",
    });
    expect(reguaDe([cobranca()], "2026-08-11T00:00+99:99")).toEqual({ lembretes: [], inconsistentes: [] });
  });
});
