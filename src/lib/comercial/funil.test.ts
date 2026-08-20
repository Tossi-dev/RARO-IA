// Testes do módulo puro do funil.
//
// O QUE ESTA SUÍTE PROVA
// ----------------------
// 1) `taxa` é `null` — nunca 0 — quando ninguém entrou na etapa. "Não deu
//    para calcular" e "calculei e deu zero" são respostas diferentes, e a
//    tela precisa poder dizer coisas diferentes;
// 2) o módulo NUNCA assume caminho: oportunidade adiante de uma etapa, sem
//    registro de passagem por ela, não entra na conta daquela etapa — a linha
//    volta marcada `parcial: true`, dizendo que não sabe;
// 3) `perdida` não conta como avanço, em etapa nenhuma;
// 4) status ilegível não vira "aberta" por conveniência: vira inconsistência;
// 5) valor negativo não é somado em silêncio;
// 6) `cicloMedio` é `null` sem oportunidade fechada.

import { describe, expect, it } from "vitest";
import {
  cicloMedio,
  conversaoPorEtapa,
  statusDaOportunidade,
  type EtapaDoFunil,
  type OportunidadeDoFunil,
  type PassagemPorEtapa,
} from "./funil";

function etapa(over: Partial<EtapaDoFunil> = {}): EtapaDoFunil {
  return { id: "e1", chave: "primeiro-contato", nome: "Primeiro contato", ordem: 1, ativa: true, ...over };
}

function oportunidade(over: Partial<OportunidadeDoFunil> = {}): OportunidadeDoFunil {
  return {
    id: "o1",
    etapaId: "e1",
    status: "aberta",
    valor: 1000,
    criadoEm: "2026-08-01T10:00:00Z",
    fechadoEm: null,
    ...over,
  };
}

/** As três etapas usadas na maioria dos casos, já em ordem. */
const ETAPAS: EtapaDoFunil[] = [
  etapa({ id: "e1", chave: "contato", ordem: 1 }),
  etapa({ id: "e2", chave: "reuniao", ordem: 2 }),
  etapa({ id: "e3", chave: "proposta", ordem: 3 }),
];

function linhaDe(resultado: ReturnType<typeof conversaoPorEtapa>, etapaId: string) {
  const linha = resultado.linhas.find((l) => l.etapaId === etapaId);
  if (!linha) throw new Error(`sem linha para ${etapaId}`);
  return linha;
}

describe("statusDaOportunidade — o que vem do banco é texto", () => {
  it("reconhece os três valores do enum", () => {
    expect(statusDaOportunidade("aberta")).toBe("aberta");
    expect(statusDaOportunidade("ganha")).toBe("ganha");
    expect(statusDaOportunidade("perdida")).toBe("perdida");
  });

  it("devolve null para qualquer outra coisa — nunca chuta 'aberta'", () => {
    // Chutar "aberta" inflaria o funil com linha que ninguém sabe o que é.
    for (const valor of ["", " ", "ABERTA", "fechada", "ganho", null, undefined, 3, {}]) {
      expect(statusDaOportunidade(valor), `esperava null para ${JSON.stringify(valor)}`).toBeNull();
    }
  });
});

