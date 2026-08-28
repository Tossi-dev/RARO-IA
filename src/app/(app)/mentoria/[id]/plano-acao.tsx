import { Card, Vazio } from "@/components/ui";
import type { AtendimentoLido } from "@/lib/mentoria/dados-atendimento";

export function PlanoAcao({ atendimento }: { atendimento: AtendimentoLido }) {
  if (!atendimento.conectado) return <Card titulo="Plano de ação"><p className="text-sm text-texto-2">Não foi possível carregar os dados de atendimento agora. Tente novamente em instantes.</p></Card>;
  if (!atendimento.encontrado) return <Card titulo="Plano de ação"><p className="text-sm text-texto-2">Não encontramos uma ficha de atendimento para este mentorado.</p></Card>;
  const autorizado = atendimento.consentimentos.some((c) => c.categoria === "meta" && c.consentido === true);
  if (!autorizado) return <Card titulo="Plano de ação"><p className="text-sm text-texto-2">O plano de ação não está disponível porque o consentimento está ausente.</p></Card>;
  return <Card titulo="Plano de ação">
    {atendimento.metas.length ? <div className="space-y-4">{atendimento.metas.map((meta, index) => <article key={meta.id ?? `${meta.titulo}-${index}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2"><h3 className="font-medium">{meta.titulo || "Meta não informada"}</h3><span className="text-xs text-texto-2">{meta.status || "status não informado"}{meta.prazo ? ` · ${meta.prazo}` : ""}</span></div>
      <ul className="mt-2 space-y-1 border-l border-borda pl-3 text-sm">{atendimento.passos.filter((p) => p.meta_id === meta.id).sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0)).map((passo, passoIndex) => <li key={passo.id ?? `${meta.id}-${passoIndex}`}><span>{passo.descricao || "Passo não informado"}</span>{passo.responsavel ? <span className="ml-2 text-xs text-texto-3">({passo.responsavel})</span> : null}</li>)}</ul>
    </article>)}</div> : <Vazio>Ainda não há metas de atendimento registradas.</Vazio>}
  </Card>;
}
