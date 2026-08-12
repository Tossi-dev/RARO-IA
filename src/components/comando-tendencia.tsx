// Tendências, pace e forecast (SPEC-P1 Anexo B.1.4).
// Duas leituras complementares: dentro do período (pace acumulado contra o
// trilho da meta) e ao longo dos meses (tendência com projeção linear).

import { Card, cx } from "@/components/ui";
import { GraficoPaceAcumulado, GraficoTendenciaForecast } from "@/components/comando-graficos";
import { fmtBRL, fmtPct } from "@/lib/format";
import type { NorteDoComando, PontoPace, PontoTendencia } from "@/lib/metrics-comando";

export function ComandoTendencia({
  norte,
  pace,
  tendencia,
}: {
  norte: NorteDoComando;
  pace: PontoPace[];
  tendencia: PontoTendencia[];
}) {
  const futuros = tendencia.filter((p) => p.faturamento === null);
  const proximo = futuros[0] ?? null;
  const ultimoPrevisto = futuros[futuros.length - 1] ?? null;
  const adiantado = (norte.pctMeta ?? 0) >= (norte.pace?.pctTempo ?? 0);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card
        titulo={`Pace acumulado — ${norte.janela.rotulo}`}
        acao={
          <span
            className={cx(
              "text-[11px] font-medium",
              norte.meta === null ? "text-texto-3" : adiantado ? "text-positivo" : "text-negativo"
            )}
          >
            {norte.meta === null
              ? "sem meta"
              : adiantado
                ? `adiantado · ${fmtPct(norte.pctMeta ?? 0, 0)} da meta`
                : `atrasado · ${fmtPct(norte.pctMeta ?? 0, 0)} da meta`}
          </span>
        }
      >
        <GraficoPaceAcumulado data={pace} />
        <p className="mt-2 text-xs text-texto-2">
          {norte.meta === null
            ? "Cadastre a meta do período para o trilho aparecer."
            : `Trilho exige ${fmtBRL(norte.ritmoIdeal)}/dia; o realizado está em ${fmtBRL(norte.ritmoAtual)}/dia e ` +
              `os dias restantes pedem ${fmtBRL(norte.ritmoNecessario)}/dia.`}
        </p>
      </Card>

      <Card titulo="Tendência e forecast — 12 meses + 3 projetados">
        <GraficoTendenciaForecast data={tendencia} />
        <p className="mt-2 text-xs text-texto-2">
          {proximo && ultimoPrevisto ? (
            <>
              No traço atual, {proximo.label} fecha em torno de{" "}
              <span className="font-medium text-texto">{fmtBRL(proximo.previsto ?? 0)}</span> e{" "}
              {ultimoPrevisto.label} em {fmtBRL(ultimoPrevisto.previsto ?? 0)}.
              {proximo.meta !== null && (
                <>
                  {" "}
                  Meta de {proximo.label}: {fmtBRL(proximo.meta)} —{" "}
                  <span className={(proximo.previsto ?? 0) >= proximo.meta ? "text-positivo" : "text-negativo"}>
                    {(proximo.previsto ?? 0) >= proximo.meta ? "a projeção cobre" : "a projeção não cobre"}
                  </span>
                  .
                </>
              )}
            </>
          ) : (
            "Histórico insuficiente para projetar os próximos meses."
          )}
        </p>
      </Card>
    </div>
  );
}
