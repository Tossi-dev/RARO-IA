"use client";

// Sidebar 248px em grupos (Blueprint v3, Anexo A.7):
// grupos uppercase, item ativo com tint violeta + barra de acento 2px.
//
// B2.7 — OS GRUPOS DEIXARAM DE SER HARDCODED AQUI: a lista completa (com o
// papel de quem está logado já aplicado) mora em src/lib/nav-lateral.ts, um
// módulo NEUTRO lido no servidor. Ver o comentário lá para o porquê — em
// resumo, filtrar dentro de um componente "use client" só esconde da TELA,
// não do bundle JavaScript que já chegou ao navegador; filtrar antes de
// serializar é o que de fato impede alguém de descobrir, pelas devtools, que
// "/financeiro" existe.

import {
  CalendarDays,
  Compass,
  Clapperboard,
  LayoutDashboard,
  LayoutGrid,
  ListChecks,
  Plug,
  Upload,
  Megaphone,
  Route,
  Handshake,
  Trophy,
  UserCircle,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { GrupoNavLateral, NomeIconeLateral } from "@/lib/nav-lateral";
import { cx } from "./ui";

const ICONES: Record<NomeIconeLateral, LucideIcon> = {
  LayoutGrid,
  LayoutDashboard,
  Compass,
  CalendarDays,
  Wallet,
  Users,
  Clapperboard,
  ListChecks,
  Upload,
  Plug,
  Megaphone,
  Route,
  Handshake,
  Trophy,
  UserCircle,
};

export function Marca() {
  // "Mentor" + "OS" no lugar de "raro" + ".ia": o ponto que separava o nome
  // antigo virava só uma letra maiúscula no nome novo, então quem carrega a
  // cor de destaque muda de sufixo para sigla — mesma ideia, peça nova.
  return (
    <span className="font-display text-xl font-fino tracking-tight">
      Mentor<span className="text-primaria-2">OS</span>
    </span>
  );
}

function ativo(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/** `grupos` chega pronto do servidor — já filtrado pelo papel de quem está
 *  logado (`gruposNavPorPapel`, em src/lib/nav-lateral.ts, chamada em
 *  src/app/(app)/layout.tsx). Este componente só desenha; não decide o que
 *  aparece. */
export function SidebarNav({ grupos }: { grupos: GrupoNavLateral[] }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-4">
      {grupos.map((g) => (
        <div key={g.titulo}>
          <p className="mb-1 px-3 text-[11px] font-medium uppercase tracking-wider text-texto-3">
            {g.titulo}
          </p>
          <div className="flex flex-col gap-0.5">
            {g.itens.map(({ href, rotulo, icone }) => {
              const on = ativo(pathname, href);
              const Icone = ICONES[icone];
              return (
                // O item ativo não é mais "fundo violeta transparente": é a
                // pílula do kit, com o gradiente sólido da marca e a luz forte
                // na aresta de cima. Sem a luz, vira um retângulo roxo.
                <Link
                  key={href}
                  href={href}
                  data-ativo={on ? "true" : "false"}
                  className={cx(
                    "pilula flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13px]",
                    on ? "font-medium" : "text-texto-2 hover:bg-eleva hover:text-texto"
                  )}
                >
                  <Icone
                    size={16}
                    aria-hidden
                    strokeWidth={1.5}
                    className={on ? "text-white/90" : undefined}
                  />
                  {rotulo}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

/** Navegação horizontal para telas pequenas — hoje sem uso (nenhuma tela
 *  importa `NavMobile`; `menu-mobile.tsx` tem a própria gaveta), mas mantida
 *  com a mesma assinatura por prop de `SidebarNav` para não reintroduzir,
 *  amanhã, um catálogo hardcoded dentro de um componente cliente. */
export function NavMobile({ grupos }: { grupos: GrupoNavLateral[] }) {
  const pathname = usePathname();
  const todosItens = grupos.flatMap((g) => g.itens);
  return (
    <nav className="flex gap-1 overflow-x-auto">
      {todosItens.map(({ href, rotulo }) => (
        <Link
          key={href}
          href={href}
          data-ativo={ativo(pathname, href) ? "true" : "false"}
          className={cx(
            "pilula whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm",
            ativo(pathname, href) ? "font-medium" : "text-texto-2"
          )}
        >
          {rotulo}
        </Link>
      ))}
    </nav>
  );
}
