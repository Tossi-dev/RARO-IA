"use client";

// Sub-navegação do módulo Financeiro. Só exporta COMPONENTE — a lista de rotas
// mora em ./fin-rotas (módulo neutro), porque os server components também leem.
//
// Decisões de usabilidade aqui, todas pedidas pelo dono ("deixar mais
// intuitivo sem perder o que já tem"):
//
// 1. A PERGUNTA da tela ativa aparece embaixo da faixa de abas, em texto, e não
//    só no `title` do link. Tooltip só existe para quem já sabe onde parar o
//    mouse; quem abre o painel pela primeira vez precisa ler na tela o que
//    aquela aba responde.
// 2. `useLinkStatus` marca a aba clicada como pendente ENQUANTO o servidor
//    renderiza. Junto com o `loading.tsx` do módulo, fecha o buraco em que um
//    clique numa tela pesada parecia não ter feito nada.
// 3. (mobile) "Projeção 13 semanas" e companhia não cabem nas 7 abas dentro de
//    390px — a faixa rola. Sem pista, rolagem parece corte: por isso o
//    degradê na borda quando há mais aba fora da tela, o `scroll-snap` pra
//    cada aba parar inteira (nunca cortada no meio) e o auto-scroll que traz
//    a aba ativa pra dentro da área visível ao entrar na tela pelo link.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { REGIME_EXPLICACAO, REGIME_LABEL, ROTAS_FIN } from "./fin-rotas";
import { cx } from "./ui";

function ativo(pathname: string, href: string): boolean {
  return href === "/financeiro" ? pathname === "/financeiro" : pathname.startsWith(href);
}

export function FinSubnav() {
  const pathname = usePathname();
  const atual = ROTAS_FIN.find((r) => ativo(pathname, r.href)) ?? null;
  const navRef = useRef<HTMLElement>(null);
  const [temMaisEsquerda, setTemMaisEsquerda] = useState(false);
  const [temMaisDireita, setTemMaisDireita] = useState(false);

  const medirBordas = () => {
    const el = navRef.current;
    if (!el) return;
    setTemMaisEsquerda(el.scrollLeft > 4);
    setTemMaisDireita(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  };

  // ao trocar de rota (clique numa aba, botão voltar, link direto de fora),
  // a aba ativa entra sozinha na área visível — sem isso, quem chegasse numa
  // aba lá no fim da lista via link direto veria a faixa parada no início.
  useEffect(() => {
    medirBordas();
    const ativa = navRef.current?.querySelector('[aria-current="page"]');
    ativa?.scrollIntoView({ behavior: "smooth", inline: "nearest", block: "nearest" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return (
    <div className="mb-5">
      <div className="relative">
        {/* degradê: pista de que a faixa continua fora da tela. Só aparece
            do lado em que realmente sobra conteúdo — não é decoração fixa. */}
        {temMaisEsquerda && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-0 z-10 w-8 bg-gradient-to-r from-fundo to-transparent md:hidden"
          />
        )}
        <nav
          ref={navRef}
          onScroll={medirBordas}
          aria-label="Seções do financeiro"
          className="flex snap-x snap-proximity gap-1 overflow-x-auto border-b border-borda [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {ROTAS_FIN.map((r) => {
            const on = ativo(pathname, r.href);
            return (
              <Link
                key={r.href}
                href={r.href}
                prefetch
                title={r.pergunta}
                aria-current={on ? "page" : undefined}
                // Ficou `min-h-11` (44px só de altura) em vez da classe
                // `.toque` (que soma `min-width`): dentro desta faixa com
                // `scroll-snap` + `overflow-x-auto`, um `min-width` num item
                // flex corrompe a pintura do texto neste navegador (cada
                // aba pinta por cima da vizinha, sem que layout/DOM acusem
                // nada de errado — isolado prop a prop até sobrar só essa).
                // Largura de alvo aqui já vem sobrando do próprio texto+padding;
                // é a altura que faltava.
                className={cx(
                  "trans -mb-px inline-flex min-h-11 snap-start items-center whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors",
                  on
                    ? "border-primaria font-medium text-primaria-2"
                    : "border-transparent text-texto-2 hover:border-borda-forte hover:text-texto"
                )}
              >
                {r.rotulo}
              </Link>
            );
          })}
        </nav>
        {temMaisDireita && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l from-fundo to-transparent md:hidden"
          />
        )}
      </div>

      {atual ? (
        <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <p className="text-sm text-texto-2">{atual.pergunta}</p>
          <span
            title={REGIME_EXPLICACAO[atual.regime]}
            className="rounded-full border border-borda bg-poco px-2 py-0.5 text-[11px] text-texto-3"
          >
            {REGIME_LABEL[atual.regime]}
          </span>
        </div>
      ) : null}
    </div>
  );
}
