import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const texto = readFileSync(path.join(__dirname, "page.tsx"), "utf-8");

describe("termos públicos do MentorOS", () => {
  it("identifica o responsável e o canal de suporte sem inventar CNPJ", () => {
    expect(texto).toContain("Guilherme Oliveira Lima Tossi");
    expect(texto).toContain("guilhermetossi2@gmail.com");
    expect(texto).not.toContain("[PREENCHER:");
    expect(texto).not.toMatch(/CNPJ/i);
  });

  it("explica que o produto é apoio profissional e aponta para a política", () => {
    expect(texto).toMatch(/apoio.*profissional/i);
    expect(texto).toContain('href="/privacidade"');
  });
});
