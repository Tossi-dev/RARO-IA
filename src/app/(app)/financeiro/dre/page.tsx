// /financeiro/dre — DRE gerencial, margem de contribuição e ponto de equilíbrio
// (SPEC-P1 B.2.3 e B.2.8).
// Pergunta: "a operação deu lucro no mês, mesmo que o dinheiro não tenha caído?"
// REGIME DE COMPETÊNCIA. Nenhum número desta tela é saldo bancário.

import Link from "next/link";
import { GraficoBarrasSerie, GraficoGaugeMeta, GraficoSerieMensal, GraficoWaterfall } from "@/components/charts";
import { Alerta, NotaRegra, SeloRegime, Sinal } from "@/components/fin-ui";
import { Badge, Card, PageHeader, Stat, Tabela, Td, Th, Vazio, cx } from "@/components/ui";
import { getDB } from "@/lib/data";
import { fmtBRL, fmtBRLExato, fmtNum, fmtPct, ymLabel } from "@/lib/format";
import {
  breakEvenUnidades,
  dreGerencial,
  linhasDre,
  margemDeContribuicao,
  pontoDeEquilibrio,
  serieDre,
  waterfallBrutoParaLucro,
} from "@/lib/metrics";
import { contextoCaixa, mesesDisponiveis } from "../filtro";

export const dynamic = "force-dynamic";