describe("conversaoPorEtapa — a taxa que pode não existir", () => {
  it("etapa sem ninguém devolve taxa null, e NÃO zero", () => {
    const r = conversaoPorEtapa([], ETAPAS);
    for (const linha of r.linhas) {
      expect(linha.entraram).toBe(0);
      expect(linha.avancaram).toBe(0);
      expect(linha.taxa).toBeNull();
      expect(linha.taxa).not.toBe(0);
    }
  });

  it("devolve uma linha por etapa, em ordem, inclusive as inativas", () => {
    // Etapa tirada do funil continua guardando histórico: esconder aqui faria
    // a conta de ontem mudar sozinha.
    const r = conversaoPorEtapa([], [
      etapa({ id: "e3", chave: "proposta", ordem: 3 }),
      etapa({ id: "e9", chave: "antiga", ordem: 2, ativa: false }),
      etapa({ id: "e1", chave: "contato", ordem: 1 }),
    ]);
    expect(r.linhas.map((l) => l.etapaId)).toEqual(["e1", "e9", "e3"]);
    expect(r.linhas.map((l) => l.ordem)).toEqual([1, 2, 3]);
  });

  it("duas etapas com a MESMA ordem saem sempre na mesma sequência", () => {
    // Sem desempate, a ordem dependeria de como o banco devolveu as linhas, e
    // a tela trocaria de lugar entre um F5 e outro. O desempate é a `chave`,
    // que é estável por contrato (0024) — o `nome` o time renomeia à vontade.
    const r = conversaoPorEtapa([], [
      etapa({ id: "z", chave: "zebra", nome: "AAA", ordem: 2 }),
      etapa({ id: "a", chave: "abelha", nome: "ZZZ", ordem: 2 }),
      etapa({ id: "p", chave: "primeiro", ordem: 1 }),
    ]);
    expect(r.linhas.map((l) => l.etapaId)).toEqual(["p", "a", "z"]);
  });

  it("quem está NA etapa entra na conta dela, sem precisar de registro", () => {
    const r = conversaoPorEtapa([oportunidade({ id: "a", etapaId: "e2" })], ETAPAS);
    expect(linhaDe(r, "e2").entraram).toBe(1);
    expect(linhaDe(r, "e2").avancaram).toBe(0);
    expect(linhaDe(r, "e2").taxa).toBe(0);
    // E não entra na conta das outras.
    expect(linhaDe(r, "e1").entraram).toBe(0);
    expect(linhaDe(r, "e3").entraram).toBe(0);
  });

  it("taxa é percentual arredondado, e 2 de 3 é 67 — não 66", () => {
    const passagens: PassagemPorEtapa[] = [
      { oportunidadeId: "a", etapaId: "e1" },
      { oportunidadeId: "b", etapaId: "e1" },
      { oportunidadeId: "c", etapaId: "e1" },
    ];
    const r = conversaoPorEtapa(
      [
        oportunidade({ id: "a", etapaId: "e2" }),
        oportunidade({ id: "b", etapaId: "e3" }),
        oportunidade({ id: "c", etapaId: "e1" }),
      ],
      ETAPAS,
      passagens,
    );
    const linha = linhaDe(r, "e1");
    expect(linha.entraram).toBe(3);
    expect(linha.avancaram).toBe(2);
    expect(linha.taxa).toBe(67);
  });
});

