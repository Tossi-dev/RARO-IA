"use client";

// O tour pelos resultados da empresa — uma pergunta por tela.
//
// POR QUE ESTA TELA NÃO É UM PAINEL
// ---------------------------------
// O painel entrega tudo de uma vez e exige que a pessoa saiba onde olhar. Aqui
// é o contrário: uma pergunta, um número, uma frase, e um botão para a próxima.
// Quem nunca leu um DRE na vida chega ao fim sabendo dizer se a empresa está
// bem — e por quê. Os números são exatamente os mesmos do painel (ver a regra
// em src/lib/tour.ts: este caminho não calcula nada).
//
// O gesto é o do celular: arrasta para o lado ou toca no botão. As bolinhas em
// cima dizem onde a pessoa está e quanto falta — sem isso, um passo a passo
// sem fim vira armadilha.

import { ArrowLeft, ArrowRight, Check, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { PassoTour, TomPasso } from "@/lib/tour";
import { cx } from "./ui";

const COR_TOM: Record<TomPasso, string> = {
  neutro: "text-texto",
  positivo: "text-positivo",
  negativo: "text-negativo",
};

/** Arrasto menor que isto é tremida de dedo, não intenção de trocar de passo. */
const ARRASTO_MINIMO = 48;

export function TourEmpresa({ passos, periodo }: { passos: PassoTour[]; periodo: string }) {
  const [i, setI] = useState(0);
  const inicioX = useRef<number | null>(null);
  const passo = passos[i];
  const ultimo = i === passos.length - 1;

  const ir = (delta: number) => {
    setI((atual) => Math.min(passos.length - 1, Math.max(0, atual + delta)));
  };

  // Seta do teclado também anda no tour: no computador o tour é lido com as
  // mãos no teclado, e obrigar a mirar o mouse num botão seria pior.
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") ir(1);
      if (e.key === "ArrowLeft") ir(-1);
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, []);

  // Volta ao topo a cada passo: o passo anterior pode ter sido mais longo, e
  // começar a leitura no meio do texto é desorientador.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [i]);

  if (!passo) return null;

  return (
    <div
      className="mx-auto flex min-h-[70vh] max-w-2xl flex-col"
      onTouchStart={(e) => {
        inicioX.current = e.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(e) => {
        const inicio = inicioX.current;
        const fim = e.changedTouches[0]?.clientX;
        inicioX.current = null;
        if (inicio === null || fim === undefined) return;
        const d = fim - inicio;
        if (Math.abs(d) < ARRASTO_MINIMO) return;
        ir(d < 0 ? 1 : -1);
      }}
    >
      {/* progresso: onde estou e quanto falta */}
      <div className="mb-6 flex items-center gap-3">
        <div className="flex flex-1 items-center gap-1.5" aria-hidden>
          {passos.map((p, idx) => (
            <span
              key={p.id}
              className={cx(
                "h-1 flex-1 rounded-full transition-colors",
                idx <= i ? "bg-primaria" : "bg-eleva"
              )}
            />
          ))}
        </div>
        <span className="shrink-0 text-xs tabular-nums text-texto-3">
          {i + 1}/{passos.length}
        </span>
        <Link
          href="/painel"
          aria-label="Sair do tour"
          className="toque trans flex h-8 w-8 items-center justify-center rounded-full border border-borda-sutil text-texto-3 transition-colors hover:border-borda hover:text-texto"
        >
          <X size={15} aria-hidden strokeWidth={1.5} />
        </Link>
      </div>

      {/* o passo */}
      <div className="flex-1">
        <p className="text-[11px] font-medium uppercase tracking-wider text-texto-3">
          {passo.pergunta}
        </p>
        <p
          className={cx(
            "mt-3 font-display text-[clamp(2.25rem,11vw,4rem)] font-fino leading-none tabular-nums",
            COR_TOM[passo.tom]
          )}
        >
          {passo.valor}
        </p>
        <p className="mt-4 text-[17px] leading-snug text-texto">{passo.frase}</p>
        <p className="mt-4 rounded-2xl border border-borda-sutil bg-painel-2 px-4 py-3.5 text-sm leading-relaxed text-texto-2">
          {passo.detalhe}
        </p>
        {passo.href && passo.rotuloHref && (
          <Link
            href={passo.href}
            className="toque mt-4 inline-flex items-center gap-1.5 text-sm text-primaria-2 hover:underline"
          >
            {passo.rotuloHref} →
          </Link>
        )}
      </div>

      {/* controles — grudados embaixo no celular, ao alcance do polegar */}
      <div className="sticky bottom-0 mt-8 flex items-center gap-2 bg-gradient-to-t from-fundo via-fundo to-transparent pb-2 pt-6">
        <button
          type="button"
          onClick={() => ir(-1)}
          disabled={i === 0}
          className="toque trans flex h-11 w-11 items-center justify-center rounded-full border border-borda-sutil text-texto-2 transition-colors hover:border-borda hover:text-texto disabled:opacity-30"
          aria-label="Passo anterior"
        >
          <ArrowLeft size={17} aria-hidden strokeWidth={1.5} />
        </button>
        {ultimo ? (
          // Link, e não <Botao>: `Botao` do kit é <button> (submit de
          // formulário) e não navega. As classes são as mesmas de propósito —
          // o fim do tour tem que parecer o mesmo botão que trouxe a pessoa
          // até aqui.
          <Link
            href="/painel"
            className="trans bevel flex h-11 flex-1 items-center justify-center gap-1.5 rounded-full bg-gradient-to-b from-primaria-2 via-primaria to-primaria-press text-sm font-medium text-white transition-all hover:brightness-110"
          >
            <Check size={16} aria-hidden strokeWidth={1.75} /> Terminei o tour
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => ir(1)}
            className="trans bevel flex h-11 flex-1 items-center justify-center gap-1.5 rounded-full bg-gradient-to-b from-primaria-2 via-primaria to-primaria-press text-sm font-medium text-white transition-all hover:brightness-110"
          >
            Próximo <ArrowRight size={16} aria-hidden strokeWidth={1.75} />
          </button>
        )}
      </div>

      <p className="mt-3 text-center text-[11px] text-texto-3">
        Números de {periodo} — os mesmos do painel.
      </p>
    </div>
  );
}
