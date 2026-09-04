"use client";

import { AlertTriangle, ArrowRight, CalendarDays, CheckCircle2, Clock3, Flag, Search, Target, UserRoundX, Users } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import type { StatusMatricula } from "@/lib/mentoria/tipos";
import { dataHoraBr } from "./textos";

type Filtro = "todos" | "atencao" | "sem-contato";
export interface LinhaCarteiraVisual {
  id: string;
  matricula: { id: string };
  mentorado: { id: string; nome: string; email: string };
  programa: { nome: string } | null;
  status: StatusMatricula;
  progresso: { percentual: number | null; rotulo: string };
  proxima: { quando: string } | null;
  ultimaRealizada: { quando: string } | null;
  silencio: { dias: number; nunca: boolean } | null;
}
export interface CarteiraVisual { conectado: boolean; motivo: string; linhas: LinhaCarteiraVisual[] }
const iniciais = (nome: string) => nome.split(/\s+/).slice(0, 2).map((parte) => parte[0]).join("").toUpperCase();
const percentualSeguro = (valor: number | null) => valor === null ? null : Math.max(0, Math.min(100, valor));

function partesData(iso: string | null): { data: string; hora: string } {
  if (!iso) return { data: "—", hora: "" };
  const [data = "—", hora = ""] = dataHoraBr(iso).split(" às ");
  return { data, hora };
}

function situacaoDe(linha: LinhaCarteiraVisual): "Em dia" | "Atenção" | "Sem contato" {
  if (linha.silencio && linha.silencio.dias > 14) return "Sem contato";
  if (linha.status === "ativa" && !linha.proxima) return "Atenção";
  return "Em dia";
}

function nestaSemana(iso: string | null, agoraIso: string): boolean {
  if (!iso) return false;
  const agora = Date.parse(agoraIso);
  const quando = Date.parse(iso);
  return Number.isFinite(agora) && Number.isFinite(quando) && quando >= agora && quando <= agora + 7 * 86400000;
}

function Painel({ titulo, icone: Icone, children, className = "" }: { titulo: string; icone: typeof Users; children: ReactNode; className?: string }) {
  return <section className={`rounded-[10px] border border-[#29354a] bg-[#07111f]/90 shadow-[inset_0_1px_0_rgba(255,255,255,.02)] ${className}`}><header className="flex items-center gap-3 px-5 pb-4 pt-5"><Icone size={22} strokeWidth={1.7} className="text-[#257cff]" aria-hidden /><h2 className="text-[17px] font-semibold tracking-[-0.02em] text-[#f5f7fd]">{titulo}</h2></header>{children}</section>;
}

function Indicador({ icone: Icone, titulo, valor, detalhe, tom = "azul" }: { icone: typeof Users; titulo: string; valor: number; detalhe: string; tom?: "azul" | "ambar" | "turquesa" }) {
  const cores = { azul: { fundo: "bg-[#0c2447]", icone: "text-[#368bff]", detalhe: "text-[#3b8cff]" }, ambar: { fundo: "bg-[#3a2512]", icone: "text-[#ff9d25]", detalhe: "text-[#ff9d25]" }, turquesa: { fundo: "bg-[#073537]", icone: "text-[#1fd0c1]", detalhe: "text-[#1fd0c1]" } }[tom];
  return <article className="flex min-h-[126px] items-center gap-4 rounded-[10px] border border-[#29354a] bg-[#07111f]/88 px-5 py-4"><span className={`flex h-[62px] w-[62px] shrink-0 items-center justify-center rounded-full ${cores.fundo}`}><Icone size={29} strokeWidth={1.55} className={cores.icone} aria-hidden /></span><div className="min-w-0"><p className="truncate text-sm text-[#c6cbd6]">{titulo}</p><strong className="mt-0.5 block text-[27px] font-medium leading-none text-white">{valor}</strong><p className={`mt-3 truncate text-xs ${cores.detalhe}`}>{detalhe}</p></div></article>;
}

