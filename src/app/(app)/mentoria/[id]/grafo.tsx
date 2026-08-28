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
  return <Card titulo="Relações">
    {relacoes.length || (reflexaoAutorizada && atendimento.reflexoes.length) ? <ul className="space-y-2 text-sm">
      {relacoes.map((passo, index) => <li key={passo.id ?? `relacao-${index}`}><span className="font-medium">{atendimento.metas.find((meta) => meta.id === passo.meta_id)?.titulo || "Meta"}</span><span className="mx-2 text-texto-3">relaciona-se com</span>{passo.descricao || "Passo não informado"}</li>)}
      {reflexaoAutorizada ? atendimento.reflexoes.map((reflexao, index) => <li key={reflexao.id ?? `reflexao-${index}`}><span className="font-medium">Reflexão:</span> {reflexao.texto || "Reflexão não informada"}</li>) : null}
    </ul> : <Vazio>Ainda não há relações registradas.</Vazio>}
    <label className="mt-4 block text-xs text-texto-2">Sugestão de pergunta <span className="text-texto-3">(edite antes de usar)</span>
      <span role="textbox" contentEditable suppressContentEditableWarning className="mt-1 block rounded-xl border border-borda-sutil bg-poco px-3 py-2 text-sm text-texto">O que você gostaria de observar entre esta meta e o próximo passo?</span>
    </label>
  </Card>;
}
