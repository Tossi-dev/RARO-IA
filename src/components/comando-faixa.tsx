// Faixa de Comando (SPEC-P1 Anexo B.1.1) — a primeira coisa que o dono vê.
// Server component: sem estado, sem "use client". Só recebe o cálculo pronto
// de src/lib/metrics-comando.ts e o transforma em leitura de 10 segundos.

import { GraficoGaugeMeta, Sparkline } from "@/components/charts";
import { Card, Stat, cx } from "@/components/ui";
import { fmtBRL, fmtBRLExato, fmtDate, fmtNum, fmtPct } from "@/lib/format";
import type { NorteDoComando, PulsoCaixa } from "@/lib/metrics-comando";

function Comparativo({ rotulo, valor, deltaPct }: { rotulo: string; valor: number; deltaPct: number | null }) {
  const tom =
    deltaPct === null ? "text-texto-3" : deltaPct >= 0 ? "text-positivo" : "text-negativo";
  return (
    <div className="rounded-xl bg-poco px-3.5 py-2.5">
      <p className="text-[11px] uppercase tracking-wider text-texto-3">{rotulo}</p>
      <p className="mt-0.5 flex items-baseline gap-2">
        <span className="font-medium tabular-nums">{fmtBRL(valor)}</span>
        <span className={cx("text-xs font-medium tabular-nums", tom)}>
          {deltaPct === null ? "sem base" : `${deltaPct >= 0 ? "▲" : "▼"} ${fmtPct(Math.abs(deltaPct))}`}
        </span>
      </p>
    </div>
  );
}

