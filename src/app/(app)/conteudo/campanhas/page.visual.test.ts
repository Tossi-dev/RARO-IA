import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const pagina = readFileSync(path.join(__dirname, "page.tsx"), "utf8").replace(/\s+/g, " ");

describe("Marketing & Campanhas — referência aprovada", () => {
  it("reproduz a hierarquia da referência aprovada", () => {
    expect(pagina).toContain('data-campanhas-visual="referencia-aprovada"');
    expect(pagina).toContain("Marketing &amp; Campanhas");
    expect(pagina).toContain("Biblioteca de criativos");
    expect(pagina).toContain("Calendário");
    expect(pagina).toContain("Nova campanha");
    expect(pagina).toContain("Campanhas em andamento");
    expect(pagina).toContain("O que está convertendo");
    expect(pagina).toContain("Próximas ativações");
    expect(pagina).toContain("Funil de campanha");
  });

  it("mantém quatro indicadores compactos e a tabela como área principal", () => {
    expect(pagina).toContain('data-campanhas-kpis="quatro"');
    expect(pagina).toContain('data-campanhas-lista="principal"');
    expect(pagina).toContain("Campanhas ativas");
    expect(pagina).toContain("Leads gerados");
    expect(pagina).toContain("Conversas iniciadas");
    expect(pagina).toContain("Custo por lead");
  });

  it("não transforma números ilustrativos da referência em métricas reais", () => {
    expect(pagina).toContain("sem atribuição de leads");
    expect(pagina).toContain("sem atribuição de conversas");
    expect(pagina).toContain("métrica não coletada");
    expect(pagina).not.toContain('valor="186"');
    expect(pagina).not.toContain('valor="62"');
    expect(pagina).not.toContain('valor="R$ 18,40"');
    expect(pagina).not.toContain('valor="6.842"');
  });

  it("preserva criação, vínculo de criativo e geração de copy", () => {
    expect(pagina).toContain('href="/conteudo"');
    expect(pagina).toContain('href="#nova-campanha"');
    expect(pagina).toContain("<form action={criarCampanha}");
    expect(pagina).toContain("Conteúdo vinculado (criativo)");
    expect(pagina).toContain("Gerar copy de campanha");
  });
});
