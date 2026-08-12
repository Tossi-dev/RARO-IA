// /financeiro/reembolsos — Reembolsos, chargebacks e inadimplência (SPEC-P1 B.2.10).
// Pergunta: "estou perto do teto de 1% que derruba a conta no gateway?"
// Base de venda em COMPETÊNCIA; efeito no dinheiro em CAIXA. Cada bloco diz qual usa.

import { GraficoBarrasSerie, GraficoDonut } from "@/components/charts";
import { Alerta, NotaRegra, SeloRegime } from "@/components/fin-ui";
import { OrigemDado } from "@/components/origem-dado";
import { Badge, Card, PageHeader, ProgressBar, Stat, Tabela, Td, Th, Vazio, cx } from "@/components/ui";
import { getDB } from "@/lib/data";
import type { Composicao } from "@/lib/composicao";
import { LIMITE_CHARGEBACK_PCT, MOTIVO_CHARGEBACK_LABEL, STATUS_CHARGEBACK_LABEL } from "@/lib/domain";
import { fmtBRL, fmtBRLExato, fmtDate, fmtNum, fmtPct, ymLabel } from "@/lib/format";
import {
  inadimplencia,
  motivosReembolso,
  reembolsosPorProduto,
  serieRisco,
  taxaChargeback,
  taxaReembolso,
} from "@/lib/metrics";
import { contextoCaixa } from "../filtro";

export const dynamic = "force-dynamic";

