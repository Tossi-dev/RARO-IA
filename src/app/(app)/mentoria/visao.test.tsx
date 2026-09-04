// Teste de render de `CarteiraVisao` — foco no defeito visual 4
// (fotos/carteira.png): o nome do mentorado É um link para a ficha, mas
// visualmente não parecia (mesma cor do texto normal, sem sublinhado, sem
// seta) — nada avisava que a linha respondia a clique. `CarteiraVisao` é
// sync e pura (recebe `Carteira` já resolvida): dá para chamar direto com
// `renderToStaticMarkup`.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CarteiraVisao, type CarteiraVisual } from "./visao";

function carteiraComUmaLinha(): CarteiraVisual {
  return {
    conectado: true,
    motivo: "",
    linhas: [
      {
        id: "mat-1",
        mentorado: { id: "ment-1", nome: "Carlos Menezes", email: "" },
        matricula: { id: "mat-1" },
        programa: { nome: "Impulso" },
        status: "ativa",
        progresso: { rotulo: "sessão 3 de 8", percentual: 37 },
        proxima: null,
        ultimaRealizada: null,
        silencio: null,
      },
    ],
  };
}

describe("CarteiraVisao — carteira operacional", () => {
  it("oferece uma ação inequívoca para abrir a ficha do mentorado", () => {
    const html = renderToStaticMarkup(
      <CarteiraVisao carteira={carteiraComUmaLinha()} agoraIso="2026-08-13T12:00:00Z" />
    );

    expect(html).toContain('href="/mentoria/ment-1"');
    // a mesma cor que o resto do app usa para link — não a cor do texto
    // normal. O <a> carrega `class` ANTES de `href` na saída do React, por
    // isso o link inteiro (não a ordem dos atributos) é o que a asserção
    // prende.
    expect(html).toMatch(
      /<a class="[^"]*text-\[#3b8cff\][^"]*"[^>]*href="\/mentoria\/ment-1">Abrir ficha<\/a>/
    );
  });

  // A LINHA inteira responde ao hover, não só o texto do nome — sem isso a
  // única pista de "isto é clicável" ficava restrita a passar o mouse
  // exatamente em cima das letras do nome.
  it("a ação de ficha mostra resposta visual ao hover", () => {
    const html = renderToStaticMarkup(
      <CarteiraVisao carteira={carteiraComUmaLinha()} agoraIso="2026-08-13T12:00:00Z" />
    );

    expect(html).toMatch(/<a class="[^"]*hover:bg-\[#1769ff\]\/10[^"]*"[^>]*>Abrir ficha<\/a>/);
  });

  it("adota o contrato visual aprovado da carteira sem trocar dados reais por exemplos", () => {
    const html = renderToStaticMarkup(
      <CarteiraVisao carteira={carteiraComUmaLinha()} agoraIso="2026-08-13T12:00:00Z" />
    );

    expect(html).toContain('data-mentoria-visual="referencia-aprovada"');
    expect(html).toContain("Carteira de mentorados");
    expect(html).toContain("Mentorados ativos");
    expect(html).toContain("Sessões nesta semana");
    expect(html).toContain("Precisam de atenção");
    expect(html).toContain("Jornadas em andamento");
    expect(html).toContain("Prioridades de atendimento");
    expect(html).toContain("Próximos atendimentos");
    expect(html).toContain("Carlos Menezes");
    expect(html).not.toContain("Mariana Ribeiro");
  });

  it("mantém as ações da referência ligadas às rotas reais do produto", () => {
    const html = renderToStaticMarkup(
      <CarteiraVisao carteira={carteiraComUmaLinha()} agoraIso="2026-08-13T12:00:00Z" />
    );

    expect(html).toContain('href="/crm"');
    expect(html).toContain('href="/mentoria/ment-1"');
    expect(html).toContain('href="/agenda"');
  });

  it("não transforma indisponibilidade em indicadores zerados", () => {
    const html = renderToStaticMarkup(
      <CarteiraVisao carteira={{ conectado: false, motivo: "Leitura indisponível", linhas: [] }} agoraIso="2026-08-13T12:00:00Z" />
    );
    expect(html).toContain("Leitura indisponível");
    expect(html).not.toContain("Carteira em dia");
    expect(html).not.toContain("Nenhum próximo atendimento marcado");
  });

  it("preserva progresso desconhecido e o status real da matrícula", () => {
    const carteira = carteiraComUmaLinha();
    carteira.linhas[0].progresso = { percentual: null, rotulo: "progresso sem denominador" };
    carteira.linhas[0].status = "concluida";
    const html = renderToStaticMarkup(<CarteiraVisao carteira={carteira} agoraIso="2026-08-13T12:00:00Z" />);
    expect(html).toContain("Progresso ainda não mensurável");
    expect(html).not.toContain("Progresso 0%");
    expect(html).toContain("Concluída");
  });
});
