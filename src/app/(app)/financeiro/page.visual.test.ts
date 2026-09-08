import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const pagina = readFileSync(path.join(__dirname, "page.tsx"), "utf8").replace(/\s+/g, " ");

describe("Financeiro — referência aprovada", () => {
  it("apresenta sustentabilidade como apoio à jornada", () => {
    expect(pagina).toContain('data-financeiro-visual="referencia-aprovada"');
    expect(pagina).toContain("Sustentabilidade da operação");
    expect(pagina).toContain("O que sustenta a jornada");
    expect(pagina).toContain("Prioridades");
    expect(pagina).toContain("Visão por programa");
    expect(pagina).toContain("Leitura de operação");
    expect(pagina).toContain("Próximo passo");
  });

  it("deriva os indicadores e não copia os valores ilustrativos", () => {
    expect(pagina).toContain("const indicadoresDestaque =");
    expect(pagina).toContain("const programasDestaque =");
    expect(pagina).toContain("const prioridades =");
    expect(pagina).toContain("Receita registrada");
    expect(pagina).toContain("Custos operacionais");
    expect(pagina).toContain("Resultado do ano");
    expect(pagina).toContain("Margem");
    expect(pagina).not.toContain('valor="R$ 42.800"');
    expect(pagina).not.toContain('valor="R$ 16.240"');
    expect(pagina).not.toContain('valor="R$ 26.560"');
    expect(pagina).not.toContain('valor="62%"');
  });

  it("mantém rotas e registros existentes sem esconder o aviso de simulação", () => {
    expect(pagina).toContain('href="/analise"');
    expect(pagina).toContain('href="/financeiro/caixa"');
    expect(pagina).toContain('href="#registrar-despesa"');
    expect(pagina).toContain('id="registrar-despesa"');
    expect(pagina).toContain("GraficoOrcadoRealizado");
    expect(pagina).toContain("PainelForm titulo=\"Registrar nova despesa\"");
    expect(pagina).toContain("criarDespesa");
    expect(pagina).not.toContain('[data-faixa-simulacao] { display: none; }');
  });

  it("mantém a hierarquia da referência entre prioridades, programas e próximo passo", () => {
    const prioridades = pagina.indexOf("Prioridades");
    const programas = pagina.indexOf("Visão por programa");
    const leitura = pagina.indexOf("Leitura de operação");
    const proximoPasso = pagina.indexOf("Próximo passo");

    expect(prioridades).toBeGreaterThan(-1);
    expect(programas).toBeGreaterThan(prioridades);
    expect(leitura).toBeGreaterThan(programas);
    expect(proximoPasso).toBeGreaterThan(leitura);
  });
});
