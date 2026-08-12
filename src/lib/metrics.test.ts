// Testes das funções puras (aceite do checker) — vitest
import { describe, expect, it } from "vitest";
import { calcComissao, calcLiquido } from "./domain";
import { healthScore } from "./health";
import {
  engajamentoPct,
  faixasReativacao,
  faturamentoSemanal,
  mesFinanceiro,
  orcadoRealizado,
  upsellResumo,
  waterfallResultado,
} from "./metrics";
import type { Aluno, Atividade, DatasetFinanceiro, Matricula } from "./types";
import { linkWhatsApp, normalizarTelefone } from "./whatsapp";

const REF = new Date(2026, 6, 16); // 16/07/2026

function mat(over: Partial<Matricula>): Matricula {
  return {
    id: "m1",
    alunoId: "a1",
    produtoId: "p1",
    lancamentoId: null,
    afiliadoId: null,
    turmaId: null,
    valor: 1000,
    formaPgto: "pix",
    valorLiquido: 1000,
    data: "2026-07-10",
    statusPagamento: "pago",
    origem: "manual",
    isUpsell: false,
    ...over,
  };
}

function aluno(over: Partial<Aluno>): Aluno {
  return {
    id: "a1",
    nome: "Teste",
    telefone: "11999990000",
    email: "",
    statusFunil: "novo",
    estagioId: null,
    origem: "",
    primeiroContato: "2026-01-10",
    observacoes: "",
    ...over,
  };
}

const dsVazio: DatasetFinanceiro = { matriculas: [], despesas: [], comissoes: [], reembolsos: [] };

describe("domínio", () => {
  it("calcLiquido aplica a taxa da forma de pagamento", () => {
    expect(calcLiquido(1000, "pix")).toBe(1000);
    expect(calcLiquido(1000, "debito")).toBe(983.1);
    expect(calcLiquido(1000, "credito_7x12x")).toBe(960.1);
  });
  it("calcComissao aplica o percentual", () => {
    expect(calcComissao(2997, 25)).toBe(749.25);
  });
});

describe("whatsapp", () => {
  it("normaliza telefone brasileiro e monta o link wa.me", () => {
    expect(normalizarTelefone("11 99999-0000")).toBe("5511999990000");
    expect(normalizarTelefone("5511999990000")).toBe("5511999990000");
    expect(linkWhatsApp("11999990000")).toBe("https://wa.me/5511999990000");
    expect(linkWhatsApp("11999990000", "oi")).toContain("?text=oi");
  });
});

describe("mesFinanceiro / waterfall", () => {
  const ds: DatasetFinanceiro = {
    matriculas: [
      mat({ id: "m1", valor: 1000, valorLiquido: 980, data: "2026-07-05" }),
      mat({ id: "m2", valor: 500, valorLiquido: 500, data: "2026-07-08" }),
      mat({ id: "m3", valor: 300, valorLiquido: 300, data: "2026-07-09", statusPagamento: "pendente" }),
    ],
    despesas: [
      { id: "d1", data: "2026-07-03", descricao: "x", categoria: "Equipe", tipo: "fixa", valor: 200 },
      { id: "d2", data: "2026-07-04", descricao: "y", categoria: "Tráfego pago", tipo: "variavel", valor: 100 },
    ],
    comissoes: [{ id: "c1", matriculaId: "m1", afiliadoId: "af", pct: 10, valor: 100, data: "2026-07-05" }],
    reembolsos: [{ id: "r1", matriculaId: "m2", valor: 50, data: "2026-07-10", motivo: "" }],
  };
  const m = mesFinanceiro(ds, "2026-07");

  it("pendente não conta; bruto/líquido/custos/lucro corretos", () => {
    expect(m.faturamento).toBe(1500);
    expect(m.liquido).toBe(1480);
    expect(m.custoTotal).toBe(450); // 100 comissão + 200 fixa + 100 variável + 50 reembolso
    expect(m.lucro).toBe(1030);
  });

  it("waterfall fecha exatamente no lucro do mês", () => {
    const steps = waterfallResultado(m);
    const acumulado = steps
      .filter((s) => s.tipo !== "total" || s.label === "Bruto")
      .reduce((s, x) => s + x.valor, 0);
    expect(+acumulado.toFixed(2)).toBe(m.lucro);
    expect(steps[steps.length - 1].valor).toBe(m.lucro);
  });
});

describe("faixas de reativação (1-2 / 3-7 / 8-15 / 15-60 / 60+)", () => {
  const alunos = [
    aluno({ id: "a1", nome: "Um" }),
    aluno({ id: "a2", nome: "Dois" }),
    aluno({ id: "a3", nome: "Três" }),
    aluno({ id: "a4", nome: "Quatro" }),
    aluno({ id: "a5", nome: "Cinco" }),
    aluno({ id: "a6", nome: "Hoje" }),
  ];
  const at = (alunoId: string, data: string): Atividade => ({
    id: `${alunoId}-at`, alunoId, tipo: "whatsapp", titulo: "t", detalhe: "", data,
  });
  const atividades = [
    at("a1", "2026-07-15"), // 1 dia
    at("a2", "2026-07-11"), // 5 dias
    at("a3", "2026-07-06"), // 10 dias
    at("a4", "2026-06-01"), // 45 dias
    at("a5", "2026-03-01"), // 137 dias
    at("a6", "2026-07-16"), // hoje → fora
  ];
  const faixas = faixasReativacao(alunos, atividades, [], REF);
  const nomes = (f: string) => faixas.find((x) => x.faixa === f)!.alunos.map((a) => a.nome);

  it("classifica cada aluno na faixa certa e exclui contato de hoje", () => {
    expect(nomes("1-2")).toEqual(["Um"]);
    expect(nomes("3-7")).toEqual(["Dois"]);
    expect(nomes("8-15")).toEqual(["Três"]);
    expect(nomes("15-60")).toEqual(["Quatro"]);
    expect(nomes("60+")).toEqual(["Cinco"]);
    expect(faixas.flatMap((f) => f.alunos).find((a) => a.nome === "Hoje")).toBeUndefined();
  });
});

describe("upsell e semana", () => {
  const ds: DatasetFinanceiro = {
    ...dsVazio,
    matriculas: [
      mat({ id: "m1", valor: 297, data: "2026-07-14" }),
      mat({ id: "m2", valor: 2997, data: "2026-07-15", isUpsell: true }),
      mat({ id: "m3", valor: 500, data: "2026-07-02" }),
    ],
  };
  it("upsellResumo calcula valor e share do mês", () => {
    const u = upsellResumo(ds, REF);
    expect(u.valorMes).toBe(2997);
    expect(u.qtdMes).toBe(1);
    expect(u.pctFaturamento).toBeCloseTo((2997 / 3794) * 100, 1);
  });
  it("faturamentoSemanal soma só os últimos 7 dias", () => {
    const s = faturamentoSemanal(ds, REF);
    expect(s.semanaAtual).toBe(3294); // dias 10–16
    expect(s.porDia).toHaveLength(7);
  });
});

