// Desempenho por agrupamento e por afiliado (SPEC-P1 Anexo B.1.3).
// Agrupamento é cadastro OPCIONAL do usuário (ver src/lib/agrupamentos.ts):
// sem nenhum cadastrado, `ComandoBracos` não desenha nada — cabe à página
// não chamar este componente quando `!temAgrupamentos(...)`, e o `return null`
// aqui é a segunda trava, para o card nunca aparecer vazio por engano.

import Link from "next/link";
import { Badge, Card, ProgressBar, Tabela, Td, Th, Vazio, cx } from "@/components/ui";
import { GraficoBracosEmpilhado } from "@/components/comando-graficos";
import { corDoAgrupamento } from "@/lib/cores";
import { rotularAgrupamento } from "@/lib/agrupamentos";
import { fmtBRL, fmtPct } from "@/lib/format";
import type {
  Concentracao,
  DesempenhoBraco,
  LinhaAfiliado,
  PontoBracos,
} from "@/lib/metrics-comando";
import type { Agrupamento } from "@/lib/types";

function Delta({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-xs text-texto-3">sem base</span>;
  return (
    <span className={cx("text-xs font-medium tabular-nums", pct >= 0 ? "text-positivo" : "text-negativo")}>
      {pct >= 0 ? "▲" : "▼"} {fmtPct(Math.abs(pct))}
    </span>
  );
}

export function ComandoBracos({
  bracos,
  serie,
  concentracao,
}: {
  bracos: DesempenhoBraco[];
  serie: PontoBracos[];
  concentracao: Concentracao;
}) {
  // Sem agrupamento cadastrado `bracos` já chega vazio (desempenhoPorBraco
  // devolve [] antes de olhar para os dados) — nada a desenhar.
  if (!bracos.length) return null;

  const total = bracos.reduce((s, b) => s + b.receita, 0);
  // nome/cor já vêm resolvidos em cada linha de `bracos` (desempenhoPorBraco),
  // então o gráfico recebe a lista de séries pronta, sem reconsultar cadastro
  const legendaGrafico = bracos.map((b) => ({ id: b.braco, nome: b.nome, cor: b.cor }));
  // Sem receita no período o HHI não é 0 (receita pulverizada): é indefinido.
  // Badge fica cinza para não pintar ausência de venda de "saudável".
  const tomConcentracao =
    concentracao.nivel === null
      ? "cinza"
      : concentracao.nivel === "critico"
        ? "vermelho"
        : concentracao.nivel === "atencao"
          ? "ouro"
          : "verde";

  return (
    <Card
      titulo="Desempenho por agrupamento"
      acao={
        <Badge tom={tomConcentracao}>
          {concentracao.hhi === null
            ? concentracao.leitura
            : `HHI ${Math.round(concentracao.hhi)} · ${concentracao.leitura}`}
        </Badge>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        <div className="space-y-3">
          {bracos.map((b) => (
            <div key={b.braco} className="rounded-lg border border-borda-sutil bg-superficie-1 p-3">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-2 text-sm font-medium">
                  <span
                    aria-hidden
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ background: b.cor }}
                  />
                  {b.nome}
                </span>
                <Delta pct={b.deltaPct} />
              </div>
              <p className="mt-1 flex items-baseline gap-2">
                <span className="font-display text-lg font-semibold tabular-nums">{fmtBRL(b.receita)}</span>
                <span className="text-xs text-texto-3">
                  {total ? fmtPct((b.receita / total) * 100, 0) : "—"} · {b.vendas} venda(s)
                </span>
              </p>
              {b.meta !== null ? (
                <div className="mt-2">
                  <ProgressBar pct={b.pctMeta ?? 0} tom={(b.pctMeta ?? 0) >= 100 ? "ouro" : "violeta"} />
                  <p className="mt-1 text-[11px] tabular-nums text-texto-3">
                    {fmtPct(b.pctMeta ?? 0, 0)} da meta de {fmtBRL(b.meta)}
                    {b.receita < b.meta ? ` · faltam ${fmtBRL(b.meta - b.receita)}` : " · batida"}
                  </p>
                </div>
              ) : (
                <p className="mt-2 text-[11px] text-texto-3">Sem meta cadastrada para o agrupamento.</p>
              )}
            </div>
          ))}
          <p className="text-[11px] text-texto-3">
            {concentracao.topNome === null || concentracao.topPct === null || concentracao.top3Pct === null
              ? "Concentração: sem receita no período para medir."
              : `Concentração: ${concentracao.topNome} responde por ${fmtPct(concentracao.topPct, 0)} da receita · top 3 = ${fmtPct(concentracao.top3Pct, 0)}.`}
          </p>
        </div>

        <div>
          <p className="mb-1 text-xs text-texto-3">Receita mensal por agrupamento — 12 meses</p>
          <GraficoBracosEmpilhado data={serie} agrupamentos={legendaGrafico} />
        </div>
      </div>
    </Card>
  );
}

