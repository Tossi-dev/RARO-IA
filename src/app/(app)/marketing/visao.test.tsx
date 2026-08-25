import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { DadosMarketing } from "@/lib/marketing/dados";

vi.mock("@/lib/marketing/dados", () => ({ criarLinkRastreado: vi.fn() }));
vi.mock("@/components/charts", () => ({
  GraficoBarrasH: ({ data }: { data: Array<{ nome: string; valor: number }> }) => <div data-grafico={JSON.stringify(data)} />,
}));

const { MarketingVisao } = await import("./visao");

function dados(over: Partial<DadosMarketing> = {}): DadosMarketing {
  return {
    conectado: true,
    motivo: "",
    parcial: false,
    capturasPorOrigem: [],
    links: [],
    ...over,
  };
}

function texto(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");
}

describe("MarketingVisao", () => {
  it("sem captura fala a verdade e não desenha gráfico de origens vazio", () => {
    const html = renderToStaticMarkup(<MarketingVisao dados={dados()} />);

    expect(texto(html)).toContain("Ainda não há captura");
    expect(html).not.toContain("data-grafico");
  });

  it("mostra sem origem informada, nunca direto, e avisa os limites da versão", () => {
    const html = renderToStaticMarkup(
      <MarketingVisao dados={dados({ capturasPorOrigem: [{ origem: "sem origem informada", quantidade: 2 }] })} />,
    );
    const conteudo = texto(html).toLowerCase();

    expect(html).toContain("sem origem informada");
    expect(conteudo).not.toContain("direto");
    expect(conteudo).toContain("não dispara e-mail");
    expect(conteudo).toContain("não constrói landing page");
  });

  it("não tem emoji", () => {
    const html = renderToStaticMarkup(<MarketingVisao dados={dados()} />);
    expect(html).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
