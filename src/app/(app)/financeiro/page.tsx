import Link from "next/link";
import { ArrowRight, CalendarDays, CircleAlert, CircleDollarSign, ListChecks, Plus, Target, TrendingUp, Wallet } from "lucide-react";
import { GraficoCenarios, GraficoComparativoAnual, GraficoMargemProduto, GraficoOrcadoRealizado } from "@/components/charts";
import { Badge, Botao, Campo, Card, Input, PageHeader, PainelForm, ProgressBar, Select, Stat, Tabela, Td, Th, Vazio, cx } from "@/components/ui";
import { criarDespesa, salvarMetaFinanceira, salvarOrcamento } from "@/lib/actions";
import { getDB } from "@/lib/data";
import { CATEGORIAS_DESPESA, TIPO_DESPESA_LABEL } from "@/lib/domain";
import { fmtBRL, fmtBRLExato, fmtDate, fmtPct, mesCurto, ymAtual, ymLabel } from "@/lib/format";
import { healthScore, NIVEL_SAUDE_LABEL } from "@/lib/health";
import { gerarInsights } from "@/lib/insights";
import { cenariosLucro, comparativoAnual, mesFinanceiro, orcadoRealizado, porProduto, projecaoAno } from "@/lib/metrics";

export const dynamic = "force-dynamic";

