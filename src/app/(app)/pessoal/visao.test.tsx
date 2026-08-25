import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { DadosPessoais } from "@/lib/pessoal/dados";

const { PessoalVisao } = await import("./visao");

function dados(over: Partial<DadosPessoais> = {}): DadosPessoais {
  return {
    conectado: true,
    motivo: "",
    parcial: false,
    itens: [],
    investimentos: [],
    resumo: { total: null, alocacao: [], dividas: [], investimentos: [] },
    ...over,
  };
}

function texto(html: string): string { return html.replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " "); }

describe("visão de finanças pessoais", () => {
  it("mostra total nulo como ausência de base, nunca como zero", () => {
    const html = renderToStaticMarkup(<PessoalVisao dados={dados()} />);
    expect(texto(html)).toContain("Ainda não há base suficiente para calcular o patrimônio");
    expect(texto(html)).not.toContain("R$ 0,00");
  });

  it("mostra somente dados explícitos e não introduz emoji", () => {
    const html = renderToStaticMarkup(<PessoalVisao dados={dados({ resumo: { total: 220, alocacao: [{ classe: "reserva", valor: 220, percentual: 100 }], dividas: [], investimentos: [{ nome: "Tesouro", aportado: 200, valorAtual: 220, rentabilidade: 0.1 }] } })} />);
    expect(texto(html)).toContain("Tesouro");
    expect(html).not.toMatch(/\p{Extended_Pictographic}|\p{Regional_Indicator}|\p{Emoji_Modifier}/u);
  });
});
