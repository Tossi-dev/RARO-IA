import { describe, expect, it } from "vitest";
import { normalizarSinais } from "./sinais";

describe("normalizarSinais", () => {
  it("traduz o menos tipográfico do Nubank (U+2212) para o hífen ASCII", () => {
    // Este é O caso que originou o arquivo: o extrato do cliente vinha com
    // "−R$ 10,00" e entrava no sistema como +10,00. Um mês inteiro de conta
    // paga virava dinheiro recebido.
    expect(normalizarSinais("−R$ 10,00")).toBe("-R$ 10,00");
  });

  it("traduz as outras variantes que aparecem em export de planilha", () => {
    expect(normalizarSinais("–10")).toBe("-10"); // en dash
    expect(normalizarSinais("—10")).toBe("-10"); // em dash
    expect(normalizarSinais("‐10")).toBe("-10"); // hyphen tipográfico
    expect(normalizarSinais("﹣10")).toBe("-10"); // small hyphen-minus
    expect(normalizarSinais("－10")).toBe("-10"); // fullwidth hyphen-minus
    expect(normalizarSinais("＋10")).toBe("+10"); // fullwidth plus
  });

  it("não mexe no que já é ASCII", () => {
    expect(normalizarSinais("-10,00")).toBe("-10,00");
    expect(normalizarSinais("+1.000,00")).toBe("+1.000,00");
    expect(normalizarSinais("R$ 5,00")).toBe("R$ 5,00");
  });

  it("não estraga texto comum que contenha traço", () => {
    // Nome de estabelecimento com hífen normal não pode virar outra coisa.
    expect(normalizarSinais("PADARIA SAO JOSE - MATRIZ")).toBe("PADARIA SAO JOSE - MATRIZ");
  });
});
