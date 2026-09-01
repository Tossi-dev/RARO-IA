// Testes de render da tela do funil.
//
// O QUE ESTA SUÍTE PROVA
// ----------------------
// 1) funil VAZIO mostra uma frase honesta e NÃO uma tabela de conversão com
//    tudo em zero — zero parece diagnóstico, e é só ausência de dado;
// 2) taxa `null` aparece como palavra, nunca como "0%";
// 3) leitura parcial avisa, e os números do funil não são desenhados;
// 4) perder e dizer por quê são o MESMO passo, e o campo é obrigatório —
//    senão o caminho normal do usuário bate no `check` de 0024;
// 5) o cartão mostra o NOME de quem está do outro lado, nunca o id;
// 6) ganhar não promete cliente novo;
// 7) zero emoji.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { PipelineDoTime } from "@/lib/comercial/dados";
import { conversaoPorEtapa } from "@/lib/comercial/funil";

vi.mock("@/lib/comercial/acoes-form", () => ({
  criarOportunidadeDoForm: vi.fn(),
  moverOportunidadeDoForm: vi.fn(),
  ganharOportunidadeDoForm: vi.fn(),
  perderOportunidadeDoForm: vi.fn(),
  criarPropostaDoForm: vi.fn(),
  enviarPropostaDoForm: vi.fn(),
  registrarRespostaDaPropostaDoForm: vi.fn(),
}));

const { ComercialVisao } = await import("./visao");

type Etapa = PipelineDoTime["etapas"][number];
type Oportunidade = PipelineDoTime["oportunidades"][number];

function etapa(over: Partial<Etapa> = {}): Etapa {
  return {
    id: "e1",
    workspaceId: "ws-1",
    chave: "contato",
    nome: "Primeiro contato",
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
    valor: 2500,
    probabilidade: 40,
    origem: "indicacao",
    status: "aberta",
    motivoPerda: "",
    criadoEm: "2026-08-02T10:00:00Z",
    fechadoEm: null,
    ...over,
  };
}

function pipeline(over: Partial<PipelineDoTime> = {}): PipelineDoTime {
  const base: PipelineDoTime = {
    conectado: true,
    motivo: "",
    parcial: false,
    etapas: [],
    oportunidades: [],
    alunos: [{ id: "al-1", nome: "Joana Prado" }],
    propostas: [],
    conversao: null,
    cicloMedioDias: null,
    ...over,
  };
  // A conversão de verdade, calculada pelo módulo puro — a tela nunca inventa
  // número, e o teste também não.
  //
  // Calculada TAMBÉM com zero oportunidades, e isso não é detalhe: é o que
  // `lerPipeline` faz de verdade. Sem funil nenhum, `conversaoPorEtapa`
  // devolve um objeto com todas as linhas zeradas — não `null`. Enquanto o
  // teste devolvia `null` nesse caso, a guarda de "vazio não vira tabela de
  // zeros" era indistinguível de "vazio porque a leitura falhou", e um
  // mutante que apagava metade dela sobrevivia.
  if (base.conversao === null && !base.parcial && base.conectado) {
    base.conversao = conversaoPorEtapa(base.oportunidades, base.etapas);
  }
  return base;
}

const render = (p: PipelineDoTime, erro = "") =>
  renderToStaticMarkup(<ComercialVisao pipeline={p} erro={erro} />);

