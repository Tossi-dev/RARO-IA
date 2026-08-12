// /financeiro/capital-de-giro — Contas a receber e a pagar (SPEC-P1 B.2.6).
// Pergunta: "quanto tenho a receber, quanto devo e quando cada um cai?"
// REGIME DE CAIXA: carteira em aberto, não faturamento.

import { GraficoBarrasH } from "@/components/charts";
import { Alerta, NotaRegra, SeloRegime, Sinal } from "@/components/fin-ui";
import { OrigemDado } from "@/components/origem-dado";
import { Badge, Card, PageHeader, Stat, Tabela, Td, Th, Vazio, cx } from "@/components/ui";
import { getDB } from "@/lib/data";
import { CATEGORIA_CAIXA_LABEL, STATUS_PAGAVEL_LABEL, STATUS_RECEBIVEL_LABEL } from "@/lib/domain";
import { fmtBRL, fmtBRLExato, fmtDate, fmtNum, fmtPct } from "@/lib/format";
import {
  agingPagaveis,
  agingRecebiveis,
  filtrarPagaveis,
  filtrarRecebiveis,
  posicaoCapitalDeGiro,
  prazoMedioRecebimento,
  saldoRetidoPorGateway,
} from "@/lib/metrics";
import { contextoCaixa } from "../filtro";

export const dynamic = "force-dynamic";

const GATEWAY_LABEL: Record<string, string> = {
  hotmart: "Hotmart",
  kiwify: "Kiwify",
  eduzz: "Eduzz",
  stripe: "Stripe",
  manual: "Manual / Pix",
};

