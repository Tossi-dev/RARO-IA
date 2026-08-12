// /financeiro/caixa — Fluxo de caixa direto (SPEC-P1 B.2.1).
// Pergunta: "sobrou ou faltou dinheiro no período, e por causa de quê?"
// REGIME DE CAIXA. Nada aqui é faturamento: é extrato.

import { GraficoOrcadoRealizado, GraficoProjecaoSaldo, GraficoWaterfall } from "@/components/charts";
import { Alerta, NotaRegra, SeloRegime, Sinal } from "@/components/fin-ui";
import { Badge, Card, PageHeader, Stat, Tabela, Td, Th, Vazio } from "@/components/ui";
import type { Composicao } from "@/lib/composicao";
import { getDB } from "@/lib/data";
import { fmtBRL, fmtBRLExato, fmtDate, fmtPct } from "@/lib/format";
import {
  burnRateMensal,
  fluxoDeCaixaDireto,
  fluxoPrevistoRealizado,
  runwayMeses,
  serieSaldoCaixa,
  waterfallPonteDeCaixa,
} from "@/lib/metrics";
import { contextoCaixa } from "../filtro";

export const dynamic = "force-dynamic";

export default async function FluxoDeCaixa() {
  const db = getDB();
  const [dc, ds, produtos] = await Promise.all([db.datasetCaixa(), db.dataset(), db.listProdutos()]);
  const ctx = contextoCaixa(ds.matriculas, produtos);

  const fx = fluxoDeCaixaDireto(dc, ctx.periodo);
  const ponte = waterfallPonteDeCaixa(fx);
  const serie = serieSaldoCaixa(dc, ctx.rangeDias, ctx.ref, ctx.lente);
  const pvr = fluxoPrevistoRealizado(dc, ctx.periodo);
  const burn = burnRateMensal(dc, 3, ctx.ref, ctx.lente);
  const runway = runwayMeses(dc, 3, ctx.ref, ctx.lente);

  const saldoHoje = runway.saldoAtual;
  const serieGrafico = serie.map((p) => ({
    label: fmtDate(p.data).slice(0, 5),
    entradas: p.entradas,
    saidas: p.saidas,
    saldo: p.saldo,
  }));
  const previstoTotal = pvr.reduce((s, l) => s + l.previsto, 0);

  // Memória de cálculo do saldo: `saldoCaixaAte` (src/lib/metrics.ts) parte do
  // saldo inicial parametrizado e soma o extrato realizado até hoje. Ele NÃO
  // passa pela lente de fonte de propósito — conta bancária é uma só.
  const realizadosAteHoje = dc.movimentos.filter(
    (m) => m.status === "realizado" && m.dataCaixa <= ctx.hoje
  );
  const entradasAteHoje = realizadosAteHoje
    .filter((m) => m.direcao === "entrada")
    .reduce((s, m) => s + m.valor, 0);
  const saidasAteHoje = realizadosAteHoje
    .filter((m) => m.direcao === "saida")
    .reduce((s, m) => s + m.valor, 0);

  // `fluxoDeCaixaDireto` soma os movimentos realizados por categoria do plano de
  // contas: o total de cada lado é a soma das suas categorias. Quando o período
  // cabe numa categoria só, a composição vira frase — uma parte só não é conta,
  // é o próprio número repetido do outro lado do sinal de igual.
  const composicaoDeCategorias = (
    linhas: typeof fx.entradas,
    total: number,
    nome: "entradas" | "saídas",
    nota: string
  ): Composicao =>
    linhas.length >= 2
      ? {
          formula: "soma",
          partes: linhas.map((l) => ({ rotulo: l.rotulo, valor: l.valor })),
          nota,
        }
      : linhas.length === 1
        ? `Todo o total de ${nome} realizadas no período veio de uma única categoria do plano de contas: ${linhas[0].rotulo} (${fmtBRLExato(total)}). ${nota}`
        : `Sem movimento realizado no período e na fonte selecionada — total de ${nome} igual a zero. ${nota}`;

  // `runwayMeses` (src/lib/metrics.ts): saldo de hoje ÷ queima média mensal, com
  // queima média = saída média − entrada média dos últimos 3 meses (burnRateMensal).
  // Nos dois casos-limite a divisão deixa de existir, e aí a composição vira frase:
  // sem queima (burn ≤ 0) não há esgotamento; com saldo ≤ 0 o runway já é zero.
  const composicaoRunway: Composicao =
    runway.meses === null
      ? `Não há esgotamento projetado: nos últimos 3 meses a operação gerou caixa — entrada média de ${fmtBRLExato(burn.entradaMedia)} por mês contra saída média de ${fmtBRLExato(burn.saidaMedia)} (queima média de ${fmtBRLExato(runway.burnMedio)}). Ver runwayMeses em metrics.ts.`
      : runway.saldoAtual <= 0
        ? `Runway zerado por definição: o saldo em caixa hoje é ${fmtBRLExato(runway.saldoAtual)} e a operação queima ${fmtBRLExato(runway.burnMedio)} por mês. Ver runwayMeses em metrics.ts.`
        : {
            formula: "divisao",
            partes: [
              { rotulo: "Saldo em caixa hoje", valor: runway.saldoAtual, formato: "moeda" },
              {
                rotulo: "Queima média por mês (saída média − entrada média de 3 meses)",
                valor: runway.burnMedio,
                formato: "moeda",
              },
            ],
            nota: `Resultado em meses. A queima média sai de ${fmtBRLExato(burn.saidaMedia)} de saída contra ${fmtBRLExato(burn.entradaMedia)} de entrada por mês, nos últimos 3 meses de extrato realizado.`,
          };

  return (
    <div className="space-y-5">
      <PageHeader
        titulo="Fluxo de caixa"
        sub={`Método direto · ${ctx.rotuloPeriodo} · ${ctx.rotuloFonte}`}
      />
      <SeloRegime regime="caixa" />

      {runway.abaixoDaReserva ? (
        <Alerta tom="critico" titulo={`Caixa abaixo da reserva mínima de ${fmtBRL(runway.reservaMinima)}`}>
          Saldo hoje: {fmtBRLExato(saldoHoje)}. Segure investimento novo até recompor a reserva ou
          antecipe recebíveis — a reserva existe para o mês ruim, não para o mês normal.
        </Alerta>
      ) : null}
      {fx.fluxoLiquido < 0 ? (
        <Alerta tom="atencao" titulo={`O período queimou ${fmtBRL(Math.abs(fx.fluxoLiquido))} de caixa`}>
          Entrou {fmtBRL(fx.totalEntradas)} e saiu {fmtBRL(fx.totalSaidas)}. Maior dreno:{" "}
          {fx.saidas[0]?.rotulo ?? "—"} ({fmtBRL(fx.saidas[0]?.valor ?? 0)}).
        </Alerta>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {/* Composição extraída de `saldoCaixaAte` (src/lib/metrics.ts):
            saldo inicial parametrizado + entradas realizadas − saídas realizadas,
            tudo com dataCaixa até hoje. A reserva mínima vem de
            `dc.parametros.reservaMinimaCaixa` — é parâmetro do negócio, não meta inventada. */}
        <Stat
          label="Saldo em caixa hoje"
          valor={fmtBRLExato(saldoHoje)}
          hint="realizado, todas as contas"
          destaque
          formato="moeda"
          valorNumerico={saldoHoje}
          referencia={runway.reservaMinima}
          labelReferencia="reserva mínima"
          composicao={{
            formula: "soma",
            partes: [
              { rotulo: "Saldo inicial das contas (parâmetro)", valor: dc.parametros.saldoInicialCaixa },
              { rotulo: "Entradas realizadas até hoje", valor: entradasAteHoje },
              { rotulo: "Saídas realizadas até hoje", valor: -saidasAteHoje },
            ],
            nota: "Só movimento com status realizado. Este saldo é de TODAS as contas: o filtro de fonte não se aplica a ele — conta bancária é uma só.",
          }}
          origem={`datasetCaixa().movimentos com dataCaixa até ${fmtDate(ctx.hoje)} e status realizado, via saldoCaixaAte · sem filtro de fonte`}
        />
        <Stat
          label="Entradas no período"
          valor={fmtBRL(fx.totalEntradas)}
          hint={`${ctx.rotuloPeriodo} · só realizado`}
          formato="moeda"
          valorNumerico={fx.totalEntradas}
          composicao={composicaoDeCategorias(
            fx.entradas,
            fx.totalEntradas,
            "entradas",
            "Movimento previsto (D+X do gateway, boleto a vencer) não entra: dinheiro projetado não paga boleto."
          )}
          origem={`datasetCaixa().movimentos de entrada, via fluxoDeCaixaDireto · ${ctx.rotuloPeriodo} (${fmtDate(ctx.inicio)} a ${fmtDate(ctx.fim)}) · ${ctx.rotuloFonte} · status realizado`}
        />
        <Stat
          label="Saídas no período"
          valor={fmtBRL(fx.totalSaidas)}
          hint={`${ctx.rotuloPeriodo} · só realizado`}
          invertida
          formato="moeda"
          valorNumerico={fx.totalSaidas}
          composicao={composicaoDeCategorias(
            fx.saidas,
            fx.totalSaidas,
            "saídas",
            "Só movimento realizado. Aqui gastar menos é melhor — por isso a queda desta métrica é lida como positiva."
          )}
          origem={`datasetCaixa().movimentos de saída, via fluxoDeCaixaDireto · ${ctx.rotuloPeriodo} (${fmtDate(ctx.inicio)} a ${fmtDate(ctx.fim)}) · ${ctx.rotuloFonte} · status realizado`}
        />
        {/* Composição extraída de `fluxoDeCaixaDireto` (src/lib/metrics.ts):
            fluxoLiquido = totalEntradas − totalSaidas, ambos somados apenas
            sobre movimentos com status "realizado" dentro do filtro. */}
        <Stat
          label={fx.fluxoLiquido >= 0 ? "Geração de caixa" : "Queima de caixa"}
          valor={fmtBRLExato(fx.fluxoLiquido)}
          hint="entradas − saídas"
          formato="moeda"
          valorNumerico={fx.fluxoLiquido}
          composicao={{
            formula: "subtracao",
            partes: [
              { rotulo: "Entradas realizadas no período", valor: fx.totalEntradas },
              { rotulo: "Saídas realizadas no período", valor: fx.totalSaidas },
            ],
            nota: "Só entra movimento com status realizado. Lançamento previsto (D+X do gateway, boleto a vencer) fica de fora — dinheiro projetado não paga boleto.",
          }}
          origem={`datasetCaixa().movimentos, via fluxoDeCaixaDireto · ${ctx.rotuloPeriodo} (${fmtDate(ctx.inicio)} a ${fmtDate(ctx.fim)}) · ${ctx.rotuloFonte} · status realizado`}
        />
        <Stat
          label="Runway"
          valor={runway.meses === null ? "∞" : `${fmtPct(runway.meses).replace("%", "")} meses`}
          hint={
            runway.meses === null
              ? "a operação se paga (burn ≤ 0)"
              : `esgota em ${fmtDate(runway.dataEsgotamento)}`
          }
          composicao={composicaoRunway}
          origem={`datasetCaixa().movimentos realizados dos últimos 3 meses, via burnRateMensal + runwayMeses · ${ctx.rotuloFonte} (o saldo, esse, é de todas as contas)`}
        />
      </div>

      <Card titulo={`Saldo dia a dia — últimos ${ctx.rangeDias} dias`}>
        {serieGrafico.length ? (
          <GraficoProjecaoSaldo data={serieGrafico} altura={300} />
        ) : (
          <Vazio>Sem movimento de caixa no período.</Vazio>
        )}
        <NotaRegra>
          Barras = o que entrou e saiu no dia; linha = saldo acumulado. Movimento com status
          &ldquo;previsto&rdquo; não aparece aqui — dinheiro projetado não paga boleto.
        </NotaRegra>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card titulo="Ponte de caixa do período">
          <GraficoWaterfall steps={ponte} />
          <NotaRegra>
            De {fmtBRLExato(fx.saldoInicial)} para {fmtBRLExato(fx.saldoFinal)}: cada degrau é uma
            categoria do plano de contas. Diferente da cascata do DRE — aqui é conta bancária.
          </NotaRegra>
        </Card>

        <Card titulo="Burn rate — últimos 3 meses">
          <Tabela>
            <thead>
              <tr>
                <Th>Mês</Th>
                <Th num>Entradas</Th>
                <Th num>Saídas</Th>
                <Th num>Líquido</Th>
              </tr>
            </thead>
            <tbody>
              {burn.meses.map((m) => (
                <tr key={m.periodo}>
                  <Td>{m.periodo}</Td>
                  <Td num>{fmtBRL(m.entradas)}</Td>
                  <Td num>{fmtBRL(m.saidas)}</Td>
                  <Td num>
                    <Sinal valor={m.liquido} texto={fmtBRLExato(m.liquido)} />
                  </Td>
                </tr>
              ))}
              <tr className="font-medium">
                <Td>Média mensal</Td>
                <Td num>{fmtBRL(burn.entradaMedia)}</Td>
                <Td num>{fmtBRL(burn.saidaMedia)}</Td>
                <Td num>
                  <Sinal valor={-burn.burnMedio} texto={fmtBRLExato(-burn.burnMedio)} />
                </Td>
              </tr>
            </tbody>
          </Tabela>
          <NotaRegra>
            Burn médio de {fmtBRLExato(burn.burnMedio)}/mês —{" "}
            {burn.queimandoCaixa
              ? "a operação consome mais do que traz."
              : "a operação se paga com o próprio caixa."}
          </NotaRegra>
        </Card>
      </div>

      <Card titulo="Previsto × realizado por categoria">
        {previstoTotal > 0 ? (
          <GraficoOrcadoRealizado
            data={pvr.map((l) => ({ categoria: l.rotulo, previsto: l.previsto, realizado: l.realizado }))}
          />
        ) : null}
        <Tabela className="mt-3">
          <thead>
            <tr>
              <Th>Categoria</Th>
              <Th>Fluxo</Th>
              <Th num>Previsto</Th>
              <Th num>Realizado</Th>
              <Th num>Desvio</Th>
              <Th num>%</Th>
            </tr>
          </thead>
          <tbody>
            {pvr.map((l) => (
              <tr key={l.categoria}>
                <Td>{l.rotulo}</Td>
                <Td>
                  <Badge tom={l.direcao === "entrada" ? "verde" : "vermelho"}>
                    {l.direcao === "entrada" ? "Entrada" : "Saída"}
                  </Badge>
                </Td>
                <Td num className="text-texto-2">
                  {l.previsto ? fmtBRL(l.previsto) : "—"}
                </Td>
                <Td num>{fmtBRL(l.realizado)}</Td>
                <Td num>
                  {/* em entrada, realizar menos que o previsto é ruim; em saída, é bom */}
                  <Sinal valor={l.desvio} texto={fmtBRLExato(l.desvio)} invertido={l.direcao === "saida"} />
                </Td>
                <Td num className="text-texto-2">
                  {l.desvioPct === null ? "—" : fmtPct(l.desvioPct)}
                </Td>
              </tr>
            ))}
          </tbody>
        </Tabela>
        <NotaRegra>
          &ldquo;Previsto&rdquo; é o movimento já lançado que ainda não bateu na conta (D+X do
          gateway, boleto a vencer). Total ainda em trânsito: {fmtBRL(previstoTotal)}.
        </NotaRegra>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card titulo="De onde veio o dinheiro">
          {fx.entradas.length ? (
            <Tabela>
              <thead>
                <tr>
                  <Th>Categoria</Th>
                  <Th num>Valor</Th>
                  <Th num>% das entradas</Th>
                </tr>
              </thead>
              <tbody>
                {fx.entradas.map((l) => (
                  <tr key={l.categoria}>
                    <Td>{l.rotulo}</Td>
                    <Td num>{fmtBRLExato(l.valor)}</Td>
                    <Td num className="text-texto-2">
                      {fmtPct(l.pct)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Tabela>
          ) : (
            <Vazio>Nenhuma entrada realizada no período.</Vazio>
          )}
        </Card>

        <Card titulo="Para onde o dinheiro foi">
          {fx.saidas.length ? (
            <Tabela>
              <thead>
                <tr>
                  <Th>Categoria</Th>
                  <Th num>Valor</Th>
                  <Th num>% das saídas</Th>
                </tr>
              </thead>
              <tbody>
                {fx.saidas.map((l) => (
                  <tr key={l.categoria}>
                    <Td>{l.rotulo}</Td>
                    <Td num>{fmtBRLExato(l.valor)}</Td>
                    <Td num className="text-texto-2">
                      {fmtPct(l.pct)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Tabela>
          ) : (
            <Vazio>Nenhuma saída realizada no período.</Vazio>
          )}
        </Card>
      </div>
    </div>
  );
}
