import Link from "next/link";
import { notFound } from "next/navigation";
import { GraficoRetencao } from "@/components/charts";
import { Badge, Botao, Campo, Card, Input, PageHeader, Stat, TextArea, Vazio } from "@/components/ui";
import { salvarPilar } from "@/lib/actions";
import { getDB } from "@/lib/data";
import { CONTEUDO_TIPO_LABEL, PILAR_DICA, PILAR_LABEL, PLATAFORMA_LABEL } from "@/lib/domain";
import { fmtDate, fmtNum, fmtPct } from "@/lib/format";
import { engajamentoPct } from "@/lib/metrics";
import type { PilarVideo } from "@/lib/types";

export const dynamic = "force-dynamic";

const PILARES: PilarVideo[] = ["gancho", "desenvolvimento", "cta"];

export default async function FichaConteudo({ params }: { params: { id: string } }) {
  const detalhe = await getDB().getConteudo(params.id);
  if (!detalhe) notFound();
  const { conteudo: c, metrica: m, retencao, pilares } = detalhe;
  const eng = engajamentoPct(m);
  const pilarDe = (p: PilarVideo) => pilares.find((x) => x.pilar === p);

  // Numerador de `engajamentoPct` (src/lib/metrics.ts): a soma das 4 interações.
  // Fica aqui em cima para o cartão de engajamento e o de "compart. + salvos"
  // usarem exatamente os mesmos números que a métrica usou.
  const interacoes = m ? m.likes + m.comentarios + m.compartilhamentos + m.salvamentos : 0;
  const compartSalvos = (m?.compartilhamentos ?? 0) + (m?.salvamentos ?? 0);
  // Data da coleta: toda métrica desta ficha é uma foto desse instante.
  const coleta = m ? fmtDate(m.coletadoEm) : "—";
  const origemMetrica = `getConteudo("${c.id}") → tabela de métricas do conteúdo, última coleta (${coleta})${c.plataforma ? ` · ${PLATAFORMA_LABEL[c.plataforma]}` : ""}`;

  return (
    <>
      <p className="mb-2 text-xs text-texto-2">
        <Link href="/conteudo" className="hover:text-primaria-2">← Conteúdo & Redes</Link>
      </p>
      <PageHeader
        titulo={c.titulo}
        sub={`${PLATAFORMA_LABEL[c.plataforma ?? "instagram"]} ${c.perfilHandle ?? ""} · publicado em ${fmtDate(c.publicadoEm)}${c.duracaoSeg ? ` · ${c.duracaoSeg}s` : ""}`}
      >
        <Badge tom="violeta">{CONTEUDO_TIPO_LABEL[c.tipo]}</Badge>
      </PageHeader>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
        {/* Views, curtidas e comentários são número BRUTO da plataforma: não há
            conta interna para abrir, então a composição é a forma string — que
            diz de onde veio, em vez de fabricar partes que não existem. */}
        <Stat
          label="Views"
          valor={fmtNum(m?.views ?? 0)}
          deltaPct={null}
          hint=""
          formato="numero"
          valorNumerico={m?.views ?? 0}
          composicao={
            m
              ? `Views acumuladas desde a publicação em ${fmtDate(c.publicadoEm)}, como a plataforma reportou na coleta de ${coleta}. Número bruto da API — o app não soma nem rateia nada aqui. Não confundir com alcance (${fmtNum(m.alcance)}): alcance conta pessoas, view conta exibição.`
              : "Nenhuma métrica coletada para este conteúdo ainda — o zero é ausência de coleta, não desempenho zero."
          }
          origem={origemMetrica}
        />
        <Stat
          label="Curtidas"
          valor={fmtNum(m?.likes ?? 0)}
          deltaPct={null}
          hint=""
          formato="numero"
          valorNumerico={m?.likes ?? 0}
          composicao={
            m
              ? `Curtidas acumuladas na peça até a coleta de ${coleta}, direto da plataforma. Número bruto, sem cálculo do app — entra depois como uma das 4 parcelas do engajamento.`
              : "Nenhuma métrica coletada para este conteúdo ainda — o zero é ausência de coleta, não desempenho zero."
          }
          origem={origemMetrica}
        />
        <Stat
          label="Comentários"
          valor={fmtNum(m?.comentarios ?? 0)}
          deltaPct={null}
          hint=""
          formato="numero"
          valorNumerico={m?.comentarios ?? 0}
          composicao={
            m
              ? `Comentários acumulados na peça até a coleta de ${coleta}, direto da plataforma. Número bruto, sem cálculo do app — entra depois como uma das 4 parcelas do engajamento.`
              : "Nenhuma métrica coletada para este conteúdo ainda — o zero é ausência de coleta, não desempenho zero."
          }
          origem={origemMetrica}
        />
        {/* Este SIM é conta do app: o cartão junta dois campos separados. */}
        <Stat
          label="Compart. + salvos"
          valor={fmtNum(compartSalvos)}
          deltaPct={null}
          hint=""
          formato="numero"
          valorNumerico={compartSalvos}
          composicao={{
            formula: "soma",
            partes: [
              { rotulo: "Compartilhamentos", valor: m?.compartilhamentos ?? 0 },
              { rotulo: "Salvamentos", valor: m?.salvamentos ?? 0 },
            ],
            nota: "As duas ações que mais sinalizam conteúdo que vale a pena guardar ou passar adiante — por isso ficam somadas num cartão só. A mesma pessoa pode compartilhar E salvar: aqui conta duas vezes.",
          }}
          origem={origemMetrica}
        />
        {/* Composição extraída de `engajamentoPct` (src/lib/metrics.ts:715-718):
            (likes + comentarios + compartilhamentos + salvamentos) / views × 100.
            O denominador é views, não alcance. */}
        <Stat
          label="Engajamento"
          valor={eng ? fmtPct(eng) : "—"}
          deltaPct={null}
          hint=""
          formato="percentual"
          valorNumerico={eng}
          composicao={
            m && m.views
              ? {
                  formula: "divisao",
                  partes: [
                    {
                      rotulo: "Interações (curtidas + comentários + compartilhamentos + salvamentos)",
                      valor: interacoes,
                      formato: "numero",
                    },
                    { rotulo: "Views", valor: m.views, formato: "numero" },
                  ],
                  nota: `Razão convertida em porcentagem: interações ÷ views × 100. O denominador é views (${fmtNum(m.views)}) e não alcance (${fmtNum(m.alcance)}) — trocar um pelo outro infla a taxa. Uma mesma pessoa que curte e salva conta duas vezes no numerador.`,
                }
              : "Sem views coletadas para este conteúdo — não há denominador, então não há taxa de engajamento a mostrar."
          }
          origem={`${origemMetrica} · via engajamentoPct`}
        />
        {/* Retenção média NÃO é a média dos pontos da curva ao lado: é o campo
            que a plataforma entrega pronto. Dizer o contrário seria inventar. */}
        <Stat
          label="Retenção média"
          valor={m?.retencaoMedia ? fmtPct(m.retencaoMedia) : "—"}
          deltaPct={null}
          hint=""
          formato="percentual"
          valorNumerico={m?.retencaoMedia ?? 0}
          composicao={
            m?.retencaoMedia
              ? `Percentual médio do vídeo assistido, entregue pronto pela plataforma na coleta de ${coleta}${c.duracaoSeg ? ` — equivale a cerca de ${fmtNum(m.tempoMedioSeg)}s dos ${c.duracaoSeg}s de duração` : ""}. Não é a média aritmética dos pontos da curva ao lado: a curva é o desenho da queda, este número é o consolidado da plataforma.`
              : "Formato sem curva de retenção (post estático) ou sem coleta — a plataforma não reporta retenção aqui, e o traço é ausência de dado, não retenção zero."
          }
          origem={origemMetrica}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card titulo="Curva de retenção (onde o público larga o vídeo)">
          {retencao.length ? (
            <>
              <GraficoRetencao data={retencao} />
              <p className="mt-1 text-xs text-texto-2">
                Queda forte nos primeiros 10% = gancho fraco · platô alto até o fim = desenvolvimento segurando.
              </p>
            </>
          ) : (
            <Vazio>Sem curva de retenção para este conteúdo (posts estáticos não têm).</Vazio>
          )}
        </Card>

        <Card titulo="Roteiro / legenda">
          {c.roteiro ? (
            <pre className="whitespace-pre-wrap font-body text-sm text-texto-2">{c.roteiro}</pre>
          ) : (
            <Vazio>Sem roteiro registrado — anote os 3 pilares abaixo para alimentar os padrões vencedores.</Vazio>
          )}
          {c.url ? (
            <a className="mt-3 inline-block text-sm text-primaria-2 hover:underline" href={c.url} target="_blank" rel="noopener noreferrer">
              abrir na plataforma →
            </a>
          ) : null}
        </Card>
      </div>

      <h2 className="mb-2 mt-6 font-display text-lg font-semibold">Os 3 pilares do vídeo</h2>
      <p className="mb-3 text-sm text-texto-2">
        Anote o que foi feito em cada pilar e dê uma nota de 0 a 10 — é isso que alimenta o ranking de padrões vencedores.
      </p>
      <div className="grid gap-4 lg:grid-cols-3">
        {PILARES.map((p) => {
          const atual = pilarDe(p);
          return (
            <Card key={p} titulo={`${PILAR_LABEL[p]} ${atual?.nota != null ? `· nota ${atual.nota}` : ""}`}>
              <p className="mb-2 text-xs text-texto-2">{PILAR_DICA[p]}</p>
              <form action={salvarPilar} className="space-y-2">
                <input type="hidden" name="conteudoId" value={c.id} />
                <input type="hidden" name="pilar" value={p} />
                <TextArea
                  name="texto"
                  defaultValue={atual?.texto ?? ""}
                  placeholder={`O que este vídeo fez no ${PILAR_LABEL[p].toLowerCase()}…`}
                  className="min-h-[88px]"
                />
                <div className="flex items-end gap-2">
                  <Campo label="Nota (0–10)" className="w-28">
                    <Input name="nota" type="number" min={0} max={10} step={0.5} defaultValue={atual?.nota ?? ""} />
                  </Campo>
                  <Botao tipo="fantasma">Salvar</Botao>
                </div>
              </form>
            </Card>
          );
        })}
      </div>
    </>
  );
}
