"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import type { GrupoNavLateral } from "@/lib/nav-lateral";
import { Marca, SidebarNav } from "./sidebar";

export function AppFrame({ grupos, topbar, menuMobile, barraAbas, children }: {
  grupos: GrupoNavLateral[];
  topbar: ReactNode;
  menuMobile: ReactNode;
  barraAbas: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  if (pathname === "/") {
    return <div data-shell="launcher" className="mx-auto w-full max-w-[1440px]"><div className="min-w-0 flex-1">{topbar}{menuMobile}<main className="px-4 pb-[calc(4.75rem+env(safe-area-inset-bottom))] pt-7 md:px-8 md:pb-8 md:pt-10">{children}</main>{barraAbas}</div></div>;
  }
  return (
    <div data-shell="interno" className="mx-auto flex min-h-[100dvh] w-full max-w-[1680px]">
      <aside className="sticky top-0 hidden h-[100dvh] w-[232px] shrink-0 flex-col border-r border-white/[0.08] bg-[#030917]/95 px-3 py-6 md:flex">
        <Link href="/" aria-label="Seu espaço de trabalho" className="mb-7 px-3"><Marca /></Link>
        <SidebarNav grupos={grupos} modoPainel />
        <Link href="/agenda" className="mt-auto flex items-center gap-3 rounded-lg border border-white/[0.05] bg-[#071326] px-4 py-3 text-sm text-[#2f7cff] transition-colors hover:border-[#1f6fff]/50 hover:bg-[#0a1830]"><Plus size={18} strokeWidth={1.7} aria-hidden />Nova sessão</Link>
      </aside>
      <div className="min-w-0 flex-1">{topbar}{menuMobile}<main className="px-4 pb-[calc(4.75rem+env(safe-area-inset-bottom))] pt-7 md:px-7 md:pb-8 md:pt-6">{children}</main>{barraAbas}</div>
    </div>
  );
}
