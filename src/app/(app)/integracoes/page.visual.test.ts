import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const pagina = readFileSync(path.join(__dirname, "page.tsx"), "utf8").replace(/\s+/g, " ");

describe("Integrações — referência aprovada", () => {
  it("reproduz a hierarquia operacional aprovada", () => {
    expect(pagina).toContain('data-integracoes-visual="referencia-aprovada"');
    expect(pagina).toContain("Integrações");
    expect(pagina).toContain("Guia de conexão");
    expect(pagina).toContain("Ver eventos");
    expect(pagina).toContain("Configurar integração");
    expect(pagina).toContain("Integrações por área");
    expect(pagina).toContain("Requer atenção");
    expect(pagina).toContain("Atividade recente");
    expect(pagina).toContain("Eventos e conciliação");
  });

  it("mantém os quatro indicadores compactos e derivados da base", () => {
    expect(pagina).toContain('data-integracoes-kpis="quatro"');
    expect(pagina).toContain("Conexões ativas");
    expect(pagina).toContain("Alertas de configuração");
    expect(pagina).toContain("Eventos processados");
    expect(pagina).toContain("Conciliação");
    expect(pagina).toContain("const conexoesDestaque");
    expect(pagina).not.toContain('valor="5/8"');
    expect(pagina).not.toContain('valor="128"');
    expect(pagina).not.toContain('valor="R$ 0,00"');
  });

  it("preserva os diagnósticos, as âncoras locais e o isolamento UAT", () => {
    expect(pagina).toContain('href="#integracoes-por-area"');
    expect(pagina).toContain('href="#eventos-integracoes"');
    expect(pagina).toContain("Diagnóstico da planilha isolado no UAT");
    expect(pagina).toContain("Bloqueada neste login de homologação");
    expect(pagina).toContain("lerAbas(ABAS.map");
  });

  it("não silencia a faixa global quando a simulação estiver ligada", () => {
    expect(pagina).not.toContain('[data-faixa-simulacao] { display: none; }');
  });
});
