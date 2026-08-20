// Testes dos textos da página pública de certificado.

import { describe, expect, it } from "vitest";
import { dataPorExtensoBr } from "./textos";

describe("dataPorExtensoBr", () => {
  it("escreve por extenso, no fuso de São Paulo", () => {
    expect(dataPorExtensoBr("2026-08-19T14:00:00Z")).toBe("19 de agosto de 2026");
    expect(dataPorExtensoBr("2026-01-05T12:00:00Z")).toBe("5 de janeiro de 2026");
  });

  it("um instante da madrugada UTC é do dia ANTERIOR em São Paulo", () => {
    // 02:00 UTC do dia 20 são 23:00 do dia 19 em São Paulo. Cortar a string
    // em dez caracteres imprimiria o dia errado num documento.
    expect(dataPorExtensoBr("2026-08-20T02:00:00Z")).toBe("19 de agosto de 2026");
  });

  it("vira o ano corretamente na virada", () => {
    expect(dataPorExtensoBr("2027-01-01T02:00:00Z")).toBe("31 de dezembro de 2026");
  });

  it("entrada inválida vira vazio — nunca 'Invalid Date' impresso", () => {
    expect(dataPorExtensoBr("")).toBe("");
    expect(dataPorExtensoBr("nao é data")).toBe("");
    expect(dataPorExtensoBr(null)).toBe("");
    expect(dataPorExtensoBr(undefined)).toBe("");
    expect(dataPorExtensoBr(42)).toBe("");
  });
});
