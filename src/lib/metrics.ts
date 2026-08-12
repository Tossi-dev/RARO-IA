// Métricas financeiras e de CRM — TODO número exibido na plataforma nasce aqui.
// Lógica de cálculo herdada/validada do /api/financeiro do projeto LA Beauty,
// adaptada ao domínio de mentoria (matrículas, lançamentos, afiliados).

import type {
  Afiliado,
  Aluno,
  Atividade,
  Braco,
  CanalVenda,
  CategoriaCaixa,
  ConteudoMetrica,
  ConteudoPilar,
  ConteudoView,
  DatasetCaixa,
  DatasetFinanceiro,
  Gateway,
  Lancamento,
  Matricula,
  MetaFinanceira,
  MovimentoCaixa,
  Pagavel,
  Produto,
  Recebivel,
  Tarefa,
  TarefaAluno,
} from "./types";
import { CATEGORIA_CAIXA_LABEL, FORMA_PGTO_LABEL, LIMITE_CHARGEBACK_PCT } from "./domain";

const r2 = (v: number) => +v.toFixed(2);

/** '2026-07-14' → '2026-07' */
export function ym(data: string): string {
  return (data || "").slice(0, 7);
}

/** Lista de períodos 'YYYY-MM' terminando no mês de `ref`. */
export function mesesAte(n: number, ref = new Date()): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(ref.getFullYear(), ref.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

export interface MesFinanceiro {
  periodo: string;
  faturamento: number;
  liquido: number;
  comissoes: number;
  despesasFixas: number;
  despesasVariaveis: number;
  reembolsos: number;
  custoTotal: number;
  lucro: number;
  margem: number; // %
  qtdVendas: number;
  ticketMedio: number;
}

function vendasValidas(ds: DatasetFinanceiro): Matricula[] {
  // pendente não conta como receita; reembolsada conta no bruto e o estorno
  // aparece em `reembolsos` (transparência dos dois lados)
  return ds.matriculas.filter((m) => m.statusPagamento !== "pendente");
}

export function mesFinanceiro(ds: DatasetFinanceiro, periodo: string): MesFinanceiro {
  const vendas = vendasValidas(ds).filter((m) => ym(m.data) === periodo);
  const faturamento = vendas.reduce((s, m) => s + m.valor, 0);
  const liquido = vendas.reduce((s, m) => s + m.valorLiquido, 0);
  const comissoes = ds.comissoes
    .filter((c) => ym(c.data) === periodo)
    .reduce((s, c) => s + c.valor, 0);
  const dm = ds.despesas.filter((d) => ym(d.data) === periodo);
  const despesasFixas = dm.filter((d) => d.tipo === "fixa").reduce((s, d) => s + d.valor, 0);
  const despesasVariaveis = dm
    .filter((d) => d.tipo === "variavel")
    .reduce((s, d) => s + d.valor, 0);
  const reembolsos = ds.reembolsos
    .filter((x) => ym(x.data) === periodo)
    .reduce((s, x) => s + x.valor, 0);
  const custoTotal = comissoes + despesasFixas + despesasVariaveis + reembolsos;
  const lucro = liquido - custoTotal;
  return {
    periodo,
    faturamento: r2(faturamento),
    liquido: r2(liquido),
    comissoes: r2(comissoes),
    despesasFixas: r2(despesasFixas),
    despesasVariaveis: r2(despesasVariaveis),
    reembolsos: r2(reembolsos),
    custoTotal: r2(custoTotal),
    lucro: r2(lucro),
    margem: faturamento ? r2((lucro / faturamento) * 100) : 0,
    qtdVendas: vendas.length,
    ticketMedio: vendas.length ? r2(faturamento / vendas.length) : 0,
  };
}

export function serieMensal(ds: DatasetFinanceiro, nMeses: number, ref = new Date()): MesFinanceiro[] {
  return mesesAte(nMeses, ref).map((p) => mesFinanceiro(ds, p));
}

export interface Kpi {
  atual: number;
  anterior: number;
  deltaPct: number | null; // null quando não há base de comparação
}

function kpi(atual: number, anterior: number): Kpi {
  return {
    atual: r2(atual),
    anterior: r2(anterior),
    deltaPct: anterior ? r2(((atual - anterior) / Math.abs(anterior)) * 100) : null,
  };
}

export interface KpisDashboard {
  periodo: string;
  faturamento: Kpi;
  custoTotal: Kpi;
  comissoes: Kpi;
  margem: Kpi;
  lucro: Kpi;
}

export function kpisDashboard(serie: MesFinanceiro[]): KpisDashboard {
  const atual = serie[serie.length - 1];
  const ant = serie[serie.length - 2] ?? { ...atual, faturamento: 0, custoTotal: 0, comissoes: 0, margem: 0, lucro: 0 };
  return {
    periodo: atual.periodo,
    faturamento: kpi(atual.faturamento, ant.faturamento),
    custoTotal: kpi(atual.custoTotal, ant.custoTotal),
    comissoes: kpi(atual.comissoes, ant.comissoes),
    margem: kpi(atual.margem, ant.margem),
    lucro: kpi(atual.lucro, ant.lucro),
  };
}

export interface MesComparado {
  mes: number; // 1-12
  anterior: number;
  atual: number;
}

/** Faturamento mês a mês de dois anos (ex.: 2025 × 2026). */
export function comparativoAnual(ds: DatasetFinanceiro, anoAnterior: number, anoAtual: number): MesComparado[] {
  const soma = (ano: number, mes: number) =>
    r2(
      vendasValidas(ds)
        .filter((m) => m.data.startsWith(`${ano}-${String(mes).padStart(2, "0")}`))
        .reduce((s, m) => s + m.valor, 0)
    );
  return Array.from({ length: 12 }, (_, i) => ({
    mes: i + 1,
    anterior: soma(anoAnterior, i + 1),
    atual: soma(anoAtual, i + 1),
  }));
}

export interface ProdutoFinanceiro {
  produtoId: string;
  nome: string;
  qtd: number;
  receita: number;
  liquido: number;
  comissoes: number;
  reembolsos: number;
  /** margem de contribuição: (líquido − comissões − reembolsos) / receita */
  margemContribuicao: number;
}

export function porProduto(ds: DatasetFinanceiro, produtos: Produto[], ano: number): ProdutoFinanceiro[] {
  const doAno = vendasValidas(ds).filter((m) => m.data.startsWith(`${ano}-`));
  const reembolsoPorMatricula = new Map(ds.reembolsos.map((x) => [x.matriculaId, x.valor] as const));
  return produtos
    .map((p) => {
      const vendas = doAno.filter((m) => m.produtoId === p.id);
      const ids = new Set(vendas.map((m) => m.id));
      const receita = vendas.reduce((s, m) => s + m.valor, 0);
      const liquido = vendas.reduce((s, m) => s + m.valorLiquido, 0);
      const comissoes = ds.comissoes
        .filter((c) => ids.has(c.matriculaId))
        .reduce((s, c) => s + c.valor, 0);
      const reembolsos = vendas.reduce((s, m) => s + (reembolsoPorMatricula.get(m.id) ?? 0), 0);
      const contrib = liquido - comissoes - reembolsos;
      return {
        produtoId: p.id,
        nome: p.nome,
        qtd: vendas.length,
        receita: r2(receita),
        liquido: r2(liquido),
        comissoes: r2(comissoes),
        reembolsos: r2(reembolsos),
        margemContribuicao: receita ? r2((contrib / receita) * 100) : 0,
      };
    })
    .filter((p) => p.qtd > 0)
    .sort((a, b) => b.receita - a.receita);
}

export interface FunilContagem {
  potencial: number;
  novo: number;
  recorrente: number;
  inativo: number;
}

export function funil(alunos: Aluno[]): FunilContagem {
  const c: FunilContagem = { potencial: 0, novo: 0, recorrente: 0, inativo: 0 };
  for (const a of alunos) c[a.statusFunil] += 1;
  return c;
}

export interface StatsAluno {
  ltv: number;
  compras: number;
  ticketMedio: number;
  ultimaCompra: string | null;
}

export function statsAluno(matriculasDoAluno: Matricula[]): StatsAluno {
  const pagas = matriculasDoAluno.filter((m) => m.statusPagamento !== "pendente");
  const ltv = pagas.reduce((s, m) => s + m.valor, 0);
  const ultima = pagas.map((m) => m.data).sort().at(-1) ?? null;
  return {
    ltv: r2(ltv),
    compras: pagas.length,
    ticketMedio: pagas.length ? r2(ltv / pagas.length) : 0,
    ultimaCompra: ultima,
  };
}

export interface StatsLancamento {
  faturamento: number;
  liquido: number;
  comissoes: number;
  reembolsos: number;
  resultado: number;
  alunosUnicos: number;
  qtdVendas: number;
  ticketMedio: number;
  progressoMeta: number | null; // % (null se meta = 0)
  tarefasTotal: number;
  tarefasConcluidas: number;
}

export function statsLancamento(
  lanc: Lancamento,
  matriculas: Matricula[],
  reembolsos: { matriculaId: string; valor: number }[],
  comissoes: { matriculaId: string; valor: number }[],
  tarefas: TarefaAluno[]
): StatsLancamento {
  const vendas = matriculas.filter(
    (m) => m.lancamentoId === lanc.id && m.statusPagamento !== "pendente"
  );
  const ids = new Set(vendas.map((m) => m.id));
  const faturamento = vendas.reduce((s, m) => s + m.valor, 0);
  const liquido = vendas.reduce((s, m) => s + m.valorLiquido, 0);
  const com = comissoes.filter((c) => ids.has(c.matriculaId)).reduce((s, c) => s + c.valor, 0);
  const ree = reembolsos.filter((x) => ids.has(x.matriculaId)).reduce((s, x) => s + x.valor, 0);
  const concluidas = tarefas.filter((t) => t.concluida).length;
  return {
    faturamento: r2(faturamento),
    liquido: r2(liquido),
    comissoes: r2(com),
    reembolsos: r2(ree),
    resultado: r2(liquido - com - ree),
    alunosUnicos: new Set(vendas.map((m) => m.alunoId)).size,
    qtdVendas: vendas.length,
    ticketMedio: vendas.length ? r2(faturamento / vendas.length) : 0,
    progressoMeta: lanc.metaFaturamento
      ? Math.min(100, r2((faturamento / lanc.metaFaturamento) * 100))
      : null,
    tarefasTotal: tarefas.length,
    tarefasConcluidas: concluidas,
  };
}

// receitaPorDia (receita acumulada por dia dentro de um lançamento) saiu
// daqui: só alimentava o gráfico de tração de /lancamentos/[id], rota
// removida na virada para mentoria.

export interface Projecao {
  lucroAcumuladoAno: number;
  mediaLucro3m: number;
  mesesRestantes: number;
  lucroProjetadoAno: number;
}

/** Projeção em 3 cenários para os próximos meses (base = média dos últimos 3). */
export interface PontoCenario {
  periodo: string;
  pessimista: number;
  base: number;
  otimista: number;
}

export function cenariosLucro(ds: DatasetFinanceiro, nMesesFuturos = 6, ref = new Date()): PontoCenario[] {
  const serie = serieMensal(ds, 3, ref);
  const media = serie.reduce((s, m) => s + m.lucro, 0) / (serie.length || 1);
  const out: PontoCenario[] = [];
  for (let i = 1; i <= nMesesFuturos; i++) {
    const d = new Date(ref.getFullYear(), ref.getMonth() + i, 1);
    out.push({
      periodo: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      pessimista: r2(media * 0.8),
      base: r2(media),
      otimista: r2(media * 1.2),
    });
  }
  return out;
}

/** Projeção linear simples: acumulado do ano + média dos últimos 3 meses × meses restantes. */
export function projecaoAno(ds: DatasetFinanceiro, ref = new Date()): Projecao {
  const ano = ref.getFullYear();
  const mesAtual = ref.getMonth() + 1;
  const meses = Array.from({ length: mesAtual }, (_, i) =>
    mesFinanceiro(ds, `${ano}-${String(i + 1).padStart(2, "0")}`)
  );
  const acumulado = meses.reduce((s, m) => s + m.lucro, 0);
  const ult3 = meses.slice(-3);
  const media = ult3.length ? ult3.reduce((s, m) => s + m.lucro, 0) / ult3.length : 0;
  const restantes = 12 - mesAtual;
  return {
    lucroAcumuladoAno: r2(acumulado),
    mediaLucro3m: r2(media),
    mesesRestantes: restantes,
    lucroProjetadoAno: r2(acumulado + media * restantes),
  };
}

// ============================================================
// Expansão v2 — análises por indicador, avisos, upsell,
// reativação, saúde do negócio e conteúdo/redes
// ============================================================

export type SlugIndicador = "faturamento" | "custos" | "comissoes" | "margem" | "lucro";

const CAMPO_INDICADOR: Record<SlugIndicador, keyof MesFinanceiro> = {
  faturamento: "faturamento",
  custos: "custoTotal",
  comissoes: "comissoes",
  margem: "margem",
  lucro: "lucro",
};

export interface WaterfallStep {
  label: string;
  valor: number;
  tipo: "total" | "aumento" | "reducao";
}

export interface AnaliseIndicador {
  slug: SlugIndicador;
  ehPct: boolean;
  atual: number;
  deltaMoM: number | null;
  deltaYoY: number | null;
  serie: { periodo: string; valor: number }[];
  waterfall: WaterfallStep[] | null;
  donut: { name: string; value: number }[] | null;
  barras: { nome: string; valor: number }[] | null;
  tituloBarras: string;
  barrasEhPct?: boolean;
}

function deltaPctOuNull(atual: number, base: number): number | null {
  return base ? r2(((atual - base) / Math.abs(base)) * 100) : null;
}

/** Waterfall do resultado do mês: bruto → taxas → comissões → despesas → reembolsos → lucro */
export function waterfallResultado(m: MesFinanceiro): WaterfallStep[] {
  const taxas = r2(m.faturamento - m.liquido);
  return [
    { label: "Bruto", valor: m.faturamento, tipo: "total" },
    { label: "Taxas", valor: -taxas, tipo: "reducao" },
    { label: "Comissões", valor: -m.comissoes, tipo: "reducao" },
    { label: "Fixas", valor: -m.despesasFixas, tipo: "reducao" },
    { label: "Variáveis", valor: -m.despesasVariaveis, tipo: "reducao" },
    { label: "Reembolsos", valor: -m.reembolsos, tipo: "reducao" },
    { label: "Lucro", valor: m.lucro, tipo: "total" },
  ];
}

export function analiseIndicador(
  ds: DatasetFinanceiro,
  produtos: Produto[],
  afiliados: Afiliado[],
  slug: SlugIndicador,
  ref = new Date()
): AnaliseIndicador {
  const campo = CAMPO_INDICADOR[slug];
  const serieFull = serieMensal(ds, 12, ref);
  const mesAtual = serieFull[serieFull.length - 1];
  const mesAnterior = serieFull[serieFull.length - 2];
  const ymAnoPassado = `${ref.getFullYear() - 1}-${String(ref.getMonth() + 1).padStart(2, "0")}`;
  const mesAnoPassado = mesFinanceiro(ds, ymAnoPassado);

  const atual = mesAtual[campo] as number;
  const serie = serieFull.map((m) => ({ periodo: m.periodo, valor: m[campo] as number }));
  const ano = ref.getFullYear();
  const prods = porProduto(ds, produtos, ano);

  let waterfall: WaterfallStep[] | null = null;
  let donut: { name: string; value: number }[] | null = null;
  let barras: { nome: string; valor: number }[] | null = null;
  let tituloBarras = "";
  let barrasEhPct = false;

  if (slug === "faturamento") {
    donut = prods.map((p) => ({ name: p.nome, value: p.receita }));
    const porForma = new Map<string, number>();
    for (const m of ds.matriculas) {
      if (!m.data.startsWith(`${ano}-`) || m.statusPagamento === "pendente") continue;
      const rot = FORMA_PGTO_LABEL[m.formaPgto];
      porForma.set(rot, (porForma.get(rot) ?? 0) + m.valor);
    }
    barras = [...porForma.entries()].map(([nome, valor]) => ({ nome, valor: r2(valor) })).sort((a, b) => b.valor - a.valor);
    tituloBarras = `Por forma de pagamento — ${ano}`;
  } else if (slug === "custos") {
    waterfall = [
      { label: "Comissões", valor: mesAtual.comissoes, tipo: "aumento" },
      { label: "Fixas", valor: mesAtual.despesasFixas, tipo: "aumento" },
      { label: "Variáveis", valor: mesAtual.despesasVariaveis, tipo: "aumento" },
      { label: "Reembolsos", valor: mesAtual.reembolsos, tipo: "aumento" },
      { label: "Custo total", valor: mesAtual.custoTotal, tipo: "total" },
    ];
    const porCat = new Map<string, number>();
    for (const d of ds.despesas) {
      if (!d.data.startsWith(`${ano}-`)) continue;
      porCat.set(d.categoria, (porCat.get(d.categoria) ?? 0) + d.valor);
    }
    barras = [...porCat.entries()].map(([nome, valor]) => ({ nome, valor: r2(valor) })).sort((a, b) => b.valor - a.valor).slice(0, 8);
    tituloBarras = `Despesas por categoria — ${ano}`;
  } else if (slug === "comissoes") {
    const porAfiliado = new Map<string, number>();
    for (const c of ds.comissoes) {
      if (!c.data.startsWith(`${ano}-`)) continue;
      const nome = afiliados.find((a) => a.id === c.afiliadoId)?.nome ?? "—";
      porAfiliado.set(nome, (porAfiliado.get(nome) ?? 0) + c.valor);
    }
    barras = [...porAfiliado.entries()].map(([nome, valor]) => ({ nome, valor: r2(valor) })).sort((a, b) => b.valor - a.valor);
    tituloBarras = `Por afiliado — ${ano}`;
    donut = prods.filter((p) => p.comissoes > 0).map((p) => ({ name: p.nome, value: p.comissoes }));
  } else {
    // margem e lucro compartilham a decomposição completa do mês
    waterfall = waterfallResultado(mesAtual);
    barras = prods.map((p) => ({ nome: p.nome, valor: p.margemContribuicao }));
    tituloBarras = `Margem de contribuição por produto — ${ano}`;
    barrasEhPct = true;
  }

  return {
    slug,
    ehPct: slug === "margem",
    atual,
    deltaMoM: deltaPctOuNull(atual, mesAnterior?.[campo] as number),
    deltaYoY: deltaPctOuNull(atual, mesAnoPassado[campo] as number),
    serie,
    waterfall,
    donut,
    barras,
    tituloBarras,
    barrasEhPct,
  };
}

// ---------- Avisos: semana, upsell, reativação ----------

const DIA_MS = 86400000;
const dataISO = (d: Date) => d.toISOString().slice(0, 10);

export interface FaturamentoSemanal {
  semanaAtual: number;
  semanaAnterior: number;
  deltaPct: number | null;
  porDia: { label: string; valor: number }[];
}

/** Faturamento dos últimos 7 dias (incl. hoje) vs os 7 anteriores. */
export function faturamentoSemanal(ds: DatasetFinanceiro, ref = new Date()): FaturamentoSemanal {
  const hoje = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  const vendas = ds.matriculas.filter((m) => m.statusPagamento !== "pendente");
  const soma = (de: Date, ate: Date) =>
    r2(
      vendas
        .filter((m) => m.data >= dataISO(de) && m.data <= dataISO(ate))
        .reduce((s, m) => s + m.valor, 0)
    );
  const ini = new Date(hoje.getTime() - 6 * DIA_MS);
  const iniAnt = new Date(hoje.getTime() - 13 * DIA_MS);
  const fimAnt = new Date(hoje.getTime() - 7 * DIA_MS);
  const semanaAtual = soma(ini, hoje);
  const semanaAnterior = soma(iniAnt, fimAnt);
  const porDia: { label: string; valor: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(hoje.getTime() - i * DIA_MS);
    porDia.push({
      label: `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`,
      valor: soma(d, d),
    });
  }
  return { semanaAtual, semanaAnterior, deltaPct: deltaPctOuNull(semanaAtual, semanaAnterior), porDia };
}

export interface UpsellResumo {
  valorMes: number;
  qtdMes: number;
  pctFaturamento: number;
  valorSemana: number;
}

export function upsellResumo(ds: DatasetFinanceiro, ref = new Date()): UpsellResumo {
  const ymAtual = `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, "0")}`;
  const vendasMes = ds.matriculas.filter((m) => ym(m.data) === ymAtual && m.statusPagamento !== "pendente");
  const ups = vendasMes.filter((m) => m.isUpsell);
  const fat = vendasMes.reduce((s, m) => s + m.valor, 0);
  const hoje = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  const ini = dataISO(new Date(hoje.getTime() - 6 * DIA_MS));
  const valorSemana = r2(
    ds.matriculas
      .filter((m) => m.isUpsell && m.statusPagamento !== "pendente" && m.data >= ini)
      .reduce((s, m) => s + m.valor, 0)
  );
  return {
    valorMes: r2(ups.reduce((s, m) => s + m.valor, 0)),
    qtdMes: ups.length,
    pctFaturamento: fat ? r2((ups.reduce((s, m) => s + m.valor, 0) / fat) * 100) : 0,
    valorSemana,
  };
}

export const FAIXAS_REATIVACAO = ["1-2", "3-7", "8-15", "15-60", "60+"] as const;
export type FaixaReativacao = (typeof FAIXAS_REATIVACAO)[number];

export interface AlunoReativacao {
  id: string;
  nome: string;
  telefone: string;
  dias: number;
}

export interface FaixaComAlunos {
  faixa: FaixaReativacao;
  rotulo: string;
  alunos: AlunoReativacao[];
}

/** Dias desde o último contato (atividade OU compra; fallback: primeiro contato). */
export function faixasReativacao(
  alunos: Aluno[],
  atividades: Atividade[],
  matriculas: Matricula[],
  ref = new Date()
): FaixaComAlunos[] {
  const ultimo = new Map<string, string>();
  const marca = (alunoId: string, data: string) => {
    const d = data.slice(0, 10);
    if (!ultimo.has(alunoId) || ultimo.get(alunoId)! < d) ultimo.set(alunoId, d);
  };
  for (const a of atividades) marca(a.alunoId, a.data);
  for (const m of matriculas) marca(m.alunoId, m.data);

  const hoje = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate()).getTime();
  const buckets: Record<FaixaReativacao, AlunoReativacao[]> = {
    "1-2": [], "3-7": [], "8-15": [], "15-60": [], "60+": [],
  };
  for (const a of alunos) {
    const base = ultimo.get(a.id) ?? a.primeiroContato;
    if (!base) continue;
    const dias = Math.round((hoje - new Date(`${base.slice(0, 10)}T00:00:00`).getTime()) / DIA_MS);
    if (dias < 1) continue; // contato hoje — não precisa retomar
    const item = { id: a.id, nome: a.nome, telefone: a.telefone, dias };
    if (dias <= 2) buckets["1-2"].push(item);
    else if (dias <= 7) buckets["3-7"].push(item);
    else if (dias <= 15) buckets["8-15"].push(item);
    else if (dias <= 60) buckets["15-60"].push(item);
    else buckets["60+"].push(item);
  }
  const rotulos: Record<FaixaReativacao, string> = {
    "1-2": "1–2 dias", "3-7": "3–7 dias", "8-15": "8–15 dias", "15-60": "15–60 dias", "60+": "60+ dias",
  };
  return FAIXAS_REATIVACAO.map((f) => ({
    faixa: f,
    rotulo: rotulos[f],
    alunos: buckets[f].sort((a, b) => b.dias - a.dias),
  }));
}

