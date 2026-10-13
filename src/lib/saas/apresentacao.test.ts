import { describe, expect, it } from "vitest";
import { resumoDoPrazo, statusEfetivoSaas } from "./apresentacao";

describe("resumoDoPrazo", () => {
  const agora = new Date("2026-10-13T12:00:00.000Z");
  it("mostra prazo do teste sem arredondar para baixo", () => {
    expect(resumoDoPrazo("teste", "2026-10-14T11:59:00.000Z", agora)).toBe("Seu teste termina em 1 dia.");
  });
  it("explica bloqueio e cancelamento sem esconder dados", () => {
    expect(resumoDoPrazo("bloqueado", "2026-10-01T00:00:00.000Z", agora)).toContain("dados continuam preservados");
    expect(resumoDoPrazo("cancelado", "2026-10-01T00:00:00.000Z", agora)).toContain("dados continuam preservados");
  });

  it("trata teste expirado como bloqueado também na tela de assinatura", () => {
    expect(statusEfetivoSaas("teste", "2026-10-10T12:00:00.000Z", agora)).toBe("bloqueado");
  });
});
