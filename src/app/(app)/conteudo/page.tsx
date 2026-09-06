import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  Eye,
  FileText,
  Search,
  UsersRound,
} from "lucide-react";
import { Badge, Card, PageHeader, Vazio, cx, type Tom } from "@/components/ui";
import { getDB } from "@/lib/data";
import {
  CAMPANHA_TIPO_LABEL,
  CONTEUDO_TIPO_LABEL,
  PLATAFORMA_LABEL,
} from "@/lib/domain";
import { fmtDate, fmtNum, fmtPct } from "@/lib/format";
import { algumaRedeConfigurada } from "@/lib/integracoes/social";
import { engajamentoPct } from "@/lib/metrics";
import type { ConteudoTipo, PlataformaSocial } from "@/lib/types";
import { contaUatSinteticaAtual } from "@/lib/uat/isolamento";

export const dynamic = "force-dynamic";

const TOM_PLATAFORMA: Record<PlataformaSocial, Tom> = {
  instagram: "violeta",
  tiktok: "azul",
  facebook: "cinza",
};

function linkComFiltros({
  plataforma = "",
  tipo = "",
  busca = "",
  todos = false,
}: {
  plataforma?: string;
  tipo?: string;
  busca?: string;
  todos?: boolean;
}) {
  const params = new URLSearchParams();
  if (plataforma) params.set("plataforma", plataforma);
  if (tipo) params.set("tipo", tipo);
  if (busca) params.set("busca", busca);
  if (todos) params.set("todos", "1");
  const query = params.toString();
  return query ? `/conteudo?${query}` : "/conteudo";
}

function metricaOuTraco(valor: number | null | undefined, formatar: (numero: number) => string) {
  return valor && valor > 0 ? formatar(valor) : "—";
}

function Indicador({
  icone,
  rotulo,
  valor,
  apoio,
  tom = "azul",
}: {
  icone: React.ReactNode;
  rotulo: string;
  valor: string;
  apoio: string;
  tom?: "azul" | "verde" | "violeta" | "ouro";
}) {
  const cores = {
    azul: "bg-primaria/15 text-primaria-2",
    verde: "bg-positivo/15 text-positivo",
    violeta: "bg-violeta/15 text-violeta",
    ouro: "bg-ouro/15 text-ouro",
  };

  return (
    <section className="superficie min-h-[140px] rounded-[22px] border p-5" aria-label={rotulo}>
      <div className="flex items-center justify-between gap-3">
        <span className={cx("grid size-9 place-items-center rounded-xl", cores[tom])}>{icone}</span>
        <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-texto-3">Base atual</span>
      </div>
      <p className="mt-4 text-xs text-texto-2">{rotulo}</p>
      <p className="mt-1 font-display text-[30px] font-fino leading-none tracking-tight tabular-nums">{valor}</p>
      <p className="mt-2 text-xs text-texto-3">{apoio}</p>
    </section>
  );
}