/** Mês anterior a um período yyyy-mm (base da análise horizontal). */
function mesAnterior(periodo: string): string {
  const [a, m] = periodo.split("-").map(Number);
  const d = new Date(a, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default async function DRE({ searchParams }: { searchParams: { mes?: string } }) {
  const db = getDB();
  const [ds, dc, produtos] = await Promise.all([db.dataset(), db.datasetCaixa(), db.listProdutos()]);
  const ctx = contextoCaixa(ds.matriculas, produtos);

  const meses = mesesDisponiveis([...ds.matriculas, ...ds.despesas].map((x) => x.data), ctx.ref);
  const periodo = searchParams.mes && meses.includes(searchParams.mes) ? searchParams.mes : meses[0];

  const dre = dreGerencial(ds, dc, periodo);
  const anterior = dreGerencial(ds, dc, mesAnterior(periodo));
  const linhas = linhasDre(dre, anterior);
  const cascata = waterfallBrutoParaLucro(dre);
  const serie = serieDre(ds, dc, 12, ctx.ref);
  const mc = margemDeContribuicao(ds, dc, periodo, produtos);
  const pe = pontoDeEquilibrio(ds, dc, periodo);
  const be = breakEvenUnidades(mc, pe.custosFixos, produtos, ds);

  // `mesFinanceiro`, dentro de `dreGerencial` (src/lib/metrics.ts), soma o valor das
  // matrículas cujo status NÃO é "pendente" no mês de competência: a receita bruta é
  // a soma das vendas pagas com as reembolsadas — o estorno volta depois, em deduções.
  const vendasDoMes = ds.matriculas.filter(
    (m) => m.data.slice(0, 7) === periodo && m.statusPagamento !== "pendente"
  );
  const somaValor = (lista: typeof vendasDoMes) => lista.reduce((s, m) => s + m.valor, 0);
  const brutoPagas = somaValor(vendasDoMes.filter((m) => m.statusPagamento === "pago"));
  const brutoReembolsadas = somaValor(vendasDoMes.filter((m) => m.statusPagamento === "reembolsado"));
  const rotuloMesAnterior = ymLabel(mesAnterior(periodo));

  const deltaLucro =
    anterior.lucroOperacional !== 0
      ? +(((dre.lucroOperacional - anterior.lucroOperacional) / Math.abs(anterior.lucroOperacional)) * 100).toFixed(2)
      : null;

  return (
    <div className="space-y-5">
      <PageHeader titulo="DRE gerencial" sub={`Competência · ${ymLabel(periodo)} · consolidado`}>
        <div className="flex flex-wrap gap-1">
          {meses.slice(0, 8).map((m) => (
            <Link
              key={m}
              href={`/financeiro/dre?mes=${m}`}
              className={cx(
                "rounded-lg border px-2.5 py-1 text-xs transition-colors",
                m === periodo
                  ? "border-primaria/40 bg-primaria/15 font-medium text-primaria-2"
                  : "border-borda text-texto-2 hover:bg-eleva hover:text-texto"
              )}
            >
              {ymLabel(m)}
            </Link>
          ))}
        </div>
      </PageHeader>
      <SeloRegime regime="competencia" />

      {dre.lucroOperacional < 0 ? (
        <Alerta tom="critico" titulo={`${ymLabel(periodo)} fechou no prejuízo operacional`}>
          Lucro operacional de {fmtBRLExato(dre.lucroOperacional)}. Faltaram{" "}
          {fmtBRL(Math.abs(pe.folga))} de faturamento para chegar ao ponto de equilíbrio de{" "}
          {fmtBRL(pe.faturamentoEquilibrio)}.
        </Alerta>
      ) : !pe.atingido ? (
        <Alerta tom="atencao" titulo="Mês ainda não cruzou o ponto de equilíbrio">
          Faltam {fmtBRL(Math.abs(pe.folga))} de faturamento — cerca de{" "}
          {Math.max(0, pe.vendasNecessarias - Math.round(pe.faturamentoAtual / (pe.ticketMedio || 1)))} venda(s) no
          ticket médio de {fmtBRL(pe.ticketMedio)}.
        </Alerta>
      ) : (
        <Alerta tom="ok" titulo={`Ponto de equilíbrio superado em ${fmtBRL(pe.folga)}`}>
          Cada real vendido acima disso entra com {fmtPct(pe.mcPct)} de margem de contribuição.
        </Alerta>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Stat
          label="Receita bruta"
          valor={fmtBRL(dre.receitaBruta)}
          hint="faturado no mês (não recebido)"
          formato="moeda"
          valorNumerico={dre.receitaBruta}
          referencia={anterior.receitaBruta}
          labelReferencia={rotuloMesAnterior}
          composicao={{
            formula: "soma",
            partes: [
              { rotulo: "Vendas pagas no mês", valor: brutoPagas },
              { rotulo: "Vendas reembolsadas (o estorno volta em deduções)", valor: brutoReembolsadas },
            ],
            nota: "Competência: é o que foi faturado no mês, não o que caiu na conta. Venda pendente não conta como receita. Valor cheio, antes da taxa do gateway.",
          }}
          origem={`dataset() → matrículas com data em ${ymLabel(periodo)} e status pago ou reembolsado, via mesFinanceiro dentro de dreGerencial · consolidado, sem filtro de fonte`}
        />
        {/* Composição extraída de `dreGerencial` (src/lib/metrics.ts):
            receitaLiquida = faturamento − deducoes − impostos, onde
            deducoes = reembolsos do mês + chargebacks com status "perdido" e
            impostos = faturamento × aliquotaImposto ÷ 100. */}
        <Stat
          label="Receita líquida"
          valor={fmtBRL(dre.receitaLiquida)}
          hint="após deduções e impostos"
          formato="moeda"
          valorNumerico={dre.receitaLiquida}
          composicao={{
            formula: "subtracao",
            partes: [
              { rotulo: "Receita bruta faturada no mês", valor: dre.receitaBruta },
              { rotulo: "Deduções: reembolsos + chargebacks perdidos", valor: dre.deducoes },
              {
                rotulo: `Impostos provisionados (${fmtPct(dc.parametros.aliquotaImposto)} sobre o faturamento)`,
                valor: dre.impostos,
              },
            ],
            nota: "Regime de competência: é o que foi faturado no mês, não o que caiu na conta. Chargeback ganho não custa nada — só o perdido vira dedução. DRE consolidado: não há rateio por fonte nesta tela.",
          }}
          origem={`dataset() (matrículas e reembolsos de ${ymLabel(periodo)}) + datasetCaixa() (chargebacks perdidos e alíquota de imposto), via dreGerencial · mês de competência ${periodo} · consolidado, sem filtro de fonte`}
        />
        {/* Composição extraída de `dreGerencial` (src/lib/metrics.ts):
            margemContribuicao = receitaLiquida − custosVariaveis, com
            custosVariaveis = taxasGateway + comissoes + despesasVariaveis. */}
        <Stat
          label="Margem de contribuição"
          valor={fmtBRL(dre.margemContribuicao)}
          hint={`${fmtPct(dre.margemContribuicaoPct)} da receita bruta`}
          formato="moeda"
          valorNumerico={dre.margemContribuicao}
          referencia={anterior.margemContribuicao}
          labelReferencia={rotuloMesAnterior}
          composicao={{
            formula: "subtracao",
            partes: [
              { rotulo: "Receita líquida (após deduções e impostos)", valor: dre.receitaLiquida },
              { rotulo: "Taxas do gateway de pagamento", valor: dre.taxasGateway },
              { rotulo: "Comissões de afiliados", valor: dre.comissoes },
              { rotulo: "Despesas variáveis (tráfego, ferramentas por venda)", valor: dre.despesasVariaveis },
            ],
            nota: "É o que sobra de cada venda para pagar o custo fixo. Só entra aqui o custo que só existe porque a venda existiu — despesa fixa fica de fora, por definição.",
          }}
          origem={`dataset() + datasetCaixa() de ${ymLabel(periodo)}, via dreGerencial · consolidado, sem filtro de fonte`}
        />
        {/* lucroOperacional = margemContribuicao − custosFixos, onde custosFixos
            são as despesas lançadas como "fixa" no mês (mesFinanceiro). */}
        <Stat
          label="Lucro operacional"
          valor={fmtBRLExato(dre.lucroOperacional)}
          deltaPct={deltaLucro}
          hint="vs mês anterior"
          destaque
          formato="moeda"
          valorNumerico={dre.lucroOperacional}
          referencia={anterior.lucroOperacional}
          labelReferencia={rotuloMesAnterior}
          composicao={{
            formula: "subtracao",
            partes: [
              { rotulo: "Margem de contribuição do mês", valor: dre.margemContribuicao },
              { rotulo: "Despesas fixas do mês", valor: dre.custosFixos },
            ],
            nota: "Competência, não caixa: o lucro do mês pode existir com a conta bancária vazia se o dinheiro ainda não caiu. DRE consolidado: não há rateio de despesa fixa por fonte.",
          }}
          origem={`dataset() + datasetCaixa() de ${ymLabel(periodo)}, via dreGerencial · consolidado, sem filtro de fonte`}
        />
        <Stat
          label="Margem líquida"
          valor={fmtPct(dre.margemLiquidaPct)}
          hint="lucro ÷ receita bruta"
          formato="percentual"
          valorNumerico={dre.margemLiquidaPct}
          referencia={anterior.margemLiquidaPct}
          labelReferencia={rotuloMesAnterior}
          composicao={{
            formula: "divisao",
            partes: [
              { rotulo: "Lucro operacional do mês", valor: dre.lucroOperacional, formato: "moeda" },
              { rotulo: "Receita bruta do mês", valor: dre.receitaBruta, formato: "moeda" },
            ],
            nota: "A divisão é multiplicada por 100 para virar percentual. A comparação com o mês anterior é relativa (variação do percentual), não em pontos percentuais.",
          }}
          origem={`dataset() + datasetCaixa() de ${ymLabel(periodo)}, via dreGerencial · consolidado, sem filtro de fonte`}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_1fr]">
        <Card titulo={`Demonstrativo — ${ymLabel(periodo)}`}>
          <Tabela>
            <thead>
              <tr>
                <Th>Linha</Th>
                <Th num>Valor</Th>
                <Th num>AV %</Th>
                <Th num>AH %</Th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.rotulo} className={cx(l.destaque && "bg-eleva/40 font-medium")}>
                  <Td className={cx(l.reducao && "pl-6 text-texto-2")}>{l.rotulo}</Td>
                  <Td num className={cx(l.reducao && "text-negativo")}>
                    {l.reducao ? `(${fmtBRLExato(l.valor)})` : fmtBRLExato(l.valor)}
                  </Td>
                  <Td num className="text-texto-2">
                    {fmtPct(l.av)}
                  </Td>
                  <Td num>
                    {l.ah === null ? (
                      <span className="text-texto-3">—</span>
                    ) : (
                      <Sinal valor={l.ah} texto={fmtPct(l.ah)} invertido={l.reducao} />
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Tabela>
          <NotaRegra>
            AV = peso da linha sobre a receita bruta. AH = variação contra {ymLabel(mesAnterior(periodo))}. Em
            linhas de custo, cair é bom — por isso a cor inverte.
          </NotaRegra>
        </Card>

        <div className="space-y-4">
          <Card titulo="Do bruto ao lucro">
            <GraficoWaterfall steps={cascata} />
          </Card>
          <Card titulo="Ponto de equilíbrio do mês">
            <GraficoGaugeMeta valor={pe.faturamentoAtual} meta={pe.faturamentoEquilibrio} altura={160} />
            <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
              <p className="text-texto-2">
                Custo fixo
                <span className="ml-2 tabular-nums text-texto">{fmtBRL(pe.custosFixos)}</span>
              </p>
              <p className="text-texto-2">
                MC
                <span className="ml-2 tabular-nums text-texto">{fmtPct(pe.mcPct)}</span>
              </p>
              <p className="text-texto-2">
                Equilíbrio
                <span className="ml-2 tabular-nums text-texto">{fmtBRL(pe.faturamentoEquilibrio)}</span>
              </p>
              <p className="text-texto-2">
                Vendas p/ virar
                <span className="ml-2 tabular-nums text-texto">{fmtNum(pe.vendasNecessarias)}</span>
              </p>
            </div>
            <NotaRegra>Custo fixo ÷ margem de contribuição %. Abaixo disso, vender só aumenta o prejuízo.</NotaRegra>
          </Card>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card titulo="Receita bruta × lucro operacional — 12 meses">
          <GraficoSerieMensal
            data={serie.map((d) => ({
              label: ymLabel(d.periodo),
              faturamento: d.receitaBruta,
              lucro: d.lucroOperacional,
            }))}
          />
        </Card>
        <Card titulo="Margem de contribuição % — 12 meses">
          <GraficoBarrasSerie
            data={serie.map((d) => ({ label: ymLabel(d.periodo), valor: d.margemContribuicaoPct }))}
            ehPct
          />
          <NotaRegra>
            MC% caindo com receita subindo é sinal de custo variável fora de controle (tráfego,
            comissão, taxa) — não de mês fraco.
          </NotaRegra>
        </Card>
      </div>

      <Card titulo="Margem de contribuição e break-even por produto">
        {be.length ? (
          <Tabela>
            <thead>
              <tr>
                <Th>Produto</Th>
                <Th num>Preço base</Th>
                <Th num>MC %</Th>
                <Th num>MC por venda</Th>
                <Th num>Vendas p/ pagar o fixo</Th>
                <Th num>Vendidas no mês</Th>
                <Th>Situação</Th>
              </tr>
            </thead>
            <tbody>
              {be.map((p) => {
                const cobre = p.unidadesVendidas >= p.unidadesNecessarias;
                return (
                  <tr key={p.produtoId}>
                    <Td>{p.nome}</Td>
                    <Td num>{fmtBRL(p.preco)}</Td>
                    <Td num>{fmtPct(p.mcPct)}</Td>
                    <Td num>{fmtBRLExato(p.mcUnitaria)}</Td>
                    <Td num>{fmtNum(p.unidadesNecessarias)}</Td>
                    <Td num>{fmtNum(p.unidadesVendidas)}</Td>
                    <Td>
                      <Badge tom={cobre ? "verde" : "cinza"}>
                        {cobre ? "Paga o fixo sozinho" : `Faltam ${p.unidadesNecessarias - p.unidadesVendidas}`}
                      </Badge>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Tabela>
        ) : (
          <Vazio>Sem venda no mês para calcular margem por produto.</Vazio>
        )}
        <NotaRegra>
          Cenário puro por produto: quantas vendas de cada oferta cobririam SOZINHAS o custo fixo de{" "}
          {fmtBRL(pe.custosFixos)}. O mix real está no ponto de equilíbrio em R$.
        </NotaRegra>
      </Card>

      <Card titulo="Rateio dos custos variáveis por produto">
        <Tabela>
          <thead>
            <tr>
              <Th>Produto</Th>
              <Th num>Receita</Th>
              <Th num>Custos variáveis</Th>
              <Th num>Margem de contribuição</Th>
              <Th num>MC %</Th>
            </tr>
          </thead>
          <tbody>
            {mc.porProduto.map((p) => (
              <tr key={p.produtoId}>
                <Td>{p.nome}</Td>
                <Td num>{fmtBRL(p.receita)}</Td>
                <Td num className="text-negativo">
                  ({fmtBRL(p.custosVariaveis)})
                </Td>
                <Td num>{fmtBRLExato(p.valor)}</Td>
                <Td num>{fmtPct(p.pct)}</Td>
              </tr>
            ))}
          </tbody>
        </Tabela>
        <NotaRegra>
          O rateio usa a participação do produto na receita do mês. Custos variáveis aqui incluem
          impostos e deduções, porque também sobem junto com o volume vendido.
        </NotaRegra>
      </Card>
    </div>
  );
}