export function ComandoAfiliados({
  linhas,
  agrupamentos,
}: {
  linhas: LinhaAfiliado[];
  agrupamentos: Agrupamento[];
}) {
  const comReceita = linhas.filter((l) => l.receita > 0 || l.meta !== null);
  return (
    <Card
      titulo="Rede de afiliados — realizado × meta individual"
      acao={
        <Link href="/crm" className="text-xs text-primaria-2 hover:underline">
          abrir CRM →
        </Link>
      }
    >
      {comReceita.length ? (
        <Tabela>
          <thead>
            <tr>
              <Th>Afiliado</Th>
              <Th>Agrupamento</Th>
              <Th num>Receita</Th>
              <Th num>Vendas</Th>
              <Th num>Ticket</Th>
              <Th num>Comissão</Th>
              <Th>Meta do período</Th>
              <Th num>vs anterior</Th>
            </tr>
          </thead>
          <tbody>
            {comReceita.map((l) => (
              <tr key={l.id}>
                <Td>
                  <span className="font-medium">{l.nome}</span>
                  <p className="text-[11px] text-texto-3">{fmtPct(l.pctTotal, 0)} da receita do período</p>
                </Td>
                <Td>
                  <span className="inline-flex items-center gap-1.5 text-xs">
                    <span
                      aria-hidden
                      className="h-2 w-2 shrink-0 rounded-full"
                      // Responsável sem agrupamento (l.braco null): mesma cor neutra
                      // que fontes-renda.tsx usa pro "não identificado", em vez de
                      // corDoAgrupamento inventar uma cor da paleta pra ausência.
                      style={{ background: l.braco ? corDoAgrupamento(l.braco, agrupamentos) : "rgb(var(--texto-3))" }}
                    />
                    {rotularAgrupamento(l.braco, agrupamentos)}
                  </span>
                </Td>
                <Td num>{fmtBRL(l.receita)}</Td>
                <Td num>{l.vendas}</Td>
                <Td num>{fmtBRL(l.ticketMedio)}</Td>
                <Td num>{fmtBRL(l.comissao)}</Td>
                <Td>
                  {l.meta === null ? (
                    <span className="text-xs text-texto-3">—</span>
                  ) : (
                    <div className="min-w-[140px]">
                      <ProgressBar pct={l.pctMeta ?? 0} tom={(l.pctMeta ?? 0) >= 100 ? "ouro" : "violeta"} />
                      <p className="mt-1 text-[11px] tabular-nums text-texto-3">
                        {fmtPct(l.pctMeta ?? 0, 0)} de {fmtBRL(l.meta)}
                        {l.gapMeta > 0 ? ` · faltam ${fmtBRL(l.gapMeta)}` : " · batida"}
                      </p>
                    </div>
                  )}
                </Td>
                <Td num>
                  <Delta pct={l.deltaPct} />
                </Td>
              </tr>
            ))}
          </tbody>
        </Tabela>
      ) : (
        <Vazio>Nenhum afiliado com venda ou meta no período selecionado.</Vazio>
      )}
    </Card>
  );
}
