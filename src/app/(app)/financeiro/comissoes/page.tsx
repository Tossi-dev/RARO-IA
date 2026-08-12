// /financeiro/comissoes — Comissões de afiliados a pagar (SPEC-P1 B.2.9).
// Pergunta: "quanto devo para a rede hoje e quem já está atrasado?"
// A dívida é CAIXA (vencimento do repasse); o peso na margem é COMPETÊNCIA.

import { GraficoBarrasH, GraficoBarrasSerie } from "@/components/charts";
import { Alerta, NotaRegra, SeloRegime, Sinal } from "@/components/fin-ui";
import { OrigemDado } from "@/components/origem-dado";
import { Badge, Card, PageHeader, Stat, Tabela, Td, Th, Vazio, cx } from "@/components/ui";
import { getDB } from "@/lib/data";
import type { Composicao } from "@/lib/composicao";
import { rotularAgrupamento } from "@/lib/agrupamentos";
import { corDoAgrupamento } from "@/lib/cores";
import { fmtBRL, fmtBRLExato, fmtDate, fmtNum, fmtPct, ymLabel } from "@/lib/format";
import { comissaoPctReceita, comissoesAPagar, rankingAfiliadosMargem } from "@/lib/metrics";
import { contextoCaixa } from "../filtro";

export const dynamic = "force-dynamic";

