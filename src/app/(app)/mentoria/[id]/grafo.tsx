import { Card, Vazio } from "@/components/ui";
import type { AtendimentoLido } from "@/lib/mentoria/dados-atendimento";

export function Grafo({ atendimento }: { atendimento: AtendimentoLido }) {
  if (!atendimento.conectado) return <Card titulo="Relações"><p className="text-sm text-texto-2">Não foi possível carregar os dados de atendimento agora. Tente novamente em instantes.</p></Card>;
  if (!atendimento.encontrado) return <Card titulo="Relações"><p className="text-sm text-texto-2">Não encontramos uma ficha de atendimento para este mentorado.</p></Card>;
  const reflexaoAutorizada = atendimento.consentimentos.some((c) => c.categoria === "reflexao" && c.consentido === true);
  const metaAutorizada = atendimento.consentimentos.some((c) => c.categoria === "meta" && c.consentido === true);
  if (!reflexaoAutorizada && !metaAutorizada) return <Card titulo="Relações"><p className="text-sm text-texto-2">As relações não estão disponíveis porque o consentimento está ausente.</p></Card>;
  const relacoes = metaAutorizada ? atendimento.passos.filter((passo) => passo.meta_id && atendimento.metas.some((meta) => meta.id === passo.meta_id)) : [];
  if (!metaAutorizada) return <Card titulo="Reflexões">
    {atendimento.reflexoes.length ? <ul className="space-y-2 text-sm">{atendimento.reflexoes.map((reflexao, index) => <li key={reflexao.id ?? `reflexao-${index}`}><span className="font-medium">Reflexão:</span> {reflexao.texto || "Reflexão não informada"}</li>)}</ul> : <Vazio>Ainda não há reflexões registradas.</Vazio>}
  </Card>;
  return <Card titulo="Relações" className="overflow-hidden">
    <p className="-mt-1 mb-5 max-w-2xl text-sm leading-relaxed text-texto-2">Conexões que o próprio cliente já trouxe entre objetivos, experimentos e reflexões. Não são explicações clínicas nem conclusões automáticas.</p>
    {relacoes.length || (reflexaoAutorizada && atendimento.reflexoes.length) ? <div data-acompanhamento="relacoes" className="grid gap-3 lg:grid-cols-2">
      {relacoes.map((passo, index) => <article key={passo.id ?? `relacao-${index}`} className="rounded-[22px] border border-borda-sutil bg-poco/70 p-4 text-sm"><p className="font-medium text-texto">{atendimento.metas.find((meta) => meta.id === passo.meta_id)?.titulo || "Meta"}</p><div className="my-2 h-px w-10 bg-primaria/60" /><p className="leading-relaxed text-texto-2">{passo.descricao || "Passo não informado"}</p></article>)}
      {reflexaoAutorizada ? atendimento.reflexoes.map((reflexao, index) => <article key={reflexao.id ?? `reflexao-${index}`} className="rounded-[22px] border border-borda-sutil bg-poco/70 p-4 text-sm"><p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-texto-3">Reflexão registrada</p><p className="mt-2 leading-relaxed text-texto-2">{reflexao.texto || "Reflexão não informada"}</p></article>) : null}
    </div> : <Vazio>Ainda não há relações registradas.</Vazio>}
    <label className="mt-5 block text-xs text-texto-2">Sugestão de pergunta <span className="text-texto-3">(edite antes de usar)</span>
      <span role="textbox" contentEditable suppressContentEditableWarning className="mt-1 block rounded-2xl border border-borda-sutil bg-poco px-3 py-2.5 text-sm leading-relaxed text-texto">O que você gostaria de observar entre esta meta e o próximo passo?</span>
    </label>
  </Card>;
}
