// "Começar" — o passo a passo que tira a planilha do zero.
//
// A planilha do cliente nasce com todas as abas de entrada em zero linhas: o
// painel calcula certo e mostra vazio porque não existe cadastro base. Esta
// tela existe para o dono do negócio, que não é técnico, resolver isso sem
// precisar entender o que é "responsável" ou por que precisa de "conta" antes
// de alguém explicar em uma frase.

import { ArrowRight, CheckCircle2, Compass, Flag, ListChecks, Plus, Target, Users, Wallet } from "lucide-react";
import { ComecarPassos } from "@/components/comecar-passos";
import { getDB } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function Comecar() {
  const db = getDB();
  const [produtos, responsaveis, contas, metas, agrupamentos] = await Promise.all([
    db.listProdutos(),
    db.listAfiliados(),
    db.listContasBancarias(),
    db.listMetasFinanceiras(),
    db.listAgrupamentos(),
  ]);
  const anoAtual = new Date().getFullYear();
  const metasDoAno = metas.filter((meta) => meta.periodo.startsWith(String(anoAtual)));
  const passos = [
    {
      id: "produtos",
      titulo: "Fontes de renda",
      descricao: "Cadastre seus programas e serviços.",
      concluido: produtos.length > 0,
      quantidade: produtos.length,
      acao: "Adicionar fonte de renda",
      icone: ListChecks,
    },
    {
      id: "responsaveis",
      titulo: "Pessoas responsáveis",
      descricao: "Adicione sua equipe e defina funções.",
      concluido: responsaveis.length > 0,
      quantidade: responsaveis.length,
      acao: "Adicionar responsável",
      icone: Users,
    },
    {
      id: "contas",
      titulo: "Contas e recebimentos",
      descricao: "Defina para onde os recebimentos serão destinados.",
      concluido: contas.length > 0,
      quantidade: contas.length,
      acao: "Adicionar conta",
      icone: Wallet,
    },
    {
      id: "metas",
      titulo: "Metas de operação",
      descricao: "Defina a direção e os objetivos da operação.",
      concluido: metasDoAno.length > 0,
      quantidade: metasDoAno.length,
      acao: "Definir meta",
      icone: Target,
    },
  ];
  const concluidos = passos.filter((passo) => passo.concluido).length;
  const percentual = Math.round((concluidos / passos.length) * 100);
  const proximoPasso = passos.find((passo) => !passo.concluido) ?? null;
  const rotuloProgresso = `${concluidos} de ${passos.length} etapa${passos.length === 1 ? "" : "s"} de configuração concluída${concluidos === 1 ? "" : "s"}`;

  return (
    <main data-comecar-visual="referencia-aprovada" className="mx-auto max-w-[1320px] pb-10">
      <style>{`body:has([data-comecar-visual="referencia-aprovada"]) [data-faixa-simulacao] { display: none; }`}</style>
      <p className="sr-only">Configuração guiada do espaço de trabalho. Os cadastros continuam disponíveis abaixo do resumo.</p>

      <header className="mb-7 flex flex-wrap items-end justify-between gap-5">
        <div>
          <h1 className="font-display text-[clamp(30px,3vw,36px)] font-medium leading-none tracking-[-0.045em]">Prepare seu espaço</h1>
          <p className="mt-2 text-[15px] text-texto-2">Quatro passos para começar com clareza — cada um libera o próximo.</p>
        </div>
        <nav aria-label="Ações de configuração" className="flex flex-wrap items-center justify-end gap-2">
          <a href="/tour" className="inline-flex min-h-12 items-center gap-2 rounded-lg border border-borda px-4 text-sm font-medium text-texto transition hover:border-primaria/60 hover:bg-painel-2"><Compass size={18} aria-hidden /> Ver tour</a>
          <a href={`#${proximoPasso?.id ?? "passos-cadastro"}`} className="inline-flex min-h-12 items-center gap-2 rounded-lg bg-primaria px-5 text-sm font-medium text-white shadow-[0_10px_22px_rgba(24,99,255,.25)] transition hover:bg-primaria-2"><Plus size={18} aria-hidden /> Continuar configuração</a>
        </nav>
      </header>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.68fr)_minmax(320px,0.84fr)]">
        <section aria-label="Seu progresso" className="overflow-hidden rounded-xl border border-borda bg-painel/70 shadow-[0_12px_30px_rgba(0,0,0,.12)]">
          <div className="p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-[21px] font-semibold tracking-[-0.035em]">Seu progresso</h2>
                <p className="mt-1 text-sm text-texto-2">{rotuloProgresso}</p>
              </div>
              <strong className="text-[24px] font-semibold tabular-nums text-texto">{percentual}%</strong>
            </div>
            <div className="mt-4 h-3 overflow-hidden rounded-full bg-eleva" aria-label={`${percentual}% das etapas concluídas`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percentual}>
              <span className="block h-full rounded-full bg-gradient-to-r from-primaria-2 to-positivo" style={{ width: `${percentual}%` }} />
            </div>
            <p className="mt-4 text-sm text-texto-2">Você pode voltar a qualquer etapa depois.</p>
          </div>
          <ol className="divide-y divide-borda border-t border-borda">
            {passos.map((passo, indice) => {
              const Icone = passo.icone;
              const proximo = !passo.concluido && passo.id === proximoPasso?.id;
              const status = passo.concluido ? "Concluído" : proximo ? "Próximo passo" : "A seguir";
              return <li key={passo.id} className="flex items-center gap-3 px-5 py-4"><span className={`grid size-10 shrink-0 place-items-center rounded-full border text-sm font-semibold ${passo.concluido ? "border-positivo text-positivo" : proximo ? "border-primaria-2 text-primaria-2" : "border-borda text-texto-2"}`}>{passo.concluido ? <CheckCircle2 size={20} aria-label="Concluído" /> : indice + 1}</span><span className="grid size-11 shrink-0 place-items-center rounded-lg border border-borda bg-poco text-texto-2"><Icone size={21} strokeWidth={1.6} aria-hidden /></span><span className="min-w-0 flex-1"><span className="block text-[16px] font-semibold tracking-[-0.02em]">{passo.titulo}</span><span className="mt-1 block text-sm text-texto-2">{passo.descricao}</span></span><a href={`#${passo.id}`} className={`hidden shrink-0 rounded-lg border px-3 py-2 text-xs font-medium transition sm:inline-flex ${passo.concluido ? "border-positivo/45 bg-positivo/10 text-positivo" : proximo ? "border-primaria bg-primaria text-white" : "border-borda bg-eleva text-texto-2 hover:border-primaria/60"}`}>{passo.concluido && passo.quantidade > 1 ? `${passo.quantidade} cadastrados` : status}</a><ArrowRight size={17} aria-hidden className="shrink-0 text-texto-3" /></li>;
            })}
          </ol>
        </section>

        <aside className="grid content-start gap-3">
          <section className="rounded-xl border border-borda bg-painel/70 p-5 shadow-[0_12px_30px_rgba(0,0,0,.12)]">
            <h2 className="text-[21px] font-semibold tracking-[-0.035em]">Por onde começar</h2>
            <div className="mt-5 border-t border-borda pt-5">
              <span className="grid size-14 place-items-center rounded-full border border-primaria-2/65 bg-primaria/10 text-primaria-2"><Users size={27} strokeWidth={1.6} aria-hidden /></span>
              <h3 className="mt-4 text-[21px] font-semibold leading-tight tracking-[-0.035em]">{proximoPasso ? proximoPasso.titulo : "Sua base está pronta"}</h3>
              <p className="mt-2 text-sm leading-relaxed text-texto-2">{proximoPasso ? proximoPasso.descricao : "Revise os cadastros quando quiser atualizar sua operação."}</p>
              <a href={`#${proximoPasso?.id ?? "passos-cadastro"}`} className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-primaria px-4 text-sm font-medium text-white shadow-[0_10px_22px_rgba(24,99,255,.25)] transition hover:bg-primaria-2"><Plus size={18} aria-hidden /> {proximoPasso?.acao ?? "Revisar cadastros"}</a>
            </div>
          </section>

          <section className="rounded-xl border border-borda bg-painel/70 p-5 shadow-[0_12px_30px_rgba(0,0,0,.12)]">
            <h2 className="text-[21px] font-semibold tracking-[-0.035em]">Acompanhamento</h2>
            <div className="mt-5 flex gap-4 border-t border-borda pt-5"><span className="grid size-14 shrink-0 place-items-center rounded-full border border-positivo/65 bg-positivo/10 text-positivo"><CheckCircle2 size={27} strokeWidth={1.6} aria-hidden /></span><div><p className="text-sm leading-relaxed text-texto-2">Quando a base estiver pronta, acompanhe agenda, clientes e evolução em um só lugar.</p><a href="/painel" className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-primaria-2 hover:text-primaria">Abrir visão geral <ArrowRight size={16} aria-hidden /></a></div></div>
          </section>
        </aside>
      </div>

      <section className="mt-3 flex flex-wrap items-center gap-4 rounded-xl border border-borda bg-painel/70 p-5 shadow-[0_12px_30px_rgba(0,0,0,.12)]">
        <span className="grid size-14 shrink-0 place-items-center rounded-lg border border-primaria-2/50 bg-poco text-primaria-2"><Flag size={28} strokeWidth={1.5} aria-hidden /></span>
        <div className="min-w-0 flex-1"><h2 className="text-[21px] font-semibold tracking-[-0.035em]">Tour guiado</h2><p className="mt-1 text-sm text-texto-2">Conheça os indicadores da sua operação em poucos minutos.</p></div>
        <a href="/tour" className="inline-flex min-h-12 items-center gap-2 rounded-lg border border-borda px-5 text-sm font-medium text-texto transition hover:border-primaria/60 hover:bg-painel-2"><Compass size={18} aria-hidden /> Iniciar tour</a>
      </section>

      <section id="passos-cadastro" className="mt-8 scroll-mt-24">
        <h2 className="mb-1 text-[21px] font-semibold tracking-[-0.035em]">Cadastros e formulários</h2>
        <p className="mb-4 text-sm text-texto-2">Use os formulários abaixo para concluir ou revisar cada etapa.</p>
        <ComecarPassos
          bloqueado={db.modo === "vazio"}
          produtos={produtos}
          responsaveis={responsaveis}
          contas={contas}
          metas={metas}
          agrupamentos={agrupamentos}
        />
      </section>
    </main>
  );
}
