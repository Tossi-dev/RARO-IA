// "Estamos no ritmo da meta?" — a seção do pace, reescrita como resposta.
//
// Substitui a antiga Faixa de Comando no dashboard. A diferença não é de
// enfeite: antes eram nove números lado a lado e cabia a quem olhava montar a
// conclusão. Aqui a conclusão vem primeiro, em uma frase, e os números ficam
// embaixo servindo de prova.
//
// A comparação que importa é RITMO, não total: "faço R$ 695/dia e preciso de
// R$ 0/dia" diz na hora se dá ou não dá. Total contra total esconde o tempo
// que ainda falta.

import { GraficoGaugeMeta, Sparkline } from "@/components/charts";
import { SecaoVisual } from "@/components/explicador";
import { Glossario } from "@/components/explicador";
import { cx } from "@/components/ui";
import { fmtBRL, fmtPct } from "@/lib/format";
import type { NorteDoComando } from "@/lib/metrics-comando";

function Pilar({
  rotulo,
  valor,
  oQueE,
  tom,
}: {
  rotulo: string;
  valor: string;
  oQueE: string;
  tom?: "bom" | "ruim";
}) {
  return (
    // Mesma pele dos KPIs do esquema: o pilar do ritmo é um KPI, não um rótulo.
    <div className="superficie card-sheen rounded-2xl border p-4">
      <p className="text-[11px] font-medium uppercase tracking-wider text-texto-3">{rotulo}</p>
      <p
        className={cx(
          "kpi-valor-medio mt-2 font-display font-fino leading-none tracking-tight tabular-nums",
          tom === "bom" && "text-positivo",
          tom === "ruim" && "text-negativo"
        )}
      >
        {valor}
      </p>
      <p className="mt-2.5 text-[11px] leading-snug text-texto-2">{oQueE}</p>
    </div>
  );
}