export default async function Financeiro({
  searchParams,
}: {
  searchParams: { ano?: string };
}) {
  const db = getDB();
  const [ds, produtos, orcamentos, metas, alunos, lancamentos] = await Promise.all([
    db.dataset(),
    db.listProdutos(),
    db.listOrcamentos(),
    db.listMetasFinanceiras(),
    db.listAlunos(),
    db.listLancamentos(),
  ]);

  const anoCorrente = new Date().getFullYear();
  const ano = Number(searchParams.ano) || anoCorrente;
  const anoAnterior = ano - 1;

  const anosDisponiveis = [
    ...new Set([...ds.matriculas, ...ds.despesas].map((x) => Number(x.data.slice(0, 4)))),
  ].sort((a, b) => b - a);

  const meses = Array.from({ length: 12 }, (_, i) =>
    mesFinanceiro(ds, `${ano}-${String(i + 1).padStart(2, "0")}`)
  );
  const comVenda = meses.filter((m) => m.faturamento > 0 || m.custoTotal > 0);
  const totAno = {
    faturamento: meses.reduce((s, m) => s + m.faturamento, 0),
    custos: meses.reduce((s, m) => s + m.custoTotal, 0),
    lucro: meses.reduce((s, m) => s + m.lucro, 0),
  };
  const margemAno = totAno.faturamento ? (totAno.lucro / totAno.faturamento) * 100 : 0;

  // ---- memória de cálculo dos 4 KPIs do ano ----
  // `mesFinanceiro` (src/lib/metrics.ts) só conta matrícula cujo status NÃO é
  // "pendente". Logo o faturamento do ano = vendas pagas + vendas reembolsadas
  // (o estorno da reembolsada reaparece do lado dos custos, em `reembolsos`).
  const vendasAno = ds.matriculas.filter(
    (m) => m.data.startsWith(`${ano}-`) && m.statusPagamento !== "pendente"
  );
  const somaValor = (lista: typeof vendasAno) => lista.reduce((s, m) => s + m.valor, 0);
  const fatPagas = somaValor(vendasAno.filter((m) => m.statusPagamento === "pago"));
  const fatReembolsadas = somaValor(vendasAno.filter((m) => m.statusPagamento === "reembolsado"));
  // custoTotal do mês = comissões + despesas fixas + despesas variáveis + reembolsos;
  // e lucro = liquido − custoTotal. Somando os 12 meses, a conta se mantém.
  const somaMes = (
    campo: "liquido" | "comissoes" | "despesasFixas" | "despesasVariaveis" | "reembolsos"
  ) => meses.reduce((s, m) => s + m[campo], 0);

  const comparativo = comparativoAnual(ds, anoAnterior, ano).map((m) => ({
    label: mesCurto(m.mes),
    anterior: m.anterior,
    atual: m.atual,
  }));

  const proj = ano === anoCorrente ? projecaoAno(ds) : null;
  const prods = porProduto(ds, produtos, ano);

  // ---- expansão v2: health score, insights, orçamento e cenários ----
  const periodoAtual = ymAtual();
  const saude = healthScore(ds, alunos, produtos);
  const insights = gerarInsights({ ds, alunos, orcamentos, lancamentos });
  const orcado = orcadoRealizado(ds, orcamentos, periodoAtual);
  const cenarios = cenariosLucro(ds).map((c) => ({ ...c, label: ymLabel(c.periodo) }));
  const mesAtualFin = mesFinanceiro(ds, periodoAtual);
  const metaFat = metas.find((m) => m.tipo === "faturamento" && m.periodo === periodoAtual) ?? null;
  const metaLucro = metas.find((m) => m.tipo === "lucro" && m.periodo === periodoAtual) ?? null;
  const NIVEL_TOM_SAUDE = { excelente: "verde", saudavel: "violeta", atencao: "ouro", critico: "vermelho" } as const;
  const NIVEL_TOM_INSIGHT = { positivo: "verde", atencao: "ouro", alerta: "vermelho", oportunidade: "azul" } as const;

  const despesasAno = ds.despesas.filter((d) => d.data.startsWith(`${ano}-`));
  const recentes = [...despesasAno].sort((a, b) => b.data.localeCompare(a.data)).slice(0, 15);
  const porCategoria = new Map<string, number>();
  for (const d of despesasAno) {
    porCategoria.set(d.categoria, (porCategoria.get(d.categoria) ?? 0) + d.valor);
  }
  const categoriasOrdenadas = [...porCategoria.entries()].sort((a, b) => b[1] - a[1]);
  const hoje = new Date().toISOString().slice(0, 10);
  const custoOperacionalAno = despesasAno.reduce((soma, despesa) => soma + despesa.valor, 0);
  const totalOrcado = orcado.reduce((soma, linha) => soma + linha.previsto, 0);
  const totalRealizado = orcado.reduce((soma, linha) => soma + linha.realizado, 0);
  const percentualOrcamento = totalOrcado > 0 ? Math.min(100, (totalRealizado / totalOrcado) * 100) : null;
  const indicadoresDestaque = [
    { rotulo: "Receita registrada", valor: fmtBRL(totAno.faturamento), detalhe: `Faturamento de ${ano}`, icone: TrendingUp, tom: "text-primaria-2 border-primaria-2/65 bg-primaria/10" },
    { rotulo: "Custos operacionais", valor: fmtBRL(totAno.custos), detalhe: `Custos de ${ano}`, icone: Wallet, tom: "text-cyan-200 border-cyan-300/65 bg-cyan-300/10" },
    { rotulo: "Resultado do ano", valor: fmtBRL(totAno.lucro), detalhe: totAno.lucro >= 0 ? "Resultado positivo" : "Resultado a recuperar", icone: CircleDollarSign, tom: totAno.lucro >= 0 ? "text-positivo border-positivo/65 bg-positivo/10" : "text-negativo border-negativo/65 bg-negativo/10" },
    { rotulo: "Margem", valor: fmtPct(margemAno), detalhe: `Sobre o faturamento de ${ano}`, icone: Target, tom: "text-ouro border-ouro/65 bg-ouro/10" },
  ];
  const programasDestaque = prods.slice(0, 3);
  const prioridades = insights.slice(0, 3);
  const leituraOperacao = saude.score === null || saude.nivel === null
    ? { valor: "Sem base", detalhe: "Registre movimentações para calcular a saúde da operação." }
    : { valor: `${saude.score}/100`, detalhe: `${NIVEL_SAUDE_LABEL[saude.nivel]}${saude.parcial ? " · leitura parcial" : ""}` };
  const proximaAcao = prioridades[0]?.texto ?? "Confira os dados completos para decidir o próximo movimento da operação.";

  return (
    <main data-financeiro-visual="referencia-aprovada" className="mx-auto max-w-[1320px] pb-10">
      <p className="sr-only">Visão financeira de apoio às jornadas de mentoria. Os dados detalhados e formulários continuam abaixo deste resumo.</p>

      <header className="mb-7 flex flex-wrap items-end justify-between gap-5">
        <div>
          <h1 className="font-display text-[clamp(30px,3vw,36px)] font-medium leading-none tracking-[-0.045em]">Sustentabilidade da operação</h1>
          <p className="mt-2 text-[15px] text-texto-2">Acompanhe o que mantém suas jornadas saudáveis — sem perder o foco nas pessoas.</p>
        </div>
        <nav aria-label="Ações financeiras" className="flex flex-wrap items-center justify-end gap-2">
          <a href="/analise" className="inline-flex min-h-12 items-center gap-2 rounded-lg border border-borda px-4 text-sm font-medium text-texto transition hover:border-primaria/60 hover:bg-painel-2"><TrendingUp size={18} aria-hidden /> Ver indicadores</a>
          <a href="/financeiro/caixa" className="inline-flex min-h-12 items-center gap-2 rounded-lg border border-borda px-4 text-sm font-medium text-texto transition hover:border-primaria/60 hover:bg-painel-2"><CalendarDays size={18} aria-hidden /> Fluxo de caixa</a>
          <a href="#registrar-despesa" className="inline-flex min-h-12 items-center gap-2 rounded-lg bg-primaria px-5 text-sm font-medium text-white shadow-[0_10px_22px_rgba(24,99,255,.25)] transition hover:bg-primaria-2"><Plus size={18} aria-hidden /> Registrar despesa</a>
        </nav>
      </header>

      <section aria-label="Indicadores da operação" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {indicadoresDestaque.map((indicador) => {
          const Icone = indicador.icone;
          return (
            <article key={indicador.rotulo} className="flex min-h-[116px] items-center gap-4 rounded-xl border border-borda bg-painel/70 px-5 py-4 shadow-[0_12px_30px_rgba(0,0,0,.12)]">
              <span className={cx("grid size-[64px] shrink-0 place-items-center rounded-full border", indicador.tom)}><Icone size={28} strokeWidth={1.55} aria-hidden /></span>
              <div className="min-w-0"><p className="text-sm text-texto-2">{indicador.rotulo}</p><p className="mt-0.5 text-[28px] font-semibold leading-none tracking-[-0.04em] tabular-nums text-texto">{indicador.valor}</p><p className="mt-1 text-[11px] text-texto-3">{indicador.detalhe}</p></div>
            </article>
          );
        })}
      </section>

      <section className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1.62fr)_minmax(320px,0.94fr)]">
        <article className="rounded-xl border border-borda bg-painel/70 p-5 shadow-[0_12px_30px_rgba(0,0,0,.12)]">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-[21px] font-semibold tracking-[-0.035em]">O que sustenta a jornada</h2><p className="mt-1 text-sm text-texto-2">Leitura direta dos recursos que mantêm os acompanhamentos acontecendo.</p></div><a href="#dados-financeiros-completos" className="inline-flex items-center gap-1.5 text-sm font-medium text-primaria-2 hover:text-primaria">Ver detalhes <ArrowRight size={16} aria-hidden /></a></div>
          <div className="mt-5 rounded-lg border border-borda bg-poco/60 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2"><span className="text-sm font-medium">Orçamento do mês</span><span className="text-sm tabular-nums text-texto-2">{percentualOrcamento === null ? "Sem orçamento definido" : `${fmtBRL(totalRealizado)} de ${fmtBRL(totalOrcado)}`}</span></div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-eleva" aria-label={percentualOrcamento === null ? "Sem orçamento definido" : `${Math.round(percentualOrcamento)}% do orçamento do mês utilizado`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percentualOrcamento === null ? undefined : Math.round(percentualOrcamento)}><span className={cx("block h-full rounded-full", percentualOrcamento !== null && totalRealizado > totalOrcado ? "bg-negativo" : "bg-gradient-to-r from-primaria-2 to-cyan-300")} style={{ width: `${percentualOrcamento ?? 0}%` }} /></div>
            <p className="mt-2 text-xs text-texto-3">{percentualOrcamento === null ? "Defina o orçamento por categoria nos dados completos abaixo." : `${Math.round(percentualOrcamento)}% do orçamento planejado para ${ymLabel(periodoAtual)}.`}</p>
          </div>
          <dl className="mt-4 divide-y divide-borda border-t border-borda">
            <div className="flex items-center justify-between gap-4 py-3"><dt className="flex items-center gap-2 text-sm text-texto-2"><ListChecks size={17} className="text-primaria-2" aria-hidden /> Programas e mentorias</dt><dd className="text-sm font-medium tabular-nums">{fmtBRL(totAno.faturamento)}</dd></div>
            <div className="flex items-center justify-between gap-4 py-3"><dt className="flex items-center gap-2 text-sm text-texto-2"><Target size={17} className="text-cyan-200" aria-hidden /> Equipe e parceiros</dt><dd className="text-sm font-medium tabular-nums">{fmtBRL(somaMes("comissoes"))}</dd></div>
            <div className="flex items-center justify-between gap-4 py-3"><dt className="flex items-center gap-2 text-sm text-texto-2"><Wallet size={17} className="text-ouro" aria-hidden /> Despesas operacionais</dt><dd className="text-sm font-medium tabular-nums">{fmtBRL(custoOperacionalAno)}</dd></div>
          </dl>
        </article>

        <aside className="grid content-start gap-3">
          <article className="rounded-xl border border-borda bg-painel/70 p-5 shadow-[0_12px_30px_rgba(0,0,0,.12)]"><div className="flex items-center gap-2"><span className="grid size-10 place-items-center rounded-full border border-ouro/65 bg-ouro/10 text-ouro"><CircleAlert size={20} aria-hidden /></span><h2 className="text-[21px] font-semibold tracking-[-0.035em]">Prioridades</h2></div>{prioridades.length ? <ul className="mt-4 space-y-3">{prioridades.map((prioridade, indice) => <li key={`${prioridade.nivel}-${indice}`} className="flex gap-3 border-t border-borda pt-3"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-primaria text-xs font-semibold text-white">{indice + 1}</span><span className="text-sm leading-relaxed text-texto-2">{prioridade.texto}</span></li>)}</ul> : <p className="mt-4 text-sm leading-relaxed text-texto-2">Nenhuma prioridade calculada com a base atual.</p>}</article>
        </aside>
      </section>

      <section className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.9fr)]">
        <article className="rounded-xl border border-borda bg-painel/70 p-5 shadow-[0_12px_30px_rgba(0,0,0,.12)]"><div className="flex items-center justify-between gap-3"><div><h2 className="text-[21px] font-semibold tracking-[-0.035em]">Visão por programa</h2><p className="mt-1 text-sm text-texto-2">Fontes de receita que apoiam as jornadas no período selecionado.</p></div><a href="#dados-financeiros-completos" className="text-sm font-medium text-primaria-2 hover:text-primaria">Ver todos</a></div>{programasDestaque.length ? <ul className="mt-5 divide-y divide-borda border-t border-borda">{programasDestaque.map((programa) => <li key={programa.produtoId} className="flex items-center justify-between gap-4 py-3"><span className="min-w-0"><span className="block truncate text-sm font-medium">{programa.nome}</span><span className="mt-1 block text-xs text-texto-3">{programa.qtd} venda{programa.qtd === 1 ? "" : "s"} · margem {fmtPct(programa.margemContribuicao)}</span></span><span className="shrink-0 text-sm font-medium tabular-nums">{fmtBRL(programa.receita)}</span></li>)}</ul> : <p className="mt-5 text-sm text-texto-2">Ainda não há receita por programa em {ano}.</p>}</article>
        <article className="rounded-xl border border-borda bg-painel/70 p-5 shadow-[0_12px_30px_rgba(0,0,0,.12)]"><div className="flex items-center gap-2"><span className="grid size-10 place-items-center rounded-full border border-positivo/65 bg-positivo/10 text-positivo"><TrendingUp size={20} aria-hidden /></span><h2 className="text-[21px] font-semibold tracking-[-0.035em]">Leitura de operação</h2></div><p className="mt-4 text-[28px] font-semibold leading-none tracking-[-0.04em] tabular-nums">{leituraOperacao.valor}</p><p className="mt-2 text-sm leading-relaxed text-texto-2">{leituraOperacao.detalhe}</p></article>
      </section>

      <section className="mt-3 rounded-xl border border-borda bg-painel/70 p-5 shadow-[0_12px_30px_rgba(0,0,0,.12)]"><div className="flex flex-wrap items-center gap-4"><span className="grid size-12 shrink-0 place-items-center rounded-full border border-primaria-2/65 bg-primaria/10 text-primaria-2"><Target size={23} aria-hidden /></span><div className="min-w-0 flex-1"><h2 className="text-[21px] font-semibold tracking-[-0.035em]">Próximo passo</h2><p className="mt-1 text-sm leading-relaxed text-texto-2">{proximaAcao}</p></div><a href="/analise" className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg border border-primaria-2/65 px-4 text-sm font-medium text-primaria-2 transition hover:border-primaria hover:bg-primaria/10">Abrir análise completa <ArrowRight size={16} aria-hidden /></a></div></section>

      <section id="dados-financeiros-completos" className="mt-9 scroll-mt-24">
      <PageHeader titulo="Visão financeira" sub="Acompanhe a sustentabilidade da operação sem perder o foco nas jornadas de mentoria.">
        <div className="flex gap-1">
          {anosDisponiveis.map((a) => (
            <Link
              key={a}
              href={`/financeiro?ano=${a}`}
              className={cx(
                "rounded-lg px-3 py-1.5 text-sm",
                a === ano ? "bg-primaria/15 font-medium text-primaria-2" : "text-texto-2 hover:bg-painel-2"
              )}
            >
              {a}
            </Link>
          ))}
        </div>
      </PageHeader>

      <div data-financeiro-workspace="true" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label={`Faturamento ${ano}`}
          valor={fmtBRL(totAno.faturamento)}
          deltaPct={null}
          formato="moeda"
          valorNumerico={totAno.faturamento}
          composicao={{
            formula: "soma",
            partes: [
              { rotulo: "Vendas pagas no ano", valor: fatPagas },
              { rotulo: "Vendas reembolsadas (o estorno entra nos custos)", valor: fatReembolsadas },
            ],
            nota: "Venda pendente não é receita: fica de fora dos dois lados da conta. Valor cheio da venda, antes da taxa do gateway.",
          }}
          origem={`dataset() → matrículas com data em ${ano} e status pago ou reembolsado, via mesFinanceiro (soma dos 12 meses)`}
        />
        <Stat
          label={`Custos ${ano}`}
          valor={fmtBRL(totAno.custos)}
          deltaPct={null}
          invertida
          formato="moeda"
          valorNumerico={totAno.custos}
          composicao={{
            formula: "soma",
            partes: [
              { rotulo: "Comissões de afiliados", valor: somaMes("comissoes") },
              { rotulo: "Despesas fixas", valor: somaMes("despesasFixas") },
              { rotulo: "Despesas variáveis", valor: somaMes("despesasVariaveis") },
              { rotulo: "Reembolsos devolvidos ao aluno", valor: somaMes("reembolsos") },
            ],
            nota: "A taxa do gateway não aparece aqui: ela já vem descontada da receita líquida, nunca é lançada como despesa.",
          }}
          origem={`dataset() → comissões, despesas e reembolsos com data em ${ano}, via mesFinanceiro (soma dos 12 meses)`}
        />
        <Stat
          label={`Lucro ${ano}`}
          valor={fmtBRL(totAno.lucro)}
          deltaPct={null}
          formato="moeda"
          valorNumerico={totAno.lucro}
          composicao={{
            formula: "subtracao",
            partes: [
              { rotulo: "Receita líquida das vendas (já sem a taxa do gateway)", valor: somaMes("liquido") },
              { rotulo: "Custo total do ano", valor: totAno.custos },
            ],
            nota: "O lucro parte da receita LÍQUIDA, não do faturamento bruto — por isso ele não é simplesmente faturamento menos custos.",
          }}
          origem={`dataset() → matrículas, comissões, despesas e reembolsos de ${ano}, via mesFinanceiro (soma dos 12 meses)`}
        />
        <Stat
          label={`Margem ${ano}`}
          valor={fmtPct(margemAno)}
          deltaPct={null}
          formato="percentual"
          valorNumerico={margemAno}
          composicao={{
            formula: "divisao",
            partes: [
              { rotulo: `Lucro de ${ano}`, valor: totAno.lucro, formato: "moeda" },
              { rotulo: `Faturamento bruto de ${ano}`, valor: totAno.faturamento, formato: "moeda" },
            ],
            nota: "A divisão é multiplicada por 100 para virar percentual. O denominador é o faturamento BRUTO: sobre a receita líquida a margem apareceria maior.",
          }}
          origem={`dataset() → lucro ÷ faturamento do ano ${ano}, via mesFinanceiro (soma dos 12 meses)`}
        />
      </div>

      {/* ---- Health score + insights ---- */}
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card titulo="Health score do negócio">
          {/* Sem fator com base não há nota: mostrar "0" ou "Crítico" aqui seria
              transformar falta de lançamento em diagnóstico de negócio doente. */}
          {saude.score === null || saude.nivel === null ? (
            <p className="mb-3 text-sm text-texto-2">Sem base para calcular o health score.</p>
          ) : (
            <div className="mb-3 flex flex-wrap items-baseline gap-3">
              <span className="font-display text-4xl font-bold tabular-nums">{saude.score}</span>
              <span className="text-sm text-texto-2">/ 100</span>
              <Badge tom={NIVEL_TOM_SAUDE[saude.nivel]}>{NIVEL_SAUDE_LABEL[saude.nivel]}</Badge>
              {saude.parcial && (
                <span className="text-[11px] text-texto-2">
                  parcial · {saude.fatores.filter((f) => f.temBase).length} de {saude.fatores.length} fatores
                  com base
                </span>
              )}
            </div>
          )}
          <ul className="space-y-2.5">
            {saude.fatores.map((f) => (
              <li key={f.nome}>
                <div className="mb-0.5 flex items-baseline justify-between text-xs">
                  <span>{f.nome}</span>
                  <span className="tabular-nums text-texto-2">
                    {f.pontos === null ? `sem base · peso ${f.max}` : `${f.pontos}/${f.max}`}
                  </span>
                </div>
                {f.pontos !== null && <ProgressBar pct={(f.pontos / f.max) * 100} />}
                <p className="mt-0.5 text-[11px] text-texto-2">{f.detalhe}</p>
              </li>
            ))}
          </ul>
        </Card>

        <Card titulo="Insights e alertas" className="lg:col-span-2">
          {insights.length ? (
            <ul className="space-y-2.5">
              {insights.map((i, idx) => (
                <li key={idx} className="flex items-start gap-2 text-sm">
                  <Badge tom={NIVEL_TOM_INSIGHT[i.nivel]}>{i.nivel}</Badge>
                  <span className="flex-1">{i.texto}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Vazio>Nenhum alerta no momento — números dentro do esperado.</Vazio>
          )}
        </Card>
      </div>

      {/* ---- Orçado × realizado + metas + cenários ---- */}
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card titulo={`Orçado × realizado — ${ymLabel(periodoAtual)}`} className="lg:col-span-2">
          {orcado.length ? (
            <>
              <GraficoOrcadoRealizado
                data={orcado.map((o) => ({ categoria: o.categoria, previsto: o.previsto, realizado: o.realizado }))}
              />
              <Tabela className="mt-2">
                <thead>
                  <tr>
                    <Th>Categoria</Th>
                    <Th num>Orçado</Th>
                    <Th num>Realizado</Th>
                    <Th num>%</Th>
                  </tr>
                </thead>
                <tbody>
                  {orcado.map((o) => (
                    <tr key={o.categoria}>
                      <Td>{o.categoria}</Td>
                      <Td num>{fmtBRL(o.previsto)}</Td>
                      <Td num className={o.estourou ? "text-negativo" : undefined}>{fmtBRL(o.realizado)}</Td>
                      <Td num>{o.pct !== null ? fmtPct(o.pct) : "—"}</Td>
                    </tr>
                  ))}
                </tbody>
              </Tabela>
            </>
          ) : (
            <Vazio>Defina os orçamentos do mês no formulário ao lado.</Vazio>
          )}
          <details className="painel-form mt-3 rounded-lg border border-borda">
            <summary className="px-3 py-2 text-sm font-medium text-primaria-2">Definir orçamento de categoria ＋</summary>
            <form action={salvarOrcamento} className="flex flex-wrap items-end gap-2 border-t border-borda p-3">
              <input type="hidden" name="periodo" value={periodoAtual} />
              <Campo label="Categoria" className="min-w-[180px]">
                <Select name="categoria">
                  {CATEGORIAS_DESPESA.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </Select>
              </Campo>
              <Campo label="Valor previsto (R$)">
                <Input name="valorPrevisto" type="number" step="0.01" min="0" required />
              </Campo>
              <Botao tipo="fantasma">Salvar</Botao>
            </form>
          </details>
        </Card>

        <div className="space-y-4">
          <Card titulo={`Metas do mês — ${ymLabel(periodoAtual)}`}>
            <div className="space-y-3">
              <div>
                <div className="mb-1 flex items-baseline justify-between text-sm">
                  <span className="text-texto-2">Faturamento</span>
                  <span className="tabular-nums">
                    {fmtBRL(mesAtualFin.faturamento)} {metaFat ? `/ ${fmtBRL(metaFat.alvo)}` : ""}
                  </span>
                </div>
                {metaFat ? (
                  <ProgressBar pct={metaFat.alvo ? (mesAtualFin.faturamento / metaFat.alvo) * 100 : 0} tom="ouro" />
                ) : (
                  <p className="text-xs text-texto-2">sem meta definida</p>
                )}
              </div>
              <div>
                <div className="mb-1 flex items-baseline justify-between text-sm">
                  <span className="text-texto-2">Lucro</span>
                  <span className="tabular-nums">
                    {fmtBRL(mesAtualFin.lucro)} {metaLucro ? `/ ${fmtBRL(metaLucro.alvo)}` : ""}
                  </span>
                </div>
                {metaLucro ? (
                  <ProgressBar pct={metaLucro.alvo ? (mesAtualFin.lucro / metaLucro.alvo) * 100 : 0} />
                ) : (
                  <p className="text-xs text-texto-2">sem meta definida</p>
                )}
              </div>
            </div>
            <form action={salvarMetaFinanceira} className="mt-3 flex flex-wrap items-end gap-2 border-t border-borda pt-3">
              <input type="hidden" name="periodo" value={periodoAtual} />
              <Campo label="Meta">
                <Select name="tipo">
                  <option value="faturamento">Faturamento</option>
                  <option value="lucro">Lucro</option>
                </Select>
              </Campo>
              <Campo label="Alvo (R$)" className="min-w-[120px] flex-1">
                <Input name="alvo" type="number" step="0.01" min="0" required />
              </Campo>
              <Botao tipo="fantasma">Salvar</Botao>
            </form>
          </Card>

          <Card titulo="Cenários de lucro — próximos 6 meses">
            <GraficoCenarios data={cenarios} />
            <p className="mt-1 text-xs text-texto-2">
              Base = média dos últimos 3 meses · otimista +20% · pessimista −20%.
            </p>
          </Card>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card titulo={`Comparativo de faturamento — ${anoAnterior} × ${ano}`} className="lg:col-span-2">
          <GraficoComparativoAnual data={comparativo} anoAnterior={anoAnterior} anoAtual={ano} />
        </Card>

        <Card titulo="Projeção do ano (linear)">
          {proj ? (
            <div className="space-y-3 text-sm">
              <div className="flex items-baseline justify-between">
                <span className="text-texto-2">Lucro acumulado</span>
                <span className="font-display text-lg font-semibold tabular-nums">{fmtBRL(proj.lucroAcumuladoAno)}</span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-texto-2">Média últimos 3 meses</span>
                <span className="tabular-nums">{fmtBRL(proj.mediaLucro3m)}/mês</span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-texto-2">Meses restantes</span>
                <span className="tabular-nums">{proj.mesesRestantes}</span>
              </div>
              <div className="border-t border-borda pt-3">
                <p className="text-xs uppercase tracking-wide text-texto-2">Lucro projetado {ano}</p>
                <p className={cx("font-display text-2xl font-semibold tabular-nums", proj.lucroProjetadoAno >= 0 ? "text-positivo" : "text-negativo")}>
                  {fmtBRL(proj.lucroProjetadoAno)}
                </p>
              </div>
              <p className="text-xs text-texto-2">
                Projeção simples: acumulado + média dos últimos 3 meses × meses restantes.
              </p>
            </div>
          ) : (
            <Vazio>Projeção disponível apenas para o ano corrente.</Vazio>
          )}
        </Card>
      </div>

      <Card titulo={`Margem por produto — ${ano}`} className="mt-4">
        {prods.length ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <GraficoMargemProduto data={prods.map((p) => ({ nome: p.nome, margem: p.margemContribuicao }))} />
            <Tabela>
              <thead>
                <tr>
                  <Th>Produto</Th>
                  <Th num>Vendas</Th>
                  <Th num>Receita</Th>
                  <Th num>Comissões</Th>
                  <Th num>Reembolsos</Th>
                </tr>
              </thead>
              <tbody>
                {prods.map((p) => (
                  <tr key={p.produtoId}>
                    <Td>{p.nome}</Td>
                    <Td num>{p.qtd}</Td>
                    <Td num>{fmtBRL(p.receita)}</Td>
                    <Td num>{fmtBRL(p.comissoes)}</Td>
                    <Td num>{fmtBRL(p.reembolsos)}</Td>
                  </tr>
                ))}
              </tbody>
            </Tabela>
          </div>
        ) : (
          <Vazio>Sem vendas em {ano}.</Vazio>
        )}
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div id="registrar-despesa" className="scroll-mt-24">
          <PainelForm titulo="Registrar nova despesa">
            <form action={criarDespesa} className="grid gap-3 sm:grid-cols-2">
              <Campo label="Data">
                <Input name="data" type="date" defaultValue={hoje} required />
              </Campo>
              <Campo label="Valor (R$)">
                <Input name="valor" type="number" step="0.01" min="0" required placeholder="0,00" />
              </Campo>
              <Campo label="Descrição" className="sm:col-span-2">
                <Input name="descricao" required placeholder="Ex.: Tráfego pago — campanha do lançamento" />
              </Campo>
              <Campo label="Categoria">
                <Select name="categoria" defaultValue="Tráfego pago">
                  {CATEGORIAS_DESPESA.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </Select>
              </Campo>
              <Campo label="Tipo">
                <Select name="tipo" defaultValue="variavel">
                  <option value="fixa">Fixa</option>
                  <option value="variavel">Variável</option>
                </Select>
              </Campo>
              <div className="sm:col-span-2">
                <Botao>Salvar despesa</Botao>
              </div>
            </form>
          </PainelForm>
          </div>

          <Card titulo={`Despesas recentes — ${ano}`}>
            {recentes.length ? (
              <Tabela>
                <thead>
                  <tr>
                    <Th>Data</Th>
                    <Th>Descrição</Th>
                    <Th>Categoria</Th>
                    <Th>Tipo</Th>
                    <Th num>Valor</Th>
                  </tr>
                </thead>
                <tbody>
                  {recentes.map((d) => (
                    <tr key={d.id}>
                      <Td>{fmtDate(d.data)}</Td>
                      <Td>{d.descricao}</Td>
                      <Td className="text-texto-2">{d.categoria}</Td>
                      <Td>
                        <Badge tom={d.tipo === "fixa" ? "cinza" : "ouro"}>{TIPO_DESPESA_LABEL[d.tipo]}</Badge>
                      </Td>
                      <Td num>{fmtBRLExato(d.valor)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Tabela>
            ) : (
              <Vazio>Nenhuma despesa registrada em {ano}.</Vazio>
            )}
          </Card>
        </div>

        <Card titulo={`Despesas por categoria — ${ano}`}>
          {categoriasOrdenadas.length ? (
            <ul className="space-y-2 text-sm">
              {categoriasOrdenadas.map(([cat, valor]) => (
                <li key={cat} className="flex items-baseline justify-between gap-2">
                  <span className="text-texto-2">{cat}</span>
                  <span className="tabular-nums">{fmtBRL(valor)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Vazio>Sem despesas no período.</Vazio>
          )}
        </Card>
      </div>

      <Card titulo={`Detalhe mensal — ${ano}`} className="mt-4">
        {comVenda.length ? (
          <Tabela>
            <thead>
              <tr>
                <Th>Mês</Th>
                <Th num>Faturamento</Th>
                <Th num>Líquido</Th>
                <Th num>Comissões</Th>
                <Th num>Desp. fixas</Th>
                <Th num>Desp. variáveis</Th>
                <Th num>Reembolsos</Th>
                <Th num>Lucro</Th>
                <Th num>Margem</Th>
              </tr>
            </thead>
            <tbody>
              {comVenda.map((m) => (
                <tr key={m.periodo}>
                  <Td>{ymLabel(m.periodo)}</Td>
                  <Td num>{fmtBRL(m.faturamento)}</Td>
                  <Td num>{fmtBRL(m.liquido)}</Td>
                  <Td num>{fmtBRL(m.comissoes)}</Td>
                  <Td num>{fmtBRL(m.despesasFixas)}</Td>
                  <Td num>{fmtBRL(m.despesasVariaveis)}</Td>
                  <Td num>{fmtBRL(m.reembolsos)}</Td>
                  <Td num className={m.lucro >= 0 ? "text-positivo" : "text-negativo"}>
                    {fmtBRL(m.lucro)}
                  </Td>
                  <Td num>{fmtPct(m.margem)}</Td>
                </tr>
              ))}
            </tbody>
          </Tabela>
        ) : (
          <Vazio>Sem movimentação em {ano}.</Vazio>
        )}
      </Card>
      </section>
    </main>
  );
}
