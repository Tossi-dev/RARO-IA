import Link from "next/link";
import { SecaoBracosFonte, SecaoCategoriasFonte, SecaoListaFontes } from "@/components/fontes-renda";
import { Badge, Botao, Campo, Card, Input, PageHeader, PainelForm, ProgressBar, Select, Stat, TextArea, Vazio, type Tom } from "@/components/ui";
import { criarLancamento } from "@/lib/actions";
import { getDB } from "@/lib/data";
import { STATUS_LANCAMENTO_LABEL } from "@/lib/domain";
import { RANGES } from "@/lib/filtros";
import { getFiltroGlobal } from "@/lib/filtros-server";
import { fmtBRL, fmtDate, fmtPct } from "@/lib/format";
import { filtrarPorFonte, statsLancamento } from "@/lib/metrics";
import { destaquesFontes, janelaFontes, receitaPorBracoFontes, receitaPorCategoria, resumoFontes } from "@/lib/metrics-fontes";
import type { StatusLancamento } from "@/lib/types";

export const dynamic = "force-dynamic";

const TOM_LANC: Record<StatusLancamento, Tom> = {
  planejado: "cinza",
  ativo: "verde",
  encerrado: "violeta",
};

export default async function Lancamentos() {
  const db = getDB();
  const filtro = getFiltroGlobal();
  const hoje = new Date();

  const [lancamentos, produtos, afiliados, ds, agrupamentos] = await Promise.all([
    db.listLancamentos(),
    db.listProdutos(),
    db.listAfiliados(),
    db.dataset(),
    db.listAgrupamentos(),
  ]);

  // ---- visão geral das fontes de renda: categoria, agrupamento e a lista por produto ----
  // Respeita a lente global (topbar), agora por FONTE (produto), para categoria e
  // lista de fontes; a seção "por agrupamento" é o cadastro opcional — some
  // sozinha quando não há nenhum agrupamento cadastrado (ver SecaoBracosFonte).
  const janela = janelaFontes(filtro.rangeDias, hoje);
  const matriculasLente = filtrarPorFonte(ds.matriculas, filtro.fonte);
  const categorias = receitaPorCategoria(matriculasLente, produtos, janela.atual.inicio, janela.atual.fim);
  const bracos = receitaPorBracoFontes(
    ds.matriculas,
    produtos,
    afiliados,
    janela.atual.inicio,
    janela.atual.fim,
    agrupamentos
  );
  const fontes = resumoFontes(matriculasLente, produtos, janela);
  const destaques = destaquesFontes(fontes);
  const rotuloPeriodo = RANGES.find((r) => r.dias === filtro.rangeDias)?.rotulo ?? `${filtro.rangeDias} dias`;
  const nomeFonte = filtro.fonte === "todos" ? null : (produtos.find((p) => p.id === filtro.fonte)?.nome ?? null);

  // ---- lançamentos: campanhas com início/fim, dentro do mesmo produto/fonte ----
  const nomeProduto = new Map(produtos.map((p) => [p.id, p.nome]));
  const stats = lancamentos.map((l) => ({
    l,
    s: statsLancamento(l, ds.matriculas, ds.reembolsos, ds.comissoes, []),
  }));

  const ativos = lancamentos.filter((l) => l.status === "ativo").length;
  const planejados = lancamentos.filter((l) => l.status === "planejado").length;
  const encerrados = lancamentos.filter((l) => l.status === "encerrado").length;
  const receitaTotal = stats.reduce((s, x) => s + x.s.faturamento, 0);
  // vendas amarradas a algum lançamento — o mesmo recorte que alimenta a
  // contagem de alunos captados (matrícula com lançamento e não pendente).
  const vendasDeLancamento = ds.matriculas.filter(
    (m) => m.lancamentoId && m.statusPagamento !== "pendente"
  );
  const alunosCaptados = new Set(vendasDeLancamento.map((m) => m.alunoId)).size;
  // diferença entre vendas e pessoas: quem comprou mais de uma vez em lançamento
  const recompras = vendasDeLancamento.length - alunosCaptados;

  const hojeISO = hoje.toISOString().slice(0, 10);

  return (
    <>
      <PageHeader
        titulo="Fontes de renda"
        sub={`Cada fonte de receita — cursos, mentorias, serviços, produtos, assinaturas e eventos — em ${rotuloPeriodo.toLowerCase()}${nomeFonte ? `, filtrado por ${nomeFonte}` : ""}.`}
      />

      <div className="grid gap-4">
        <SecaoCategoriasFonte categorias={categorias} />
        <SecaoBracosFonte bracos={bracos} agrupamentos={agrupamentos} />
        <SecaoListaFontes fontes={fontes} destaques={destaques} agrupamentos={agrupamentos} />
      </div>

      <div className="mt-8">
        <PageHeader titulo="Lançamentos" sub="Campanhas com início e fim, do planejamento ao pós-venda" />

        {/* 1 coluna no celular: 3 cartões de KPI (número herói + pílula de
            variação) espremidos em 390px viravam texto quebrado em cima de
            texto. A partir de sm sobra largura pra voltar às 3 colunas. */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {/* listLancamentos() tem três situações possíveis (planejado, ativo,
              encerrado): o que sobra do total depois de tirar as outras duas é
              exatamente o que está no ar agora. */}
          <Stat
            label="Ativos agora"
            valor={String(ativos)}
            formato="numero"
            valorNumerico={ativos}
            composicao={{
              formula: "subtracao",
              partes: [
                { rotulo: "Lançamentos cadastrados", valor: lancamentos.length },
                { rotulo: "Ainda em planejamento", valor: planejados },
                { rotulo: "Já encerrados", valor: encerrados },
              ],
              nota: "A situação é um campo que a gestão vira na mão: lançamento que acabou mas não foi encerrado continua contando como ativo.",
            }}
            origem="listLancamentos() → contagem por situação do lançamento"
          />
          {/* Composição extraída de `statsLancamento` (src/lib/metrics.ts, linha
              260): faturamento = soma do valor das matrículas do lançamento com
              situação diferente de pendente. O total da tela é a soma por
              lançamento, então cada lançamento vira uma linha da conta. */}
          <Stat
            label="Receita via lançamentos"
            valor={fmtBRL(receitaTotal)}
            formato="moeda"
            valorNumerico={receitaTotal}
            composicao={
              stats.length >= 2
                ? {
                    formula: "soma",
                    partes: stats.map(({ l, s }) => ({ rotulo: l.nome, valor: s.faturamento })),
                    nota: "Valor bruto da venda: reembolso não é abatido e a taxa do gateway não é descontada. Venda pendente e venda sem lançamento amarrado ficam de fora.",
                  }
                : stats.length === 1
                  ? `${fmtBRL(receitaTotal)} — faturamento bruto do único lançamento cadastrado (${stats[0].l.nome}), somando as vendas com situação diferente de pendente.`
                  : "Nenhum lançamento cadastrado — não há receita de lançamento a somar."
            }
            origem="dataset().matriculas filtradas por lançamento e situação diferente de pendente, via statsLancamento · soma de todos os lançamentos, sem recorte de período"
          />
          {/* alunosCaptados é uma contagem de pessoas DISTINTAS. A diferença
              honesta entre vendas e pessoas é a recompra do mesmo cliente. */}
          <Stat
            label="Alunos captados"
            valor={String(alunosCaptados)}
            formato="numero"
            valorNumerico={alunosCaptados}
            composicao={{
              formula: "subtracao",
              partes: [
                { rotulo: "Vendas fechadas dentro de lançamentos", valor: vendasDeLancamento.length },
                { rotulo: "Compras repetidas do mesmo cliente", valor: recompras },
              ],
              nota: "Conta PESSOAS, não vendas: quem comprou em dois lançamentos aparece uma vez só. Venda pendente não entra.",
            }}
            origem="dataset().matriculas com lançamento preenchido e situação diferente de pendente · contagem de alunos distintos"
          />
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {stats.length ? (
            stats.map(({ l, s }) => (
              <Card key={l.id}>
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div>
                    <Link href={`/lancamentos/${l.id}`} className="font-display text-lg font-semibold hover:text-primaria-2">
                      {l.nome}
                    </Link>
                    <p className="text-xs text-texto-2">
                      {nomeProduto.get(l.produtoId) ?? "—"} · {fmtDate(l.inicio)}
                      {l.fim ? ` → ${fmtDate(l.fim)}` : " → em aberto"}
                    </p>
                  </div>
                  <Badge tom={TOM_LANC[l.status]}>{STATUS_LANCAMENTO_LABEL[l.status]}</Badge>
                </div>

                <div className="mb-3 grid grid-cols-3 gap-2 text-sm">
                  <div className="rounded-lg bg-painel-2 px-3 py-2">
                    <p className="text-xs text-texto-2">Faturamento</p>
                    <p className="font-medium tabular-nums">{fmtBRL(s.faturamento)}</p>
                  </div>
                  <div className="rounded-lg bg-painel-2 px-3 py-2">
                    <p className="text-xs text-texto-2">Alunos</p>
                    <p className="font-medium tabular-nums">{s.alunosUnicos}</p>
                  </div>
                  <div className="rounded-lg bg-painel-2 px-3 py-2">
                    <p className="text-xs text-texto-2">Reembolsos</p>
                    <p className="font-medium tabular-nums">{fmtBRL(s.reembolsos)}</p>
                  </div>
                </div>

                {s.progressoMeta !== null && (
                  <>
                    <ProgressBar pct={s.progressoMeta} tom={l.status === "ativo" ? "ouro" : "violeta"} />
                    <p className="mt-1 text-xs text-texto-2">
                      {fmtPct(s.progressoMeta)} da meta de {fmtBRL(l.metaFaturamento)}
                    </p>
                  </>
                )}
              </Card>
            ))
          ) : (
            <Vazio>Nenhum lançamento cadastrado ainda.</Vazio>
          )}
        </div>
      </div>

      <div className="mt-4">
        <PainelForm titulo="Planejar novo lançamento">
          <form action={criarLancamento} className="grid gap-3 sm:grid-cols-2">
            <Campo label="Nome do lançamento" className="sm:col-span-2">
              <Input name="nome" required placeholder="Ex.: Mentoria Raro.ia — Turma 2" />
            </Campo>
            <Campo label="Produto ofertado">
              <Select name="produtoId" required>
                {produtos.map((p) => (
                  <option key={p.id} value={p.id}>{p.nome}</option>
                ))}
              </Select>
            </Campo>
            <Campo label="Meta de faturamento (R$)">
              <Input name="metaFaturamento" type="number" step="0.01" min="0" required placeholder="50000" />
            </Campo>
            <Campo label="Início">
              <Input name="inicio" type="date" defaultValue={hojeISO} required />
            </Campo>
            <Campo label="Fim (opcional)">
              <Input name="fim" type="date" />
            </Campo>
            <Campo label="Descrição / estratégia" className="sm:col-span-2">
              <TextArea name="descricao" placeholder="Funil, canais, oferta, bônus…" />
            </Campo>
            <div className="sm:col-span-2">
              <Botao>Criar lançamento</Botao>
            </div>
          </form>
        </PainelForm>
      </div>
    </>
  );
}