export default async function CapitalDeGiro() {
  const db = getDB();
  const [dc, ds, produtos] = await Promise.all([db.datasetCaixa(), db.dataset(), db.listProdutos()]);
  const ctx = contextoCaixa(ds.matriculas, produtos);

  // A carteira em aberto usa a LENTE (só fonte), nunca o range de dias:
  // uma parcela que vence em novembro não deixa de ser dívida porque o
  // filtro global está em 30 dias.
  const cg = posicaoCapitalDeGiro(dc, ctx.ref, ctx.lente);
  const agingRec = agingRecebiveis(dc, ctx.ref, ctx.lente);
  const agingPag = agingPagaveis(dc, ctx.ref, ctx.lente);
  const gateways = saldoRetidoPorGateway(dc, ctx.lente);
  const dso = prazoMedioRecebimento(dc, ctx.lente);

  // ---- memórias de cálculo dos KPIs (skills `dashboard-mc` / `diagnostico-comercial`) ----
  // Cada bloco abaixo reproduz a conta REAL da função de origem. Onde a função
  // ignora algum filtro, a ressalva honesta vai na `nota` da composição.
  const duasCasas = (v: number) => +v.toFixed(2);

  // `saldoCaixaAte` (src/lib/metrics.ts:957), usada por `posicaoCapitalDeGiro`:
  // saldo inicial parametrizado + tudo que entrou − tudo que saiu, SÓ com status
  // realizado, até hoje. Essa função NÃO aplica lente de fonte — daí a nota.
  const movsRealizados = dc.movimentos.filter(
    (m) => m.status === "realizado" && m.dataCaixa <= ctx.hoje
  );
  const entradasAcumuladas = movsRealizados
    .filter((m) => m.direcao === "entrada")
    .reduce((s, m) => s + m.valor, 0);
  const saidasAcumuladas = movsRealizados
    .filter((m) => m.direcao === "saida")
    .reduce((s, m) => s + m.valor, 0);

  // `posicaoCapitalDeGiro` (src/lib/metrics.ts:1354) devolve o total em aberto e
  // a fatia já vencida; o que ainda vai vencer é a diferença entre os dois.
  const aReceberAVencer = duasCasas(cg.aReceber - cg.aReceberVencido);
  const aPagarAVencer = duasCasas(cg.aPagar - cg.aPagarVencido);

  // `prazoMedioRecebimento` (src/lib/metrics.ts:1938): média do prazo D+X do
  // gateway PONDERADA pelo valor de cada parcela, sobre a carteira inteira da
  // fonte (recebida ou não) — mesmo recorte da função (`vendaBate`, sem período).
  const carteiraDaFonte = dc.recebiveis.filter(
    (r) => !ctx.lente.vendasIds || (!!r.origemId && ctx.lente.vendasIds.has(r.origemId))
  );
  const valorDaCarteira = carteiraDaFonte.reduce((s, r) => s + r.valor, 0);
  const diasPonderadosPorValor = carteiraDaFonte.reduce((s, r) => s + r.diasLiberacao * r.valor, 0);

  const recebiveis = filtrarRecebiveis(dc.recebiveis, ctx.lente)
    .filter((r) => r.status !== "recebido")
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento));
  const pagaveis = filtrarPagaveis(dc.pagaveis, ctx.lente)
    .filter((p) => p.status !== "pago")
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento));

  return (
    <div className="space-y-5">
      <PageHeader
        titulo="Capital de giro"
        sub={`Carteira em aberto em ${fmtDate(ctx.hoje)} · ${ctx.rotuloFonte}`}
      />
      <SeloRegime regime="caixa" />

      {cg.saldoDescoberto ? (
        <Alerta tom="critico" titulo="Compromissos maiores que os recursos de curto prazo">
          Capital de giro de {fmtBRLExato(cg.capitalDeGiro)}: mesmo recebendo tudo o que está em
          aberto, falta dinheiro para honrar as contas.
        </Alerta>
      ) : cg.aReceberVencido > 0 ? (
        <Alerta tom="atencao" titulo={`${fmtBRL(cg.aReceberVencido)} já venceram e não entraram`}>
          Dinheiro vencido não cobra sozinho. É a fila mais rápida de recompor caixa antes de
          antecipar recebível com desconto.
        </Alerta>
      ) : (
        <Alerta tom="ok" titulo="Nenhum recebível vencido em aberto">
          Capital de giro de {fmtBRLExato(cg.capitalDeGiro)}.
        </Alerta>
      )}
      {cg.aPagarVencido > 0 ? (
        <Alerta tom="atencao" titulo={`${fmtBRL(cg.aPagarVencido)} em contas vencidas`}>
          Fornecedor e afiliado esperando é o jeito mais barato de perder confiança da rede.
        </Alerta>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <Stat
          label="Caixa hoje"
          valor={fmtBRLExato(cg.caixa)}
          hint="saldo realizado"
          destaque
          formato="moeda"
          valorNumerico={cg.caixa}
          composicao={{
            formula: "soma",
            partes: [
              { rotulo: "Saldo inicial cadastrado das contas", valor: dc.parametros.saldoInicialCaixa },
              { rotulo: `Tudo que entrou até ${fmtDate(ctx.hoje)}`, valor: entradasAcumuladas },
              { rotulo: `Tudo que saiu até ${fmtDate(ctx.hoje)}`, valor: -saidasAcumuladas },
            ],
            origem: `datasetCaixa().movimentos, via saldoCaixaAte · lançamentos com status realizado e data de caixa até ${fmtDate(ctx.hoje)}`,
            nota: "O saldo em caixa é sempre consolidado: essa conta não aplica a lente de fonte, porque conta bancária é uma só. Movimento com status previsto (D+X do gateway, boleto a vencer) fica de fora — dinheiro projetado não paga boleto.",
          }}
        />
        <Stat
          label="A receber"
          valor={fmtBRL(cg.aReceber)}
          hint={`${fmtBRL(cg.aReceberVencido)} vencido`}
          formato="moeda"
          valorNumerico={cg.aReceber}
          composicao={{
            formula: "soma",
            partes: [
              { rotulo: `Parcelas vencidas até ${fmtDate(ctx.hoje)} e não recebidas`, valor: cg.aReceberVencido },
              { rotulo: "Parcelas que ainda vão vencer", valor: aReceberAVencer },
            ],
            origem: `datasetCaixa().recebiveis, via posicaoCapitalDeGiro · parcelas com status diferente de recebido · ${ctx.rotuloFonte} · carteira inteira, sem recorte de período`,
            nota: "Carteira em aberto ignora o filtro de dias de propósito: parcela que vence daqui a seis meses continua sendo dinheiro seu. Isto é expectativa de entrada, não caixa — só vira caixa quando a parcela é liquidada.",
          }}
        />
        <Stat
          label="A pagar"
          valor={fmtBRL(cg.aPagar)}
          hint={`${fmtBRL(cg.aPagarVencido)} vencido`}
          invertida
          formato="moeda"
          valorNumerico={cg.aPagar}
          composicao={{
            formula: "soma",
            partes: [
              { rotulo: `Contas vencidas até ${fmtDate(ctx.hoje)} e não pagas`, valor: cg.aPagarVencido },
              { rotulo: "Contas que ainda vão vencer", valor: aPagarAVencer },
            ],
            origem: `datasetCaixa().pagaveis, via posicaoCapitalDeGiro · títulos com status diferente de pago · consolidado, sem filtro de fonte · carteira inteira, sem recorte de período`,
            nota: "Dívida é sempre melhor menor: aqui a queda é que é notícia boa. Ao contrário dos recebíveis, a conta a pagar não é recortada nem por venda nem pela fonte selecionada — imposto, aluguel e comissão não têm produto no cadastro.",
          }}
        />
        <Stat
          label="Capital de giro"
          valor={fmtBRLExato(cg.capitalDeGiro)}
          hint="caixa + receber − pagar"
          formato="moeda"
          valorNumerico={cg.capitalDeGiro}
          composicao={{
            formula: "soma",
            partes: [
              { rotulo: "Caixa realizado hoje", valor: cg.caixa },
              { rotulo: "Carteira a receber em aberto", valor: cg.aReceber },
              { rotulo: "Compromissos a pagar em aberto", valor: -cg.aPagar },
            ],
            origem: `datasetCaixa() (movimentos, recebíveis e pagáveis), via posicaoCapitalDeGiro · posição em ${fmtDate(ctx.hoje)}`,
            nota: `É um cenário de liquidação: assume que TUDO o que está a receber entra e que TUDO o que está a pagar sai, sem olhar quando cada um cai. Sobra positiva aqui não garante caixa no dia do boleto — para isso o que vale é o aging.${ctx.fonte === "todos" ? "" : ` Só a carteira a receber respeita a fonte selecionada (${ctx.rotuloFonte}); caixa e contas a pagar continuam consolidados, porque não têm produto no cadastro.`}`,
          }}
        />
        <Stat
          label="Índice de liquidez"
          valor={cg.indiceLiquidez === null ? "—" : cg.indiceLiquidez.toFixed(2)}
          hint="recursos ÷ compromissos"
          formato="numero"
          composicao={
            cg.indiceLiquidez === null
              ? "Sem índice: não há nenhuma conta a pagar em aberto nesta lente, e divisão por zero não é resposta. Recursos de curto prazo hoje: " +
                fmtBRLExato(cg.caixa + cg.aReceber) +
                "."
              : {
                  formula: "divisao",
                  partes: [
                    {
                      rotulo: "Recursos de curto prazo (caixa + carteira a receber)",
                      valor: duasCasas(cg.caixa + cg.aReceber),
                      formato: "moeda",
                    },
                    { rotulo: "Compromissos em aberto", valor: cg.aPagar, formato: "moeda" },
                  ],
                  origem: `datasetCaixa() (movimentos, recebíveis e pagáveis), via posicaoCapitalDeGiro · posição em ${fmtDate(ctx.hoje)}`,
                  nota: `Quantos reais de recurso existem para cada real devido. Abaixo de 1,00 é o mesmo alerta do capital de giro negativo, só que em forma de razão.${ctx.fonte === "todos" ? "" : ` Só a carteira a receber respeita a fonte selecionada (${ctx.rotuloFonte}); caixa e contas a pagar continuam consolidados.`}`,
                }
          }
        />
        <Stat
          label="Prazo médio de recebimento"
          valor={`${fmtNum(Math.round(dso.diasMedioLiberacao))} dias`}
          hint={`realizado: ${fmtNum(Math.round(dso.diasMedioRealizado))}d · base ${dso.qtdBase}`}
          invertida
          formato="numero"
          composicao={{
            formula: "divisao",
            partes: [
              {
                rotulo: "Prazo do gateway multiplicado pelo valor de cada parcela, somado",
                valor: duasCasas(diasPonderadosPorValor),
              },
              {
                rotulo: "Valor total da carteira de recebíveis",
                valor: duasCasas(valorDaCarteira),
                formato: "moeda",
              },
            ],
            origem: `datasetCaixa().recebiveis, via prazoMedioRecebimento · carteira inteira da fonte (${ctx.rotuloFonte}), recebida ou não · sem recorte de período`,
            nota: `Este é o prazo CONTRATADO com o gateway, ponderado por valor: parcela grande pesa mais que parcela pequena. O prazo realizado — ${fmtNum(Math.round(dso.diasMedioRealizado))} dias sobre ${fmtNum(dso.qtdBase)} parcela(s) já recebidas — é o ciclo de verdade, e é ele que aparece no rodapé do cartão. Esperar menos é sempre melhor.`,
          }}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card titulo="Aging — contas a receber">
          <GraficoBarrasH data={agingRec.map((f) => ({ nome: f.faixa, valor: f.valor }))} />
          <Tabela className="mt-2">
            <thead>
              <tr>
                <Th>Faixa</Th>
                <Th num>Valor</Th>
                <Th num>Títulos</Th>
              </tr>
            </thead>
            <tbody>
              {agingRec.map((f) => (
                <tr key={f.faixa} className={cx(f.faixa !== "A vencer" && f.valor > 0 && "bg-negativo/5")}>
                  <Td>{f.faixa}</Td>
                  <Td num>{fmtBRLExato(f.valor)}</Td>
                  <Td num className="text-texto-2">
                    {fmtNum(f.qtd)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Tabela>
          <NotaRegra>Quanto mais à direita a faixa, menor a chance de o dinheiro entrar sem esforço de cobrança.</NotaRegra>
          <OrigemDado
            abas={["RECEBIVEIS", "COBRANCAS"]}
            calculo="Títulos em aberto agrupados pelos dias entre o vencimento e hoje"
            vazio={!agingRec.some((f) => f.valor > 0)}
          />
        </Card>

        <Card titulo="Aging — contas a pagar">
          <GraficoBarrasH data={agingPag.map((f) => ({ nome: f.faixa, valor: f.valor }))} />
          <Tabela className="mt-2">
            <thead>
              <tr>
                <Th>Faixa</Th>
                <Th num>Valor</Th>
                <Th num>Títulos</Th>
              </tr>
            </thead>
            <tbody>
              {agingPag.map((f) => (
                <tr key={f.faixa} className={cx(f.faixa !== "A vencer" && f.valor > 0 && "bg-aviso/5")}>
                  <Td>{f.faixa}</Td>
                  <Td num>{fmtBRLExato(f.valor)}</Td>
                  <Td num className="text-texto-2">
                    {fmtNum(f.qtd)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Tabela>
          <OrigemDado
            abas={["DESPESAS", "DESPESAS_RECORRENTES"]}
            calculo="Contas em aberto agrupadas pelos dias entre o vencimento e hoje"
            vazio={!agingPag.some((f) => f.valor > 0)}
          />
        </Card>
      </div>

      <Card titulo="Dinheiro vendido e ainda não liberado">
        {gateways.length ? (
          <Tabela>
            <thead>
              <tr>
                <Th>Gateway</Th>
                <Th num>Valor preso</Th>
                <Th num>Parcelas</Th>
                <Th>Próxima liberação</Th>
              </tr>
            </thead>
            <tbody>
              {gateways.map((g) => (
                <tr key={g.gateway}>
                  <Td>{GATEWAY_LABEL[g.gateway] ?? g.gateway}</Td>
                  <Td num>{fmtBRLExato(g.valor)}</Td>
                  <Td num className="text-texto-2">
                    {fmtNum(g.qtd)}
                  </Td>
                  <Td>{fmtDate(g.proximaLiberacao)}</Td>
                </tr>
              ))}
            </tbody>
          </Tabela>
        ) : (
          <Vazio>Nada retido — no Pix o dinheiro cai na hora, então só sobra aqui o que for parcelado.</Vazio>
        )}
        <NotaRegra>
          Esse dinheiro já é seu em competência, mas ainda não é seu em caixa. É exatamente a
          diferença que faz o DRE parecer melhor que o extrato.
        </NotaRegra>
        <OrigemDado
          abas={["RECEBIVEIS", "VENDAS"]}
          calculo="Parcelas ainda não recebidas, agrupadas pela forma de pagamento que segura o dinheiro"
          vazio={!gateways.length}
        />
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card titulo={`Contas a receber em aberto (${recebiveis.length})`}>
          {recebiveis.length ? (
            <Tabela>
              <thead>
                <tr>
                  <Th>Vencimento</Th>
                  <Th>Descrição</Th>
                  <Th>Parcela</Th>
                  <Th num>Valor</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {recebiveis.slice(0, 40).map((r) => (
                  <tr key={r.id} className={cx(r.status === "atrasado" && "bg-negativo/5")}>
                    <Td>{fmtDate(r.vencimento)}</Td>
                    <Td>{r.descricao}</Td>
                    <Td className="text-texto-2">
                      {r.parcela}/{r.totalParcelas}
                    </Td>
                    <Td num>{fmtBRLExato(r.valor)}</Td>
                    <Td>
                      <Badge tom={r.status === "atrasado" ? "vermelho" : "ouro"}>
                        {STATUS_RECEBIVEL_LABEL[r.status]}
                      </Badge>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Tabela>
          ) : (
            <Vazio>Nenhum recebível em aberto.</Vazio>
          )}
          {recebiveis.length > 40 ? (
            <NotaRegra>Mostrando os 40 vencimentos mais próximos de {recebiveis.length}.</NotaRegra>
          ) : null}
          <OrigemDado
            abas={["RECEBIVEIS"]}
            calculo="Linhas com status diferente de recebido, ordenadas pelo vencimento mais próximo"
            vazio={!recebiveis.length}
          />
        </Card>

        <Card titulo={`Contas a pagar em aberto (${pagaveis.length})`}>
          {pagaveis.length ? (
            <Tabela>
              <thead>
                <tr>
                  <Th>Vencimento</Th>
                  <Th>Fornecedor</Th>
                  <Th>Categoria</Th>
                  <Th num>Valor</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {pagaveis.slice(0, 40).map((p) => (
                  <tr key={p.id} className={cx(p.status === "atrasado" && "bg-negativo/5")}>
                    <Td>{fmtDate(p.vencimento)}</Td>
                    <Td>{p.fornecedor}</Td>
                    <Td className="text-texto-2">{CATEGORIA_CAIXA_LABEL[p.categoria]}</Td>
                    <Td num>{fmtBRLExato(p.valor)}</Td>
                    <Td>
                      <Badge tom={p.status === "atrasado" ? "vermelho" : "cinza"}>
                        {STATUS_PAGAVEL_LABEL[p.status]}
                      </Badge>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Tabela>
          ) : (
            <Vazio>Nenhuma conta a pagar em aberto.</Vazio>
          )}
          <OrigemDado
            abas={["DESPESAS"]}
            calculo="Linhas com status diferente de pago, ordenadas pelo vencimento mais próximo"
            vazio={!pagaveis.length}
          />
        </Card>
      </div>

      <Card titulo="Posição consolidada">
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs uppercase tracking-wider text-texto-3">Recursos</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">{fmtBRLExato(cg.caixa + cg.aReceber)}</p>
            <p className="text-xs text-texto-2">caixa + carteira a receber</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-texto-3">Compromissos</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-negativo">{fmtBRLExato(cg.aPagar)}</p>
            <p className="text-xs text-texto-2">tudo o que ainda vence</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-texto-3">Sobra</p>
            <p className="mt-1 text-lg font-semibold">
              <Sinal valor={cg.capitalDeGiro} texto={fmtBRLExato(cg.capitalDeGiro)} />
            </p>
            <p className="text-xs text-texto-2">
              {cg.indiceLiquidez === null
                ? "sem compromissos em aberto"
                : `${fmtPct(cg.indiceLiquidez * 100)} de cobertura`}
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
