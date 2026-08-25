import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { OportunidadeDetalhada } from "@/lib/comercial/dados";

vi.mock("@/lib/comercial/acoes-analise-call", () => ({ analisarCall: vi.fn() }));
import { OportunidadeVisao } from "./visao";

const detalhe: OportunidadeDetalhada = {
  conectado: true, motivo: "", etapa: { id: "e-1", workspaceId: "w-1", chave: "call", nome: "Call", ordem: 1, tipo: "closer", ativa: true, criadoEm: "2026-08-01T00:00:00Z" },
  oportunidade: { id: "o-1", workspaceId: "w-1", alunoId: "a-1", mentoradoId: null, etapaId: "e-1", responsavelPerfilId: null, valor: 1200, probabilidade: 50, origem: "Indicação", status: "aberta", motivoPerda: "", criadoEm: "2026-08-01T00:00:00Z", fechadoEm: null },
};

describe("OportunidadeVisao", () => {
  it("mostra score ausente como ausência, não como zero", () => {
    const html = renderToStaticMarkup(<OportunidadeVisao detalhe={detalhe} analises={[{ id: "ac-1", score: null, objecoes: [], sugestoes: ["Retomar"], modelo: "anthropic", geradaPor: "u-1", geradaEm: "2026-08-25T12:00:00Z" }]} />);
    expect(html).toContain("A análise não devolveu um score legível.");
    expect(html).not.toContain("Score: 0");
  });

  it("rotula resultado como IA/modelo e não imprime transcrição", () => {
    const segredo = "transcrição completa do prospect que não deve aparecer";
    const html = renderToStaticMarkup(<OportunidadeVisao detalhe={detalhe} analises={[{ id: "ac-1", score: 72, objecoes: ["Prazo"], sugestoes: ["Retomar"], modelo: "anthropic", geradaPor: "u-1", geradaEm: "2026-08-25T12:00:00Z" }]} />);
    expect(html).toContain("Análise gerada por IA");
    expect(html).toContain("Modelo: anthropic");
    expect(html).not.toContain(segredo);
    expect(html).not.toMatch(/\p{Extended_Pictographic}|\p{Regional_Indicator}|\p{Emoji_Modifier}/u);
  });
});
