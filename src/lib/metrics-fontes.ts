// Matemática da tela "fontes de renda" (src/app/(app)/lancamentos) — TODA a
// conta desta tela mora aqui. Funções puras: nada de I/O, cookies ou
// Date.now() escondido (a data de referência entra sempre por parâmetro).
//
// "Fonte de renda" = um PRODUTO. Cada produto carrega uma `categoria` (curso,
// mentoria, serviço...) e, opcionalmente, um `braco`. A regra de receita é
// deliberadamente mais estrita que a do resto da app: só matrícula com
// statusPagamento "pago" é receita aqui — pendente não é receita e reembolsada
// (que em mesFinanceiro entra no bruto e sai como dedução) nesta tela nem
// chega a contar, porque a pergunta que a tela responde é "quanto dinheiro
// esta fonte de fato trouxe", não "quanto foi faturado".

import { agrupamentosAtivos } from "./agrupamentos";
import { CATEGORIAS_FONTE, CATEGORIA_FONTE_LABEL, type CategoriaFonte } from "./fontes";
import { bracoDaVenda, deltaPct } from "./metrics";
import type { Afiliado, Agrupamento, Braco, Matricula, Produto } from "./types";

const r2 = (v: number) => +v.toFixed(2);
const DIA_MS = 86400000;

/** yyyy-mm-dd no fuso LOCAL (evita o salto de dia do toISOString em UTC). */
function isoLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export interface JanelaFontes {
  atual: { inicio: string; fim: string };
  anterior: { inicio: string; fim: string };
}

/**
 * Traduz o filtro global de período (rangeDias) numa janela "últimos N dias"
 * e no bloco imediatamente anterior, do mesmo tamanho — a base de comparação
 * da coluna "variação" da lista de fontes.
 */
export function janelaFontes(rangeDias: number, ref = new Date()): JanelaFontes {
  const fim = isoLocal(ref);
  const inicio = isoLocal(new Date(ref.getTime() - (rangeDias - 1) * DIA_MS));
  const fimAnterior = isoLocal(new Date(ref.getTime() - rangeDias * DIA_MS));
  const inicioAnterior = isoLocal(new Date(ref.getTime() - (2 * rangeDias - 1) * DIA_MS));
  return { atual: { inicio, fim }, anterior: { inicio: inicioAnterior, fim: fimAnterior } };
}

/** Vendas PAGAS (única situação que conta como receita nesta tela) dentro do período. */
function vendasPagas(matriculas: Matricula[], inicio: string, fim: string): Matricula[] {
  return matriculas.filter(
    (m) => m.statusPagamento === "pago" && m.data >= inicio && m.data <= fim
  );
}

/**
 * Braço de uma venda NESTA tela: produto.braco manda primeiro (é o atributo
 * mais estável — o produto não muda de braço a cada venda), e só cai para o
 * braço do afiliado (bracoDaVenda, já usado no resto da app via filtrarPorBraco
 * em metrics.ts) quando o produto não tem braço fixo.
 */
function bracoDaFonte(m: Matricula, bracoProduto: Braco | null, afiliados: Afiliado[]): Braco | null {
  return bracoProduto ?? bracoDaVenda(m, afiliados);
}

// ---------- 1) "De onde vem o dinheiro?" — receita por categoria de fonte ----------

export interface CategoriaReceita {
  categoria: CategoriaFonte;
  rotulo: string;
  receita: number;
  vendas: number;
  clientes: number;
  pct: number; // % da receita total do período coberto por esta categoria
}

/** Receita, vendas e clientes distintos por categoria de fonte, no período. */
export function receitaPorCategoria(
  matriculas: Matricula[],
  produtos: Produto[],
  inicio: string,
  fim: string
): CategoriaReceita[] {
  const categoriaPorProduto = new Map(produtos.map((p) => [p.id, p.categoria] as const));
  const vendas = vendasPagas(matriculas, inicio, fim);

  const acc = new Map<CategoriaFonte, { receita: number; vendas: number; clientes: Set<string> }>();
  for (const c of CATEGORIAS_FONTE) acc.set(c, { receita: 0, vendas: 0, clientes: new Set() });
  for (const m of vendas) {
    const categoria = categoriaPorProduto.get(m.produtoId);
    if (!categoria) continue; // produto não cadastrado (ou removido) — não inventa categoria
    const x = acc.get(categoria)!;
    x.receita = r2(x.receita + m.valor);
    x.vendas += 1;
    x.clientes.add(m.alunoId);
  }
  const total = r2([...acc.values()].reduce((s, x) => s + x.receita, 0));
  return CATEGORIAS_FONTE.map((categoria) => {
    const x = acc.get(categoria)!;
    return {
      categoria,
      rotulo: CATEGORIA_FONTE_LABEL[categoria],
      receita: x.receita,
      vendas: x.vendas,
      clientes: x.clientes.size,
      pct: total ? r2((x.receita / total) * 100) : 0,
    };
  })
    .filter((c) => c.vendas > 0)
    .sort((a, b) => b.receita - a.receita);
}

// ---------- 2) "E por agrupamento?" — mesma leitura, lente do cadastro do usuário ----------

export interface BracoReceita {
  braco: Braco; // id de um agrupamento cadastrado
  receita: number;
  vendas: number;
  clientes: number;
  pct: number;
}

