"use client";

// Barra de abas do celular — a faixa fixa embaixo, ao alcance do polegar.
//
// O QUE ELA NÃO É (correção pedida pelo cliente)
// ----------------------------------------------
// A primeira versão repetia destinos de navegação aqui embaixo: Painel,
// Financeiro, Clientes. Ele não gostou, e tinha razão — os aplicativos já
// moram na tela inicial, em ícone grande, e repetir quatro deles numa faixa
// de 10px de rótulo é dizer a mesma coisa duas vezes com menos qualidade.
//
// O QUE ELA É AGORA
// -----------------
// Só o que NÃO cabe em nenhuma tela por natureza — as quatro coisas que a
// pessoa quer poder fazer de qualquer lugar do sistema:
//   · Início   — voltar para os aplicativos, de dentro de qualquer app;
//   · Avisos   — o quadro do dia (reunião, tarefa, cliente sumido);
//   · Tour     — a leitura guiada dos resultados da empresa;
//   · Mais     — a gaveta com a navegação completa e os filtros.
//
// Coordenar duas ilhas de estado (esta barra não sabe nada sobre "gaveta
// aberta", que mora em menu-mobile.tsx, nem sobre "quadro aberto", que mora
// em avisos-dock.tsx) sem inventar Context: um CustomEvent na window, o mesmo
// padrão que "raro:abrir-paleta" já usa neste projeto.

import { Bell, Compass, LayoutGrid, Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { EVENTO_ABRIR_AVISOS } from "./avisos-dock";
import { EVENTO_ABRIR_GAVETA } from "./menu-mobile";
import { cx } from "./ui";

const CLASSE_ALVO =
  "toque trans flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] leading-none";

export function BarraAbas({ pendencias = 0 }: { pendencias?: number }) {
  const pathname = usePathname();
  const naInicial = pathname === "/";
  const noTour = pathname.startsWith("/tour");

  return (
    <nav
      aria-label="Ações de qualquer lugar"
      // `.vidro-forte` e não `.vidro`: o conteúdo rola POR BAIXO desta barra o
      // tempo todo, e com o vidro normal dava para ler a frase de trás
      // atravessando os rótulos. `.safe-bottom` soma o home indicator do
      // iPhone ao padding.
      className="vidro-forte safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-borda-sutil md:hidden"
    >
      <div className="mx-auto flex max-w-[520px] items-stretch">
        <Link
          href="/"
          aria-current={naInicial ? "page" : undefined}
          className={cx(CLASSE_ALVO, naInicial ? "text-primaria-2" : "text-texto-3")}
        >
          <LayoutGrid size={20} aria-hidden strokeWidth={1.5} />
          <span>Início</span>
        </Link>

        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent(EVENTO_ABRIR_AVISOS))}
          aria-label={
            pendencias > 0 ? `Avisos — ${pendencias} pendências` : "Quadro de avisos"
          }
          className={cx(CLASSE_ALVO, "relative text-texto-3")}
        >
          <Bell size={20} aria-hidden strokeWidth={1.5} />
          {pendencias > 0 && (
            <span className="absolute right-[22%] top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primaria px-1 text-[10px] font-medium leading-none text-white">
              {pendencias}
            </span>
          )}
          <span>Avisos</span>
        </button>

        <Link
          href="/tour"
          aria-current={noTour ? "page" : undefined}
          className={cx(CLASSE_ALVO, noTour ? "text-primaria-2" : "text-texto-3")}
        >
          <Compass size={20} aria-hidden strokeWidth={1.5} />
          <span>Tour</span>
        </Link>

        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent(EVENTO_ABRIR_GAVETA))}
          aria-label="Mais opções — abre o menu completo"
          className={cx(CLASSE_ALVO, "text-texto-3")}
        >
          <Menu size={20} aria-hidden strokeWidth={1.5} />
          <span>Mais</span>
        </button>
      </div>
    </nav>
  );
}