export default async function Comissoes() {
  const db = getDB();
  const [ds, dc, afiliados, produtos, agrupamentos] = await Promise.all([
    db.dataset(),
    db.datasetCaixa(),
    db.listAfiliados(),
    db.listProdutos(),
    db.listAgrupamentos(),
  ]);
  const ctx = contextoCaixa(ds.matriculas, produtos);

  // Comissão a pagar não tem produto no cadastro (Pagavel.origemId aqui é o id
  // da comissão, não o da venda) — a lente de fonte não consegue recortar esta
  // conta, igual decidido em /financeiro/capital-de-giro. Fica sempre consolidada.
  const cap = comissoesAPagar(dc, afiliados, ctx.ref, {});
  const noTempo = comissaoPctReceita(ds, 12, ctx.ref);
  const ranking = rankingAfiliadosMargem(ds, afiliados, ctx.periodo);

  const pagaveisComissao = dc.pagaveis
    .filter((p) => p.categoria === "comissoes" && p.status !== "pago")
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento));

  const mesAtual = noTempo[noTempo.length - 1];
  const mesAnterior = noTempo[noTempo.length - 2] ?? null;
  const deltaPeso = mesAnterior && mesAnterior.pct > 0 ? +(mesAtual.pct - mesAnterior.pct).toFixed(2) : null;

  // ---- memórias de cálculo dos KPIs (skills `dashboard-mc` / `diagnostico-comercial`) ----
  // `comissoesAPagar` (src/lib/metrics.ts:1399) soma os pagáveis de categoria
  // "comissões" ainda não pagos, agrupa por afiliado e separa o que já venceu
  // (vencimento < hoje) do que ainda vai vencer. Total = vencido + a vencer.
  const credoresVencidos = cap.porAfiliado.filter((a) => a.vencido > 0);
  const credoresEmDia = cap.porAfiliado.length - credoresVencidos.length;
  const origemAberto = "datasetCaixa().pagaveis, via comissoesAPagar · categoria comissões com status diferente de pago · consolidado, sem filtro de fonte · carteira inteira, sem recorte de período";

  // O vencido abre por credor quando há mais de um; com um só (ou nenhum) não
  // existe conta de duas partes — e aí a origem é dita em texto, sem inventar soma.
  const composicaoVencido: Composicao =
    credoresVencidos.length >= 2
      ? {
          formula: "soma",
          partes: credoresVencidos.map((a) => ({
            rotulo: `${a.nome} — repasses já vencidos`,
            valor: a.vencido,
          })),
          origem: origemAberto,
          nota: "Só entram os repasses cujo vencimento já passou. Comissão vencida e não paga é o jeito mais rápido de perder um afiliado — aqui, cair é bom.",
        }
      : credoresVencidos.length === 1
        ? `${fmtBRLExato(cap.vencido)} — todo o atraso está com um único credor: ${credoresVencidos[0].nome}. Soma dos repasses de comissão dele cujo vencimento já passou. Origem: ${origemAberto}.`
        : `Nenhum repasse de comissão passou do vencimento. Origem: ${origemAberto}.`;

  return (
    <div className="space-y-5">
      <PageHeader titulo="Comissões de afiliados" sub={`Posição em ${fmtDate(ctx.hoje)}`} />
      <SeloRegime regime="misto" />

      {cap.vencido > 0 ? (
        <Alerta tom="critico" titulo={`${fmtBRL(cap.vencido)} em comissões VENCIDAS e não repassadas`}>
          Afiliado esperando repasse para de vender. Vencidos:{" "}
          {cap.porAfiliado
            .filter((a) => a.vencido > 0)
            .map((a) => `${a.nome} (${fmtBRL(a.vencido)})`)
            .join(", ")}
          .
        </Alerta>
      ) : cap.total > 0 ? (
        <Alerta tom="ok" titulo="Nenhuma comissão vencida">
          {fmtBRL(cap.aVencer)} a vencer para {cap.porAfiliado.length} afiliado(s).
        </Alerta>
      ) : (
        <Alerta tom="info" titulo="Nenhuma comissão em aberto">
          Toda a rede está quitada nesta lente.
        </Alerta>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Stat
          label="Total a pagar"
          valor={fmtBRLExato(cap.total)}
          hint="comissões em aberto"
          destaque
          invertida
          formato="moeda"
          valorNumerico={cap.total}
          composicao={{
            formula: "soma",
            partes: [
              { rotulo: "Repasses com vencimento já passado", valor: cap.vencido },
              { rotulo: "Repasses que ainda vão vencer", valor: cap.aVencer },
            ],
            origem: origemAberto,
            nota: `Dívida com a rede, em regime de CAIXA (data do repasse). Não é o custo de comissão do mês — esse é competência e aparece no "peso na receita" ao lado. A carteira ignora o filtro de dias: repasse que vence em três meses continua sendo dívida.`,
          }}
        />
        <Stat
          label="Já vencido"
          valor={fmtBRLExato(cap.vencido)}
          hint="atraso com a rede"
          invertida
          formato="moeda"
          valorNumerico={cap.vencido}
          composicao={composicaoVencido}
        />
        <Stat
          label="A vencer"
          valor={fmtBRLExato(cap.aVencer)}
          hint="compromisso futuro"
          formato="moeda"
          valorNumerico={cap.aVencer}
          composicao={{
            formula: "subtracao",
            partes: [
              { rotulo: "Total de comissões em aberto", valor: cap.total },
              { rotulo: "Parte que já venceu", valor: cap.vencido },
            ],
            origem: origemAberto,
            nota: "Compromisso ainda dentro do prazo: é o que dá para planejar. Não está atrasado, mas já está prometido — não conte esse dinheiro como sobra de caixa.",
          }}
        />
        <Stat
          label="Afiliados credores"
          valor={fmtNum(cap.porAfiliado.length)}
          hint="com saldo em aberto"
          formato="numero"
          valorNumerico={cap.porAfiliado.length}
          composicao={{
            formula: "soma",
            partes: [
              { rotulo: "Afiliados com pelo menos um repasse vencido", valor: credoresVencidos.length },
              { rotulo: "Afiliados só com repasse a vencer", valor: credoresEmDia },
            ],
            origem: origemAberto,
            nota: "Um credor por nome de fornecedor do título: quando o nome não bate com nenhum afiliado cadastrado, ele ainda assim conta como credor — dívida existe mesmo sem cadastro.",
          }}
        />
        {/* `comissaoPctReceita` (src/lib/metrics.ts:1973) → `mesFinanceiro`:
            pct = comissões do mês ÷ faturamento do mês × 100, em COMPETÊNCIA. */}
        <Stat
          label="Peso na receita"
          valor={fmtPct(mesAtual?.pct ?? 0)}
          deltaPct={deltaPeso}
          hint={`comissão ÷ receita de ${ymLabel(mesAtual?.periodo ?? "")}`}
          invertida
          formato="percentual"
          valorNumerico={mesAtual?.pct ?? 0}
          referencia={mesAnterior && mesAnterior.pct > 0 ? mesAnterior.pct : null}
          labelReferencia={mesAnterior ? ymLabel(mesAnterior.periodo) : undefined}
          composicao={{
            formula: "divisao",
            partes: [
              {
                rotulo: `Comissões geradas em ${ymLabel(mesAtual?.periodo ?? "")}`,
                valor: mesAtual?.comissoes ?? 0,
                formato: "moeda",
              },
              {
                rotulo: `Receita bruta faturada em ${ymLabel(mesAtual?.periodo ?? "")}`,
                valor: mesAtual?.receita ?? 0,
                formato: "moeda",
              },
            ],
            origem: `dataset() (comissões e matrículas com data no mês ${mesAtual?.periodo ?? "—"}), via comissaoPctReceita → mesFinanceiro · regime de competência · consolidado, sem filtro de fonte`,
            nota: "O resultado da divisão é multiplicado por 100 para virar percentual. Regime de COMPETÊNCIA: é a comissão gerada pelas vendas do mês, não o repasse que saiu do caixa. A variação ao lado está em pontos percentuais, não em variação relativa. Esta conta é consolidada — a lente de fonte não é aplicada aqui.",
          }}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card titulo="Quanto devo para cada afiliado">
          {cap.porAfiliado.length ? (
            <>
              <GraficoBarrasH data={cap.porAfiliado.map((a) => ({ nome: a.nome, valor: a.total }))} />
              <Tabela className="mt-2">
                <thead>
                  <tr>
                    <Th>Afiliado</Th>
                    <Th num>Títulos</Th>
                    <Th num>Vencido</Th>
                    <Th num>A vencer</Th>
                    <Th num>Total</Th>
                  </tr>
                </thead>
                <tbody>
                  {cap.porAfiliado.map((a) => (
                    <tr key={a.nome} className={cx(a.vencido > 0 && "bg-negativo/5")}>
                      <Td>{a.nome}</Td>
                      <Td num className="text-texto-2">
                        {fmtNum(a.qtd)}
                      </Td>
                      <Td num className={cx(a.vencido > 0 && "text-negativo")}>
                        {a.vencido ? fmtBRLExato(a.vencido) : "—"}
                      </Td>
                      <Td num>{a.aVencer ? fmtBRLExato(a.aVencer) : "—"}</Td>
                      <Td num className="font-medium">
                        {fmtBRLExato(a.total)}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Tabela>
            </>
          ) : (
            <Vazio>Nenhuma comissão em aberto.</Vazio>
          )}
          <OrigemDado
            abas={["VENDAS", "RESPONSAVEIS"]}
            calculo="Comissão de cada venda do período, agrupada por responsável e separada entre vencida e a vencer"
            vazio={!cap.porAfiliado.length}
          />
        </Card>

        <Card titulo="Peso da comissão sobre a receita — 12 meses">
          <GraficoBarrasSerie
            data={noTempo.map((p) => ({ label: ymLabel(p.periodo), valor: p.pct }))}
            ehPct
          />
          <NotaRegra>
            Percentual subindo com receita estável significa que a rede está ficando mais cara por
            real vendido — hora de revisar o plano de comissionamento, não de cortar afiliado.
          </NotaRegra>
          <OrigemDado
            abas={["VENDAS"]}
            calculo="Soma de Comissao ÷ soma de Valor da venda, mês a mês"
            vazio={!noTempo.some((p) => p.pct > 0)}
          />
        </Card>
      </div>

      <Card titulo={`Repasses em aberto (${pagaveisComissao.length})`}>
        {pagaveisComissao.length ? (
          <Tabela>
            <thead>
              <tr>
                <Th>Vencimento</Th>
                <Th>Afiliado</Th>
                <Th>Referência</Th>
                <Th num>Valor</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {pagaveisComissao.slice(0, 50).map((p) => {
                const vencido = p.vencimento < ctx.hoje;
                return (
                  <tr key={p.id} className={cx(vencido && "bg-negativo/5")}>
                    <Td>{fmtDate(p.vencimento)}</Td>
                    <Td>{p.fornecedor}</Td>
                    <Td className="text-texto-2">{p.descricao}</Td>
                    <Td num>{fmtBRLExato(p.valor)}</Td>
                    <Td>
                      <Badge tom={vencido ? "vermelho" : "cinza"}>{vencido ? "Vencido" : "A vencer"}</Badge>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Tabela>
        ) : (
          <Vazio>Nenhum repasse pendente.</Vazio>
        )}
        {pagaveisComissao.length > 50 ? (
          <NotaRegra>Mostrando os 50 vencimentos mais próximos de {pagaveisComissao.length}.</NotaRegra>
        ) : null}
        <OrigemDado
          abas={["MOVIMENTOS", "RESPONSAVEIS"]}
          calculo="Movimentos de saída da categoria comissão ainda com status em aberto, ordenados por vencimento"
          vazio={!pagaveisComissao.length}
        />
      </Card>

      <Card titulo={`Ranking por margem líquida gerada — ${ctx.rotuloPeriodo}`}>
        {ranking.length ? (
          <Tabela>
            <thead>
              <tr>
                <Th>Afiliado</Th>
                <Th>Agrupamento</Th>
                <Th num>Vendas</Th>
                <Th num>Receita</Th>
                <Th num>Comissão</Th>
                <Th num>Reembolso</Th>
                <Th num>Margem líquida</Th>
                <Th num>Margem %</Th>
              </tr>
            </thead>
            <tbody>
              {ranking.map((a) => (
                <tr key={a.afiliadoId}>
                  <Td>{a.nome}</Td>
                  <Td>
                    {a.braco ? (
                      <span className="inline-flex items-center gap-1.5 text-xs">
                        <span
                          aria-hidden
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ background: corDoAgrupamento(a.braco, agrupamentos) }}
                        />
                        {rotularAgrupamento(a.braco, agrupamentos)}
                      </span>
                    ) : (
                      <span className="text-texto-3">—</span>
                    )}
                  </Td>
                  <Td num>{fmtNum(a.qtdVendas)}</Td>
                  <Td num>{fmtBRL(a.receita)}</Td>
                  <Td num className="text-negativo">
                    ({fmtBRL(a.comissoes)})
                  </Td>
                  <Td num className={cx(a.reembolsos > 0 && "text-negativo")}>
                    {a.reembolsos ? `(${fmtBRL(a.reembolsos)})` : "—"}
                  </Td>
                  <Td num className="font-medium">
                    <Sinal valor={a.margemLiquida} texto={fmtBRLExato(a.margemLiquida)} />
                  </Td>
                  <Td num>{fmtPct(a.margemPct)}</Td>
                </tr>
              ))}
            </tbody>
          </Tabela>
        ) : (
          <Vazio>Nenhuma venda de afiliado no período.</Vazio>
        )}
        <NotaRegra>
          Ordenado por margem líquida (receita − comissão − reembolso), não por faturamento: volume
          alto com reembolso alto e comissão gorda pode render menos que um afiliado pequeno e limpo.
        </NotaRegra>
        <OrigemDado
          abas={["VENDAS", "RESPONSAVEIS"]}
          calculo="Receita − comissão − reembolso por responsável, recalculado linha a linha de VENDAS"
          vazio={!ranking.length}
        />
      </Card>
    </div>
  );
}
