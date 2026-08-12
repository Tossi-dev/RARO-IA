// Ponte entre o filtro global (cookies) e o `FiltroCaixa` das métricas.
// Server-only por transitividade: importa `filtros-server`, que usa next/headers.
// Nenhuma conta é feita aqui — só tradução de recorte. A matemática vive
// inteira em src/lib/metrics.ts.
//
// MUDANÇA DE EIXO: a lente global deixou de ser "braço" e virou FONTE DE
// RENDA (produto). Diferente do braço — que era uma tag solta em toda linha
// de caixa —, fonte só existe de verdade na VENDA (Matricula.produtoId). A
// tradução para a camada de caixa usa `idsVendasFiltradas`: junta as vendas
// do produto escolhido e recorta movimento/recebível/chargeback pelo
// `origemId`/`matriculaId` que aponta pra uma dessas vendas. Pagável
// (comissão, despesa, imposto) NUNCA teve produto no cadastro — com "todos"
// ou com uma fonte escolhida, ele continua consolidado, mesma decisão que a
// Central de Comando tomou para despesa.

import type { FiltroFonte } from "@/lib/filtros";
import { RANGES } from "@/lib/filtros";
import { getFiltroGlobal } from "@/lib/filtros-server";
import { idsVendasFiltradas, type FiltroCaixa } from "@/lib/metrics";
import type { Matricula, Produto } from "@/lib/types";

const DIA_MS = 86400000;

/** yyyy-mm-dd no fuso local (toISOString viraria o dia em UTC−3). */
export function isoDia(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export interface ContextoCaixa {
  fonte: FiltroFonte;
  rangeDias: number;
  ref: Date;
  hoje: string;
  inicio: string;
  fim: string;
  /** Recorte de período + fonte — para fluxo, DRE e taxas do período. */
  periodo: FiltroCaixa;
  /** Só a fonte, sem período — para carteira em aberto (a receber/a pagar). */
  lente: FiltroCaixa;
  rotuloPeriodo: string;
  rotuloFonte: string;
}

/**
 * Lê o filtro global e devolve os dois recortes que a camada de caixa usa.
 * A distinção importa: aging e projeção olham a carteira INTEIRA em aberto
 * (uma parcela que vence em novembro não some porque o filtro é de 30 dias),
 * enquanto fluxo e DRE olham o que aconteceu na janela escolhida.
 *
 * Recebe `matriculas`/`produtos` porque a tradução fonte → recorte de caixa
 * passa pela venda: a página já buscou esses dados no banco, então não faz
 * sentido este módulo buscar de novo.
 */
export function contextoCaixa(
  matriculas: Matricula[],
  produtos: Produto[],
  ref: Date = new Date()
): ContextoCaixa {
  const { fonte, rangeDias } = getFiltroGlobal();
  const fim = isoDia(ref);
  const inicio = isoDia(new Date(ref.getTime() - (rangeDias - 1) * DIA_MS));
  const vendasIds = fonte === "todos" ? undefined : idsVendasFiltradas(matriculas, [], { produtoId: fonte });
  const lente: FiltroCaixa = { vendasIds };
  const rotuloFonte =
    fonte === "todos" ? "todas as fontes" : (produtos.find((p) => p.id === fonte)?.nome ?? fonte);
  return {
    fonte,
    rangeDias,
    ref,
    hoje: fim,
    inicio,
    fim,
    periodo: { ...lente, inicio, fim },
    lente,
    rotuloPeriodo: RANGES.find((r) => r.dias === rangeDias)?.rotulo ?? `${rangeDias} dias`,
    rotuloFonte,
  };
}

/** Meses disponíveis (yyyy-mm) para os seletores das telas de competência. */
export function mesesDisponiveis(datas: string[], ref: Date = new Date()): string[] {
  const atual = isoDia(ref).slice(0, 7);
  const set = new Set<string>([atual, ...datas.map((d) => d.slice(0, 7))]);
  return [...set].sort((a, b) => b.localeCompare(a)).slice(0, 24);
}