describe("orçado × realizado", () => {
  it("marca estouro quando realizado > previsto", () => {
    const ds: DatasetFinanceiro = {
      ...dsVazio,
      despesas: [
        { id: "d1", data: "2026-07-05", descricao: "ads", categoria: "Tráfego pago", tipo: "variavel", valor: 1500 },
      ],
    };
    const linhas = orcadoRealizado(ds, [{ categoria: "Tráfego pago", periodo: "2026-07", valorPrevisto: 1000 }], "2026-07");
    expect(linhas[0].estourou).toBe(true);
    expect(linhas[0].pct).toBe(150);
  });
});

describe("health score e engajamento", () => {
  it("sem dados não existe score — a nota some, não vira zero", () => {
    const s = healthScore(dsVazio, [], [], REF);
    expect(s.score).toBeNull();
    expect(s.fatores).toHaveLength(5);
  });
  it("com dados o score fica entre 0 e 100", () => {
    const ds: DatasetFinanceiro = { ...dsVazio, matriculas: [mat({ id: "m1", data: "2026-07-05" })] };
    const s = healthScore(ds, [aluno({ id: "a1", statusFunil: "novo" })], [], REF);
    expect(s.score).toBeGreaterThanOrEqual(0);
    expect(s.score).toBeLessThanOrEqual(100);
  });
  it("engajamentoPct = interações / views", () => {
    expect(
      engajamentoPct({
        conteudoId: "c", coletadoEm: "", views: 1000, likes: 50, comentarios: 10,
        compartilhamentos: 20, salvamentos: 20, alcance: 0, tempoMedioSeg: 0, retencaoMedia: 0,
      })
    ).toBe(10);
    expect(engajamentoPct(null)).toBe(0);
  });
});

// ---------- P0 fundação: pace, delta e lente por braço ----------

import { bracoDaVenda, deltaPct, filtrarPorBraco, paceMeta, receitaPorBraco } from "./metrics";
import type { Afiliado } from "./types";

const AFILIADOS_P0: Afiliado[] = [
  { id: "af-c", nome: "Corpo Afiliado", braco: "corpo", pctPadrao: 25, ativo: true },
  { id: "af-m", nome: "Mente Afiliada", braco: "mente", pctPadrao: 20, ativo: true },
];

describe("paceMeta", () => {
  it("no ritmo: metade da meta na metade do mês projeta 100%", () => {
    const p = paceMeta(15000, 30000, 15, 30);
    expect(p.projecao).toBe(30000);
    expect(p.pctMeta).toBe(50);
    expect(p.pctTempo).toBe(50);
    expect(p.gapProjetado).toBe(0);
    expect(p.noRitmo).toBe(true);
  });
  it("atrás do ritmo: projeta abaixo e aponta o gap", () => {
    const p = paceMeta(6000, 30000, 15, 30);
    expect(p.projecao).toBe(12000);
    expect(p.gapProjetado).toBe(-18000);
    expect(p.noRitmo).toBe(false);
  });
  it("dia 0/limites não dividem por zero", () => {
    const p = paceMeta(1000, 30000, 0, 30);
    expect(p.projecao).toBe(30000); // clampa para o dia 1
    expect(paceMeta(0, 0, 10, 30).noRitmo).toBe(true); // sem meta = sem alarme
  });
});

describe("deltaPct", () => {
  it("calcula variação e devolve null sem base", () => {
    expect(deltaPct(120, 100)).toBe(20);
    expect(deltaPct(80, 100)).toBe(-20);
    expect(deltaPct(50, 0)).toBeNull();
  });
});

describe("lente por braço", () => {
  const vendas = [
    mat({ id: "v1", braco: "corpo", valor: 297, statusPagamento: "pago" }),
    mat({ id: "v2", afiliadoId: "af-m", braco: null, valor: 2997, statusPagamento: "pago" }),
    mat({ id: "v3", braco: "espirito", valor: 9900, statusPagamento: "pago" }),
    mat({ id: "v4", braco: "corpo", valor: 297, statusPagamento: "pendente" }),
  ];
  it("bracoDaVenda usa o campo direto e cai para o braço do afiliado", () => {
    expect(bracoDaVenda(vendas[0], AFILIADOS_P0)).toBe("corpo");
    expect(bracoDaVenda(vendas[1], AFILIADOS_P0)).toBe("mente");
  });
  it("filtrarPorBraco respeita 'todos' e filtra por braço (incl. fallback)", () => {
    expect(filtrarPorBraco(vendas, AFILIADOS_P0, "todos")).toHaveLength(4);
    expect(filtrarPorBraco(vendas, AFILIADOS_P0, "corpo").map((v) => v.id)).toEqual(["v1", "v4"]);
    expect(filtrarPorBraco(vendas, AFILIADOS_P0, "mente").map((v) => v.id)).toEqual(["v2"]);
  });
  it("receitaPorBraco soma só vendas pagas", () => {
    const r = receitaPorBraco(vendas, AFILIADOS_P0);
    const corpo = r.find((x) => x.braco === "corpo")!;
    expect(corpo.receita).toBe(297); // v4 pendente fica de fora
    expect(corpo.vendas).toBe(1);
    expect(r.find((x) => x.braco === "espirito")!.receita).toBe(9900);
  });
});

// ============================================================
// P1 — camada de caixa (competência × caixa)
// Todos os números abaixo são conferidos à mão no próprio teste.
// ============================================================

import {
  burnRateMensal,
  comissoesAPagar,
  dreGerencial,
  fluxoDeCaixaDireto,
  idsVendasFiltradas,
  inadimplencia,
  filtrarMovimentos,
  margemDeContribuicao,
  pontoDeEquilibrio,
  posicaoCapitalDeGiro,
  projecaoCaixa13Semanas,
  runwayMeses,
  saldoCaixaAte,
  taxaChargeback,
  taxaReembolso,
  waterfallBrutoParaLucro,
} from "./metrics";
import type { DatasetCaixa, Meta, MovimentoCaixa, Pagavel, Produto, Recebivel } from "./types";

const REF_P1 = new Date(2026, 6, 16); // quinta, 16/07/2026 (segunda da semana = 13/07)

