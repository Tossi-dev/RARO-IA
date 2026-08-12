// Pulso de caixa no Command Center — as duas perguntas que "bater a meta"
// não responde: SOBROU DINHEIRO? (competência, DRE do mês) e TEMOS CAIXA?
// (tesouraria: saldo, reserva mínima, runway e projeção de 13 semanas).
// Reaproveita integralmente a camada de caixa da Onda A (src/lib/metrics.ts).

import Link from "next/link";
import { GraficoProjecaoSaldo } from "@/components/charts";
import { Badge, Card, Stat, cx } from "@/components/ui";
import { fmtBRL, fmtBRLExato, fmtDate, fmtPct } from "@/lib/format";
import type { PulsoCaixa } from "@/lib/metrics-comando";

export function ComandoCaixa({ pulso }: { pulso: PulsoCaixa }) {
  const dados = pulso.projecao.map((s) => ({
    label: `S${s.semana}`,
    entradas: s.entradas,
    saidas: s.saidas,
    saldo: s.saldoAcumulado,
  }));

  // Janela da projeção — da segunda-feira desta semana ao fim da 13ª semana.
  const fim13s = pulso.projecao[pulso.projecao.length - 1]?.fim ?? "";

  // `posicaoCapitalDeGiro` (src/lib/metrics.ts) calcula caixa + a receber − a pagar,
  // mas `PulsoCaixa` só carrega o resultado e o caixa. A posição líquida dos
  // recebíveis contra os pagáveis é, por definição, o que sobra da conta —
  // e sai exata, sem estimar nada.
  const posicaoRecebiveisMenosPagaveis = +(pulso.capitalDeGiro - pulso.saldoHoje).toFixed(2);

  // `projecaoCaixa13Semanas` joga TODO o vencido em aberto na semana 1 (atraso
  // não some do caixa, só empurra o problema). Como `aReceberVencido` e
  // `aPagarVencido` saem do mesmo recorte de recebíveis/pagáveis, o restante é
  // exatamente o que ainda vai vencer dentro das 13 semanas.
  const aReceberAVencer = +(pulso.entradas13s - pulso.aReceberVencido).toFixed(2);
  const aPagarAVencer = +(pulso.saidas13s - pulso.aPagarVencido).toFixed(2);

  const vereditoLucro = pulso.sobrouDinheiro
    ? `Sim — ${fmtBRL(pulso.lucroOperacional)} de lucro operacional no mês (${fmtPct(pulso.margemLiquidaPct)} do bruto).`
    : `Não — a operação fechou o mês em ${fmtBRL(pulso.lucroOperacional)} de resultado operacional.`;

  const vereditoCaixa = pulso.primeiraSemanaNegativa
    ? `Não — o caixa vira negativo na semana ${pulso.primeiraSemanaNegativa.semana} (${pulso.primeiraSemanaNegativa.inicio.slice(8, 10)}/${pulso.primeiraSemanaNegativa.inicio.slice(5, 7)}).`
    : pulso.abaixoDaReserva
      ? `Parcialmente — há saldo, mas abaixo da reserva mínima de ${fmtBRL(pulso.reservaMinima)}.`
      : "Sim — saldo acima da reserva mínima e nenhuma semana negativa nas próximas 13.";

  return (
    <Card
      titulo="Sobrou dinheiro? Temos caixa?"
      acao={
        <Link href="/financeiro" className="text-xs text-primaria-2 hover:underline">
          financeiro completo →
        </Link>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {/* `dreGerencial` (src/lib/metrics.ts) desce de receita bruta a lucro
                operacional em sete linhas, mas `PulsoCaixa` carrega só o resultado
                final e a margem. Sem os valores de cada linha à mão, a composição
                vai na forma STRING: descreve a conta REAL sem inventar número. */}
            <Stat
              label="Lucro operacional (mês)"
              valor={fmtBRL(pulso.lucroOperacional)}
              hint={`margem de ${fmtPct(pulso.margemLiquidaPct)}`}
              ouro={pulso.sobrouDinheiro}
              formato="moeda"
              valorNumerico={pulso.lucroOperacional}
              composicao={`${fmtBRLExato(pulso.lucroOperacional)} = receita bruta faturada no mês − reembolsos e chargebacks perdidos − impostos provisionados − taxas do gateway − comissões da rede − despesas variáveis − despesas fixas. Sobre a receita bruta, isso dá ${fmtPct(pulso.margemLiquidaPct)} de margem líquida. Regime de COMPETÊNCIA: é o mês que deu (ou não deu) lucro, não o mês em que o dinheiro caiu na conta.`}
              origem="dataset() (matrículas, comissões, despesas e reembolsos do mês) + datasetCaixa() (chargebacks perdidos e alíquota de imposto), via dreGerencial · o valor de cada linha, uma a uma, está em /financeiro/dre"
            />
            {/* Composição extraída de `posicaoCapitalDeGiro` (src/lib/metrics.ts):
                capitalDeGiro = caixa + a receber em aberto − a pagar em aberto. */}
            <Stat
              label="Capital de giro"
              valor={fmtBRL(pulso.capitalDeGiro)}
              hint="caixa + a receber − a pagar"
              formato="moeda"
              valorNumerico={pulso.capitalDeGiro}
              composicao={{
                formula: "soma",
                partes: [
                  { rotulo: "Saldo em caixa hoje", valor: pulso.saldoHoje },
                  {
                    rotulo: "Tudo a receber em aberto menos tudo a pagar em aberto",
                    valor: posicaoRecebiveisMenosPagaveis,
                  },
                ],
                nota: `Fórmula cheia: caixa + tudo a receber em aberto − tudo a pagar em aberto, sem limite de vencimento. Já vencidos e ainda em aberto: ${fmtBRLExato(pulso.aReceberVencido)} a receber e ${fmtBRLExato(pulso.aPagarVencido)} a pagar. Recebível em aberto não é dinheiro em conta: se atrasar, ele não paga a conta do dia.`,
              }}
              origem="datasetCaixa() → saldo realizado das contas + recebíveis ainda não recebidos + contas a pagar ainda não pagas, via posicaoCapitalDeGiro · recebíveis e pagáveis recortados pela lente global de braço; o saldo em conta é o consolidado de todas as contas"
            />
            {/* Composição extraída de `projecaoCaixa13Semanas` (src/lib/metrics.ts):
                entradas13s = soma das entradas das 13 semanas = todo recebível em
                aberto com vencimento até o fim da 13ª semana — incluindo o vencido,
                que a semana 1 absorve por inteiro. */}
            <Stat
              label="Entradas previstas (13s)"
              valor={fmtBRL(pulso.entradas13s)}
              hint={`${fmtBRL(pulso.aReceberVencido)} já vencido`}
              formato="moeda"
              valorNumerico={pulso.entradas13s}
              composicao={{
                formula: "soma",
                partes: [
                  { rotulo: "Recebíveis já vencidos e ainda em aberto", valor: pulso.aReceberVencido },
                  { rotulo: "Recebíveis a vencer dentro das 13 semanas", valor: aReceberAVencer },
                ],
                nota: `A semana 1 absorve tudo o que já venceu e continua em aberto — atraso não some do caixa, só empurra o problema para a frente. Entra só recebível ainda não recebido, com vencimento até ${fmtDate(fim13s)}. É previsão de carteira, não extrato: recebível atrasado pode nunca entrar.`,
              }}
              origem={`datasetCaixa().recebiveis com status diferente de recebido e vencimento até ${fmtDate(fim13s)}, via projecaoCaixa13Semanas · recortado pela lente global de braço`}
            />
            {/* Mesma conta do lado de lá: pagáveis em aberto até o fim da 13ª semana.
                `invertida` porque aqui MENOS é melhor — saída prevista subindo é o
                caixa apertando, e a queda é que precisa aparecer em verde. */}
            <Stat
              label="Saídas previstas (13s)"
              valor={fmtBRL(pulso.saidas13s)}
              hint={`${fmtBRL(pulso.aPagarVencido)} já vencido`}
              invertida
              formato="moeda"
              valorNumerico={pulso.saidas13s}
              composicao={{
                formula: "soma",
                partes: [
                  { rotulo: "Contas a pagar já vencidas e ainda em aberto", valor: pulso.aPagarVencido },
                  { rotulo: "Contas a pagar a vencer dentro das 13 semanas", valor: aPagarAVencer },
                ],
                nota: `Assim como nas entradas, a semana 1 concentra todo o vencido em aberto. Entra só conta ainda não paga, com vencimento até ${fmtDate(fim13s)}. Compromisso adiado continua na conta — ele muda de semana, não desaparece.`,
              }}
              origem={`datasetCaixa().pagaveis com status diferente de pago e vencimento até ${fmtDate(fim13s)}, via projecaoCaixa13Semanas · recortado pela lente global de braço`}
            />
          </div>

          <div className="space-y-1.5 rounded-lg bg-poco px-3 py-2.5 text-xs">
            <p className="flex items-start gap-2">
              <Badge tom={pulso.sobrouDinheiro ? "verde" : "vermelho"}>Sobrou?</Badge>
              <span className={cx("flex-1", pulso.sobrouDinheiro ? "text-texto-2" : "text-negativo")}>
                {vereditoLucro}
              </span>
            </p>
            <p className="flex items-start gap-2">
              <Badge tom={pulso.temCaixa ? "verde" : "vermelho"}>Caixa?</Badge>
              <span className={cx("flex-1", pulso.temCaixa ? "text-texto-2" : "text-negativo")}>
                {vereditoCaixa}
              </span>
            </p>
            <p className="pl-1 text-[11px] text-texto-3">
              Faturar não é receber e lucrar não é ter saldo: o lucro vem da competência (DRE) e o caixa,
              da tesouraria.
            </p>
          </div>
        </div>

        <div>
          <p className="mb-1 text-xs text-texto-3">Projeção de caixa — próximas 13 semanas</p>
          <GraficoProjecaoSaldo data={dados} altura={260} />
        </div>
      </div>
    </Card>
  );
}
