"use client";

// A tela inicial em espírito iOS — src/app/(app)/page.tsx (a raiz do sistema).
//
// "use client" porque pasta aberta é ESTADO DE TELA (clique, Esc, clicar
// fora). O catálogo em si — nome, rota, cor, ícone, frase de cada app — mora
// em src/lib/apps.ts, um módulo neutro: é lá que fica a fonte de verdade que
// tanto este componente quanto o server component de /inicio precisam ler, e
// só o NOME do ícone atravessa essa fronteira (string, serializável). Quem
// troca nome por componente de fato do lucide-react é este arquivo — módulo
// de UI é o lugar certo pra essa dependência morar.

import {
  ArrowLeftRight,
  CalendarDays,
  Clapperboard,
  FileText,
  Film,
  LayoutDashboard,
  LineChart,
  ListChecks,
  Megaphone,
  Plug,
  TrendingUp,
  Trophy,
  Undo2,
  Upload,
  UserCircle,
  Users,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { badgeValido, ordenarApps, type AppCatalogo, type NomeIcone, type SubApp } from "@/lib/apps";
import { cx } from "./ui";

// Rocket, Layers, Workflow, Landmark e HandCoins saíram do mapa: eram os
// ícones de Lançamentos, Capital de giro, Comissões e Coleta de dados — as
// quatro telas que saíram do catálogo na virada para mentoria.
const ICONES: Record<NomeIcone, LucideIcon> = {
  LayoutDashboard,
  CalendarDays,
  Wallet,
  Users,
  Clapperboard,
  TrendingUp,
  ArrowLeftRight,
  LineChart,
  FileText,
  Undo2,
  Film,
  Megaphone,
  Trophy,
  ListChecks,
  Upload,
  Plug,
  UserCircle,
};

/** Um item da grade — app de primeiro nível ou sub-app dentro de uma pasta. */
type ItemGrade = Pick<AppCatalogo, "id" | "nome" | "href" | "icone" | "cor"> & {
  subApps?: SubApp[];
};

/** Escurece um hex em `pct` (0–1), sem depender de lib — o pé do gradiente do ícone. */
function escurecer(hex: string, pct: number): string {
  const n = parseInt(hex.replace("#", ""), 16);
  const canal = (deslocamento: number) =>
    Math.max(0, Math.round((((n >> deslocamento) & 255) * (1 - pct))))
      .toString(16)
      .padStart(2, "0");
  return `#${canal(16)}${canal(8)}${canal(0)}`;
}

/** A mesma cor, em rgba translúcido — usada só na sombra difusa embaixo do ícone. */
function sombraDaCor(hex: string): string {
  const n = parseInt(hex.replace("#", ""), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, 0.45)`;
}

/**
 * O "squircle": quadrado de canto bem arredondado (~23% do lado — a
 * aproximação honesta em CSS puro, sem clip-path de curva importada),
 * gradiente vertical curto da cor de acento, luz de 1px por dentro na
 * aresta de cima e sombra difusa embaixo, tingida da própria cor do app.
 */
function Squircle({ cor, children }: { cor: string; children: ReactNode }) {
  return (
    <div
      className="flex h-14 w-14 items-center justify-center rounded-[23%] sm:h-16 sm:w-16"
      style={{
        backgroundImage: `linear-gradient(180deg, ${cor}, ${escurecer(cor, 0.22)})`,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -1px 0 rgba(0,0,0,0.22), 0 10px 18px -8px ${sombraDaCor(cor)}`,
      }}
    >
      {children}
    </div>
  );
}

/** Badge de contagem — só desenha quando `badgeValido` confirma que é um número de verdade. */
function BadgeContador({ n }: { n?: number | null }) {
  const v = badgeValido(n);
  if (v === undefined) return null;
  return (
    <span
      aria-hidden
      className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border border-borda-forte/40 bg-negativo px-1 text-[10px] font-medium leading-none text-white shadow-e2"
    >
      {v > 99 ? "99+" : v}
    </span>
  );
}

/** Mini-grade dos ícones filhos, dentro do ícone-pasta — a "pasta" do iOS. */
function MiniGradePasta({ subApps }: { subApps: SubApp[] }) {
  return (
    <div className="grid h-[64%] w-[64%] grid-cols-2 gap-[3px]">
      {subApps.slice(0, 4).map((s) => {
        const Icone = ICONES[s.icone];
        return (
          <div
            key={s.id}
            className="flex items-center justify-center rounded-[30%]"
            style={{ backgroundImage: `linear-gradient(180deg, ${s.cor}, ${escurecer(s.cor, 0.22)})` }}
          >
            <Icone size={9} aria-hidden strokeWidth={1.5} className="text-white/90" />
          </div>
        );
      })}
    </div>
  );
}

/** O conteúdo visual de um ícone: squircle (com mini-grade se for pasta) + rótulo. */
function ConteudoIcone({
  item,
  badge,
}: {
  item: ItemGrade;
  badge?: number | null;
}) {
  const Icone = ICONES[item.icone];
  const ehPasta = (item.subApps?.length ?? 0) > 0;
  return (
    <>
      <span className="relative">
        <Squircle cor={item.cor}>
          {ehPasta ? (
            <MiniGradePasta subApps={item.subApps!} />
          ) : (
            <Icone size={26} aria-hidden strokeWidth={1.5} className="text-white" />
          )}
        </Squircle>
        <BadgeContador n={badge} />
      </span>
      {/* Duas linhas, e NÃO `truncate`: "Central de Clientes" e "Conteúdo &
          Redes" saíam como "Central de ..." — nome de app cortado obriga o
          usuário a adivinhar qual ícone é qual, que é o oposto do que uma
          área de trabalho existe para fazer. Altura fixa em duas linhas para
          os ícones da grade continuarem alinhados entre si. */}
      <span className="flex h-[30px] w-full max-w-[92px] items-start justify-center text-center text-[12px] leading-[15px] text-texto-2 group-hover:text-texto">
        {item.nome}
      </span>
    </>
  );
}

