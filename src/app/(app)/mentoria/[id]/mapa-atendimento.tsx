import { Card, Vazio } from "@/components/ui";
import type { AtendimentoLido } from "@/lib/mentoria/dados-atendimento";

export function MapaAtendimento({ atendimento }: { atendimento: AtendimentoLido }) {
  if (!atendimento.conectado) return <Card titulo="Atendimento"><p className="text-sm text-texto-2">Não foi possível carregar os dados de atendimento agora. Tente novamente em instantes.</p></Card>;
  if (!atendimento.encontrado) return <Card titulo="Atendimento"><Vazio>Não encontramos uma ficha de atendimento para este mentorado.</Vazio></Card>;
  const autorizado = atendimento.consentimentos.some((c) => c.categoria === "mapa" && c.consentido === true);
  if (!autorizado) return <Card titulo="Atendimento"><p className="text-sm text-texto-2">O mapa não está disponível porque o consentimento para atendimento está ausente.</p></Card>;
  return <Card titulo="Mapa de atendimento">
    {atendimento.mapa.length ? <div className="space-y-3">
      {atendimento.mapa.map((item, index) => <article key={item.id ?? `${item.dimensao}-${index}`} className="rounded-xl border border-borda-sutil bg-poco p-3">
        <div className="flex items-center justify-between gap-2"><h3 className="font-medium">{item.dimensao || "Dimensão não informada"}</h3>{item.nota !== null && item.nota !== undefined ? <span className="text-sm tabular-nums text-texto-2">Nota {item.nota}</span> : null}</div>
        {item.dor ? <p className="mt-1 text-sm text-texto-2"><span className="text-texto-3">Dor:</span> {item.dor}</p> : null}
        {item.medo ? <p className="mt-1 text-sm text-texto-2"><span className="text-texto-3">Medo:</span> {item.medo}</p> : null}
        {item.objetivo ? <p className="mt-1 text-sm text-texto-2"><span className="text-texto-3">Objetivo:</span> {item.objetivo}</p> : null}
      </article>)}
    </div> : <Vazio>Ainda não há dados de atendimento registrados.</Vazio>}
  </Card>;
}
