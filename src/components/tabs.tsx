"use client";

// Tabs leves no estilo shadcn (sem dependência externa).
// Recebe o conteúdo de cada aba já renderizado (Server Components como children).
//
// (mobile) Mesma pista de rolagem da sub-nav do Financeiro (fin-subnav.tsx):
// degradê na borda quando sobra aba fora da tela, scroll-snap pra nenhuma
// aba parar cortada no meio, e a aba clicada rola sozinha pra dentro da área
// visível — sem isso, uma lista de abas mais larga que 390px parecia
// simplesmente cortada, não rolável.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cx } from "./ui";

export interface AbaDef {
  id: string;
  rotulo: string;
  badge?: string | number;
  conteudo: ReactNode;
  /** Âncoras internas que também devem abrir esta aba. */
  hashes?: string[];
}

export function Tabs({ abas, inicial }: { abas: AbaDef[]; inicial?: string }) {
  const [ativa, setAtiva] = useState(inicial ?? abas[0]?.id);
  const listaRef = useRef<HTMLDivElement>(null);
  const [temMaisEsquerda, setTemMaisEsquerda] = useState(false);
  const [temMaisDireita, setTemMaisDireita] = useState(false);

  const medirBordas = () => {
    const el = listaRef.current;
    if (!el) return;
    setTemMaisEsquerda(el.scrollLeft > 4);
    setTemMaisDireita(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  };

  useEffect(() => {
    medirBordas();
    const el = listaRef.current?.querySelector('[aria-selected="true"]');
    el?.scrollIntoView({ behavior: "smooth", inline: "nearest", block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ativa]);

  useEffect(() => {
    const abrirPeloHash = () => {
      const hash = window.location.hash.replace(/^#/, "");
      if (!hash) return;
      const correspondente = abas.find((aba) => aba.id === hash || aba.hashes?.includes(hash));
      if (!correspondente) return;
      setAtiva(correspondente.id);
      window.setTimeout(() => document.getElementById(hash)?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
    };
    abrirPeloHash();
    window.addEventListener("hashchange", abrirPeloHash);
    return () => window.removeEventListener("hashchange", abrirPeloHash);
  }, [abas]);

  return (
    <div>
      <div className="relative mb-4">
        {temMaisEsquerda && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-0 z-10 w-8 bg-gradient-to-r from-fundo to-transparent md:hidden"
          />
        )}
        <div
          ref={listaRef}
          onScroll={medirBordas}
          className="flex snap-x snap-proximity gap-1 overflow-x-auto border-b border-borda [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="tablist"
        >
          {abas.map((a) => (
            <button
              key={a.id}
              role="tab"
              aria-selected={ativa === a.id}
              onClick={() => setAtiva(a.id)}
              // `min-h-11`, não `.toque` — ver o comentário em fin-subnav.tsx:
              // `.toque` soma `min-width`, e um `min-width` em item flex
              // dentro de faixa com `scroll-snap` corrompe a pintura do texto
              // neste navegador. Altura é a dimensão que faltava aqui mesmo.
              className={cx(
                "-mb-px inline-flex min-h-11 snap-start items-center whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors",
                ativa === a.id
                  ? "border-primaria font-medium text-primaria-2"
                  : "border-transparent text-texto-2 hover:text-texto"
              )}
            >
              {a.rotulo}
              {a.badge !== undefined && a.badge !== null && a.badge !== 0 ? (
                <span className="ml-1.5 rounded-full bg-painel-2 px-1.5 py-0.5 text-[10px] text-texto-2">
                  {a.badge}
                </span>
              ) : null}
            </button>
          ))}
        </div>
        {temMaisDireita && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l from-fundo to-transparent md:hidden"
          />
        )}
      </div>
      {abas.map((a) => (
        <div key={a.id} role="tabpanel" hidden={ativa !== a.id}>
          {a.conteudo}
        </div>
      ))}
    </div>
  );
}