export default async function Conteudo({
  searchParams,
}: {
  searchParams: { plataforma?: string; tipo?: string; busca?: string; todos?: string };
}) {
  const db = getDB();
  const [perfis, conteudos, campanhas, emUat] = await Promise.all([
    db.listPerfisSociais(),
    db.listConteudos(),
    db.listCampanhas(),
    contaUatSinteticaAtual(),
  ]);

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
  const retencaoMedia = comRetencao.length
    ? comRetencao.reduce((soma, conteudo) => soma + (conteudo.metrica?.retencaoMedia ?? 0), 0) /
      comRetencao.length
    : null;
  const comEngajamento = conteudos.filter((conteudo) => (conteudo.metrica?.views ?? 0) > 0);
  const engajamentoMedio = comEngajamento.length
    ? comEngajamento.reduce((soma, conteudo) => soma + engajamentoPct(conteudo.metrica), 0) /
      comEngajamento.length
    : null;

  const porFormato = new Map<ConteudoTipo, { soma: number; quantidade: number }>();
  for (const conteudo of conteudos) {
    const retencao = conteudo.metrica?.retencaoMedia ?? 0;
    if (retencao <= 0) continue;
    const atual = porFormato.get(conteudo.tipo) ?? { soma: 0, quantidade: 0 };
    porFormato.set(conteudo.tipo, { soma: atual.soma + retencao, quantidade: atual.quantidade + 1 });
  }
  const formatosComDados = [...porFormato.entries()]
    .map(([formato, dados]) => ({
      formato,
      retencao: dados.soma / dados.quantidade,
      quantidade: dados.quantidade,
    }))
    .sort((a, b) => b.retencao - a.retencao)
    .slice(0, 3);

  const plataformasDisponiveis = [...new Set(perfis.map((perfil) => perfil.plataforma))];
  const tiposDisponiveis = [...new Set(conteudos.map((conteudo) => conteudo.tipo))];
  const campanhasCalendario = [...campanhas]
    .sort((a, b) => b.inicio.localeCompare(a.inicio))
    .slice(0, 3);
  // A página principal é um painel de leitura, não uma tabela infinita: a
  // referência aprovada deixa o calendário visível na primeira dobra. Busca e
  // filtros abrem a lista completa; sem consulta, o link explícito preserva o
  // acesso aos demais conteúdos sem reduzir a informação disponível.
  const conteudosVisiveis = mostrarTodos ? filtrados : filtrados.slice(0, 5);
  const haMaisConteudos = conteudosVisiveis.length < filtrados.length;

  return (
    <div data-conteudo-visual="referencia-aprovada" className="mx-auto max-w-[1320px] pb-8">
      <PageHeader
        titulo="Conteúdo & Redes"
        sub="Planeje, publique e aprenda com o que gera transformação"
      >
        <div className="flex flex-wrap gap-2">
          <Link
            href="/conteudo/ranking"
            className="rounded-xl border border-borda px-3.5 py-2 text-sm text-texto-2 transition hover:border-primaria/60 hover:bg-painel-2 hover:text-texto"
          >
            Ranking & vencedores
          </Link>
          <Link
            href="/conteudo/campanhas"
            className="rounded-xl bg-primaria px-3.5 py-2 text-sm font-medium text-white transition hover:bg-primaria/85"
          >
            Campanhas
          </Link>
        </div>
      </PageHeader>

      {emUat ? (
        <p className="mb-5 rounded-xl border border-primaria/25 bg-primaria/10 px-3.5 py-2.5 text-xs text-primaria-2">
          Homologação sintética: esta tela usa somente dados reservados ao teste. Integrações externas permanecem isoladas.
        </p>
      ) : !algumaRedeConfigurada() ? (
        <p className="mb-5 rounded-xl border border-ouro/30 bg-ouro/10 px-3.5 py-2.5 text-xs text-ouro">
          Nenhum canal está conectado nesta instalação. A leitura abaixo mostra somente os dados já disponíveis na base.
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Indicador
          icone={<FileText size={18} aria-hidden />}
          rotulo="Conteúdos publicados"
          valor={fmtNum(conteudos.length)}
          apoio="na base atual"
          tom="azul"
        />
        <Indicador
          icone={<Eye size={18} aria-hidden />}
          rotulo="Visualizações"
          valor={fmtNum(totalViews)}
          apoio="soma da última coleta por conteúdo"
          tom="violeta"
        />
        <Indicador
          icone={<BarChart3 size={18} aria-hidden />}
          rotulo="Retenção média"
          valor={retencaoMedia === null ? "—" : fmtPct(retencaoMedia)}
          apoio={comRetencao.length ? `${fmtNum(comRetencao.length)} conteúdo(s) com métrica` : "sem métrica coletada"}
          tom="verde"
        />
        <Indicador
          icone={<UsersRound size={18} aria-hidden />}
          rotulo="Engajamento"
          valor={engajamentoMedio === null ? "—" : fmtPct(engajamentoMedio)}
          apoio={comEngajamento.length ? "média por conteúdo com visualização" : "sem métrica coletada"}
          tom="ouro"
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_330px]">
        <div data-conteudo-biblioteca="principal">
          <Card
            titulo="Biblioteca de conteúdos"
            className="h-full !rounded-[24px] [&_h2]:text-[19px] [&_h2]:font-medium"
            acao={<span className="text-xs text-texto-3">{fmtNum(filtrados.length)} resultado(s)</span>}
          >
            <form action="/conteudo" className="flex flex-col gap-3 border-b border-borda pb-4 md:flex-row md:items-center">
              {plataforma ? <input type="hidden" name="plataforma" value={plataforma} /> : null}
              {tipo ? <input type="hidden" name="tipo" value={tipo} /> : null}
              <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-borda bg-poco px-3 py-2 text-texto-3 focus-within:border-primaria/70">
                <Search size={16} aria-hidden />
                <input
                  name="busca"
                  defaultValue={busca}
                  placeholder="Buscar por título"
                  className="min-w-0 flex-1 bg-transparent text-sm text-texto outline-none placeholder:text-texto-3"
                />
              </label>
              <button className="rounded-xl border border-borda px-3 py-2 text-sm text-texto-2 transition hover:border-primaria/60 hover:text-texto">
                Buscar
              </button>
            </form>

            <nav aria-label="Filtros da biblioteca" className="mt-3 flex flex-wrap gap-1.5">
              <Link
                href={linkComFiltros({ busca })}
                className={cx(
                  "rounded-full border px-2.5 py-1 text-xs transition",
                  !plataforma && !tipo ? "border-primaria/60 bg-primaria/15 text-primaria-2" : "border-borda text-texto-2 hover:text-texto"
                )}
              >
                Tudo · {fmtNum(conteudos.length)}
              </Link>
              {plataformasDisponiveis.map((item) => (
                <Link
                  key={item}
                  href={linkComFiltros({ plataforma: item, busca })}
                  className={cx(
                    "rounded-full border px-2.5 py-1 text-xs transition",
                    plataforma === item ? "border-primaria/60 bg-primaria/15 text-primaria-2" : "border-borda text-texto-2 hover:text-texto"
                  )}
                >
                  {PLATAFORMA_LABEL[item]}
                </Link>
              ))}
              {tiposDisponiveis.map((item) => (
                <Link
                  key={item}
                  href={linkComFiltros({ plataforma, tipo: item, busca })}
                  className={cx(
                    "rounded-full border px-2.5 py-1 text-xs transition",
                    tipo === item ? "border-primaria/60 bg-primaria/15 text-primaria-2" : "border-borda text-texto-2 hover:text-texto"
                  )}
                >
                  {CONTEUDO_TIPO_LABEL[item]}
                </Link>
              ))}
            </nav>

            {filtrados.length ? (
              <div className="mt-4 overflow-hidden rounded-xl border border-borda">
                <div className="hidden grid-cols-[minmax(0,1fr)_112px_88px_34px] gap-3 border-b border-borda bg-poco px-4 py-2 text-[10px] font-medium uppercase tracking-[0.12em] text-texto-3 sm:grid">
                  <span>Conteúdo</span>
                  <span>Publicação</span>
                  <span className="text-right">Desempenho</span>
                  <span />
                </div>
                {conteudosVisiveis.map((conteudo) => {
                  const metrica = conteudo.metrica;
                  const engajamento = engajamentoPct(metrica);
                  const plataformaConteudo = conteudo.plataforma ?? "instagram";
                  return (
                    <Link
                      key={conteudo.id}
                      href={`/conteudo/${conteudo.id}`}
                      className="group grid gap-2 border-b border-borda px-4 py-3.5 last:border-b-0 transition hover:bg-painel-2 sm:grid-cols-[minmax(0,1fr)_112px_88px_34px] sm:items-center sm:gap-3"
                    >
                      <div className="min-w-0">
                        <div className="mb-1 flex flex-wrap items-center gap-1.5">
                          <Badge tom={TOM_PLATAFORMA[plataformaConteudo]}>
                            {PLATAFORMA_LABEL[plataformaConteudo]} · {CONTEUDO_TIPO_LABEL[conteudo.tipo]}
                          </Badge>
                          {!metrica ? <span className="text-[11px] text-texto-3">sem métrica coletada</span> : null}
                        </div>
                        <p className="truncate text-sm font-medium text-texto transition group-hover:text-primaria-2">{conteudo.titulo}</p>
                        <p className="mt-1 text-xs text-texto-3 sm:hidden">
                          {fmtDate(conteudo.publicadoEm)} · {metricaOuTraco(metrica?.views, fmtNum)} views · {metricaOuTraco(metrica?.retencaoMedia, fmtPct)} retenção
                        </p>
                      </div>
                      <span className="hidden text-xs text-texto-2 sm:block">{fmtDate(conteudo.publicadoEm)}</span>
                      <span className="hidden text-right text-xs tabular-nums text-texto-2 sm:block">
                        {metrica ? `${fmtNum(metrica.views)} views` : "—"}
                        {metrica?.retencaoMedia ? <span className="block text-[11px] text-texto-3">{fmtPct(metrica.retencaoMedia)} retenção · {fmtPct(engajamento)} engaj.</span> : null}
                      </span>
                      <ArrowRight size={17} aria-hidden className="hidden justify-self-end text-texto-3 transition group-hover:translate-x-0.5 group-hover:text-primaria-2 sm:block" />
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="mt-4">
                <Vazio>Nenhum conteúdo corresponde à busca e aos filtros atuais.</Vazio>
              </div>
            )}
            {haMaisConteudos ? (
              <Link
                href={linkComFiltros({ plataforma, tipo, busca, todos: true })}
                className="mt-3 inline-flex items-center gap-1 text-sm text-primaria-2 hover:text-primaria"
              >
                Ver todos os {fmtNum(filtrados.length)} conteúdos <ArrowRight size={15} aria-hidden />
              </Link>
            ) : null}
          </Card>
        </div>

        <aside className="space-y-4">
          <Card titulo="Canais" className="!rounded-[24px] [&_h2]:text-[19px] [&_h2]:font-medium">
            {perfis.length ? (
              <ul className="divide-y divide-borda">
                {perfis.map((perfil) => (
                  <li key={perfil.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                    <span className={cx("grid size-9 place-items-center rounded-xl text-xs font-semibold", TOM_PLATAFORMA[perfil.plataforma] === "violeta" ? "bg-violeta/15 text-violeta" : TOM_PLATAFORMA[perfil.plataforma] === "azul" ? "bg-primaria/15 text-primaria-2" : "bg-eleva text-texto-2")}>
                      {PLATAFORMA_LABEL[perfil.plataforma].slice(0, 1)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{perfil.handle}</p>
                      <p className="text-xs text-texto-3">{fmtNum(perfil.seguidores)} seguidores</p>
                    </div>
                    <span className={cx("text-[11px]", perfil.conectado ? "text-positivo" : "text-texto-3")}>
                      {perfil.conectado ? "conectado" : "manual"}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <Vazio>Nenhum canal cadastrado.</Vazio>
            )}
          </Card>

          <Card titulo="O que está funcionando" className="!rounded-[24px] [&_h2]:text-[19px] [&_h2]:font-medium">
            {formatosComDados.length ? (
              <div className="space-y-4">
                <p className="text-xs leading-relaxed text-texto-2">Formatos ordenados pela retenção média dos conteúdos com métrica coletada.</p>
                {formatosComDados.map((item) => (
                  <div key={item.formato}>
                    <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
                      <span className="font-medium text-texto">{CONTEUDO_TIPO_LABEL[item.formato]}</span>
                      <span className="tabular-nums text-positivo">{fmtPct(item.retencao)}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-poco" aria-label={`${CONTEUDO_TIPO_LABEL[item.formato]}: ${fmtPct(item.retencao)} de retenção média`}>
                      <div className="h-full rounded-full bg-positivo" style={{ width: `${Math.min(100, Math.max(0, item.retencao))}%` }} />
                    </div>
                    <p className="mt-1 text-[11px] text-texto-3">{fmtNum(item.quantidade)} conteúdo(s) com métrica</p>
                  </div>
                ))}
              </div>
            ) : (
              <Vazio>Não há retenção coletada para comparar formatos.</Vazio>
            )}
          </Card>
        </aside>
      </div>

      <Card
        titulo="Calendário editorial"
        className="mt-4 !rounded-[24px] [&_h2]:text-[19px] [&_h2]:font-medium"
        acao={
          <Link href="/conteudo/campanhas" className="text-sm text-primaria-2 hover:text-primaria">
            Ver campanhas <ArrowRight size={15} className="ml-1 inline" aria-hidden />
          </Link>
        }
      >
        <p className="-mt-1 text-xs text-texto-3">Campanhas já cadastradas, organizadas pela data de início.</p>
        {campanhasCalendario.length ? (
          <div className="mt-4 grid gap-2 md:grid-cols-3">
            {campanhasCalendario.map((campanha) => (
              <Link
                key={campanha.id}
                href="/conteudo/campanhas"
                className="group flex min-h-[92px] gap-3 rounded-xl border border-borda bg-poco px-3.5 py-3 transition hover:border-primaria/60"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primaria/15 text-primaria-2">
                  <CalendarDays size={18} aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="mb-1 block text-[11px] text-texto-3">Início {fmtDate(campanha.inicio)} · {CAMPANHA_TIPO_LABEL[campanha.tipo]}</span>
                  <span className="block truncate text-sm font-medium group-hover:text-primaria-2">{campanha.nome}</span>
                  <span className="mt-1 block truncate text-xs text-texto-2">{campanha.objetivo}</span>
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="mt-4">
            <Vazio>Nenhuma campanha cadastrada para compor o calendário.</Vazio>
          </div>
        )}
      </Card>
    </div>
  );
}