// ---------- Saúde do negócio (card no dashboard) ----------

export interface SaudeNegocio {
  baseTotal: number;
  ativos: number;
  semContato45: number;
  tarefasPendentes: number;
  reunioesHoje: number;
  metaFaturamento: { alvo: number; realizado: number; pct: number } | null;
  upsellMes: number;
}

export function saudeNegocio(
  alunos: Aluno[],
  ds: DatasetFinanceiro,
  tarefas: Tarefa[],
  reunioesHoje: number,
  metas: MetaFinanceira[],
  atividades: Atividade[],
  ref = new Date()
): SaudeNegocio {
  const ymAtual = `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, "0")}`;
  const faixas = faixasReativacao(alunos, atividades, ds.matriculas, ref);
  const semContato45 =
    faixas.find((f) => f.faixa === "60+")!.alunos.length +
    faixas.find((f) => f.faixa === "15-60")!.alunos.filter((a) => a.dias > 45).length;
  const meta = metas.find((m) => m.tipo === "faturamento" && m.periodo === ymAtual) ?? null;
  const realizado = mesFinanceiro(ds, ymAtual).faturamento;
  return {
    baseTotal: alunos.length,
    ativos: alunos.filter((a) => a.statusFunil === "novo" || a.statusFunil === "recorrente").length,
    semContato45,
    tarefasPendentes: tarefas.filter((t) => t.status === "pendente").length,
    reunioesHoje,
    metaFaturamento: meta ? { alvo: meta.alvo, realizado, pct: meta.alvo ? r2((realizado / meta.alvo) * 100) : 0 } : null,
    upsellMes: upsellResumo(ds, ref).valorMes,
  };
}

