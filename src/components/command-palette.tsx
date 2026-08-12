"use client";

// Command palette (⌘K) — recurso-assinatura do app shell (Blueprint v3, Anexo A.7).
// Busca fuzzy de navegação + entidades + ações. Autocontida: abre por ⌘K/Ctrl+K
// ou pelo evento custom "raro:abrir-paleta" (disparado pela topbar).

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export interface ItemPalette {
  grupo: string; // "Navegação" | "Ações" | "Clientes" | "Conteúdos"
  rotulo: string;
  href: string;
  extra?: string; // texto auxiliar pesquisável (ex.: e-mail, plataforma)
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");

export function CommandPalette({ itens }: { itens: ItemPalette[] }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const abrir = useCallback(() => {
    setAberto(true);
    setBusca("");
    setIdx(0);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        abrir();
      }
      if (e.key === "Escape") setAberto(false);
    };
    const onCustom = () => abrir();
    window.addEventListener("keydown", onKey);
    window.addEventListener("raro:abrir-paleta", onCustom);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("raro:abrir-paleta", onCustom);
    };
  }, [abrir]);

  useEffect(() => {
    if (aberto) inputRef.current?.focus();
  }, [aberto]);

  const resultados = useMemo(() => {
    const q = norm(busca.trim());
    const base = q
      ? itens.filter((i) => norm(`${i.rotulo} ${i.extra ?? ""} ${i.grupo}`).includes(q))
      : itens.filter((i) => i.grupo === "Navegação" || i.grupo === "Ações");
    return base.slice(0, 12);
  }, [busca, itens]);

  useEffect(() => setIdx(0), [busca]);

  const ir = useCallback(
    (href: string) => {
      setAberto(false);
      router.push(href);
    },
    [router]
  );

  if (!aberto) return null;

  // agrupa mantendo a ordem dos resultados
  const grupos: Array<{ grupo: string; itens: Array<ItemPalette & { i: number }> }> = [];
  resultados.forEach((item, i) => {
    const g = grupos.find((x) => x.grupo === item.grupo);
    if (g) g.itens.push({ ...item, i });
    else grupos.push({ grupo: item.grupo, itens: [{ ...item, i }] });
  });

  return (
    <div
      className="fixed inset-0 z-[70] bg-black/60 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setAberto(false);
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Busca global"
    >
      <div className="vidro bevel mx-auto mt-[10vh] w-full max-w-xl overflow-hidden rounded-2xl border border-borda-forte shadow-e4">
        <input
          ref={inputRef}
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setIdx((v) => Math.min(v + 1, resultados.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setIdx((v) => Math.max(v - 1, 0));
            } else if (e.key === "Enter" && resultados[idx]) {
              e.preventDefault();
              ir(resultados[idx].href);
            }
          }}
          placeholder="Buscar páginas, clientes, lançamentos, conteúdos…"
          className="w-full border-b border-borda-sutil bg-transparent px-4 py-3.5 text-sm text-texto placeholder:text-texto-3 focus:outline-none"
        />
        <div className="max-h-[46vh] overflow-y-auto p-2">
          {resultados.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-texto-3">Nada encontrado.</p>
          ) : (
            grupos.map((g) => (
              <div key={g.grupo} className="mb-1">
                <p className="px-3 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wider text-texto-3">
                  {g.grupo}
                </p>
                {g.itens.map((item) => (
                  <button
                    key={`${item.href}-${item.rotulo}`}
                    onClick={() => ir(item.href)}
                    onMouseEnter={() => setIdx(item.i)}
                    className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm ${
                      item.i === idx ? "bg-primaria/15 text-texto" : "text-texto-2"
                    }`}
                  >
                    <span className="truncate">{item.rotulo}</span>
                    {item.extra ? (
                      <span className="shrink-0 truncate text-xs text-texto-3">{item.extra}</span>
                    ) : null}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
        <p className="border-t border-borda-sutil px-4 py-2 text-[11px] text-texto-3">
          ↑↓ navegar · Enter abrir · Esc fechar
        </p>
      </div>
    </div>
  );
}
