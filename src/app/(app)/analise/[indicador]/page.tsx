import Link from "next/link";
import { notFound } from "next/navigation";
import { GraficoBarrasH, GraficoBarrasSerie, GraficoDonut, GraficoWaterfall } from "@/components/charts";
import { Badge, Card, PageHeader, Stat, Tabela, Td, Th, Vazio } from "@/components/ui";
import type { Composicao, FormatoValor } from "@/lib/composicao";
import { getDB } from "@/lib/data";
import { INDICADORES } from "@/lib/domain";
import { fmtBRL, fmtBRLExato, fmtNum, fmtPct, ymLabel } from "@/lib/format";
import { gerarInsights } from "@/lib/insights";
import { analiseIndicador, mesFinanceiro, type MesFinanceiro, type SlugIndicador } from "@/lib/metrics";

export const dynamic = "force-dynamic";

const SLUGS: SlugIndicador[] = ["faturamento", "custos", "comissoes", "margem", "lucro"];

export default async function AnalisePage({ params }: { params: { indicador: string } }) {
  const slug = params.indicador as SlugIndicador;
  if (!SLUGS.includes(slug)) notFound();
  const meta = INDICADORES[slug];

  const db = getDB();
  const [ds, produtos, afiliados, alunos, orcamentos, lancamentos] = await Promise.all([
    db.dataset(),
    db.listProdutos(),
    db.listAfiliados(),
    db.listAlunos(),
    db.listOrcamentos(),
    db.listLancamentos(),
  ]);

  const a = analiseIndicador(ds, produtos, afiliados, slug);
  const fmtValor = (v: number) => (a.ehPct ? fmtPct(v) : fmtBRL(v));
  const serie = a.serie.map((p) => ({ label: ymLabel(p.periodo), valor: p.valor }));
  const insights = gerarInsights({ ds, alunos, orcamentos, lancamentos }).filter(
    (i) => i.indicadores.includes(slug) || i.indicadores.includes("geral")
  );

  const NIVEL_TOM = { positivo: "verde", atencao: "ouro", alerta: "vermelho", oportunidade: "azul" } as const;

  // ---- memória de cálculo dos KPIs (skills `dashboard-mc` e `diagnostico-comercial`) ----
  // `analiseIndicador` devolve só o VALOR do indicador; para abrir a conta é
  // preciso o mês financeiro inteiro. `mesFinanceiro` é exatamente a função que
  // a própria análise usa por dentro (via `serieMensal`), então os números batem
  // por construção: a página não recalcula nada, só volta à mesma fonte.
  const periodoAtual = a.serie[a.serie.length - 1]?.periodo ?? "";
  const periodoAnterior = a.serie[a.serie.length - 2]?.periodo ?? null;
  const periodoAnoPassado = periodoAtual
    ? `${Number(periodoAtual.slice(0, 4)) - 1}-${periodoAtual.slice(5, 7)}`
    : "";
  const mesAtual = mesFinanceiro(ds, periodoAtual);
  const mesAnoPassado = mesFinanceiro(ds, periodoAnoPassado);
  const mesRotulo = ymLabel(periodoAtual);

  /** Mesmo campo que o `CAMPO_INDICADOR` de `analiseIndicador` lê para cada slug. */
  const valorDoIndicador = (m: MesFinanceiro): number =>
    slug === "faturamento"
      ? m.faturamento
      : slug === "custos"
        ? m.custoTotal
        : slug === "comissoes"
          ? m.comissoes
          : slug === "margem"
            ? m.margem
            : m.lucro;

  const valorAnterior = a.serie[a.serie.length - 2]?.valor ?? null;
  const valorAnoPassado = valorDoIndicador(mesAnoPassado);

  const formatoKpi: FormatoValor = a.ehPct ? "percentual" : "moeda";
  // no cartão o dinheiro aparece abreviado; na memória de cálculo, ao centavo
  const fmtExato = (v: number) => (a.ehPct ? fmtPct(v) : fmtBRLExato(v));
  // taxa do gateway = o que foi faturado menos o que virou receita líquida
  const taxasGateway = +(mesAtual.faturamento - mesAtual.liquido).toFixed(2);
  // custo e comissão são linhas onde SUBIR é ruim: nelas a queda é que fica verde
  const menorEhMelhor = slug === "custos" || slug === "comissoes";
  // variação entre dois percentuais é relativa, não diferença em pontos
  const ressalvaPct = a.ehPct
    ? " Variação RELATIVA entre dois percentuais — não é a diferença em pontos percentuais."
    : "";

  const composicaoDoMes: Composicao =
    slug === "faturamento"
      ? {
          // mesFinanceiro: faturamento = soma de `valor`; liquido = soma de
          // `valorLiquido` das MESMAS matrículas não pendentes do mês.
          formula: "soma",
          partes: [
            { rotulo: "Receita líquida das vendas (já sem a taxa do gateway)", valor: mesAtual.liquido },
            { rotulo: "Taxa do gateway retida na venda", valor: taxasGateway },
          ],
          nota: `Venda pendente não é faturamento: entram só matrículas pagas ou reembolsadas com data em ${mesRotulo}. São ${fmtNum(mesAtual.qtdVendas)} venda(s) com ticket médio de ${fmtBRLExato(mesAtual.ticketMedio)}. A matrícula reembolsada continua no bruto e o estorno aparece como custo — os dois lados ficam visíveis.`,
        }
      : slug === "custos"
        ? {
            // mesFinanceiro: custoTotal = comissoes + fixas + variáveis + reembolsos
            formula: "soma",
            partes: [
              { rotulo: "Comissões da rede", valor: mesAtual.comissoes },
              { rotulo: "Despesas fixas", valor: mesAtual.despesasFixas },
              { rotulo: "Despesas variáveis", valor: mesAtual.despesasVariaveis },
              { rotulo: "Reembolsos", valor: mesAtual.reembolsos },
            ],
            nota: `Custo lançado com data em ${mesRotulo}, em competência. NÃO inclui a taxa do gateway (ela já sai antes, na receita líquida) nem imposto provisionado — esses dois aparecem no DRE gerencial, em /financeiro/dre.`,
          }
        : slug === "comissoes"
          ? // uma soma de lançamentos de mesma natureza não vira conta de 2+ partes
            // honesta aqui: o rateio por afiliado que a tela mostra é do ANO, não
            // deste mês. Então a composição declara a origem, sem forjar fórmula.
            `${fmtBRLExato(mesAtual.comissoes)} = soma de todas as comissões de afiliado lançadas com data em ${mesRotulo}, sem exceção. A abertura por afiliado logo abaixo é do ANO inteiro, não deste mês — por isso as duas somas não fecham entre si.`
          : slug === "margem"
            ? {
                // mesFinanceiro: margem = lucro ÷ faturamento × 100
                formula: "divisao",
                partes: [
                  { rotulo: `Resultado líquido de ${mesRotulo}`, valor: mesAtual.lucro, formato: "moeda" },
                  { rotulo: `Faturamento bruto de ${mesRotulo}`, valor: mesAtual.faturamento, formato: "moeda" },
                ],
                nota: "A razão é multiplicada por 100 para virar percentual. O denominador é o faturamento BRUTO, não a receita líquida: a taxa do gateway está dentro dele, e é por isso que esta margem fica abaixo da margem sobre o líquido.",
              }
            : {
                // mesFinanceiro: lucro = liquido − custoTotal, e
                // custoTotal = comissoes + fixas + variáveis + reembolsos
                formula: "subtracao",
                partes: [
                  { rotulo: "Receita líquida das vendas (já sem a taxa do gateway)", valor: mesAtual.liquido },
                  { rotulo: "Comissões da rede", valor: mesAtual.comissoes },
                  { rotulo: "Despesas fixas", valor: mesAtual.despesasFixas },
                  { rotulo: "Despesas variáveis", valor: mesAtual.despesasVariaveis },
                  { rotulo: "Reembolsos", valor: mesAtual.reembolsos },
                ],
                nota: `Competência: conta o que foi faturado em ${mesRotulo}, não o que caiu na conta. A taxa do gateway já foi descontada na primeira linha. Imposto provisionado não entra aqui — para o resultado com imposto, veja o DRE gerencial em /financeiro/dre.`,
              };

  const origemDoMes = `dataset() → matrículas, comissões, despesas e reembolsos com data em ${mesRotulo}, via analiseIndicador → mesFinanceiro · base completa: esta tela não aplica a lente global de braço nem o filtro global de período`;

  const composicaoMoM: Composicao =
    a.deltaMoM === null || valorAnterior === null || periodoAnterior === null
      ? `Sem base de comparação: ${meta.titulo.toLowerCase()} fechou em zero no mês anterior, e não existe variação percentual sobre base zero.`
      : `${fmtPct(a.deltaMoM)} = (${fmtExato(a.atual)} em ${mesRotulo} − ${fmtExato(valorAnterior)} em ${ymLabel(periodoAnterior)}) ÷ ${fmtExato(Math.abs(valorAnterior))} × 100.${ressalvaPct}`;

  const composicaoYoY: Composicao =
    a.deltaYoY === null
      ? `Sem base de comparação: ${meta.titulo.toLowerCase()} fechou em zero em ${ymLabel(periodoAnoPassado)}, e não existe variação percentual sobre base zero.`
      : `${fmtPct(a.deltaYoY)} = (${fmtExato(a.atual)} em ${mesRotulo} − ${fmtExato(valorAnoPassado)} em ${ymLabel(periodoAnoPassado)}) ÷ ${fmtExato(Math.abs(valorAnoPassado))} × 100.${ressalvaPct}`;

  return (
    <>
      <p className="mb-2 text-xs text-texto-2">
        <Link href="/painel" className="hover:text-primaria-2">← Dashboard</Link>
      </p>
      <PageHeader titulo={`Análise — ${meta.titulo}`} sub={meta.descricao} />

      <div className="grid grid-cols-3 gap-3">
        {/* O delta já exibido é o mês contra o mês anterior — então a referência
            do cartão é o mesmo mês anterior, para pílula e comparação contarem
            a mesma história. */}
        <Stat
          label="Mês atual"
          valor={fmtValor(a.atual)}
          deltaPct={a.deltaMoM}
          invertida={menorEhMelhor}
          formato={formatoKpi}
          valorNumerico={a.atual}
          referencia={valorAnterior}
          labelReferencia={periodoAnterior ? ymLabel(periodoAnterior) : undefined}
          composicao={composicaoDoMes}
          origem={origemDoMes}
        />
        {/* Os dois cartões de variação já SÃO a conta: não têm delta próprio nem
            base de comparação — o que cabe é abrir a divisão que os produziu. */}
        <Stat
          label="vs mês anterior"
          valor={a.deltaMoM !== null ? fmtPct(a.deltaMoM) : "—"}
          deltaPct={null}
          hint=""
          formato="percentual"
          valorNumerico={a.deltaMoM ?? undefined}
          composicao={composicaoMoM}
          origem={`analiseIndicador → deltaPctOuNull sobre a série mensal de 12 meses (src/lib/metrics.ts) · ${mesRotulo} contra ${periodoAnterior ? ymLabel(periodoAnterior) : "o mês anterior"}`}
        />
        <Stat
          label="vs mesmo mês do ano passado"
          valor={a.deltaYoY !== null ? fmtPct(a.deltaYoY) : "—"}
          deltaPct={null}
          hint=""
          formato="percentual"
          valorNumerico={a.deltaYoY ?? undefined}
          composicao={composicaoYoY}
          origem={`analiseIndicador → deltaPctOuNull sobre a série mensal de 12 meses (src/lib/metrics.ts) · ${mesRotulo} contra ${ymLabel(periodoAnoPassado)}`}
        />
      </div>

      {insights.length > 0 && (
        <Card titulo="Leituras para estratégia" className="mt-4">
          <ul className="space-y-2">
            {insights.map((i, idx) => (
              <li key={idx} className="flex items-start gap-2 text-sm">
                <Badge tom={NIVEL_TOM[i.nivel]}>{i.nivel}</Badge>
                <span className="flex-1">{i.texto}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card titulo={`${meta.titulo} — últimos 12 meses`} className="mt-4">
        <GraficoBarrasSerie data={serie} ehPct={a.ehPct} />
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {a.waterfall && (
          <Card titulo="Composição do mês (cascata)">
            <GraficoWaterfall steps={a.waterfall} />
            <p className="mt-2 text-xs text-texto-2">
              Azul = totais · verde = entradas · magenta = o que consome o resultado.
            </p>
          </Card>
        )}
        {a.donut && a.donut.length > 0 && (
          <Card titulo="Composição por produto (ano)">
            <GraficoDonut data={a.donut} />
          </Card>
        )}
        {a.barras && a.barras.length > 0 && (
          <Card titulo={a.tituloBarras}>
            <GraficoBarrasH data={a.barras} formato={a.barrasEhPct ? "pct" : "brl"} />
          </Card>
        )}
      </div>

      <Card titulo="Tabela — mês a mês" className="mt-4">
        {serie.some((s) => s.valor !== 0) ? (
          <Tabela>
            <thead>
              <tr>
                <Th>Mês</Th>
                <Th num>{meta.titulo}</Th>
              </tr>
            </thead>
            <tbody>
              {serie.map((s) => (
                <tr key={s.label}>
                  <Td>{s.label}</Td>
                  <Td num>{fmtValor(s.valor)}</Td>
                </tr>
              ))}
            </tbody>
          </Tabela>
        ) : (
          <Vazio>Sem dados no período.</Vazio>
        )}
      </Card>
    </>
  );
}