describe("conversaoPorEtapa — nunca assumir o caminho", () => {
  it("oportunidade adiante SEM registro de passagem não entra na conta da etapa anterior", () => {
    // Ela está na e3 hoje. Passou pela e1? Ninguém registrou. A resposta
    // honesta é "não sei", e não "deve ter passado".
    const r = conversaoPorEtapa([oportunidade({ id: "a", etapaId: "e3" })], ETAPAS);

    expect(linhaDe(r, "e1").entraram).toBe(0);
    expect(linhaDe(r, "e1").taxa).toBeNull();
    expect(linhaDe(r, "e1").parcial).toBe(true);
    expect(linhaDe(r, "e2").parcial).toBe(true);
    // A etapa onde ela está não tem nada de parcial: ali a evidência existe.
    expect(linhaDe(r, "e3").parcial).toBe(false);
    expect(r.parcial).toBe(true);
  });

  it("COM registro de passagem, a mesma oportunidade conta e a etapa deixa de ser parcial", () => {
    const r = conversaoPorEtapa([oportunidade({ id: "a", etapaId: "e3" })], ETAPAS, [
      { oportunidadeId: "a", etapaId: "e1" },
      { oportunidadeId: "a", etapaId: "e2" },
    ]);

    expect(linhaDe(r, "e1").entraram).toBe(1);
    expect(linhaDe(r, "e1").avancaram).toBe(1);
    expect(linhaDe(r, "e1").taxa).toBe(100);
    expect(linhaDe(r, "e1").parcial).toBe(false);
    expect(r.parcial).toBe(false);
  });

  it("ganha na PRIMEIRA etapa não torna as seguintes parciais — ela nunca foi lá", () => {
    // Indicação que fechou na primeira conversa. Não há dúvida nenhuma sobre
    // a etapa de proposta: essa oportunidade não passou por ela.
    const r = conversaoPorEtapa(
      [oportunidade({ id: "a", etapaId: "e1", status: "ganha", fechadoEm: "2026-08-02T10:00:00Z" })],
      ETAPAS,
    );

    expect(linhaDe(r, "e1").entraram).toBe(1);
    expect(linhaDe(r, "e1").avancaram).toBe(1);
    expect(linhaDe(r, "e2").parcial).toBe(false);
    expect(linhaDe(r, "e3").parcial).toBe(false);
    expect(r.parcial).toBe(false);
  });

  it("registro de passagem para etapa que não existe não inventa linha nem conta", () => {
    const r = conversaoPorEtapa([oportunidade({ id: "a", etapaId: "e1" })], ETAPAS, [
      { oportunidadeId: "a", etapaId: "e-que-nao-existe" },
    ]);
    expect(r.linhas).toHaveLength(3);
    expect(r.linhas.every((l) => l.entraram <= 1)).toBe(true);
  });
});

describe("conversaoPorEtapa — o que conta como avanço", () => {
  it("perdida NÃO é avanço, mesmo estando adiante", () => {
    const r = conversaoPorEtapa(
      [oportunidade({ id: "a", etapaId: "e3", status: "perdida", fechadoEm: "2026-08-05T10:00:00Z" })],
      ETAPAS,
      [{ oportunidadeId: "a", etapaId: "e1" }],
    );
    expect(linhaDe(r, "e1").entraram).toBe(1);
    expect(linhaDe(r, "e1").avancaram).toBe(0);
    expect(linhaDe(r, "e1").taxa).toBe(0);
  });

  it("ganha é avanço em toda etapa por onde há registro — inclusive na etapa onde ela terminou", () => {
    const r = conversaoPorEtapa(
      [oportunidade({ id: "a", etapaId: "e3", status: "ganha", fechadoEm: "2026-08-09T10:00:00Z" })],
      ETAPAS,
      [{ oportunidadeId: "a", etapaId: "e1" }],
    );
    expect(linhaDe(r, "e1").avancaram).toBe(1);
    expect(linhaDe(r, "e3").entraram).toBe(1);
    expect(linhaDe(r, "e3").avancaram).toBe(1);
  });

  it("aberta na MESMA etapa não é avanço", () => {
    const r = conversaoPorEtapa([oportunidade({ id: "a", etapaId: "e1" })], ETAPAS);
    expect(linhaDe(r, "e1").avancaram).toBe(0);
  });

  it("aberta numa etapa de ordem MENOR que a registrada não vira avanço para trás", () => {
    // Voltou da e3 para a e1. A passagem pela e3 existe, mas hoje ela está
    // atrás: não é avanço da e3.
    const r = conversaoPorEtapa([oportunidade({ id: "a", etapaId: "e1" })], ETAPAS, [
      { oportunidadeId: "a", etapaId: "e3" },
    ]);
    expect(linhaDe(r, "e3").entraram).toBe(1);
    expect(linhaDe(r, "e3").avancaram).toBe(0);
  });
});

