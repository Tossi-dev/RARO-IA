import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  CircleDollarSign,
  Eye,
  GraduationCap,
  ImageIcon,
  Megaphone,
  MessageCircle,
  MousePointer2,
  Plus,
  UsersRound,
} from "lucide-react";
import { GerarTextoIA } from "@/components/ia-client";
import { Botao, Campo, Input, PainelForm, Select, TextArea, Vazio } from "@/components/ui";
import { criarCampanha } from "@/lib/actions";
import { getDB } from "@/lib/data";
import { fmtDate, fmtNum } from "@/lib/format";

export const dynamic = "force-dynamic";

type TomStatus = "ativa" | "agendada" | "encerrada";

function rotuloCanal(canal: string) {
  const rotulos: Record<string, string> = {
    instagram: "Instagram",
    tiktok: "TikTok",
    facebook: "Facebook",
    multi: "Multi-canal",
  };

  return rotulos[canal] ?? canal;
}

function statusDaCampanha(inicio: string, fim: string | null, hoje: string): { rotulo: string; tom: TomStatus } {
  if (inicio > hoje) return { rotulo: "Agendada", tom: "agendada" };
  if (fim && fim < hoje) return { rotulo: "Encerrada", tom: "encerrada" };
  return { rotulo: "Ativa", tom: "ativa" };
}

function dataDaAtivacao(data: string) {
  const segura = /^\d{4}-\d{2}-\d{2}$/.test(data) ? `${data}T12:00:00` : data;
  const valor = new Date(segura);

  if (Number.isNaN(valor.getTime())) return { dia: "—", mes: "" };

  return {
    dia: new Intl.DateTimeFormat("pt-BR", { day: "2-digit" }).format(valor),
    mes: new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(valor).replace(".", "").toUpperCase(),
  };
}

function KpiCampanha({
  rotulo,
  valor,
  detalhe,
  children,
  tom = "azul",
}: {
  rotulo: string;
  valor: string;
  detalhe: string;
  children: React.ReactNode;
  tom?: "azul" | "ciano" | "verde";
}) {
  const cor = tom === "verde" ? "border-cyan-300/75 text-cyan-200" : tom === "ciano" ? "border-cyan-400/80 text-cyan-300" : "border-primaria-2/90 text-primaria-2";

  return (
    <article className="flex min-h-[112px] items-center gap-4 rounded-xl border border-borda bg-painel/70 px-5 py-4 shadow-[0_12px_30px_rgba(0,0,0,.12)]">
      <span className={`grid size-[70px] shrink-0 place-items-center rounded-full border ${cor}`}>{children}</span>
      <div className="min-w-0">
        <p className="text-sm text-texto-2">{rotulo}</p>
        <p className="mt-0.5 text-[31px] font-semibold leading-none tracking-[-0.04em] tabular-nums text-texto">{valor}</p>
        <p className="mt-1 truncate text-[11px] text-texto-3">{detalhe}</p>
      </div>
    </article>
  );
}

function SetaFunil({ texto }: { texto: string }) {
  return (
    <div className="hidden min-w-[66px] flex-1 items-center justify-center gap-1.5 xl:flex" aria-hidden>
      <span className="h-px flex-1 bg-texto-3/60" />
      <ArrowRight size={16} className="text-texto-2" />
      <span className="sr-only">{texto}</span>
    </div>
  );
}