// --- competência: 3 vendas em julho, 1 delas reembolsada ---
const dsP1: DatasetFinanceiro = {
  matriculas: [
    mat({ id: "v1", produtoId: "p1", valor: 1000, valorLiquido: 970, data: "2026-07-05", braco: "corpo" }),
    mat({ id: "v2", produtoId: "p2", valor: 2000, valorLiquido: 1940, data: "2026-07-10", braco: "mente", afiliadoId: "af-m" }),
    mat({ id: "v3", produtoId: "p1", valor: 500, valorLiquido: 500, data: "2026-07-12", braco: "corpo", statusPagamento: "reembolsado" }),
  ],
  // 1000+2000+500 = 3500 bruto | 970+1940+500 = 3410 líquido → 90 de taxa
  comissoes: [{ id: "c1", matriculaId: "v2", afiliadoId: "af-m", pct: 20, valor: 400, data: "2026-07-10" }],
  despesas: [
    { id: "d1", data: "2026-07-01", descricao: "Equipe", categoria: "Equipe", tipo: "fixa", valor: 800 },
    { id: "d2", data: "2026-07-08", descricao: "Meta Ads", categoria: "Tráfego pago", tipo: "variavel", valor: 300 },
  ],
  reembolsos: [{ id: "r1", matriculaId: "v3", valor: 500, data: "2026-07-12", motivo: "Arrependimento" }],
};

const PRODUTOS_P1: Produto[] = [
  { id: "p1", nome: "Protocolo", tipo: "low_ticket", precoBase: 500, ativo: true, braco: null, categoria: "curso" },
  { id: "p2", nome: "Mentoria", tipo: "mentoria", precoBase: 2000, ativo: true, braco: null, categoria: "mentoria" },
];

const movimentosP1: MovimentoCaixa[] = [
  // junho: 600 realizados → viram saldo inicial do recorte de julho
  { id: "mv0", direcao: "entrada", categoria: "vendas", contaId: "cb1", descricao: "Venda de junho", valor: 600, dataCompetencia: "2026-06-20", dataCaixa: "2026-06-20", status: "realizado", braco: "corpo", origem: "matricula", origemId: "v0" },
  { id: "mv1", direcao: "entrada", categoria: "vendas", contaId: "cb1", descricao: "v1", valor: 970, dataCompetencia: "2026-07-05", dataCaixa: "2026-07-05", status: "realizado", braco: "corpo", origem: "matricula", origemId: "v1" },
  // v2 só cai no D+14 → competência em julho, caixa em julho mas ainda previsto
  { id: "mv2", direcao: "entrada", categoria: "vendas", contaId: "cb1", descricao: "v2", valor: 1940, dataCompetencia: "2026-07-10", dataCaixa: "2026-07-24", status: "previsto", braco: "mente", origem: "matricula", origemId: "v2" },
  { id: "mv3", direcao: "saida", categoria: "trafego", contaId: "cb1", descricao: "Meta Ads", valor: 300, dataCompetencia: "2026-07-08", dataCaixa: "2026-07-08", status: "realizado", braco: null, origem: "despesa", origemId: "d2" },
  { id: "mv4", direcao: "saida", categoria: "folha_prolabore", contaId: "cb1", descricao: "Equipe", valor: 800, dataCompetencia: "2026-07-01", dataCaixa: "2026-07-01", status: "realizado", braco: null, origem: "despesa", origemId: "d1" },
  { id: "mv5", direcao: "saida", categoria: "reembolsos", contaId: "cb1", descricao: "Reembolso v3", valor: 500, dataCompetencia: "2026-07-12", dataCaixa: "2026-07-12", status: "realizado", braco: "corpo", origem: "reembolso", origemId: "r1" },
  { id: "mv6", direcao: "saida", categoria: "comissoes", contaId: "cb1", descricao: "Comissão af-m", valor: 400, dataCompetencia: "2026-07-10", dataCaixa: "2026-08-09", status: "previsto", braco: "mente", origem: "comissao", origemId: "c1" },
];

const recebiveisP1: Recebivel[] = [
  { id: "rc1", origem: "matricula", origemId: "v2", descricao: "Mentoria 1/1", valor: 1940, vencimento: "2026-07-24", dataRecebimento: null, status: "a_vencer", gateway: "manual", diasLiberacao: 14, parcela: 1, totalParcelas: 1, braco: "mente", contaId: "cb1" },
  { id: "rc2", origem: "matricula", origemId: "v1", descricao: "Protocolo 1/1", valor: 970, vencimento: "2026-07-05", dataRecebimento: "2026-07-05", status: "recebido", gateway: "manual", diasLiberacao: 0, parcela: 1, totalParcelas: 1, braco: "corpo", contaId: "cb1" },
  { id: "rc3", origem: "matricula", origemId: "v3", descricao: "Protocolo 1/1", valor: 500, vencimento: "2026-06-30", dataRecebimento: null, status: "atrasado", gateway: "manual", diasLiberacao: 0, parcela: 1, totalParcelas: 1, braco: "corpo", contaId: "cb1" },
];

const pagaveisP1: Pagavel[] = [
  { id: "pg1", categoria: "comissoes", fornecedor: "Mente Afiliada", descricao: "Comissão 20%", valor: 400, vencimento: "2026-08-09", dataPagamento: null, status: "a_vencer", tipo: "variavel", braco: "mente", origem: "comissao", origemId: "c1", contaId: "cb1" },
  { id: "pg2", categoria: "impostos", fornecedor: "Receita Federal", descricao: "DAS 2026-07", valor: 350, vencimento: "2026-08-20", dataPagamento: null, status: "a_vencer", tipo: "variavel", braco: null, origem: "manual", origemId: null, contaId: "cb1" },
  { id: "pg3", categoria: "trafego", fornecedor: "Meta Ads", descricao: "Fatura vencida", valor: 300, vencimento: "2026-07-10", dataPagamento: null, status: "atrasado", tipo: "variavel", braco: null, origem: "manual", origemId: null, contaId: "cb1" },
];

const dcP1: DatasetCaixa = {
  contas: [{ id: "cb1", nome: "Conta principal", tipo: "corrente", saldoInicial: 1000, dataSaldoInicial: "2026-05-31", ativa: true, braco: null }],
  movimentos: movimentosP1,
  recebiveis: recebiveisP1,
  pagaveis: pagaveisP1,
  chargebacks: [
    { id: "cg1", matriculaId: "v1", valor: 100, data: "2026-07-14", dataResolucao: "2026-07-15", motivo: "fraude", status: "perdido", gateway: "manual", detalhe: "", braco: "corpo" },
    { id: "cg2", matriculaId: "v2", valor: 200, data: "2026-07-15", dataResolucao: null, motivo: "nao_reconhecido", status: "aberto", gateway: "manual", detalhe: "", braco: "mente" },
  ],
  parametros: {
    id: "pf1",
    aliquotaImposto: 10,
    regimeTributario: "simples",
    saldoInicialCaixa: 1000,
    dataSaldoInicial: "2026-05-31",
    custoFixoMensal: 800,
    reservaMinimaCaixa: 2000,
    atualizadoEm: "2026-07-16T09:00:00.000Z",
  },
};

