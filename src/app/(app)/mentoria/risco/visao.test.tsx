import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PainelRiscoVisao } from "./visao";

describe("PainelRiscoVisao", () => {
  it("diz somente que não há alertas, sem transformar ausência em veredito", () => {
    const html = renderToStaticMarkup(<PainelRiscoVisao alertas={[]} analises={[]} />);
    expect(html).toContain("Nenhum alerta de risco registrado.");
    expect(html.toLowerCase()).not.toContain("tudo bem");
  });

  it("expõe o fato que originou o alerta e um pedido de resolução", () => {
    const html = renderToStaticMarkup(
      <PainelRiscoVisao
        alertas={[{ id: "a-1", mentoradoId: "m-1", nome: "Ana", tipo: "faltas", severidade: "alta", detalhe: "Duas faltas consecutivas em 01/08 e 08/08." }]}
        analises={[]}
      />
    );
    expect(html).toContain("Duas faltas consecutivas em 01/08 e 08/08.");
    expect(html).toContain('name="alertaId"');
    expect(html).toContain("Resolver alerta");
  });

  it("marca análise como IA, mostra o modelo e não deixa emoji atravessar", () => {
    const html = renderToStaticMarkup(
      <PainelRiscoVisao
        alertas={[]}
        analises={[{ id: "ia-1", mentoradoId: "m-1", nome: "Ana", sessaoId: "s-1", modelo: "anthropic", geradaPor: "u-1", geradaEm: "2026-08-25T12:00:00Z", pontosFortes: ["Boa escuta"], riscos: ["Retomar tarefa"] }]}
      />
    );
    expect(html).toContain("Análise gerada por IA");
    expect(html).toContain("Modelo: anthropic");
    expect(html).not.toContain("texto do mentor");
    expect(html).not.toMatch(/\p{Extended_Pictographic}|\p{Regional_Indicator}|\p{Emoji_Modifier}/u);
  });
});
