import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { AtendimentoLido } from "@/lib/mentoria/dados-atendimento";
import { Grafo } from "./grafo";
import { MapaAtendimento } from "./mapa-atendimento";
import { PlanoAcao } from "./plano-acao";

const atendimento: AtendimentoLido = {
  conectado: true,
  encontrado: true,
  consentimentos: [
    { categoria: "mapa", consentido: true },
    { categoria: "meta", consentido: true },
    { categoria: "reflexao", consentido: true },
  ],
  mapa: [{ id: "mapa-1", dimensao: "Profissional", nota: 8, dor: "Sobrecarga", medo: "Falhar", objetivo: "Delegar" }],
  metas: [{ id: "meta-1", titulo: "Delegar a operação", prazo: "2026-09-30", status: "em andamento" }],
  passos: [{ id: "passo-1", meta_id: "meta-1", descricao: "Definir a primeira delegação", responsavel: "Cliente", ordem: 1 }],
  reflexoes: [{ id: "reflexao-1", texto: "O que muda quando pedir ajuda?" }],
};

describe("módulos de acompanhamento", () => {
  it("organiza mapa, plano e relações como superfícies distintas", () => {
    const html = renderToStaticMarkup(
      <>
        <MapaAtendimento atendimento={atendimento} />
        <PlanoAcao atendimento={atendimento} />
        <Grafo atendimento={atendimento} />
      </>,
    );

    expect(html).toContain('data-acompanhamento="mapa"');
    expect(html).toContain('data-acompanhamento="plano"');
    expect(html).toContain('data-acompanhamento="relacoes"');
    expect(html).toContain("8/10");
    expect(html).toContain("Delegar a operação");
    expect(html).toContain("Definir a primeira delegação");
    expect(html).toContain("Sugestão de pergunta");
  });

  it("mantém o mapa fechado quando não há consentimento", () => {
    const semConsentimento = { ...atendimento, consentimentos: atendimento.consentimentos.filter((item) => item.categoria !== "mapa") };
    const html = renderToStaticMarkup(<MapaAtendimento atendimento={semConsentimento} />);

    expect(html).toContain("consentimento para atendimento está ausente");
    expect(html).not.toContain("Sobrecarga");
  });
});
