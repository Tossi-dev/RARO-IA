// Peças visuais compartilhadas pelo módulo Financeiro (P1 · Módulo F).
// Módulo NEUTRO (sem "use client"): são componentes puros de apresentação,
// sem estado nem hooks, renderizados dentro dos Server Components das telas.

import type { ReactNode } from "react";
import { REGIME_EXPLICACAO, REGIME_LABEL, type RegimeFin } from "./fin-rotas";
import { Badge, cx, type Tom } from "./ui";

/**
 * Selo do regime contábil da tela. Existe porque a confusão nº 1 do dono é
 * achar que faturamento é dinheiro em conta — aqui a tela diz qual dos dois
 * está olhando antes de o primeiro número aparecer.
 */
export function SeloRegime({ regime }: { regime: RegimeFin }) {
  const tom: Tom = regime === "caixa" ? "verde" : regime === "competencia" ? "azul" : "violeta";
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-borda bg-painel/60 px-3 py-2">
      <Badge tom={tom}>{REGIME_LABEL[regime]}</Badge>
      <span className="text-xs text-texto-2">{REGIME_EXPLICACAO[regime]}</span>
    </div>
  );
}

const TONS_ALERTA = {
  critico: "border-negativo/40 bg-negativo/10",
  atencao: "border-aviso/40 bg-aviso/10",
  ok: "border-positivo/40 bg-positivo/10",
  info: "border-borda bg-painel",
} as const;

export type TomAlerta = keyof typeof TONS_ALERTA;

/** Faixa de alerta acionável: título curto + o que fazer a respeito. */
export function Alerta({
  tom,
  titulo,
  children,
}: {
  tom: TomAlerta;
  titulo: string;
  children?: ReactNode;
}) {
  return (
    <div className={cx("mb-4 rounded-xl border px-4 py-3", TONS_ALERTA[tom])}>
      <p className="text-sm font-medium">{titulo}</p>
      {children ? <p className="mt-1 text-xs text-texto-2">{children}</p> : null}
    </div>
  );
}

/** Nota de rodapé de um bloco — explica a regra de negócio por trás do número. */
export function NotaRegra({ children }: { children: ReactNode }) {
  return <p className="mt-3 text-xs leading-relaxed text-texto-3">{children}</p>;
}

/** Valor colorido por sinal, com disciplina rígida: verde entra, vermelho sai. */
export function Sinal({
  valor,
  texto,
  invertido = false,
}: {
  valor: number;
  texto: string;
  invertido?: boolean; // true quando subir é ruim (custo, atraso)
}) {
  const bom = invertido ? valor <= 0 : valor >= 0;
  return (
    <span className={cx("tabular-nums", valor === 0 ? "text-texto-2" : bom ? "text-positivo" : "text-negativo")}>
      {texto}
    </span>
  );
}