const JULHO = { inicio: "2026-07-01", fim: "2026-07-31" };

describe("P1 — filtros da camada de caixa", () => {
  it("idsVendasFiltradas recorta por produto e por canal", () => {
    // p1 = v1 e v3; todas são perpétuas (sem lançamento)
    expect([...idsVendasFiltradas(dsP1.matriculas, AFILIADOS_P0, { produtoId: "p1" })].sort()).toEqual(["v1", "v3"]);
    expect(idsVendasFiltradas(dsP1.matriculas, AFILIADOS_P0, { canal: "perpetuo" }).size).toBe(3);
    expect(idsVendasFiltradas(dsP1.matriculas, AFILIADOS_P0, { canal: "lancamento" }).size).toBe(0);
    expect([...idsVendasFiltradas(dsP1.matriculas, AFILIADOS_P0, { afiliadoId: "af-m" })]).toEqual(["v2"]);
  });
  it("filtrarMovimentos aplica período, braço e recorte por venda", () => {
    // mv0 é de junho e mv6 cai no caixa só em agosto (data de CAIXA, não de competência)
    expect(filtrarMovimentos(movimentosP1, JULHO).map((m) => m.id)).toEqual(["mv1", "mv2", "mv3", "mv4", "mv5"]);
    expect(filtrarMovimentos(movimentosP1, { ...JULHO, braco: "mente" }).map((m) => m.id)).toEqual(["mv2"]);
    expect(filtrarMovimentos(movimentosP1, { braco: "mente" }).map((m) => m.id)).toEqual(["mv2", "mv6"]);
    // com recorte por venda, só sobra o que dá para amarrar à venda v1
    expect(filtrarMovimentos(movimentosP1, { vendasIds: new Set(["v1"]) }).map((m) => m.id)).toEqual(["mv1"]);
  });
});

describe("P1 — fluxo de caixa direto", () => {
  it("saldoCaixaAte soma só o realizado", () => {
    // 1000 inicial + 600 (jun) + 970 (v1) − 300 − 800 − 500 = 970
    expect(saldoCaixaAte(dcP1, "2026-07-16")).toBe(970);
    expect(saldoCaixaAte(dcP1, "2026-06-30")).toBe(1600); // 1000 + 600
  });
  it("fluxoDeCaixaDireto separa entradas/saídas e fecha o saldo do período", () => {
    const f = fluxoDeCaixaDireto(dcP1, JULHO);
    expect(f.totalEntradas).toBe(970); // mv2 é previsto: não é caixa
    expect(f.totalSaidas).toBe(1600); // 300 + 800 + 500
    expect(f.fluxoLiquido).toBe(-630);
    expect(f.saldoInicial).toBe(1600);
    expect(f.saldoFinal).toBe(970);
    expect(f.saidas.map((l) => l.categoria)).toEqual(["folha_prolabore", "reembolsos", "trafego"]);
    expect(f.saidas[0].pct).toBe(50); // 800 de 1600
    expect(f.entradas[0].pct).toBe(100);
  });
});

describe("P1 — projeção de caixa 13 semanas", () => {
  const p = projecaoCaixa13Semanas(dcP1, REF_P1);
  it("começa na segunda-feira da semana de referência e tem 13 semanas", () => {
    expect(p).toHaveLength(13);
    expect(p[0].inicio).toBe("2026-07-13");
    expect(p[0].fim).toBe("2026-07-19");
    expect(p[12].fim).toBe("2026-10-11");
  });
  it("semana 1 absorve o vencido e o saldo acumula até o fim do horizonte", () => {
    // s1: 970 + rc3 (500 vencido) − pg3 (300 vencido) = 1170
    expect(p[0].entradas).toBe(500);
    expect(p[0].saidas).toBe(300);
    expect(p[0].saldoAcumulado).toBe(1170);
    expect(p[1].entradas).toBe(1940); // rc1 vence 24/07
    expect(p[1].saldoAcumulado).toBe(3110);
    expect(p[3].saidas).toBe(400); // comissão vence 09/08
    expect(p[3].saldoAcumulado).toBe(2710);
    expect(p[5].saidas).toBe(350); // DAS vence 20/08
    expect(p[12].saldoAcumulado).toBe(2360);
    expect(p.some((s) => s.negativo)).toBe(false);
  });
});

describe("P1 — DRE gerencial e cascata", () => {
  const dre = dreGerencial(dsP1, dcP1, "2026-07");
  it("desce do bruto ao lucro operacional em competência", () => {
    expect(dre.receitaBruta).toBe(3500);
    expect(dre.taxasGateway).toBe(90); // 3500 − 3410
    expect(dre.deducoes).toBe(600); // 500 reembolso + 100 chargeback PERDIDO (o aberto não conta)
    expect(dre.impostos).toBe(350); // 10% de 3500
    expect(dre.receitaLiquida).toBe(2550); // 3500 − 600 − 350
    expect(dre.custosVariaveis).toBe(790); // 90 taxas + 400 comissões + 300 tráfego
    expect(dre.margemContribuicao).toBe(1760); // 2550 − 790
    expect(dre.custosFixos).toBe(800);
    expect(dre.lucroOperacional).toBe(960); // 1760 − 800
    expect(dre.margemLiquidaPct).toBe(27.43); // 960/3500
  });
  it("waterfallBrutoParaLucro fecha o bruto no lucro", () => {
    const w = waterfallBrutoParaLucro(dre);
    expect(w).toHaveLength(8);
    const reducoes = w.filter((s) => s.tipo === "reducao").reduce((s, x) => s + x.valor, 0);
    expect(w[0].valor + reducoes).toBe(960); // 3500 − 2540 = 960
    expect(w[w.length - 1].valor).toBe(960);
  });
});

