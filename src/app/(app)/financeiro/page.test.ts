import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const pagina = readFileSync(path.join(__dirname, "page.tsx"), "utf8");

describe("Financeiro — superfície de acompanhamento", () => {
  it("mantém a rastreabilidade financeira e declara a superfície visual", () => {
    expect(pagina).toContain('data-financeiro-workspace="true"');
    expect(pagina).toContain("origem={`dataset()");
    expect(pagina).toContain("Registrar nova despesa");
  });
});
