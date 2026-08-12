import Link from "next/link";
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

  return (
    <>
      <PageHeader titulo="Financeiro" sub="Custos, projeção e comparativo entre períodos">
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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
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
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
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
    </>
  );
}
