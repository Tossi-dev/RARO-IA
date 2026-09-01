import { describe, expect, it } from "vitest";
import { roteiroComercialDe } from "./roteiro-perguntas";

describe("roteiroComercialDe", () => {
  it("sem consentimento não gera roteiro para registrar informações pessoais", () => {
    expect(roteiroComercialDe(false)).toEqual([]);
  });

  it("com consentimento oferece perguntas abertas internas, sem pressão, resposta pronta ou envio", () => {
    const roteiro = roteiroComercialDe(true);
    expect(roteiro).toHaveLength(4);
    expect(roteiro.every((pergunta) => pergunta.endsWith("?"))).toBe(true);
    const texto = roteiro.join(" ").toLowerCase();
    expect(texto).not.toMatch(/compre agora|última chance|você deve|garantimos|whatsapp|e-mail/);
  });
});
