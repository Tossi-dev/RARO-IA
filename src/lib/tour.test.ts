import { describe, expect, it } from "vitest";
import type { AlertaComando, Concentracao, NorteDoComando, PulsoCaixa, SaudeComposta } from "./metrics-comando";
import { montarTour, type EntradaTour } from "./tour";

// Os objetos de entrada do tour (NorteDoComando, PulsoCaixa, Concentracao,
// SaudeComposta) têm dezenas de campos e são produzidos por
// src/lib/metrics-comando.ts, que tem os próprios testes. Aqui o que está sob
// teste é OUTRA coisa: a regra de quais passos entram e o que cada um diz.
// Por isso os fixtures são parciais e afirmados com `as` — montar os objetos
// inteiros esconderia o que este arquivo realmente verifica, e duplicaria a
// cobertura que já existe do outro lado.

function norte(over: Partial<NorteDoComando> = {}): NorteDoComando {
  return {
    meta: 30000,
    pctMeta: 120,
    noRitmo: true,
    ritmoAtual: 500,
    ritmoNecessario: 0,
    projecao: 36000,
    resumo: {
      inicio: "2026-01-01",
      fim: "2026-01-31",
      faturamento: 10000,
      liquido: 9800,
      comissoes: 1000,
      despesasFixas: 2000,
      despesasVariaveis: 500,
      reembolsos: 300,
      custoTotal: 3800,
      lucro: 6000,
      margem: 60,
      qtdVendas: 4,
      ticketMedio: 2500,
    },
    ...over,
  } as NorteDoComando;
}

const pulsoSemExtrato = { temExtrato: false } as PulsoCaixa;
const pulsoComExtrato = {
  temExtrato: true,
  saldoHoje: 20000,
  reservaMinima: 5000,
  abaixoDaReserva: false,
  temCaixa: true,
} as PulsoCaixa;

const semConcentracao = { semBase: true, topNome: null, topPct: null } as Concentracao;
const semSaude = { score: null, rotuloNivel: null } as SaudeComposta;

function entrada(over: Partial<EntradaTour> = {}): EntradaTour {
  return {
    norte: norte(),
    pulso: pulsoSemExtrato,
    concentracao: semConcentracao,
    saude: semSaude,
    alertas: [],
    clientes: { total: 0, ativos: 0, emRisco: 0 },
    rotuloPeriodo: "janeiro/2026",
    ...over,
  };
}

const ids = (e: EntradaTour) => montarTour(e).map((p) => p.id);

describe("montarTour", () => {
  it("sempre abre pelo quanto a empresa vendeu e fecha em ação", () => {
    const p = ids(entrada());
    expect(p[0]).toBe("vendeu");
    // Sem alerta em aberto o último passo continua sendo sobre ação — dizer
    // "não há nada urgente" é uma resposta, não um passo faltando.
    expect(p[p.length - 1]).toBe("acao-vazia");
  });

  it("não inventa saldo quando não há extrato lançado", () => {
    expect(ids(entrada())).not.toContain("caixa");
    expect(ids(entrada({ pulso: pulsoComExtrato }))).toContain("caixa");
  });

  it("sem meta cadastrada, o passo vira convite a cadastrar — não some", () => {
    const p = montarTour(entrada({ norte: norte({ meta: null, pctMeta: null, noRitmo: null }) }));
    const passo = p.find((x) => x.id === "ritmo-sem-meta");
    expect(passo).toBeDefined();
    expect(passo?.href).toBe("/comecar");
    expect(p.map((x) => x.id)).not.toContain("ritmo");
  });

  it("sem venda no período não existe passo de lucro", () => {
    const zerado = norte({
      resumo: { ...norte().resumo, faturamento: 0, qtdVendas: 0, lucro: 0, ticketMedio: 0 },
    });
    expect(ids(entrada({ norte: zerado }))).not.toContain("sobrou");
    // mas o primeiro passo continua lá, dizendo que não houve venda
    expect(montarTour(entrada({ norte: zerado }))[0].frase).toContain("Nenhuma venda");
  });

  it("prejuízo é anunciado como notícia ruim, não como número neutro", () => {
    const perdendo = norte({ resumo: { ...norte().resumo, lucro: -2000, margem: -20 } });
    const passo = montarTour(entrada({ norte: perdendo })).find((p) => p.id === "sobrou");
    expect(passo?.tom).toBe("negativo");
    expect(passo?.frase).toContain("a mais do que entrou");
  });

  it("o alerta de maior valor vira o passo final", () => {
    const alerta = {
      id: "a1",
      titulo: "Três contas vencidas",
      detalhe: "Vencidas há mais de 10 dias.",
      acao: "Renegocie hoje.",
      valor: 4500,
      rotuloValor: "em atraso",
      href: "/financeiro/caixa",
      severidade: "critico",
    } as AlertaComando;
    const p = montarTour(entrada({ alertas: [alerta] }));
    const ultimo = p[p.length - 1];
    expect(ultimo.id).toBe("acao");
    expect(ultimo.tom).toBe("negativo");
    expect(ultimo.href).toBe("/financeiro/caixa");
  });

  it("base de clientes vazia não vira passo de clientes", () => {
    expect(ids(entrada())).not.toContain("clientes");
    expect(ids(entrada({ clientes: { total: 10, ativos: 8, emRisco: 2 } }))).toContain("clientes");
  });

  it("nenhum passo nasce sem pergunta, valor e frase", () => {
    const p = montarTour(
      entrada({
        pulso: pulsoComExtrato,
        clientes: { total: 10, ativos: 8, emRisco: 0 },
      })
    );
    for (const passo of p) {
      expect(passo.pergunta.length).toBeGreaterThan(0);
      expect(passo.valor.length).toBeGreaterThan(0);
      expect(passo.frase.length).toBeGreaterThan(0);
      expect(passo.detalhe.length).toBeGreaterThan(0);
    }
  });
});