// ---------- Orçado × realizado ----------

export interface LinhaOrcamento {
  categoria: string;
  previsto: number;
  realizado: number;
  pct: number | null;
  estourou: boolean;
}

export function orcadoRealizado(
  ds: DatasetFinanceiro,
  orcamentos: { categoria: string; periodo: string; valorPrevisto: number }[],
  periodo: string
): LinhaOrcamento[] {
  const doMes = orcamentos.filter((o) => o.periodo === periodo);
  const realPorCat = new Map<string, number>();
  for (const d of ds.despesas) {
    if (ym(d.data) !== periodo) continue;
    realPorCat.set(d.categoria, (realPorCat.get(d.categoria) ?? 0) + d.valor);
  }
  const cats = new Set([...doMes.map((o) => o.categoria), ...realPorCat.keys()]);
  return [...cats]
    .map((categoria) => {
      const previsto = doMes.find((o) => o.categoria === categoria)?.valorPrevisto ?? 0;
      const realizado = r2(realPorCat.get(categoria) ?? 0);
      return {
        categoria,
        previsto,
        realizado,
        pct: previsto ? r2((realizado / previsto) * 100) : null,
        estourou: previsto > 0 && realizado > previsto,
      };
    })
    .sort((a, b) => b.realizado - a.realizado);
}

// ---------- Progresso de turma (por aluno) ----------

export interface ProgressoAlunoTurma {
  alunoId: string;
  alunoNome: string;
  total: number;
  concluidas: number;
  pct: number;
}

export function progressoPorAluno(tarefas: TarefaAluno[]): { porAluno: ProgressoAlunoTurma[]; pctGeral: number } {
  const mapa = new Map<string, ProgressoAlunoTurma>();
  for (const t of tarefas) {
    const atual = mapa.get(t.alunoId) ?? {
      alunoId: t.alunoId,
      alunoNome: t.alunoNome ?? "—",
      total: 0,
      concluidas: 0,
      pct: 0,
    };
    atual.total += 1;
    if (t.concluida) atual.concluidas += 1;
    mapa.set(t.alunoId, atual);
  }
  const porAluno = [...mapa.values()]
    .map((p) => ({ ...p, pct: p.total ? r2((p.concluidas / p.total) * 100) : 0 }))
    .sort((a, b) => b.pct - a.pct);
  const total = tarefas.length;
  const conc = tarefas.filter((t) => t.concluida).length;
  return { porAluno, pctGeral: total ? r2((conc / total) * 100) : 0 };
}

// ---------- Conteúdo & redes ----------

export function engajamentoPct(m: ConteudoMetrica | null): number {
  if (!m || !m.views) return 0;
  return r2(((m.likes + m.comentarios + m.compartilhamentos + m.salvamentos) / m.views) * 100);
}

export interface RankingConteudos {
  porViews: ConteudoView[];
  porRetencao: ConteudoView[];
  porEngajamento: { item: ConteudoView; engajamento: number }[];
}

export function rankingConteudos(lista: ConteudoView[], topN = 5): RankingConteudos {
  const comMetrica = lista.filter((c) => c.metrica);
  return {
    porViews: [...comMetrica].sort((a, b) => (b.metrica!.views ?? 0) - (a.metrica!.views ?? 0)).slice(0, topN),
    porRetencao: [...comMetrica]
      .sort((a, b) => (b.metrica!.retencaoMedia ?? 0) - (a.metrica!.retencaoMedia ?? 0))
      .slice(0, topN),
    porEngajamento: comMetrica
      .map((item) => ({ item, engajamento: engajamentoPct(item.metrica) }))
      .sort((a, b) => b.engajamento - a.engajamento)
      .slice(0, topN),
  };
}

export interface PadroesVencedores {
  qtdAnalisada: number;
  retencaoTop: number;
  retencaoResto: number;
  duracaoTop: number;
  notaGanchoTop: number | null;
  dicas: string[];
}

/** Compara os top 3 (por engajamento) com o resto e extrai padrões acionáveis. */
export function padroesVencedores(lista: ConteudoView[], pilares: ConteudoPilar[]): PadroesVencedores {
  const comMetrica = lista.filter((c) => c.metrica && c.metrica.views > 0);
  const ordenado = [...comMetrica].sort((a, b) => engajamentoPct(b.metrica) - engajamentoPct(a.metrica));
  const top = ordenado.slice(0, 3);
  const resto = ordenado.slice(3);
  const media = (arr: number[]) => (arr.length ? r2(arr.reduce((s, v) => s + v, 0) / arr.length) : 0);
  const retencaoTop = media(top.map((c) => c.metrica!.retencaoMedia));
  const retencaoResto = media(resto.map((c) => c.metrica!.retencaoMedia));
  const duracaoTop = media(top.map((c) => c.duracaoSeg));
  const notasGanchoTop = top
    .map((c) => pilares.find((p) => p.conteudoId === c.id && p.pilar === "gancho")?.nota)
    .filter((n): n is number => n !== null && n !== undefined);
  const notaGanchoTop = notasGanchoTop.length ? media(notasGanchoTop) : null;

  const dicas: string[] = [];
  if (retencaoTop > retencaoResto)
    dicas.push(`Os vencedores retêm ${r2(retencaoTop - retencaoResto)} p.p. a mais que a média — replique a estrutura dos 3 primeiros segundos.`);
  if (duracaoTop > 0)
    dicas.push(`Duração média dos vencedores: ${Math.round(duracaoTop)}s — use como alvo para os próximos cortes.`);
  if (notaGanchoTop !== null && notaGanchoTop >= 7)
    dicas.push(`Ganchos nota ${notaGanchoTop.toFixed(1)}+ dominam o topo — priorize a promessa forte na primeira frase.`);
  if (!dicas.length) dicas.push("Ainda há poucos dados anotados — preencha os pilares dos reels para liberar os padrões.");
  return { qtdAnalisada: comMetrica.length, retencaoTop, retencaoResto, duracaoTop, notaGanchoTop, dicas };
}

// ============================================================
// P0 — Fundação (Blueprint v3): pace de meta, delta de período
// e a lente estrutural por braço (corpo/mente/espírito).
// Regra de ouro: toda tela mostra meta/pace + comparativo + alerta.
// ============================================================

export interface PaceMeta {
  pctMeta: number; // % da meta já realizada
  pctTempo: number; // % do período decorrido
  projecao: number; // fechamento projetado no ritmo atual
  gapProjetado: number; // projecao − meta (negativo = vai faltar)
  noRitmo: boolean; // projeção ≥ meta?
}

/**
 * Pace: no ritmo atual, batemos a meta do período?
 * `realizado` até `diaAtual` (1-based) de um período com `diasNoPeriodo` dias.
 */
export function paceMeta(
  realizado: number,
  meta: number,
  diaAtual: number,
  diasNoPeriodo: number
): PaceMeta {
  const dia = Math.max(1, Math.min(diaAtual, diasNoPeriodo));
  const pctTempo = r2((dia / diasNoPeriodo) * 100);
  const projecao = r2((realizado / dia) * diasNoPeriodo);
  const pctMeta = meta > 0 ? r2((realizado / meta) * 100) : 0;
  return {
    pctMeta,
    pctTempo,
    projecao,
    gapProjetado: r2(projecao - meta),
    noRitmo: meta <= 0 || projecao >= meta,
  };
}

/** Variação % entre períodos; null quando não há base de comparação. */
export function deltaPct(atual: number, anterior: number): number | null {
  if (!isFinite(anterior) || anterior === 0) return null;
  return r2(((atual - anterior) / Math.abs(anterior)) * 100);
}

/** Braço de uma venda: campo direto, senão o braço do afiliado. */
export function bracoDaVenda(m: Matricula, afiliados: Afiliado[]): Braco | null {
  if (m.braco) return m.braco;
  if (m.afiliadoId) return afiliados.find((a) => a.id === m.afiliadoId)?.braco ?? null;
  return null;
}

/** Aplica o filtro global de braço a uma lista de vendas ("todos" = tudo). */
export function filtrarPorBraco(
  matriculas: Matricula[],
  afiliados: Afiliado[],
  braco: Braco | "todos"
): Matricula[] {
  if (braco === "todos") return matriculas;
  return matriculas.filter((m) => bracoDaVenda(m, afiliados) === braco);
}

export interface ReceitaBraco {
  braco: Braco;
  receita: number;
  vendas: number;
}

/**
 * Receita e nº de vendas por braço (vendas pagas; sem braço identificável ficam de fora).
 * O braço aqui é o id de um agrupamento cadastrado (ou o valor legado do demo) — não existe
 * mais lista fixa de três nomes para pré-popular, então o mapa nasce vazio e cresce com o
 * que a própria venda trouxer. Pré-semear com literais quebraria em runtime para qualquer
 * agrupamento cadastrado que não fosse corpo/mente/espirito (Map.get devolveria undefined).
 */
export function receitaPorBraco(matriculas: Matricula[], afiliados: Afiliado[]): ReceitaBraco[] {
  const acc = new Map<Braco, ReceitaBraco>();
  for (const m of matriculas) {
    if (m.statusPagamento !== "pago") continue;
    const b = bracoDaVenda(m, afiliados);
    if (!b) continue;
    const x = acc.get(b) ?? { braco: b, receita: 0, vendas: 0 };
    x.receita = r2(x.receita + m.valor);
    x.vendas += 1;
    acc.set(b, x);
  }
  return [...acc.values()];
}

