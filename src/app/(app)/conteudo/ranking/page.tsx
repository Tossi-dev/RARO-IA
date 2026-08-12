import Link from "next/link";
import { GraficoBarrasH } from "@/components/charts";
import { GerarTextoIA } from "@/components/ia-client";
import { Card, PageHeader, Tabela, Td, Th, Vazio } from "@/components/ui";
import { getDB } from "@/lib/data";
import { PLATAFORMA_LABEL } from "@/lib/domain";
import { fmtNum, fmtPct } from "@/lib/format";
import { padroesVencedores, rankingConteudos } from "@/lib/metrics";

export const dynamic = "force-dynamic";

export default async function RankingConteudo() {
  const db = getDB();
  const conteudos = await db.listConteudos();
  const detalhes = await Promise.all(conteudos.slice(0, 40).map((c) => db.getConteudo(c.id)));
  const pilares = detalhes.filter(Boolean).flatMap((d) => d!.pilares);

  const ranking = rankingConteudos(conteudos, 5);
  const padroes = padroesVencedores(conteudos, pilares);

  const promptRoteiro = [
    "Monte um roteiro de reel VENCEDOR (gancho / desenvolvimento / CTA), usando estes padrões dos vídeos que mais performaram:",
    `- Retenção média dos vencedores: ${padroes.retencaoTop}% (resto: ${padroes.retencaoResto}%)`,
    `- Duração média dos vencedores: ${Math.round(padroes.duracaoTop)}s`,
    padroes.notaGanchoTop !== null ? `- Nota média do gancho dos vencedores: ${padroes.notaGanchoTop}` : "",
    `- Títulos do topo: ${ranking.porEngajamento.slice(0, 3).map((r) => `"${r.item.titulo}"`).join(" · ")}`,
    "Devolva: GANCHO (frase exata), DESENVOLVIMENTO (estrutura em 3 blocos) e CTA (frase exata).",
  ].join("\n");

  const TabelaRanking = ({ itens, metrica }: { itens: typeof ranking.porViews; metrica: "views" | "retencao" }) => (
    <Tabela>
      <thead>
        <tr>
          <Th>#</Th>
          <Th>Conteúdo</Th>
          <Th>Rede</Th>
          <Th num>{metrica === "views" ? "Views" : "Retenção"}</Th>
        </tr>
      </thead>
      <tbody>
        {itens.map((c, i) => (
          <tr key={c.id}>
            <Td className="text-texto-2">{i + 1}º</Td>
            <Td>
              <Link className="hover:text-primaria-2" href={`/conteudo/${c.id}`}>
                {c.titulo}
              </Link>
            </Td>
            <Td className="text-texto-2">{PLATAFORMA_LABEL[c.plataforma ?? "instagram"]}</Td>
            <Td num>{metrica === "views" ? fmtNum(c.metrica?.views ?? 0) : fmtPct(c.metrica?.retencaoMedia ?? 0)}</Td>
          </tr>
        ))}
      </tbody>
    </Tabela>
  );

  return (
    <>
      <p className="mb-2 text-xs text-texto-2">
        <Link href="/conteudo" className="hover:text-primaria-2">← Conteúdo & Redes</Link>
      </p>
      <PageHeader
        titulo="Ranking & vencedores"
        sub="Quem performou melhor, por quê — e o roteiro do próximo vencedor"
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card titulo="Top 5 — Views">
          {ranking.porViews.length ? <TabelaRanking itens={ranking.porViews} metrica="views" /> : <Vazio>Sem dados.</Vazio>}
        </Card>
        <Card titulo="Top 5 — Retenção">
          {ranking.porRetencao.length ? <TabelaRanking itens={ranking.porRetencao} metrica="retencao" /> : <Vazio>Sem dados.</Vazio>}
        </Card>
        <Card titulo="Top 5 — Engajamento">
          {ranking.porEngajamento.length ? (
            <GraficoBarrasH
              data={ranking.porEngajamento.map((r) => ({
                nome: r.item.titulo.length > 26 ? `${r.item.titulo.slice(0, 25)}…` : r.item.titulo,
                valor: r.engajamento,
              }))}
              formato="pct"
            />
          ) : (
            <Vazio>Sem dados.</Vazio>
          )}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card titulo="Padrões dos vencedores (top 3 × resto)">
          <ul className="space-y-2 text-sm">
            <li className="flex justify-between gap-2">
              <span className="text-texto-2">Retenção média (top 3)</span>
              <span className="font-medium tabular-nums text-positivo">{fmtPct(padroes.retencaoTop)}</span>
            </li>
            <li className="flex justify-between gap-2">
              <span className="text-texto-2">Retenção média (resto)</span>
              <span className="tabular-nums">{fmtPct(padroes.retencaoResto)}</span>
            </li>
            <li className="flex justify-between gap-2">
              <span className="text-texto-2">Duração média dos vencedores</span>
              <span className="tabular-nums">{Math.round(padroes.duracaoTop)}s</span>
            </li>
            {padroes.notaGanchoTop !== null && (
              <li className="flex justify-between gap-2">
                <span className="text-texto-2">Nota média do gancho (top 3)</span>
                <span className="tabular-nums text-ouro">{padroes.notaGanchoTop.toFixed(1)}</span>
              </li>
            )}
          </ul>
          <div className="mt-3 space-y-1.5 border-t border-borda pt-3">
            {padroes.dicas.map((d, i) => (
              <p key={i} className="text-sm text-texto-2">• {d}</p>
            ))}
          </div>
        </Card>

        <Card titulo="Montar o próximo reel vencedor (IA)">
          <p className="mb-3 text-sm text-texto-2">
            Gera um roteiro por pilar (gancho / desenvolvimento / CTA) a partir dos padrões acima — pronto para
            gravar ou virar criativo de tráfego.
          </p>
          <GerarTextoIA prompt={promptRoteiro} rotulo="Gerar roteiro vencedor" />
        </Card>
      </div>
    </>
  );
}