describe("conversaoPorEtapa — o que não dá para somar", () => {
  it("valor negativo não é somado, e a oportunidade vai para inconsistentes", () => {
    const r = conversaoPorEtapa(
      [oportunidade({ id: "a", etapaId: "e1", valor: -500 }), oportunidade({ id: "b", etapaId: "e1", valor: 300 })],
      ETAPAS,
    );
    expect(linhaDe(r, "e1").valorEmAberto).toBe(300);
    expect(r.inconsistentes).toContainEqual({ oportunidadeId: "a", motivo: "valor-negativo" });
    // Ela continua contando como oportunidade: o valor é que não entra.
    expect(linhaDe(r, "e1").entraram).toBe(2);
  });

  it("valor que não é número finito também não é somado", () => {
    const r = conversaoPorEtapa(
      [oportunidade({ id: "a", etapaId: "e1", valor: Number.NaN }), oportunidade({ id: "b", etapaId: "e1", valor: 200 })],
      ETAPAS,
    );
    expect(linhaDe(r, "e1").valorEmAberto).toBe(200);
    expect(r.inconsistentes.map((i) => i.oportunidadeId)).toContain("a");
  });

  it("só oportunidade ABERTA soma em valorEmAberto", () => {
    // Somar o que já fechou faria a tela prometer dinheiro que já veio (ou
    // que já foi embora).
    const r = conversaoPorEtapa(
      [
        oportunidade({ id: "a", etapaId: "e1", valor: 100 }),
        oportunidade({ id: "b", etapaId: "e1", valor: 900, status: "ganha", fechadoEm: "2026-08-05T10:00:00Z" }),
        oportunidade({ id: "c", etapaId: "e1", valor: 900, status: "perdida", fechadoEm: "2026-08-05T10:00:00Z" }),
      ],
      ETAPAS,
    );
    expect(linhaDe(r, "e1").valorEmAberto).toBe(100);
  });

  it("o valor conta UMA vez, na etapa onde a oportunidade está hoje", () => {
    // Ela passou pela e1 e hoje está na e2. Somar o valor nas duas faria a
    // tela prometer o dobro do dinheiro que existe — e a soma do funil
    // inteiro deixaria de bater com a carteira.
    const r = conversaoPorEtapa([oportunidade({ id: "a", etapaId: "e2", valor: 500 })], ETAPAS, [
      { oportunidadeId: "a", etapaId: "e1" },
    ]);

    expect(linhaDe(r, "e1").valorEmAberto).toBe(0);
    expect(linhaDe(r, "e2").valorEmAberto).toBe(500);
    // E ela continua contando como quem entrou na e1: é o valor que não
    // se repete, não a oportunidade.
    expect(linhaDe(r, "e1").entraram).toBe(1);
  });

  it("status ilegível vira inconsistência, e a oportunidade não conta como avanço", () => {
    const r = conversaoPorEtapa([oportunidade({ id: "a", etapaId: "e3", status: "vendida" })], ETAPAS, [
      { oportunidadeId: "a", etapaId: "e1" },
    ]);
    expect(r.inconsistentes).toContainEqual({ oportunidadeId: "a", motivo: "status-ilegivel" });
    expect(linhaDe(r, "e1").avancaram).toBe(0);
  });

  it("etapa desconhecida vira inconsistência, e não some da conta em silêncio", () => {
    const r = conversaoPorEtapa([oportunidade({ id: "a", etapaId: "fantasma" })], ETAPAS);
    expect(r.inconsistentes).toContainEqual({ oportunidadeId: "a", motivo: "etapa-desconhecida" });
    expect(r.linhas.every((l) => l.entraram === 0)).toBe(true);
  });

  it("sem oportunidade nenhuma, inconsistentes é lista vazia — não é null", () => {
    expect(conversaoPorEtapa([], ETAPAS).inconsistentes).toEqual([]);
  });
});