/** Aplica a lente global de fonte de renda (produto) a uma lista de vendas ("todos" = tudo). */
export function filtrarPorFonte(matriculas: Matricula[], fonte: string): Matricula[] {
  if (fonte === "todos") return matriculas;
  return matriculas.filter((m) => m.produtoId === fonte);
}

// ============================================================
// P1 — Camada de CAIXA (SPEC-P1 Anexo B.2)
//
// Regra de ouro do pacote: COMPETÊNCIA ≠ CAIXA.
//   • Competência = dia do fato econômico (a venda aconteceu, a despesa nasceu).
//     É o que alimenta o DRE, a margem e o ponto de equilíbrio.
//   • Caixa = dia em que o dinheiro entra ou sai da conta (D+X do gateway,
//     vencimento da parcela, data do pagamento). É o que alimenta o fluxo,
//     a projeção de 13 semanas, o burn e o runway.
// Faturar não é receber. Nenhuma função abaixo mistura os dois regimes.
//
// Todas as funções são PURAS: recebem dados e devolvem números. Nada de I/O,
// nada de cookies, nada de Date.now() escondido (a data de referência entra
// sempre por parâmetro, com `new Date()` só como default).
// ============================================================

/**
 * Filtros globais aplicados à camada de caixa.
 * `inicio`/`fim` recortam o período; `braco` aplica a lente estrutural;
 * `vendasIds` carrega o resultado dos filtros de produto/canal/afiliado
 * (que só fazem sentido sobre linhas rastreáveis a uma venda).
 */
export interface FiltroCaixa {
  inicio?: string; // ISO yyyy-mm-dd
  fim?: string; // ISO yyyy-mm-dd
  braco?: Braco | "todos";
  vendasIds?: Set<string> | null;
}

/**
 * Traduz os filtros de produto/canal/afiliado (e braço, com fallback pelo
 * afiliado) em um conjunto de ids de venda — a ponte entre o mundo da
 * competência e o mundo do caixa.
 */
export function idsVendasFiltradas(
  matriculas: Matricula[],
  afiliados: Afiliado[],
  f: {
    braco?: Braco | "todos";
    produtoId?: string | null;
    canal?: CanalVenda | null;
    afiliadoId?: string | null;
  }
): Set<string> {
  let lista = matriculas;
  if (f.braco && f.braco !== "todos") lista = filtrarPorBraco(lista, afiliados, f.braco);
  if (f.produtoId) lista = lista.filter((m) => m.produtoId === f.produtoId);
  if (f.afiliadoId) lista = lista.filter((m) => m.afiliadoId === f.afiliadoId);
  // canal: venda dentro de lançamento é "lancamento"; fora dele é "perpetuo"
  if (f.canal) lista = lista.filter((m) => (m.lancamentoId ? "lancamento" : "perpetuo") === f.canal);
  return new Set(lista.map((m) => m.id));
}

/** yyyy-mm-dd no fuso LOCAL (toISOString converteria para UTC e poderia virar o dia). */
const isoLocal = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const noPeriodo = (data: string, f: FiltroCaixa): boolean =>
  (!f.inicio || data >= f.inicio) && (!f.fim || data <= f.fim);

const bracoBate = (b: Braco | null | undefined, f: FiltroCaixa): boolean =>
  !f.braco || f.braco === "todos" || b === f.braco;

// Quando há filtro de produto/canal/afiliado ativo, só sobrevivem as linhas
// que dá para amarrar a uma venda: imposto e aluguel não têm produto.
const vendaBate = (origemId: string | null | undefined, f: FiltroCaixa): boolean =>
  !f.vendasIds || (!!origemId && f.vendasIds.has(origemId));

/** Movimentos dentro do período (por DATA DE CAIXA), braço e recorte de vendas. */
export function filtrarMovimentos(movs: MovimentoCaixa[], f: FiltroCaixa = {}): MovimentoCaixa[] {
  return movs.filter((m) => noPeriodo(m.dataCaixa, f) && bracoBate(m.braco, f) && vendaBate(m.origemId, f));
}

/** Recebíveis com vencimento dentro do período e no braço filtrado. */
export function filtrarRecebiveis(lista: Recebivel[], f: FiltroCaixa = {}): Recebivel[] {
  return lista.filter((r) => noPeriodo(r.vencimento, f) && bracoBate(r.braco, f) && vendaBate(r.origemId, f));
}

/** Pagáveis com vencimento dentro do período e no braço filtrado.
 *  (Não aplica o recorte por venda: conta a pagar não tem produto.) */
export function filtrarPagaveis(lista: Pagavel[], f: FiltroCaixa = {}): Pagavel[] {
  return lista.filter((p) => noPeriodo(p.vencimento, f) && bracoBate(p.braco, f));
}

/** Vendas válidas dentro do período/braço/recorte (regime de competência). */
function vendasNoFiltro(matriculas: Matricula[], f: FiltroCaixa = {}): Matricula[] {
  return matriculas.filter(
    (m) =>
      m.statusPagamento !== "pendente" &&
      noPeriodo(m.data, f) &&
      bracoBate(m.braco, f) &&
      (!f.vendasIds || f.vendasIds.has(m.id))
  );
}

/**
 * Saldo de caixa REALIZADO até uma data (inclusive).
 * Parte do saldo inicial parametrizado e soma o extrato — previsto não conta,
 * porque dinheiro projetado não paga boleto.
 */
export function saldoCaixaAte(dc: DatasetCaixa, dataLimite: string): number {
  const delta = dc.movimentos
    .filter((m) => m.status === "realizado" && m.dataCaixa <= dataLimite)
    .reduce((s, m) => s + (m.direcao === "entrada" ? m.valor : -m.valor), 0);
  return r2(dc.parametros.saldoInicialCaixa + delta);
}

// ---------- B.2.1 — Fluxo de caixa direto ----------

export interface LinhaFluxoCaixa {
  categoria: CategoriaCaixa;
  rotulo: string;
  valor: number;
  pct: number; // peso da categoria dentro do total do seu lado
}

export interface FluxoCaixaDireto {
  entradas: LinhaFluxoCaixa[];
  saidas: LinhaFluxoCaixa[];
  totalEntradas: number;
  totalSaidas: number;
  fluxoLiquido: number; // geração (ou queima) de caixa no período
  saldoInicial: number;
  saldoFinal: number;
}

/**
 * Fluxo de caixa DIRETO: de onde o dinheiro veio e para onde foi, no período.
 * Responde "sobrou ou faltou caixa este mês, e por causa de quê?".
 * Usa só movimentos REALIZADOS (o extrato); previsão é papel da projeção.
 */
export function fluxoDeCaixaDireto(dc: DatasetCaixa, f: FiltroCaixa = {}): FluxoCaixaDireto {
  const movs = filtrarMovimentos(dc.movimentos, f).filter((m) => m.status === "realizado");
  const accE = new Map<CategoriaCaixa, number>();
  const accS = new Map<CategoriaCaixa, number>();
  for (const m of movs) {
    const acc = m.direcao === "entrada" ? accE : accS;
    acc.set(m.categoria, (acc.get(m.categoria) ?? 0) + m.valor);
  }
  const soma = (acc: Map<CategoriaCaixa, number>) => r2([...acc.values()].reduce((s, v) => s + v, 0));
  const totalEntradas = soma(accE);
  const totalSaidas = soma(accS);
  const linhas = (acc: Map<CategoriaCaixa, number>, total: number): LinhaFluxoCaixa[] =>
    [...acc.entries()]
      .map(([categoria, valor]) => ({
        categoria,
        rotulo: CATEGORIA_CAIXA_LABEL[categoria],
        valor: r2(valor),
        pct: total ? r2((valor / total) * 100) : 0,
      }))
      .sort((a, b) => b.valor - a.valor);
  // saldo inicial = tudo o que já havia acontecido antes do primeiro dia do recorte
  const saldoInicial = f.inicio
    ? saldoCaixaAte(dc, isoLocal(new Date(new Date(`${f.inicio}T00:00:00`).getTime() - DIA_MS)))
    : dc.parametros.saldoInicialCaixa;
  const fluxoLiquido = r2(totalEntradas - totalSaidas);
  return {
    entradas: linhas(accE, totalEntradas),
    saidas: linhas(accS, totalSaidas),
    totalEntradas,
    totalSaidas,
    fluxoLiquido,
    saldoInicial,
    saldoFinal: r2(saldoInicial + fluxoLiquido),
  };
}

// ---------- B.2.2 — Projeção de caixa 13 semanas ----------

export interface SemanaProjecao {
  semana: number; // 1..13
  inicio: string;
  fim: string;
  entradas: number; // recebíveis com vencimento na semana
  saidas: number; // contas a pagar com vencimento na semana
  liquido: number;
  saldoAcumulado: number;
  negativo: boolean; // semana em que o caixa vira — alerta prioritário
}

/** Segunda-feira da semana da data informada. */
function inicioDaSemana(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (x.getDay() + 6) % 7; // 0 = segunda
  x.setDate(x.getDate() - dow);
  return x;
}

function somaDias(d: Date, n: number): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + n);
  return x;
}

/**
 * Projeção de caixa das próximas 13 semanas (o clássico "13-week cash flow").
 * Responde "em que semana o caixa fica negativo se nada mudar?".
 * Parte do saldo realizado de hoje e projeta com a carteira de recebíveis
 * e pagáveis em aberto — não usa movimentos previstos para não contar duas vezes.
 */
export function projecaoCaixa13Semanas(dc: DatasetCaixa, ref = new Date(), f: FiltroCaixa = {}): SemanaProjecao[] {
  let saldo = saldoCaixaAte(dc, isoLocal(ref));
  const base = inicioDaSemana(ref);
  const recebiveis = dc.recebiveis.filter((r) => r.status !== "recebido" && bracoBate(r.braco, f) && vendaBate(r.origemId, f));
  const pagaveis = dc.pagaveis.filter((p) => p.status !== "pago" && bracoBate(p.braco, f));
  const out: SemanaProjecao[] = [];
  for (let i = 0; i < 13; i++) {
    const inicio = isoLocal(somaDias(base, i * 7));
    const fim = isoLocal(somaDias(base, i * 7 + 6));
    // a semana 1 absorve tudo o que já venceu e continua em aberto —
    // atraso não some do caixa, ele só empurra o problema para a frente
    const piso = i === 0 ? "0000-01-01" : inicio;
    const entradas = r2(
      recebiveis.filter((rc) => rc.vencimento >= piso && rc.vencimento <= fim).reduce((s, rc) => s + rc.valor, 0)
    );
    const saidas = r2(
      pagaveis.filter((p) => p.vencimento >= piso && p.vencimento <= fim).reduce((s, p) => s + p.valor, 0)
    );
    const liquido = r2(entradas - saidas);
    saldo = r2(saldo + liquido);
    out.push({ semana: i + 1, inicio, fim, entradas, saidas, liquido, saldoAcumulado: saldo, negativo: saldo < 0 });
  }
  return out;
}

// ---------- B.2.3 — DRE gerencial (regime de COMPETÊNCIA) ----------

export interface DreGerencial {
  periodo: string;
  receitaBruta: number;
  deducoes: number; // reembolsos + chargebacks perdidos
  impostos: number; // provisão sobre faturamento (alíquota parametrizada)
  receitaLiquida: number;
  taxasGateway: number;
  comissoes: number;
  despesasVariaveis: number;
  custosVariaveis: number;
  margemContribuicao: number;
  margemContribuicaoPct: number;
  custosFixos: number;
  lucroOperacional: number;
  margemLiquidaPct: number;
}

