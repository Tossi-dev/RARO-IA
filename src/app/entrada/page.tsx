import Link from "next/link";
import { ArrowRight, BriefcaseBusiness, Compass, ShieldCheck } from "lucide-react";

export const dynamic = "force-dynamic";

export default function EscolherArea() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-fundo px-5 py-8 text-texto sm:px-8 lg:flex lg:items-center lg:justify-center">
      <div className="aurora" aria-hidden />
      <section className="relative mx-auto w-full max-w-5xl">
        <div className="mb-12 flex items-center gap-2 text-2xl font-semibold tracking-tight sm:text-3xl">
          Mentor<span className="text-primaria">OS</span>
        </div>

        <div className="max-w-2xl">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-primaria">Bem-vindo</p>
          <h1 className="font-display text-4xl font-fino tracking-tight sm:text-5xl">Qual área você quer acessar?</h1>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-texto-2 sm:text-lg">
            Escolha a experiência que corresponde ao seu momento. Você poderá trocar de área depois.
          </p>
        </div>

        <div className="mt-10 grid gap-5 md:grid-cols-2">
          <Link
            href="/inicio"
            className="group rounded-[28px] border border-borda-sutil bg-eleva/80 p-7 shadow-[0_20px_70px_-38px_rgba(0,100,255,0.55)] transition duration-200 hover:-translate-y-1 hover:border-primaria/70 hover:bg-eleva sm:p-8"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primaria/15 text-primaria ring-1 ring-primaria/35">
              <BriefcaseBusiness size={27} aria-hidden />
            </div>
            <h2 className="mt-7 text-2xl font-semibold tracking-tight">Área do mentor</h2>
            <p className="mt-3 min-h-14 text-sm leading-relaxed text-texto-2">
              Organize atendimentos, acompanhe clientes, agenda, conteúdo e operação.
            </p>
            <span className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-primaria">
              Entrar como mentor <ArrowRight size={17} className="transition-transform group-hover:translate-x-1" aria-hidden />
            </span>
          </Link>

          <Link
            href="/portal"
            className="group rounded-[28px] border border-borda-sutil bg-eleva/80 p-7 shadow-[0_20px_70px_-38px_rgba(0,220,180,0.35)] transition duration-200 hover:-translate-y-1 hover:border-emerald-400/60 hover:bg-eleva sm:p-8"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-400/10 text-emerald-300 ring-1 ring-emerald-300/30">
              <Compass size={27} aria-hidden />
            </div>
            <h2 className="mt-7 text-2xl font-semibold tracking-tight">Área do mentorado</h2>
            <p className="mt-3 min-h-14 text-sm leading-relaxed text-texto-2">
              Acompanhe sua jornada, sessões, tarefas, conteúdos e evolução.
            </p>
            <span className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-emerald-300">
              Entrar no meu acompanhamento <ArrowRight size={17} className="transition-transform group-hover:translate-x-1" aria-hidden />
            </span>
          </Link>
        </div>

        <p className="mt-8 flex items-center gap-2 text-xs text-texto-3">
          <ShieldCheck size={15} aria-hidden /> Ambiente temporário de demonstração com dados fictícios.
        </p>
      </section>
    </main>
  );
}