/** Encolhe para 0,96 em 120ms ao apertar, levanta 2px no hover — nada gira, nada pisca. */
const CLASSE_TOQUE =
  "group flex flex-col items-center gap-2 rounded-2xl p-1.5 text-center transition-transform duration-[120ms] ease-out hover:-translate-y-0.5 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primaria-2 focus-visible:ring-offset-2 focus-visible:ring-offset-fundo";

function TileApp({
  app,
  badge,
  pastaAberta,
  onAbrirPasta,
}: {
  app: AppCatalogo;
  badge?: number | null;
  pastaAberta: boolean;
  onAbrirPasta: () => void;
}) {
  const ehPasta = (app.subApps?.length ?? 0) > 0;

  if (ehPasta) {
    return (
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={pastaAberta}
        onClick={onAbrirPasta}
        className={CLASSE_TOQUE}
      >
        <ConteudoIcone item={app} badge={badge} />
      </button>
    );
  }

  return (
    <Link href={app.href} className={CLASSE_TOQUE}>
      <ConteudoIcone item={app} badge={badge} />
    </Link>
  );
}

/** Elementos focáveis do painel — mesma base da prisão de foco do KpiDetalhe. */
const FOCAVEIS = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * A pasta aberta: painel que cresce de 0,92/opacidade-0 até o normal em
 * 200ms (`.pasta-abre`, no fim de globals.css), sem sair da página. Clicar
 * fora ou apertar Esc fecha; clicar num sub-app navega E fecha.
 */
function PainelPasta({ app, onFechar }: { app: AppCatalogo; onFechar: () => void }) {
  const painelRef = useRef<HTMLDivElement>(null);
  const tituloId = useId();
  const subApps = ordenarApps(app.subApps ?? []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onFechar();
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
  }, [onFechar]);

  useEffect(() => {
    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = anterior;
    };
  }, []);

  useEffect(() => {
    painelRef.current?.querySelector<HTMLElement>(FOCAVEIS)?.focus();
  }, []);

  return (
    <div
      className="fixed inset-0 z-[75] flex items-center justify-center bg-black/60 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onFechar();
      }}
    >
      <div
        ref={painelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        className="pasta-abre bevel superficie w-full max-w-md rounded-[28px] border border-borda-forte p-5 shadow-e4"
      >
        <div className="mb-5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p id={tituloId} className="font-display text-base font-normal text-texto">
              {app.nome}
            </p>
            <p className="mt-0.5 text-xs text-texto-3">{app.frase}</p>
          </div>
          <button
            type="button"
            aria-label="Fechar"
            onClick={onFechar}
            className="trans -mr-1 -mt-1 shrink-0 rounded-lg p-1.5 text-texto-2 hover:bg-eleva hover:text-texto"
          >
            <X size={16} aria-hidden strokeWidth={1.5} />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4">
          {subApps.map((sub) => (
            <Link key={sub.id} href={sub.href} onClick={onFechar} className={CLASSE_TOQUE}>
              <ConteudoIcone item={sub} />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * A grade: 3 colunas no celular, 4 no tablet, 6 no desktop — o fundo aurora
 * que já existe (`.aurora`, ligado no layout de (app)) faz de papel de parede.
 * `badges`: mapa id-do-app → contador; um app sem entrada, ou com valor que
 * `badgeValido` rejeita, simplesmente não desenha badge nenhum.
 *
 * Os gaps de celular (`gap-x-3 gap-y-5 py-1`) são mais apertados que os do
 * tablet/desktop (`sm:gap-x-6 sm:gap-y-7 sm:py-2`) de propósito: a tela
 * inicial tem DUAS grades (apps de trabalho + "Sistema", ver
 * src/app/(app)/page.tsx) e em 390×844 a soma das duas com o gap antigo
 * estourava a altura da tela — ninguém abre uma "área de trabalho" para
 * rolar. O tablet e o desktop têm sobra vertical de sobra; não precisam do
 * mesmo aperto.
 */
export function Springboard({
  apps,
  badges = {},
}: {
  apps: AppCatalogo[];
  badges?: Partial<Record<string, number | null | undefined>>;
}) {
  const [pastaAbertaId, setPastaAbertaId] = useState<string | null>(null);
  const pastaAberta = apps.find((a) => a.id === pastaAbertaId) ?? null;

  return (
    <>
      <div
        className={cx(
          "grid grid-cols-3 gap-x-3 gap-y-5 py-1 sm:grid-cols-4 sm:gap-x-6 sm:gap-y-7 sm:py-2 lg:grid-cols-6"
        )}
      >
        {apps.map((app) => (
          <TileApp
            key={app.id}
            app={app}
            badge={badges[app.id]}
            pastaAberta={pastaAbertaId === app.id}
            onAbrirPasta={() => setPastaAbertaId(app.id)}
          />
        ))}
      </div>
      {pastaAberta ? (
        <PainelPasta app={pastaAberta} onFechar={() => setPastaAbertaId(null)} />
      ) : null}
    </>
  );
}