/**
 * DRE gerencial do mês, em COMPETÊNCIA (não é fluxo de caixa).
 * Responde "a operação deu lucro neste mês?" — independente de o dinheiro
 * já ter caído na conta ou não.
 * Cascata: bruto → deduções → impostos → custos variáveis → MC → fixos → lucro.
 */
export function dreGerencial(ds: DatasetFinanceiro, dc: DatasetCaixa, periodo: string): DreGerencial {
  const m = mesFinanceiro(ds, periodo);
  const taxasGateway = r2(m.faturamento - m.liquido);
  // chargeback ganho não custa nada; só o PERDIDO vira dedução de receita
  const chargebacksPerdidos = r2(
    dc.chargebacks.filter((c) => c.status === "perdido" && ym(c.data) === periodo).reduce((s, c) => s + c.valor, 0)
  );
  const deducoes = r2(m.reembolsos + chargebacksPerdidos);
  const impostos = r2((m.faturamento * dc.parametros.aliquotaImposto) / 100);
  const receitaLiquida = r2(m.faturamento - deducoes - impostos);
  const custosVariaveis = r2(taxasGateway + m.comissoes + m.despesasVariaveis);
  const margemContribuicao = r2(receitaLiquida - custosVariaveis);
  const custosFixos = m.despesasFixas;
  const lucroOperacional = r2(margemContribuicao - custosFixos);
  return {
    periodo,
    receitaBruta: m.faturamento,
    deducoes,
    impostos,
    receitaLiquida,
    taxasGateway,
    comissoes: m.comissoes,
    despesasVariaveis: m.despesasVariaveis,
    custosVariaveis,
    margemContribuicao,
    margemContribuicaoPct: m.faturamento ? r2((margemContribuicao / m.faturamento) * 100) : 0,
    custosFixos,
    lucroOperacional,
    margemLiquidaPct: m.faturamento ? r2((lucroOperacional / m.faturamento) * 100) : 0,
  };
}

/**
 * Cascata visual do DRE: do faturamento bruto ao lucro operacional.
 * Responde "onde exatamente cada real do bruto foi parar".
 */
export function waterfallBrutoParaLucro(dre: DreGerencial): WaterfallStep[] {
  return [
    { label: "Receita bruta", valor: dre.receitaBruta, tipo: "total" },
    { label: "Deduções", valor: -dre.deducoes, tipo: "reducao" },
    { label: "Impostos", valor: -dre.impostos, tipo: "reducao" },
    { label: "Taxas", valor: -dre.taxasGateway, tipo: "reducao" },
    { label: "Comissões", valor: -dre.comissoes, tipo: "reducao" },
    { label: "Variáveis", valor: -dre.despesasVariaveis, tipo: "reducao" },
    { label: "Fixos", valor: -dre.custosFixos, tipo: "reducao" },
    { label: "Lucro operacional", valor: dre.lucroOperacional, tipo: "total" },
  ];
}

// ---------- Burn rate e runway ----------

export interface MesCaixa {
  periodo: string;
  entradas: number;
  saidas: number;
  liquido: number;
}

export interface BurnRate {
  meses: MesCaixa[];
  entradaMedia: number;
  saidaMedia: number;
  burnMedio: number; // positivo = queima caixa; negativo = gera caixa
  queimandoCaixa: boolean;
}

/**
 * Burn rate mensal: quanto de caixa a operação queima (ou gera) por mês.
 * Responde "quanto dinheiro some da conta num mês típico?".
 * Olha só o realizado dos últimos `nMeses` meses fechados + o mês corrente.
 */
export function burnRateMensal(dc: DatasetCaixa, nMeses = 3, ref = new Date(), f: FiltroCaixa = {}): BurnRate {
  const periodos = mesesAte(nMeses, ref);
  const movs = dc.movimentos.filter(
    (m) => m.status === "realizado" && bracoBate(m.braco, f) && vendaBate(m.origemId, f)
  );
  const meses: MesCaixa[] = periodos.map((periodo) => {
    const doMes = movs.filter((m) => ym(m.dataCaixa) === periodo);
    const entradas = r2(doMes.filter((m) => m.direcao === "entrada").reduce((s, m) => s + m.valor, 0));
    const saidas = r2(doMes.filter((m) => m.direcao === "saida").reduce((s, m) => s + m.valor, 0));
    return { periodo, entradas, saidas, liquido: r2(entradas - saidas) };
  });
  const media = (arr: number[]) => (arr.length ? r2(arr.reduce((s, v) => s + v, 0) / arr.length) : 0);
  const entradaMedia = media(meses.map((m) => m.entradas));
  const saidaMedia = media(meses.map((m) => m.saidas));
  const burnMedio = r2(saidaMedia - entradaMedia);
  return { meses, entradaMedia, saidaMedia, burnMedio, queimandoCaixa: burnMedio > 0 };
}

export interface Runway {
  saldoAtual: number;
  burnMedio: number;
  meses: number | null; // null = operação se paga (não há esgotamento projetado)
  dataEsgotamento: string | null;
  reservaMinima: number;
  abaixoDaReserva: boolean;
}

/**
 * Runway: por quantos meses o caixa atual aguenta o burn atual.
 * Responde "quanto tempo de vida a operação tem se nada mudar?".
 * Se a operação gera caixa (burn ≤ 0), não há data de esgotamento.
 */
export function runwayMeses(dc: DatasetCaixa, nMeses = 3, ref = new Date(), f: FiltroCaixa = {}): Runway {
  const saldoAtual = saldoCaixaAte(dc, isoLocal(ref));
  const { burnMedio } = burnRateMensal(dc, nMeses, ref, f);
  const reservaMinima = dc.parametros.reservaMinimaCaixa;
  const abaixoDaReserva = saldoAtual < reservaMinima;
  if (burnMedio <= 0) {
    return { saldoAtual, burnMedio, meses: null, dataEsgotamento: null, reservaMinima, abaixoDaReserva };
  }
  const meses = saldoAtual <= 0 ? 0 : r2(saldoAtual / burnMedio);
  return {
    saldoAtual,
    burnMedio,
    meses,
    dataEsgotamento: isoLocal(new Date(ref.getTime() + meses * 30 * DIA_MS)),
    reservaMinima,
    abaixoDaReserva,
  };
}

// ---------- B.2.8 — Ponto de equilíbrio e margem de contribuição ----------

export interface MargemContribuicaoProduto {
  produtoId: string;
  nome: string;
  receita: number;
  custosVariaveis: number;
  valor: number;
  pct: number;
}

export interface MargemContribuicao {
  periodo: string;
  receita: number;
  custosVariaveis: number;
  valor: number;
  pct: number; // % de cada real de venda que sobra para pagar o custo fixo
  porProduto: MargemContribuicaoProduto[];
}

/**
 * Margem de contribuição: quanto sobra de cada real vendido depois de pagar
 * o que só existe porque a venda existiu (taxa, comissão, tráfego, imposto).
 * Responde "cada venda contribui com quanto para cobrir o custo fixo?".
 * O rateio por produto usa a participação do produto na receita do período.
 */
export function margemDeContribuicao(
  ds: DatasetFinanceiro,
  dc: DatasetCaixa,
  periodo: string,
  produtos: Produto[] = []
): MargemContribuicao {
  const dre = dreGerencial(ds, dc, periodo);
  // custos variáveis "de verdade" para MC incluem as deduções e o imposto,
  // porque também variam com o volume vendido
  const custosVariaveis = r2(dre.custosVariaveis + dre.impostos + dre.deducoes);
  const valor = r2(dre.receitaBruta - custosVariaveis);
  const pct = dre.receitaBruta ? r2((valor / dre.receitaBruta) * 100) : 0;

  const vendas = vendasValidasPeriodo(ds, periodo);
  const porProduto: MargemContribuicaoProduto[] = produtos
    .map((p) => {
      const receita = r2(vendas.filter((m) => m.produtoId === p.id).reduce((s, m) => s + m.valor, 0));
      const share = dre.receitaBruta ? receita / dre.receitaBruta : 0;
      const cv = r2(custosVariaveis * share);
      const v = r2(receita - cv);
      return {
        produtoId: p.id,
        nome: p.nome,
        receita,
        custosVariaveis: cv,
        valor: v,
        pct: receita ? r2((v / receita) * 100) : 0,
      };
    })
    .filter((x) => x.receita > 0)
    .sort((a, b) => b.valor - a.valor);

  return { periodo, receita: dre.receitaBruta, custosVariaveis, valor, pct, porProduto };
}

function vendasValidasPeriodo(ds: DatasetFinanceiro, periodo: string): Matricula[] {
  return ds.matriculas.filter((m) => m.statusPagamento !== "pendente" && ym(m.data) === periodo);
}

export interface PontoEquilibrio {
  periodo: string;
  custosFixos: number;
  mcPct: number;
  faturamentoEquilibrio: number; // quanto precisa faturar para lucro zero
  faturamentoAtual: number;
  pctAtingido: number;
  folga: number; // atual − equilíbrio (negativo = ainda no prejuízo)
  ticketMedio: number;
  vendasNecessarias: number;
  atingido: boolean;
}

/**
 * Ponto de equilíbrio (break-even): faturamento mínimo para o lucro ser zero.
 * Responde "quanto ainda preciso vender este mês só para não dar prejuízo?".
 * Fórmula: custo fixo ÷ margem de contribuição %.
 */
export function pontoDeEquilibrio(ds: DatasetFinanceiro, dc: DatasetCaixa, periodo: string): PontoEquilibrio {
  const mc = margemDeContribuicao(ds, dc, periodo);
  const m = mesFinanceiro(ds, periodo);
  // custo fixo do mês: o que foi lançado como fixo; se não houver lançamento,
  // cai no parâmetro de referência para a tela nunca ficar sem norte
  const custosFixos = m.despesasFixas > 0 ? m.despesasFixas : dc.parametros.custoFixoMensal;
  // sem margem de contribuição positiva não existe ponto de equilíbrio:
  // vender mais só aumenta o prejuízo
  const faturamentoEquilibrio = mc.pct > 0 ? r2(custosFixos / (mc.pct / 100)) : 0;
  const faturamentoAtual = m.faturamento;
  const ticketMedio = m.ticketMedio;
  return {
    periodo,
    custosFixos,
    mcPct: mc.pct,
    faturamentoEquilibrio,
    faturamentoAtual,
    pctAtingido: faturamentoEquilibrio ? r2((faturamentoAtual / faturamentoEquilibrio) * 100) : 0,
    folga: r2(faturamentoAtual - faturamentoEquilibrio),
    ticketMedio,
    vendasNecessarias: ticketMedio > 0 ? Math.ceil(faturamentoEquilibrio / ticketMedio) : 0,
    atingido: faturamentoEquilibrio > 0 && faturamentoAtual >= faturamentoEquilibrio,
  };
}

// ---------- B.2.6 — Capital de giro, contas a receber e a pagar ----------

export interface CapitalDeGiro {
  caixa: number;
  aReceber: number;
  aReceberVencido: number;
  aPagar: number;
  aPagarVencido: number;
  capitalDeGiro: number; // caixa + a receber − a pagar
  indiceLiquidez: number | null; // (caixa + a receber) ÷ a pagar
  saldoDescoberto: boolean; // compromissos maiores que os recursos
}

/**
 * Posição de capital de giro: recursos de curto prazo contra compromissos.
 * Responde "se eu tivesse que honrar tudo o que devo, sobraria dinheiro?".
 */