function LinhaMentorado({ linha }: { linha: LinhaCarteiraVisual }) {
  const ultima = partesData(linha.ultimaRealizada?.quando ?? null);
  const proxima = partesData(linha.proxima?.quando ?? null);
  const situacao = situacaoDe(linha);
  const progresso = percentualSeguro(linha.progresso.percentual);
  const etapa: Record<StatusMatricula, string> = { ativa: "Em andamento", concluida: "Concluída", cancelada: "Cancelada", trancada: "Pausada" };
  const cor = situacao === "Em dia" ? "text-[#21cbb9]" : situacao === "Atenção" ? "text-[#ff9d25]" : "text-[#ff5f63]";
  const barra = situacao === "Sem contato" ? "bg-[#f0525c]" : situacao === "Atenção" ? "bg-[#ff8a24]" : "bg-[#22c7b8]";
  return <div className="grid min-h-[78px] grid-cols-[1.22fr_1fr_.62fr_.62fr_.7fr_.48fr_auto] items-center gap-3 border-t border-[#253045] px-1 py-2.5 text-xs"><div className="flex min-w-0 items-center gap-2.5"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#0d63ed] text-xs font-semibold text-white">{iniciais(linha.mentorado.nome)}</span><div className="min-w-0"><p className="truncate font-semibold text-[#f2f5fb]">{linha.mentorado.nome}</p><p className="truncate text-[10px] text-[#929caf]">{linha.mentorado.email || "E-mail não informado"}</p></div></div><div className="min-w-0"><p className="truncate text-[#eef1f7]">{linha.programa?.nome ?? "Programa não informado"}</p><p className="mt-1 text-[10px] text-[#919bad]">{progresso === null ? "Progresso ainda não mensurável" : `Progresso ${progresso}%`}</p>{progresso !== null && <div className="mt-1 h-1 overflow-hidden rounded-full bg-[#273247]"><span className={`block h-full rounded-full ${barra}`} style={{ width: `${progresso}%` }} /></div>}</div><div><p className="text-[#edf1f8]">{etapa[linha.status]}</p><p className="mt-1 text-[10px] text-[#929caf]">{linha.progresso.rotulo}</p></div><div><p className="text-[#edf1f8]">{ultima.data}</p><p className="mt-1 text-[10px] text-[#929caf]">{ultima.hora}</p></div><div><p className="text-[#edf1f8]">{proxima.data}</p><p className="mt-1 text-[10px] text-[#929caf]">{proxima.hora}</p></div><p className={`font-medium ${cor}`}>{situacao}</p><Link href={`/mentoria/${linha.mentorado.id}`} className="rounded-md border border-[#1769ff] px-3 py-2 text-[11px] font-medium text-[#3b8cff] transition-colors hover:bg-[#1769ff]/10">Abrir ficha</Link></div>;
}

function EstadoSemDados({ carteira }: { carteira: CarteiraVisual }) {
  return <div className="flex min-h-[350px] flex-col items-center justify-center px-8 text-center"><Users size={38} strokeWidth={1.35} className="text-[#3386ff]" aria-hidden /><p className="mt-4 max-w-lg text-sm leading-6 text-[#a3adbf]">{carteira.conectado ? "Nenhum mentorado em programa ainda. Cadastre a pessoa na Central de Clientes para iniciar a jornada." : carteira.motivo}</p>{carteira.conectado && <Link href="/crm" className="mt-5 rounded-md border border-[#1769ff] px-4 py-2 text-sm text-[#3b8cff]">Ir para clientes</Link>}</div>;
}