function textoDe(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

describe("funil vazio", () => {
  it("diz que não há o que medir, e NÃO desenha a conversão com zeros", () => {
    const html = render(pipeline({ etapas: [etapa()] }));
    const t = textoDe(html);

    expect(t).toContain("Ainda não há negociação para medir");
    expect(t).not.toContain("0%");
    expect(html).not.toContain("data-taxa");
    // A coluna da etapa continua lá: o funil existe, só está vazio.
    expect(html).toContain('aria-label="Etapa Primeiro contato"');
  });

  it("sem etapa nenhuma, diz isso em vez de desenhar um quadro vazio", () => {
    const t = textoDe(render(pipeline()));
    expect(t).toContain("Nenhuma etapa configurada");
  });

  it("sem conexão, mostra o motivo e não oferece formulário", () => {
    const html = render(pipeline({ conectado: false, motivo: "Não foi possível carregar o funil agora." }));

    expect(textoDe(html)).toContain("Não foi possível carregar o funil agora");
    expect(html).not.toContain('name="alunoId"');
  });
});

describe("os números", () => {
  const tresEtapas = [
    etapa({ id: "e1", chave: "contato", nome: "Contato", ordem: 1 }),
    etapa({ id: "e2", chave: "reuniao", nome: "Reunião", ordem: 2 }),
    etapa({ id: "e3", chave: "proposta", nome: "Proposta", ordem: 3 }),
  ];

  it("taxa null é PALAVRA, e a taxa 0 é número", () => {
    // Uma oportunidade na e1: a e1 tem base (taxa 0, ninguém avançou) e a e3
    // não tem base nenhuma (taxa null). As duas na mesma tela, de propósito.
    const html = render(pipeline({ etapas: tresEtapas, oportunidades: [oportunidade({ etapaId: "e1" })] }));

    expect(html).toMatch(/data-taxa="e1"[^>]*>\s*0%/);
    expect(html).toMatch(/data-taxa="e3"[^>]*>\s*sem base/);
    expect(textoDe(html)).toContain("sem base");
  });

  it("ciclo médio sem negócio fechado é frase, não zero", () => {
    const t = textoDe(render(pipeline({ etapas: tresEtapas, oportunidades: [oportunidade()] })));

    expect(t).toContain("ainda não há negócio fechado para medir");
    expect(t).not.toContain("0 dias");
  });

  it("leitura parcial avisa e não desenha número nenhum do funil", () => {
    const html = render(
      pipeline({ parcial: true, etapas: tresEtapas, oportunidades: [oportunidade()], conversao: null }),
    );
    const t = textoDe(html);

    expect(t).toContain("A leitura veio incompleta");
    expect(html).not.toContain("data-taxa");
    // E os cartões continuam: o que veio é verdade.
    expect(html).toContain("data-oportunidade");
  });

  it("dado ilegível é contado e dito, não escondido", () => {
    const html = render(
      pipeline({
        etapas: tresEtapas,
        oportunidades: [oportunidade({ id: "op1", valor: -50 }), oportunidade({ id: "op2", status: "vendida" })],
      }),
    );

    expect(textoDe(html)).toMatch(/2 negocia/);
  });
});

describe("o cartão", () => {
  it("mostra o nome de quem está do outro lado, nunca o id", () => {
    const html = render(pipeline({ etapas: [etapa()], oportunidades: [oportunidade()] }));
    const t = textoDe(html);

    expect(t).toContain("Joana Prado");
    expect(t).not.toContain("al-1");
  });

  it("aluno sem nome não vira id na tela", () => {
    const html = render(
      pipeline({ etapas: [etapa()], oportunidades: [oportunidade({ alunoId: "sumiu" })], alunos: [] }),
    );

    expect(textoDe(html)).toContain("Sem nome");
    expect(textoDe(html)).not.toContain("sumiu");
  });

  it("perder ABRE junto com o campo de motivo, e o campo é obrigatório", () => {
    // Em dois passos, o caminho normal do usuário bateria no
    // `check perda_tem_motivo` (0024) e voltaria com erro de constraint.
    const html = render(pipeline({ etapas: [etapa()], oportunidades: [oportunidade()] }));

    expect(html).toContain('data-perder="op1"');
    expect(html).toMatch(/<textarea[^>]*name="motivo"[^>]*required/);
  });

  it("só mostra 'mover' para etapa ativa diferente da atual", () => {
    const html = render(
      pipeline({
        etapas: [
          etapa({ id: "e1" }),
          etapa({ id: "e2", chave: "reuniao", nome: "Reunião", ordem: 2 }),
          etapa({ id: "e3", chave: "morta", nome: "Aposentada", ordem: 3, ativa: false }),
        ],
        oportunidades: [oportunidade({ etapaId: "e1" })],
      }),
    );

    expect(html).toContain('name="etapaId" value="e2"');
    expect(html).not.toContain('name="etapaId" value="e1"');
    expect(html).not.toContain('name="etapaId" value="e3"');
  });
});

describe("as fechadas", () => {
  it("ganha sem mentorado diz que ainda não virou cliente", () => {
    const html = render(
      pipeline({
        etapas: [etapa()],
        oportunidades: [oportunidade({ status: "ganha", fechadoEm: "2026-08-10T10:00:00Z" })],
      }),
    );
    const t = textoDe(html);

    expect(t).toContain("Ganha");
    expect(t).toContain("ainda não virou mentorado");
  });

  it("ganha JÁ vinculada não repete o aviso", () => {
    const html = render(
      pipeline({
        etapas: [etapa()],
        oportunidades: [
          oportunidade({ status: "ganha", fechadoEm: "2026-08-10T10:00:00Z", mentoradoId: "m1" }),
        ],
      }),
    );

    expect(textoDe(html)).not.toContain("ainda não virou mentorado");
  });

  it("perdida mostra o motivo", () => {
    const html = render(
      pipeline({
        etapas: [etapa()],
        oportunidades: [
          oportunidade({ status: "perdida", motivoPerda: "Foi para o concorrente", fechadoEm: "2026-08-10T10:00:00Z" }),
        ],
      }),
    );

    expect(textoDe(html)).toContain("Foi para o concorrente");
  });

  it("negociação fechada não aparece no quadro", () => {
    const html = render(
      pipeline({
        etapas: [etapa()],
        oportunidades: [
          oportunidade({ id: "aberta" }),
          oportunidade({ id: "ganhou", status: "ganha", fechadoEm: "2026-08-10T10:00:00Z" }),
        ],
      }),
    );

    expect(html).toContain('data-oportunidade="aberta"');
    expect(html).not.toContain('data-oportunidade="ganhou"');
  });
});

describe("zero emoji", () => {
  const permitidos = new Set(["▲", "▼", "▬", "—", "·", "•", "→"]);

  function achados(html: string): string[] {
    const fora: string[] = [];
    for (const ch of html) {
      if (permitidos.has(ch)) continue;
      if (/\p{Extended_Pictographic}/u.test(ch)) fora.push(ch);
    }
    return fora;
  }

  it("vazio, cheio e parcial", () => {
    expect(achados(render(pipeline()))).toEqual([]);
    expect(
      achados(
        render(
          pipeline({
            etapas: [etapa(), etapa({ id: "e2", chave: "b", nome: "Reunião", ordem: 2 })],
            oportunidades: [
              oportunidade(),
              oportunidade({ id: "op2", status: "perdida", motivoPerda: "preço", fechadoEm: "2026-08-09T10:00:00Z" }),
            ],
          }),
        ),
      ),
    ).toEqual([]);
    expect(achados(render(pipeline({ parcial: true, etapas: [etapa()] })))).toEqual([]);
  });
});

describe("roteiro comercial interno", () => {
  it("exige confirmação de consentimento e não oferece envio externo", () => {
    const html = render(pipeline());
    expect(html).toContain("Roteiro de descoberta");
    expect(html).toContain("Confirmo que a pessoa autorizou");
    expect(html).toContain("não envia mensagens");
    expect(html.toLowerCase()).not.toMatch(/whatsapp|e-mail|compre agora/);
  });
});