export function posicaoCapitalDeGiro(dc: DatasetCaixa, ref = new Date(), f: FiltroCaixa = {}): CapitalDeGiro {
  const hoje = isoLocal(ref);
  const caixa = saldoCaixaAte(dc, hoje);
  const rec = dc.recebiveis.filter((r) => r.status !== "recebido" && bracoBate(r.braco, f) && vendaBate(r.origemId, f));
  const pag = dc.pagaveis.filter((p) => p.status !== "pago" && bracoBate(p.braco, f));
  const aReceber = r2(rec.reduce((s, r) => s + r.valor, 0));
  const aReceberVencido = r2(rec.filter((r) => r.vencimento < hoje).reduce((s, r) => s + r.valor, 0));
  const aPagar = r2(pag.reduce((s, p) => s + p.valor, 0));
  const aPagarVencido = r2(pag.filter((p) => p.vencimento < hoje).reduce((s, p) => s + p.valor, 0));
  const capitalDeGiro = r2(caixa + aReceber - aPagar);
  return {
    caixa,
    aReceber,
    aReceberVencido,
    aPagar,
    aPagarVencido,
    capitalDeGiro,
    indiceLiquidez: aPagar > 0 ? r2((caixa + aReceber) / aPagar) : null,
    saldoDescoberto: capitalDeGiro < 0,
  };
}

// ---------- B.2.9 — Comissões de afiliados a pagar ----------

export interface ComissaoAfiliadoAberta {
  afiliadoId: string | null;
  nome: string;
  total: number;
  vencido: number;
  aVencer: number;
  qtd: number;
}

export interface ComissoesAPagar {
  total: number;
  vencido: number;
  aVencer: number;
  porAfiliado: ComissaoAfiliadoAberta[];
}

/**
 * Comissões de afiliado ainda não repassadas.
 * Responde "quanto eu devo para a rede hoje, e para quem está atrasado?".
 * Comissão vencida e não paga é o jeito mais rápido de perder um afiliado.
 */
export function comissoesAPagar(
  dc: DatasetCaixa,
  afiliados: Afiliado[],
  ref = new Date(),
  f: FiltroCaixa = {}
): ComissoesAPagar {
  const hoje = isoLocal(ref);
  const abertas = dc.pagaveis.filter(
    (p) => p.categoria === "comissoes" && p.status !== "pago" && noPeriodo(p.vencimento, f) && bracoBate(p.braco, f)
  );
  const acc = new Map<string, ComissaoAfiliadoAberta>();
  for (const p of abertas) {
    const afil = afiliados.find((a) => a.nome === p.fornecedor);
    const chave = afil?.id ?? p.fornecedor;
    const item = acc.get(chave) ?? {
      afiliadoId: afil?.id ?? null,
      nome: p.fornecedor,
      total: 0,
      vencido: 0,
      aVencer: 0,
      qtd: 0,
    };
    item.total = r2(item.total + p.valor);
    if (p.vencimento < hoje) item.vencido = r2(item.vencido + p.valor);
    else item.aVencer = r2(item.aVencer + p.valor);
    item.qtd += 1;
    acc.set(chave, item);
  }
  const porAfiliado = [...acc.values()].sort((a, b) => b.total - a.total);
  return {
    total: r2(porAfiliado.reduce((s, x) => s + x.total, 0)),
    vencido: r2(porAfiliado.reduce((s, x) => s + x.vencido, 0)),
    aVencer: r2(porAfiliado.reduce((s, x) => s + x.aVencer, 0)),
    porAfiliado,
  };
}

// ---------- B.2.10 — Reembolsos, chargebacks e inadimplência ----------

export interface TaxaReembolso {
  qtdVendas: number;
  faturamento: number;
  qtdReembolsos: number;
  valorReembolsado: number;
  taxaQtd: number; // % das vendas que voltaram
  taxaValor: number; // % do faturamento que voltou
}

/**
 * Taxa de reembolso do período (devolução acordada com o cliente).
 * Responde "quanto do que vendi voltou pelo pedido do próprio cliente?".
 * Taxa alta em valor com taxa baixa em quantidade = problema no produto caro.
 */
export function taxaReembolso(ds: DatasetFinanceiro, f: FiltroCaixa = {}): TaxaReembolso {
  const vendas = vendasNoFiltro(ds.matriculas, f);
  const idsFiltrados = f.vendasIds ?? null;
  const reembolsos = ds.reembolsos.filter(
    (x) => noPeriodo(x.data, f) && (!idsFiltrados || idsFiltrados.has(x.matriculaId))
  );
  const faturamento = r2(vendas.reduce((s, m) => s + m.valor, 0));
  const valorReembolsado = r2(reembolsos.reduce((s, x) => s + x.valor, 0));
  return {
    qtdVendas: vendas.length,
    faturamento,
    qtdReembolsos: reembolsos.length,
    valorReembolsado,
    taxaQtd: vendas.length ? r2((reembolsos.length / vendas.length) * 100) : 0,
    taxaValor: faturamento ? r2((valorReembolsado / faturamento) * 100) : 0,
  };
}

export interface TaxaChargeback {
  qtdVendas: number;
  faturamento: number;
  qtd: number;
  valor: number;
  taxaQtd: number;
  taxaValor: number;
  abertos: number;
  ganhos: number;
  perdidos: number;
  valorPerdido: number; // só o perdido sai do caixa
  acimaDoLimite: boolean; // passou do teto tolerado pelas bandeiras
}

/**
 * Taxa de chargeback (contestação imposta pela operadora — ≠ reembolso).
 * Responde "estou perto de ser bloqueado pelo gateway?".
 * Acima de 1% das transações as bandeiras começam a punir a conta.
 */
export function taxaChargeback(ds: DatasetFinanceiro, dc: DatasetCaixa, f: FiltroCaixa = {}): TaxaChargeback {
  const vendas = vendasNoFiltro(ds.matriculas, f);
  const idsFiltrados = f.vendasIds ?? null;
  const lista = dc.chargebacks.filter(
    (c) => noPeriodo(c.data, f) && bracoBate(c.braco, f) && (!idsFiltrados || idsFiltrados.has(c.matriculaId))
  );
  const faturamento = r2(vendas.reduce((s, m) => s + m.valor, 0));
  const valor = r2(lista.reduce((s, c) => s + c.valor, 0));
  const perdidosLista = lista.filter((c) => c.status === "perdido");
  const taxaQtd = vendas.length ? r2((lista.length / vendas.length) * 100) : 0;
  return {
    qtdVendas: vendas.length,
    faturamento,
    qtd: lista.length,
    valor,
    taxaQtd,
    taxaValor: faturamento ? r2((valor / faturamento) * 100) : 0,
    abertos: lista.filter((c) => c.status === "aberto").length,
    ganhos: lista.filter((c) => c.status === "ganho").length,
    perdidos: perdidosLista.length,
    valorPerdido: r2(perdidosLista.reduce((s, c) => s + c.valor, 0)),
    acimaDoLimite: taxaQtd > LIMITE_CHARGEBACK_PCT,
  };
}

export interface FaixaAging {
  faixa: string;
  valor: number;
  qtd: number;
}

export interface Inadimplencia {
  valorEmAberto: number; // tudo que ainda não entrou (vencido + a vencer)
  valorAtrasado: number;
  qtdAtrasada: number;
  taxa: number; // % da carteira em aberto que está atrasada
  diasMedioAtraso: number;
  aging: FaixaAging[];
}

/**
 * Inadimplência da carteira de recebíveis, com aging.
 * Responde "quanto do que eu já vendi está preso e há quanto tempo?".
 * Parcela vencida e não recebida entra no atraso mesmo que o status
 * ainda esteja como "a vencer" (o relógio não espera atualização de cadastro).
 */
export function inadimplencia(dc: DatasetCaixa, ref = new Date(), f: FiltroCaixa = {}): Inadimplencia {
  const hoje = isoLocal(ref);
  const emAberto = dc.recebiveis.filter(
    (r) => r.status !== "recebido" && bracoBate(r.braco, f) && vendaBate(r.origemId, f)
  );
  const atrasados = emAberto.filter((r) => r.status === "atrasado" || r.vencimento < hoje);
  const valorEmAberto = r2(emAberto.reduce((s, r) => s + r.valor, 0));
  const valorAtrasado = r2(atrasados.reduce((s, r) => s + r.valor, 0));
  const diasDeAtraso = (venc: string) =>
    Math.max(0, Math.round((new Date(`${hoje}T00:00:00`).getTime() - new Date(`${venc}T00:00:00`).getTime()) / DIA_MS));
  const faixas: { faixa: string; min: number; max: number }[] = [
    { faixa: "1-15 dias", min: 1, max: 15 },
    { faixa: "16-30 dias", min: 16, max: 30 },
    { faixa: "31-60 dias", min: 31, max: 60 },
    { faixa: "60+ dias", min: 61, max: Infinity },
  ];
  const aging: FaixaAging[] = faixas.map(({ faixa, min, max }) => {
    const doGrupo = atrasados.filter((r) => {
      const d = diasDeAtraso(r.vencimento);
      return d >= min && d <= max;
    });
    return { faixa, valor: r2(doGrupo.reduce((s, r) => s + r.valor, 0)), qtd: doGrupo.length };
  });
  const somaDiasAtraso = atrasados.reduce((s, r) => s + diasDeAtraso(r.vencimento), 0);
  return {
    valorEmAberto,
    valorAtrasado,
    qtdAtrasada: atrasados.length,
    taxa: valorEmAberto ? r2((valorAtrasado / valorEmAberto) * 100) : 0,
    diasMedioAtraso: atrasados.length ? r2(somaDiasAtraso / atrasados.length) : 0,
    aging,
  };
}

// ============================================================
// P1 — Onda C · Módulo F (Financeiro / Caixa / DRE)
// Complementos sobre a base da Onda A. Mesma disciplina:
// funções PURAS, regime declarado no nome/comentário e nada de I/O.
// ============================================================

// ---------- B.2.1 — saldo acumulado, previsto × realizado, ponte de caixa ----------

export interface PontoSaldoCaixa {
  data: string; // ISO yyyy-mm-dd
  entradas: number;
  saidas: number;
  saldo: number; // saldo acumulado REALIZADO no fim do dia
}

/**
 * Trajetória diária do saldo de caixa nos últimos `nDias` (inclui hoje).
 * Responde "quanto tenho hoje e como cheguei aqui?".
 * Só realizado: a linha do saldo é extrato, não promessa.
 */
export function serieSaldoCaixa(dc: DatasetCaixa, nDias = 90, ref = new Date(), f: FiltroCaixa = {}): PontoSaldoCaixa[] {
  const dias: string[] = [];
  for (let i = nDias - 1; i >= 0; i--) dias.push(isoLocal(new Date(ref.getTime() - i * DIA_MS)));
  const movs = dc.movimentos.filter(
    (m) => m.status === "realizado" && bracoBate(m.braco, f) && vendaBate(m.origemId, f)
  );
  // ponto de partida: tudo o que já tinha acontecido antes do primeiro dia da janela
  let saldo = saldoCaixaAte(dc, isoLocal(new Date(new Date(`${dias[0]}T00:00:00`).getTime() - DIA_MS)));
  return dias.map((data) => {
    const doDia = movs.filter((m) => m.dataCaixa === data);
    const entradas = r2(doDia.filter((m) => m.direcao === "entrada").reduce((s, m) => s + m.valor, 0));
    const saidas = r2(doDia.filter((m) => m.direcao === "saida").reduce((s, m) => s + m.valor, 0));
    saldo = r2(saldo + entradas - saidas);
    return { data, entradas, saidas, saldo };
  });
}

