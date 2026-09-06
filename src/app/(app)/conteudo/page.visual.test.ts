import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const pagina = readFileSync(path.join(__dirname, "page.tsx"), "utf8").replace(/\s+/g, " ");

describe("Conteúdo & Redes — contrato da referência aprovada", () => {
  it("organiza a biblioteca editorial como área principal da tela", () => {
    expect(pagina).toContain('data-conteudo-visual="referencia-aprovada"');
    expect(pagina).toContain('data-conteudo-biblioteca="principal"');
    expect(pagina).toContain("Biblioteca de conteúdos");
    expect(pagina).toContain("Canais");
    expect(pagina).toContain("O que está funcionando");
    expect(pagina).toContain("Calendário editorial");
  });

  it("preserva filtros, detalhe, ranking e campanhas", () => {
    expect(pagina).toContain('href="/conteudo/ranking"');
    expect(pagina).toContain('href="/conteudo/campanhas"');
    expect(pagina).toContain("plataforma");
    expect(pagina).toContain("tipo");
    expect(pagina).toContain("todos");
    expect(pagina).toContain("`/conteudo/${c.id}`");
  });

  it("não apresenta números de desempenho como dados sem origem", () => {
    expect(pagina).toContain("listConteudos()");
    expect(pagina).toContain("listCampanhas()");
    expect(pagina).toContain("engajamentoPct");
    expect(pagina).toContain("retencaoMedia");
    expect(pagina).toContain("sem métrica coletada");
  });

  it("falha fechada em UAT e não orienta configurar integrações externas", () => {
    expect(pagina).toContain("contaUatSinteticaAtual");
    expect(pagina).toContain("Integrações externas permanecem isoladas");
    expect(pagina).not.toContain("configure os tokens das APIs oficiais");
  });
});
