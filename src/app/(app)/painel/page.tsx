import { Activity, AlarmClock, ArrowRight, CalendarDays, CheckSquare, CircleUserRound, Crosshair, Users } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { getDB } from "@/lib/data";
import { fmtBRL } from "@/lib/format";
import { mesFinanceiro, saudeNegocio } from "@/lib/metrics";

export const dynamic = "force-dynamic";

const ym = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const iniciais = (nome: string) => nome.split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
const duracao = (inicio: string, fim: string | null) => fim ? `${Math.max(0, Math.round((new Date(fim).getTime() - new Date(inicio).getTime()) / 60000))} min` : "60 min";

function Painel({ titulo, icone: Icone, acao, children, className = "" }: { titulo: string; icone: typeof CalendarDays; acao?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`rounded-[11px] border border-[#273247] bg-[#07111f]/88 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,.025)] ${className}`}><header className="mb-4 flex items-center gap-3"><Icone size={21} strokeWidth={1.65} className="text-[#1972ff]" aria-hidden /><h2 className="text-[16px] font-semibold tracking-[-0.02em] text-[#f4f7ff]">{titulo}</h2>{acao ? <div className="ml-auto">{acao}</div> : null}</header>{children}</section>;
}

function LinkAzul({ href, children }: { href: string; children: ReactNode }) {
  return <Link href={href} className="inline-flex items-center gap-2 text-xs font-medium text-[#2580ff] hover:text-[#62a4ff]">{children}<ArrowRight size={14} aria-hidden /></Link>;
}

