import { describe, expect, it } from "vitest";
import { DIAS_DE_TESTE, acessoSaasLiberado, fimDoTeste } from "./estado";

describe("estado SaaS", () => {
  it("termina o teste exatamente em sete dias", () => {
    expect(fimDoTeste(new Date("2026-10-13T12:00:00.000Z")).toISOString()).toBe("2026-10-20T12:00:00.000Z");
    expect(DIAS_DE_TESTE).toBe(7);
  });

  it("libera teste antes do término e bloqueia no instante do vencimento", () => {
    const estado = { status: "teste" as const, terminaEm: "2026-10-20T12:00:00.000Z" };
    expect(acessoSaasLiberado(estado, new Date("2026-10-20T11:59:59.999Z"))).toBe(true);
    expect(acessoSaasLiberado(estado, new Date("2026-10-20T12:00:00.000Z"))).toBe(false);
  });

  it("não bloqueia workspace legado e falha fechada para estados inválidos", () => {
    expect(acessoSaasLiberado(null)).toBe(true);
    expect(acessoSaasLiberado({ status: "teste", terminaEm: "invalida" })).toBe(false);
    expect(acessoSaasLiberado({ status: "bloqueado", terminaEm: "2026-12-20T12:00:00.000Z" })).toBe(false);
    expect(acessoSaasLiberado({ status: "ativo", terminaEm: "invalida" })).toBe(true);
  });
});