describe("P1 — margem de contribuição e ponto de equilíbrio", () => {
  it("margemDeContribuicao rateia os variáveis pela participação na receita", () => {
    const mc = margemDeContribuicao(dsP1, dcP1, "2026-07", PRODUTOS_P1);
    expect(mc.custosVariaveis).toBe(1740); // 790 + 350 impostos + 600 deduções
    expect(mc.valor).toBe(1760); // 3500 − 1740
    expect(mc.pct).toBe(50.29);
    expect(mc.porProduto.map((p) => p.produtoId)).toEqual(["p2", "p1"]);
    expect(mc.porProduto[0].receita).toBe(2000);
    expect(mc.porProduto[1].receita).toBe(1500); // v1 (1000) + v3 (500)
  });
  it("pontoDeEquilibrio = custo fixo ÷ MC%", () => {
    const pe = pontoDeEquilibrio(dsP1, dcP1, "2026-07");
    expect(pe.custosFixos).toBe(800);
    expect(pe.mcPct).toBe(50.29);
    expect(pe.faturamentoEquilibrio).toBe(1590.77); // 800 / 0.5029
    expect(pe.folga).toBe(1909.23); // 3500 − 1590.77
    expect(pe.vendasNecessarias).toBe(2); // ceil(1590.77 / 1166.67)
    expect(pe.atingido).toBe(true);
  });
});

describe("P1 — burn rate e runway", () => {
  it("burnRateMensal compara entradas e saídas realizadas por mês", () => {
    const b = burnRateMensal(dcP1, 2, REF_P1);
    expect(b.meses.map((m) => m.periodo)).toEqual(["2026-06", "2026-07"]);
    expect(b.meses[0].entradas).toBe(600);
    expect(b.meses[1].saidas).toBe(1600);
    expect(b.entradaMedia).toBe(785); // (600 + 970) / 2
    expect(b.saidaMedia).toBe(800); // (0 + 1600) / 2
    expect(b.burnMedio).toBe(15);
    expect(b.queimandoCaixa).toBe(true);
  });
  it("runwayMeses divide o caixa pelo burn e acusa reserva mínima furada", () => {
    const r = runwayMeses(dcP1, 2, REF_P1);
    expect(r.saldoAtual).toBe(970);
    expect(r.burnMedio).toBe(15);
    expect(r.meses).toBe(64.67); // 970 / 15
    expect(r.abaixoDaReserva).toBe(true); // 970 < 2000
    expect(r.dataEsgotamento).not.toBeNull();
  });
  it("operação que gera caixa não tem data de esgotamento", () => {
    const dcLucro: DatasetCaixa = { ...dcP1, movimentos: [movimentosP1[0], movimentosP1[1]] };
    const r = runwayMeses(dcLucro, 2, REF_P1);
    expect(r.burnMedio).toBe(-785); // só entradas
    expect(r.meses).toBeNull();
    expect(r.dataEsgotamento).toBeNull();
  });
});

describe("P1 — capital de giro e comissões a pagar", () => {
  it("posicaoCapitalDeGiro soma caixa + a receber − a pagar", () => {
    const cg = posicaoCapitalDeGiro(dcP1, REF_P1);
    expect(cg.caixa).toBe(970);
    expect(cg.aReceber).toBe(2440); // 1940 + 500
    expect(cg.aReceberVencido).toBe(500);
    expect(cg.aPagar).toBe(1050); // 400 + 350 + 300
    expect(cg.aPagarVencido).toBe(300);
    expect(cg.capitalDeGiro).toBe(2360);
    expect(cg.indiceLiquidez).toBe(3.25); // 3410 / 1050
    expect(cg.saldoDescoberto).toBe(false);
  });
  it("comissoesAPagar agrupa por afiliado e separa vencido de a vencer", () => {
    const c = comissoesAPagar(dcP1, AFILIADOS_P0, REF_P1);
    expect(c.total).toBe(400);
    expect(c.aVencer).toBe(400); // vence 09/08, ainda não venceu em 16/07
    expect(c.vencido).toBe(0);
    expect(c.porAfiliado).toHaveLength(1);
    expect(c.porAfiliado[0].afiliadoId).toBe("af-m");
    expect(c.porAfiliado[0].qtd).toBe(1);
  });
});

describe("P1 — reembolso, chargeback e inadimplência", () => {
  it("taxaReembolso mede o que voltou por pedido do cliente", () => {
    const t = taxaReembolso(dsP1, JULHO);
    expect(t.qtdVendas).toBe(3);
    expect(t.faturamento).toBe(3500);
    expect(t.valorReembolsado).toBe(500);
    expect(t.taxaQtd).toBe(33.33); // 1 de 3
    expect(t.taxaValor).toBe(14.29); // 500 / 3500
  });
  it("taxaChargeback separa aberto/ganho/perdido e acusa o teto de 1%", () => {
    const t = taxaChargeback(dsP1, dcP1, JULHO);
    expect(t.qtd).toBe(2);
    expect(t.valor).toBe(300);
    expect(t.perdidos).toBe(1);
    expect(t.abertos).toBe(1);
    expect(t.valorPerdido).toBe(100); // só o perdido sai do caixa
    expect(t.taxaQtd).toBe(66.67);
    expect(t.taxaValor).toBe(8.57); // 300 / 3500
    expect(t.acimaDoLimite).toBe(true);
  });
  it("inadimplencia monta o aging da carteira em aberto", () => {
    const i = inadimplencia(dcP1, REF_P1);
    expect(i.valorEmAberto).toBe(2440); // rc1 + rc3 (rc2 já foi recebido)
    expect(i.valorAtrasado).toBe(500);
    expect(i.qtdAtrasada).toBe(1);
    expect(i.taxa).toBe(20.49); // 500 / 2440
    expect(i.diasMedioAtraso).toBe(16); // 30/06 → 16/07
    expect(i.aging.find((x) => x.faixa === "16-30 dias")!.valor).toBe(500);
    expect(i.aging.find((x) => x.faixa === "1-15 dias")!.valor).toBe(0);
  });
});

// ============================================================
// P1 — Onda C · Módulo F (complementos de caixa/DRE)
// Mesma disciplina: todo número conferido à mão no próprio teste.
// ============================================================

import {
  agendaCaixa,
  agingPagaveis,
  agingRecebiveis,
  breakEvenUnidades,
  comissaoPctReceita,
  fluxoPrevistoRealizado,
  linhasDre,
  motivosReembolso,
  prazoMedioRecebimento,
  projecaoCaixaCenarios,
  rankingAfiliadosMargem,
  reembolsosPorProduto,
  saldoRetidoPorGateway,
  serieDre,
  serieRisco,
  serieSaldoCaixa,
  waterfallPonteDeCaixa,
} from "./metrics";