export function CarteiraVisao({ carteira, agoraIso }: { carteira: CarteiraVisual; agoraIso: string }) {
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const linhas = carteira.linhas;
  const ativos = new Set(linhas.filter((linha) => linha.status === "ativa").map((linha) => linha.mentorado.id)).size;
  const sessoesSemana = linhas.filter((linha) => nestaSemana(linha.proxima?.quando ?? null, agoraIso)).length;
  const emAtencao = linhas.filter((linha) => situacaoDe(linha) !== "Em dia").length;
  const jornadasEmAndamento = linhas.filter((linha) => linha.status === "ativa").length;
  const semContato = linhas.filter((linha) => situacaoDe(linha) === "Sem contato");
  const semProxima = linhas.filter((linha) => linha.status === "ativa" && !linha.proxima);
  const proximas = linhas.filter((linha) => linha.proxima).sort((a, b) => (a.proxima?.quando ?? "").localeCompare(b.proxima?.quando ?? "")).slice(0, 3);
  const progressoConhecido = linhas.filter((linha) => linha.status === "ativa").map((linha) => percentualSeguro(linha.progresso.percentual)).filter((valor): valor is number => valor !== null);
  const progressoMedio = progressoConhecido.length ? Math.round(progressoConhecido.reduce((total, valor) => total + valor, 0) / progressoConhecido.length) : null;
  const filtradas = useMemo(() => { const termo = busca.trim().toLocaleLowerCase("pt-BR"); return linhas.filter((linha) => { const corresponde = !termo || `${linha.mentorado.nome} ${linha.mentorado.email} ${linha.programa?.nome ?? ""}`.toLocaleLowerCase("pt-BR").includes(termo); if (!corresponde) return false; if (filtro === "atencao") return situacaoDe(linha) !== "Em dia"; if (filtro === "sem-contato") return situacaoDe(linha) === "Sem contato"; return true; }); }, [busca, filtro, linhas]);

  const prioridades = [
    { titulo: "Sem contato recente", detalhe: semContato.length ? `${semContato.length} mentorado(s) pedem retomada de contato` : "Nenhum mentorado acima de 14 dias", valor: semContato.length, unidade: "mentorados", Icone: UserRoundX, cor: "text-[#ff9d25]", fundo: "bg-[#382510]" },
    { titulo: "Sem próxima sessão", detalhe: semProxima.length ? "Há jornadas ativas sem novo encontro marcado" : "Todos os acompanhamentos ativos têm sequência", valor: semProxima.length, unidade: "jornadas", Icone: Clock3, cor: "text-[#ff5f63]", fundo: "bg-[#351b27]" },
    { titulo: "Sessões nesta semana", detalhe: sessoesSemana ? "Encontros que precisam de preparação" : "Nenhum encontro nos próximos 7 dias", valor: sessoesSemana, unidade: "sessões", Icone: CalendarDays, cor: "text-[#378cff]", fundo: "bg-[#10294c]" },
  ];

  return <div data-mentoria-visual="referencia-aprovada" className="mx-auto max-w-[1420px] text-[#f4f7ff]">
    <div className="mb-4"><h1 className="text-[34px] font-semibold leading-tight tracking-[-0.04em]">Carteira de mentorados</h1><p className="mt-0.5 text-[17px] text-[#a6afc1]">Acompanhe cada jornada e saiba onde conduzir a próxima conversa.</p></div>
    {!carteira.conectado ? <Painel titulo="Mentoria indisponível" icone={AlertTriangle}><EstadoSemDados carteira={carteira} /></Painel> : <>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Indicador icone={Users} titulo="Mentorados ativos" valor={ativos} detalhe="Pessoas em acompanhamento" /><Indicador icone={CalendarDays} titulo="Sessões nesta semana" valor={sessoesSemana} detalhe="Próximos 7 dias" /><Indicador icone={AlertTriangle} titulo="Precisam de atenção" valor={emAtencao} detalhe={emAtencao ? "Ver lista" : "Carteira em dia"} tom="ambar" /><Indicador icone={Target} titulo="Jornadas em andamento" valor={jornadasEmAndamento} detalhe={progressoMedio === null ? "Progresso ainda não mensurável" : `${progressoMedio}% de progresso médio`} tom="turquesa" /></div>
    <div className="mt-3 grid gap-3 lg:grid-cols-[1.7fr_.78fr]">
      <Painel titulo="Mentorados" icone={Users} className="min-w-0 overflow-hidden">
        <div className="flex flex-col gap-3 px-5 pb-4 xl:flex-row xl:items-center"><label className="flex h-10 min-w-[245px] items-center gap-2 rounded-md border border-[#29354a] bg-[#08111f] px-3 text-[#929caf]"><Search size={17} strokeWidth={1.6} aria-hidden /><span className="sr-only">Buscar mentorado</span><input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar mentorado" className="min-w-0 flex-1 bg-transparent text-xs text-white outline-none placeholder:text-[#929caf]" /></label><div className="flex h-10 overflow-hidden rounded-md border border-[#29354a]">{([['todos', 'Todos'], ['atencao', 'Em atenção'], ['sem-contato', 'Sem contato']] as const).map(([valor, rotulo]) => <button key={valor} type="button" onClick={() => setFiltro(valor)} aria-pressed={filtro === valor} className={`border-r border-[#29354a] px-4 text-xs last:border-r-0 ${filtro === valor ? "bg-[#0c1c34] text-[#3185ff] ring-1 ring-inset ring-[#1769ff]" : "text-[#d8dce5] hover:bg-[#0b1728]"}`}>{rotulo}</button>)}</div><Link href="/crm" className="ml-auto rounded-md border border-[#1769ff] px-4 py-2.5 text-xs font-medium text-[#3b8cff] transition-colors hover:bg-[#1769ff]/10">Ir para clientes</Link></div>
        {linhas.length === 0 ? <EstadoSemDados carteira={carteira} /> : <><div className="overflow-x-auto px-5"><div className="min-w-[850px]"><div className="grid grid-cols-[1.22fr_1fr_.62fr_.62fr_.7fr_.48fr_auto] gap-3 px-1 pb-3 text-[10px] text-[#c0c6d2]"><span>Mentorado</span><span>Jornada / Programa</span><span>Etapa atual</span><span>Última sessão</span><span>Próxima sessão</span><span>Situação</span><span /></div>{filtradas.map((linha) => <LinhaMentorado key={linha.id} linha={linha} />)}{filtradas.length === 0 && <p className="border-t border-[#253045] py-12 text-center text-sm text-[#929caf]">Nenhum mentorado corresponde à busca e ao filtro.</p>}</div></div><div className="px-5 py-5"><Link href="/mentoria" className="inline-flex items-center gap-2 text-xs font-medium text-[#2f83ff]">Ver todos os mentorados <ArrowRight size={15} aria-hidden /></Link></div></>}
      </Painel>
      <div className="space-y-3"><Painel titulo="Prioridades de atendimento" icone={Flag}><div className="divide-y divide-[#253045] px-5">{prioridades.map(({ titulo, detalhe, valor, unidade, Icone, cor, fundo }) => <div key={titulo} className="flex min-h-[94px] items-center gap-3 py-3"><span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${fundo} ${cor}`}><Icone size={20} strokeWidth={1.6} aria-hidden /></span><div className="min-w-0"><p className="text-sm font-medium text-white">{titulo}</p><p className="mt-1 text-xs leading-5 text-[#a4adbd]">{detalhe}</p></div><div className="ml-auto min-w-12 text-center"><strong className={`text-xl ${cor}`}>{valor}</strong><p className="text-[10px] text-[#a4adbd]">{unidade}</p></div><ArrowRight size={16} className="text-[#dce2ec]" aria-hidden /></div>)}</div></Painel>
        <Painel titulo="Próximos atendimentos" icone={CalendarDays}><div className="divide-y divide-[#253045] px-5">{proximas.length ? proximas.map((linha) => { const horario = partesData(linha.proxima?.quando ?? null); return <div key={linha.matricula.id} className="grid min-h-[74px] grid-cols-[62px_1fr_auto] items-center gap-3 py-2"><div><p className="text-[18px] font-semibold text-[#2f83ff]">{horario.hora || "—"}</p><p className="text-[10px] text-[#a0a9b9]">{horario.data}</p></div><div className="flex min-w-0 items-center gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#0d63ed] text-xs font-semibold">{iniciais(linha.mentorado.nome)}</span><div className="min-w-0"><p className="truncate text-sm font-semibold">{linha.mentorado.nome}</p><p className="truncate text-xs text-[#9aa4b5]">{linha.programa?.nome ?? "Mentoria"}</p></div></div><Link href={`/mentoria/${linha.mentorado.id}`} aria-label={`Abrir ficha de ${linha.mentorado.nome}`} className="text-[#dce2ec]"><ArrowRight size={17} aria-hidden /></Link></div>; }) : <div className="flex min-h-[150px] flex-col items-center justify-center text-center"><CheckCircle2 size={28} className="text-[#24c9ba]" aria-hidden /><p className="mt-3 text-xs text-[#9ba5b6]">Nenhum próximo atendimento marcado.</p></div>}</div><div className="px-5 py-4"><Link href="/agenda" className="inline-flex items-center gap-2 text-xs font-medium text-[#2f83ff]">Ver agenda completa <ArrowRight size={15} aria-hidden /></Link></div></Painel>
      </div>
    </div></>}
  </div>;
}
