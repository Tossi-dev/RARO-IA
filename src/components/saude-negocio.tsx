// Card "Saúde do Negócio" — visão de pulso no topo do dashboard,
// no espírito do painel homônimo do LA Beauty, adaptado à mentoria.

import Link from "next/link";
import type { SaudeNegocio } from "@/lib/metrics";
import { fmtBRL, fmtPct } from "@/lib/format";

export function SaudeNegocioCard({ s }: { s: SaudeNegocio }) {
  return (
    <section className="rounded-xl border border-borda bg-painel p-4">
      <h2 className="mb-2 text-sm font-medium text-texto-2">Saúde do negócio</h2>
      <ul className="space-y-1.5 text-sm">
        <li>
          <strong>{s.baseTotal}</strong> pessoas na base · <strong>{s.ativos}</strong> alunos ativos
        </li>
        {s.metaFaturamento && (
          <li>
            Meta do mês: <strong>{fmtBRL(s.metaFaturamento.realizado)}</strong> de{" "}
            {fmtBRL(s.metaFaturamento.alvo)} ({fmtPct(s.metaFaturamento.pct)}){" "}
            <Link href="/analise/faturamento" className="text-primaria-2 hover:underline">
              ver
            </Link>
          </li>
        )}
        <li>
          <strong>{s.tarefasPendentes}</strong> tarefa(s)/ficha(s) esperando você — quadro de avisos (à esquerda)
        </li>
        <li>
          <strong>{s.semContato45}</strong> cliente(s) sem contato há mais de 45 dias — lista com WhatsApp no
          quadro de avisos
        </li>
        <li>
          <strong>{s.reunioesHoje}</strong> reunião(ões) hoje · upsell do mês:{" "}
          <strong>{fmtBRL(s.upsellMes)}</strong>
        </li>
      </ul>
    </section>
  );
}
