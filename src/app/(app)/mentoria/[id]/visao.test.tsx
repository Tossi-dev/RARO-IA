// Teste de render de `FichaVisao` — foco no defeito visual 3 (fotos/ficha.png):
// os blocos "Agendar sessão" e "Dar baixa" mostravam "▶ + Agendar sessão" e
// "▶ + Dar baixa" — o "▶" é o marcador NATIVO do `<details>`, escondido com
// `list-none` + `[&::-webkit-details-marker]:hidden`; o "+" escrito à mão
// continua sozinho. `FichaVisao` é uma função sync pura (recebe `Ficha` já
// resolvida) — dá para chamar direto com `renderToStaticMarkup`, sem o
// truque de árvore assíncrona que `portal/page.test.tsx` precisa.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Ficha } from "@/lib/mentoria/dados";

// `FichaVisao` só REFERENCIA `agendarSessao`/`darBaixaNaSessao` como
// `action={...}` de formulário — nunca chama. Mesmo assim o módulo real
// importa `next/cache`/`next/navigation`, que não resolvem fora do Next;
// mockar evita isso (mesma tática de `portal/page.test.tsx`).
vi.mock("@/lib/mentoria/acoes", () => ({
  agendarSessao: vi.fn(),
  darBaixaNaSessao: vi.fn(),
}));

const { FichaVisao } = await import("./visao");

function fichaComMatriculaAtivaESessaoAgendada(): Ficha {
  return {
    conectado: true,
    motivo: "",
    mentorado: {
      id: "ment-1",
      workspaceId: "ws-1",
      alunoId: null,
      perfilId: "perfil-1",
      nome: "Beatriz Nogueira",
      telefone: "31 96666-4321",
      email: "beatriz.nogueira@exemplo.com",
      origem: "",
      status: "ativo",
      criadoEm: "2026-01-01T00:00:00Z",
    },
    matriculas: [
      {
        matricula: {
          id: "mat-1",
          workspaceId: "ws-1",
          mentoradoId: "ment-1",
          programaId: "prog-1",
          turmaId: null,
          inicio: "2026-01-01",
          fimPrevisto: null,
          // "ativa" é a única que desenha o `<details>` de "+ Agendar sessão".
          status: "ativa",
          sessoesPrevistas: 12,
          criadoEm: "2026-01-01T00:00:00Z",
        },
        programa: {
          id: "prog-1",
          workspaceId: "ws-1",
          nome: "Elite",
          formato: "individual",
          totalSessoes: 12,
          preco: 1000,
          ativo: true,
          criadoEm: "2026-01-01T00:00:00Z",
        },
        progresso: { realizadas: 14, previstas: 12, rotulo: "sessão 14 de 12", percentual: 100, excedeu: true },
      },
    ],
    sessoes: [
      {
        id: "s-1",
        workspaceId: "ws-1",
        matriculaId: "mat-1",
        turmaId: null,
        numero: 15,
        quando: "2026-09-02T11:00:00Z",
        duracaoMin: 60,
        // "agendada" é a única que desenha o `<details>` de "+ Dar baixa".
        status: "agendada",
        linkGravacao: "",
        transcricao: "",
        resumo: "",
        criadoEm: "2026-01-01T00:00:00Z",
      },
    ],
    tarefas: [],
    marcos: [],
    scores: [],
  };
}

describe("FichaVisao — defeito visual 3: sem o marcador nativo `▶` do <details>", () => {
  it("os dois <summary> ('+ Agendar sessão' e '+ Dar baixa') não têm o glifo ▶ no HTML", () => {
    const html = renderToStaticMarkup(<FichaVisao ficha={fichaComMatriculaAtivaESessaoAgendada()} />);

    // os dois blocos de fato renderizaram — senão o teste provaria menos do
    // que diz (um `<details>` que nunca apareceu não pode provar nada).
    expect(html).toContain("+ Agendar sessão");
    expect(html).toContain("+ Dar baixa");
    expect(html).not.toContain("▶");
    // marcador nativo escondido nas duas classes exigidas — a causa raiz.
    // (o HTML escapa `&` para `&amp;` dentro de atributos, por isso o
    // trecho procurado aqui é só a parte estável do seletor arbitrário.)
    expect(html).toContain("list-none");
    expect(html).toContain("webkit-details-marker]:hidden");
  });
});
