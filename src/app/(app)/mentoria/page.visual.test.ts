import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const fonte = readFileSync(new URL("./visao.tsx", import.meta.url), "utf8");
const bordaServidor = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const frame = readFileSync(new URL("../../../components/app-frame.tsx", import.meta.url), "utf8");

describe("/mentoria — contrato visual aprovado da T-122", () => {
  it("expõe a âncora visual e a estrutura principal da imagem", () => {
    expect(fonte).toContain('data-mentoria-visual="referencia-aprovada"');
    expect(fonte).toContain("lg:grid-cols-[1.7fr_.78fr]");
    expect(fonte).toContain("Mentorados");
    expect(fonte).toContain("Prioridades de atendimento");
    expect(fonte).toContain("Próximos atendimentos");
  });

  it("serializa para a interação somente os campos visíveis da carteira", () => {
    expect(bordaServidor).toContain("const carteiraVisual: CarteiraVisual");
    expect(bordaServidor).not.toContain("transcricao:");
    expect(bordaServidor).not.toContain("resumo:");
    expect(bordaServidor).not.toContain("linkGravacao:");
    expect(bordaServidor).not.toContain("telefone:");
    expect(bordaServidor).not.toContain("preco:");
  });

  it("preserva a exceção contratual da página inicial", () => {
    expect(frame).toContain('if (pathname === "/")');
    expect(frame).toContain('data-shell="launcher"');
    expect(frame).toContain('data-shell="interno"');
  });
});
