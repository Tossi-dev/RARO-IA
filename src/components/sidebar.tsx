"use client";

// Sidebar 248px em grupos (Blueprint v3, Anexo A.7):
// grupos uppercase, item ativo com tint violeta + barra de acento 2px.

import {
  CalendarDays,
  Compass,
  Clapperboard,
  LayoutDashboard,
  LayoutGrid,
  ListChecks,
  Plug,
  Rocket,
  Upload,
  Users,
  Wallet,
  Workflow,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "./ui";

const GRUPOS = [
  {
    titulo: "Visão geral",
    itens: [
      // A área de trabalho com um ícone por app É a raiz do sistema: quem
      // entra no site cai aqui. O Dashboard passou a ser mais um aplicativo,
      // em "/painel" — deixou de ser a porta de entrada.
      { href: "/", rotulo: "Início", Icone: LayoutGrid },
      { href: "/painel", rotulo: "Dashboard", Icone: LayoutDashboard },
      // O tour lê os mesmos números do painel em sequência, uma pergunta por
      // tela — é a porta de entrada de quem não lê painel.
      { href: "/tour", rotulo: "Tour pelos resultados", Icone: Compass },
      { href: "/agenda", rotulo: "Agenda", Icone: CalendarDays },
    ],
  },
  {
    titulo: "Gestão",
    itens: [
      { href: "/financeiro", rotulo: "Financeiro", Icone: Wallet },
      { href: "/crm", rotulo: "Central de Clientes", Icone: Users },
      { href: "/lancamentos", rotulo: "Lançamentos", Icone: Rocket },
    ],
  },
  {
    titulo: "Marketing",
    itens: [{ href: "/conteudo", rotulo: "Conteúdo & Redes", Icone: Clapperboard }],
  },
  {
    titulo: "Sistema",
    itens: [
      { href: "/comecar", rotulo: "Começar", Icone: ListChecks },
      { href: "/coleta", rotulo: "Coleta de dados", Icone: Workflow },
      // Ferramenta de entrada de dado (como "Coleta de dados"), não um dos
      // seis apps de trabalho do catálogo de /inicio — ver comentário em
      // src/lib/apps.ts sobre o que entra e o que fica só na sidebar.
      { href: "/extrato", rotulo: "Importar extrato", Icone: Upload },
      { href: "/integracoes", rotulo: "Integrações", Icone: Plug },
    ],
  },
];

const TODOS_ITENS = GRUPOS.flatMap((g) => g.itens);

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

export function SidebarNav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-4">
      {GRUPOS.map((g) => (
        <div key={g.titulo}>
          <p className="mb-1 px-3 text-[11px] font-medium uppercase tracking-wider text-texto-3">
            {g.titulo}
          </p>
          <div className="flex flex-col gap-0.5">
            {g.itens.map(({ href, rotulo, Icone }) => {
              const on = ativo(pathname, href);
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

/** Navegação horizontal para telas pequenas. */
export function NavMobile() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto">
      {TODOS_ITENS.map(({ href, rotulo }) => (
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
