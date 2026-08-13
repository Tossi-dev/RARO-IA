// Teste de render de `CarteiraVisao` — foco no defeito visual 4
// (fotos/carteira.png): o nome do mentorado É um link para a ficha, mas
// visualmente não parecia (mesma cor do texto normal, sem sublinhado, sem
// seta) — nada avisava que a linha respondia a clique. `CarteiraVisao` é
// sync e pura (recebe `Carteira` já resolvida): dá para chamar direto com
// `renderToStaticMarkup`.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Carteira } from "@/lib/mentoria/dados";
import { CarteiraVisao } from "./visao";

function carteiraComUmaLinha(): Carteira {
  return {
    conectado: true,
    motivo: "",
    linhas: [
      {
        mentorado: {
          id: "ment-1",
          workspaceId: "ws-1",
          alunoId: null,
          perfilId: "perfil-1",
          nome: "Carlos Menezes",
          telefone: "",
          email: "",
          origem: "",
          status: "ativo",
          criadoEm: "2026-01-01T00:00:00Z",
        },
        matricula: {
          id: "mat-1",
          workspaceId: "ws-1",
          mentoradoId: "ment-1",
          programaId: "prog-1",
          turmaId: null,
          inicio: "2026-01-01",
          fimPrevisto: null,
          status: "ativa",
          sessoesPrevistas: 8,
          criadoEm: "2026-01-01T00:00:00Z",
        },
        programa: {
          id: "prog-1",
          workspaceId: "ws-1",
          nome: "Impulso",
          formato: "individual",
          totalSessoes: 8,
          preco: 500,
          ativo: true,
          criadoEm: "2026-01-01T00:00:00Z",
        },
        progresso: { realizadas: 3, previstas: 8, rotulo: "sessão 3 de 8", percentual: 37, excedeu: false },
        proxima: null,
        ultimaRealizada: null,
        silencio: null,
      },
    ],
  };
}

describe("CarteiraVisao — defeito visual 4: o nome do mentorado precisa parecer um link", () => {
  it("o nome é um <a> para a ficha, com a cor de link do app (primaria-2) e uma seta discreta", () => {
    const html = renderToStaticMarkup(
      <CarteiraVisao carteira={carteiraComUmaLinha()} agoraIso="2026-08-13T12:00:00Z" />
    );

    expect(html).toContain('href="/mentoria/ment-1"');
    // a mesma cor que o resto do app usa para link — não a cor do texto
    // normal. O <a> carrega `class` ANTES de `href` na saída do React, por
    // isso o link inteiro (não a ordem dos atributos) é o que a asserção
    // prende.
    expect(html).toMatch(
      /<a class="[^"]*text-primaria-2[^"]*"[^>]*href="\/mentoria\/ment-1"/
    );
    // seta discreta (a mesma que `sidebar.tsx` já usa), nunca emoji.
    expect(html).toContain("→");
  });

  // A LINHA inteira responde ao hover, não só o texto do nome — sem isso a
  // única pista de "isto é clicável" ficava restrita a passar o mouse
  // exatamente em cima das letras do nome.
  it("a linha (<tr>) tem uma classe de hover — não só o link", () => {
    const html = renderToStaticMarkup(
      <CarteiraVisao carteira={carteiraComUmaLinha()} agoraIso="2026-08-13T12:00:00Z" />
    );

    expect(html).toMatch(/<tr[^>]*class="[^"]*hover:bg-eleva[^"]*"/);
  });
});
