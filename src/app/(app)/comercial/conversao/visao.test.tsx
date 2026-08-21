// Testes do dashboard de conversão.
//
// O QUE ESTA SUÍTE PROVA
// ----------------------
// 1) leitura parcial (`conversao: null`) NÃO desenha gráfico nenhum;
// 2) funil sem ninguém não vira gráfico de zeros;
// 3) taxa `null` é "sem base", nunca 0%;
// 4) ciclo médio `null` é frase, nunca "0 dias";
// 5) perda sem motivo NÃO vira categoria "Outros" — nem no gráfico, nem na
//    lista;
// 6) zero emoji.
//
// O gráfico é dublê e guarda os dados que recebeu: o que interessa testar não
// é o desenho do Recharts, é O QUE foi mandado desenhar — e se foi.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { PipelineDoTime } from "@/lib/comercial/dados";
import { conversaoPorEtapa } from "@/lib/comercial/funil";

vi.mock("@/components/charts", () => ({
  GraficoBarrasH: ({ data }: { data: Array<{ nome: string; valor: number }> }) => (
    <div data-grafico={JSON.stringify(data)} />
  ),
}));

const { ConversaoVisao } = await import("./visao");

type Etapa = PipelineDoTime["etapas"][number];
type Oportunidade = PipelineDoTime["oportunidades"][number];

function etapa(over: Partial<Etapa> = {}): Etapa {
  return {
    id: "e1",
    workspaceId: "ws-1",
    chave: "contato",
    nome: "Contato",
    ordem: 1,
    tipo: "sdr",
    ativa: true,
    criadoEm: "2026-08-01T10:00:00Z",
    ...over,
  };
}

function oportunidade(over: Partial<Oportunidade> = {}): Oportunidade {
  return {
    id: "op1",
    workspaceId: "ws-1",
    alunoId: "al-1",
    mentoradoId: null,
    etapaId: "e1",
    responsavelPerfilId: null,
    valor: 1000,
    probabilidade: 40,
    origem: "",
    status: "aberta",
    motivoPerda: "",
    criadoEm: "2026-08-02T10:00:00Z",
    fechadoEm: null,
    ...over,
  };
}

const DUAS = [etapa(), etapa({ id: "e2", chave: "proposta", nome: "Proposta", ordem: 2 })];

function pipeline(over: Partial<PipelineDoTime> = {}): PipelineDoTime {
  const base: PipelineDoTime = {
    conectado: true,
    motivo: "",
    parcial: false,
    etapas: DUAS,
    oportunidades: [],
    alunos: [],
    propostas: [],
    conversao: null,
    cicloMedioDias: null,
    ...over,
  };
  // A conversão de verdade, como `lerPipeline` faz — inclusive com zero
  // oportunidades, quando ela volta com as linhas zeradas (e não `null`).
  if (base.conversao === null && !base.parcial && base.conectado) {
    base.conversao = conversaoPorEtapa(base.oportunidades, base.etapas);
  }
  return base;
}

const render = (p: PipelineDoTime) => renderToStaticMarkup(<ConversaoVisao pipeline={p} />);

function textoDe(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");
}

/** Os dados que chegaram a cada gráfico, na ordem em que foram desenhados. */
function graficos(html: string): Array<Array<{ nome: string; valor: number }>> {
  return [...html.matchAll(/data-grafico="([^"]*)"/g)].map((m) =>
    JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, "&")),
  );
}

describe("quando não dá para calcular", () => {
  it("leitura parcial não desenha gráfico nenhum", () => {
    const html = render(pipeline({ parcial: true, conversao: null, oportunidades: [oportunidade()] }));

    expect(graficos(html)).toHaveLength(0);
    expect(textoDe(html)).toContain("não foram calculados");
    expect(html).not.toContain("data-taxa");
  });

  it("sem conexão, mostra o motivo e nada mais", () => {
    const html = render(pipeline({ conectado: false, motivo: "Não foi possível carregar o funil agora." }));

    expect(textoDe(html)).toContain("Não foi possível carregar o funil agora");
    expect(graficos(html)).toHaveLength(0);
  });

  it("funil sem ninguém vira frase, não gráfico de zeros", () => {
    const html = render(pipeline());

    expect(html).not.toContain("data-funil");
    expect(graficos(html)).toHaveLength(0);
    expect(textoDe(html)).toContain("Nenhuma negociação passou por etapa alguma ainda");
  });
});