export interface LinhaPrevistoRealizado {
  categoria: CategoriaCaixa;
  rotulo: string;
  direcao: "entrada" | "saida";
  previsto: number;
  realizado: number;
  desvio: number; // realizado − previsto
  desvioPct: number | null; // null quando não havia previsão
}

/**
 * Previsto × realizado do caixa no período, por categoria.
 * Responde "o dinheiro entrou/saiu como eu esperava, ou o plano furou?".
 * Previsto aqui é o movimento que ainda não bateu na conta (status `previsto`);
 * realizado é o extrato. A soma dos dois é a expectativa total do período.
 */
export function fluxoPrevistoRealizado(dc: DatasetCaixa, f: FiltroCaixa = {}): LinhaPrevistoRealizado[] {
  const movs = filtrarMovimentos(dc.movimentos, f);
  const acc = new Map<CategoriaCaixa, LinhaPrevistoRealizado>();
  for (const m of movs) {
    const item = acc.get(m.categoria) ?? {
      categoria: m.categoria,
      rotulo: CATEGORIA_CAIXA_LABEL[m.categoria],
      direcao: m.direcao,
      previsto: 0,
      realizado: 0,
      desvio: 0,
      desvioPct: null,
    };
    if (m.status === "realizado") item.realizado = r2(item.realizado + m.valor);
    else item.previsto = r2(item.previsto + m.valor);
    acc.set(m.categoria, item);
  }
  return [...acc.values()]
    .map((x) => ({
      ...x,
      desvio: r2(x.realizado - x.previsto),
      desvioPct: x.previsto > 0 ? r2(((x.realizado - x.previsto) / x.previsto) * 100) : null,
    }))
    .sort((a, b) => b.realizado + b.previsto - (a.realizado + a.previsto));
}

/**
 * Ponte de caixa do período: saldo inicial → entradas → saídas → saldo final.
 * Responde "o que exatamente fez o caixa subir ou cair neste mês?".
 * Diferente do waterfall do DRE: aqui é dinheiro na conta, não competência.
 */
export function waterfallPonteDeCaixa(fx: FluxoCaixaDireto, topN = 4): WaterfallStep[] {
  const passos: WaterfallStep[] = [{ label: "Saldo inicial", valor: fx.saldoInicial, tipo: "total" }];
  const agrupa = (linhas: LinhaFluxoCaixa[], sinal: 1 | -1): WaterfallStep[] => {
    const principais = linhas.slice(0, topN);
    const resto = r2(linhas.slice(topN).reduce((s, l) => s + l.valor, 0));
    const out: WaterfallStep[] = principais.map((l) => ({
      label: l.rotulo,
      valor: r2(sinal * l.valor),
      tipo: sinal > 0 ? "aumento" : "reducao",
    }));
    if (resto > 0) out.push({ label: "Outras", valor: r2(sinal * resto), tipo: sinal > 0 ? "aumento" : "reducao" });
    return out;
  };
  passos.push(...agrupa(fx.entradas, 1), ...agrupa(fx.saidas, -1));
  passos.push({ label: "Saldo final", valor: fx.saldoFinal, tipo: "total" });
  return passos;
}

// ---------- B.2.2 — agenda de caixa e cenários da projeção ----------

export interface ItemAgendaCaixa {
  tipo: "recebimento" | "pagamento";
  descricao: string;
  valor: number;
  vencido: boolean;
}

export interface DiaAgendaCaixa {
  data: string;
  entradas: number;
  saidas: number;
  liquido: number;
  saldoAcumulado: number;
  itens: ItemAgendaCaixa[];
}

/**
 * Agenda de caixa dos próximos `nDias`: o que entra e o que vence, dia a dia.
 * Responde "que dia da agenda aperta o caixa?".
 * O que já venceu e continua em aberto é jogado no primeiro dia — atraso não
 * desaparece do compromisso, só muda de lugar na fila.
 */
export function agendaCaixa(dc: DatasetCaixa, nDias = 90, ref = new Date(), f: FiltroCaixa = {}): DiaAgendaCaixa[] {
  const hoje = isoLocal(ref);
  const limite = isoLocal(new Date(ref.getTime() + (nDias - 1) * DIA_MS));
  const rec = dc.recebiveis.filter(
    (r) => r.status !== "recebido" && r.vencimento <= limite && bracoBate(r.braco, f) && vendaBate(r.origemId, f)
  );
  const pag = dc.pagaveis.filter((p) => p.status !== "pago" && p.vencimento <= limite && bracoBate(p.braco, f));
  const dias = new Map<string, DiaAgendaCaixa>();
  const slot = (data: string): DiaAgendaCaixa => {
    const chave = data < hoje ? hoje : data; // vencido cai em "hoje"
    const d = dias.get(chave) ?? { data: chave, entradas: 0, saidas: 0, liquido: 0, saldoAcumulado: 0, itens: [] };
    dias.set(chave, d);
    return d;
  };
  for (const r of rec) {
    const d = slot(r.vencimento);
    d.entradas = r2(d.entradas + r.valor);
    d.itens.push({ tipo: "recebimento", descricao: r.descricao, valor: r.valor, vencido: r.vencimento < hoje });
  }
  for (const p of pag) {
    const d = slot(p.vencimento);
    d.saidas = r2(d.saidas + p.valor);
    d.itens.push({ tipo: "pagamento", descricao: `${p.fornecedor} — ${p.descricao}`, valor: p.valor, vencido: p.vencimento < hoje });
  }
  let saldo = saldoCaixaAte(dc, hoje);
  return [...dias.values()]
    .sort((a, b) => a.data.localeCompare(b.data))
    .map((d) => {
      const liquido = r2(d.entradas - d.saidas);
      saldo = r2(saldo + liquido);
      return { ...d, liquido, saldoAcumulado: saldo };
    });
}

export interface SemanaCenario {
  semana: number;
  label: string;
  base: number;
  otimista: number;
  pessimista: number;
}

/**
 * Cenários da projeção de 13 semanas: base, otimista e pessimista.
 * Responde "no pior caso, ainda sobrevivo até o próximo lançamento?".
 * As saídas são certas (já contratadas); a incerteza vive nas ENTRADAS —
 * por isso só o recebimento é estressado em ±`variacaoPct`.
 */
export function projecaoCaixaCenarios(
  dc: DatasetCaixa,
  ref = new Date(),
  f: FiltroCaixa = {},
  variacaoPct = 20
): SemanaCenario[] {
  const semanas = projecaoCaixa13Semanas(dc, ref, f);
  const inicial = saldoCaixaAte(dc, isoLocal(ref));
  const fator = variacaoPct / 100;
  let oti = inicial;
  let pes = inicial;
  return semanas.map((s) => {
    oti = r2(oti + s.entradas * (1 + fator) - s.saidas);
    pes = r2(pes + s.entradas * (1 - fator) - s.saidas);
    return {
      semana: s.semana,
      label: `S${s.semana}`,
      base: s.saldoAcumulado,
      otimista: oti,
      pessimista: pes,
    };
  });
}

// ---------- B.2.3 — série do DRE, análise vertical e horizontal ----------

/** DRE mês a mês (competência) para as linhas de evolução de margem. */
export function serieDre(ds: DatasetFinanceiro, dc: DatasetCaixa, nMeses = 12, ref = new Date()): DreGerencial[] {
  return mesesAte(nMeses, ref).map((p) => dreGerencial(ds, dc, p));
}

export interface LinhaDre {
  rotulo: string;
  valor: number;
  av: number; // análise vertical: % sobre a receita bruta
  ah: number | null; // análise horizontal: variação % vs período anterior
  destaque: boolean; // subtotal (receita líquida, MC, lucro)
  reducao: boolean; // linha que subtrai do resultado
}

/**
 * DRE em formato de tabela com análise vertical (%AV sobre a receita bruta) e
 * horizontal (%AH contra o mês anterior).
 * Responde "cada linha pesa quanto e está melhorando ou piorando?".
 */
export function linhasDre(dre: DreGerencial, anterior: DreGerencial | null = null): LinhaDre[] {
  const base = dre.receitaBruta;
  const def: Array<{ rotulo: string; get: (d: DreGerencial) => number; destaque?: boolean; reducao?: boolean }> = [
    { rotulo: "Receita bruta", get: (d) => d.receitaBruta, destaque: true },
    { rotulo: "(−) Reembolsos e chargebacks", get: (d) => d.deducoes, reducao: true },
    { rotulo: "(−) Impostos sobre venda", get: (d) => d.impostos, reducao: true },
    { rotulo: "(=) Receita líquida", get: (d) => d.receitaLiquida, destaque: true },
    { rotulo: "(−) Taxas de gateway", get: (d) => d.taxasGateway, reducao: true },
    { rotulo: "(−) Comissões de afiliados", get: (d) => d.comissoes, reducao: true },
    { rotulo: "(−) Despesas variáveis (tráfego etc.)", get: (d) => d.despesasVariaveis, reducao: true },
    { rotulo: "(=) Margem de contribuição", get: (d) => d.margemContribuicao, destaque: true },
    { rotulo: "(−) Custos fixos", get: (d) => d.custosFixos, reducao: true },
    { rotulo: "(=) Lucro operacional", get: (d) => d.lucroOperacional, destaque: true },
  ];
  return def.map((l) => {
    const valor = l.get(dre);
    const ant = anterior ? l.get(anterior) : null;
    return {
      rotulo: l.rotulo,
      valor,
      av: base ? r2((valor / base) * 100) : 0,
      ah: ant !== null && ant !== 0 ? r2(((valor - ant) / Math.abs(ant)) * 100) : null,
      destaque: Boolean(l.destaque),
      reducao: Boolean(l.reducao),
    };
  });
}

// ---------- B.2.8 — break-even em unidades por produto ----------

export interface BreakEvenProduto {
  produtoId: string;
  nome: string;
  preco: number;
  mcPct: number;
  mcUnitaria: number; // quanto cada venda deste produto joga contra o custo fixo
  unidadesNecessarias: number; // se o mix fosse só este produto
  unidadesVendidas: number;
}

/**
 * Break-even em UNIDADES por produto: quantas vendas de cada oferta cobririam
 * sozinhas o custo fixo do mês.
 * Responde "quantos Protocolos (ou Mentorias) preciso vender para pagar a conta?".
 * É um cenário puro por produto — o mix real está no ponto de equilíbrio em R$.
 */
export function breakEvenUnidades(
  mc: MargemContribuicao,
  custosFixos: number,
  produtos: Produto[],
  ds: DatasetFinanceiro
): BreakEvenProduto[] {
  const vendas = vendasValidasPeriodo(ds, mc.periodo);
  return mc.porProduto
    .map((p) => {
      const preco = produtos.find((x) => x.id === p.produtoId)?.precoBase ?? 0;
      const mcUnitaria = r2((preco * p.pct) / 100);
      return {
        produtoId: p.produtoId,
        nome: p.nome,
        preco,
        mcPct: p.pct,
        mcUnitaria,
        unidadesNecessarias: mcUnitaria > 0 ? Math.ceil(custosFixos / mcUnitaria) : 0,
        unidadesVendidas: vendas.filter((v) => v.produtoId === p.produtoId).length,
      };
    })
    .sort((a, b) => a.unidadesNecessarias - b.unidadesNecessarias);
}

// ---------- B.2.6 — aging, saldo retido em gateway e prazo de recebimento ----------

const FAIXAS_AGING: Array<{ faixa: string; min: number; max: number }> = [
  { faixa: "A vencer", min: -Infinity, max: 0 },
  { faixa: "1-30 dias", min: 1, max: 30 },
  { faixa: "31-60 dias", min: 31, max: 60 },
  { faixa: "60+ dias", min: 61, max: Infinity },
];

