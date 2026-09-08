import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  ChevronRight,
  Eye,
  FileText,
  Instagram,
  Info,
  Megaphone,
  Music2,
  Plus,
  Search,
  Trophy,
  UsersRound,
} from "lucide-react";
import { Card, Vazio, cx, type Tom } from "@/components/ui";
import { getDB } from "@/lib/data";
import { CAMPANHA_TIPO_LABEL, CONTEUDO_TIPO_LABEL, PLATAFORMA_LABEL } from "@/lib/domain";
import { fmtDate, fmtNum, fmtPct } from "@/lib/format";
import { algumaRedeConfigurada } from "@/lib/integracoes/social";
import { engajamentoPct } from "@/lib/metrics";
import type { ConteudoTipo, PlataformaSocial } from "@/lib/types";
import { contaUatSinteticaAtual } from "@/lib/uat/isolamento";

export const dynamic = "force-dynamic";

const MESES_ABREVIADOS = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];

function linkComFiltros({ plataforma = "", tipo = "", busca = "", todos = false }: { plataforma?: string; tipo?: string; busca?: string; todos?: boolean }) {
  const params = new URLSearchParams();
  if (plataforma) params.set("plataforma", plataforma);
  if (tipo) params.set("tipo", tipo);
  if (busca) params.set("busca", busca);
  if (todos) params.set("todos", "1");
  const query = params.toString();
  return query ? `/conteudo?${query}` : "/conteudo";
}

function metricaOuTraco(valor: number | null | undefined, formatar: (numero: number) => string) {
  return valor === null || valor === undefined ? "—" : formatar(valor);
}