describe("os números", () => {
  it("com gente no funil, o gráfico recebe uma barra por etapa, na ordem", () => {
    const html = render(
      pipeline({
        oportunidades: [oportunidade({ id: "a", etapaId: "e1" }), oportunidade({ id: "b", etapaId: "e2" })],
      }),
    );

    expect(graficos(html)[0]).toEqual([
      { nome: "Contato", valor: 1 },
      { nome: "Proposta", valor: 1 },
    ]);
  });

  it("taxa null é palavra; taxa zero é número", () => {
    const html = render(pipeline({ oportunidades: [oportunidade({ etapaId: "e1" })] }));

    expect(html).toMatch(/data-taxa="e1"[^>]*>\s*0%/);
    expect(html).toMatch(/data-taxa="e2"[^>]*>\s*sem base/);
  });

  it("ciclo médio null é frase, e nunca '0 dias'", () => {
    const semFechada = render(pipeline({ oportunidades: [oportunidade()] }));
    expect(textoDe(semFechada)).toContain("ainda não há negócio fechado para medir");
    expect(textoDe(semFechada)).not.toContain("0 dias");

    const comFechada = render(
      pipeline({
        oportunidades: [
          oportunidade({ status: "ganha", criadoEm: "2026-08-01T00:00:00Z", fechadoEm: "2026-08-06T00:00:00Z" }),
        ],
        cicloMedioDias: 5,
      }),
    );
    expect(textoDe(comFechada)).toContain("5 dias entre abrir e fechar");
  });
});

describe("por que perdemos", () => {
  const perdida = (over: Partial<Oportunidade> = {}) =>
    oportunidade({ status: "perdida", fechadoEm: "2026-08-09T10:00:00Z", ...over });

  it("perda sem motivo NÃO vira categoria — nem no gráfico, nem na lista", () => {
    const html = render(
      pipeline({ oportunidades: [perdida({ id: "a" }), perdida({ id: "b" })] }),
    );

    expect(html).not.toContain("data-motivos");
    expect(graficos(html).flat().map((d) => d.nome)).not.toContain("Outros");
    expect(textoDe(html)).toContain("As 2 perdas registradas não têm motivo escrito");
    expect(textoDe(html)).not.toContain("100%");
  });

  it("uma perda só, no singular", () => {
    const html = render(pipeline({ oportunidades: [perdida({ id: "a" })] }));
    expect(textoDe(html)).toContain("A única perda registrada não tem motivo escrito");
  });

  it("com motivos, agrupa no gráfico e conta as sem motivo à parte", () => {
    const html = render(
      pipeline({
        oportunidades: [
          perdida({ id: "a", motivoPerda: "Preço", valor: 1000 }),
          perdida({ id: "b", motivoPerda: "preço", valor: 500 }),
          perdida({ id: "c", motivoPerda: "Sumiu", valor: 200 }),
          perdida({ id: "d", motivoPerda: "" }),
        ],
      }),
    );
    const doGrafico = graficos(html).at(-1)!;

    expect(doGrafico).toEqual([
      { nome: "Preço", valor: 2 },
      { nome: "Sumiu", valor: 1 },
    ]);
    expect(html).toContain("data-sem-motivo");
    expect(textoDe(html)).toContain("Outra perda não tem motivo escrito");
    // A soma por motivo aparece na lista, e ela é a dos valores somáveis.
    expect(textoDe(html)).toMatch(/Preço 2 ·/);
  });

  it("sem perda nenhuma, diz isso", () => {
    const html = render(pipeline({ oportunidades: [oportunidade()] }));
    expect(textoDe(html)).toContain("Nenhuma perda registrada ainda");
    expect(html).not.toContain("data-sem-motivo");
  });
});

describe("zero emoji", () => {
  const permitidos = new Set(["▲", "▼", "▬", "—", "·", "•", "→"]);

  it("nos quatro estados", () => {
    const telas = [
      render(pipeline()),
      render(pipeline({ parcial: true, conversao: null })),
      render(pipeline({ conectado: false, motivo: "x" })),
      render(
        pipeline({
          oportunidades: [
            oportunidade(),
            oportunidade({ id: "b", status: "perdida", motivoPerda: "Preço", fechadoEm: "2026-08-09T10:00:00Z" }),
          ],
        }),
      ),
    ];

    for (const html of telas) {
      for (const ch of html) {
        if (permitidos.has(ch)) continue;
        expect(/\p{Extended_Pictographic}/u.test(ch), `emoji: ${ch}`).toBe(false);
      }
    }
  });
});
