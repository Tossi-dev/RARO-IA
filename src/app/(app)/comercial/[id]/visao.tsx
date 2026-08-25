import Link from "next/link";
import { Botao, Card, Campo, PageHeader, TextArea, Vazio } from "@/components/ui";
import { analisarCall } from "@/lib/comercial/acoes-analise-call";
import type { OportunidadeDetalhada } from "@/lib/comercial/dados";
import { fmtBRL } from "@/lib/format";

export interface AnaliseCallDaOportunidade {
  id: string;
  score: number | null;
  objecoes: string[];
  sugestoes: string[];
  modelo: string;
  geradaPor: string;
  geradaEm: string;
}

function semEmoji(texto: string): string {
  return texto.replace(/[\p{Extended_Pictographic}\p{Regional_Indicator}\p{Emoji_Modifier}\uFE0E\uFE0F\u200D\u20E3\u{E0020}-\u{E007F}]/gu, "").replace(/\s+/g, " ").trim();
}

function itens(itens: readonly string[]): string {
  return itens.map(semEmoji).filter(Boolean).join("; ");
}

/** Visão pura da oportunidade: resultado aparece, transcrição nunca é reimpressa. */
export function OportunidadeVisao({
  detalhe,
  analises,
  motivoAnalises = "",
}: {
  detalhe: OportunidadeDetalhada;
  analises: readonly AnaliseCallDaOportunidade[];
  motivoAnalises?: string;
}) {
  if (!detalhe.conectado) return <Card><p className="text-sm text-texto-2">{detalhe.motivo}</p></Card>;
  if (!detalhe.oportunidade) return <Card><Vazio>Não encontramos esta negociação.</Vazio></Card>;
  const oportunidade = detalhe.oportunidade;

  return (
    <>
      <p className="mb-2 text-xs text-texto-2"><Link href="/comercial" className="text-primaria-2 hover:underline">← Negociações</Link></p>
      <PageHeader titulo="Análise da negociação" sub={`${detalhe.etapa?.nome || "Etapa não encontrada"} · ${fmtBRL(oportunidade.valor)}`} />

      <Card titulo="Analisar call">
        <p className="text-sm text-texto-2">Quem dispara é uma pessoa. A análise é registrada com o nome de quem clicou e não substitui a decisão comercial.</p>
        <form action={analisarCall} encType="multipart/form-data" className="mt-3 space-y-3">
          <input type="hidden" name="oportunidadeId" value={oportunidade.id} />
          <Campo label="Transcrição da call">
            <TextArea name="transcricao" rows={8} placeholder="Cole a transcrição. Ela não será exibida de volta nesta ficha." />
          </Campo>
          <Campo label="Ou envie o áudio da call">
            <input type="file" name="audio" accept="audio/*,video/mp4,video/webm,video/quicktime" className="text-sm text-texto-2" />
          </Campo>
          <Botao>Gerar análise com IA</Botao>
        </form>
      </Card>

      <div className="mt-4">
        <Card titulo={`Análises registradas (${analises.length})`}>
          {motivoAnalises ? <p className="text-sm text-texto-2">{motivoAnalises}</p> : analises.length === 0 ? <Vazio>Nenhuma análise de call registrada.</Vazio> : (
            <ul className="space-y-3">
              {analises.map((analise) => (
                <li key={analise.id} className="rounded-xl border border-borda-sutil bg-poco p-4">
                  <p className="text-xs text-texto-2">Análise gerada por IA · Modelo: {semEmoji(analise.modelo)}</p>
                  <p className="mt-2 text-sm font-medium">{analise.score === null ? "A análise não devolveu um score legível." : `Score: ${analise.score}`}</p>
                  {analise.objecoes.length ? <p className="mt-2 text-sm text-texto-2">Objeções: {itens(analise.objecoes)}</p> : <p className="mt-2 text-sm text-texto-2">Nenhuma objeção foi identificada na resposta.</p>}
                  {analise.sugestoes.length ? <p className="mt-1 text-sm text-texto-2">Sugestões: {itens(analise.sugestoes)}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
