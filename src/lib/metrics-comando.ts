// ============================================================
// Command Center — matemática exclusiva da tela "/" (SPEC-P1 §3.1 / Anexo B.1).
//
// Módulo NEUTRO (sem "use client"): server components importam daqui à vontade.
// Nada de I/O, nada de cookies, nada de Date.now() escondido — a data de
// referência entra sempre por parâmetro, com `new Date()` só como default.
//
// Regra do pacote: a PÁGINA NÃO CALCULA. Todo número exibido no Command Center
// nasce aqui ou em src/lib/metrics.ts (que este módulo reaproveita — nada de
// reimplementar pace, runway, DRE, inadimplência ou chargeback).
// ============================================================

import type {
  Afiliado,
  Agrupamento,
  Aluno,
  Atividade,
  Braco,
  DatasetCaixa,
  DatasetFinanceiro,
  EscopoMeta,
  IndicadorMeta,
  Matricula,
  Meta,
  Orcamento,
} from "./types";
import type { FiltroFonte } from "./filtros";
import type { FiltroCaixa, PaceMeta, Runway, SemanaProjecao } from "./metrics";
import {
  bracoDaVenda,
  comissoesAPagar,
  deltaPct,
  dreGerencial,
  faixasReativacao,
  idsVendasFiltradas,
  inadimplencia,
  mesesAte,
  orcadoRealizado,
  paceMeta,
  pontoDeEquilibrio,
  posicaoCapitalDeGiro,
  projecaoCaixa13Semanas,
  runwayMeses,
  saldoCaixaAte,
  taxaChargeback,
  taxaReembolso,
  ym,
} from "./metrics";
import { SEM_AGRUPAMENTO, agrupamentosAtivos, ordenarAgrupamentos } from "./agrupamentos";
import { mesCurto, ymLabel } from "./format";

const DIA_MS = 86_400_000;

const r2 = (v: number): number => +v.toFixed(2);

function isoLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dataLocal(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T00:00:00`);
}

/** Dias inteiros entre duas datas ISO (b − a). */
function diasEntre(a: string, b: string): number {
  return Math.round((dataLocal(b).getTime() - dataLocal(a).getTime()) / DIA_MS);
}

function ddmm(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

// ============================================================
// 1) Janela de comando — o período que o Command Center enxerga
// ============================================================

export type EscalaComando = "semana" | "mes" | "trimestre" | "ano";

export interface Janela {
  inicio: string; // ISO yyyy-mm-dd
  fim: string; // ISO yyyy-mm-dd
}

export interface JanelaComando {
  escala: EscalaComando;
  rotulo: string; // "agosto/2026", "3º trimestre/2026"…
  rotuloCurto: string; // "mês", "trimestre"…
  atual: Janela;
  anterior: Janela; // período imediatamente anterior, do mesmo tamanho
  anoPassado: Janela; // mesmo período, um ano atrás (YoY)
  diasTotais: number;
  diasDecorridos: number; // 1-based, saturado em diasTotais
  diasRestantes: number;
  meses: string[]; // 'YYYY-MM' cobertos pela janela atual
  periodoAtual: string; // 'YYYY-MM' do mês de referência (metas, DRE)
}

/** Lista de 'YYYY-MM' cobertos por uma janela. */
function mesesDaJanela(j: Janela): string[] {
  const out: string[] = [];
  const ini = dataLocal(j.inicio);
  const fim = dataLocal(j.fim);
  const cursor = new Date(ini.getFullYear(), ini.getMonth(), 1);
  while (cursor <= fim) {
    out.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`);
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return out;
}

/**
 * Traduz o filtro global de período (7/30/90/365 dias) em uma janela de
 * CALENDÁRIO fechada — semana, mês, trimestre ou ano corrente.
 *
 * Por que calendário e não "últimos N dias": meta, pace e projeção de
 * fechamento só fazem sentido contra um período que tem fim definido. "Últimos
 * 30 dias" não fecha nunca, logo não existe "projeção de fechamento" nem
 * comparação limpa com o mesmo período do ano passado.
 */
export function janelaComando(rangeDias: number, ref = new Date()): JanelaComando {
  const escala: EscalaComando =
    rangeDias <= 7 ? "semana" : rangeDias <= 30 ? "mes" : rangeDias <= 90 ? "trimestre" : "ano";
  const y = ref.getFullYear();
  const m = ref.getMonth();
  const d = ref.getDate();

  let ini: Date;
  let fim: Date;
  let iniAnt: Date;
  let fimAnt: Date;
  let iniYoY: Date;
  let fimYoY: Date;
  let rotulo: string;
  let rotuloCurto: string;

  if (escala === "semana") {
    const dow = (ref.getDay() + 6) % 7; // 0 = segunda
    ini = new Date(y, m, d - dow);
    fim = new Date(y, m, d - dow + 6);
    iniAnt = new Date(y, m, d - dow - 7);
    fimAnt = new Date(y, m, d - dow - 1);
    iniYoY = new Date(y - 1, ini.getMonth(), ini.getDate());
    fimYoY = new Date(y - 1, ini.getMonth(), ini.getDate() + 6);
    rotulo = `semana de ${ddmm(isoLocal(ini))} a ${ddmm(isoLocal(fim))}`;
    rotuloCurto = "semana";
  } else if (escala === "mes") {
    ini = new Date(y, m, 1);
    fim = new Date(y, m + 1, 0);
    iniAnt = new Date(y, m - 1, 1);
    fimAnt = new Date(y, m, 0);
    iniYoY = new Date(y - 1, m, 1);
    fimYoY = new Date(y - 1, m + 1, 0);
    rotulo = ymLabel(`${y}-${String(m + 1).padStart(2, "0")}`);
    rotuloCurto = "mês";
  } else if (escala === "trimestre") {
    const q = Math.floor(m / 3);
    ini = new Date(y, q * 3, 1);
    fim = new Date(y, q * 3 + 3, 0);
    iniAnt = new Date(y, q * 3 - 3, 1);
    fimAnt = new Date(y, q * 3, 0);
    iniYoY = new Date(y - 1, q * 3, 1);
    fimYoY = new Date(y - 1, q * 3 + 3, 0);
    rotulo = `${q + 1}º trimestre/${y}`;
    rotuloCurto = "trimestre";
  } else {
    ini = new Date(y, 0, 1);
    fim = new Date(y, 11, 31);
    iniAnt = new Date(y - 1, 0, 1);
    fimAnt = new Date(y - 1, 11, 31);
    iniYoY = iniAnt;
    fimYoY = fimAnt;
    rotulo = `${y}`;
    rotuloCurto = "ano";
  }

  const atual: Janela = { inicio: isoLocal(ini), fim: isoLocal(fim) };
  const diasTotais = diasEntre(atual.inicio, atual.fim) + 1;
  const decorridos = diasEntre(atual.inicio, isoLocal(ref)) + 1;
  const diasDecorridos = Math.max(1, Math.min(decorridos, diasTotais));

  return {
    escala,
    rotulo,
    rotuloCurto,
    atual,
    anterior: { inicio: isoLocal(iniAnt), fim: isoLocal(fimAnt) },
    anoPassado: { inicio: isoLocal(iniYoY), fim: isoLocal(fimYoY) },
    diasTotais,
    diasDecorridos,
    diasRestantes: Math.max(0, diasTotais - diasDecorridos),
    meses: mesesDaJanela(atual),
    periodoAtual: `${y}-${String(m + 1).padStart(2, "0")}`,
  };
}

// ============================================================
// 2) Resumo financeiro de uma janela arbitrária de dias
// ============================================================

