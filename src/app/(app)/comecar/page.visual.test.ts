import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const pagina = readFileSync(path.join(__dirname, "page.tsx"), "utf8").replace(/\s+/g, " ");

describe("Começar — referência aprovada", () => {
  it("apresenta a composição guiada aprovada antes dos formulários", () => {
    expect(pagina).toContain('data-comecar-visual="referencia-aprovada"');
    expect(pagina).toContain("Prepare seu espaço");
    expect(pagina).toContain("Seu progresso");
    expect(pagina).toContain("Por onde começar");
    expect(pagina).toContain("Acompanhamento");
    expect(pagina).toContain("Tour guiado");
    expect(pagina.indexOf('data-comecar-visual="referencia-aprovada"')).toBeLessThan(pagina.indexOf("<ComecarPassos"));
  });

  it("deriva as quatro etapas e o percentual, sem transportar a ilustração", () => {
    expect(pagina).toContain("const passos =");
    expect(pagina).toContain("const concluidos = passos.filter");
    expect(pagina).toContain("const percentual =");
    expect(pagina).toContain("Fontes de renda");
    expect(pagina).toContain("Pessoas responsáveis");
    expect(pagina).toContain("Contas e recebimentos");
    expect(pagina).toContain("Metas de operação");
    expect(pagina).not.toContain('>25%</');
    expect(pagina).not.toContain('>1 de 4 etapas de configuração concluída<');
  });

  it("mantém a configuração local e o tour como destinos seguros", () => {
    expect(pagina).toContain('proximoPasso?.id ?? "passos-cadastro"');
    expect(pagina).toContain('href="/tour"');
    expect(pagina).toContain('href="/painel"');
    expect(pagina).toContain('id="passos-cadastro"');
    expect(pagina).toContain("<ComecarPassos");
  });

  it("não esconde o aviso global quando a simulação estiver ligada", () => {
    expect(pagina).not.toContain('[data-faixa-simulacao] { display: none; }');
  });
});
