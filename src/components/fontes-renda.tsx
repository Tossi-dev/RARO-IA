// "Visão geral das fontes de renda" — as perguntas da tela de lançamentos: de
// onde vem o dinheiro (categoria), por agrupamento (cadastro opcional do
// usuário) e qual fonte específica sustenta ou está caindo. Server component:
// só recebe o cálculo pronto de src/lib/metrics-fontes.ts.

import { GraficoBarrasH, GraficoDonut } from "@/components/charts";
import { Legenda, SecaoVisual } from "@/components/explicador";
import { Vazio, cx } from "@/components/ui";
import { temAgrupamentos, rotularAgrupamento } from "@/lib/agrupamentos";
import { fmtBRL, fmtNum, fmtPct } from "@/lib/format";
import { corDoAgrupamento } from "@/lib/cores";
import { CATEGORIA_FONTE_DESCRICAO, CATEGORIA_FONTE_LABEL } from "@/lib/fontes";
import type {
  BracoReceita,
  CategoriaReceita,
  DestaquesFontes,
  FonteResumo,
} from "@/lib/metrics-fontes";
import type { Agrupamento } from "@/lib/types";

// mesma paleta de 4 cores que GraficoDonut usa internamente (top 3 + "Outros"),
// replicada aqui só para a legenda falar a verdade sobre a cor que o olho vê.
const CORES_DONUT = ["#8D70FF", "#E4C077", "#46B6F0", "#35D6A0"];

// ---------- 1) De onde vem o dinheiro — por categoria de fonte ----------

