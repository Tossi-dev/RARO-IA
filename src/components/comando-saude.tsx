// Saúde do negócio 2.0 (SPEC-P1 Anexo B.1.7).
// O score sozinho não decide nada: a tela mostra os DRIVERS que o compõem,
// com peso, pontos obtidos e a leitura em linguagem de dono.
//
// Sem base, esta tela NÃO desenha nota, anel, barra nem cor semântica: ausência
// de dado não é nota baixa nem "Crítico" — é ausência, e é isso que ela diz.

import { Card, ProgressBar, cx } from "@/components/ui";
import { GraficoDriversSaude } from "@/components/comando-graficos";
import type { NivelSaude, SaudeComposta } from "@/lib/metrics-comando";

const COR_NIVEL: Record<NivelSaude, string> = {
  critico: "text-negativo",
  atencao: "text-aviso",
  bom: "text-positivo",
  excelente: "text-ouro",
};

export function ComandoSaude({ saude }: { saude: SaudeComposta }) {
  const pior = saude.puxamParaBaixo[0] ?? null;
  const melhor = saude.puxamParaCima[0] ?? null;
  const total = saude.drivers.length;

  return (
    <Card
      titulo="Saúde do negócio"
      acao={
        <span className="text-[11px] text-texto-3">
          {saude.semBase
            ? `nenhum dos ${total} drivers com base`
            : `${saude.comBase.length} de ${total} drivers com base · peso considerado ${saude.pesoComBase}`}
        </span>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[200px_minmax(0,1fr)]">
        <div className="rounded-xl border border-borda-sutil bg-superficie-1 p-4 text-center">
          {saude.score === null || saude.nivel === null ? (
            <>
              <p className="font-display text-2xl font-semibold text-texto-3">sem base</p>
              <p className="mt-1 text-xs uppercase tracking-wider text-texto-3">nada a pontuar</p>
              <p className="mt-3 text-left text-[11px] leading-relaxed text-texto-3">
                Nenhum driver tem dado suficiente para pontuar. Sem venda, meta, extrato ou aluno
                lançado, qualquer nota seria inventada — lance dados e o score aparece.
              </p>
            </>
          ) : (
            <>
              <p className={cx("font-display text-5xl font-semibold tabular-nums", COR_NIVEL[saude.nivel])}>
                {saude.score}
              </p>
              <p className="mt-1 text-xs uppercase tracking-wider text-texto-3">{saude.rotuloNivel}</p>
              <div className="mt-3">
                <ProgressBar pct={saude.score} tom={saude.score >= 80 ? "ouro" : "violeta"} />
              </div>
              {saude.parcial && (
                <p className="mt-2 text-left text-[11px] leading-relaxed text-aviso">
                  Score parcial: calculado só sobre {saude.comBase.length} de {total} drivers — os
                  demais ficaram sem base e não entraram na conta.
                </p>
              )}
              <p className="mt-3 text-left text-[11px] leading-relaxed text-texto-3">
                {melhor && (
                  <>
                    Sustenta: <span className="text-positivo">{melhor.rotulo}</span>.<br />
                  </>
                )}
                {pior ? (
                  <>
                    Derruba: <span className="text-negativo">{pior.rotulo}</span> — vale{" "}
                    {(pior.peso - pior.pontos).toFixed(0)} ponto(s) de recuperação.
                  </>
                ) : (
                  "Nenhum driver crítico no momento."
                )}
              </p>
            </>
          )}
        </div>

        <div>
          {saude.comBase.length > 0 && <GraficoDriversSaude data={saude.comBase} />}
          <ul className={cx("space-y-1", saude.comBase.length > 0 && "mt-2")}>
            {saude.drivers.map((d) => (
              <li key={d.chave} className="flex items-baseline justify-between gap-3 text-xs">
                <span className="text-texto-2">
                  <span
                    className={cx(
                      "font-medium",
                      !d.temBase ? "text-texto-3" : d.ajuda ? "text-positivo" : "text-negativo"
                    )}
                  >
                    {d.rotulo}
                  </span>{" "}
                  — {d.leitura}
                </span>
                <span className="shrink-0 tabular-nums text-texto-3">
                  {d.pontos === null ? `sem base · peso ${d.peso}` : `${d.pontos.toFixed(0)}/${d.peso} pts`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  );
}