/**
 * Receita por agrupamento cadastrado no período, usando a prioridade produto →
 * afiliado. Recebe a base SEM o filtro global de fonte aplicado de propósito:
 * esta seção é a lente estrutural (igual à do Command Center, ver
 * desempenhoPorBraco em metrics-comando.ts) — se o dono já filtrou por um
 * produto na topbar, mostrar só uma barra aqui não ajudaria a comparar nada.
 *
 * A lista de agrupamentos é PARÂMETRO (vem do cadastro do usuário): sem
 * nenhum agrupamento ativo cadastrado devolve lista vazia, e é essa lista
 * vazia que a tela usa para decidir que a seção não existe.
 */
export function receitaPorBracoFontes(
  matriculas: Matricula[],
  produtos: Produto[],
  afiliados: Afiliado[],
  inicio: string,
  fim: string,
  agrupamentos: Agrupamento[]
): BracoReceita[] {
  const ativos = agrupamentosAtivos(agrupamentos);
  if (!ativos.length) return [];

  const bracoPorProduto = new Map(produtos.map((p) => [p.id, p.braco] as const));
  const vendas = vendasPagas(matriculas, inicio, fim);

  const acc = new Map<string, { receita: number; vendas: number; clientes: Set<string> }>();
  for (const a of ativos) acc.set(a.id, { receita: 0, vendas: 0, clientes: new Set() });
  for (const m of vendas) {
    const braco = bracoDaFonte(m, bracoPorProduto.get(m.produtoId) ?? null, afiliados);
    const x = braco ? acc.get(braco) : undefined;
    if (!x) continue; // sem braço identificável, ou braço de agrupamento não cadastrado/inativo
    x.receita = r2(x.receita + m.valor);
    x.vendas += 1;
    x.clientes.add(m.alunoId);
  }
  const total = r2([...acc.values()].reduce((s, x) => s + x.receita, 0));
  return ativos
    .map((a) => {
      const x = acc.get(a.id)!;
      return {
        braco: a.id,
        receita: x.receita,
        vendas: x.vendas,
        clientes: x.clientes.size,
        pct: total ? r2((x.receita / total) * 100) : 0,
      };
    })
    .filter((b) => b.vendas > 0)
    .sort((a, b) => b.receita - a.receita);
}

// ---------- 3) "Qual fonte sustenta e qual está caindo?" — lista por produto ----------

export interface FonteResumo {
  produtoId: string;
  nome: string;
  categoria: CategoriaFonte;
  braco: Braco | null;
  receita: number;
  receitaAnterior: number;
  deltaPct: number | null; // null = sem venda no período anterior, não dá para comparar
  vendas: number;
  clientes: number;
  ticketMedio: number;
}

/** Soma de receita por produto, dentro de uma lista de vendas já filtrada por período. */
function receitaPorProduto(vendas: Matricula[]): Map<string, number> {
  const acc = new Map<string, number>();
  for (const m of vendas) acc.set(m.produtoId, r2((acc.get(m.produtoId) ?? 0) + m.valor));
  return acc;
}

/**
 * Uma linha por produto (fonte): receita do período, variação contra o
 * período anterior, clientes distintos e ticket médio — a base da lista
 * clicável que leva ao monitoramento de cada fonte.
 */
export function resumoFontes(
  matriculas: Matricula[],
  produtos: Produto[],
  janela: JanelaFontes
): FonteResumo[] {
  const vendasAtual = vendasPagas(matriculas, janela.atual.inicio, janela.atual.fim);
  const vendasAnterior = vendasPagas(matriculas, janela.anterior.inicio, janela.anterior.fim);
  const receitaAtualPorProduto = receitaPorProduto(vendasAtual);
  const receitaAnteriorPorProduto = receitaPorProduto(vendasAnterior);

  return produtos
    .map((p) => {
      const vendasProduto = vendasAtual.filter((m) => m.produtoId === p.id);
      const receita = receitaAtualPorProduto.get(p.id) ?? 0;
      const receitaAnterior = receitaAnteriorPorProduto.get(p.id) ?? 0;
      return {
        produtoId: p.id,
        nome: p.nome,
        categoria: p.categoria,
        braco: p.braco,
        receita,
        receitaAnterior,
        deltaPct: deltaPct(receita, receitaAnterior),
        vendas: vendasProduto.length,
        clientes: new Set(vendasProduto.map((m) => m.alunoId)).size,
        ticketMedio: vendasProduto.length ? r2(receita / vendasProduto.length) : 0,
      };
    })
    .filter((f) => f.receita > 0 || f.receitaAnterior > 0) // sem venda nos dois períodos → nada a mostrar
    .sort((a, b) => b.receita - a.receita);
}

export interface DestaquesFontes {
  sustenta: FonteResumo | null; // maior variação positiva — quem está puxando o período
  caindo: FonteResumo | null; // maior variação negativa — quem está perdendo força
}

/**
 * As duas pontas da lista de fontes: a que mais cresce e a que mais cai,
 * only entre as que TÊM comparação (deltaPct !== null) — sem venda no período
 * anterior não é "queda", é ausência de base, e por isso fica de fora daqui.
 */
export function destaquesFontes(fontes: FonteResumo[]): DestaquesFontes {
  const comparaveis = fontes.filter((f): f is FonteResumo & { deltaPct: number } => f.deltaPct !== null);
  if (!comparaveis.length) return { sustenta: null, caindo: null };
  const sustenta = comparaveis.reduce((a, b) => (b.deltaPct > a.deltaPct ? b : a));
  const caindo = comparaveis.reduce((a, b) => (b.deltaPct < a.deltaPct ? b : a));
  return {
    sustenta: sustenta.deltaPct > 0 ? sustenta : null,
    caindo: caindo.deltaPct < 0 ? caindo : null,
  };
}
