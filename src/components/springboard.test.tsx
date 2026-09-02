import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Springboard } from "./springboard";
import type { AppCatalogo } from "@/lib/apps";

const APPS: AppCatalogo[] = [
  {
    id: "mentoria",
    nome: "Mentoria",
    href: "/mentoria",
    icone: "Trophy",
    cor: "#0071e3",
    frase: "A carteira de mentorados: progresso, sessões e quem está sem contato.",
  },
  {
    id: "agenda",
    nome: "Agenda",
    href: "/agenda",
    icone: "CalendarDays",
    cor: "#0071e3",
    frase: "As reuniões do dono, em dia, semana e mês.",
  },
  {
    id: "financeiro",
    nome: "Financeiro",
    href: "/financeiro",
    icone: "Wallet",
    cor: "#10b981",
    frase: "Resultado, caixa, projeção, DRE e reembolso.",
    subApps: [
      {
        id: "financeiro-caixa",
        nome: "Caixa",
        href: "/financeiro/caixa",
        icone: "Wallet",
        cor: "#10b981",
        frase: "O dinheiro disponível para a operação.",
      },
    ],
  },
];

describe("Springboard — módulos de trabalho", () => {
  it("mantém cada destino permitido e explica a finalidade do módulo", () => {
    const html = renderToStaticMarkup(<Springboard apps={APPS} />);

    expect(html).toContain('href="/mentoria"');
    expect(html).toContain('href="/agenda"');
    expect(html).toContain("A carteira de mentorados: progresso, sessões e quem está sem contato.");
    expect(html).toContain("As reuniões do dono, em dia, semana e mês.");
    expect(html).toContain('data-workspace-module="mentoria"');
    expect(html).toContain('data-workspace-module="agenda"');
  });

  it("mantém pastas como ação explícita, sem inventar uma rota alternativa", () => {
    const html = renderToStaticMarkup(<Springboard apps={APPS} />);

    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain("Financeiro");
    expect(html).not.toContain('href="/financeiro/caixa"');
  });
});
