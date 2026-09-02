import { Card, Vazio } from "@/components/ui";
import type { AtendimentoLido } from "@/lib/mentoria/dados-atendimento";

export function MapaAtendimento({ atendimento }: { atendimento: AtendimentoLido }) {
  if (!atendimento.conectado) return <Card titulo="Mapa de atendimento"><p className="text-sm text-texto-2">Não foi possível carregar os dados de atendimento agora. Tente novamente em instantes.</p></Card>;
  if (!atendimento.encontrado) return <Card titulo="Mapa de atendimento"><Vazio>Não encontramos uma ficha de atendimento para este mentorado.</Vazio></Card>;
  const autorizado = atendimento.consentimentos.some((c) => c.categoria === "mapa" && c.consentido === true);
  if (!autorizado) return <Card titulo="Mapa de atendimento"><p className="text-sm text-texto-2">O mapa não está disponível porque o consentimento para atendimento está ausente.</p></Card>;
  return <Card titulo="Mapa de atendimento" className="overflow-hidden">
    <p className="-mt-1 mb-5 max-w-2xl text-sm leading-relaxed text-texto-2">Uma leitura organizada pelo que a pessoa trouxe. Use como contexto para perguntas, não como diagnóstico ou roteiro fechado.</p>
    {atendimento.mapa.length ? <div data-acompanhamento="mapa" className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {atendimento.mapa.map((item, index) => <article key={item.id ?? `${item.dimensao}-${index}`} className="rounded-[22px] border border-borda-sutil bg-poco/70 p-4 transition-colors hover:border-primaria/45">
        <div className="flex items-start justify-between gap-3"><h3 className="font-medium tracking-[-0.02em] text-texto">{item.dimensao || "Dimensão não informada"}</h3>{item.nota !== null && item.nota !== undefined ? <span className="shrink-0 rounded-full border border-primaria/35 bg-primaria/10 px-2.5 py-1 text-xs font-medium tabular-nums text-primaria-2">{item.nota}/10</span> : null}</div>
        <dl className="mt-4 space-y-3 text-sm leading-relaxed"><div><dt className="text-[11px] font-semibold uppercase tracking-[0.13em] text-texto-3">Ponto de atenção</dt><dd className="mt-0.5 text-texto-2">{item.dor || "Ainda não registrado"}</dd></div><div><dt className="text-[11px] font-semibold uppercase tracking-[0.13em] text-texto-3">Receio</dt><dd className="mt-0.5 text-texto-2">{item.medo || "Ainda não registrado"}</dd></div><div><dt className="text-[11px] font-semibold uppercase tracking-[0.13em] text-texto-3">Direção desejada</dt><dd className="mt-0.5 text-texto-2">{item.objetivo || "Ainda não registrado"}</dd></div></dl>
      </article>)}
    </div> : <Vazio>Ainda não há dados de atendimento registrados.</Vazio>}
  </Card>;
}