export function ComandoRitmo({
  norte,
  spark,
}: {
  norte: NorteDoComando;
  spark: Array<{ label: string; valor: number }>;
}) {
  const { janela } = norte;
  const semMeta = norte.meta === null;
  const noRitmo = norte.noRitmo === true;
  const gap = Math.abs(norte.gapProjetado ?? 0);

  const resposta = semMeta
    ? `Sem meta cadastrada para ${janela.rotulo}: dá para medir o ritmo, mas não dá para dizer se é suficiente.`
    : noRitmo
      ? `No ritmo de hoje, fecha em ${fmtBRL(norte.projecao)} — acima da meta de ${fmtBRL(norte.meta!)}.`
      : `No ritmo de hoje fecha em ${fmtBRL(norte.projecao)} e faltam ${fmtBRL(gap)} para a meta.`;

  return (
    <SecaoVisual
      pergunta={`Estamos no ritmo da meta? — ${janela.rotulo}`}
      resposta={resposta}
      tom={semMeta ? "atencao" : noRitmo ? "bom" : "ruim"}
      acao={
        <span className="text-[11px] text-texto-3">
          dia {janela.diasDecorridos} de {janela.diasTotais} · {janela.diasRestantes} restante(s)
        </span>
      }
      rodape={
        <Glossario
          termos={[
            {
              termo: "Ritmo atual",
              oQueE: "Quanto o negócio está vendendo por dia, na média do período até hoje.",
              formula: "vendido ÷ dias já passados",
            },
            {
              termo: "Ritmo necessário",
              oQueE:
                "Quanto precisa vender por dia, daqui até o fim do período, para a meta fechar. Zero significa que a meta já está batida.",
              formula: "(meta − vendido) ÷ dias que faltam",
            },
            {
              termo: "Projeção de fechamento",
              oQueE:
                "Onde o período termina se o ritmo de hoje continuar igual. É uma reta: não sabe de feriado, campanha nem sazonalidade.",
              formula: "ritmo atual × dias totais",
            },
          ]}
        />
      }
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Pilar
              rotulo="Ritmo atual"
              valor={`${fmtBRL(norte.ritmoAtual)}/dia`}
              oQueE="O que o negócio vem fazendo por dia."
            />
            <Pilar
              rotulo="Ritmo necessário"
              valor={semMeta ? "—" : `${fmtBRL(norte.ritmoNecessario)}/dia`}
              oQueE={
                semMeta
                  ? "Depende de uma meta cadastrada."
                  : norte.ritmoNecessario === 0
                    ? "Zero: a meta do período já está batida."
                    : "O que ainda precisa fazer por dia, até o fim."
              }
              tom={
                semMeta
                  ? undefined
                  : norte.ritmoNecessario > norte.ritmoAtual
                    ? "ruim"
                    : "bom"
              }
            />
            <Pilar
              rotulo="Vendido até agora"
              valor={fmtBRL(norte.realizado)}
              oQueE={
                semMeta
                  ? "Total do período, sem meta para comparar."
                  : `De uma meta de ${fmtBRL(norte.meta!)}.`
              }
            />
          </div>

          <div className="superficie rounded-2xl border p-4">
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-texto-3">
              Faturamento mês a mês — últimos 12 meses
            </p>
            <p className="mb-2 text-[11px] text-texto-2">
              A linha mostra o formato do negócio no tempo: onde subiu, onde caiu e se o período
              atual está dentro ou fora do padrão.
            </p>
            <Sparkline data={spark} altura={64} />
          </div>

          {/* Comparativos: prova, não manchete. Só na visão completa. */}
          {norte.comparativos.length > 0 && (
            <div className="so-completo grid gap-3 sm:grid-cols-2">
              {norte.comparativos.map((c) => (
                <div key={c.rotulo} className="rounded-xl bg-poco px-3.5 py-2.5">
                  <p className="text-[11px] uppercase tracking-wider text-texto-3">{c.rotulo}</p>
                  <p className="mt-0.5 flex items-baseline gap-2">
                    <span className="tabular-nums">{fmtBRL(c.valor)}</span>
                    <span
                      className={cx(
                        "text-xs tabular-nums",
                        c.deltaPct === null
                          ? "text-texto-3"
                          : c.deltaPct >= 0
                            ? "text-positivo"
                            : "text-negativo"
                      )}
                    >
                      {c.deltaPct === null
                        ? "sem base"
                        : `${c.deltaPct >= 0 ? "▲" : "▼"} ${fmtPct(Math.abs(c.deltaPct))}`}
                    </span>
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="superficie flex flex-col justify-center rounded-2xl border p-4">
          <p className="text-center text-[11px] uppercase tracking-wider text-texto-3">
            Quanto da meta já foi
          </p>
          {semMeta ? (
            <p className="py-10 text-center text-xs text-texto-3">
              Sem meta cadastrada para este período.
            </p>
          ) : (
            <>
              <GraficoGaugeMeta valor={norte.realizado} meta={norte.meta!} altura={160} />
              <p className="mt-2 text-center text-[11px] leading-snug text-texto-2">
                {fmtPct(norte.pctMeta ?? 0)} da meta com {fmtPct(norte.pace?.pctTempo ?? 0)} do
                tempo corrido.
                <span className="mt-1 block text-texto-3">
                  {(norte.pctMeta ?? 0) >= (norte.pace?.pctTempo ?? 0)
                    ? "A meta está andando mais rápido que o calendário."
                    : "O calendário está andando mais rápido que a meta."}
                </span>
              </p>
            </>
          )}
        </div>
      </div>

      {norte.metaProrrateada && (
        <p className="so-completo mt-3 text-[11px] text-texto-3">
          Metas são cadastradas por mês: para esta janela a meta foi rateada por dia (
          {fmtBRL(norte.meta ?? 0)} equivalentes a {janela.diasTotais} dia(s)).
        </p>
      )}
    </SecaoVisual>
  );
}
