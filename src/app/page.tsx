import Link from "next/link";
import type { Metadata } from "next";
import { Marca } from "@/components/sidebar";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "MentorOS — operação organizada para sua mentoria",
  description: "Clientes, sessões, jornadas e operação para mentores e pequenas equipes.",
  robots: { index: true, follow: true },
};

const ganhos = [
  ["Clientes e jornadas", "Uma visão clara de cada pessoa, sem planilhas espalhadas."],
  ["Sessões com contexto", "Prepare perguntas, registre decisões e retome a conversa certa."],
  ["Operação em movimento", "Agenda, tarefas e indicadores para a mentoria não depender da memória."],
];

export default function LandingPage() {
  return (
    <main className="min-h-screen overflow-hidden px-5 py-6 sm:px-8 lg:px-12">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(52rem_36rem_at_7%_4%,rgb(var(--primaria)/0.22),transparent_68%),radial-gradient(42rem_30rem_at_88%_70%,rgb(var(--info)/0.13),transparent_72%)]" />
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 py-3">
        <Marca />
        <nav className="flex items-center gap-3 text-sm">
          <Link href="/login" className="rounded-full px-3 py-2 text-texto-2 transition-colors hover:text-texto">Entrar</Link>
          <Link href="/criar-conta" className="rounded-full bg-primaria px-4 py-2 font-medium text-white transition-colors hover:bg-primaria-hover">Teste grátis</Link>
        </nav>
      </header>

      <section className="mx-auto grid max-w-6xl items-center gap-12 py-20 lg:grid-cols-[1.08fr_0.92fr] lg:py-28">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primaria-2">MentorOS para mentores e pequenas equipes</p>
          <h1 className="mt-5 max-w-[11ch] font-display text-[clamp(44px,7vw,80px)] font-fino leading-[0.92] tracking-[-0.065em] text-texto">A operação da sua mentoria, em um só lugar.</h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-texto-2">Conduza atendimentos com contexto, acompanhe jornadas e dê previsibilidade para a equipe. O MentorOS organiza o trabalho para você ter mais presença nas conversas.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/criar-conta" className="rounded-full bg-primaria px-5 py-3 text-sm font-medium text-white shadow-[0_12px_30px_-14px_rgb(var(--primaria)/0.95)] transition-colors hover:bg-primaria-hover">Começar teste grátis de 7 dias</Link>
            <Link href="/login" className="rounded-full border border-borda px-5 py-3 text-sm text-texto-2 transition-colors hover:border-borda-forte hover:text-texto">Já tenho uma conta</Link>
          </div>
          <p className="mt-4 text-sm text-texto-3">Sem cartão. Um plano mensal quando você decidir continuar.</p>
        </div>

        <div className="superficie relative overflow-hidden rounded-[32px] border p-5 shadow-e2 sm:p-7">
          <div className="absolute -right-12 -top-16 size-48 rounded-full bg-primaria/15 blur-3xl" />
          <p className="text-xs font-medium uppercase tracking-[0.15em] text-texto-3">Hoje no seu espaço</p>
          <div className="mt-5 rounded-2xl border border-borda-sutil bg-poco p-5">
            <p className="text-sm text-texto-2">Próxima sessão</p>
            <p className="mt-2 font-display text-2xl font-fino text-texto">Conversa de clareza</p>
            <p className="mt-2 text-sm text-primaria-2">Hoje, 14:00 · Preparação pronta</p>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-borda-sutil bg-poco p-4"><p className="text-xs text-texto-3">Jornadas ativas</p><p className="mt-2 font-display text-3xl font-fino">12</p></div>
            <div className="rounded-2xl border border-borda-sutil bg-poco p-4"><p className="text-xs text-texto-3">Tarefas da semana</p><p className="mt-2 font-display text-3xl font-fino">08</p></div>
          </div>
          <div className="mt-4 rounded-2xl border border-positivo/30 bg-positivo/5 p-4 text-sm text-texto-2"><span className="font-medium text-positivo">Foco da semana:</span> transformar intenção em ação com acompanhamento contínuo.</div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 pb-20 md:grid-cols-3">
        {ganhos.map(([titulo, texto]) => <article key={titulo} className="superficie rounded-[24px] border p-5"><h2 className="font-display text-xl font-fino text-texto">{titulo}</h2><p className="mt-3 text-sm leading-relaxed text-texto-2">{texto}</p></article>)}
      </section>
    </main>
  );
}