describe("P1/C — fluxo de caixa: saldo diário, previsto × realizado e ponte", () => {
  it("serieSaldoCaixa parte do saldo anterior à janela e só usa realizado", () => {
    const s = serieSaldoCaixa(dcP1, 5, REF_P1);
    expect(s).toHaveLength(5);
    expect(s[0].data).toBe("2026-07-12");
    expect(s[4].data).toBe("2026-07-16");
    // saldo em 11/07 = 1000 + 600 + 970 − 800 − 300 = 1470; em 12/07 sai o reembolso
    expect(s[0].saidas).toBe(500);
    expect(s[0].saldo).toBe(970);
    // mv2 (1940) é previsto e nunca aparece na curva do extrato
    expect(s.reduce((a, p) => a + p.entradas, 0)).toBe(0);
    expect(s[4].saldo).toBe(saldoCaixaAte(dcP1, "2026-07-16"));
  });

  it("fluxoPrevistoRealizado separa o que caiu do que ainda é promessa", () => {
    const l = fluxoPrevistoRealizado(dcP1, JULHO);
    expect(l.map((x) => x.categoria)).toEqual(["vendas", "folha_prolabore", "reembolsos", "trafego"]);
    const vendas = l[0];
    expect(vendas.direcao).toBe("entrada");
    expect(vendas.realizado).toBe(970);
    expect(vendas.previsto).toBe(1940); // v2 só cai no D+14
    expect(vendas.desvio).toBe(-970);
    expect(vendas.desvioPct).toBe(-50);
    // sem previsão não existe desvio percentual (evita divisão por zero virar 100%)
    expect(l[3].previsto).toBe(0);
    expect(l[3].desvioPct).toBeNull();
  });

  it("waterfallPonteDeCaixa fecha do saldo inicial no saldo final", () => {
    const fx = fluxoDeCaixaDireto(dcP1, JULHO);
    const w = waterfallPonteDeCaixa(fx);
    expect(w).toHaveLength(6); // inicial + 1 entrada + 3 saídas + final
    expect(w[0]).toEqual({ label: "Saldo inicial", valor: 1600, tipo: "total" });
    expect(w[1]).toEqual({ label: "Vendas", valor: 970, tipo: "aumento" });
    expect(w[2].valor).toBe(-800);
    expect(w[w.length - 1].valor).toBe(970);
    // 1600 + 970 − 800 − 500 − 300 = 970
    expect(w.slice(1, -1).reduce((s, p) => s + p.valor, 1600)).toBe(970);
  });

  it("waterfallPonteDeCaixa agrupa a cauda em 'Outras' quando topN aperta", () => {
    const w = waterfallPonteDeCaixa(fluxoDeCaixaDireto(dcP1, JULHO), 1);
    expect(w.map((p) => p.label)).toEqual([
      "Saldo inicial",
      "Vendas",
      "Folha e pró-labore",
      "Outras",
      "Saldo final",
    ]);
    expect(w[3].valor).toBe(-800); // 500 reembolso + 300 tráfego
  });
});

describe("P1/C — agenda de caixa e cenários da projeção", () => {
  it("agendaCaixa empilha o vencido em hoje e acumula o saldo dia a dia", () => {
    const a = agendaCaixa(dcP1, 90, REF_P1);
    expect(a.map((d) => d.data)).toEqual(["2026-07-16", "2026-07-24", "2026-08-09", "2026-08-20"]);
    // rc3 (venceu 30/06) e pg3 (venceu 10/07) caem no dia de hoje
    expect(a[0].entradas).toBe(500);
    expect(a[0].saidas).toBe(300);
    expect(a[0].itens.every((i) => i.vencido)).toBe(true);
    expect(a[0].saldoAcumulado).toBe(1170); // 970 + 200
    expect(a[1].saldoAcumulado).toBe(3110);
    // fecha no mesmo número da projeção de 13 semanas
    expect(a[3].saldoAcumulado).toBe(2360);
  });

  it("projecaoCaixaCenarios estressa só as entradas — as saídas já estão contratadas", () => {
    const c = projecaoCaixaCenarios(dcP1, REF_P1);
    expect(c).toHaveLength(13);
    expect(c[0].label).toBe("S1");
    expect(c[0].base).toBe(1170);
    expect(c[0].otimista).toBe(1270); // 970 + 500×1,2 − 300
    expect(c[0].pessimista).toBe(1070); // 970 + 500×0,8 − 300
    expect(c[1].otimista).toBe(3598); // + 1940×1,2
    expect(c[1].pessimista).toBe(2622); // + 1940×0,8
    expect(c[12].base).toBe(2360);
    expect(c[12].pessimista).toBe(1872); // 2622 − 400 − 350
  });
});

describe("P1/C — DRE: série mensal e análise vertical/horizontal", () => {
  it("serieDre roda o DRE mês a mês sem misturar regimes", () => {
    const s = serieDre(dsP1, dcP1, 2, REF_P1);
    expect(s.map((d) => d.periodo)).toEqual(["2026-06", "2026-07"]);
    expect(s[0].receitaBruta).toBe(0); // mv0 é caixa de junho, não competência
    expect(s[1].lucroOperacional).toBe(960);
  });

  it("linhasDre monta a cascata com AV sobre a receita bruta", () => {
    const dre = dreGerencial(dsP1, dcP1, "2026-07");
    const l = linhasDre(dre);
    expect(l).toHaveLength(10);
    expect(l[0].rotulo).toBe("Receita bruta");
    expect(l[0].av).toBe(100);
    expect(l[0].ah).toBeNull(); // sem período anterior não há AH
    const liquida = l.find((x) => x.rotulo.includes("Receita líquida"))!;
    expect(liquida.valor).toBe(2550);
    expect(liquida.av).toBe(72.86);
    expect(liquida.destaque).toBe(true);
    expect(l[l.length - 1].valor).toBe(960);
    expect(l[l.length - 1].av).toBe(27.43); // bate com margemLiquidaPct
    expect(l.filter((x) => x.reducao)).toHaveLength(6);
  });

  it("linhasDre calcula AH contra o período anterior e ignora base zero", () => {
    const julho = dreGerencial(dsP1, dcP1, "2026-07");
    const junho = dreGerencial(dsP1, dcP1, "2026-06");
    expect(linhasDre(julho, julho).every((x) => x.ah === 0)).toBe(true);
    // junho é todo zero: variação percentual sobre zero não existe
    expect(linhasDre(julho, junho).every((x) => x.ah === null)).toBe(true);
  });
});

describe("P1/C — break-even em unidades por produto", () => {
  it("converte o custo fixo em quantidade de vendas por oferta", () => {
    const mc = margemDeContribuicao(dsP1, dcP1, "2026-07", PRODUTOS_P1);
    const be = breakEvenUnidades(mc, 800, PRODUTOS_P1, dsP1);
    expect(be.map((x) => x.produtoId)).toEqual(["p2", "p1"]); // mais barato de cobrir primeiro
    expect(be[0].preco).toBe(2000);
    expect(be[0].mcUnitaria).toBe(1005.8); // 2000 × 50,29%
    expect(be[0].unidadesNecessarias).toBe(1); // ceil(800 / 1005,8)
    expect(be[0].unidadesVendidas).toBe(1);
    expect(be[1].mcUnitaria).toBe(251.45); // 500 × 50,29%
    expect(be[1].unidadesNecessarias).toBe(4); // ceil(800 / 251,45)
    expect(be[1].unidadesVendidas).toBe(2); // v1 e v3
  });
});

