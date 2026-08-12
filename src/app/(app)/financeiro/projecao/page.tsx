// /financeiro/projecao — Projeção de caixa 13 semanas (SPEC-P1 B.2.2).
// Pergunta: "em que semana o caixa fica negativo se nada mudar?"
// REGIME DE CAIXA, olhando para frente: carteira de recebíveis × pagáveis.

import { GraficoCenarios, GraficoProjecaoSaldo } from "@/components/charts";
import { Alerta, NotaRegra, SeloRegime, Sinal } from "@/components/fin-ui";
import { Badge, Card, PageHeader, Stat, Tabela, Td, Th, Vazio, cx } from "@/components/ui";
import { getDB } from "@/lib/data";
import { fmtBRL, fmtBRLExato, fmtDate } from "@/lib/format";
import {
  agendaCaixa,
  projecaoCaixa13Semanas,
  projecaoCaixaCenarios,
  saldoCaixaAte,
} from "@/lib/metrics";
import { contextoCaixa } from "../filtro";

export const dynamic = "force-dynamic";

export default async function ProjecaoDeCaixa() {
  const db = getDB();
  const [dc, ds, produtos] = await Promise.all([db.datasetCaixa(), db.dataset(), db.listProdutos()]);
  const ctx = contextoCaixa(ds.matriculas, produtos);

  // A projeção ignora o range do filtro global de propósito: o horizonte é
  // sempre 13 semanas. O filtro de fonte continua valendo sobre a carteira a
  // receber (ela vem de venda, que tem produto); a carteira a pagar não —
  // comissão, imposto e fornecedor não têm produto no cadastro.
  const semanas = projecaoCaixa13Semanas(dc, ctx.ref, ctx.lente);
  const cenarios = projecaoCaixaCenarios(dc, ctx.ref, ctx.lente);
  const agenda = agendaCaixa(dc, 90, ctx.ref, ctx.lente);
  const saldoHoje = saldoCaixaAte(dc, ctx.hoje);

  const primeiraNegativa = semanas.find((s) => s.negativo) ?? null;
  const primeiraNegativaPessimista = cenarios.find((c) => c.pessimista < 0) ?? null;
  const totalEntradas = semanas.reduce((s, x) => s + x.entradas, 0);
  const totalSaidas = semanas.reduce((s, x) => s + x.saidas, 0);
  const piorSemana = semanas.reduce((pior, s) => (s.saldoAcumulado < pior.saldoAcumulado ? s : pior), semanas[0]);
  const reserva = dc.parametros.reservaMinimaCaixa;

  // ---- memória de cálculo dos 4 KPIs do topo ----
  // `saldoCaixaAte` (src/lib/metrics.ts): saldo inicial parametrizado + extrato
  // realizado até hoje. Não passa pela lente de fonte — conta bancária é uma só.
  const realizadosAteHoje = dc.movimentos.filter(
    (m) => m.status === "realizado" && m.dataCaixa <= ctx.hoje
  );
  const entradasAteHoje = realizadosAteHoje
    .filter((m) => m.direcao === "entrada")
    .reduce((s, m) => s + m.valor, 0);
  const saidasAteHoje = realizadosAteHoje
    .filter((m) => m.direcao === "saida")
    .reduce((s, m) => s + m.valor, 0);
  // `projecaoCaixa13Semanas` joga na semana 1 tudo o que já venceu e segue em
  // aberto — separar as duas metades é a leitura honesta do total do horizonte.
  const entradasS1 = semanas[0]?.entradas ?? 0;
  const saidasS1 = semanas[0]?.saidas ?? 0;
  const saldoFinalHorizonte = semanas[semanas.length - 1]?.saldoAcumulado ?? 0;

  return (
    <div className="space-y-5">
      <PageHeader
        titulo="Projeção de caixa — 13 semanas"
        sub={`Rolling a partir de ${fmtDate(ctx.hoje)} · ${ctx.rotuloFonte}`}
      />
      <SeloRegime regime="caixa" />

      {primeiraNegativa ? (
        <Alerta
          tom="critico"
          titulo={`Caixa fica NEGATIVO na semana ${primeiraNegativa.semana} (${fmtDate(primeiraNegativa.inicio)})`}
        >
          Saldo projetado de {fmtBRLExato(primeiraNegativa.saldoAcumulado)}. Você tem{" "}
          {primeiraNegativa.semana - 1} semana(s) para antecipar recebível, renegociar vencimento ou
          cortar saída.
        </Alerta>
      ) : primeiraNegativaPessimista ? (
        <Alerta
          tom="atencao"
          titulo={`No cenário pessimista o caixa vira na semana ${primeiraNegativaPessimista.semana}`}
        >
          O cenário base aguenta as 13 semanas, mas uma frustração de 20% nos recebimentos derruba o
          caixa. Vale ter plano B de antecipação.
        </Alerta>
      ) : piorSemana && piorSemana.saldoAcumulado < reserva ? (
        <Alerta tom="atencao" titulo={`O caixa fura a reserva mínima na semana ${piorSemana.semana}`}>
          Menor saldo projetado: {fmtBRLExato(piorSemana.saldoAcumulado)} contra reserva de{" "}
          {fmtBRL(reserva)}.
        </Alerta>
      ) : (
        <Alerta tom="ok" titulo="Caixa positivo nas 13 semanas do horizonte">
          Menor saldo projetado: {fmtBRLExato(piorSemana?.saldoAcumulado ?? 0)} na semana{" "}
          {piorSemana?.semana ?? "—"}.
        </Alerta>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Saldo hoje"
          valor={fmtBRLExato(saldoHoje)}
          hint="ponto de partida (realizado)"
          destaque
          formato="moeda"
          valorNumerico={saldoHoje}
          referencia={reserva}
          labelReferencia="reserva mínima"
          composicao={{
            formula: "soma",
            partes: [
              { rotulo: "Saldo inicial das contas (parâmetro)", valor: dc.parametros.saldoInicialCaixa },
              { rotulo: "Entradas realizadas até hoje", valor: entradasAteHoje },
              { rotulo: "Saídas realizadas até hoje", valor: -saidasAteHoje },
            ],
            nota: "Só movimento com status realizado — é o ponto de partida da projeção. Saldo de TODAS as contas: o filtro de fonte não se aplica a ele.",
          }}
          origem={`datasetCaixa().movimentos com dataCaixa até ${fmtDate(ctx.hoje)} e status realizado, via saldoCaixaAte · sem filtro de fonte`}
        />
        <Stat
          label="A receber em 13 semanas"
          valor={fmtBRL(totalEntradas)}
          hint="carteira em aberto"
          formato="moeda"
          valorNumerico={totalEntradas}
          composicao={{
            formula: "soma",
            partes: [
              { rotulo: "Semana 1 — inclui todo recebível já vencido e ainda em aberto", valor: entradasS1 },
              { rotulo: "Semanas 2 a 13 — recebíveis a vencer dentro do horizonte", valor: totalEntradas - entradasS1 },
            ],
            nota: "Carteira em aberto (status diferente de recebido), somada pelo VENCIMENTO. Atraso não some do caixa: ele reaparece inteiro na semana 1.",
          }}
          origem={`datasetCaixa().recebiveis em aberto com vencimento até ${fmtDate(semanas[semanas.length - 1]?.fim ?? ctx.hoje)}, via projecaoCaixa13Semanas · ${ctx.rotuloFonte}`}
        />
        <Stat
          label="A pagar em 13 semanas"
          valor={fmtBRL(totalSaidas)}
          hint="contas já contratadas"
          invertida
          formato="moeda"
          valorNumerico={totalSaidas}
          composicao={{
            formula: "soma",
            partes: [
              { rotulo: "Semana 1 — inclui toda conta já vencida e ainda em aberto", valor: saidasS1 },
              { rotulo: "Semanas 2 a 13 — contas a vencer dentro do horizonte", valor: totalSaidas - saidasS1 },
            ],
            nota: "Compromisso já contratado (status diferente de pago), somado pelo VENCIMENTO. Dever menos é melhor — por isso a queda desta métrica é lida como positiva.",
          }}
          origem={`datasetCaixa().pagaveis em aberto com vencimento até ${fmtDate(semanas[semanas.length - 1]?.fim ?? ctx.hoje)}, via projecaoCaixa13Semanas · consolidado, sem filtro de fonte`}
        />
        <Stat
          label="Saldo ao fim do horizonte"
          valor={fmtBRLExato(saldoFinalHorizonte)}
          hint="se nada mudar"
          formato="moeda"
          valorNumerico={saldoFinalHorizonte}
          referencia={reserva}
          labelReferencia="reserva mínima"
          composicao={{
            formula: "soma",
            partes: [
              { rotulo: "Saldo de caixa hoje (realizado)", valor: saldoHoje },
              { rotulo: "A receber nas 13 semanas", valor: totalEntradas },
              { rotulo: "A pagar nas 13 semanas", valor: -totalSaidas },
            ],
            nota: "Cenário base, sem venda nova: só a carteira que já existe. Assume que todo recebível em aberto entra na data de vencimento — o cenário pessimista estressa exatamente essa premissa.",
          }}
          origem={`saldoCaixaAte + carteira de recebíveis e pagáveis em aberto, via projecaoCaixa13Semanas${ctx.fonte === "todos" ? "" : ` · só a carteira a receber respeita a fonte selecionada (${ctx.rotuloFonte})`}`}
        />
      </div>

      <Card titulo="Entradas, saídas e saldo acumulado por semana">
        <GraficoProjecaoSaldo
          data={semanas.map((s) => ({
            label: `S${s.semana}`,
            entradas: s.entradas,
            saidas: s.saidas,
            saldo: s.saldoAcumulado,
          }))}
          altura={320}
        />
        <NotaRegra>
          A semana 1 absorve tudo o que já venceu e continua em aberto — atraso não some do caixa, só
          empurra o problema para a frente. A linha zero em laranja é o que precisa ser lido primeiro.
        </NotaRegra>
      </Card>

      <Card titulo="Cenários: base, otimista e pessimista (±20% nas entradas)">
        <GraficoCenarios data={cenarios} />
        <NotaRegra>
          Só as ENTRADAS são estressadas: as saídas já estão contratadas (comissão, imposto,
          fornecedor) e não caem porque a venda caiu.
        </NotaRegra>
      </Card>

      <Card titulo="Semana a semana">
        <Tabela>
          <thead>
            <tr>
              <Th>Semana</Th>
              <Th>Período</Th>
              <Th num>Entradas</Th>
              <Th num>Saídas</Th>
              <Th num>Líquido</Th>
              <Th num>Saldo acumulado</Th>
              <Th>Pessimista</Th>
            </tr>
          </thead>
          <tbody>
            {semanas.map((s, i) => (
              <tr key={s.semana} className={cx(s.negativo && "bg-negativo/5")}>
                <Td>S{s.semana}</Td>
                <Td className="text-texto-2">
                  {fmtDate(s.inicio)} — {fmtDate(s.fim)}
                </Td>
                <Td num>{s.entradas ? fmtBRL(s.entradas) : "—"}</Td>
                <Td num>{s.saidas ? fmtBRL(s.saidas) : "—"}</Td>
                <Td num>
                  <Sinal valor={s.liquido} texto={fmtBRLExato(s.liquido)} />
                </Td>
                <Td num>
                  <Sinal valor={s.saldoAcumulado} texto={fmtBRLExato(s.saldoAcumulado)} />
                </Td>
                <Td>
                  {cenarios[i] && cenarios[i].pessimista < 0 ? (
                    <Badge tom="vermelho">{fmtBRLExato(cenarios[i].pessimista)}</Badge>
                  ) : (
                    <span className="text-texto-3 tabular-nums">{fmtBRLExato(cenarios[i]?.pessimista ?? 0)}</span>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Tabela>
      </Card>

      <Card titulo="Agenda de caixa — próximos 90 dias">
        {agenda.length ? (
          <Tabela>
            <thead>
              <tr>
                <Th>Data</Th>
                <Th>Compromissos do dia</Th>
                <Th num>Entra</Th>
                <Th num>Sai</Th>
                <Th num>Saldo após</Th>
              </tr>
            </thead>
            <tbody>
              {agenda.map((d) => (
                <tr key={d.data} className={cx(d.saldoAcumulado < 0 && "bg-negativo/5")}>
                  <Td>{fmtDate(d.data)}</Td>
                  <Td>
                    <ul className="space-y-0.5">
                      {d.itens.map((i, idx) => (
                        <li key={`${d.data}-${idx}`} className="text-xs text-texto-2">
                          <span className={i.tipo === "recebimento" ? "text-positivo" : "text-negativo"}>
                            {i.tipo === "recebimento" ? "↓" : "↑"}
                          </span>{" "}
                          {i.descricao} · {fmtBRL(i.valor)}
                          {i.vencido ? <span className="ml-1 text-negativo">(vencido)</span> : null}
                        </li>
                      ))}
                    </ul>
                  </Td>
                  <Td num>{d.entradas ? fmtBRL(d.entradas) : "—"}</Td>
                  <Td num>{d.saidas ? fmtBRL(d.saidas) : "—"}</Td>
                  <Td num>
                    <Sinal valor={d.saldoAcumulado} texto={fmtBRLExato(d.saldoAcumulado)} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Tabela>
        ) : (
          <Vazio>Nenhum compromisso de caixa nos próximos 90 dias.</Vazio>
        )}
        <NotaRegra>
          O que já venceu e segue em aberto aparece na linha de hoje — é dívida do presente, não do
          passado.
        </NotaRegra>
      </Card>
    </div>
  );
}