export default async function Campanhas() {
  const db = getDB();
  const [campanhas, conteudos] = await Promise.all([db.listCampanhas(), db.listConteudos()]);
  const hoje = new Date().toISOString().slice(0, 10);
  const ativas = campanhas.filter((campanha) => statusDaCampanha(campanha.inicio, campanha.fim, hoje).tom === "ativa").length;
  const campanhasVisiveis = [...campanhas].sort((a, b) => a.inicio.localeCompare(b.inicio)).slice(0, 4);
  const proximasAtivacoes = [...campanhas].filter((campanha) => campanha.inicio >= hoje).sort((a, b) => a.inicio.localeCompare(b.inicio)).slice(0, 3);
  const campanhaRef = campanhas.find((campanha) => campanha.tipo === "pago") ?? campanhas[0] ?? null;
  const promptCopy = campanhaRef
    ? `Escreva a copy de um anúncio (tráfego pago) para a campanha "${campanhaRef.nome}" (objetivo: ${campanhaRef.objetivo}): headline, corpo curto (dor → mecanismo → prova → oferta) e CTA.`
    : "Escreva a copy de um anúncio (tráfego pago): headline, corpo curto (dor → mecanismo → prova → oferta) e CTA. Descreva o produto, o preço e o público-alvo antes de gerar.";

  return (
    <main data-campanhas-visual="referencia-aprovada" className="mx-auto max-w-[1320px] pb-10">
      <p className="sr-only">Homologação sintética permanece isolada. Esta tela não atribui métricas de funil sem uma fonte de dados vinculada.</p>

      <header className="mb-7 flex flex-wrap items-end justify-between gap-5">
        <div>
          <h1 className="font-display text-[clamp(30px,3vw,36px)] font-medium leading-none tracking-[-0.045em]">Marketing &amp; Campanhas</h1>
          <p className="mt-2 text-[15px] text-texto-2">Planeje campanhas que geram conversas e acompanhe o que funciona</p>
        </div>
        <nav aria-label="Ações de campanhas" className="flex flex-wrap items-center justify-end gap-2">
          <Link href="/conteudo" className="inline-flex min-h-12 items-center gap-2 rounded-lg border border-borda px-4 text-sm font-medium text-texto transition hover:border-primaria/60 hover:bg-painel-2">
            <ImageIcon size={18} aria-hidden /> Biblioteca de criativos
          </Link>
          <a href="#proximas-ativacoes" className="inline-flex min-h-12 items-center gap-2 rounded-lg border border-borda px-4 text-sm font-medium text-texto transition hover:border-primaria/60 hover:bg-painel-2">
            <CalendarDays size={18} aria-hidden /> Calendário
          </a>
          <a href="#nova-campanha" className="inline-flex min-h-12 items-center gap-2 rounded-lg bg-primaria px-5 text-sm font-medium text-white shadow-[0_10px_22px_rgba(24,99,255,.25)] transition hover:bg-primaria-2">
            <Plus size={18} aria-hidden /> Nova campanha
          </a>
        </nav>
      </header>

      <section data-campanhas-kpis="quatro" aria-label="Indicadores de campanhas" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCampanha rotulo="Campanhas ativas" valor={fmtNum(ativas)} detalhe={`${fmtNum(campanhas.length)} cadastrada(s)`}><Megaphone size={28} strokeWidth={1.6} aria-hidden /></KpiCampanha>
        <KpiCampanha rotulo="Leads gerados" valor="—" detalhe="sem atribuição de leads" tom="ciano"><UsersRound size={28} strokeWidth={1.6} aria-hidden /></KpiCampanha>
        <KpiCampanha rotulo="Conversas iniciadas" valor="—" detalhe="sem atribuição de conversas" tom="ciano"><MessageCircle size={28} strokeWidth={1.6} aria-hidden /></KpiCampanha>
        <KpiCampanha rotulo="Custo por lead" valor="—" detalhe="métrica não coletada" tom="verde"><CircleDollarSign size={28} strokeWidth={1.6} aria-hidden /></KpiCampanha>
      </section>

      <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1.68fr)_minmax(320px,1fr)]">
        <section data-campanhas-lista="principal" className="rounded-xl border border-borda bg-painel/70 p-5 shadow-[0_12px_30px_rgba(0,0,0,.12)]">
          <h2 className="text-[19px] font-semibold tracking-[-0.03em]">Campanhas em andamento</h2>
          {campanhasVisiveis.length ? (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-[640px] w-full text-left text-sm">
                <thead className="border-b border-borda text-xs text-texto-2">
                  <tr>
                    <th className="pb-3 font-medium">Campanha</th>
                    <th className="px-2 pb-3 font-medium">Canal</th>
                    <th className="px-2 pb-3 font-medium">Período</th>
                    <th className="px-2 pb-3 text-right font-medium">Leads</th>
                    <th className="px-2 pb-3 text-right font-medium">Conversas</th>
                    <th className="px-2 pb-3 font-medium">Status</th>
                    <th className="pb-3" aria-label="Abrir campanha" />
                  </tr>
                </thead>
                <tbody>
                  {campanhasVisiveis.map((campanha) => {
                    const status = statusDaCampanha(campanha.inicio, campanha.fim, hoje);
                    const cor = status.tom === "ativa" ? "bg-positivo/15 text-positivo" : status.tom === "agendada" ? "bg-primaria/15 text-primaria-2" : "bg-texto-3/15 text-texto-2";

                    return (
                      <tr key={campanha.id} className="border-b border-borda/90 last:border-0">
                        <td className="py-4 pr-3 font-medium text-texto">{campanha.nome}</td>
                        <td className="px-2 py-4 text-texto-2"><span className="inline-flex items-center gap-2"><span className={`size-2 rounded-sm ${campanha.canal === "instagram" ? "bg-pink-400" : campanha.canal === "tiktok" ? "bg-cyan-300" : "bg-primaria-2"}`} aria-hidden />{rotuloCanal(campanha.canal)}</span></td>
                        <td className="px-2 py-4 whitespace-nowrap text-xs text-texto-2">{fmtDate(campanha.inicio)} — {campanha.fim ? fmtDate(campanha.fim) : "sem término"}</td>
                        <td className="px-2 py-4 text-right tabular-nums text-texto-3">—</td>
                        <td className="px-2 py-4 text-right tabular-nums text-texto-3">—</td>
                        <td className="px-2 py-4"><span className={`inline-flex rounded-md px-2 py-1 text-xs font-medium ${cor}`}>{status.rotulo}</span></td>
                        <td className="py-4 pl-2 text-right"><ArrowRight size={16} aria-hidden className="ml-auto text-texto-3" /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : <div className="mt-4"><Vazio>Nenhuma campanha cadastrada para mostrar.</Vazio></div>}
          <a href="#nova-campanha" className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primaria-2 transition hover:text-primaria">Ver todas as campanhas <ArrowRight size={16} aria-hidden /></a>
        </section>

        <aside className="grid content-start gap-3">
          <section className="rounded-xl border border-borda bg-painel/70 p-5 shadow-[0_12px_30px_rgba(0,0,0,.12)]">
            <h2 className="text-[19px] font-semibold tracking-[-0.03em]">O que está convertendo</h2>
            <div className="mt-5 grid min-h-[132px] place-items-center rounded-lg border border-dashed border-borda px-5 text-center">
              <div>
                <p className="text-sm font-medium text-texto">Ainda não há atribuição de conversões.</p>
                <p className="mt-1 text-xs leading-relaxed text-texto-3">Leads e conversas aparecem aqui quando a fonte de captação estiver vinculada à campanha.</p>
              </div>
            </div>
            <p className="mt-4 text-xs text-texto-3">Percentual de conversas sobre leads gerados</p>
          </section>

          <section id="proximas-ativacoes" className="rounded-xl border border-borda bg-painel/70 p-5 shadow-[0_12px_30px_rgba(0,0,0,.12)]">
            <h2 className="text-[19px] font-semibold tracking-[-0.03em]">Próximas ativações</h2>
            {proximasAtivacoes.length ? <ul className="mt-3 divide-y divide-borda">{proximasAtivacoes.map((campanha) => {
              const data = dataDaAtivacao(campanha.inicio);
              return <li key={campanha.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"><span className="grid size-12 shrink-0 place-items-center rounded-md border border-borda bg-poco leading-none"><span className="text-base font-semibold tabular-nums">{data.dia}</span><span className="text-[9px] font-medium text-primaria-2">{data.mes}</span></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{campanha.nome}</span><span className="mt-1 flex items-center gap-1.5 text-xs text-texto-3"><CalendarDays size={13} aria-hidden />{fmtDate(campanha.inicio)}</span></span><ArrowRight size={16} aria-hidden className="shrink-0 text-texto-3" /></li>;
            })}</ul> : <p className="mt-4 text-sm text-texto-3">Nenhuma ativação futura cadastrada.</p>}
          </section>
        </aside>
      </div>

      <section className="mt-3 rounded-xl border border-borda bg-painel/70 p-5 shadow-[0_12px_30px_rgba(0,0,0,.12)]">
        <h2 className="text-[19px] font-semibold tracking-[-0.03em]">Funil de campanha</h2>
        <div className="mt-4 flex flex-wrap items-stretch gap-2 xl:flex-nowrap xl:gap-0">
          <FunilCard rotulo="Alcance" detalhe="métrica não coletada"><Eye size={25} aria-hidden /></FunilCard><SetaFunil texto="taxa de conversão indisponível" />
          <FunilCard rotulo="Clique" detalhe="métrica não coletada"><MousePointer2 size={25} aria-hidden /></FunilCard><SetaFunil texto="taxa de conversão indisponível" />
          <FunilCard rotulo="Lead" detalhe="sem atribuição de leads"><UsersRound size={25} aria-hidden /></FunilCard><SetaFunil texto="taxa de conversão indisponível" />
          <FunilCard rotulo="Conversa" detalhe="sem atribuição de conversas"><MessageCircle size={25} aria-hidden /></FunilCard><SetaFunil texto="taxa de conversão indisponível" />
          <FunilCard rotulo="Matrícula" detalhe="métrica não coletada"><GraduationCap size={25} aria-hidden /></FunilCard>
        </div>
      </section>

      <section id="nova-campanha" className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,1fr)]">
        <PainelForm titulo="Nova campanha">
          <form action={criarCampanha} className="grid gap-3 sm:grid-cols-2">
            <Campo label="Nome" className="sm:col-span-2"><Input name="nome" required placeholder="Ex.: Captação Protocolo — Agosto" /></Campo>
            <Campo label="Tipo"><Select name="tipo" defaultValue="pago"><option value="pago">Tráfego pago</option><option value="organico">Orgânico</option></Select></Campo>
            <Campo label="Canal"><Select name="canal" defaultValue="instagram"><option value="instagram">Instagram</option><option value="tiktok">TikTok</option><option value="facebook">Facebook</option><option value="multi">Multi-canal</option></Select></Campo>
            <Campo label="Orçamento (R$)"><Input name="orcamento" type="number" step="0.01" min="0" defaultValue={0} /></Campo>
            <Campo label="Conteúdo vinculado (criativo)"><Select name="conteudoId" defaultValue=""><option value="">— nenhum —</option>{conteudos.slice(0, 20).map((conteudo) => <option key={conteudo.id} value={conteudo.id}>{conteudo.titulo.slice(0, 60)}</option>)}</Select></Campo>
            <Campo label="Início"><Input name="inicio" type="date" defaultValue={hoje} required /></Campo>
            <Campo label="Fim (opcional)"><Input name="fim" type="date" /></Campo>
            <Campo label="Objetivo" className="sm:col-span-2"><TextArea name="objetivo" placeholder="Ex.: 100 vendas do protocolo · lista de espera da T2…" /></Campo>
            <div className="sm:col-span-2"><Botao>Criar campanha</Botao></div>
          </form>
        </PainelForm>
        <section className="rounded-xl border border-borda bg-painel/70 p-5">
          <h2 className="text-[19px] font-semibold tracking-[-0.03em]">Copy de anúncio com IA</h2>
          <p className="mt-2 text-sm leading-relaxed text-texto-2">Gera headline, corpo e CTA a partir da campanha cadastrada, sem inventar produto ou público.</p>
          <div className="mt-4"><GerarTextoIA prompt={promptCopy} rotulo="Gerar copy de campanha" /></div>
        </section>
      </section>
    </main>
  );
}

function FunilCard({ rotulo, detalhe, children }: { rotulo: string; detalhe: string; children: React.ReactNode }) {
  return (
    <article className="min-w-[172px] flex-1 rounded-lg border border-primaria/50 bg-poco/70 p-4 xl:min-w-0">
      <div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-full border border-primaria/80 text-primaria-2">{children}</span><span className="text-base font-medium">{rotulo}</span></div>
      <p className="mt-3 text-[27px] font-semibold leading-none tracking-[-0.04em]">—</p>
      <p className="mt-2 text-xs text-texto-3">{detalhe}</p>
    </article>
  );
}