describe("P1/C — capital de giro: aging, gateway e prazo de recebimento", () => {
  it("agingRecebiveis separa a vencer do vencido por faixa", () => {
    const a = agingRecebiveis(dcP1, REF_P1);
    expect(a.map((x) => x.faixa)).toEqual(["A vencer", "1-30 dias", "31-60 dias", "60+ dias"]);
    expect(a[0].valor).toBe(1940); // rc1 vence 24/07
    expect(a[1].valor).toBe(500); // rc3 venceu 30/06 → 16 dias
    expect(a[1].qtd).toBe(1);
    expect(a[2].valor + a[3].valor).toBe(0);
    // rc2 já foi recebido e não polui o aging
    expect(a.reduce((s, x) => s + x.valor, 0)).toBe(2440);
  });

  it("agingPagaveis mostra há quanto tempo o fornecedor está esperando", () => {
    const a = agingPagaveis(dcP1, REF_P1);
    expect(a[0].valor).toBe(750); // pg1 400 + pg2 350
    expect(a[0].qtd).toBe(2);
    expect(a[1].valor).toBe(300); // pg3 venceu 10/07
  });

  it("saldoRetidoPorGateway mostra o que está preso e quando solta", () => {
    const g = saldoRetidoPorGateway(dcP1);
    expect(g).toHaveLength(1);
    expect(g[0].gateway).toBe("manual");
    expect(g[0].valor).toBe(2440);
    expect(g[0].qtd).toBe(2);
    expect(g[0].proximaLiberacao).toBe("2026-06-30"); // o vencido é o próximo da fila
  });

  it("prazoMedioRecebimento pondera o D+X pelo valor da parcela", () => {
    const p = prazoMedioRecebimento(dcP1);
    expect(p.diasMedioLiberacao).toBe(7.96); // (1940×14) / 3410
    expect(p.qtdBase).toBe(1); // só rc2 já foi recebido
    expect(p.diasMedioRealizado).toBe(0); // vendeu e recebeu no mesmo dia
  });
});

describe("P1/C — comissões: peso na receita e margem por afiliado", () => {
  it("comissaoPctReceita mede o custo de rede mês a mês", () => {
    const c = comissaoPctReceita(dsP1, 2, REF_P1);
    expect(c.map((x) => x.periodo)).toEqual(["2026-06", "2026-07"]);
    expect(c[0].pct).toBe(0); // sem receita, sem divisão por zero
    expect(c[1].receita).toBe(3500);
    expect(c[1].comissoes).toBe(400);
    expect(c[1].pct).toBe(11.43);
  });

  it("rankingAfiliadosMargem ordena por margem líquida, não por faturamento", () => {
    const r = rankingAfiliadosMargem(dsP1, AFILIADOS_P0, JULHO);
    expect(r).toHaveLength(1); // afiliado sem venda no recorte não entra
    expect(r[0].afiliadoId).toBe("af-m");
    expect(r[0].receita).toBe(2000);
    expect(r[0].comissoes).toBe(400);
    expect(r[0].reembolsos).toBe(0);
    expect(r[0].margemLiquida).toBe(1600);
    expect(r[0].margemPct).toBe(80);
  });
});

describe("P1/C — reembolsos: por produto, motivo e risco no tempo", () => {
  it("reembolsosPorProduto expõe a oferta que gera arrependimento", () => {
    const rp = reembolsosPorProduto(dsP1, PRODUTOS_P1, JULHO);
    expect(rp.map((x) => x.produtoId)).toEqual(["p1", "p2"]);
    expect(rp[0].qtdVendas).toBe(2); // v1 e v3
    expect(rp[0].receita).toBe(1500);
    expect(rp[0].qtdReembolsos).toBe(1);
    expect(rp[0].valorReembolsado).toBe(500);
    expect(rp[0].taxaQtd).toBe(50);
    expect(rp[0].taxaValor).toBe(33.33);
    expect(rp[1].taxaValor).toBe(0);
  });

  it("motivosReembolso ranqueia por R$ devolvido", () => {
    const m = motivosReembolso(dsP1, JULHO);
    expect(m).toEqual([{ motivo: "Arrependimento", qtd: 1, valor: 500, pct: 100 }]);
    expect(motivosReembolso(dsP1, { inicio: "2026-01-01", fim: "2026-01-31" })).toEqual([]);
  });

  it("serieRisco carrega o teto de 1% das bandeiras junto da série", () => {
    const s = serieRisco(dsP1, dcP1, 2, REF_P1);
    expect(s.map((x) => x.periodo)).toEqual(["2026-06", "2026-07"]);
    expect(s.every((x) => x.limite === 1)).toBe(true);
    expect(s[0].taxaReembolso).toBe(0);
    expect(s[1].taxaReembolso).toBe(33.33); // 1 de 3 vendas
    expect(s[1].taxaChargeback).toBe(66.67); // 2 de 3 vendas
  });
});

// ---------- Saúde do negócio: ausência de base não vira nota ----------
//
// O bug que estes testes travam: base inteiramente vazia rendia 45/100
// ("Atenção") porque driver sem denominador ganhava nota cheia — 0% de
// reembolso de quem nunca vendeu, HHI 0 de quem não tem receita.

import {
  concentracaoReceita,
  janelaComando,
  norteDoComando,
  pulsoDeCaixa,
  saudeComposta,
  saudeDoComando,
  taxaRecompra,
} from "./metrics-comando";
import type { EntradaSaude } from "./metrics-comando";

const dcVazio: DatasetCaixa = {
  contas: [],
  movimentos: [],
  recebiveis: [],
  pagaveis: [],
  chargebacks: [],
  parametros: {
    id: "pf-vazio",
    aliquotaImposto: 0,
    regimeTributario: "simples",
    saldoInicialCaixa: 0,
    dataSaldoInicial: "",
    custoFixoMensal: 0,
    reservaMinimaCaixa: 0,
    atualizadoEm: "",
  },
};

function entradaVazia(): EntradaSaude {
  const janela = janelaComando(30, REF_P1);
  return {
    norte: norteDoComando(dsVazio, [], "todos", janela),
    pulso: pulsoDeCaixa(dsVazio, dcVazio, "todos", REF_P1),
    concentracao: concentracaoReceita(dsVazio, [], janela.atual),
    reembolsoPct: null,
    chargebackPct: null,
    inadimplenciaPct: null,
    recompraPct: null,
  };
}

