// Testes de src/lib/metrics-fontes.ts — matemática da tela "fontes de renda".

import { describe, expect, it } from "vitest";
import {
  destaquesFontes,
  janelaFontes,
  receitaPorBracoFontes,
  receitaPorCategoria,
  resumoFontes,
} from "./metrics-fontes";
import type { Afiliado, Agrupamento, Matricula, Produto } from "./types";

function mat(over: Partial<Matricula>): Matricula {
  return {
    id: "m1",
    alunoId: "a1",
    produtoId: "p-curso",
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

const PRODUTOS: Produto[] = [
  { id: "p-curso", nome: "Protocolo Raro", tipo: "low_ticket", precoBase: 297, ativo: true, braco: null, categoria: "curso" },
  { id: "p-mentoria", nome: "Mentoria MentorOS", tipo: "mentoria", precoBase: 2997, ativo: true, braco: null, categoria: "mentoria" },
  { id: "p-premium", nome: "Acompanhamento Premium", tipo: "high_ticket", precoBase: 9900, ativo: true, braco: "mente", categoria: "servico" },
];

const AFILIADOS: Afiliado[] = [
  { id: "af-corpo", nome: "Afiliado Corpo", braco: "corpo", pctPadrao: 20, ativo: true },
];

// Cadastro de agrupamento usado nos testes — braço deixou de ser união fixa de
// três literais e virou cadastro do usuário; aqui simula-se o mesmo exemplo do
// demo (corpo/mente/espirito) só para exercitar a função com dados conhecidos.
const AGRUPAMENTOS: Agrupamento[] = [
  { id: "corpo", nome: "Corpo", cor: "#FF7A5C", ordem: 1, ativo: true },
  { id: "mente", nome: "Mente", cor: "#46B6F0", ordem: 2, ativo: true },
  { id: "espirito", nome: "Espírito", cor: "#9B7BFF", ordem: 3, ativo: true },
];

describe("janelaFontes", () => {
  it("recorta os últimos N dias e o bloco anterior do mesmo tamanho, sem sobreposição", () => {
    const ref = new Date("2026-08-10T12:00:00");
    const j = janelaFontes(7, ref);
    expect(j.atual).toEqual({ inicio: "2026-08-04", fim: "2026-08-10" });
    expect(j.anterior).toEqual({ inicio: "2026-07-28", fim: "2026-08-03" });
  });
});

describe("receitaPorCategoria", () => {
  it("soma só matrícula PAGA, ignora pendente e reembolsada", () => {
    const matriculas = [
      mat({ id: "v1", produtoId: "p-curso", valor: 297, statusPagamento: "pago" }),
      mat({ id: "v2", produtoId: "p-curso", valor: 297, statusPagamento: "pendente" }),
      mat({ id: "v3", produtoId: "p-mentoria", valor: 2997, statusPagamento: "reembolsado" }),
    ];
    const out = receitaPorCategoria(matriculas, PRODUTOS, "2026-01-01", "2026-12-31");
    expect(out).toEqual([{ categoria: "curso", rotulo: "Curso", receita: 297, vendas: 1, clientes: 1, pct: 100 }]);
  });

  it("respeita o recorte de período (data fora do intervalo não entra)", () => {
    const matriculas = [
      mat({ id: "v1", produtoId: "p-curso", valor: 297, data: "2026-05-01" }),
      mat({ id: "v2", produtoId: "p-curso", valor: 297, data: "2026-07-01" }),
    ];
    const out = receitaPorCategoria(matriculas, PRODUTOS, "2026-06-01", "2026-07-31");
    expect(out).toEqual([{ categoria: "curso", rotulo: "Curso", receita: 297, vendas: 1, clientes: 1, pct: 100 }]);
  });

  it("sem venda paga no período devolve lista vazia — a tela mostra <Vazio>, não zero", () => {
    expect(receitaPorCategoria([], PRODUTOS, "2026-01-01", "2026-12-31")).toEqual([]);
  });

  it("divide o pct corretamente entre duas categorias e ordena por receita", () => {
    const matriculas = [
      mat({ id: "v1", produtoId: "p-curso", valor: 300 }),
      mat({ id: "v2", produtoId: "p-mentoria", valor: 900 }),
    ];
    const out = receitaPorCategoria(matriculas, PRODUTOS, "2026-01-01", "2026-12-31");
    expect(out.map((c) => c.categoria)).toEqual(["mentoria", "curso"]);
    expect(out[0].pct).toBe(75);
    expect(out[1].pct).toBe(25);
  });
});

describe("receitaPorBracoFontes", () => {
  it("usa produto.braco quando existe, mesmo com afiliado de outro braço", () => {
    const matriculas = [
      mat({ id: "v1", produtoId: "p-premium", afiliadoId: "af-corpo", valor: 9900 }),
    ];
    const out = receitaPorBracoFontes(matriculas, PRODUTOS, AFILIADOS, "2026-01-01", "2026-12-31", AGRUPAMENTOS);
    expect(out).toEqual([{ braco: "mente", receita: 9900, vendas: 1, clientes: 1, pct: 100 }]);
  });

  it("cai para o braço do afiliado quando o produto não tem braço fixo", () => {
    const matriculas = [
      mat({ id: "v1", produtoId: "p-curso", afiliadoId: "af-corpo", valor: 297 }),
    ];
    const out = receitaPorBracoFontes(matriculas, PRODUTOS, AFILIADOS, "2026-01-01", "2026-12-31", AGRUPAMENTOS);
    expect(out).toEqual([{ braco: "corpo", receita: 297, vendas: 1, clientes: 1, pct: 100 }]);
  });

  it("venda sem produto.braco e sem afiliado fica de fora (não vira braço inventado)", () => {
    const matriculas = [mat({ id: "v1", produtoId: "p-curso", afiliadoId: null, valor: 297 })];
    expect(
      receitaPorBracoFontes(matriculas, PRODUTOS, AFILIADOS, "2026-01-01", "2026-12-31", AGRUPAMENTOS)
    ).toEqual([]);
  });

  it("sem nenhum agrupamento cadastrado, devolve lista vazia mesmo com venda identificável", () => {
    const matriculas = [
      mat({ id: "v1", produtoId: "p-premium", afiliadoId: "af-corpo", valor: 9900 }),
    ];
    expect(receitaPorBracoFontes(matriculas, PRODUTOS, AFILIADOS, "2026-01-01", "2026-12-31", [])).toEqual([]);
  });

  it("venda de agrupamento cadastrado mas inativo fica de fora", () => {
    const inativos = AGRUPAMENTOS.map((a) => (a.id === "mente" ? { ...a, ativo: false } : a));
    const matriculas = [
      mat({ id: "v1", produtoId: "p-premium", afiliadoId: "af-corpo", valor: 9900 }),
    ];
    expect(receitaPorBracoFontes(matriculas, PRODUTOS, AFILIADOS, "2026-01-01", "2026-12-31", inativos)).toEqual([]);
  });
});

describe("resumoFontes", () => {
  it("calcula receita atual, anterior, variação, clientes e ticket médio por produto", () => {
    const janela = { atual: { inicio: "2026-07-01", fim: "2026-07-31" }, anterior: { inicio: "2026-06-01", fim: "2026-06-30" } };
    const matriculas = [
      mat({ id: "v1", alunoId: "a1", produtoId: "p-curso", valor: 300, data: "2026-07-05" }),
      mat({ id: "v2", alunoId: "a2", produtoId: "p-curso", valor: 300, data: "2026-07-10" }),
      mat({ id: "v3", alunoId: "a1", produtoId: "p-curso", valor: 200, data: "2026-06-05" }),
    ];
    const out = resumoFontes(matriculas, PRODUTOS, janela);
    expect(out).toEqual([
      {
        produtoId: "p-curso",
        nome: "Protocolo Raro",
        categoria: "curso",
        braco: null,
        receita: 600,
        receitaAnterior: 200,
        deltaPct: 200,
        vendas: 2,
        clientes: 2,
        ticketMedio: 300,
      },
    ]);
  });

  it("sem base no período anterior, deltaPct é null (não vira queda de 100%)", () => {
    const janela = { atual: { inicio: "2026-07-01", fim: "2026-07-31" }, anterior: { inicio: "2026-06-01", fim: "2026-06-30" } };
    const matriculas = [mat({ id: "v1", produtoId: "p-curso", valor: 300, data: "2026-07-05" })];
    const out = resumoFontes(matriculas, PRODUTOS, janela);
    expect(out[0].deltaPct).toBeNull();
  });

  it("produto sem nenhuma venda em nenhum dos dois períodos não aparece na lista", () => {
    const janela = { atual: { inicio: "2026-07-01", fim: "2026-07-31" }, anterior: { inicio: "2026-06-01", fim: "2026-06-30" } };
    const out = resumoFontes([], PRODUTOS, janela);
    expect(out).toEqual([]);
  });
});

describe("destaquesFontes", () => {
  it("aponta a fonte que mais cresce e a que mais cai, ignorando as sem base de comparação", () => {
    const janela = { atual: { inicio: "2026-07-01", fim: "2026-07-31" }, anterior: { inicio: "2026-06-01", fim: "2026-06-30" } };
    const matriculas = [
      mat({ id: "v1", produtoId: "p-curso", valor: 400, data: "2026-07-05" }),
      mat({ id: "v2", produtoId: "p-curso", valor: 100, data: "2026-06-05" }),
      mat({ id: "v3", produtoId: "p-mentoria", valor: 500, data: "2026-07-05" }),
      mat({ id: "v4", produtoId: "p-mentoria", valor: 2000, data: "2026-06-05" }),
    ];
    const fontes = resumoFontes(matriculas, PRODUTOS, janela);
    const d = destaquesFontes(fontes);
    expect(d.sustenta?.produtoId).toBe("p-curso");
    expect(d.caindo?.produtoId).toBe("p-mentoria");
  });

  it("sem nenhuma fonte comparável, devolve os dois campos null", () => {
    expect(destaquesFontes([])).toEqual({ sustenta: null, caindo: null });
  });
});