function agingDe(itens: Array<{ vencimento: string; valor: number }>, hoje: string): FaixaAging[] {
  const atraso = (venc: string) =>
    Math.round((new Date(`${hoje}T00:00:00`).getTime() - new Date(`${venc}T00:00:00`).getTime()) / DIA_MS);
  return FAIXAS_AGING.map(({ faixa, min, max }) => {
    const grupo = itens.filter((i) => {
      const d = atraso(i.vencimento);
      return d >= min && d <= max;
    });
    return { faixa, valor: r2(grupo.reduce((s, i) => s + i.valor, 0)), qtd: grupo.length };
  });
}

/**
 * Aging da carteira a receber: quanto está a vencer e há quanto tempo venceu.
 * Responde "quanto tenho a receber e quão longe está o dinheiro?".
 */
export function agingRecebiveis(dc: DatasetCaixa, ref = new Date(), f: FiltroCaixa = {}): FaixaAging[] {
  const hoje = isoLocal(ref);
  return agingDe(
    dc.recebiveis.filter((r) => r.status !== "recebido" && bracoBate(r.braco, f) && vendaBate(r.origemId, f)),
    hoje
  );
}

/**
 * Aging das contas a pagar. Faixa vencida = fornecedor/afiliado esperando.
 * Responde "quanto devo e há quanto tempo estou devendo?".
 */
export function agingPagaveis(dc: DatasetCaixa, ref = new Date(), f: FiltroCaixa = {}): FaixaAging[] {
  const hoje = isoLocal(ref);
  return agingDe(dc.pagaveis.filter((p) => p.status !== "pago" && bracoBate(p.braco, f)), hoje);
}

export interface RetidoGateway {
  gateway: Gateway;
  valor: number;
  qtd: number;
  proximaLiberacao: string | null;
}

/**
 * Saldo ainda retido em cada gateway, com a próxima data de liberação.
 * Responde "quanto do meu dinheiro está preso e quando ele solta?".
 */
export function saldoRetidoPorGateway(dc: DatasetCaixa, f: FiltroCaixa = {}): RetidoGateway[] {
  const abertos = dc.recebiveis.filter(
    (r) => r.status !== "recebido" && bracoBate(r.braco, f) && vendaBate(r.origemId, f)
  );
  const acc = new Map<Gateway, RetidoGateway>();
  for (const r of abertos) {
    const item = acc.get(r.gateway) ?? { gateway: r.gateway, valor: 0, qtd: 0, proximaLiberacao: null };
    item.valor = r2(item.valor + r.valor);
    item.qtd += 1;
    if (!item.proximaLiberacao || r.vencimento < item.proximaLiberacao) item.proximaLiberacao = r.vencimento;
    acc.set(r.gateway, item);
  }
  return [...acc.values()].sort((a, b) => b.valor - a.valor);
}

export interface PrazoRecebimento {
  diasMedioLiberacao: number; // prazo contratual médio do gateway (D+X)
  diasMedioRealizado: number; // dias reais entre vender e ter o dinheiro
  qtdBase: number;
}

/**
 * Prazo médio de recebimento (o DSO da operação), ponderado por valor.
 * Responde "quanto tempo passa entre vender e ter o dinheiro na mão?".
 * `diasMedioRealizado` usa só parcelas já recebidas — é o ciclo de verdade,
 * não o prometido pelo gateway.
 */
export function prazoMedioRecebimento(dc: DatasetCaixa, f: FiltroCaixa = {}): PrazoRecebimento {
  const lista = dc.recebiveis.filter((r) => bracoBate(r.braco, f) && vendaBate(r.origemId, f));
  const pond = (itens: Array<{ valor: number; dias: number }>) => {
    const peso = itens.reduce((s, i) => s + i.valor, 0);
    return peso ? r2(itens.reduce((s, i) => s + i.dias * i.valor, 0) / peso) : 0;
  };
  const diasMedioLiberacao = pond(lista.map((r) => ({ valor: r.valor, dias: r.diasLiberacao })));
  // data da venda reconstruída: vencimento − 30×(parcela−1) − D+X do gateway
  const recebidos = lista.filter((r) => r.status === "recebido" && r.dataRecebimento);
  const realizados = recebidos.map((r) => {
    const venc = new Date(`${r.vencimento}T00:00:00`).getTime();
    const venda = venc - 30 * (r.parcela - 1) * DIA_MS - r.diasLiberacao * DIA_MS;
    const dias = Math.max(0, Math.round((new Date(`${r.dataRecebimento}T00:00:00`).getTime() - venda) / DIA_MS));
    return { valor: r.valor, dias };
  });
  return {
    diasMedioLiberacao,
    diasMedioRealizado: pond(realizados),
    qtdBase: recebidos.length,
  };
}

// ---------- B.2.9 — comissões: peso na receita e margem por afiliado ----------

export interface ComissaoNoTempo {
  periodo: string;
  receita: number;
  comissoes: number;
  pct: number; // comissão como % da receita bruta do mês
}

/**
 * Peso da comissão sobre a receita, mês a mês.
 * Responde "meu custo de rede está estável ou corroendo a margem?".
 */
export function comissaoPctReceita(ds: DatasetFinanceiro, nMeses = 12, ref = new Date()): ComissaoNoTempo[] {
  return mesesAte(nMeses, ref).map((periodo) => {
    const m = mesFinanceiro(ds, periodo);
    return {
      periodo,
      receita: m.faturamento,
      comissoes: m.comissoes,
      pct: m.faturamento ? r2((m.comissoes / m.faturamento) * 100) : 0,
    };
  });
}

export interface AfiliadoMargem {
  afiliadoId: string;
  nome: string;
  braco: Braco | null;
  qtdVendas: number;
  receita: number;
  comissoes: number;
  reembolsos: number;
  margemLiquida: number; // receita − comissão − reembolso
  margemPct: number;
}

/**
 * Ranking de afiliados por MARGEM LÍQUIDA gerada, não por faturamento.
 * Responde "quem realmente dá lucro, e não só volume?".
 * Volume alto com reembolso alto e comissão gorda pode dar margem pior que
 * um afiliado pequeno e limpo — é isso que a ordenação expõe.
 */
export function rankingAfiliadosMargem(
  ds: DatasetFinanceiro,
  afiliados: Afiliado[],
  f: FiltroCaixa = {}
): AfiliadoMargem[] {
  const vendas = vendasNoFiltro(ds.matriculas, f);
  return afiliados
    .map((a) => {
      const doAfiliado = vendas.filter((m) => m.afiliadoId === a.id);
      const ids = new Set(doAfiliado.map((m) => m.id));
      const receita = r2(doAfiliado.reduce((s, m) => s + m.valor, 0));
      const comissoes = r2(
        ds.comissoes.filter((c) => c.afiliadoId === a.id && ids.has(c.matriculaId)).reduce((s, c) => s + c.valor, 0)
      );
      const reembolsos = r2(ds.reembolsos.filter((x) => ids.has(x.matriculaId)).reduce((s, x) => s + x.valor, 0));
      const margemLiquida = r2(receita - comissoes - reembolsos);
      return {
        afiliadoId: a.id,
        nome: a.nome,
        braco: a.braco ?? null,
        qtdVendas: doAfiliado.length,
        receita,
        comissoes,
        reembolsos,
        margemLiquida,
        margemPct: receita ? r2((margemLiquida / receita) * 100) : 0,
      };
    })
    .filter((x) => x.qtdVendas > 0)
    .sort((a, b) => b.margemLiquida - a.margemLiquida);
}

// ---------- B.2.10 — reembolso por produto, motivos e série de risco ----------

export interface ReembolsoProduto {
  produtoId: string;
  nome: string;
  qtdVendas: number;
  receita: number;
  qtdReembolsos: number;
  valorReembolsado: number;
  taxaQtd: number;
  taxaValor: number;
}

/**
 * Reembolso por produto, em quantidade e em valor.
 * Responde "qual oferta gera arrependimento?" — taxa alta é sinal de promessa
 * de venda desalinhada com a entrega, não só de cliente difícil.
 */
export function reembolsosPorProduto(
  ds: DatasetFinanceiro,
  produtos: Produto[],
  f: FiltroCaixa = {}
): ReembolsoProduto[] {
  const vendas = vendasNoFiltro(ds.matriculas, f);
  const noPeriodoRe = ds.reembolsos.filter((x) => noPeriodo(x.data, f));
  return produtos
    .map((p) => {
      const doProduto = vendas.filter((m) => m.produtoId === p.id);
      const ids = new Set(doProduto.map((m) => m.id));
      const res = noPeriodoRe.filter((x) => ids.has(x.matriculaId));
      const receita = r2(doProduto.reduce((s, m) => s + m.valor, 0));
      const valorReembolsado = r2(res.reduce((s, x) => s + x.valor, 0));
      return {
        produtoId: p.id,
        nome: p.nome,
        qtdVendas: doProduto.length,
        receita,
        qtdReembolsos: res.length,
        valorReembolsado,
        taxaQtd: doProduto.length ? r2((res.length / doProduto.length) * 100) : 0,
        taxaValor: receita ? r2((valorReembolsado / receita) * 100) : 0,
      };
    })
    .filter((x) => x.qtdVendas > 0)
    .sort((a, b) => b.taxaValor - a.taxaValor);
}

export interface MotivoReembolso {
  motivo: string;
  qtd: number;
  valor: number;
  pct: number; // participação no valor total devolvido
}

/**
 * Motivos declarados de reembolso, ranqueados por R$.
 * Responde "por que o cliente pede o dinheiro de volta?".
 */
export function motivosReembolso(ds: DatasetFinanceiro, f: FiltroCaixa = {}): MotivoReembolso[] {
  const lista = ds.reembolsos.filter(
    (x) => noPeriodo(x.data, f) && (!f.vendasIds || f.vendasIds.has(x.matriculaId))
  );
  const total = r2(lista.reduce((s, x) => s + x.valor, 0));
  const acc = new Map<string, { qtd: number; valor: number }>();
  for (const x of lista) {
    const motivo = x.motivo?.trim() || "Não informado";
    const item = acc.get(motivo) ?? { qtd: 0, valor: 0 };
    item.qtd += 1;
    item.valor = r2(item.valor + x.valor);
    acc.set(motivo, item);
  }
  return [...acc.entries()]
    .map(([motivo, v]) => ({ motivo, qtd: v.qtd, valor: v.valor, pct: total ? r2((v.valor / total) * 100) : 0 }))
    .sort((a, b) => b.valor - a.valor);
}

export interface PontoRisco {
  periodo: string;
  taxaReembolso: number;
  taxaChargeback: number;
  limite: number; // teto tolerado pelas bandeiras (%)
}

/**
 * Série mensal das taxas de reembolso e chargeback contra o teto das bandeiras.
 * Responde "estou me aproximando do limite que derruba a conta no gateway?".
 * A linha do limite entra na série para o gráfico não precisar saber a regra.
 */
export function serieRisco(ds: DatasetFinanceiro, dc: DatasetCaixa, nMeses = 12, ref = new Date()): PontoRisco[] {
  return mesesAte(nMeses, ref).map((periodo) => {
    const janela: FiltroCaixa = { inicio: `${periodo}-01`, fim: `${periodo}-31` };
    return {
      periodo,
      taxaReembolso: taxaReembolso(ds, janela).taxaQtd,
      taxaChargeback: taxaChargeback(ds, dc, janela).taxaQtd,
      limite: LIMITE_CHARGEBACK_PCT,
    };
  });
}
