// Índice de /analise.
//
// Por que existe: `/analise/[indicador]` já respondia, mas `/analise` não tinha
// página e devolvia 404. Quem apagasse o slug da barra de endereço, ou chegasse
// por um link cortado, caía num erro que dava a entender que a análise não
// existe — quando ela existe e são cinco.
//
// O QUE ESTA PÁGINA NÃO FAZ, de propósito: nenhum KPI. Ela não lê o dataset, não
// soma nada e não tem número honesto para mostrar; um `<Stat>` aqui seria um
// número inventado só para a tela parecer um painel. Índice não precisa de KPI
// para se justificar — a conta de cada indicador é aberta na tela dele.

import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";
import { INDICADORES } from "@/lib/domain";
import type { SlugIndicador } from "@/lib/metrics";

export const dynamic = "force-dynamic";

/**
 * Os indicadores que a rota dinâmica ATENDE — não uma lista de desejos.
 *
 * O tipo é `SlugIndicador[]`, a mesma união fechada que `analiseIndicador` aceita
 * e que a lista `SLUGS` de `/analise/[indicador]/page.tsx` usa para decidir entre
 * renderizar e chamar `notFound()`. Slug inventado aqui não compila, e é essa a
 * garantia de que nenhum link desta página leva a 404.
 */
const INDICADORES_COM_ANALISE: SlugIndicador[] = [
  "faturamento",
  "custos",
  "comissoes",
  "margem",
  "lucro",
];

export default function AnaliseIndice() {
  return (
    <>
      <p className="mb-2 text-xs text-texto-2">
        <Link href="/painel" className="hover:text-primaria-2">
          ← Dashboard
        </Link>
      </p>
      <PageHeader
        titulo="Análise"
        sub="O drill-down dos indicadores do dashboard: série de 12 meses, variação contra o mês anterior e contra o ano passado, e a composição aberta de cada número"
      />

      <Card titulo={`Indicadores com análise (${INDICADORES_COM_ANALISE.length})`} className="mt-4">
        <p className="mb-3 text-sm text-texto-2">
          Cada indicador abaixo tem tela própria, com a memória de cálculo do mês e a decomposição
          do que forma o número. São estes cinco: o que não está na lista ainda não tem análise, e
          é por isso que a lista é curta em vez de otimista.
        </p>
        <ul className="space-y-2">
          {INDICADORES_COM_ANALISE.map((slug) => {
            const meta = INDICADORES[slug];
            return (
              <li key={slug}>
                <Link
                  href={`/analise/${slug}`}
                  className="trans flex items-start justify-between gap-3 rounded-xl border border-borda bg-painel p-3 transition-all hover:-translate-y-px hover:border-borda-forte hover:bg-eleva"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{meta.titulo}</span>
                    <span className="mt-0.5 block text-xs text-texto-2">{meta.descricao}</span>
                  </span>
                  <span aria-hidden className="shrink-0 text-primaria-2">
                    →
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-xs text-texto-3">
          Esta página não calcula nada e por isso não mostra número nenhum. Os valores, as
          variações e a composição de cada um aparecem na tela do indicador, sobre a base completa —
          a análise não aplica a lente global de braço nem o filtro global de período.
        </p>
      </Card>
    </>
  );
}