describe("conversaoPorEtapa — a assinatura", () => {
  it("recebe DOIS parâmetros obrigatórios; as passagens são opcionais", () => {
    // A aridade é travada: quem chamar sem passagens recebe a resposta
    // honesta (`parcial: true`), e não um número inventado.
    expect(conversaoPorEtapa.length).toBe(2);
  });

  it("não altera as listas que recebe — nem a ORDEM delas", () => {
    // A lista de etapas entra FORA DE ORDEM de propósito: com ela já ordenada,
    // um `etapas.sort()` no lugar de `[...etapas].sort()` passaria despercebido
    // (o resultado seria idêntico). Foi exatamente o que um mutante mostrou.
    const oportunidades = [oportunidade({ id: "a", etapaId: "e2" })];
    const etapas = [ETAPAS[2], ETAPAS[0], ETAPAS[1]];
    const idsAntes = etapas.map((e) => e.id);
    const antes = JSON.stringify({ oportunidades, etapas });

    const r = conversaoPorEtapa(oportunidades, etapas);

    expect(etapas.map((e) => e.id), "a lista de quem chamou foi reordenada").toEqual(idsAntes);
    expect(JSON.stringify({ oportunidades, etapas })).toBe(antes);
    // E a resposta sai ordenada mesmo assim.
    expect(r.linhas.map((l) => l.ordem)).toEqual([1, 2, 3]);
  });
});

describe("cicloMedio — o número que pode não existir", () => {
  it("sem oportunidade fechada, devolve null", () => {
    expect(cicloMedio([])).toBeNull();
    expect(cicloMedio([oportunidade({ status: "aberta" })])).toBeNull();
  });

  it("com UMA fechada, devolve o ciclo dela em dias", () => {
    expect(
      cicloMedio([
        oportunidade({
          status: "ganha",
          criadoEm: "2026-08-01T00:00:00Z",
          fechadoEm: "2026-08-11T00:00:00Z",
        }),
      ]),
    ).toBe(10);
  });

  it("a média arredonda para uma casa, e 2 e 3 dias dá 2.5", () => {
    const media = cicloMedio([
      oportunidade({ id: "a", status: "ganha", criadoEm: "2026-08-01T00:00:00Z", fechadoEm: "2026-08-03T00:00:00Z" }),
      oportunidade({ id: "b", status: "perdida", criadoEm: "2026-08-01T00:00:00Z", fechadoEm: "2026-08-04T00:00:00Z" }),
    ]);
    expect(media).toBe(2.5);
  });

  it("perdida também tem ciclo — o funil aprende com o que demorou para morrer", () => {
    expect(
      cicloMedio([
        oportunidade({ status: "perdida", criadoEm: "2026-08-01T00:00:00Z", fechadoEm: "2026-08-05T00:00:00Z" }),
      ]),
    ).toBe(4);
  });

  it("fechada SEM data não entra na média, e sozinha devolve null", () => {
    // "Fechou" sem dizer quando é dado quebrado; inventar a data de hoje
    // seria pior, porque o número mudaria a cada carregamento de tela.
    expect(cicloMedio([oportunidade({ status: "ganha", fechadoEm: null })])).toBeNull();
  });

  it("data ilegível ou fechada antes de criada não entra na média", () => {
    expect(
      cicloMedio([oportunidade({ status: "ganha", criadoEm: "ontem", fechadoEm: "2026-08-05T00:00:00Z" })]),
    ).toBeNull();
    expect(
      cicloMedio([
        oportunidade({ status: "ganha", criadoEm: "2026-08-10T00:00:00Z", fechadoEm: "2026-08-01T00:00:00Z" }),
      ]),
    ).toBeNull();
  });

  it("a fechada válida sobrevive ao lixo em volta", () => {
    const media = cicloMedio([
      oportunidade({ id: "a", status: "aberta" }),
      oportunidade({ id: "b", status: "ganha", fechadoEm: null }),
      oportunidade({ id: "c", status: "ganha", criadoEm: "2026-08-01T00:00:00Z", fechadoEm: "2026-08-07T00:00:00Z" }),
    ]);
    expect(media).toBe(6);
  });
});