export function ComandoFaixa({
  norte,
  pulso,
  spark,
  simples = false,
}: {
  norte: NorteDoComando;
  pulso: PulsoCaixa;
  spark: Array<{ label: string; valor: number }>;
  /** Visão simples: sai a fileira de comparativos, fica só o par de ritmos. */
  simples?: boolean;
}) {
  const { janela } = norte;
  const semMeta = norte.meta === null;
  const noRitmo = norte.noRitmo === true;
  const gap = norte.gapProjetado ?? 0;

  // Recorte do período em que cada número foi apurado — repetido nas origens
  // para o dono saber exatamente QUAIS linhas entraram na conta.
  const recorte = `${fmtDate(janela.atual.inicio)} a ${fmtDate(janela.atual.fim)}`;

  // Taxa do gateway do período: é a diferença entre o que foi FATURADO e o que
  // de fato entrou como receita líquida (`resumoPeriodo` guarda os dois lados).
  // Mesma conta de `waterfallResultado`/`dreGerencial`: faturamento − líquido.
  const taxasGateway = +(norte.resumo.faturamento - norte.resumo.liquido).toFixed(2);

  // Faturamento do período anterior — é ele que sustenta o delta já exibido no
  // cartão (`comparativos[0].deltaPct`), então vira também a referência do modal.
  const faturamentoAnterior = norte.comparativos[0]?.valor ?? null;

  // frase-resposta: o Command Center existe para responder, não para descrever
  const veredito = semMeta
    ? `Sem meta de faturamento cadastrada para ${janela.rotulo} — o pace fica cego.`
    : noRitmo
      ? `No ritmo para bater a meta: projeção de ${fmtBRL(norte.projecao)} contra meta de ${fmtBRL(norte.meta!)}.`
      : `Fora do ritmo: no passo atual fecha em ${fmtBRL(norte.projecao)} e faltam ${fmtBRL(Math.abs(gap))} para a meta.`;

  return (
    <Card
      titulo={`Faixa de comando — ${janela.rotulo}`}
      acao={
        <span className="text-[11px] text-texto-3">
          dia {janela.diasDecorridos} de {janela.diasTotais} · {janela.diasRestantes} restante(s)
        </span>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_240px]">
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {/* Composição extraída de `resumoPeriodo` (src/lib/metrics-comando.ts):
                faturamento = soma de `valor` das matrículas não pendentes da janela e
                liquido = soma de `valorLiquido` das MESMAS matrículas. A diferença entre
                os dois é exatamente a taxa retida pelo gateway na venda. */}
            <Stat
              label="Faturamento do período"
              valor={fmtBRL(norte.realizado)}
              deltaPct={norte.comparativos[0]?.deltaPct ?? null}
              hint={`vs ${janela.rotuloCurto} anterior`}
              metaPct={norte.pctMeta}
              destaque
              spark={<Sparkline data={spark} />}
              formato="moeda"
              valorNumerico={norte.realizado}
              referencia={faturamentoAnterior}
              labelReferencia={`${janela.rotuloCurto} anterior`}
              composicao={{
                formula: "soma",
                partes: [
                  { rotulo: "Receita líquida das vendas (já sem a taxa do gateway)", valor: norte.resumo.liquido },
                  { rotulo: "Taxa do gateway retida na venda", valor: taxasGateway },
                ],
                nota: `Venda pendente não é faturamento: só entra matrícula paga ou reembolsada com data dentro do período. São ${fmtNum(norte.resumo.qtdVendas)} venda(s) com ticket médio de ${fmtBRLExato(norte.resumo.ticketMedio)}. Este é o valor BRUTO — o que sobra depois de comissão, despesa e reembolso está no cartão "Resultado líquido".`,
              }}
              origem={`dataset() → matrículas com status pago ou reembolsado e data entre ${recorte}, via resumoPeriodo · dataset já recortado pela lente global de braço`}
            />
            {/* Composição extraída de `paceMeta` (src/lib/metrics.ts), chamada por
                `norteDoComando`: projecao = realizado ÷ dias decorridos × dias totais —
                ou seja, o ritmo médio do período estendido até o último dia. */}
            <Stat
              label="Projeção de fechamento"
              valor={fmtBRL(norte.projecao)}
              hint={semMeta ? "no ritmo atual" : noRitmo ? "acima da meta" : `gap de ${fmtBRL(Math.abs(gap))}`}
              ouro={noRitmo}
              formato="moeda"
              valorNumerico={norte.projecao}
              referencia={norte.meta}
              labelReferencia="meta do período"
              composicao={{
                formula: "multiplicacao",
                partes: [
                  { rotulo: "Ritmo médio realizado por dia até agora", valor: norte.ritmoAtual },
                  { rotulo: "Dias totais do período", valor: janela.diasTotais, formato: "numero" },
                ],
                nota: `${fmtBRLExato(norte.realizado)} faturados em ${janela.diasDecorridos} dia(s) decorrido(s), estendidos aos ${janela.diasTotais} dia(s) do período. Projeção LINEAR: não conhece sazonalidade, feriado nem campanha marcada para os dias que faltam. O ritmo por dia aparece arredondado ao centavo, então o produto das duas linhas pode diferir da projeção em alguns centavos.`,
              }}
              origem={`resumoPeriodo + paceMeta (src/lib/metrics.ts), via norteDoComando · período de ${recorte}, dia ${janela.diasDecorridos} de ${janela.diasTotais} · dataset já recortado pela lente global de braço`}
            />
            {/* Composição extraída de `resumoPeriodo` (src/lib/metrics-comando.ts):
                lucro = liquido − custoTotal, com
                custoTotal = comissoes + despesasFixas + despesasVariaveis + reembolsos.
                A variação sai de `referencia` (lucro do período anterior). */}
            <Stat
              label="Resultado líquido"
              valor={fmtBRL(norte.resumo.lucro)}
              hint={`margem de ${fmtPct(norte.resumo.margem)}`}
              formato="moeda"
              valorNumerico={norte.resumo.lucro}
              referencia={norte.resumoAnterior.lucro}
              labelReferencia={`${janela.rotuloCurto} anterior`}
              composicao={{
                formula: "subtracao",
                partes: [
                  { rotulo: "Receita líquida das vendas (já sem a taxa do gateway)", valor: norte.resumo.liquido },
                  { rotulo: "Comissões da rede", valor: norte.resumo.comissoes },
                  { rotulo: "Despesas fixas", valor: norte.resumo.despesasFixas },
                  { rotulo: "Despesas variáveis", valor: norte.resumo.despesasVariaveis },
                  { rotulo: "Reembolsos", valor: norte.resumo.reembolsos },
                ],
                nota: `Venda pendente não é receita: só matrícula paga ou reembolsada entra na conta. A margem de ${fmtPct(norte.resumo.margem)} é sobre o faturamento bruto do período, não sobre a receita líquida.`,
              }}
              origem={`dataset() → matrículas, comissões, despesas e reembolsos com data entre ${fmtDate(janela.atual.inicio)} e ${fmtDate(janela.atual.fim)}, via resumoPeriodo · dataset já recortado pela lente global de braço`}
            />
            {/* `saldoCaixaAte` (src/lib/metrics.ts) não devolve as pontas da conta —
                só o saldo consolidado —, então a composição vai na forma STRING:
                inventar entradas e saídas aqui seria descrever uma conta que não
                foi feita. A referência é a reserva mínima parametrizada, que é a
                base real contra a qual `abaixoDaReserva` compara este saldo. */}
            <Stat
              label="Caixa hoje"
              valor={fmtBRL(pulso.saldoHoje)}
              hint={
                pulso.runway.meses === null
                  ? "operação se paga"
                  : `${pulso.runway.meses.toFixed(1)} meses de runway`
              }
              href="/financeiro"
              formato="moeda"
              valorNumerico={pulso.saldoHoje}
              referencia={pulso.reservaMinima}
              labelReferencia="reserva mínima de caixa"
              composicao={`${fmtBRLExato(pulso.saldoHoje)} = saldo inicial parametrizado + tudo que entrou − tudo que saiu, contando só movimento com status realizado e data de caixa até hoje. ${
                pulso.runway.meses === null
                  ? "No burn dos últimos 3 meses a operação se paga: não há data de esgotamento projetada."
                  : `No burn médio de ${fmtBRLExato(pulso.runway.burnMedio)}/mês dos últimos 3 meses, esse saldo dá ${pulso.runway.meses.toFixed(1)} meses de runway.`
              }`}
              origem="datasetCaixa().movimentos com status realizado, via saldoCaixaAte · saldo consolidado de todas as contas, SEM recorte por braço (o extrato bancário é um só); só o burn do runway respeita a lente"
            />
          </div>

          {/* ritmo exigido × ritmo atual — o coração do pace.
              Na visão simples param aqui: os dois comparativos que vinham em
              seguida repetiam o mesmo número que a pílula de variação do cartão
              de faturamento já mostra, um do lado do outro. Repetição é
              exatamente o que faz a tela parecer cheia sem dizer mais nada. */}
          <div className={cx("grid gap-3", simples ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-4")}>
            <div className="rounded-xl bg-poco px-3.5 py-2.5">
              <p className="text-[11px] uppercase tracking-wider text-texto-3">Ritmo atual</p>
              <p className="mt-0.5 font-medium tabular-nums">{fmtBRL(norte.ritmoAtual)}/dia</p>
            </div>
            <div className="rounded-xl bg-poco px-3.5 py-2.5">
              <p className="text-[11px] uppercase tracking-wider text-texto-3">Ritmo necessário</p>
              <p
                className={cx(
                  "mt-0.5 font-medium tabular-nums",
                  !semMeta && norte.ritmoNecessario > norte.ritmoAtual ? "text-negativo" : "text-positivo"
                )}
              >
                {semMeta ? "—" : `${fmtBRL(norte.ritmoNecessario)}/dia`}
              </p>
            </div>
            {!simples &&
              norte.comparativos.map((c) => (
                <Comparativo key={c.rotulo} rotulo={c.rotulo} valor={c.valor} deltaPct={c.deltaPct} />
              ))}
          </div>

          <p className={cx("text-xs", noRitmo || semMeta ? "text-texto-2" : "text-negativo")}>{veredito}</p>
          {!simples && norte.metaProrrateada && (
            <p className="text-[11px] text-texto-3">
              Metas são cadastradas por mês: para esta janela a meta foi rateada por dia
              ({fmtBRL(norte.meta ?? 0)} equivalentes a {janela.diasTotais} dia(s)).
            </p>
          )}
        </div>

        <div className="flex flex-col justify-center rounded-2xl border border-borda-sutil bg-painel-2 p-4">
          <p className="text-center text-[11px] uppercase tracking-wider text-texto-3">
            Meta do período
          </p>
          {semMeta ? (
            <p className="py-10 text-center text-xs text-texto-3">Sem meta cadastrada.</p>
          ) : (
            <>
              <GraficoGaugeMeta valor={norte.realizado} meta={norte.meta!} altura={160} />
              {/* O rótulo do gauge é desenhado DENTRO do SVG; sem esta folga a
                  frase de baixo subia por cima do arco. */}
              <p className="mt-3 text-center text-xs leading-snug text-texto-2">
                {fmtPct(norte.pctMeta ?? 0)} da meta com {fmtPct(norte.pace?.pctTempo ?? 0)} do tempo
              </p>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}