export function SecaoCategoriasFonte({ categorias }: { categorias: CategoriaReceita[] }) {
  const vazio = categorias.length === 0;
  const top = categorias[0];
  const resposta = vazio
    ? "Nenhuma venda paga registrada no período — sem base para dizer de onde vem o dinheiro."
    : categorias.length === 1
      ? `Toda a receita do período veio de ${top.rotulo.toLowerCase()}.`
      : `${top.rotulo} responde por ${fmtPct(top.pct)} da receita do período.`;

  const top3 = categorias.slice(0, 3);
  const resto = categorias.slice(3);
  const receitaResto = resto.reduce((s, c) => s + c.receita, 0);
  const legendaItens = [
    ...top3.map((c, i) => ({
      cor: CORES_DONUT[i],
      rotulo: c.rotulo,
      oQueE: `${fmtBRL(c.receita)} · ${fmtPct(c.pct)} da receita · ${CATEGORIA_FONTE_DESCRICAO[c.categoria]}`,
    })),
    ...(resto.length
      ? [
          {
            cor: CORES_DONUT[3],
            rotulo: "Outros",
            oQueE: `${resto.map((c) => c.rotulo).join(", ")} — ${fmtBRL(receitaResto)}`,
          },
        ]
      : []),
  ];

  return (
    <SecaoVisual pergunta="De onde vem o dinheiro deste negócio?" resposta={resposta}>
      {vazio ? (
        <Vazio>Nenhuma venda paga no período selecionado.</Vazio>
      ) : (
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <GraficoDonut
            data={categorias.map((c) => ({ name: c.rotulo, value: c.receita }))}
            formato="brl"
          />
          <div className="flex flex-col justify-center gap-3">
            <Legenda itens={legendaItens} />
            <ul className="so-completo mt-1 space-y-1.5 text-xs text-texto-2">
              {categorias.map((c) => (
                <li key={c.categoria} className="flex items-center justify-between gap-2 tabular-nums">
                  <span>{c.rotulo}</span>
                  <span>
                    {fmtBRL(c.receita)} · {fmtNum(c.vendas)} venda(s) · {fmtNum(c.clientes)} cliente(s)
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </SecaoVisual>
  );
}

// ---------- 2) E por agrupamento? — cadastro opcional do usuário ----------

/**
 * Sem NENHUM agrupamento cadastrado a seção inteira deixa de existir — não é
 * "opcional com três valores padrão esperando": sem cadastro, `return null`
 * antes de qualquer JSX, então a tela não reserva espaço nem mostra vazio.
 * Cadastro existente mas sem venda no período é outro caso, tratado pelo
 * `<Vazio>` de sempre.
 */
export function SecaoBracosFonte({
  bracos,
  agrupamentos,
}: {
  bracos: BracoReceita[];
  agrupamentos: Agrupamento[];
}) {
  if (!temAgrupamentos(agrupamentos)) return null;

  const vazio = bracos.length === 0;
  const top = bracos[0];
  const rotulo = (id: string) => rotularAgrupamento(id, agrupamentos);
  const resposta = vazio
    ? "Nenhuma venda com agrupamento identificável no período — sem base para a lente estrutural."
    : bracos.length === 1
      ? `Todo o período rodou dentro do agrupamento ${rotulo(top.braco).toLowerCase()}.`
      : `${rotulo(top.braco)} puxa o período, com ${fmtPct(top.pct)} da receita identificada por agrupamento.`;

  return (
    <SecaoVisual
      pergunta="E por agrupamento?"
      resposta={resposta}
      rodape={
        !vazio && (
          <>
            Considera vendas com agrupamento identificável: agrupamento do produto quando existe,
            senão agrupamento de quem vendeu. Vista independente da lente de fonte da topbar, para
            sempre comparar todos os agrupamentos cadastrados.
          </>
        )
      }
    >
      {vazio ? (
        <Vazio>Nenhuma venda com agrupamento identificável no período selecionado.</Vazio>
      ) : (
        <>
          <GraficoBarrasH
            data={bracos.map((b) => ({
              nome: rotulo(b.braco),
              valor: b.receita,
              // a barra usa a MESMA cor do ponto da legenda abaixo
              cor: corDoAgrupamento(b.braco, agrupamentos),
            }))}
            formato="brl"
          />
          <Legenda
            itens={bracos.map((b) => ({
              cor: corDoAgrupamento(b.braco, agrupamentos),
              rotulo: rotulo(b.braco),
              oQueE: `${fmtBRL(b.receita)} · ${fmtNum(b.vendas)} venda(s) · ${fmtNum(b.clientes)} cliente(s)`,
            }))}
          />
        </>
      )}
    </SecaoVisual>
  );
}

// ---------- 3) Qual fonte sustenta e qual está caindo — lista por produto ----------

function glifoDelta(delta: number): string {
  return delta > 0 ? "▲" : delta < 0 ? "▼" : "•";
}

function LinhaFonte({ f, agrupamentos }: { f: FonteResumo; agrupamentos: Agrupamento[] }) {
  const positivo = f.deltaPct !== null && f.deltaPct > 0;
  const negativo = f.deltaPct !== null && f.deltaPct < 0;
  return (
    <details className="painel-form superficie rounded-2xl border border-borda-sutil">
      <summary className="trans grid cursor-pointer grid-cols-2 items-center gap-2 px-4 py-3.5 text-sm transition-colors hover:bg-eleva sm:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))]">
        <span className="col-span-2 flex min-w-0 items-center gap-2 sm:col-span-1">
          <span
            aria-hidden
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ background: f.braco ? corDoAgrupamento(f.braco, agrupamentos) : "rgb(var(--texto-3))" }}
          />
          <span className="min-w-0 truncate font-medium text-texto">{f.nome}</span>
        </span>
        <span className="text-right tabular-nums text-texto sm:text-left">{fmtBRL(f.receita)}</span>
        <span
          className={cx(
            "inline-flex w-fit items-center gap-1 justify-self-end rounded-full px-1.5 py-0.5 text-[11px] font-medium tabular-nums sm:justify-self-start",
            f.deltaPct === null
              ? "bg-eleva text-texto-2"
              : positivo
                ? "bg-positivo/10 text-positivo"
                : negativo
                  ? "bg-negativo/10 text-negativo"
                  : "bg-eleva text-texto-2"
          )}
        >
          {f.deltaPct === null ? "sem base" : `${glifoDelta(f.deltaPct)} ${fmtPct(Math.abs(f.deltaPct))}`}
        </span>
        <span className="justify-self-end text-right text-xs text-texto-2 sm:justify-self-start sm:text-left">
          {fmtNum(f.clientes)} cliente(s)
        </span>
      </summary>
      <div className="so-completo grid gap-x-6 gap-y-2 border-t border-borda-sutil px-4 py-3.5 text-xs text-texto-2 sm:grid-cols-3">
        <p>
          Receita do período<span className="mt-0.5 block tabular-nums text-texto">{fmtBRL(f.receita)}</span>
        </p>
        <p>
          Período anterior<span className="mt-0.5 block tabular-nums text-texto">{fmtBRL(f.receitaAnterior)}</span>
        </p>
        <p>
          Ticket médio<span className="mt-0.5 block tabular-nums text-texto">{fmtBRL(f.ticketMedio)}</span>
        </p>
        <p>
          Vendas pagas<span className="mt-0.5 block tabular-nums text-texto">{fmtNum(f.vendas)}</span>
        </p>
        {temAgrupamentos(agrupamentos) && (
          <p>
            Agrupamento
            <span className="mt-0.5 block text-texto">
              {f.braco ? rotularAgrupamento(f.braco, agrupamentos) : "não identificado"}
            </span>
          </p>
        )}
        <p>
          Categoria<span className="mt-0.5 block text-texto">{CATEGORIA_FONTE_LABEL[f.categoria]}</span>
        </p>
      </div>
    </details>
  );
}

export function SecaoListaFontes({
  fontes,
  destaques,
  agrupamentos,
}: {
  fontes: FonteResumo[];
  destaques: DestaquesFontes;
  agrupamentos: Agrupamento[];
}) {
  const vazio = fontes.length === 0;
  const resposta = vazio
    ? "Nenhuma fonte com venda paga no período — sem base para dizer o que sustenta ou o que está caindo."
    : destaques.sustenta && destaques.caindo
      ? `${destaques.sustenta.nome} sustenta o período (${fmtPct(destaques.sustenta.deltaPct!)}), enquanto ${destaques.caindo.nome} está caindo (${fmtPct(Math.abs(destaques.caindo.deltaPct!))}).`
      : destaques.sustenta
        ? `${destaques.sustenta.nome} sustenta o período, crescendo ${fmtPct(destaques.sustenta.deltaPct!)} sobre o período anterior.`
        : destaques.caindo
          ? `${destaques.caindo.nome} está caindo ${fmtPct(Math.abs(destaques.caindo.deltaPct!))} sobre o período anterior.`
          : `${fontes[0].nome} é a fonte que mais rendeu no período (${fmtBRL(fontes[0].receita)}), sem período anterior para comparar.`;

  return (
    <SecaoVisual
      pergunta="Qual fonte sustenta e qual está caindo?"
      resposta={resposta}
      rodape={
        !vazio && "Clique numa fonte para abrir o monitoramento — receita do período, comparação e ticket médio."
      }
    >
      {vazio ? (
        <Vazio>Nenhuma fonte com venda paga no período selecionado.</Vazio>
      ) : (
        <div className="space-y-2">
          {fontes.map((f) => (
            <LinhaFonte key={f.produtoId} f={f} agrupamentos={agrupamentos} />
          ))}
        </div>
      )}
    </SecaoVisual>
  );
}
