import Link from "next/link";
import { Botao, Card, PageHeader, Vazio, type Tom } from "@/components/ui";
import { recomendacaoProfissionalDe } from "@/lib/mentoria/alertas-risco";

export interface AlertaParaPainel {
  id: string;
  mentoradoId: string;
  nome: string;
  tipo: "queda_score" | "silencio" | "faltas" | "tarefas_atrasadas";
  severidade: "baixa" | "media" | "alta";
  detalhe: string;
}

export interface AnaliseParaPainel {
  id: string;
  mentoradoId: string;
  nome: string;
  sessaoId: string;
  modelo: string;
  geradaPor: string;
  geradaEm: string;
  pontosFortes: string[];
  riscos: string[];
}

type ResolverAlerta = (formData: FormData) => void | Promise<void>;

const ROTULO_TIPO: Record<AlertaParaPainel["tipo"], string> = {
  queda_score: "Queda de score",
  silencio: "Silêncio prolongado",
  faltas: "Faltas consecutivas",
  tarefas_atrasadas: "Tarefas atrasadas",
};

const TOM_SEVERIDADE: Record<AlertaParaPainel["severidade"], Tom> = {
  baixa: "cinza",
  media: "ouro",
  alta: "vermelho",
};

function semEmoji(texto: string): string {
  return texto
    .replace(/[\p{Extended_Pictographic}\p{Regional_Indicator}\p{Emoji_Modifier}\uFE0E\uFE0F\u200D\u20E3\u{E0020}-\u{E007F}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function lista(textos: readonly string[]): string {
  return textos.map(semEmoji).filter(Boolean).join("; ");
}

/** Visão pura do painel interno; recebe fatos já lidos e nunca deduz risco de ausência. */
export function PainelRiscoVisao({
  alertas,
  analises,
  motivo = "",
  resolverAlerta,
}: {
  alertas: readonly AlertaParaPainel[];
  analises: readonly AnaliseParaPainel[];
  motivo?: string;
  resolverAlerta?: ResolverAlerta;
}) {
  return (
    <>
      <PageHeader titulo="Risco e evolução">
        <Link href="/mentoria" className="text-sm text-primaria-2 hover:underline">
          Voltar para mentoria
        </Link>
      </PageHeader>

      {motivo ? (
        <Card>
          <p className="text-sm text-texto-2">{semEmoji(motivo)}</p>
        </Card>
      ) : (
        <>
          <Card titulo={`Alertas abertos (${alertas.length})`}>
            {alertas.length === 0 ? (
              <Vazio>Nenhum alerta de risco registrado.</Vazio>
            ) : (
              <ul className="space-y-3">
                {alertas.map((alerta) => (
                  <li key={alerta.id} className="rounded-xl border border-borda-sutil bg-poco p-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <Link href={`/mentoria/${alerta.mentoradoId}`} className="font-medium text-primaria-2 hover:underline">
                        {semEmoji(alerta.nome)}
                      </Link>
                      <span className={`text-xs font-medium ${TOM_SEVERIDADE[alerta.severidade] === "vermelho" ? "text-negativo" : TOM_SEVERIDADE[alerta.severidade] === "ouro" ? "text-ouro" : "text-texto-3"}`}>
                        {ROTULO_TIPO[alerta.tipo]} · severidade {alerta.severidade}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-texto-2">Fato de origem: {semEmoji(alerta.detalhe)}</p>
                    {(() => {
                      const recomendacao = recomendacaoProfissionalDe({ tipo: alerta.tipo, texto: alerta.detalhe });
                      return (
                        <div className="mt-3 rounded-lg border border-borda-sutil px-3 py-2.5 text-sm">
                          <p className="font-medium">Pergunta sugerida para acompanhamento</p>
                          <p className="mt-1 text-texto">{recomendacao.pergunta}</p>
                          <p className="mt-1 text-xs text-texto-2">{recomendacao.incerteza}</p>
                          <p className="mt-1 text-xs text-texto-3">Revisão profissional obrigatória antes de usar esta sugestão.</p>
                        </div>
                      );
                    })()}
                    <form action={resolverAlerta} className="mt-3">
                      <input type="hidden" name="alertaId" value={alerta.id} />
                      <Botao tipo="fantasma">Resolver alerta</Botao>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <div className="mt-4">
            <Card titulo={`Análises recentes (${analises.length})`}>
              {analises.length === 0 ? (
                <Vazio>Nenhuma análise de sessão registrada.</Vazio>
              ) : (
                <ul className="space-y-3">
                  {analises.map((analise) => (
                    <li key={analise.id} className="rounded-xl border border-borda-sutil bg-poco p-4">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <Link href={`/mentoria/${analise.mentoradoId}`} className="font-medium text-primaria-2 hover:underline">
                          {semEmoji(analise.nome)}
                        </Link>
                        <span className="text-xs text-texto-2">Análise gerada por IA · Modelo: {semEmoji(analise.modelo)}</span>
                      </div>
                      {analise.pontosFortes.length ? <p className="mt-2 text-sm text-texto-2">Pontos fortes: {lista(analise.pontosFortes)}</p> : null}
                      {analise.riscos.length ? <p className="mt-1 text-sm text-texto-2">Riscos: {lista(analise.riscos)}</p> : null}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}
    </>
  );
}
