import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { IndicadoresRecorrencia } from "@/lib/financeiro/dados-cobranca";

const { CobrancasVisao, enfileirarParaAprovacao } = await import("./visao");

function dados(over: Partial<IndicadoresRecorrencia> = {}): IndicadoresRecorrencia {
  return {
    conectado: true,
    motivo: "",
    parcial: false,
    cobrancas: [],
    contratos: [],
    mrr: null,
    arr: null,
    regua: { lembretes: [], inconsistentes: [] },
    reguaLimitada: false,
    ...over,
  };
}

function texto(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");
}

describe("visão de cobranças", () => {
  it("coloca um lembrete na fila local uma única vez", () => {
    expect(enfileirarParaAprovacao([], "c-1:D+1")).toEqual(["c-1:D+1"]);
    expect(enfileirarParaAprovacao(["c-1:D+1"], "c-1:D+1")).toEqual(["c-1:D+1"]);
  });

  it("coloca a régua na fila de aprovação, sem oferecer envio", () => {
    const html = renderToStaticMarkup(<CobrancasVisao dados={dados({ regua: { lembretes: [{ cobrancaId: "c-1", degrau: "D+1", texto: "Lembrete para Ana" }], inconsistentes: [] } })} />);

    expect(texto(html)).toContain("Colocar na fila de aprovação");
    expect(texto(html)).not.toMatch(/\benviar\b/i);
  });

  it("mostra MRR nulo como ausência de base, e não como zero", () => {
    const html = renderToStaticMarkup(<CobrancasVisao dados={dados()} />);

    expect(texto(html)).toContain("MRR ainda sem base para calcular");
    expect(texto(html)).not.toContain("R$ 0,00");
  });

  it("não desenha cobrança sem vencimento como atrasada", () => {
    const html = renderToStaticMarkup(<CobrancasVisao dados={dados({ cobrancas: [{ id: "c-1", mentoradoId: "m-1", matriculaId: null, competencia: "2026-08-01", vencimento: "", valor: 120, valorCentavos: 12000, status: "aberta", pagoEm: null, forma: null, movimentoId: null, criadoEm: "2026-08-01T00:00:00Z", envios: [], mentoradoNome: "Ana" }] })} />);

    expect(texto(html)).toContain("Sem vencimento");
    expect(html).not.toContain('data-atrasada="c-1"');
  });

  it("não marca data futura como atrasada", () => {
    const html = renderToStaticMarkup(<CobrancasVisao dados={dados({ cobrancas: [{ id: "c-2", mentoradoId: "m-1", matriculaId: null, competencia: "2099-01-01", vencimento: "2099-01-01", valor: 120, valorCentavos: 12000, status: "aberta", pagoEm: null, forma: null, movimentoId: null, criadoEm: "2026-08-01T00:00:00Z", envios: [], mentoradoNome: "Ana" }] })} />);

    expect(html).not.toContain('data-atrasada="c-2"');
  });

  it("marca data civil passada como atrasada", () => {
    const html = renderToStaticMarkup(<CobrancasVisao dados={dados({ cobrancas: [{ id: "c-3", mentoradoId: "m-1", matriculaId: null, competencia: "2000-01-01", vencimento: "2000-01-01", valor: 120, valorCentavos: 12000, status: "aberta", pagoEm: null, forma: null, movimentoId: null, criadoEm: "2026-08-01T00:00:00Z", envios: [], mentoradoNome: "Ana" }] })} />);

    expect(html).toContain('data-atrasada="c-3"');
  });

  it("não introduz emoji na saída", () => {
    const html = renderToStaticMarkup(<CobrancasVisao dados={dados()} />);
    expect(html).not.toMatch(/\p{Extended_Pictographic}|\p{Regional_Indicator}|\p{Emoji_Modifier}/u);
  });
});