export default async function PainelGeral() {
  const db = getDB();
  const [ds, alunos, reunioes, tarefas, atividades, metasFinanceiras] = await Promise.all([db.dataset(), db.listAlunos(), db.listReunioes(), db.listTarefas(), db.listAtividades(), db.listMetasFinanceiras()]);
  const hoje = new Date();
  const reunioesFuturas = reunioes.filter((r) => r.status === "agendada" && new Date(r.inicio).getTime() >= hoje.getTime()).sort((a, b) => a.inicio.localeCompare(b.inicio));
  const proximas = reunioesFuturas.slice(0, 3);
  const pendentes = tarefas.filter((t) => t.status === "pendente");
  const saude = saudeNegocio(alunos, ds, tarefas, proximas.filter((r) => r.inicio.slice(0, 10) === hoje.toISOString().slice(0, 10)).length, metasFinanceiras, atividades, hoje);
  const resultado = mesFinanceiro(ds, ym(hoje));
  const clientes = alunos.filter((aluno) => aluno.statusFunil === "novo" || aluno.statusFunil === "recorrente").slice(0, 3);
  const meta = saude.metaFaturamento;
  const pctAtivos = saude.baseTotal ? Math.round((saude.ativos / saude.baseTotal) * 100) : 0;
  const realizadas = reunioes.filter((r) => r.status === "realizada").length;
  const pctRealizadas = reunioes.length ? Math.round((realizadas / reunioes.length) * 100) : 0;

  return <div data-painel-visual="referencia-aprovada" className="mx-auto max-w-[1420px] text-[#f4f7ff]">
    <div className="mb-4"><h1 className="text-[34px] font-semibold leading-tight tracking-[-0.04em]">Visão geral</h1><p className="mt-0.5 text-[17px] text-[#a6afc1]">O que precisa da sua atenção hoje</p></div>

    <div className="grid gap-3 lg:grid-cols-[1.45fr_1fr]">
      <Painel titulo="Próximos atendimentos" icone={CalendarDays} acao={<LinkAzul href="/agenda">Ver agenda</LinkAzul>}>
        <div className="divide-y divide-[#263247]">{proximas.length ? proximas.map((r) => <div key={r.id} className="grid min-h-[68px] grid-cols-[72px_1fr_auto] items-center gap-3 py-2"><div><p className="text-[17px] font-semibold text-[#2781ff]">{r.inicio.slice(11, 16)}</p><p className="text-xs text-[#9da7ba]">{duracao(r.inicio, r.fim)}</p></div><div className="flex min-w-0 items-center gap-3 border-l border-[#344056] pl-4"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#0d63ed] text-xs font-semibold">{iniciais(r.comQuem || "Cliente")}</span><div className="min-w-0"><p className="truncate text-sm font-semibold">{r.comQuem || "Atendimento"}</p><p className="truncate text-xs text-[#9da7ba]">{r.titulo}</p></div></div><Link href={r.alunoId ? `/crm/${r.alunoId}` : "/agenda"} className="rounded-md border border-[#1769ff] px-4 py-2 text-xs font-medium text-[#3b8cff] hover:bg-[#1769ff]/10">Abrir cliente</Link></div>) : <p className="py-10 text-center text-sm text-[#8f99ad]">Nenhum atendimento futuro agendado.</p>}</div>
      </Painel>

      <Painel titulo="Atenção hoje" icone={AlarmClock}><div className="space-y-3">{[
        { titulo: `${reunioesFuturas.length} atendimentos aguardando`, detalhe: proximas.map((r) => r.comQuem).filter(Boolean).join(" e ") || "Agenda livre", Icone: CircleUserRound },
        { titulo: `${pendentes.length} tarefas de acompanhamento pendentes`, detalhe: "Revise prioridades e próximos passos", Icone: CheckSquare },
        { titulo: `${saude.semContato45} clientes sem contato há 45+ dias`, detalhe: "Retomar conexão e manter engajamento", Icone: Users },
      ].map(({ titulo, detalhe, Icone }) => <div key={titulo} className="flex items-center gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#10284b] text-[#438dff]"><Icone size={18} strokeWidth={1.6} /></span><div className="min-w-0"><p className="truncate text-[13px] font-medium">{titulo}</p><p className="truncate text-xs text-[#8f99ad]">{detalhe}</p></div><ArrowRight size={15} className="ml-auto text-[#d6dbea]" aria-hidden /></div>)}</div></Painel>
    </div>

    <div className="mt-3 grid gap-3 lg:grid-cols-[1.2fr_.72fr_.72fr]">
      <Painel titulo="Clientes em acompanhamento" icone={Users}><div className="divide-y divide-[#263247]">{clientes.length ? clientes.map((c) => <div key={c.id} className="grid grid-cols-[1.15fr_.8fr_auto] items-center gap-3 py-3"><div className="flex min-w-0 items-center gap-2.5"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0d63ed] text-[11px] font-semibold">{iniciais(c.nome)}</span><div className="min-w-0"><p className="truncate text-xs font-semibold">{c.nome}</p><p className="truncate text-[11px] text-[#8f99ad]">{c.origem || "Mentoria individual"}</p></div></div><div><p className="text-[11px] text-[#aeb7c8]">Relacionamento</p><p className="mt-0.5 text-xs font-medium capitalize text-[#22d3c5]">{c.statusFunil}</p></div><Link href={`/crm/${c.id}`} className="rounded-md border border-[#1769ff] px-3 py-1.5 text-[11px] text-[#3b8cff]">Abrir cliente</Link></div>) : <p className="py-10 text-center text-sm text-[#8f99ad]">Nenhum cliente em acompanhamento.</p>}</div><div className="mt-4 text-center"><LinkAzul href="/crm">Ver todos os clientes</LinkAzul></div></Painel>

      <Painel titulo="Metas em andamento" icone={Crosshair}><div className="space-y-6 pt-1">{[
        { titulo: "Faturamento mensal", detalhe: meta ? `Meta: ${fmtBRL(meta.alvo)}` : "Meta ainda não definida", pct: Math.min(100, Math.round(meta?.pct ?? 0)), cor: "#22d3c5" },
        { titulo: "Clientes ativos", detalhe: `${saude.ativos} de ${saude.baseTotal} clientes`, pct: pctAtivos, cor: "#2580ff" },
        { titulo: "Atendimentos realizados", detalhe: `${realizadas} de ${reunioes.length} atendimentos`, pct: pctRealizadas, cor: "#f59e0b" },
      ].map((item) => <div key={item.titulo}><div className="flex items-start justify-between gap-2"><div><p className="text-xs font-semibold">{item.titulo}</p><p className="mt-0.5 text-[11px] text-[#8f99ad]">{item.detalhe}</p></div><strong className="text-sm" style={{ color: item.cor }}>{item.pct}%</strong></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#263247]"><span className="block h-full rounded-full" style={{ width: `${item.pct}%`, backgroundColor: item.cor }} /></div></div>)}</div><div className="mt-6 text-center"><LinkAzul href="/financeiro">Ver todas as metas</LinkAzul></div></Painel>

      <Painel titulo="Saúde do negócio" icone={Activity}><div className="divide-y divide-[#263247]">{[
        ["Relacionamentos ativos", String(saude.ativos), saude.ativos > 0 ? "Bom" : "Atenção"],
        ["Atendimentos agendados", String(reunioesFuturas.length), reunioesFuturas.length > 0 ? "Bom" : "Livre"],
        ["Tarefas pendentes", String(saude.tarefasPendentes), saude.tarefasPendentes > 5 ? "Atenção" : "Bom"],
      ].map(([rotulo, valor, estado]) => <div key={rotulo} className="flex items-center py-4"><div><p className="text-[11px] text-[#8f99ad]">{rotulo}</p><p className="text-[21px] font-semibold">{valor}</p></div><span className="ml-auto text-xs font-medium text-[#22d3c5]">{estado}</span></div>)}</div><div className="mt-4 text-center"><LinkAzul href="/analise">Ver indicadores detalhados</LinkAzul></div></Painel>
    </div>

    <Painel titulo="Resumo da operação" icone={Activity} className="mt-3"><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">{[
      ["Faturamento do mês", fmtBRL(resultado.faturamento)], ["Receita líquida", fmtBRL(resultado.liquido)], ["Clientes ativos", String(saude.ativos)], ["Sessões agendadas", String(reunioesFuturas.length)], ["Pendências", String(saude.tarefasPendentes)],
    ].map(([rotulo, valor], i) => <div key={rotulo} className={i ? "border-l border-[#2a3549] pl-5" : ""}><p className="text-xs text-[#9da7ba]">{rotulo}</p><p className="mt-1 text-[20px] font-semibold">{valor}</p></div>)}</div></Painel>
  </div>;
}
