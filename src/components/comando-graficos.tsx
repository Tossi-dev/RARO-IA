"use client";

// ============================================================
// Gráficos exclusivos do Command Center (SPEC-P1 Anexo B.1).
// Complementam src/components/charts.tsx (que é de outro dono) com as marcas
// que a tela "/" precisa e o núcleo não tem: pace acumulado, empilhado por
// braço e barras divergentes dos drivers de saúde.
//
// ▬ REGRA DE OURO: este módulo tem "use client" e por isso NUNCA exporta
// dado, constante ou objeto — só COMPONENTES. Os tipos de props vêm de
// src/lib/metrics-comando.ts (módulo neutro) via `import type`, que o
// TypeScript apaga na compilação e portanto não entra no client manifest.
// ============================================================

import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmtBRLExato } from "@/lib/format";
import { CORES_CAIXA } from "@/lib/cores";
import type { DriverComBase, PontoBracos, PontoPace, PontoTendencia } from "@/lib/metrics-comando";

const SERIE_1 = "#8D70FF"; // violeta da marca
const SERIE_2 = "#E4C077"; // ouro premium
const GRID = "rgba(255,255,255,0.05)";
const TICK = { fill: "#6F6D7E", fontSize: 11 } as const;
const META = "#A6A4B5"; // linha de meta: neutra e tracejada
const LEGENDA = { fontSize: 12, color: "#A6A4B5" } as const;

const brlCompacto = (v: number): string =>
  Math.abs(v) >= 1000 ? `R$${Math.round(v / 1000)}k` : `R$${Math.round(v)}`;

function CaixaTooltip({
  active,
  payload,
  label,
  sufixo = "",
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number | string; color?: string }>;
  label?: string | number;
  sufixo?: string;
}) {
  if (!active || !payload?.length) return null;
  const linhas = payload.filter((p) => p.value !== null && p.value !== undefined);
  if (!linhas.length) return null;
  return (
    <div className="rounded-lg border border-borda bg-painel-2 px-3 py-2 text-xs shadow-xl">
      {label !== undefined && <p className="mb-1 font-medium text-texto">{label}</p>}
      {linhas.map((p, i) => (
        <p key={i} className="flex items-center gap-2 text-texto-2">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: p.color }} />
          {p.name}:{" "}
          <span className="font-medium text-texto">
            {sufixo ? `${Number(p.value).toFixed(0)}${sufixo}` : fmtBRLExato(Number(p.value))}
          </span>
        </p>
      ))}
    </div>
  );
}

/**
 * Pace acumulado: realizado (violeta) contra o trilho da meta (tracejado) e a
 * projeção de fechamento no ritmo atual (ouro tracejado).
 * O dono lê em 2 segundos se está acima ou abaixo da linha da meta.
 */