export interface ResumoPeriodo {
  inicio: string;
  fim: string;
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

/** Venda pendente não é receita: só entra no resumo quando paga ou reembolsada. */
function vendasDaJanela(matriculas: Matricula[], j: Janela): Matricula[] {
  return matriculas.filter(
    (m) => m.statusPagamento !== "pendente" && m.data >= j.inicio && m.data <= j.fim
  );
}

/**
 * Espelha `mesFinanceiro` (src/lib/metrics.ts) para um intervalo de DIAS.
 * Existe porque o Command Center trabalha com semana/trimestre/ano, e a função
 * do núcleo só sabe recortar por 'YYYY-MM'.
 */
export function resumoPeriodo(ds: DatasetFinanceiro, j: Janela): ResumoPeriodo {
  const noRange = (data: string): boolean => data >= j.inicio && data <= j.fim;
  const vendas = vendasDaJanela(ds.matriculas, j);
  const faturamento = vendas.reduce((s, m) => s + m.valor, 0);
  const liquido = vendas.reduce((s, m) => s + m.valorLiquido, 0);
  const comissoes = ds.comissoes.filter((c) => noRange(c.data)).reduce((s, c) => s + c.valor, 0);
  const despesas = ds.despesas.filter((x) => noRange(x.data));
  const despesasFixas = despesas.filter((x) => x.tipo === "fixa").reduce((s, x) => s + x.valor, 0);
  const despesasVariaveis = despesas
    .filter((x) => x.tipo === "variavel")
    .reduce((s, x) => s + x.valor, 0);
  const reembolsos = ds.reembolsos.filter((x) => noRange(x.data)).reduce((s, x) => s + x.valor, 0);
  const custoTotal = comissoes + despesasFixas + despesasVariaveis + reembolsos;
  const lucro = liquido - custoTotal;
  return {
    inicio: j.inicio,
    fim: j.fim,
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

// ============================================================
// 3) Meta da janela — metas são mensais; janelas nem sempre
// ============================================================

export interface MetaJanela {
  valor: number;
  prorrateada: boolean; // a janela cobre mês parcial → meta foi rateada por dia
  mesesCobertos: string[];
  mesesComMeta: string[];
}

function achaMeta(
  metas: Meta[],
  indicador: IndicadorMeta,
  escopo: EscopoMeta,
  escopoRef: string | null,
  periodo: string
): Meta | undefined {
  return metas.find(
    (m) => m.indicador === indicador && m.periodo === periodo && m.escopo === escopo && m.escopoRef === escopoRef
  );
}

/**
 * Escopo de meta correspondente à lente global de FONTE (produto) da topbar:
 * "global" para "todos", "produto" com o id da fonte para uma pílula
 * específica. Não confundir com o escopo "braco" (agrupamento cadastrado),
 * que é outra dimensão — ver `desempenhoPorBraco`.
 */
function escopoDaFonte(fonte: FiltroFonte): { escopo: EscopoMeta; escopoRef: string | null } {
  return fonte === "todos" ? { escopo: "global", escopoRef: null } : { escopo: "produto", escopoRef: fonte };
}

/**
 * Meta de um escopo (global, produto ou agrupamento) para a janela pedida.
 *
 * Decisão de produto: a meta cadastrada é sempre MENSAL ('YYYY-MM'). Para
 * janelas que não são um mês inteiro (semana, trimestre, ano), a meta do
 * período é a soma das metas dos meses cobertos, cada uma rateada pela fração
 * de dias daquele mês que cai dentro da janela. Sem isso, "semana" compararia
 * 7 dias de receita contra 30 dias de meta.
 *
 * Núcleo compartilhado por `metaDaJanela` (meta da lente de fonte) e por
 * `desempenhoPorBraco` (meta de cada agrupamento cadastrado).
 */
function metaDoEscopo(
  metas: Meta[],
  indicador: IndicadorMeta,
  escopo: EscopoMeta,
  escopoRef: string | null,
  j: JanelaComando
): MetaJanela | null {
  let valor = 0;
  let prorrateada = false;
  const mesesComMeta: string[] = [];
  for (const periodo of j.meses) {
    const meta = achaMeta(metas, indicador, escopo, escopoRef, periodo);
    if (!meta) continue;
    mesesComMeta.push(periodo);
    const fracao = fracaoDoMesNaJanela(periodo, j.atual);
    if (fracao < 1) prorrateada = true;
    valor += meta.valor * fracao;
  }
  if (!mesesComMeta.length) return null;
  return { valor: r2(valor), prorrateada, mesesCobertos: j.meses, mesesComMeta };
}

/** Meta da janela para a fonte selecionada na lente global (ver `escopoDaFonte`). */
export function metaDaJanela(
  metas: Meta[],
  indicador: IndicadorMeta,
  fonte: FiltroFonte,
  j: JanelaComando
): MetaJanela | null {
  const { escopo, escopoRef } = escopoDaFonte(fonte);
  return metaDoEscopo(metas, indicador, escopo, escopoRef, j);
}

/** Fração (0–1) de um mês 'YYYY-MM' que cai dentro da janela. */
function fracaoDoMesNaJanela(periodo: string, j: Janela): number {
  const ano = Number(periodo.slice(0, 4));
  const mes = Number(periodo.slice(5, 7)) - 1;
  const primeiro = isoLocal(new Date(ano, mes, 1));
  const ultimo = isoLocal(new Date(ano, mes + 1, 0));
  const diasNoMes = diasEntre(primeiro, ultimo) + 1;
  const de = primeiro > j.inicio ? primeiro : j.inicio;
  const ate = ultimo < j.fim ? ultimo : j.fim;
  const cobertos = Math.max(0, diasEntre(de, ate) + 1);
  return cobertos / diasNoMes;
}

/**
 * Quantos "meses equivalentes" a janela vale — usado para ratear metas mensais
 * que não vivem na tabela de metas (ex.: `Afiliado.metaMensal`).
 * Mês cheio = 1 · semana = ~7/31 · trimestre = 3 · ano = 12.
 */
export function mesesEquivalentes(j: JanelaComando): number {
  return j.meses.reduce((s, p) => s + fracaoDoMesNaJanela(p, j.atual), 0);
}

// ============================================================
// 4) Faixa de Comando — a North Star do período (Anexo B.1.1)
// ============================================================

export interface ComparativoNorte {
  rotulo: string;
  valor: number;
  deltaPct: number | null;
}

export interface NorteDoComando {
  janela: JanelaComando;
  realizado: number; // faturamento da janela
  meta: number | null;
  metaProrrateada: boolean;
  pctMeta: number | null;
  pace: PaceMeta | null;
  ritmoAtual: number; // R$/dia realizados até agora
  ritmoIdeal: number; // R$/dia que a meta exige do período inteiro
  ritmoNecessario: number; // R$/dia que falta fazer nos dias restantes
  projecao: number; // fechamento projetado no ritmo atual
  gapProjetado: number | null; // projeção − meta (negativo = vai faltar)
  noRitmo: boolean | null;
  comparativos: ComparativoNorte[];
  resumo: ResumoPeriodo;
  resumoAnterior: ResumoPeriodo;
  resumoAnoPassado: ResumoPeriodo;
}

/**
 * Faixa de Comando: "batemos a meta do período?" respondido em uma linha.
 * Junta realizado + meta + pace (ritmo exigido × ritmo atual) + comparativos
 * (período anterior e mesmo período do ano passado) + projeção de fechamento.
 */
export function norteDoComando(
  ds: DatasetFinanceiro,
  metas: Meta[],
  fonte: FiltroFonte,
  j: JanelaComando
): NorteDoComando {
  const resumo = resumoPeriodo(ds, j.atual);
  const resumoAnterior = resumoPeriodo(ds, j.anterior);
  const resumoAnoPassado = resumoPeriodo(ds, j.anoPassado);
  const mj = metaDaJanela(metas, "faturamento", fonte, j);
  const meta = mj?.valor ?? null;
  const pace = meta !== null ? paceMeta(resumo.faturamento, meta, j.diasDecorridos, j.diasTotais) : null;
  const ritmoAtual = r2(resumo.faturamento / j.diasDecorridos);
  const ritmoIdeal = meta !== null ? r2(meta / j.diasTotais) : 0;
  const falta = meta !== null ? Math.max(0, meta - resumo.faturamento) : 0;
  // se o período já fechou, o ritmo necessário é o do último dia (evita ÷ 0)
  const ritmoNecessario = meta !== null ? r2(falta / Math.max(1, j.diasRestantes)) : 0;

  return {
    janela: j,
    realizado: resumo.faturamento,
    meta,
    metaProrrateada: mj?.prorrateada ?? false,
    pctMeta: pace?.pctMeta ?? null,
    pace,
    ritmoAtual,
    ritmoIdeal,
    ritmoNecessario,
    projecao: pace ? pace.projecao : r2(ritmoAtual * j.diasTotais),
    gapProjetado: pace?.gapProjetado ?? null,
    noRitmo: pace?.noRitmo ?? null,
    comparativos: [
      {
        rotulo: `${j.rotuloCurto} anterior`,
        valor: resumoAnterior.faturamento,
        deltaPct: deltaPct(resumo.faturamento, resumoAnterior.faturamento),
      },
      {
        rotulo: "mesmo período ano passado",
        valor: resumoAnoPassado.faturamento,
        deltaPct: deltaPct(resumo.faturamento, resumoAnoPassado.faturamento),
      },
    ],
    resumo,
    resumoAnterior,
    resumoAnoPassado,
  };
}

// ============================================================
// 5) Pulso de caixa — "sobrou dinheiro?" e "temos caixa?"
// ============================================================

export interface PulsoCaixa {
  saldoHoje: number;
  // Base das leituras de tesouraria: sem extrato lançado e sem saldo inicial
  // parametrizado, saldo/burn/runway não medem nada — o zero aqui é ausência de
  // registro, não uma conta zerada de verdade.
  temExtrato: boolean;
  // Denominador da margem líquida do mês (receita bruta do DRE de competência).
  receitaBrutaMes: number;
  reservaMinima: number;
  abaixoDaReserva: boolean;
  runway: Runway;
  projecao: SemanaProjecao[];
  entradas13s: number;
  saidas13s: number;
  primeiraSemanaNegativa: SemanaProjecao | null;
  capitalDeGiro: number;
  aReceberVencido: number;
  aPagarVencido: number;
  lucroOperacional: number; // DRE do mês de referência (competência)
  margemLiquidaPct: number;
  sobrouDinheiro: boolean; // lucro operacional positivo no mês
  temCaixa: boolean; // saldo acima da reserva mínima e sem semana negativa
}

/**
 * Reaproveita a camada de caixa da Onda A para responder as duas perguntas que
 * "bater a meta" não responde: sobrou dinheiro (competência) e temos caixa
 * (tesouraria)? Faturar não é receber; lucrar não é ter saldo.
 */
export function pulsoDeCaixa(
  ds: DatasetFinanceiro,
  dc: DatasetCaixa,
  fonte: FiltroFonte,
  ref = new Date()
): PulsoCaixa {
  // A lente global deixou de ser "braço" (agrupamento) e virou "fonte de
  // renda" (produto). Para recortar a camada de CAIXA por fonte reusamos o
  // mesmo mecanismo que produto/canal/afiliado já usam em metrics.ts
  // (idsVendasFiltradas → FiltroCaixa.vendasIds) em vez da antiga tag
  // `braco` das entidades de caixa: pagável/recebível sem venda amarrada
  // (aluguel, imposto) fica de fora quando a lente está filtrada — a mesma
  // regra que já valia com a tag de agrupamento antes.
  const f: FiltroCaixa =
    fonte === "todos" ? {} : { vendasIds: idsVendasFiltradas(ds.matriculas, [], { produtoId: fonte }) };
  const saldoHoje = saldoCaixaAte(dc, isoLocal(ref));
  const runway = runwayMeses(dc, 3, ref, f);
  const projecao = projecaoCaixa13Semanas(dc, ref, f);
  const giro = posicaoCapitalDeGiro(dc, ref, f);
  const periodo = `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, "0")}`;
  const dre = dreGerencial(ds, dc, periodo);
  const negativa = projecao.find((s) => s.negativo) ?? null;
  return {
    saldoHoje,
    temExtrato:
      dc.movimentos.some((m) => m.status === "realizado") || dc.parametros.dataSaldoInicial !== "",
    receitaBrutaMes: dre.receitaBruta,
    reservaMinima: dc.parametros.reservaMinimaCaixa,
    abaixoDaReserva: runway.abaixoDaReserva,
    runway,
    projecao,
    entradas13s: r2(projecao.reduce((s, x) => s + x.entradas, 0)),
    saidas13s: r2(projecao.reduce((s, x) => s + x.saidas, 0)),
    primeiraSemanaNegativa: negativa,
    capitalDeGiro: giro.capitalDeGiro,
    aReceberVencido: giro.aReceberVencido,
    aPagarVencido: giro.aPagarVencido,
    lucroOperacional: dre.lucroOperacional,
    margemLiquidaPct: dre.margemLiquidaPct,
    sobrouDinheiro: dre.lucroOperacional > 0,
    temCaixa: !runway.abaixoDaReserva && !negativa,
  };
}

// ============================================================
// 6) Desempenho por braço e por afiliado (Anexo B.1.3)
// ============================================================

export interface DesempenhoBraco {
  // Id do agrupamento cadastrado, OU a sentinela `SEM_AGRUPAMENTO` — o bucket
  // de responsável cadastrado sem `braco` atribuído (ver nota abaixo). Nunca
  // `null`: é sempre um id de linha para a tela usar como `key`/dataKey do
  // gráfico, mesmo quando a linha é o bucket sem-agrupamento.
  braco: Braco;
  nome: string; // nome cadastrado, pronto para a tela — evita reconsultar o cadastro só para rotular
  cor: string; // cor cadastrada, idem — o Card usa direto, sem chamar corDoAgrupamento de novo
  receita: number;
  vendas: number;
  ticketMedio: number;
  pctTotal: number;
  meta: number | null;
  pctMeta: number | null;
  deltaPct: number | null; // vs período anterior de mesmo tamanho
}

/** Cor neutra do bucket "Sem agrupamento" — não sai da paleta que o usuário escolhe para os cadastros dele. */
const COR_SEM_AGRUPAMENTO = "#6F6D7E";
const NOME_SEM_AGRUPAMENTO = "Sem agrupamento";

/**
 * Receita por agrupamento cadastrado na janela, com meta rateada e comparação
 * com o período anterior. A lista de agrupamentos é PARÂMETRO (vem do
 * cadastro do usuário, ver src/lib/agrupamentos.ts) — sem nenhum agrupamento
 * ativo cadastrado devolve lista vazia, e é essa lista vazia que a tela usa
 * para decidir que a seção "por agrupamento" não existe.
 *
 * Responsável cadastrado SEM `braco` (`Afiliado.braco === null`, ver
 * sheets/mapear.ts) entra num bucket próprio — `SEM_AGRUPAMENTO` — que soma
 * ao `total` normalmente. Essa receita já existiu (o cliente vendeu, o
 * responsável está cadastrado); não tem lente estrutural, mas não pode sumir
 * da conta só por isso. Venda DIRETA (sem responsável nenhum) é outra coisa —
 * nunca foi coberta por este agregado e continua fora, como sempre foi.
 */
export function desempenhoPorBraco(
  matriculas: Matricula[],
  afiliados: Afiliado[],
  metas: Meta[],
  j: JanelaComando,
  agrupamentos: Agrupamento[]
): DesempenhoBraco[] {
  const ativos = ordenarAgrupamentos(agrupamentosAtivos(agrupamentos));
  if (!ativos.length) return [];

  const soma = (janela: Janela): Map<string, { receita: number; vendas: number }> => {
    const acc = new Map<string, { receita: number; vendas: number }>();
    for (const a of ativos) acc.set(a.id, { receita: 0, vendas: 0 });
    acc.set(SEM_AGRUPAMENTO, { receita: 0, vendas: 0 });
    for (const m of matriculas) {
      if (m.statusPagamento !== "pago") continue;
      if (m.data < janela.inicio || m.data > janela.fim) continue;
      const b = bracoDaVenda(m, afiliados);
      // Responsável cadastrado (tem afiliadoId) mas sem braço resolvido cai no
      // bucket sentinela; venda direta (sem afiliadoId nenhum) fica de fora,
      // igual sempre foi — nunca teve lente estrutural para perder.
      const chave = b ?? (m.afiliadoId ? SEM_AGRUPAMENTO : null);
      const x = chave ? acc.get(chave) : undefined;
      if (!x) continue; // venda direta, ou braço de agrupamento não cadastrado/inativo — fica fora, não inventa linha
      x.receita = r2(x.receita + m.valor);
      x.vendas += 1;
    }
    return acc;
  };
  const atual = soma(j.atual);
  const anterior = soma(j.anterior);
  const total = [...atual.values()].reduce((s, x) => s + x.receita, 0);

  const linhas = ativos.map((a) => {
    const x = atual.get(a.id)!;
    const ant = anterior.get(a.id)!;
    const mj = metaDoEscopo(metas, "faturamento", "braco", a.id, j);
    const meta = mj?.valor ?? null;
    return {
      braco: a.id,
      nome: a.nome,
      cor: a.cor,
      receita: x.receita,
      vendas: x.vendas,
      ticketMedio: x.vendas ? r2(x.receita / x.vendas) : 0,
      pctTotal: total ? r2((x.receita / total) * 100) : 0,
      meta,
      pctMeta: meta && meta > 0 ? r2((x.receita / meta) * 100) : null,
      deltaPct: deltaPct(x.receita, ant.receita),
    };
  });

  const semAgrupamento = atual.get(SEM_AGRUPAMENTO)!;
  const semAgrupamentoAnt = anterior.get(SEM_AGRUPAMENTO)!;
  // Sempre presente (não só quando > 0), pelo mesmo motivo dos agrupamentos
  // reais acima: some/aparece de janela para janela seria mais confuso do que
  // uma linha estável em R$0 · 0 venda(s) — e "não pode sumir da conta" vale
  // também para a visibilidade da categoria, não só para a soma.
  linhas.push({
    braco: SEM_AGRUPAMENTO,
    nome: NOME_SEM_AGRUPAMENTO,
    cor: COR_SEM_AGRUPAMENTO,
    receita: semAgrupamento.receita,
    vendas: semAgrupamento.vendas,
    ticketMedio: semAgrupamento.vendas ? r2(semAgrupamento.receita / semAgrupamento.vendas) : 0,
    pctTotal: total ? r2((semAgrupamento.receita / total) * 100) : 0,
    meta: null, // não existe meta para "sem agrupamento": não é escopo que o usuário possa mirar
    pctMeta: null,
    deltaPct: deltaPct(semAgrupamento.receita, semAgrupamentoAnt.receita),
  });

  return linhas.sort((a, b) => b.receita - a.receita);
}

export interface PontoBracos {
  periodo: string;
  label: string;
  valores: Record<string, number>; // receita do mês por id de agrupamento
  total: number;
}

/**
 * Série mensal empilhada por agrupamento cadastrado — a lente estrutural ao
 * longo do tempo. Sem cadastro, `valores` fica vazio em todo ponto e a tela
 * não desenha o gráfico (ver `temAgrupamentos`).
 *
 * Com cadastro, `valores` ganha também a chave `SEM_AGRUPAMENTO`: responsável
 * cadastrado sem `braco` não pode desaparecer do `total` do mês só por não
 * ter lente estrutural (mesma regra de `desempenhoPorBraco`, que também usa
 * este bucket — os dois precisam concordar, ou a legenda de um gráfico não
 * bate com a pilha do outro). Venda direta (sem responsável nenhum) continua
 * fora, como sempre foi: nunca teve lente estrutural para perder.
 */
export function serieBracos12m(
  matriculas: Matricula[],
  afiliados: Afiliado[],
  agrupamentos: Agrupamento[],
  nMeses = 12,
  ref = new Date()
): PontoBracos[] {
  const ativos = agrupamentosAtivos(agrupamentos);
  const valoresZerados = (): Record<string, number> => {
    const base: Record<string, number> = Object.fromEntries(ativos.map((a) => [a.id, 0]));
    if (ativos.length) base[SEM_AGRUPAMENTO] = 0;
    return base;
  };
  const periodos = mesesAte(nMeses, ref);
  const base = new Map<string, PontoBracos>(
    periodos.map((p) => [p, { periodo: p, label: ymLabel(p), valores: valoresZerados(), total: 0 }])
  );
  for (const m of matriculas) {
    if (m.statusPagamento !== "pago") continue;
    const ponto = base.get(ym(m.data));
    if (!ponto) continue;
    const b = bracoDaVenda(m, afiliados);
    const chave = b ?? (m.afiliadoId ? SEM_AGRUPAMENTO : null);
    if (!chave || !(chave in ponto.valores)) continue; // venda direta, ou agrupamento órfão/inativo — fora, igual antes
    ponto.valores[chave] = r2(ponto.valores[chave] + m.valor);
    ponto.total = r2(ponto.total + m.valor);
  }
  return periodos.map((p) => base.get(p)!);
}

export interface LinhaAfiliado {
  id: string;
  nome: string;
  braco: Braco | null; // `null` = responsável sem agrupamento atribuído (ver Afiliado.braco, types.ts)
  receita: number;
  vendas: number;
  ticketMedio: number;
  comissao: number;
  meta: number | null; // meta individual mensal, rateada para a janela
  pctMeta: number | null;
  gapMeta: number; // quanto falta em R$ (0 quando bateu)
  deltaPct: number | null;
  pctTotal: number;
}

/**
 * Leaderboard de afiliados na janela.
 * A meta individual (`Afiliado.metaMensal`) é mensal — para janelas parciais
 * ela é rateada pela mesma regra da meta do período (dias cobertos ÷ dias do mês).
 */
export function rankingAfiliados(
  ds: DatasetFinanceiro,
  afiliados: Afiliado[],
  j: JanelaComando
): LinhaAfiliado[] {
  const fatorMeta = mesesEquivalentes(j); // meta mensal → tamanho real da janela
  const receitaTotal = vendasDaJanela(ds.matriculas, j.atual).reduce((s, m) => s + m.valor, 0);

  const linhas = afiliados.map((a) => {
    const naJanela = ds.matriculas.filter(
      (m) => m.afiliadoId === a.id && m.statusPagamento === "pago" && m.data >= j.atual.inicio && m.data <= j.atual.fim
    );
    const anterior = ds.matriculas.filter(
      (m) =>
        m.afiliadoId === a.id &&
        m.statusPagamento === "pago" &&
        m.data >= j.anterior.inicio &&
        m.data <= j.anterior.fim
    );
    const receita = r2(naJanela.reduce((s, m) => s + m.valor, 0));
    const receitaAnt = r2(anterior.reduce((s, m) => s + m.valor, 0));
    const ids = new Set(naJanela.map((m) => m.id));
    const comissao = r2(
      ds.comissoes.filter((c) => ids.has(c.matriculaId)).reduce((s, c) => s + c.valor, 0)
    );
    const meta = a.metaMensal ? r2(a.metaMensal * fatorMeta) : null;
    return {
      id: a.id,
      nome: a.nome,
      braco: a.braco,
      receita,
      vendas: naJanela.length,
      ticketMedio: naJanela.length ? r2(receita / naJanela.length) : 0,
      comissao,
      meta,
      pctMeta: meta && meta > 0 ? r2((receita / meta) * 100) : null,
      gapMeta: meta ? r2(Math.max(0, meta - receita)) : 0,
      deltaPct: deltaPct(receita, receitaAnt),
      pctTotal: receitaTotal ? r2((receita / receitaTotal) * 100) : 0,
    };
  });
  return linhas.sort((a, b) => b.receita - a.receita);
}

export interface FatiaReceita {
  nome: string;
  valor: number;
  pct: number;
}

export interface Concentracao {
  // Sem receita na janela não há distribuição para medir: HHI fica null em vez
  // de 0, porque "0" no índice significa receita infinitamente pulverizada —
  // exatamente o veredito oposto ao que a ausência de venda autoriza.
  semBase: boolean;
  hhi: number | null; // Herfindahl-Hirschman: 0 (pulverizado) a 10.000 (fonte única)
  nivel: "saudavel" | "atencao" | "critico" | null;
  leitura: string;
  topNome: string | null;
  topPct: number | null;
  top3Pct: number | null;
  fatias: FatiaReceita[];
}

/**
 * Concentração de receita por origem (cada afiliado + venda direta), via HHI.
 * Responde "se a maior fonte parar amanhã, quanto do faturamento evapora?".
 * Referência antitruste clássica: <1.500 pulverizado, 1.500–2.500 atenção,
 * >2.500 concentrado. Em negócio de mentoria, concentração alta = risco de
 * fornecedor único de receita.
 */
export function concentracaoReceita(
  ds: DatasetFinanceiro,
  afiliados: Afiliado[],
  j: Janela
): Concentracao {
  const vendas = vendasDaJanela(ds.matriculas, j).filter((m) => m.statusPagamento === "pago");
  const acc = new Map<string, number>();
  for (const m of vendas) {
    const nome = m.afiliadoId
      ? afiliados.find((a) => a.id === m.afiliadoId)?.nome ?? m.afiliadoNome ?? "Afiliado"
      : "Venda direta";
    acc.set(nome, r2((acc.get(nome) ?? 0) + m.valor));
  }
  const total = [...acc.values()].reduce((s, v) => s + v, 0);
  const fatias: FatiaReceita[] = [...acc.entries()]
    .map(([nome, valor]) => ({ nome, valor, pct: total ? r2((valor / total) * 100) : 0 }))
    .sort((a, b) => b.valor - a.valor);
  if (!fatias.length) {
    return {
      semBase: true,
      hhi: null,
      nivel: null,
      leitura: "sem receita no período para medir concentração",
      topNome: null,
      topPct: null,
      top3Pct: null,
      fatias,
    };
  }
  const hhi = r2(fatias.reduce((s, f) => s + f.pct * f.pct, 0));
  const nivel: Concentracao["nivel"] = hhi > 2500 ? "critico" : hhi > 1500 ? "atencao" : "saudavel";
  const top = fatias[0];
  return {
    semBase: false,
    hhi,
    nivel,
    leitura:
      nivel === "critico"
        ? "receita concentrada demais em uma fonte"
        : nivel === "atencao"
          ? "concentração começando a pesar"
          : "receita bem distribuída",
    topNome: top.nome,
    topPct: top.pct,
    top3Pct: r2(fatias.slice(0, 3).reduce((s, f) => s + f.pct, 0)),
    fatias,
  };
}

// ============================================================
// 7) Tendência, pace acumulado e forecast (Anexo B.1.4)
// ============================================================

export interface PontoPace {
  label: string;
  dia: number;
  realizado: number | null; // acumulado até hoje; null depois de hoje
  ideal: number; // trilho linear até a meta
  projetado: number | null; // ritmo atual estendido até o fim do período
}

/**
 * Pace acumulado: a curva do realizado contra o trilho da meta, mais a
 * projeção de fechamento no ritmo atual. Responde de bater o olho
 * "estou adiantado ou atrasado, e quanto?".
 * Em janelas longas (trimestre/ano) os pontos são amostrados para o gráfico
 * não virar sopa de pixels — o último dia entra sempre.
 */
export function paceAcumulado(ds: DatasetFinanceiro, j: JanelaComando, meta: number | null): PontoPace[] {
  const vendas = vendasDaJanela(ds.matriculas, j.atual);
  const porDia = new Map<number, number>();
  for (const m of vendas) {
    const dia = diasEntre(j.atual.inicio, m.data) + 1;
    porDia.set(dia, r2((porDia.get(dia) ?? 0) + m.valor));
  }
  const passo = Math.max(1, Math.ceil(j.diasTotais / 40));
  const ritmoAtual = (() => {
    let acc = 0;
    for (let d = 1; d <= j.diasDecorridos; d++) acc += porDia.get(d) ?? 0;
    return acc / j.diasDecorridos;
  })();

  const out: PontoPace[] = [];
  let acumulado = 0;
  for (let dia = 1; dia <= j.diasTotais; dia++) {
    acumulado = r2(acumulado + (porDia.get(dia) ?? 0));
    const ehAmostra = dia % passo === 0 || dia === j.diasTotais || dia === j.diasDecorridos || dia === 1;
    if (!ehAmostra) continue;
    const data = isoLocal(new Date(dataLocal(j.atual.inicio).getTime() + (dia - 1) * DIA_MS));
    out.push({
      label: j.escala === "ano" ? mesCurto(Number(data.slice(5, 7))) : ddmm(data),
      dia,
      realizado: dia <= j.diasDecorridos ? acumulado : null,
      ideal: meta !== null ? r2((meta * dia) / j.diasTotais) : 0,
      // a projeção arranca do ponto de hoje para as duas linhas se encostarem
      projetado: dia >= j.diasDecorridos ? r2(ritmoAtual * dia) : null,
    });
  }
  return out;
}

export interface PontoTendencia {
  periodo: string;
  label: string;
  faturamento: number | null; // histórico realizado
  previsto: number | null; // forecast linear dos próximos meses
  lucro: number | null;
  meta: number | null;
}

/** Regressão linear simples (mínimos quadrados) sobre a série mensal. */
function tendenciaLinear(valores: number[]): { a: number; b: number } {
  const n = valores.length;
  if (n < 2) return { a: 0, b: valores[0] ?? 0 };
  const somaX = (n * (n - 1)) / 2;
  const somaY = valores.reduce((s, v) => s + v, 0);
  const somaXY = valores.reduce((s, v, i) => s + v * i, 0);
  const somaX2 = valores.reduce((s, _v, i) => s + i * i, 0);
  const den = n * somaX2 - somaX * somaX;
  if (!den) return { a: 0, b: somaY / n };
  const a = (n * somaXY - somaX * somaY) / den;
  return { a, b: (somaY - a * somaX) / n };
}

/**
 * Tendência de 12 meses + forecast dos próximos `nFuturos` meses por regressão
 * linear, com a linha de meta do escopo. Responde "se a curva continuar assim,
 * onde eu chego?" — o mês corrente entra como realizado parcial (é o que existe).
 */
export function tendenciaComForecast(
  serie: Array<{ periodo: string; faturamento: number; lucro: number }>,
  metas: Meta[],
  fonte: FiltroFonte,
  nFuturos = 3
): PontoTendencia[] {
  const { escopo, escopoRef } = escopoDaFonte(fonte);
  const historico: PontoTendencia[] = serie.map((m, i) => ({
    periodo: m.periodo,
    label: ymLabel(m.periodo),
    faturamento: m.faturamento,
    lucro: m.lucro,
    // o último ponto do histórico repete no forecast para as linhas se ligarem
    previsto: i === serie.length - 1 ? m.faturamento : null,
    meta: achaMeta(metas, "faturamento", escopo, escopoRef, m.periodo)?.valor ?? null,
  }));

  // meses fechados apenas: o mês corrente ainda está incompleto e enviesaria a reta
  const fechados = serie.slice(0, -1).map((m) => m.faturamento);
  const { a, b } = tendenciaLinear(fechados);
  const ultimo = serie[serie.length - 1]?.periodo ?? "";
  const ano = Number(ultimo.slice(0, 4));
  const mes = Number(ultimo.slice(5, 7)) - 1;

  const futuro: PontoTendencia[] = [];
  for (let k = 1; k <= nFuturos; k++) {
    const d = new Date(ano, mes + k, 1);
    const periodo = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const previsto = r2(Math.max(0, a * (fechados.length - 1 + k) + b));
    futuro.push({
      periodo,
      label: ymLabel(periodo),
      faturamento: null,
      lucro: null,
      previsto,
      meta: achaMeta(metas, "faturamento", escopo, escopoRef, periodo)?.valor ?? null,
    });
  }
  return [...historico, ...futuro];
}

// ============================================================
// 8) Saúde do negócio 2.0 com drivers (Anexo B.1.7)
// ============================================================

export type NivelSaude = "critico" | "atencao" | "bom" | "excelente";

export interface DriverSaude {
  chave: string;
  rotulo: string;
  peso: number; // pontos máximos que o driver vale
  temBase: boolean; // o dado que o driver mede existe?
  pontos: number | null; // null = sem base: não pontua e não empresta pontos
  pctDriver: number | null; // 0–100 do próprio driver; null = sem base
  leitura: string; // o número em linguagem de dono
  ajuda: boolean; // está puxando o score para cima? (sem base nunca ajuda)
}

/** Driver que efetivamente entrou na conta — pontuação garantida pelo tipo. */
export type DriverComBase = DriverSaude & {
  temBase: true;
  pontos: number;
  pctDriver: number;
};

export interface SaudeComposta {
  // `score: number | null` em vez de um número sempre presente: o desenho força
  // cada consumidor a decidir o que mostrar quando não há base, em vez de deixar
  // a ausência passar disfarçada de nota baixa.
  score: number | null; // 0–100 sobre os pesos que TÊM base; null = sem base
  semBase: boolean; // nenhum driver tem base — não há score
  parcial: boolean; // parte dos drivers ficou de fora do cálculo
  nivel: NivelSaude | null;
  rotuloNivel: string | null;
  pesoComBase: number; // soma dos pesos considerados (denominador do score)
  drivers: DriverSaude[]; // os 7, com `temBase` dizendo quem entrou
  comBase: DriverComBase[]; // só os que entraram no cálculo
  puxamParaCima: DriverComBase[];
  puxamParaBaixo: DriverComBase[];
}

export const NIVEL_SAUDE_COMANDO: Record<NivelSaude, string> = {
  critico: "Crítico",
  atencao: "Atenção",
  bom: "Bom",
  excelente: "Excelente",
};

/** Normaliza um valor entre piso (0 pontos) e teto (100% dos pontos). */
function faixa(valor: number, piso: number, teto: number): number {
  if (teto === piso) return 0;
  return Math.max(0, Math.min(1, (valor - piso) / (teto - piso)));
}

/** Normaliza invertido: quanto MENOR o valor, melhor (reembolso, atraso, HHI). */
function faixaInvertida(valor: number, bom: number, ruim: number): number {
  if (ruim === bom) return 0;
  return Math.max(0, Math.min(1, (ruim - valor) / (ruim - bom)));
}

export interface EntradaSaude {
  norte: NorteDoComando;
  pulso: PulsoCaixa;
  concentracao: Concentracao;
  // Percentual sem denominador não é 0%: é indefinido. `null` é a única forma
  // honesta de dizer "não houve venda para reembolsar", "não há carteira em
  // aberto para atrasar", "não há cliente para recomprar".
  reembolsoPct: number | null;
  chargebackPct: number | null;
  inadimplenciaPct: number | null;
  recompraPct: number | null; // % da base que comprou mais de uma vez
}

/**
 * Score 0–100 de saúde do negócio, montado a partir de 7 drivers com peso.
 * O número sozinho não serve para decidir nada: a tela mostra QUEM puxa para
 * cima e QUEM puxa para baixo, para o dono saber onde mexer.
 *
 * Pesos (somam 100):
 *   ritmo vs meta 20 · margem líquida 20 · runway/caixa 15 · retenção 15 ·
 *   concentração 10 · reembolso+chargeback 10 · inadimplência 10
 *
 * REGRA DE BASE: um driver só pontua se o dado que ele mede existe. Ler "0% de
 * reembolso" de quem não vendeu nada como nota máxima é inferência que os dados
 * não sustentam — era assim que uma base inteiramente vazia produzia 45/100.
 * Driver sem base sai do cálculo (não empresta nem tira pontos) e o score é
 * renormalizado sobre os pesos que sobraram; sem nenhum driver com base não há
 * score nenhum.
 */
export function saudeComposta(e: EntradaSaude): SaudeComposta {
  const pctMeta = e.norte.pctMeta ?? 0;
  const pctTempo = e.norte.pace?.pctTempo ?? 100;
  // ritmo relativo: 100% = exatamente no trilho da meta para o tempo decorrido
  const ritmoRel = pctTempo > 0 ? (pctMeta / pctTempo) * 100 : 0;
  const runwayMesesVal = e.pulso.runway.meses === null ? 12 : e.pulso.runway.meses;
  const temMeta = e.norte.meta !== null;
  const temFaturamentoNoMes = e.pulso.receitaBrutaMes > 0;
  const temDevolucoes = e.reembolsoPct !== null && e.chargebackPct !== null;

  // `fracao: null` = driver sem base. Nada de 0: zero é nota, null é ausência.
  const brutos: Array<Omit<DriverSaude, "temBase" | "pontos" | "pctDriver" | "ajuda"> & { fracao: number | null }> = [
    {
      chave: "ritmo",
      rotulo: "Ritmo vs meta",
      peso: 20,
      fracao: temMeta ? faixa(ritmoRel, 50, 105) : null,
      leitura: temMeta
        ? `${Math.round(ritmoRel)}% do trilho da meta para o tempo decorrido`
        : "sem meta cadastrada no período — nada contra o que medir o ritmo",
    },
    {
      chave: "margem",
      rotulo: "Margem líquida",
      peso: 20,
      fracao: temFaturamentoNoMes ? faixa(e.pulso.margemLiquidaPct, 0, 30) : null,
      leitura: temFaturamentoNoMes
        ? `${e.pulso.margemLiquidaPct.toFixed(1)}% de lucro operacional sobre o bruto`
        : "sem faturamento no mês — não há sobre o que calcular margem",
    },
    {
      chave: "caixa",
      rotulo: "Caixa e runway",
      peso: 15,
      fracao: e.pulso.temExtrato
        ? e.pulso.abaixoDaReserva
          ? faixa(runwayMesesVal, 0, 6) * 0.5
          : faixa(runwayMesesVal, 1, 6)
        : null,
      leitura: !e.pulso.temExtrato
        ? "sem movimento de caixa registrado — não há saldo nem burn para medir"
        : e.pulso.runway.meses === null
          ? "operação se paga — sem data de esgotamento"
          : `${e.pulso.runway.meses.toFixed(1)} meses de caixa no burn atual`,
    },
    {
      chave: "retencao",
      rotulo: "Recompra",
      peso: 15,
      fracao: e.recompraPct === null ? null : faixa(e.recompraPct, 5, 40),
      leitura:
        e.recompraPct === null
          ? "sem cliente com compra registrada — não há recompra para medir"
          : `${e.recompraPct.toFixed(1)}% dos clientes compraram mais de uma vez`,
    },
    {
      chave: "concentracao",
      rotulo: "Diversificação de receita",
      peso: 10,
      fracao: e.concentracao.semBase ? null : faixaInvertida(e.concentracao.hhi!, 1500, 5000),
      leitura: e.concentracao.semBase
        ? "sem receita no período — não há como medir concentração"
        : `${e.concentracao.topNome} responde por ${e.concentracao.topPct!.toFixed(0)}% da receita`,
    },
    {
      chave: "devolucoes",
      rotulo: "Reembolso e chargeback",
      peso: 10,
      fracao: temDevolucoes ? faixaInvertida(e.reembolsoPct! + e.chargebackPct! * 3, 2, 15) : null,
      leitura: temDevolucoes
        ? `${e.reembolsoPct!.toFixed(1)}% de reembolso · ${e.chargebackPct!.toFixed(2)}% de chargeback`
        : "sem venda no período — não há o que ser devolvido ou contestado",
    },
    {
      chave: "inadimplencia",
      rotulo: "Inadimplência",
      peso: 10,
      fracao: e.inadimplenciaPct === null ? null : faixaInvertida(e.inadimplenciaPct, 5, 40),
      leitura:
        e.inadimplenciaPct === null
          ? "sem carteira em aberto — não há o que estar atrasado"
          : `${e.inadimplenciaPct.toFixed(1)}% da carteira em aberto está atrasada`,
    },
  ];

  const drivers: DriverSaude[] = brutos.map((d) => {
    const base = { chave: d.chave, rotulo: d.rotulo, peso: d.peso, leitura: d.leitura };
    if (d.fracao === null) {
      return { ...base, temBase: false, pontos: null, pctDriver: null, ajuda: false };
    }
    return {
      ...base,
      temBase: true,
      pontos: r2(d.fracao * d.peso),
      pctDriver: r2(d.fracao * 100),
      ajuda: d.fracao >= 0.6,
    };
  });

  const comBase = drivers.filter((d): d is DriverComBase => d.temBase);
  const pesoComBase = comBase.reduce((s, d) => s + d.peso, 0);
  const semBase = pesoComBase === 0;
  // renormaliza sobre os pesos com base: o score continua sendo 0–100, mas do
  // que dá para medir. Com os 7 drivers em pé o divisor é 100 e nada muda.
  const score = semBase
    ? null
    : Math.round((comBase.reduce((s, d) => s + d.pontos, 0) / pesoComBase) * 100);
  const nivel: NivelSaude | null =
    score === null ? null : score >= 80 ? "excelente" : score >= 60 ? "bom" : score >= 40 ? "atencao" : "critico";

  return {
    score,
    semBase,
    parcial: !semBase && comBase.length < drivers.length,
    nivel,
    rotuloNivel: nivel === null ? null : NIVEL_SAUDE_COMANDO[nivel],
    pesoComBase,
    drivers,
    comBase,
    // "quem puxa" é medido em PONTOS PERDIDOS, não no % do driver: um driver de
    // peso 10 perfeito importa menos que um de peso 20 pela metade
    puxamParaCima: [...comBase].filter((d) => d.ajuda).sort((a, b) => b.pontos - a.pontos),
    puxamParaBaixo: [...comBase]
      .filter((d) => !d.ajuda)
      .sort((a, b) => b.peso - b.pontos - (a.peso - a.pontos)),
  };
}

/**
 * Monta a entrada do score e devolve a saúde composta.
 * Existe para a PÁGINA NÃO CALCULAR nada: ela passa os datasets e recebe o
 * score com os drivers prontos.
 */
export function saudeDoComando(
  ds: DatasetFinanceiro,
  dc: DatasetCaixa,
  fonte: FiltroFonte,
  norte: NorteDoComando,
  pulso: PulsoCaixa,
  concentracao: Concentracao,
  ref = new Date()
): SaudeComposta {
  // mesmo mecanismo de vendasIds usado em pulsoDeCaixa — reembolso/chargeback/
  // inadimplência são atribuíveis a uma venda específica, então a lente de
  // fonte filtra por ali, não pela antiga tag `braco`.
  const vendasIds = fonte === "todos" ? undefined : idsVendasFiltradas(ds.matriculas, [], { produtoId: fonte });
  const recorte: FiltroCaixa = { vendasIds, inicio: norte.janela.atual.inicio, fim: norte.janela.atual.fim };
  const reemb = taxaReembolso(ds, recorte);
  const cb = taxaChargeback(ds, dc, recorte);
  const inad = inadimplencia(dc, ref, { vendasIds });
  return saudeComposta({
    norte,
    pulso,
    concentracao,
    // cada taxa só é passada adiante quando o SEU denominador existe
    reembolsoPct: reemb.faturamento > 0 ? reemb.taxaValor : null,
    chargebackPct: cb.qtdVendas > 0 ? cb.taxaQtd : null,
    inadimplenciaPct: inad.valorEmAberto > 0 ? inad.taxa : null,
    recompraPct: taxaRecompra(ds.matriculas),
  });
}

/** Últimas vendas da janela — a camada de evidência do que já aconteceu. */
export function ultimasVendas(ds: DatasetFinanceiro, j: Janela, n = 6): Matricula[] {
  return vendasDaJanela(ds.matriculas, j)
    .slice()
    .sort((a, b) => b.data.localeCompare(a.data))
    .slice(0, n);
}

/**
 * % da base que comprou mais de uma vez — driver de retenção do score.
 * `null` quando não há nenhum cliente com compra: sem denominador, a taxa não
 * é 0%, é indefinida.
 */
export function taxaRecompra(matriculas: Matricula[]): number | null {
  const porAluno = new Map<string, number>();
  for (const m of matriculas) {
    if (m.statusPagamento === "pendente") continue;
    porAluno.set(m.alunoId, (porAluno.get(m.alunoId) ?? 0) + 1);
  }
  if (!porAluno.size) return null;
  const recorrentes = [...porAluno.values()].filter((n) => n > 1).length;
  return r2((recorrentes / porAluno.size) * 100);
}

// ============================================================
// 9) Central de Alertas priorizados por R$ (Anexo B.1.2 / B.1.5)
// ============================================================

export type SeveridadeAlerta = "critico" | "atencao" | "oportunidade";
export type TipoAlerta = "meta" | "caixa" | "cobranca" | "risco" | "rede" | "receita" | "custo";

export interface AlertaComando {
  id: string;
  tipo: TipoAlerta;
  severidade: SeveridadeAlerta;
  titulo: string; // o problema, em uma linha
  detalhe: string; // o contexto que sustenta o número
  acao: string; // o que fazer hoje
  valor: number; // R$ em risco / em jogo — critério ÚNICO de ordenação
  rotuloValor: string; // "em risco", "parado", "a recuperar"…
  href: string;
}

export interface EntradaAlertas {
  ds: DatasetFinanceiro;
  dc: DatasetCaixa;
  alunos: Aluno[];
  atividades: Atividade[];
  afiliados: Afiliado[];
  orcamentos: Orcamento[];
  norte: NorteDoComando;
  pulso: PulsoCaixa;
  fonte: FiltroFonte;
  // pré-computado por desempenhoPorBraco (ver page.tsx): evita recalcular
  // aqui e garante a MESMA base (sempre a completa, sem a lente de fonte)
  // que a seção "por agrupamento" da tela usa — lista vazia = sem cadastro.
  porAgrupamento: DesempenhoBraco[];
  ref?: Date;
}

/** Fração de contatos frios que costuma voltar quando trabalhados (premissa de reativação). */
const TAXA_REATIVACAO_ESPERADA = 0.15;

/**
 * Central de Alertas: cada linha diz O PROBLEMA, QUANTO ESTÁ EM JOGO em reais e
 * O QUE FAZER — ordenada por impacto financeiro, nunca por data.
 * Regra de produto: alerta sem valor em R$ não entra na lista; vira ruído.
 */
export function alertasComando(e: EntradaAlertas): AlertaComando[] {
  const ref = e.ref ?? new Date();
  const hoje = isoLocal(ref);
  // mesmo mecanismo de vendasIds de pulsoDeCaixa/saudeDoComando — ver o
  // comentário lá para a razão de não usar mais a tag `braco`.
  const vendasIds =
    e.fonte === "todos" ? undefined : idsVendasFiltradas(e.ds.matriculas, [], { produtoId: e.fonte });
  const f: FiltroCaixa = { vendasIds };
  const out: AlertaComando[] = [];
  const periodo = e.norte.janela.periodoAtual;

  // 1) Meta do período em risco — o gap projetado é o dinheiro que vai faltar
  if (e.norte.meta !== null && e.norte.gapProjetado !== null && e.norte.gapProjetado < 0) {
    const gap = Math.abs(e.norte.gapProjetado);
    const atrasoGrave = (e.norte.pctMeta ?? 0) < (e.norte.pace?.pctTempo ?? 0) - 15;
    out.push({
      id: "meta-risco",
      tipo: "meta",
      severidade: atrasoGrave ? "critico" : "atencao",
      titulo: `Meta d${e.norte.janela.rotuloCurto === "mês" ? "o" : "a"} ${e.norte.janela.rotuloCurto} não fecha no ritmo atual`,
      detalhe: `Projeção de fechamento abaixo da meta com ${e.norte.janela.diasRestantes} dia(s) restante(s).`,
      acao: `Faturar ${fmtRitmo(e.norte.ritmoNecessario)}/dia até o fim d${e.norte.janela.rotuloCurto === "mês" ? "o" : "a"} ${e.norte.janela.rotuloCurto} (hoje está em ${fmtRitmo(e.norte.ritmoAtual)}/dia).`,
      valor: r2(gap),
      rotuloValor: "vai faltar",
      href: "/analise/faturamento",
    });
  }

  // 2) Caixa vira negativo dentro das 13 semanas — o alerta mais caro que existe
  if (e.pulso.primeiraSemanaNegativa) {
    const s = e.pulso.primeiraSemanaNegativa;
    out.push({
      id: "caixa-negativo",
      tipo: "caixa",
      severidade: "critico",
      titulo: `Caixa fica negativo na semana ${s.semana} (${ddmm(s.inicio)})`,
      detalhe: `Saldo projetado de ${brl(s.saldoAcumulado)} considerando recebíveis e contas a pagar em aberto.`,
      acao: "Antecipar recebíveis, renegociar vencimentos ou segurar despesa variável antes dessa semana.",
      valor: r2(Math.abs(s.saldoAcumulado)),
      rotuloValor: "descoberto projetado",
      href: "/financeiro/projecao",
    });
  }

  // 3) Saldo abaixo da reserva mínima definida nos parâmetros
  if (e.pulso.abaixoDaReserva) {
    out.push({
      id: "reserva-minima",
      tipo: "caixa",
      severidade: "critico",
      titulo: "Caixa abaixo da reserva mínima",
      detalhe: `Saldo de ${brl(e.pulso.saldoHoje)} contra reserva mínima de ${brl(e.pulso.reservaMinima)}.`,
      acao: "Recompor a reserva antes de aprovar novo investimento em tráfego ou estrutura.",
      valor: r2(Math.max(0, e.pulso.reservaMinima - e.pulso.saldoHoje)),
      rotuloValor: "para recompor",
      href: "/financeiro/caixa",
    });
  }

  // 4) Recebíveis atrasados — dinheiro já vendido e preso
  const inad = inadimplencia(e.dc, ref, f);
  if (inad.valorAtrasado > 0) {
    out.push({
      id: "inadimplencia",
      tipo: "cobranca",
      severidade: inad.taxa > 20 ? "critico" : "atencao",
      titulo: `${inad.qtdAtrasada} parcela(s) vencida(s) e não recebida(s)`,
      detalhe: `${inad.taxa.toFixed(1)}% da carteira em aberto, com ${Math.round(inad.diasMedioAtraso)} dias médios de atraso.`,
      acao: "Disparar régua de cobrança começando pela faixa de maior valor.",
      valor: inad.valorAtrasado,
      rotuloValor: "parado a receber",
      href: "/financeiro/capital-de-giro",
    });
  }

  // 5) Comissões vencidas — o jeito mais rápido de perder um afiliado
  const com = comissoesAPagar(e.dc, e.afiliados, ref, f);
  if (com.vencido > 0) {
    out.push({
      id: "comissoes-vencidas",
      tipo: "rede",
      severidade: "critico",
      titulo: "Comissões de afiliado vencidas e não repassadas",
      detalhe: `${com.porAfiliado.filter((a) => a.vencido > 0).map((a) => a.nome).join(", ")} com repasse em atraso.`,
      acao: "Quitar hoje — comissão atrasada derruba a produtividade da rede na semana seguinte.",
      valor: com.vencido,
      rotuloValor: "devido à rede",
      href: "/financeiro/comissoes",
    });
  }

  // 6) Chargeback acima do teto tolerado pelas bandeiras (1%)
  const cb = taxaChargeback(e.ds, e.dc, { ...f, inicio: e.norte.janela.atual.inicio, fim: e.norte.janela.atual.fim });
  if (cb.acimaDoLimite && cb.valor > 0) {
    out.push({
      id: "chargeback",
      tipo: "risco",
      severidade: "critico",
      titulo: `Chargeback em ${cb.taxaQtd.toFixed(2)}% das transações`,
      detalhe: `Acima do teto de 1% das bandeiras — risco de bloqueio da conta no gateway. ${cb.abertos} disputa(s) em aberto.`,
      acao: "Contestar as disputas abertas com prova de entrega e revisar a comunicação de cobrança.",
      valor: cb.valor,
      rotuloValor: "em disputa",
      href: "/financeiro/reembolsos",
    });
  }

  // 7) Reembolso alto — sintoma de promessa desalinhada com a entrega
  const reemb = taxaReembolso(e.ds, { ...f, inicio: e.norte.janela.atual.inicio, fim: e.norte.janela.atual.fim });
  if (reemb.taxaValor > 5 && reemb.valorReembolsado > 0) {
    out.push({
      id: "reembolso",
      tipo: "risco",
      severidade: reemb.taxaValor > 10 ? "critico" : "atencao",
      titulo: `Reembolso consumiu ${reemb.taxaValor.toFixed(1)}% do faturamento do período`,
      detalhe: `${reemb.qtdReembolsos} devolução(ões) sobre ${reemb.qtdVendas} venda(s).`,
      acao: "Revisar promessa da oferta e onboarding dos primeiros 7 dias — é onde o pedido nasce.",
      valor: reemb.valorReembolsado,
      rotuloValor: "devolvido",
      href: "/financeiro/reembolsos",
    });
  }

  // 8) Abaixo do ponto de equilíbrio — vender ainda não paga a conta do mês
  const pe = pontoDeEquilibrio(e.ds, e.dc, periodo);
  if (!pe.atingido && pe.faturamentoEquilibrio > 0) {
    out.push({
      id: "break-even",
      tipo: "meta",
      severidade: "atencao",
      titulo: "Mês ainda não pagou o próprio custo fixo",
      detalhe: `Faltam ${brl(Math.abs(pe.folga))} para o ponto de equilíbrio de ${brl(pe.faturamentoEquilibrio)}.`,
      acao: `Fechar ~${Math.max(1, Math.ceil(Math.abs(pe.folga) / Math.max(1, pe.ticketMedio)))} venda(s) no ticket médio atual.`,
      valor: r2(Math.abs(pe.folga)),
      rotuloValor: "até o break-even",
      href: "/financeiro/dre",
    });
  }

  // 9) Capital de giro descoberto: compromissos maiores que os recursos
  if (e.pulso.capitalDeGiro < 0) {
    out.push({
      id: "capital-giro",
      tipo: "caixa",
      severidade: "critico",
      titulo: "Compromissos maiores que caixa + recebíveis",
      detalhe: "Se tudo vencesse hoje, a operação não fecharia a conta.",
      acao: "Renegociar prazos de pagáveis ou antecipar recebíveis com custo conhecido.",
      valor: r2(Math.abs(e.pulso.capitalDeGiro)),
      rotuloValor: "descoberto",
      href: "/financeiro/capital-de-giro",
    });
  }

  // 10) Agrupamento abaixo da meta — só existe alerta se houver cadastro
  // (porAgrupamento vem vazio sem agrupamento ativo). Roda sempre, independente
  // da fonte selecionada na lente global: agrupamento e fonte são dimensões
  // diferentes, e porAgrupamento já vem calculado sobre a base completa.
  for (const g of e.porAgrupamento) {
    if (g.meta === null || g.receita >= g.meta) continue;
    const gap = r2(g.meta - g.receita);
    out.push({
      id: `agrupamento-${g.braco}`,
      tipo: "meta",
      severidade: (g.pctMeta ?? 0) < 50 ? "critico" : "atencao",
      titulo: `${g.nome} em ${Math.round(g.pctMeta ?? 0)}% da meta`,
      detalhe: `${brl(g.receita)} de ${brl(g.meta)} no período, com ${g.vendas} venda(s).`,
      acao: `Realocar tráfego/esforço para ${g.nome} ou revisar a meta do agrupamento.`,
      valor: gap,
      rotuloValor: "gap do agrupamento",
      href: "/financeiro",
    });
  }

  // 11) Afiliados abaixo da meta individual — top 3 por gap
  const abaixo = rankingAfiliados(e.ds, e.afiliados, e.norte.janela)
    .filter((a) => a.meta !== null && a.gapMeta > 0)
    .slice(0, 3);
  for (const a of abaixo) {
    out.push({
      id: `afiliado-${a.id}`,
      tipo: "rede",
      severidade: (a.pctMeta ?? 0) < 40 ? "critico" : "atencao",
      titulo: `${a.nome} em ${Math.round(a.pctMeta ?? 0)}% da meta individual`,
      detalhe: `${brl(a.receita)} de ${brl(a.meta ?? 0)} no período · ${a.vendas} venda(s).`,
      acao: "Call de 15 min para destravar a oferta e revisar o pipeline da semana.",
      valor: a.gapMeta,
      rotuloValor: "gap do afiliado",
      href: "/crm",
    });
  }

  // 12) Receita esfriando: contatos parados há 60+ dias (Quadro de Avisos 2.0)
  const faixas = faixasReativacao(e.alunos, e.atividades, e.ds.matriculas, ref);
  const frios = faixas.find((x) => x.faixa === "60+")?.alunos.length ?? 0;
  const ticket = e.norte.resumo.ticketMedio || ticketMedioGeral(e.ds.matriculas);
  if (frios > 0 && ticket > 0) {
    out.push({
      id: "reativacao",
      tipo: "receita",
      severidade: "oportunidade",
      titulo: `${frios} contato(s) sem interação há mais de 60 dias`,
      detalhe: `Potencial estimado a ${Math.round(TAXA_REATIVACAO_ESPERADA * 100)}% de reativação sobre ticket médio de ${brl(ticket)}.`,
      acao: "Puxar a lista fria no CRM e disparar a régua de retomada ainda hoje.",
      valor: r2(frios * ticket * TAXA_REATIVACAO_ESPERADA),
      rotuloValor: "a recuperar",
      href: "/crm",
    });
  }

  // 13) Categorias estourando o orçamento do mês
  const estouros = orcadoRealizado(e.ds, e.orcamentos, periodo).filter((l) => l.estourou);
  const totalEstouro = r2(estouros.reduce((s, l) => s + (l.realizado - l.previsto), 0));
  if (totalEstouro > 0) {
    out.push({
      id: "orcamento",
      tipo: "custo",
      severidade: "atencao",
      titulo: `${estouros.length} categoria(s) acima do orçado`,
      detalhe: estouros
        .slice(0, 3)
        .map((l) => `${l.categoria} ${l.pct ? `${Math.round(l.pct)}%` : ""}`)
        .join(" · "),
      acao: "Congelar o excedente ou reorçar a categoria antes do fechamento do mês.",
      valor: totalEstouro,
      rotuloValor: "acima do orçado",
      href: "/financeiro/dre",
    });
  }

  // ordenação por R$ em jogo — este é o contrato da Central de Alertas
  return out.filter((a) => a.valor > 0).sort((a, b) => b.valor - a.valor);
}

function ticketMedioGeral(matriculas: Matricula[]): number {
  const pagas = matriculas.filter((m) => m.statusPagamento === "pago");
  if (!pagas.length) return 0;
  return r2(pagas.reduce((s, m) => s + m.valor, 0) / pagas.length);
}

// formatadores locais mínimos — só para compor as FRASES dos alertas.
// A formatação de exibição continua sendo responsabilidade de src/lib/format.ts.
function brl(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function fmtRitmo(v: number): string {
  return brl(v);
}
