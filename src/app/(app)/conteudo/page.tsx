import Link from "next/link";
import { Badge, Card, PageHeader, Stat, Vazio, cx, type Tom } from "@/components/ui";
import { getDB } from "@/lib/data";
import { CONTEUDO_TIPO_LABEL, PLATAFORMA_LABEL } from "@/lib/domain";
import { fmtDate, fmtNum, fmtPct } from "@/lib/format";
import { engajamentoPct } from "@/lib/metrics";
import { algumaRedeConfigurada } from "@/lib/integracoes/social";

export const dynamic = "force-dynamic";

const TOM_PLATAFORMA: Record<string, Tom> = {
  instagram: "violeta",
  tiktok: "azul",
  facebook: "cinza",
};

export default async function Conteudo({
  searchParams,
}: {
  searchParams: { plataforma?: string; tipo?: string };
}) {
  const db = getDB();
  const [perfis, conteudos] = await Promise.all([db.listPerfisSociais(), db.listConteudos()]);

  const plataforma = searchParams.plataforma ?? "";
  const tipo = searchParams.tipo ?? "";
  const filtrados = conteudos.filter((c) => {
    if (plataforma && c.plataforma !== plataforma) return false;
    if (tipo && c.tipo !== tipo) return false;
    return true;
  });

  const totalViews = conteudos.reduce((s, c) => s + (c.metrica?.views ?? 0), 0);
  const comRetencao = conteudos.filter((c) => (c.metrica?.retencaoMedia ?? 0) > 0);
  const retencaoMedia = comRetencao.length
    ? comRetencao.reduce((s, c) => s + (c.metrica?.retencaoMedia ?? 0), 0) / comRetencao.length
    : 0;

  // Memória de cálculo das views acumuladas: a MESMA redução de cima, só que
  // quebrada por plataforma. Cada conteúdo entra em exatamente um balde (ou no
  // balde residual, quando o join com o perfil não trouxe plataforma), então a
  // soma das partes fecha com `totalViews` no centavo.
  const viewsPorPlataforma = new Map<string, number>();
  for (const c of conteudos) {
    const rotulo = c.plataforma
      ? `Views coletadas no ${PLATAFORMA_LABEL[c.plataforma]}`
      : "Views de conteúdos sem perfil identificado";
    viewsPorPlataforma.set(rotulo, (viewsPorPlataforma.get(rotulo) ?? 0) + (c.metrica?.views ?? 0));
  }
  const partesViews = [...viewsPorPlataforma.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([rotulo, valor]) => ({ rotulo, valor }));
  const linkFiltro = (p: string, t: string) =>
    `/conteudo?${new URLSearchParams({ ...(p ? { plataforma: p } : {}), ...(t ? { tipo: t } : {}) }).toString()}`;

  const tiposDisponiveis = [...new Set(conteudos.map((c) => c.tipo))];

  return (
    <>
      <PageHeader titulo="Conteúdo & Redes" sub="Perfis, reels e posts — o que alimenta o funil">
        <div className="flex gap-2">
          <Link href="/conteudo/ranking" className="rounded-lg border border-borda px-3 py-1.5 text-sm text-texto-2 hover:bg-painel-2 hover:text-texto">
            Ranking & vencedores
          </Link>
          <Link href="/conteudo/campanhas" className="rounded-lg border border-borda px-3 py-1.5 text-sm text-texto-2 hover:bg-painel-2 hover:text-texto">
            Campanhas
          </Link>
        </div>
      </PageHeader>

      {!algumaRedeConfigurada() && (
        <p className="mb-4 rounded-lg border border-ouro/30 bg-ouro/10 px-3 py-2 text-xs text-ouro">
          Sync automático desligado — configure os tokens das APIs oficiais (Meta/TikTok) no ambiente para puxar
          métricas reais todo dia às 6h. Até lá, os dados abaixo são de demonstração.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {perfis.map((p) => (
          <div key={p.id} className="rounded-xl border border-borda bg-painel p-4">
            <p className="flex items-center justify-between text-xs uppercase tracking-wide text-texto-2">
              {PLATAFORMA_LABEL[p.plataforma]}
              <Badge tom={p.conectado ? "verde" : "cinza"}>{p.conectado ? "conectado" : "manual"}</Badge>
            </p>
            <p className="mt-1 font-display text-lg font-semibold">{p.handle}</p>
            <p className="text-xs text-texto-2">{fmtNum(p.seguidores)} seguidores</p>
          </div>
        ))}
        {/* Composição: a soma é a redução literal de `listConteudos()` —
            totalViews = Σ metrica.views de cada conteúdo — reagrupada por
            plataforma. Sem referência: não existe base de views do período
            anterior nesta tela (a métrica é acumulada, não datada). */}
        <Stat
          label="Views acumuladas"
          valor={fmtNum(totalViews)}
          deltaPct={null}
          hint=""
          formato="numero"
          valorNumerico={totalViews}
          composicao={
            partesViews.length >= 2
              ? {
                  formula: "soma",
                  partes: partesViews,
                  nota: "View acumulada desde a publicação de cada peça, não view do período: um reel antigo continua somando todo dia. O filtro de plataforma/tipo desta tela não muda este número — ele sempre soma a base inteira.",
                }
              : `Soma das views de ${fmtNum(conteudos.length)} conteúdo(s) publicado(s), tomando a última métrica coletada de cada peça. View acumulada desde a publicação, não view do período — e o filtro desta tela não altera o número.`
          }
          origem={`listConteudos() → campo views da última métrica coletada de cada conteúdo, somando os ${fmtNum(conteudos.length)} conteúdos da base · sem filtro de plataforma, tipo ou data`}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs text-texto-2">Filtrar:</span>
        <Link href="/conteudo" className={cx("rounded-full border px-2.5 py-1 text-xs", !plataforma && !tipo ? "border-primaria/60 bg-primaria/15 text-primaria-2" : "border-borda text-texto-2")}>
          Tudo · {conteudos.length}
        </Link>
        {perfis.map((p) => (
          <Link key={p.id} href={linkFiltro(p.plataforma, "")} className={cx("rounded-full border px-2.5 py-1 text-xs", plataforma === p.plataforma ? "border-primaria/60 bg-primaria/15 text-primaria-2" : "border-borda text-texto-2")}>
            {PLATAFORMA_LABEL[p.plataforma]}
          </Link>
        ))}
        {tiposDisponiveis.map((t) => (
          <Link key={t} href={linkFiltro(plataforma, t)} className={cx("rounded-full border px-2.5 py-1 text-xs", tipo === t ? "border-primaria/60 bg-primaria/15 text-primaria-2" : "border-borda text-texto-2")}>
            {CONTEUDO_TIPO_LABEL[t]}
          </Link>
        ))}
        <span className="ml-auto text-xs text-texto-2">retenção média geral: {fmtPct(retencaoMedia)}</span>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtrados.length ? (
          filtrados.map((c) => {
            const eng = engajamentoPct(c.metrica);
            return (
              <Link key={c.id} href={`/conteudo/${c.id}`} className="group rounded-xl border border-borda bg-painel p-4 transition-colors hover:border-primaria/60">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <Badge tom={TOM_PLATAFORMA[c.plataforma ?? ""] ?? "cinza"}>
                    {PLATAFORMA_LABEL[c.plataforma ?? "instagram"]} · {CONTEUDO_TIPO_LABEL[c.tipo]}
                  </Badge>
                  <span className="text-xs text-texto-2">{fmtDate(c.publicadoEm)}</span>
                </div>
                <p className="min-h-[40px] text-sm font-medium group-hover:text-primaria-2">{c.titulo}</p>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-lg bg-painel-2 px-2 py-1.5">
                    <p className="font-medium tabular-nums">{fmtNum(c.metrica?.views ?? 0)}</p>
                    <p className="text-texto-2">views</p>
                  </div>
                  <div className="rounded-lg bg-painel-2 px-2 py-1.5">
                    <p className="font-medium tabular-nums">{c.metrica?.retencaoMedia ? fmtPct(c.metrica.retencaoMedia) : "—"}</p>
                    <p className="text-texto-2">retenção</p>
                  </div>
                  <div className="rounded-lg bg-painel-2 px-2 py-1.5">
                    <p className="font-medium tabular-nums">{eng ? fmtPct(eng) : "—"}</p>
                    <p className="text-texto-2">engaj.</p>
                  </div>
                </div>
              </Link>
            );
          })
        ) : (
          <div className="sm:col-span-2 lg:col-span-3">
            <Vazio>Nenhum conteúdo com esses filtros.</Vazio>
          </div>
        )}
      </div>
    </>
  );
}
