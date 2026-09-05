import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { KanbanCrm } from "@/components/kanban";
import type { Estagio } from "@/lib/types";

const pagina = readFileSync(path.join(__dirname, "page.tsx"), "utf8").replace(/\s+/g, " ");
const kanban = readFileSync(path.join(__dirname, "../../../components/kanban.tsx"), "utf8").replace(/\s+/g, " ");

describe("CRM — contrato da referência visual aprovada", () => {
  it("prioriza pipeline e conversas no primeiro espaço de trabalho", () => {
    expect(pagina).toContain('data-crm-visual="referencia-aprovada"');
    expect(pagina).toContain('data-crm-pipeline="true"');
    expect(pagina).toContain("Conversas prioritárias");
    expect(pagina).toContain("Jornada comercial");
  });

  it("preserva as duas visões, a busca e o cadastro sem confundir o CTA", () => {
    expect(pagina).toContain("Pipeline");
    expect(pagina).toContain("Lista");
    expect(pagina).toContain('id="novo-cliente"');
    expect(pagina).toContain('href="#novo-cliente"');
  });

  it("usa colunas compactas próprias do CRM sem alterar outros kanbans", () => {
    expect(pagina).toContain('variante="crm"');
    expect(kanban).toContain('variante?: "padrao" | "crm"');
    expect(kanban).toContain('variante === "crm"');
  });

  it("renderiza sete ou mais etapas numa faixa horizontal navegável", () => {
    const estagios = Array.from({ length: 7 }, (_, indice) => ({
      id: `etapa-${indice}`,
      chave: `etapa_${indice}`,
      nome: `Etapa ${indice + 1}`,
      ordem: indice,
      cor: "azul",
      funil: "potencial",
    })) as Estagio[];
    const colunas = Object.fromEntries(estagios.map((estagio) => [estagio.id, []]));
    const html = renderToStaticMarkup(<KanbanCrm estagios={estagios} colunas={colunas} variante="crm" />);

    expect(html.match(/aria-label="Estágio Etapa/g)).toHaveLength(7);
    expect(html).toContain('data-kanban-scroll="horizontal"');
    expect(html).toContain("min-w-max");
    expect(html).not.toContain("grid-cols-5");

    const padrao = renderToStaticMarkup(<KanbanCrm estagios={estagios.slice(0, 2)} colunas={colunas} />);
    expect(padrao).toMatch(/class="[^"]*snap-x[^"]*overflow-x-auto/);
  });
});