describe("saúde composta — base vazia não produz score", () => {
  it("dataset totalmente vazio: score ausente, nenhum driver com base", () => {
    const janela = janelaComando(30, REF_P1);
    const norte = norteDoComando(dsVazio, [], "todos", janela);
    const pulso = pulsoDeCaixa(dsVazio, dcVazio, "todos", REF_P1);
    const conc = concentracaoReceita(dsVazio, [], janela.atual);
    const s = saudeDoComando(dsVazio, dcVazio, "todos", norte, pulso, conc, REF_P1);

    expect(s.score).toBeNull();
    expect(s.semBase).toBe(true);
    expect(s.nivel).toBeNull();
    expect(s.rotuloNivel).toBeNull();
    expect(s.parcial).toBe(false);
    expect(s.pesoComBase).toBe(0);
    expect(s.comBase).toHaveLength(0);
    expect(s.drivers).toHaveLength(7);
    expect(s.drivers.every((d) => !d.temBase && d.pontos === null && d.pctDriver === null)).toBe(true);
    // nenhum driver pode "ajudar" sem ter medido nada
    expect(s.drivers.some((d) => d.ajuda)).toBe(false);
  });

  it("concentração sem receita fica indefinida em vez de virar HHI 0", () => {
    const c = concentracaoReceita(dsVazio, [], janelaComando(30, REF_P1).atual);
    expect(c.semBase).toBe(true);
    expect(c.hhi).toBeNull();
    expect(c.nivel).toBeNull();
    expect(c.topNome).toBeNull();
    expect(c.topPct).toBeNull();
    expect(c.top3Pct).toBeNull();
  });

  it("taxaRecompra sem cliente é ausência, não 0%", () => {
    expect(taxaRecompra([])).toBeNull();
    // as 3 vendas de dsP1 são do mesmo aluno (a1) → 100% da base recomprou
    expect(taxaRecompra(dsP1.matriculas)).toBe(100);
    // um cliente com uma compra só é 0% de recompra de verdade — isso continua 0
    expect(taxaRecompra([mat({ id: "x1", alunoId: "ax" })])).toBe(0);
  });

  it("um único driver com base gera score parcial só sobre o peso dele", () => {
    // recompra de 40% é o topo da faixa (5–40) → 15/15 pontos do único driver
    const s = saudeComposta({ ...entradaVazia(), recompraPct: 40 });
    expect(s.semBase).toBe(false);
    expect(s.parcial).toBe(true);
    expect(s.comBase).toHaveLength(1);
    expect(s.comBase[0].chave).toBe("retencao");
    expect(s.pesoComBase).toBe(15);
    expect(s.score).toBe(100); // 15 de 15 pontos possíveis, e não 15 de 100
    expect(s.drivers.filter((d) => d.temBase)).toHaveLength(1);
  });

  it("driver sem base não empresta nem tira pontos do que tem base", () => {
    // metade da faixa de recompra: 22.5% → fração 0.5 → 7.5 de 15 pontos
    const s = saudeComposta({ ...entradaVazia(), recompraPct: 22.5 });
    expect(s.comBase[0].pontos).toBe(7.5);
    expect(s.score).toBe(50);
  });
});

describe("saúde composta — com base, o cálculo não mudou", () => {
  const janela = janelaComando(30, REF_P1);
  const metasP1: Meta[] = [
    { id: "mt1", indicador: "faturamento", escopo: "global", escopoRef: null, periodo: "2026-07", valor: 4000 },
  ];
  const norte = norteDoComando(dsP1, metasP1, "todos", janela);
  const pulso = pulsoDeCaixa(dsP1, dcP1, "todos", REF_P1);
  const conc = concentracaoReceita(dsP1, AFILIADOS_P0, janela.atual);
  const s = saudeDoComando(dsP1, dcP1, "todos", norte, pulso, conc, REF_P1);

  it("todos os 7 drivers têm base: peso 100, score não é parcial", () => {
    expect(s.semBase).toBe(false);
    expect(s.parcial).toBe(false);
    expect(s.pesoComBase).toBe(100);
    expect(s.comBase).toHaveLength(7);
    expect(s.score).not.toBeNull();
  });

  it("com peso 100 a renormalização é neutra: score = soma dos pontos", () => {
    const soma = s.comBase.reduce((t, d) => t + d.pontos, 0);
    expect(s.score).toBe(Math.round(soma));
    expect(s.nivel).not.toBeNull();
    expect(s.rotuloNivel).not.toBeNull();
  });
});

describe("healthScore — fator só pontua com base", () => {
  it("sem dado nenhum não há score (antes devolvia 15/100 'Crítico')", () => {
    const s = healthScore(dsVazio, [], [], REF);
    expect(s.score).toBeNull();
    expect(s.semBase).toBe(true);
    expect(s.nivel).toBeNull();
    expect(s.parcial).toBe(false);
    expect(s.maxComBase).toBe(0);
    expect(s.fatores).toHaveLength(5);
    expect(s.fatores.every((f) => !f.temBase && f.pontos === null)).toBe(true);
  });

  it("com venda no trimestre atual o score é parcial e renormalizado", () => {
    const alunos = [
      aluno({ id: "a1", statusFunil: "novo" }),
      aluno({ id: "a2", statusFunil: "recorrente" }),
    ];
    const s = healthScore(dsP1, alunos, PRODUTOS_P1, REF_P1);
    expect(s.semBase).toBe(false);
    expect(s.parcial).toBe(true);
    // sem faturamento no trimestre ANTERIOR, o fator de crescimento fica de fora
    expect(s.fatores.find((f) => f.nome === "Crescimento do faturamento")!.temBase).toBe(false);
    expect(s.maxComBase).toBe(75); // 100 − 25 do crescimento
    const soma = s.fatores.reduce((t, f) => t + (f.pontos ?? 0), 0);
    expect(s.score).toBe(Math.round((soma / 75) * 100));
  });

  it("base completa mantém divisor 100 — score idêntico à soma dos fatores", () => {
    const ds6m: DatasetFinanceiro = {
      ...dsP1,
      matriculas: [
        ...dsP1.matriculas,
        mat({ id: "v0", produtoId: "p1", valor: 800, valorLiquido: 800, data: "2026-04-20" }),
      ],
    };
    const alunos = [aluno({ id: "a1", statusFunil: "novo" }), aluno({ id: "a2", statusFunil: "recorrente" })];
    const s = healthScore(ds6m, alunos, PRODUTOS_P1, REF_P1);
    expect(s.parcial).toBe(false);
    expect(s.maxComBase).toBe(100);
    const soma = s.fatores.reduce((t, f) => t + (f.pontos ?? 0), 0);
    expect(s.score).toBe(Math.round(soma));
  });
});