function dataCalendario(data: string) {
  const [ano, mes, dia] = data.split("-").map(Number);
  if (!Number.isInteger(ano) || !Number.isInteger(mes) || !Number.isInteger(dia) || mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  return { dia: String(dia).padStart(2, "0"), mes: MESES_ABREVIADOS[mes - 1] };
}

function IconePlataforma({ plataforma, compacto = false }: { plataforma: PlataformaSocial | null | undefined; compacto?: boolean }) {
  const Icone = plataforma === "instagram" ? Instagram : plataforma === "tiktok" ? Music2 : FileText;
  const cor = plataforma === "instagram" ? "bg-violeta/15 text-violeta" : plataforma === "tiktok" ? "bg-primaria/15 text-primaria-2" : "bg-eleva text-texto-2";
  const descricao = plataforma ? PLATAFORMA_LABEL[plataforma] : "Perfil indisponível";
  return <span className={cx("grid shrink-0 place-items-center rounded-lg", compacto ? "size-8" : "size-11", cor)} title={descricao} aria-label={descricao}><Icone size={compacto ? 16 : 21} aria-hidden /></span>;
}

function Indicador({ icone, rotulo, valor, apoio, tom = "azul" }: { icone: React.ReactNode; rotulo: string; valor: string; apoio: string; tom?: "azul" | "verde" | "violeta" | "ouro" }) {
  const cores = { azul: "bg-primaria/15 text-primaria-2", verde: "bg-positivo/15 text-positivo", violeta: "bg-violeta/15 text-violeta", ouro: "bg-ouro/15 text-ouro" };
  return <section className="superficie flex h-[112px] items-center gap-4 rounded-xl border px-5 py-3" aria-label={rotulo}><span className={cx("grid size-14 shrink-0 place-items-center rounded-full", cores[tom])}>{icone}</span><div className="min-w-0"><p className="text-sm text-texto-2">{rotulo}</p><p className="mt-1 font-display text-[28px] font-medium leading-none tracking-tight tabular-nums">{valor}</p><p className="mt-1.5 truncate text-xs text-primaria-2">{apoio}</p></div></section>;
}

export default async function Conteudo({ searchParams }: { searchParams: { plataforma?: string; tipo?: string; busca?: string; todos?: string } }) {
  const db = getDB();
  const [perfis, conteudos, campanhas, emUat] = await Promise.all([db.listPerfisSociais(), db.listConteudos(), db.listCampanhas(), contaUatSinteticaAtual()]);
  const plataforma = searchParams.plataforma ?? "";
  const tipo = searchParams.tipo ?? "";
  const busca = searchParams.busca?.trim() ?? "";
  const mostrarTodos = searchParams.todos === "1" || Boolean(plataforma || tipo || busca);
  const termoBusca = busca.toLocaleLowerCase("pt-BR");
  const filtrados = conteudos.filter((conteudo) => {
    if (plataforma && conteudo.plataforma !== plataforma) return false;
    if (tipo && conteudo.tipo !== tipo) return false;
    return !termoBusca || conteudo.titulo.toLocaleLowerCase("pt-BR").includes(termoBusca);
  });
  const totalViews = conteudos.reduce((soma, conteudo) => soma + (conteudo.metrica?.views ?? 0), 0);
  const comRetencao = conteudos.filter((conteudo) => (conteudo.metrica?.retencaoMedia ?? 0) > 0);
  const retencaoMedia = comRetencao.length ? comRetencao.reduce((soma, conteudo) => soma + (conteudo.metrica?.retencaoMedia ?? 0), 0) / comRetencao.length : null;
  const comEngajamento = conteudos.filter((conteudo) => (conteudo.metrica?.views ?? 0) > 0);
  const engajamentoMedio = comEngajamento.length ? comEngajamento.reduce((soma, conteudo) => soma + engajamentoPct(conteudo.metrica), 0) / comEngajamento.length : null;

  // Sem taxonomia de temas no modelo atual, a leitura honesta é por conteúdo
  // com retenção já coletada — nunca por uma classificação inventada.
  const melhoresConteudos = conteudos.filter((conteudo) => (conteudo.metrica?.retencaoMedia ?? 0) > 0).sort((a, b) => (b.metrica?.retencaoMedia ?? 0) - (a.metrica?.retencaoMedia ?? 0)).slice(0, 3);
  const plataformasDisponiveis = [...new Set(perfis.map((perfil) => perfil.plataforma))];
  const tiposDisponiveis = [...new Set(conteudos.map((conteudo) => conteudo.tipo))];
  // A navegação de primeira dobra replica os cinco filtros da referência. Os
  // demais filtros seguem atendidos pela URL e reaparecem se já estiverem ativos.
  const plataformasDoResumo: PlataformaSocial[] = plataformasDisponiveis.filter((item) => item === "instagram" || item === "tiktok");
  const tiposDoResumo: ConteudoTipo[] = ["video", "carrossel"];
  if (plataforma && plataformasDisponiveis.includes(plataforma as PlataformaSocial) && !plataformasDoResumo.includes(plataforma as PlataformaSocial)) plataformasDoResumo.push(plataforma as PlataformaSocial);
  if (tipo && tiposDisponiveis.includes(tipo as ConteudoTipo) && !tiposDoResumo.includes(tipo as ConteudoTipo)) tiposDoResumo.push(tipo as ConteudoTipo);
  const campanhasCalendario = [...campanhas].sort((a, b) => a.inicio.localeCompare(b.inicio)).slice(0, 3);
  const conteudoPorId = new Map(conteudos.map((conteudo) => [conteudo.id, conteudo]));
  const perfisEmDestaque = perfis.slice(0, 2);
  const conteudosVisiveis = mostrarTodos ? filtrados : filtrados.slice(0, 4);
  const haMaisConteudos = conteudosVisiveis.length < filtrados.length;

  return (
    <div data-conteudo-visual="referencia-aprovada" className="mx-auto max-w-[1320px] pb-8">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div><h1 className="font-display text-[clamp(30px,3vw,36px)] font-medium leading-none tracking-[-0.045em]">Conteúdo &amp; Redes</h1><p className="mt-2 text-[15px] text-texto-2">Planeje, publique e aprenda com o que gera transformação</p></div>
        <div className="flex max-w-full flex-col items-end gap-1.5">
          <div className="flex flex-wrap justify-end gap-2">
            <Link href="/conteudo/ranking" className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-borda px-3.5 text-sm font-medium text-texto-2 transition hover:border-primaria/60 hover:bg-painel-2 hover:text-texto"><Trophy size={16} aria-hidden /> Ranking &amp; vencedores</Link>
            <Link href="/conteudo/campanhas" className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-borda px-3.5 text-sm font-medium text-texto-2 transition hover:border-primaria/60 hover:bg-painel-2 hover:text-texto"><Megaphone size={16} aria-hidden /> Campanhas</Link>
            <button type="button" disabled aria-describedby="aviso-novo-conteudo" className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primaria px-3.5 text-sm font-medium text-white opacity-100"><Plus size={16} aria-hidden /> Novo conteúdo</button>
          </div>
          <p id="aviso-novo-conteudo" className="flex max-w-[360px] items-center gap-1 text-right text-xs leading-snug text-texto-3"><Info size={13} aria-hidden /> O cadastro ainda não existe neste módulo; por isso a ação permanece desabilitada.</p>
        </div>
      </header>
      {emUat ? <p data-conteudo-aviso="uat" className="sr-only">Homologação sintética: esta tela usa somente dados reservados ao teste. Integrações externas permanecem isoladas.</p> : !algumaRedeConfigurada() ? <p className="sr-only">Nenhum canal está conectado nesta instalação. A tela mostra somente os dados já disponíveis na base.</p> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Indicador icone={<FileText size={23} aria-hidden />} rotulo="Conteúdos publicados" valor={fmtNum(conteudos.length)} apoio="na base atual" tom="azul" />
        <Indicador icone={<Eye size={23} aria-hidden />} rotulo="Visualizações" valor={fmtNum(totalViews)} apoio="soma da última coleta" tom="violeta" />
        <Indicador icone={<BarChart3 size={23} aria-hidden />} rotulo="Retenção média" valor={retencaoMedia === null ? "—" : fmtPct(retencaoMedia)} apoio={comRetencao.length ? `${fmtNum(comRetencao.length)} conteúdos com métrica` : "sem métrica coletada"} tom="verde" />
        <Indicador icone={<UsersRound size={23} aria-hidden />} rotulo="Engajamento" valor={engajamentoMedio === null ? "—" : fmtPct(engajamentoMedio)} apoio={comEngajamento.length ? "média por conteúdo visualizado" : "sem métrica coletada"} tom="ouro" />
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div id="biblioteca" data-conteudo-biblioteca="principal">
          <Card titulo="Biblioteca de conteúdos" className="h-full !rounded-xl !p-5 [&_h2]:text-[20px] [&_h2]:font-medium">
            <div className="flex flex-col gap-3 border-b border-borda pb-4 md:flex-row md:items-center md:gap-2">
              <form action="/conteudo" className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-borda bg-poco px-3 py-2 text-texto-3 focus-within:border-primaria/70">
                {plataforma ? <input type="hidden" name="plataforma" value={plataforma} /> : null}{tipo ? <input type="hidden" name="tipo" value={tipo} /> : null}
                <label htmlFor="busca-conteudos" className="sr-only">Buscar conteúdo por título</label><Search size={16} aria-hidden />
                <input id="busca-conteudos" name="busca" defaultValue={busca} placeholder="Buscar por título" className="min-w-0 flex-1 bg-transparent text-sm text-texto outline-none placeholder:text-texto-3" />
              </form>
              <nav aria-label="Filtros da biblioteca" className="flex flex-wrap gap-1.5">
                <Link href={linkComFiltros({ busca })} className={cx("rounded-full border px-2.5 py-1 text-xs transition", !plataforma && !tipo ? "border-primaria/60 bg-primaria/15 text-primaria-2" : "border-borda text-texto-2 hover:text-texto")}>Tudo</Link>
                {plataformasDoResumo.map((item) => <Link key={item} href={linkComFiltros({ plataforma: item, busca })} className={cx("rounded-full border px-2.5 py-1 text-xs transition", plataforma === item ? "border-primaria/60 bg-primaria/15 text-primaria-2" : "border-borda text-texto-2 hover:text-texto")}>{PLATAFORMA_LABEL[item]}</Link>)}
                {tiposDoResumo.map((item) => <Link key={item} href={linkComFiltros({ plataforma, tipo: item, busca })} className={cx("rounded-full border px-2.5 py-1 text-xs transition", tipo === item ? "border-primaria/60 bg-primaria/15 text-primaria-2" : "border-borda text-texto-2 hover:text-texto")}>{CONTEUDO_TIPO_LABEL[item]}</Link>)}
              </nav>
            </div>
            {filtrados.length ? <div className="mt-3 overflow-hidden">
              <div className="hidden grid-cols-[minmax(0,1fr)_90px_88px_72px_72px_20px] gap-3 border-b border-borda px-1 py-2 text-[10px] font-medium uppercase tracking-[0.12em] text-texto-3 lg:grid"><span>Conteúdo</span><span>Publicado em</span><span className="text-right">Visualizações</span><span className="text-right">Retenção</span><span className="text-right">Engajamento</span><span /></div>
              {conteudosVisiveis.map((conteudo) => {
                const metrica = conteudo.metrica;
                const plataformaConteudo = conteudo.plataforma;
                const engajamento = metrica ? engajamentoPct(metrica) : null;
                return <Link key={conteudo.id} href={`/conteudo/${conteudo.id}`} className="group grid gap-2 border-b border-borda px-1 py-3 last:border-b-0 transition hover:bg-painel-2 lg:grid-cols-[minmax(0,1fr)_90px_88px_72px_72px_20px] lg:items-center lg:gap-3">
                  <div className="flex min-w-0 items-center gap-3"><IconePlataforma plataforma={plataformaConteudo} compacto /><div className="min-w-0"><p className="truncate text-sm font-medium text-texto transition group-hover:text-primaria-2">{conteudo.titulo}</p><p className="mt-0.5 text-xs text-texto-3">{plataformaConteudo ? PLATAFORMA_LABEL[plataformaConteudo] : "Perfil indisponível"} · {CONTEUDO_TIPO_LABEL[conteudo.tipo]}{!metrica ? " · sem métrica coletada" : ""}</p><p className="mt-1 text-xs text-texto-3 lg:hidden">{fmtDate(conteudo.publicadoEm)} · {metricaOuTraco(metrica?.views, fmtNum)} visualizações · {metricaOuTraco(metrica?.retencaoMedia, fmtPct)} retenção</p></div></div>
                  <span className="hidden text-xs text-texto-2 lg:block">{fmtDate(conteudo.publicadoEm)}</span><span className="hidden text-right text-xs tabular-nums text-texto-2 lg:block">{metricaOuTraco(metrica?.views, fmtNum)}</span><span className="hidden text-right text-xs tabular-nums text-texto-2 lg:block">{metricaOuTraco(metrica?.retencaoMedia, fmtPct)}</span><span className="hidden text-right text-xs tabular-nums text-texto-2 lg:block">{engajamento === null ? "—" : fmtPct(engajamento)}</span><ChevronRight size={16} aria-hidden className="hidden justify-self-end text-texto-3 transition group-hover:translate-x-0.5 group-hover:text-primaria-2 lg:block" />
                </Link>;
              })}
            </div> : <div className="mt-4"><Vazio>Nenhum conteúdo corresponde à busca e aos filtros atuais.</Vazio></div>}
            {haMaisConteudos ? <Link href={linkComFiltros({ plataforma, tipo, busca, todos: true })} className="mt-4 inline-flex items-center gap-1 text-sm text-primaria-2 hover:text-primaria">Ver todos os conteúdos <ArrowRight size={15} aria-hidden /></Link> : null}
          </Card>
        </div>

        <aside className="space-y-3">
          <Card titulo="Canais" className="!rounded-xl !p-5 [&_h2]:text-[20px] [&_h2]:font-medium">
            {perfisEmDestaque.length ? <ul className="divide-y divide-borda">{perfisEmDestaque.map((perfil) => <li key={perfil.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"><IconePlataforma plataforma={perfil.plataforma} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{perfil.handle}</p><p className="mt-0.5 text-xs text-texto-3">{fmtNum(perfil.seguidores)} seguidores</p></div><span className={cx("rounded-full border px-2 py-1 text-[10px] font-medium", perfil.conectado ? "border-positivo/35 bg-positivo/10 text-positivo" : "border-borda text-texto-3")}>{perfil.conectado ? "Conectado" : "Manual"}</span><ChevronRight size={16} aria-hidden className="text-texto-3" /></li>)}</ul> : <Vazio>Nenhum canal cadastrado.</Vazio>}
          </Card>
          <Card titulo="O que está funcionando" className="!rounded-xl !p-5 [&_h2]:text-[20px] [&_h2]:font-medium">
            {melhoresConteudos.length ? <div><p className="-mt-1 text-xs text-texto-2">Conteúdos com maior retenção média</p><ol className="mt-4 space-y-3">{melhoresConteudos.map((conteudo, indice) => { const retencao = conteudo.metrica?.retencaoMedia ?? 0; return <li key={conteudo.id} className="grid grid-cols-[24px_minmax(0,1fr)_42px] items-center gap-2"><span className="grid size-6 place-items-center rounded-full bg-eleva text-[11px] font-medium text-texto-2">{indice + 1}</span><span className="min-w-0"><span className="mb-1 block truncate text-xs font-medium text-texto">{conteudo.titulo}</span><span className="block h-1.5 overflow-hidden rounded-full bg-poco"><span className="block h-full rounded-full bg-gradient-to-r from-primaria to-cyan-300" style={{ width: `${Math.min(100, Math.max(0, retencao))}%` }} /></span></span><span className="text-right text-xs font-medium tabular-nums text-primaria-2">{fmtPct(retencao)}</span></li>; })}</ol><Link href="/conteudo/ranking" className="mt-4 inline-flex items-center gap-1 text-sm text-primaria-2 hover:text-primaria">Ver ranking completo <ArrowRight size={15} aria-hidden /></Link></div> : <Vazio>Não há retenção coletada para comparar conteúdos.</Vazio>}
          </Card>
        </aside>
      </div>

      <Card titulo="Calendário editorial" className="mt-3 !rounded-xl !p-5 [&_h2]:text-[20px] [&_h2]:font-medium" acao={<Link href="/conteudo/campanhas" className="inline-flex items-center gap-1 text-sm text-primaria-2 hover:text-primaria">Ver campanhas <ArrowRight size={15} aria-hidden /></Link>}>
        <p className="-mt-2 text-xs text-texto-3">Próximas campanhas cadastradas</p>
        {campanhasCalendario.length ? <div className="mt-4 grid gap-0 divide-y divide-borda md:grid-cols-3 md:divide-x md:divide-y-0">{campanhasCalendario.map((campanha) => {
          const data = dataCalendario(campanha.inicio);
          const conteudoDaCampanha = campanha.conteudoId ? conteudoPorId.get(campanha.conteudoId) : null;
          const canal = campanha.canal === "instagram" || campanha.canal === "tiktok" || campanha.canal === "facebook" ? campanha.canal : conteudoDaCampanha?.plataforma;
          return <Link key={campanha.id} href="/conteudo/campanhas" className="group flex min-h-[112px] items-center gap-3 py-3 pr-4 first:pt-0 md:px-4 md:first:pl-0 md:first:pt-3">
            {data ? <span data-calendario-dia className="grid size-12 shrink-0 place-items-center rounded-lg border border-borda bg-poco text-center leading-none"><strong className="text-base font-medium text-texto">{data.dia}</strong><span className="text-[10px] font-medium text-texto-3">{data.mes}</span></span> : <span data-calendario-dia className="grid size-12 shrink-0 place-items-center rounded-lg border border-borda bg-poco text-texto-3"><CalendarDays size={18} aria-hidden /></span>}
            <IconePlataforma plataforma={canal} compacto /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-texto transition group-hover:text-primaria-2">{conteudoDaCampanha?.titulo ?? campanha.nome}</span><span className="mt-1 block truncate text-xs text-texto-3">{CAMPANHA_TIPO_LABEL[campanha.tipo]} · {campanha.objetivo}</span></span><ChevronRight size={16} aria-hidden className="shrink-0 text-texto-3 transition group-hover:translate-x-0.5 group-hover:text-primaria-2" />
          </Link>;
        })}</div> : <div className="mt-4"><Vazio>Nenhuma campanha cadastrada para compor o calendário.</Vazio></div>}
        <Link href="/conteudo/campanhas" className="mt-3 inline-flex items-center gap-1 text-sm text-primaria-2 hover:text-primaria">Ver calendário completo <ArrowRight size={15} aria-hidden /></Link>
      </Card>
    </div>
  );
}