export default async function Reembolsos() {
  const db = getDB();
  const [ds, dc, produtos] = await Promise.all([db.dataset(), db.datasetCaixa(), db.listProdutos()]);
  const ctx = contextoCaixa(ds.matriculas, produtos);

  const tr = taxaReembolso(ds, ctx.periodo);
  const tc = taxaChargeback(ds, dc, ctx.periodo);
  const porProduto = reembolsosPorProduto(ds, produtos, ctx.periodo);
  const motivos = motivosReembolso(ds, ctx.periodo);
  const risco = serieRisco(ds, dc, 12, ctx.ref);
  const inad = inadimplencia(dc, ctx.ref, ctx.lente);

  const chargebacks = dc.chargebacks
    .filter(
      (c) =>
        c.data >= ctx.inicio &&
        c.data <= ctx.fim &&
        (!ctx.lente.vendasIds || ctx.lente.vendasIds.has(c.matriculaId))
    )
    .sort((a, b) => b.data.localeCompare(a.data));
  const pctDoTeto = Math.min(100, (tc.taxaQtd / LIMITE_CHARGEBACK_PCT) * 100);

  // ---- memórias de cálculo dos KPIs (skills `dashboard-mc` / `diagnostico-comercial`) ----
  const duasCasas = (v: number) => +v.toFixed(2);

  // `vendasNoFiltro` (src/lib/metrics.ts:942), base de `taxaReembolso` e de
  // `taxaChargeback`: matrícula não pendente, com data dentro do período e na
  // fonte da lente. Venda reembolsada CONTINUA contando como venda.
  const vendasDoPeriodo = ds.matriculas.filter(
    (m) =>
      m.statusPagamento !== "pendente" &&
      m.data >= ctx.inicio &&
      m.data <= ctx.fim &&
      (!ctx.lente.vendasIds || ctx.lente.vendasIds.has(m.id))
  );
  const qtdPagas = vendasDoPeriodo.filter((m) => m.statusPagamento === "pago").length;
  const qtdReembolsadas = vendasDoPeriodo.filter((m) => m.statusPagamento === "reembolsado").length;

  // `motivosReembolso` (src/lib/metrics.ts:2093) usa exatamente o mesmo recorte
  // de reembolsos de `taxaReembolso` — a soma dos motivos fecha com o total.
  const somaMotivos = motivos.reduce((s, m) => s + m.qtd, 0);

  // `inadimplencia` (src/lib/metrics.ts:1535): o aging só distribui parcelas com
  // 1+ dia cheio de atraso. O que vence HOJE já entra no atrasado mas não cai em
  // nenhuma faixa — em vez de esconder a diferença, ela vira uma linha própria.
  const somaAging = duasCasas(inad.aging.reduce((s, f) => s + f.valor, 0));
  const atrasoSemFaixa = duasCasas(inad.valorAtrasado - somaAging);
  const partesAtraso = [
    ...inad.aging.map((f) => ({ rotulo: `Atraso de ${f.faixa}`, valor: f.valor })),
    ...(atrasoSemFaixa !== 0
      ? [{ rotulo: "Vence hoje, ainda sem um dia cheio de atraso", valor: atrasoSemFaixa }]
      : []),
  ];

  const origemPeriodo = `${ctx.rotuloPeriodo} (${fmtDate(ctx.inicio)} a ${fmtDate(ctx.fim)}) · ${ctx.rotuloFonte}`;
  const origemReembolsos = `dataset().reembolsos, via taxaReembolso · pedidos com data dentro de ${origemPeriodo}`;
  const origemCarteira = `datasetCaixa().recebiveis, via inadimplencia · parcelas com status diferente de recebido · ${ctx.rotuloFonte} · carteira inteira, sem recorte de período`;

  // O total de pedidos abre por motivo declarado quando há mais de um motivo e a
  // soma fecha com o total. Sem isso, a origem é dita em texto — nunca uma soma
  // aproximada só para o cartão parecer completo.
  const composicaoQtdReembolsos: Composicao =
    motivos.length >= 2 && somaMotivos === tr.qtdReembolsos
      ? {
          formula: "soma",
          partes: motivos.map((m) => ({ rotulo: `Motivo declarado: ${m.motivo}`, valor: m.qtd })),
          origem: origemReembolsos,
          nota: `São ${fmtBRLExato(tr.valorReembolsado)} devolvidos ao cliente. Reembolso é acordo com o cliente — não conta para o teto das bandeiras, ao contrário do chargeback.`,
        }
      : tr.qtdReembolsos > 0
        ? `${fmtNum(tr.qtdReembolsos)} pedido(s), somando ${fmtBRLExato(tr.valorReembolsado)} devolvidos${motivos.length === 1 ? `, todos pelo mesmo motivo declarado: ${motivos[0].motivo}` : ""}. Contagem direta dos registros de reembolso do período. Origem: ${origemReembolsos}.`
        : `Nenhum pedido de reembolso com data dentro de ${origemPeriodo}. Origem: ${origemReembolsos}.`;

  return (
    <div className="space-y-5">
      <PageHeader
        titulo="Reembolsos e chargebacks"
        sub={`${ctx.rotuloPeriodo} · ${ctx.rotuloFonte}`}
      />
      <SeloRegime regime="misto" />

      {tc.acimaDoLimite ? (
        <Alerta
          tom="critico"
          titulo={`Chargeback em ${fmtPct(tc.taxaQtd)} — acima do teto de ${LIMITE_CHARGEBACK_PCT}% das bandeiras`}
        >
          Acima de {LIMITE_CHARGEBACK_PCT}% das transações as bandeiras começam a punir a conta:
          retenção maior, taxa mais cara e, no limite, bloqueio. {tc.abertos} disputa(s) ainda em
          aberto — responder com prova de entrega é o caminho mais barato.
        </Alerta>
      ) : tc.qtd > 0 ? (
        <Alerta tom="atencao" titulo={`${fmtPct(tc.taxaQtd)} de chargeback — dentro do teto de ${LIMITE_CHARGEBACK_PCT}%`}>
          {tc.abertos} em disputa, {tc.perdidos} perdido(s) somando {fmtBRL(tc.valorPerdido)} que saíram do caixa.
        </Alerta>
      ) : (
        <Alerta tom="ok" titulo="Nenhum chargeback no período">
          Reembolso acordado com o cliente não conta para o teto da bandeira — só a contestação
          imposta pela operadora conta.
        </Alerta>
      )}
      {tr.taxaValor > 10 ? (
        <Alerta tom="atencao" titulo={`${fmtPct(tr.taxaValor)} do faturamento voltou como reembolso`}>
          Taxa alta em valor com taxa baixa em quantidade indica problema no produto caro, não no
          volume. Produto com maior taxa: {porProduto[0]?.nome ?? "—"}.
        </Alerta>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <Stat
          label="Vendas no período"
          valor={fmtNum(tr.qtdVendas)}
          hint={fmtBRL(tr.faturamento)}
          formato="numero"
          valorNumerico={tr.qtdVendas}
          composicao={{
            formula: "soma",
            partes: [
              { rotulo: "Matrículas pagas e não devolvidas", valor: qtdPagas },
              { rotulo: "Matrículas que foram vendidas e depois reembolsadas", valor: qtdReembolsadas },
            ],
            origem: `dataset().matriculas, via vendasNoFiltro · matrículas com data dentro de ${origemPeriodo}`,
            nota: `Venda pendente não conta como venda. A venda reembolsada continua no denominador de propósito: é justamente ela que dá sentido à taxa de reembolso. Faturamento bruto correspondente: ${fmtBRLExato(tr.faturamento)}.`,
          }}
        />
        <Stat
          label="Reembolsos"
          valor={fmtNum(tr.qtdReembolsos)}
          hint={fmtBRL(tr.valorReembolsado)}
          invertida
          formato="numero"
          valorNumerico={tr.qtdReembolsos}
          composicao={composicaoQtdReembolsos}
        />
        <Stat
          label="Taxa de reembolso (qtd)"
          valor={fmtPct(tr.taxaQtd)}
          hint="pedidos ÷ vendas"
          invertida
          formato="percentual"
          valorNumerico={tr.taxaQtd}
          composicao={{
            formula: "divisao",
            partes: [
              { rotulo: "Pedidos de reembolso no período", valor: tr.qtdReembolsos, formato: "numero" },
              { rotulo: "Vendas no período", valor: tr.qtdVendas, formato: "numero" },
            ],
            origem: `dataset() (matrículas e reembolsos), via taxaReembolso · ${origemPeriodo}`,
            nota: `O resultado da divisão é multiplicado por 100 para virar percentual. Esta é a taxa por CABEÇA: quantos clientes pediram o dinheiro de volta. Quando ela é baixa e a taxa em R$ é alta, o arrependimento está no produto caro, não no volume.`,
          }}
        />
        <Stat
          label="Taxa de reembolso (R$)"
          valor={fmtPct(tr.taxaValor)}
          hint="devolvido ÷ faturamento"
          invertida
          formato="percentual"
          valorNumerico={tr.taxaValor}
          composicao={{
            formula: "divisao",
            partes: [
              { rotulo: "Valor devolvido ao cliente no período", valor: tr.valorReembolsado, formato: "moeda" },
              { rotulo: "Faturamento bruto do período", valor: tr.faturamento, formato: "moeda" },
            ],
            origem: `dataset() (matrículas e reembolsos), via taxaReembolso · ${origemPeriodo}`,
            nota: `O resultado da divisão é multiplicado por 100 para virar percentual. Esta é a taxa por BOLSO: quanto do faturamento voltou. Acima de 10% o alerta desta tela dispara.`,
          }}
        />
        {/* `taxaChargeback` (src/lib/metrics.ts:1489): contestações do período
            ÷ vendas do período × 100, comparada com o teto real das bandeiras. */}
        <Stat
          label="Taxa de chargeback"
          valor={fmtPct(tc.taxaQtd)}
          hint={`teto da bandeira: ${LIMITE_CHARGEBACK_PCT}%`}
          invertida
          destaque
          formato="percentual"
          valorNumerico={tc.taxaQtd}
          referencia={LIMITE_CHARGEBACK_PCT}
          labelReferencia="teto das bandeiras"
          composicao={{
            formula: "divisao",
            partes: [
              { rotulo: "Transações contestadas na operadora", valor: tc.qtd, formato: "numero" },
              { rotulo: "Vendas no período", valor: tc.qtdVendas, formato: "numero" },
            ],
            origem: `dataset().matriculas + datasetCaixa().chargebacks, via taxaChargeback · ${origemPeriodo}`,
            nota: `O resultado da divisão é multiplicado por 100 para virar percentual. O teto de ${LIMITE_CHARGEBACK_PCT}% é medido em QUANTIDADE de transações, não em R$ — por isso muita venda pequena contestada dói tanto quanto uma venda alta. Reembolso acordado com o cliente não entra aqui: só a contestação imposta pela operadora conta. A comparação abaixo é contra o teto, não contra o mês anterior.`,
          }}
        />
        <Stat
          label="Perdido em disputa"
          valor={fmtBRLExato(tc.valorPerdido)}
          hint={`${tc.perdidos} caso(s)`}
          invertida
          formato="moeda"
          valorNumerico={tc.valorPerdido}
          composicao={{
            formula: "subtracao",
            partes: [
              { rotulo: "Total contestado no período", valor: tc.valor },
              {
                rotulo: `Contestações ganhas ou ainda em disputa (${fmtNum(tc.ganhos)} ganha(s), ${fmtNum(tc.abertos)} em aberto)`,
                valor: duasCasas(tc.valor - tc.valorPerdido),
              },
            ],
            origem: `datasetCaixa().chargebacks, via taxaChargeback · contestações com data dentro de ${origemPeriodo}`,
            nota: "Só o chargeback PERDIDO custa dinheiro: vira dedução de receita no DRE e saída de caixa. O ganho não custa nada no resultado — mas conta igual para o teto da bandeira, porque o teto olha a contestação, não o desfecho.",
          }}
        />
      </div>

      <Card titulo={`Distância até o teto de ${LIMITE_CHARGEBACK_PCT}%`}>
        <ProgressBar pct={pctDoTeto} tom={tc.acimaDoLimite ? "ouro" : "violeta"} />
        <p className="mt-2 text-sm text-texto-2">
          {fmtPct(tc.taxaQtd)} de {LIMITE_CHARGEBACK_PCT}% tolerados —{" "}
          {tc.acimaDoLimite ? (
            <span className="text-negativo">teto estourado</span>
          ) : (
            <span className="text-positivo">{fmtPct(LIMITE_CHARGEBACK_PCT - tc.taxaQtd)} de folga</span>
          )}
          .
        </p>
        <NotaRegra>
          O teto é medido em QUANTIDADE de transações contestadas, não em R$ — por isso muita venda
          pequena contestada dói tanto quanto uma venda alta.
        </NotaRegra>
      </Card>

      <Card titulo="Risco no tempo — reembolso × chargeback × teto">
        <GraficoBarrasSerie
          data={risco.map((p) => ({ label: ymLabel(p.periodo), valor: p.taxaChargeback }))}
          ehPct
        />
        <Tabela className="mt-3">
          <thead>
            <tr>
              <Th>Mês</Th>
              <Th num>Taxa de reembolso</Th>
              <Th num>Taxa de chargeback</Th>
              <Th num>Teto</Th>
              <Th>Situação</Th>
            </tr>
          </thead>
          <tbody>
            {risco.map((p) => (
              <tr key={p.periodo} className={cx(p.taxaChargeback > p.limite && "bg-negativo/5")}>
                <Td>{ymLabel(p.periodo)}</Td>
                <Td num>{fmtPct(p.taxaReembolso)}</Td>
                <Td num>{fmtPct(p.taxaChargeback)}</Td>
                <Td num className="text-texto-3">
                  {fmtPct(p.limite)}
                </Td>
                <Td>
                  {p.taxaChargeback > p.limite ? (
                    <Badge tom="vermelho">Acima do teto</Badge>
                  ) : (
                    <Badge tom="verde">Ok</Badge>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Tabela>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card titulo="Reembolso por produto">
          {porProduto.length ? (
            <Tabela>
              <thead>
                <tr>
                  <Th>Produto</Th>
                  <Th num>Vendas</Th>
                  <Th num>Reemb.</Th>
                  <Th num>Taxa qtd</Th>
                  <Th num>Devolvido</Th>
                  <Th num>Taxa R$</Th>
                </tr>
              </thead>
              <tbody>
                {porProduto.map((p) => (
                  <tr key={p.produtoId} className={cx(p.taxaValor > 10 && "bg-negativo/5")}>
                    <Td>{p.nome}</Td>
                    <Td num>{fmtNum(p.qtdVendas)}</Td>
                    <Td num>{fmtNum(p.qtdReembolsos)}</Td>
                    <Td num>{fmtPct(p.taxaQtd)}</Td>
                    <Td num>{fmtBRL(p.valorReembolsado)}</Td>
                    <Td num className={cx(p.taxaValor > 10 && "text-negativo")}>
                      {fmtPct(p.taxaValor)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Tabela>
          ) : (
            <Vazio>Sem vendas no período para calcular taxa por produto.</Vazio>
          )}
          <NotaRegra>
            Taxa alta é sinal de promessa de venda desalinhada com a entrega, não só de cliente
            difícil.
          </NotaRegra>
          <OrigemDado
            abas={["VENDAS", "PRODUTOS"]}
            calculo="Vendas com status reembolsado ÷ vendas do período, por produto, em quantidade e em reais"
            vazio={!porProduto.length}
          />
        </Card>

        <Card titulo="Por que o cliente pediu o dinheiro de volta">
          {motivos.length ? (
            <>
              <GraficoDonut data={motivos.map((m) => ({ name: m.motivo, value: m.valor }))} />
              <Tabela className="mt-2">
                <thead>
                  <tr>
                    <Th>Motivo</Th>
                    <Th num>Casos</Th>
                    <Th num>Valor</Th>
                    <Th num>% do total</Th>
                  </tr>
                </thead>
                <tbody>
                  {motivos.map((m) => (
                    <tr key={m.motivo}>
                      <Td>{m.motivo}</Td>
                      <Td num>{fmtNum(m.qtd)}</Td>
                      <Td num>{fmtBRLExato(m.valor)}</Td>
                      <Td num className="text-texto-2">
                        {fmtPct(m.pct)}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Tabela>
            </>
          ) : (
            <Vazio>Nenhum reembolso no período.</Vazio>
          )}
          <OrigemDado
            abas={["MOVIMENTOS", "VENDAS"]}
            calculo="Movimentos de devolução agrupados por motivo, com o peso de cada motivo no total devolvido"
            vazio={!motivos.length}
          />
        </Card>
      </div>

      <Card titulo={`Chargebacks do período (${chargebacks.length})`}>
        {chargebacks.length ? (
          <Tabela>
            <thead>
              <tr>
                <Th>Data</Th>
                <Th>Motivo</Th>
                <Th num>Valor</Th>
                <Th>Status</Th>
                <Th>Resolvido em</Th>
              </tr>
            </thead>
            <tbody>
              {chargebacks.map((c) => (
                <tr key={c.id} className={cx(c.status === "perdido" && "bg-negativo/5")}>
                  <Td>{fmtDate(c.data)}</Td>
                  <Td>{MOTIVO_CHARGEBACK_LABEL[c.motivo]}</Td>
                  <Td num>{fmtBRLExato(c.valor)}</Td>
                  <Td>
                    <Badge
                      tom={c.status === "perdido" ? "vermelho" : c.status === "ganho" ? "verde" : "ouro"}
                    >
                      {STATUS_CHARGEBACK_LABEL[c.status]}
                    </Badge>
                  </Td>
                  <Td className="text-texto-2">{c.dataResolucao ? fmtDate(c.dataResolucao) : "em disputa"}</Td>
                </tr>
              ))}
            </tbody>
          </Tabela>
        ) : (
          <Vazio>Nenhuma contestação no período.</Vazio>
        )}
        <NotaRegra>
          Chargeback ganho não custa nada no resultado; só o PERDIDO vira dedução de receita no DRE e
          saída de caixa.
        </NotaRegra>
        <OrigemDado
          abas={["CHARGEBACKS", "VENDAS"]}
          calculo="Contestações com data dentro do período, ligadas à venda pelo ID_Venda"
          vazio={!chargebacks.length}
        />
      </Card>

      <Card titulo="Inadimplência da carteira">
        <div className="grid gap-3 sm:grid-cols-4">
          <Stat
            label="Em aberto"
            valor={fmtBRL(inad.valorEmAberto)}
            hint="vencido + a vencer"
            formato="moeda"
            valorNumerico={inad.valorEmAberto}
            composicao={{
              formula: "soma",
              partes: [
                { rotulo: "Parcelas vencidas e não recebidas", valor: inad.valorAtrasado },
                {
                  rotulo: "Parcelas ainda dentro do prazo",
                  valor: duasCasas(inad.valorEmAberto - inad.valorAtrasado),
                },
              ],
              origem: origemCarteira,
              nota: "Carteira inteira em aberto, sem recorte de período: parcela que vence daqui a seis meses continua sendo dinheiro que você já vendeu e ainda não recebeu.",
            }}
          />
          <Stat
            label="Atrasado"
            valor={fmtBRL(inad.valorAtrasado)}
            hint={`${inad.qtdAtrasada} parcela(s)`}
            invertida
            formato="moeda"
            valorNumerico={inad.valorAtrasado}
            composicao={{
              formula: "soma",
              partes: partesAtraso,
              origem: origemCarteira,
              nota: "Parcela vencida e não recebida entra no atraso mesmo que o cadastro ainda diga 'a vencer' — o relógio não espera atualização de status. Quanto mais à direita a faixa, menor a chance de o dinheiro entrar sem esforço de cobrança.",
            }}
          />
          <Stat
            label="Taxa de inadimplência"
            valor={fmtPct(inad.taxa)}
            hint="atrasado ÷ em aberto"
            invertida
            formato="percentual"
            valorNumerico={inad.taxa}
            composicao={{
              formula: "divisao",
              partes: [
                { rotulo: "Valor vencido e não recebido", valor: inad.valorAtrasado, formato: "moeda" },
                { rotulo: "Carteira total em aberto", valor: inad.valorEmAberto, formato: "moeda" },
              ],
              origem: origemCarteira,
              nota: "O resultado da divisão é multiplicado por 100 para virar percentual. É a fatia da carteira que travou. Diferente do reembolso, aqui o cliente não pediu o dinheiro de volta — ele simplesmente não pagou, e o valor continua sendo seu para cobrar.",
            }}
          />
          {/* `inadimplencia` (src/lib/metrics.ts:1535) devolve a média já pronta e
              não expõe a soma dos dias; reconstruí-la pelo produto seria circular.
              Forma STRING, descrevendo a conta com precisão. */}
          <Stat
            label="Atraso médio"
            valor={`${fmtNum(Math.round(inad.diasMedioAtraso))} dias`}
            hint="ponderado pelas parcelas vencidas"
            invertida
            formato="numero"
            composicao={`Média simples dos dias de atraso (hoje ${fmtDate(ctx.hoje)} menos o vencimento) das ${fmtNum(inad.qtdAtrasada)} parcela(s) vencidas e não recebidas — valor exato ${fmtNum(inad.diasMedioAtraso)} dias, arredondado no cartão. Cada parcela pesa igual, independentemente do valor: uma parcela de R$ 97 atrasada há 90 dias puxa a média tanto quanto uma de R$ 9.700. Origem: ${origemCarteira}.`}
          />
        </div>
        <Tabela className="mt-3">
          <thead>
            <tr>
              <Th>Faixa de atraso</Th>
              <Th num>Valor</Th>
              <Th num>Parcelas</Th>
            </tr>
          </thead>
          <tbody>
            {inad.aging.map((f) => (
              <tr key={f.faixa}>
                <Td>{f.faixa}</Td>
                <Td num>{fmtBRLExato(f.valor)}</Td>
                <Td num className="text-texto-2">
                  {fmtNum(f.qtd)}
                </Td>
              </tr>
            ))}
          </tbody>
        </Tabela>
        <NotaRegra>
          Parcela vencida e não recebida entra no atraso mesmo que o cadastro ainda diga &ldquo;a
          vencer&rdquo; — o relógio não espera atualização de status.
        </NotaRegra>
      </Card>
    </div>
  );
}
