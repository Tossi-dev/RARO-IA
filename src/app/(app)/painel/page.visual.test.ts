import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const pagina = readFileSync(path.join(__dirname, "page.tsx"), "utf8");

describe("painel visual MentorOS", () => {
  it("reproduz a hierarquia aprovada para a visao geral", () => {
    expect(pagina).toContain('data-painel-visual="referencia-aprovada"');
    for (const titulo of [
      "Próximos atendimentos",
      "Atenção hoje",
      "Clientes em acompanhamento",
      "Metas em andamento",
      "Saúde do negócio",
      "Resumo da operação",
    ]) {
      expect(pagina).toContain(titulo);
    }
  });

  it("usa identificadores e indicadores sustentados pelos dados reais", () => {
    expect(pagina).toContain("`/crm/${r.alunoId}`");
    expect(pagina).toContain("`/crm/${c.id}`");
    expect(pagina).toContain("resultado.liquido");
    expect(pagina).toContain("reunioesFuturas.length");
    expect(pagina).toContain('aluno.statusFunil === "novo" || aluno.statusFunil === "recorrente"');
    expect(pagina).not.toContain("pctPlanos");
    expect(pagina).toContain('<LinkAzul href="/crm">Ver todos os clientes</LinkAzul>');
    expect(pagina).toContain('<LinkAzul href="/financeiro">Ver todas as metas</LinkAzul>');
  });
});
