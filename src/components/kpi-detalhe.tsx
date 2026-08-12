"use client";

// Detalhe do KPI — o painel que abre a composição do número (skills
// `dashboard-mc` e `diagnostico-comercial`).
//
// FRONTEIRA RSC: este módulo tem a diretiva "use client", então ele exporta
// SOMENTE componentes. Nenhum `export const/let/var/class/enum` pode nascer
// aqui — um Server Component importando valor de runtime de um módulo client
// gera "React Client Manifest" e HTTP 500 em runtime, com o build verde.
// As constantes e a matemática vivem em `src/lib/composicao.ts` (neutro).
//
// Todas as props são escalares já serializadas no servidor (string/number/null)
// — nada de função, nada de Date. O corpo do cartão chega como slot `children`,
// renderizado pelo `Stat`, para o app continuar com UM único ponto de KPI.

// `clsx` direto (e não o `cx` de ui.tsx) para não criar import circular:
// é o `ui.tsx` que importa este arquivo.
import clsx from "clsx";
import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { fmtPct } from "@/lib/format";

/** Uma linha da memória de cálculo, com o valor já formatado no servidor. */
interface ParteDetalhe {
  rotulo: string;
  valor: string;
}

const TOM_TEXTO: Record<string, string> = {
  positivo: "text-positivo",
  negativo: "text-negativo",
  neutro: "text-texto-2",
};

/** Elementos focáveis do modal — base da prisão de foco (focus trap). */
const FOCAVEIS =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

export function KpiDetalhe({
  label,
  valorFormatado,
  fraseCalculo,
  partes = [],
  origem,
  nota,
  referenciaFormatada,
  labelReferencia,
  variacao,
  tom = "neutro",
  glifo = "▬",
  href,
  classeGatilho,
  children,
}: {
  label: string;
  valorFormatado: string;
  /** Frase completa da memória de cálculo, montada por `composicao.frase`. */
  fraseCalculo: string;
  partes?: ParteDetalhe[];
  origem?: string;
  nota?: string;
  referenciaFormatada?: string;
  labelReferencia?: string;
  variacao?: number | null;
  tom?: "positivo" | "negativo" | "neutro";
  glifo?: "▲" | "▼" | "▬";
  href?: string;
  classeGatilho?: string;
  children: ReactNode;
}) {
  const [aberto, setAberto] = useState(false);
  const gatilhoRef = useRef<HTMLButtonElement>(null);
  const painelRef = useRef<HTMLDivElement>(null);
  const tituloId = useId();
  const fechar = useCallback(() => setAberto(false), []);

  // Escape fecha, Tab circula dentro do painel: sem prisão de foco o leitor de
  // tela sai do modal e continua lendo a página que está atrás do overlay.
  useEffect(() => {
    if (!aberto) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        fechar();
        return;
      }
      if (e.key !== "Tab" || !painelRef.current) return;
      const alvos = Array.from(painelRef.current.querySelectorAll<HTMLElement>(FOCAVEIS));
      if (!alvos.length) return;
      const primeiro = alvos[0];
      const ultimo = alvos[alvos.length - 1];
      const ativo = document.activeElement;
      if (e.shiftKey && (ativo === primeiro || !painelRef.current.contains(ativo))) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && ativo === ultimo) {
        e.preventDefault();
        primeiro.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [aberto, fechar]);

  // Trava o scroll do body enquanto o modal está aberto e RESTAURA o valor
  // anterior ao fechar (não assume que era "" — outra camada pode ter travado).
  useEffect(() => {
    if (!aberto) return;
    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = anterior;
    };
  }, [aberto]);

  // Foco entra no painel ao abrir e VOLTA para o cartão ao fechar.
  // O `jaAbriu` evita que a montagem inicial (aberto = false) roube o foco da
  // página: só devolvemos o foco a quem realmente saiu daqui.
  const jaAbriu = useRef(false);
  useEffect(() => {
    if (aberto) {
      jaAbriu.current = true;
      painelRef.current?.querySelector<HTMLElement>(FOCAVEIS)?.focus();
    } else if (jaAbriu.current) {
      gatilhoRef.current?.focus({ preventScroll: true });
    }
  }, [aberto]);

  const temComparacao = referenciaFormatada !== undefined && labelReferencia !== undefined;

  return (
    <>
      <button
        ref={gatilhoRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={aberto}
        onClick={() => setAberto(true)}
        className={clsx(
          "trans block w-full text-left transition-all hover:border-primaria/60 hover:bg-painel-2",
          classeGatilho
        )}
      >
        {children}
      </button>

      {aberto ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) fechar();
          }}
        >
          <div
            ref={painelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={tituloId}
            className="bevel max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-borda-forte bg-painel p-5 shadow-e4"
          >
            <div className="flex items-start justify-between gap-3">
              <p
                id={tituloId}
                className="text-[11px] font-medium uppercase tracking-wider text-texto-3"
              >
                {label}
              </p>
              <button
                type="button"
                aria-label="Fechar"
                onClick={fechar}
                className="-mr-1 -mt-1 rounded-lg px-2 py-1 text-[11px] uppercase tracking-wider text-texto-2 hover:bg-eleva hover:text-texto"
              >
                Fechar
              </button>
            </div>

            <p className="mt-1 font-display text-[32px] font-semibold leading-none tracking-tight tabular-nums">
              {valorFormatado}
            </p>

            {/* elemento 3 da skill: de onde veio o número */}
            <div className="mt-4 rounded-xl border border-borda bg-poco p-3">
              <p className="text-[11px] font-medium uppercase tracking-wider text-texto-3">
                Memória de cálculo
              </p>
              <p className="mt-1 text-sm leading-relaxed text-texto tabular-nums">{fraseCalculo}</p>
              {partes.length ? (
                <ul className="mt-3 space-y-1 border-t border-borda pt-2">
                  {partes.map((p) => (
                    <li key={p.rotulo} className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="text-texto-2">{p.rotulo}</span>
                      <span className="shrink-0 tabular-nums">{p.valor}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>

            {origem ? (
              <div className="mt-3">
                <p className="text-[11px] font-medium uppercase tracking-wider text-texto-3">
                  Origem do dado
                </p>
                <p className="mt-0.5 text-sm text-texto-2">{origem}</p>
              </div>
            ) : null}

            {nota ? (
              <p className="mt-3 rounded-lg border border-borda bg-painel-2 px-3 py-2 text-xs text-texto-2">
                {nota}
              </p>
            ) : null}

            {temComparacao ? (
              <div className="mt-3 border-t border-borda pt-3">
                <p className="text-[11px] font-medium uppercase tracking-wider text-texto-3">
                  Comparação
                </p>
                <p className="mt-0.5 flex flex-wrap items-baseline gap-2 text-sm">
                  <span className="tabular-nums">{referenciaFormatada}</span>
                  <span className="text-texto-2">{labelReferencia}</span>
                  <span className={clsx("font-medium tabular-nums", TOM_TEXTO[tom])}>
                    {variacao === null || variacao === undefined
                      ? `${glifo} sem base de comparação`
                      : `${glifo} ${fmtPct(Math.abs(variacao))}`}
                  </span>
                </p>
              </div>
            ) : null}

            {href ? (
              <Link
                href={href}
                className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primaria-2 hover:underline"
              >
                Ver análise completa <span aria-hidden>→</span>
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
