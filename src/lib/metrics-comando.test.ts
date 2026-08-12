// Testes da matemática nova do Command Center (src/lib/metrics-comando.ts).
//
// Foco aqui: responsável cadastrado SEM agrupamento (`Afiliado.braco === null`
// — ver a correção de bracoDeTexto/linhaParaAfiliado em sheets/mapear.ts) não
// pode desaparecer da conta nos agregados "por agrupamento". Antes desta obra
// esse dinheiro era contado como se pertencesse ao primeiro agrupamento
// cadastrado; a correção anterior (deixar `null` fluir) só é segura se estes
// agregados também souberem tratar `null` sem sumir com a receita — é isso
// que os testes abaixo travam.

import { describe, expect, it } from "vitest";
import { SEM_AGRUPAMENTO } from "./agrupamentos";
import { desempenhoPorBraco, janelaComando, rankingAfiliados, serieBracos12m } from "./metrics-comando";
import type { Afiliado, Agrupamento, Matricula } from "./types";

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
    data: "2026-08-10",
    statusPagamento: "pago",
    origem: "manual",
    isUpsell: false,
    ...over,
  };
}

const AGRUPAMENTOS: Agrupamento[] = [
  { id: "AGR-1", nome: "Corpo", cor: "#FF7A5C", ordem: 1, ativo: true },
];

const AFILIADOS: Afiliado[] = [
  { id: "af-corpo", nome: "Ana (Corpo)", braco: "AGR-1", pctPadrao: 25, ativo: true },
  // Responsável cadastrado, mas a célula `Braco` da planilha dele está em
  // branco — o caso do defeito original (mapear.ts, bracoDeTexto).
  { id: "af-sem", nome: "Bruno (sem agrupamento)", braco: null, pctPadrao: 20, ativo: true },
];

const REF = new Date("2026-08-15T12:00:00");
const JANELA = janelaComando(30, REF);

describe("desempenhoPorBraco — responsável sem agrupamento não some da conta", () => {
  const matriculas = [
    mat({ id: "v-corpo", afiliadoId: "af-corpo", valor: 1000, data: "2026-08-05" }),
    mat({ id: "v-sem", afiliadoId: "af-sem", valor: 500, data: "2026-08-06" }),
    // Venda direta — sem afiliado nenhum. Nunca foi coberta por este agregado
    // e continua fora: não é "sem agrupamento", é fora de escopo.
    mat({ id: "v-direta", afiliadoId: null, valor: 300, data: "2026-08-07" }),
  ];

  it('cria um bucket "Sem agrupamento" com a receita do responsável sem braço', () => {
    const linhas = desempenhoPorBraco(matriculas, AFILIADOS, [], JANELA, AGRUPAMENTOS);
    const semAgrupamento = linhas.find((l) => l.braco === SEM_AGRUPAMENTO);
    expect(semAgrupamento).toBeDefined();
    expect(semAgrupamento?.receita).toBe(500);
    expect(semAgrupamento?.vendas).toBe(1);
    expect(semAgrupamento?.nome).toBe("Sem agrupamento");
    expect(semAgrupamento?.meta).toBeNull(); // não existe meta para este escopo
  });

  it("a receita sem agrupamento CONTA no total (pctTotal de todo mundo reflete os R$1.500, não R$1.000)", () => {
    const linhas = desempenhoPorBraco(matriculas, AFILIADOS, [], JANELA, AGRUPAMENTOS);
    const corpo = linhas.find((l) => l.braco === "AGR-1")!;
    const semAgrupamento = linhas.find((l) => l.braco === SEM_AGRUPAMENTO)!;
    // total = 1000 (corpo) + 500 (sem agrupamento) = 1500 — a venda direta (300) fica fora.
    expect(corpo.pctTotal).toBe(66.67);
    expect(semAgrupamento.pctTotal).toBe(33.33);
  });

  it("venda direta (sem afiliado nenhum) não entra no bucket sem-agrupamento nem no total", () => {
    const linhas = desempenhoPorBraco(matriculas, AFILIADOS, [], JANELA, AGRUPAMENTOS);
    const semAgrupamento = linhas.find((l) => l.braco === SEM_AGRUPAMENTO)!;
    expect(semAgrupamento.receita).toBe(500); // não 800
    expect(semAgrupamento.vendas).toBe(1); // não 2
  });

  it("sem nenhum agrupamento cadastrado, devolve lista vazia (portão de opcionalidade preservado)", () => {
    expect(desempenhoPorBraco(matriculas, AFILIADOS, [], JANELA, [])).toEqual([]);
  });
});

describe("serieBracos12m — mesma regra do bucket sem-agrupamento, mês a mês", () => {
  const matriculas = [
    mat({ id: "v-corpo", afiliadoId: "af-corpo", valor: 1000, data: "2026-08-05" }),
    mat({ id: "v-sem", afiliadoId: "af-sem", valor: 500, data: "2026-08-06" }),
    mat({ id: "v-direta", afiliadoId: null, valor: 300, data: "2026-08-07" }),
  ];

  it("soma a receita do responsável sem agrupamento no total do mês e na chave sentinela", () => {
    const serie = serieBracos12m(matriculas, AFILIADOS, AGRUPAMENTOS, 3, REF);
    const agosto = serie.find((p) => p.periodo === "2026-08")!;
    expect(agosto.valores[SEM_AGRUPAMENTO]).toBe(500);
    expect(agosto.valores["AGR-1"]).toBe(1000);
    // total = 1000 + 500 = 1500; a venda direta (300) fica fora, igual em desempenhoPorBraco.
    expect(agosto.total).toBe(1500);
  });

  it("sem nenhum agrupamento cadastrado, não cria a chave sentinela (nada para desenhar)", () => {
    const serie = serieBracos12m(matriculas, AFILIADOS, [], 3, REF);
    const agosto = serie.find((p) => p.periodo === "2026-08")!;
    expect(agosto.valores).toEqual({});
    expect(agosto.total).toBe(0);
  });
});

describe("rankingAfiliados — braco do afiliado sem agrupamento flui como null (não 'corpo')", () => {
  const matriculas = [
    mat({ id: "v-corpo", afiliadoId: "af-corpo", valor: 1000, data: "2026-08-05" }),
    mat({ id: "v-sem", afiliadoId: "af-sem", valor: 500, data: "2026-08-06" }),
  ];

  it("a linha do afiliado sem braço cadastrado carrega braco null", () => {
    const linhas = rankingAfiliados({ matriculas, comissoes: [], reembolsos: [], despesas: [] }, AFILIADOS, JANELA);
    const semAgrupamento = linhas.find((l) => l.id === "af-sem")!;
    expect(semAgrupamento.braco).toBeNull();
    expect(semAgrupamento.receita).toBe(500);
  });
});