export function GraficoPaceAcumulado({ data, altura = 260 }: { data: PontoPace[]; altura?: number }) {
  return (
    <ResponsiveContainer width="100%" height={altura}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="pace-realizado" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SERIE_1} stopOpacity={0.24} />
            <stop offset="100%" stopColor={SERIE_1} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="label" tick={TICK} axisLine={false} tickLine={false} minTickGap={18} />
        <YAxis tick={TICK} axisLine={false} tickLine={false} tickFormatter={brlCompacto} width={52} />
        <Tooltip content={<CaixaTooltip />} cursor={{ stroke: GRID }} />
        <Legend wrapperStyle={LEGENDA} iconSize={9} />
        <Area
          name="Realizado"
          type="monotone"
          dataKey="realizado"
          stroke={SERIE_1}
          strokeWidth={2}
          fill="url(#pace-realizado)"
          dot={false}
          activeDot={{ r: 4, strokeWidth: 0 }}
          connectNulls={false}
        />
        <Line
          name="Trilho da meta"
          type="linear"
          dataKey="ideal"
          stroke={META}
          strokeWidth={1.5}
          strokeDasharray="6 4"
          dot={false}
        />
        <Line
          name="Projeção"
          type="monotone"
          dataKey="projetado"
          stroke={SERIE_2}
          strokeWidth={2}
          strokeDasharray="4 4"
          dot={false}
          connectNulls={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/**
 * Receita mensal empilhada por agrupamento cadastrado, cada um na cor do seu
 * cadastro. Responde "qual agrupamento está sustentando a casa" — a lista de
 * agrupamentos (id/nome/cor) é PARÂMETRO, então o gráfico não sabe nem
 * precisa saber quantas séries existem de antemão.
 */
export function GraficoBracosEmpilhado({
  data,
  agrupamentos,
  altura = 260,
}: {
  data: PontoBracos[];
  agrupamentos: Array<{ id: string; nome: string; cor: string }>;
  altura?: number;
}) {
  // achata `valores` (Record por id de agrupamento) em chaves de topo — é o
  // formato que o Recharts espera para uma dataKey estática por série
  const linhas = data.map((d) => ({ label: d.label, ...d.valores }));
  return (
    <ResponsiveContainer width="100%" height={altura}>
      <BarChart data={linhas} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="28%">
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="label" tick={TICK} axisLine={false} tickLine={false} minTickGap={8} />
        <YAxis tick={TICK} axisLine={false} tickLine={false} tickFormatter={brlCompacto} width={52} />
        <Tooltip content={<CaixaTooltip />} cursor={{ fill: "rgba(166,164,181,0.06)" }} />
        <Legend wrapperStyle={LEGENDA} iconSize={9} />
        {agrupamentos.map((a, i) => (
          <Bar
            key={a.id}
            name={a.nome}
            dataKey={a.id}
            stackId="b"
            fill={a.cor}
            radius={i === agrupamentos.length - 1 ? [4, 4, 0, 0] : undefined}
            maxBarSize={26}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

/**
 * Tendência de 12 meses + forecast dos próximos meses (linha tracejada ouro)
 * com a linha de meta por mês. Responde "no traço atual, onde eu chego?".
 */
export function GraficoTendenciaForecast({
  data,
  altura = 280,
}: {
  data: PontoTendencia[];
  altura?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={altura}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="26%">
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="label" tick={TICK} axisLine={false} tickLine={false} minTickGap={8} />
        <YAxis tick={TICK} axisLine={false} tickLine={false} tickFormatter={brlCompacto} width={52} />
        <Tooltip content={<CaixaTooltip />} cursor={{ fill: "rgba(166,164,181,0.06)" }} />
        <Legend wrapperStyle={LEGENDA} iconSize={9} />
        <Bar name="Faturamento" dataKey="faturamento" fill={SERIE_1} radius={[4, 4, 0, 0]} maxBarSize={22} />
        <Line
          name="Meta"
          type="stepAfter"
          dataKey="meta"
          stroke={META}
          strokeWidth={1.5}
          strokeDasharray="6 4"
          dot={false}
          connectNulls
        />
        <Line
          name="Projeção"
          type="monotone"
          dataKey="previsto"
          stroke={SERIE_2}
          strokeWidth={2}
          strokeDasharray="4 4"
          dot={{ r: 2, strokeWidth: 0, fill: SERIE_2 }}
          connectNulls={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/**
 * Drivers da saúde do negócio: barras horizontais com os pontos ganhos por
 * driver contra o peso máximo. Verde = sustenta o score, laranja = derruba.
 * O número sozinho não decide nada; o driver decide.
 */
// Recebe só os drivers COM base: barra de driver sem base seria uma barra zerada
// indistinguível de "mediu e deu zero" — o tipo impede que ela chegue até aqui.
export function GraficoDriversSaude({ data }: { data: DriverComBase[] }) {
  const serie = data.map((d) => ({
    nome: d.rotulo,
    pontos: d.pontos,
    perdidos: +(d.peso - d.pontos).toFixed(2),
    ajuda: d.ajuda,
  }));
  return (
    <ResponsiveContainer width="100%" height={Math.max(160, serie.length * 34)}>
      <BarChart data={serie} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
        <CartesianGrid horizontal={false} stroke={GRID} />
        <XAxis type="number" tick={TICK} axisLine={false} tickLine={false} domain={[0, 25]} />
        <YAxis
          type="category"
          dataKey="nome"
          tick={{ ...TICK, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={150}
        />
        <Tooltip content={<CaixaTooltip sufixo=" pts" />} cursor={{ fill: "rgba(166,164,181,0.06)" }} />
        <ReferenceLine x={0} stroke={GRID} />
        <Bar name="Pontos obtidos" dataKey="pontos" stackId="s" maxBarSize={14}>
          {serie.map((d, i) => (
            <Cell key={i} fill={d.ajuda ? CORES_CAIXA.entrada : CORES_CAIXA.alerta} />
          ))}
        </Bar>
        <Bar
          name="Pontos perdidos"
          dataKey="perdidos"
          stackId="s"
          fill="rgba(255,255,255,0.06)"
          radius={[0, 4, 4, 0]}
          maxBarSize={14}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
