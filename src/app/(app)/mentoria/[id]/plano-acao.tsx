import { Card, Vazio } from "@/components/ui";
import type { AtendimentoLido } from "@/lib/mentoria/dados-atendimento";

export function PlanoAcao({ atendimento }: { atendimento: AtendimentoLido }) {
  if (!atendimento.conectado) return <Card titulo="Plano de ação"><p className="text-sm text-texto-2">Não foi possível carregar os dados de atendimento agora. Tente novamente em instantes.</p></Card>;
  if (!atendimento.encontrado) return <Card titulo="Plano de ação"><p className="text-sm text-texto-2">Não encontramos uma ficha de atendimento para este mentorado.</p></Card>;
  const autorizado = atendimento.consentimentos.some((c) => c.categoria === "meta" && c.consentido === true);
  if (!autorizado) return <Card titulo="Plano de ação"><p className="text-sm text-texto-2">O plano de ação não está disponível porque o consentimento está ausente.</p></Card>;
  return <Card titulo="Plano de ação" className="overflow-hidden">
    <p className="-mt-1 mb-5 max-w-2xl text-sm leading-relaxed text-texto-2">Transforme intenção em próximos passos combinados. O caminho pertence ao cliente; este plano só dá continuidade ao que ele escolheu experimentar.</p>
    {atendimento.metas.length ? <div data-acompanhamento="plano" className="grid gap-3 lg:grid-cols-2">{atendimento.metas.map((meta, index) => <article key={meta.id ?? `${meta.titulo}-${index}`} className="rounded-[22px] border border-borda-sutil bg-poco/70 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3"><h3 className="font-medium tracking-[-0.02em]">{meta.titulo || "Meta não informada"}</h3><span className="rounded-full border border-borda px-2.5 py-1 text-xs text-texto-2">{meta.status || "status não informado"}</span></div>
      {meta.prazo ? <p className="mt-2 text-xs text-texto-3">Prazo combinado: <span className="text-texto-2">{meta.prazo}</span></p> : <p className="mt-2 text-xs text-texto-3">Prazo ainda não combinado</p>}
      <ol className="mt-4 space-y-2">{atendimento.passos.filter((p) => p.meta_id === meta.id).sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0)).map((passo, passoIndex) => <li key={passo.id ?? `${meta.id}-${passoIndex}`} className="flex items-start gap-2.5 text-sm"><span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-primaria/35 bg-primaria/10 text-[11px] font-medium text-primaria-2">{passoIndex + 1}</span><span className="leading-relaxed text-texto-2">{passo.descricao || "Passo não informado"}{passo.responsavel ? <span className="ml-1.5 text-xs text-texto-3">· {passo.responsavel}</span> : null}</span></li>)}</ol>
    </article>)}</div> : <Vazio>Ainda não há metas de atendimento registradas.</Vazio>}
  </Card>;
}
