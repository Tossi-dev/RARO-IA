"use client";

// Gráficos da Raro.ia (Recharts) — tema unificado "Premium Dark"
// (Blueprint v3, Anexo A: data-viz sobre superfície #16161F):
//   categórica em ordem de máxima separação:
//     #8D70FF · #E4C077 · #46B6F0 · #35D6A0 · #FF7A5C · #F5A524 · #E86FC4 · #6E7BF2
//   grid rgba(255,255,255,.05) · eixos texto-3 · tooltip em surface-3
//   linhas 2px · áreas com gradiente 24%→0 · linha de meta tracejada.
// Regras mantidas: 1 eixo só, grid recessivo, texto sempre em tokens de texto
// (nunca na cor da série), tooltip em toda marca, labels diretos no donut.

import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmtBRL, fmtBRLExato, fmtPct } from "@/lib/format";
import { CORES_CAIXA, CORES_CATEGORICAS, CORES_CATEGORIA_CAIXA, CORES_FUNIL } from "@/lib/cores";

/**
 * true abaixo de 768px. Começa em `false` (mesmo em celular) e só ajusta
 * depois de montar: o componente já roda no servidor pro HTML inicial, onde
 * não existe `window`, então ler o breakpoint fora de um efeito faria o HTML
 * do servidor divergir do primeiro render do cliente (hydration mismatch).
 * O preço é um recálculo do layout do gráfico logo após montar — imperceptível
 * perto do problema que evita.
 */
function useEhCelular(): boolean {
  const [ehCelular, setEhCelular] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const atualizar = () => setEhCelular(mq.matches);
    atualizar();
    mq.addEventListener("change", atualizar);
    return () => mq.removeEventListener("change", atualizar);
  }, []);
  return ehCelular;
}

/**
 * Recharts trata `interval` como "quantas marcações PULAR" (0 = mostra
 * todas). Com 12 meses espremidos em 390px de largura, cada marcação ganha
 * uns 30px — "jan/25" não cabe enfileirado. Mostrar 1 a cada 2 ou 3 meses no
 * celular (pedido do cliente) é isto: pular 1 quando dá quase certo, pular 2
 * quando são muitas categorias.
 */
function intervaloEixoX(qtdCategorias: number, ehCelular: boolean): number {
  if (!ehCelular || qtdCategorias <= 6) return 0;
  return qtdCategorias > 9 ? 2 : 1;
}

/** Nunca deixa o texto do eixo passar de 10px — abaixo disso já é ilegível
 *  num celular (a régua do cliente). No desktop mantém o tamanho de sempre. */
function tickEixo(ehCelular: boolean, tamanhoDesktop = 11) {
  return { ...TICK, fontSize: ehCelular ? Math.max(10, tamanhoDesktop - 1) : tamanhoDesktop };
}

const SERIE_1 = "#8D70FF"; // violeta (marca, cat-1)
const SERIE_2 = "#E4C077"; // ouro (premium, cat-2)
const GRID = "rgba(255,255,255,0.05)";
const TICK = { fill: "#6F6D7E", fontSize: 11 } as const;
const SURFACE = "#16161F";
const META = "#A6A4B5"; // linha de meta (neutra, tracejada)


const brlCompacto = (v: number) =>
  Math.abs(v) >= 1000 ? `R$${Math.round(v / 1000)}k` : `R$${Math.round(v)}`;

function CaixaTooltip({
  active,
  payload,
  label,
  formato = "brl",
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number | string; color?: string }>;
  label?: string | number;
  formato?: "brl" | "pct" | "num";
}) {
  if (!active || !payload?.length) return null;
  const fmt = (v: number) =>
    formato === "brl" ? fmtBRLExato(v) : formato === "pct" ? fmtPct(v) : String(v);
  return (
    <div className="rounded-lg border border-borda bg-painel-2 px-3 py-2 text-xs shadow-xl">
      {label !== undefined && <p className="mb-1 font-medium text-texto">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} className="flex items-center gap-2 text-texto-2">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: p.color }} />
          {p.name}: <span className="font-medium text-texto">{fmt(Number(p.value))}</span>
        </p>
      ))}
    </div>
  );
}

const legendaStyle = { fontSize: 12, color: "#A6A4B5" } as const;

// ---------- Série mensal: faturamento (barras) + lucro (linha), mesmo eixo R$ ----------

export function GraficoSerieMensal({
  data,
  metaMensal,
}: {
  data: Array<{ label: string; faturamento: number; lucro: number }>;
  metaMensal?: number | null; // linha de meta tracejada (Anexo A: tema Recharts)
}) {
  const ehCelular = useEhCelular();
  return (
    <ResponsiveContainer width="100%" height={ehCelular ? 320 : 280}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="28%">
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis
          dataKey="label"
          tick={tickEixo(ehCelular)}
          axisLine={false}
          tickLine={false}
          interval={intervaloEixoX(data.length, ehCelular)}
        />
        <YAxis tick={tickEixo(ehCelular)} axisLine={false} tickLine={false} tickFormatter={brlCompacto} width={52} />
        <Tooltip content={<CaixaTooltip />} cursor={{ fill: "rgba(166,164,181,0.06)" }} />
        <Legend wrapperStyle={legendaStyle} iconSize={9} />
        {metaMensal ? (
          <ReferenceLine
            y={metaMensal}
            stroke={META}
            strokeDasharray="6 4"
            label={{ value: "meta", position: "insideTopRight", fill: META, fontSize: 10 }}
          />
        ) : null}
        <Bar name="Faturamento" dataKey="faturamento" fill={SERIE_1} radius={[4, 4, 0, 0]} maxBarSize={26} />
        <Line name="Lucro" dataKey="lucro" stroke={SERIE_2} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** Sparkline em área (KPI card premium): 1 cor, sem eixos, gradiente 24%→0. */
export function Sparkline({
  data,
  cor = SERIE_1,
  altura = 36,
}: {
  data: Array<{ label: string; valor: number }>;
  cor?: string;
  altura?: number;
}) {
  const id = `spark-${cor.replace("#", "")}`;
  return (
    <ResponsiveContainer width="100%" height={altura}>
      <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={cor} stopOpacity={0.24} />
            <stop offset="100%" stopColor={cor} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Tooltip content={<CaixaTooltip />} cursor={{ stroke: GRID }} />
        <Area
          dataKey="valor"
          name="Valor"
          stroke={cor}
          strokeWidth={1.5}
          fill={`url(#${id})`}
          dot={false}
          activeDot={{ r: 3, strokeWidth: 0 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ---------- Comparativo anual (barras agrupadas, ouro = anterior · violeta = atual) ----------

export function GraficoComparativoAnual({
  data,
  anoAnterior,
  anoAtual,
}: {
  data: Array<{ label: string; anterior: number; atual: number }>;
  anoAnterior: number;
  anoAtual: number;
}) {
  const ehCelular = useEhCelular();
  return (
    <ResponsiveContainer width="100%" height={ehCelular ? 320 : 280}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2} barCategoryGap="24%">
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis
          dataKey="label"
          tick={tickEixo(ehCelular)}
          axisLine={false}
          tickLine={false}
          interval={intervaloEixoX(data.length, ehCelular)}
        />
        <YAxis tick={tickEixo(ehCelular)} axisLine={false} tickLine={false} tickFormatter={brlCompacto} width={52} />
        <Tooltip content={<CaixaTooltip />} cursor={{ fill: "rgba(166,164,181,0.06)" }} />
        <Legend wrapperStyle={legendaStyle} iconSize={9} />
        <Bar name={String(anoAnterior)} dataKey="anterior" fill={SERIE_2} radius={[4, 4, 0, 0]} maxBarSize={18} />
        <Bar name={String(anoAtual)} dataKey="atual" fill={SERIE_1} radius={[4, 4, 0, 0]} maxBarSize={18} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ---------- Funil do CRM (donut com labels diretos + gaps de 2px) ----------

function RotuloFunil(props: {
  x?: number;
  y?: number;
  textAnchor?: "start" | "middle" | "end";
  name?: string;
  value?: number;
}) {
  return (
    <text
      x={props.x}
      y={props.y}
      textAnchor={props.textAnchor}
      dominantBaseline="central"
      fill="#A6A4B5"
      fontSize={11}
    >
      {props.name} · {props.value}
    </text>
  );
}

export function GraficoFunil({ data }: { data: Array<{ name: string; value: number }> }) {
  const ehCelular = useEhCelular();
  const visiveis = data.filter((d) => d.value > 0);
  return (
    <ResponsiveContainer width="100%" height={250}>
      {/* raio menor no celular: o rótulo direto ("Novo · 12") mora FORA da
          rosca, e em 390px de largura um raio de 74px não deixa margem
          suficiente pro texto — ele estourava a borda do card. */}
      <PieChart margin={{ top: 8, right: ehCelular ? 8 : 24, left: ehCelular ? 8 : 24, bottom: 8 }}>
        <Pie
          data={visiveis}
          dataKey="value"
          nameKey="name"
          innerRadius={ehCelular ? 40 : 48}
          outerRadius={ehCelular ? 62 : 74}
          paddingAngle={2}
          stroke={SURFACE}
          strokeWidth={2}
          labelLine={{ stroke: GRID }}
          label={RotuloFunil}
        >
          {visiveis.map((d) => (
            <Cell key={d.name} fill={CORES_FUNIL[d.name] ?? SERIE_1} />
          ))}
        </Pie>
        <Tooltip content={<CaixaTooltip formato="num" />} />
        <Legend wrapperStyle={legendaStyle} iconSize={9} />
      </PieChart>
    </ResponsiveContainer>
  );
}

// ---------- Margem de contribuição por produto (barras horizontais + label direto) ----------

export function GraficoMargemProduto({
  data,
}: {
  data: Array<{ nome: string; margem: number }>;
}) {
  const ehCelular = useEhCelular();
  return (
    <ResponsiveContainer width="100%" height={Math.max(160, data.length * (ehCelular ? 60 : 52))}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 44, left: 8, bottom: 4 }}>
        <CartesianGrid horizontal={false} stroke={GRID} />
        <XAxis
          type="number"
          tick={tickEixo(ehCelular)}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `${v}%`}
          domain={[0, 100]}
        />
        <YAxis
          type="category"
          dataKey="nome"
          tick={{ ...tickEixo(ehCelular), fontSize: ehCelular ? 11 : 12 }}
          axisLine={false}
          tickLine={false}
          width={170}
        />
        <Tooltip content={<CaixaTooltip formato="pct" />} cursor={{ fill: "rgba(166,164,181,0.06)" }} />
        <Bar name="Margem de contribuição" dataKey="margem" fill={SERIE_1} radius={[0, 4, 4, 0]} maxBarSize={20}>
          <LabelList dataKey="margem" position="right" formatter={(v: number) => fmtPct(v)} style={{ fill: "#ECEBF2", fontSize: 11 }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ---------- Tração de um lançamento (receita acumulada por dia) ----------

export function GraficoTracaoLancamento({
  data,
}: {
  data: Array<{ label: string; acumulado: number }>;
}) {
  const ehCelular = useEhCelular();
  return (
    <ResponsiveContainer width="100%" height={ehCelular ? 260 : 220}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis
          dataKey="label"
          tick={tickEixo(ehCelular)}
          axisLine={false}
          tickLine={false}
          minTickGap={ehCelular ? 40 : 24}
        />
        <YAxis tick={tickEixo(ehCelular)} axisLine={false} tickLine={false} tickFormatter={brlCompacto} width={52} />
        <Tooltip content={<CaixaTooltip />} />
        <Line name="Receita acumulada" dataKey="acumulado" stroke={SERIE_1} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ============================================================
// Expansão v2 — waterfall, retenção, barras genéricas, orçamento,
// cenários e donut de composição.
// Cores: somente combinações já validadas pelo validador da skill
// dataviz (set A: violeta #9085e9 + ouro #c98500 · set C all-pairs:
// ouro #c98500, azul #3987e5, verde #008300, magenta #d55181).
// ============================================================

const AZUL = "#46B6F0";
const VERDE = "#35D6A0";
const MAGENTA = "#E86FC4";
const CORES_COMPOSICAO = ["#8D70FF", "#E4C077", "#46B6F0", "#35D6A0"];

export interface StepWaterfall {
  label: string;
  valor: number;
  tipo: "total" | "aumento" | "reducao";
}

/** Encurta um rótulo de eixo pra caber no celular — "Lucro operacional" vira
 *  "Lucro oper…" em vez de estourar a coluna e sobrepor o vizinho. Só entra
 *  em uso no celular; o desktop sempre lê o rótulo por inteiro. */
function abreviarRotulo(texto: string, max = 9): string {
  return texto.length > max ? `${texto.slice(0, max - 1)}…` : texto;
}

/**
 * Waterfall (composição): totais em azul, entradas em verde, saídas em
 * magenta. TODA barra tem que ficar visível — ao contrário de uma série
 * mensal, pular uma etapa da cascata quebra a leitura ("de onde saiu esse
 * dinheiro?"), então em vez de reduzir a quantidade de marcações no celular
 * (como nos gráficos de 12 meses) o rótulo é abreviado e inclinado, técnica
 * clássica de eixo denso que não esconde nenhuma etapa.
 */
export function GraficoWaterfall({ steps }: { steps: StepWaterfall[] }) {
  const ehCelular = useEhCelular();
  let acumulado = 0;
  const data = steps.map((s) => {
    if (s.tipo === "total") {
      acumulado = s.valor;
      return { label: s.label, base: 0, delta: Math.abs(s.valor), cor: AZUL, real: s.valor };
    }
    const anterior = acumulado;
    acumulado += s.valor;
    return {
      label: s.label,
      base: Math.min(anterior, acumulado),
      delta: Math.abs(s.valor),
      cor: s.valor >= 0 ? VERDE : MAGENTA,
      real: s.valor,
    };
  });
  return (
    <ResponsiveContainer width="100%" height={ehCelular ? 320 : 280}>
      <BarChart
        data={data}
        margin={{ top: 8, right: 8, left: 0, bottom: ehCelular ? 28 : 0 }}
        barCategoryGap="24%"
      >
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis
          dataKey="label"
          tick={{ ...TICK, fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          interval={0}
          tickFormatter={ehCelular ? (v: string) => abreviarRotulo(v) : undefined}
          angle={ehCelular ? -35 : 0}
          textAnchor={ehCelular ? "end" : "middle"}
          height={ehCelular ? 46 : 30}
        />
        <YAxis tick={tickEixo(ehCelular)} axisLine={false} tickLine={false} tickFormatter={brlCompacto} width={52} />
        <Tooltip
          content={({ active, payload, label }) =>
            active && payload?.length ? (
              <div className="rounded-lg border border-borda bg-painel-2 px-3 py-2 text-xs shadow-xl">
                <p className="mb-1 font-medium text-texto">{label}</p>
                <p className="text-texto-2">
                  <span className="font-medium text-texto">{fmtBRLExato((payload[0].payload as { real: number }).real)}</span>
                </p>
              </div>
            ) : null
          }
          cursor={{ fill: "rgba(166,164,181,0.06)" }}
        />
        <Bar dataKey="base" stackId="w" fill="transparent" isAnimationActive={false} />
        <Bar dataKey="delta" stackId="w" radius={[4, 4, 0, 0]} maxBarSize={34}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.cor} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Curva de retenção de um reel/vídeo (0–100% do vídeo × % assistindo). */
export function GraficoRetencao({ data }: { data: Array<{ pontoPct: number; retencaoPct: number }> }) {
  const ehCelular = useEhCelular();
  const pontos = data.map((d) => ({ label: `${d.pontoPct}%`, valor: d.retencaoPct }));
  return (
    <ResponsiveContainer width="100%" height={ehCelular ? 260 : 240}>
      <LineChart data={pontos} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis
          dataKey="label"
          tick={tickEixo(ehCelular)}
          axisLine={false}
          tickLine={false}
          interval={intervaloEixoX(pontos.length, ehCelular)}
        />
        <YAxis tick={tickEixo(ehCelular)} axisLine={false} tickLine={false} domain={[0, 100]} tickFormatter={(v) => `${v}%`} width={44} />
        <Tooltip content={<CaixaTooltip formato="pct" />} />
        <Line name="Retenção" dataKey="valor" stroke={SERIE_1} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Barras horizontais genéricas (ranking/decomposição) com label direto. */
export function GraficoBarrasH({
  data,
  formato = "brl",
}: {
  // `cor` opcional: quando a categoria JÁ tem cor no sistema (braço, fonte de
  // renda), pintar tudo de violeta joga fora a associação que a legenda logo
  // abaixo acabou de ensinar.
  data: Array<{ nome: string; valor: number; cor?: string }>;
  formato?: "brl" | "pct" | "num";
}) {
  const ehCelular = useEhCelular();
  const fmt = (v: number) =>
    formato === "brl" ? brlCompacto(v) : formato === "pct" ? fmtPct(v) : String(v);
  return (
    // linha mais alta no celular: dedo precisa de mais altura que mouse pra
    // não acertar o vizinho, e a barra + rótulo direto ganham espaço pra não
    // colar um no outro.
    <ResponsiveContainer width="100%" height={Math.max(150, data.length * (ehCelular ? 56 : 44))}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 56, left: 8, bottom: 4 }}>
        <CartesianGrid horizontal={false} stroke={GRID} />
        <XAxis type="number" tick={tickEixo(ehCelular)} axisLine={false} tickLine={false} tickFormatter={fmt} />
        {/* width 190: com 160 o rótulo "Consolidação e comunidade" perdia a
            primeira letra, e rótulo cortado no eixo é erro de leitura, não
            detalhe estético. */}
        <YAxis
          type="category"
          dataKey="nome"
          tick={{ ...tickEixo(ehCelular), fontSize: ehCelular ? 11 : 12 }}
          axisLine={false}
          tickLine={false}
          width={190}
        />
        <Tooltip content={<CaixaTooltip formato={formato} />} cursor={{ fill: "rgba(166,164,181,0.06)" }} />
        <Bar name="Valor" dataKey="valor" fill={SERIE_1} radius={[0, 4, 4, 0]} maxBarSize={18}>
          {data.map((d, i) => (
            <Cell key={`${d.nome}-${i}`} fill={d.cor ?? SERIE_1} />
          ))}
          <LabelList dataKey="valor" position="right" formatter={(v: number) => fmt(v)} style={{ fill: "#ECEBF2", fontSize: 11 }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Barras verticais de uma série (análises por indicador). */
export function GraficoBarrasSerie({
  data,
  ehPct = false,
}: {
  data: Array<{ label: string; valor: number }>;
  ehPct?: boolean;
}) {
  const ehCelular = useEhCelular();
  return (
    <ResponsiveContainer width="100%" height={ehCelular ? 300 : 260}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="28%">
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis
          dataKey="label"
          tick={tickEixo(ehCelular)}
          axisLine={false}
          tickLine={false}
          interval={intervaloEixoX(data.length, ehCelular)}
        />
        <YAxis
          tick={tickEixo(ehCelular)}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => (ehPct ? `${v}%` : brlCompacto(v))}
          width={52}
        />
        <Tooltip content={<CaixaTooltip formato={ehPct ? "pct" : "brl"} />} cursor={{ fill: "rgba(166,164,181,0.06)" }} />
        <Bar name="Valor" dataKey="valor" fill={SERIE_1} radius={[4, 4, 0, 0]} maxBarSize={26} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Orçado × realizado por categoria (ouro = orçado · violeta = realizado). */
export function GraficoOrcadoRealizado({
  data,
}: {
  data: Array<{ categoria: string; previsto: number; realizado: number }>;
}) {
  const ehCelular = useEhCelular();
  // no celular o corte é mais curto (8 em vez de 14) e o rótulo inclina —
  // igual à cascata: são só algumas categorias de orçamento, então cortar
  // demais em vez de inclinar perderia a comparação que o gráfico existe pra
  // mostrar.
  const max = ehCelular ? 8 : 14;
  const d = data.map((x) => ({
    ...x,
    label: x.categoria.length > max ? `${x.categoria.slice(0, max - 1)}…` : x.categoria,
  }));
  return (
    <ResponsiveContainer width="100%" height={ehCelular ? 300 : 260}>
      <BarChart data={d} margin={{ top: 8, right: 8, left: 0, bottom: ehCelular ? 24 : 0 }} barGap={2} barCategoryGap="26%">
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis
          dataKey="label"
          tick={{ ...TICK, fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          interval={0}
          angle={ehCelular ? -35 : 0}
          textAnchor={ehCelular ? "end" : "middle"}
          height={ehCelular ? 42 : 30}
        />
        <YAxis tick={tickEixo(ehCelular)} axisLine={false} tickLine={false} tickFormatter={brlCompacto} width={52} />
        <Tooltip content={<CaixaTooltip />} cursor={{ fill: "rgba(166,164,181,0.06)" }} />
        <Legend wrapperStyle={legendaStyle} iconSize={9} />
        <Bar name="Orçado" dataKey="previsto" fill={SERIE_2} radius={[4, 4, 0, 0]} maxBarSize={16} />
        <Bar name="Realizado" dataKey="realizado" fill={SERIE_1} radius={[4, 4, 0, 0]} maxBarSize={16} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Projeção em 3 cenários (linhas tracejadas nos extremos = encoding extra além da cor). */
export function GraficoCenarios({
  data,
}: {
  data: Array<{ label: string; pessimista: number; base: number; otimista: number }>;
}) {
  const ehCelular = useEhCelular();
  return (
    <ResponsiveContainer width="100%" height={ehCelular ? 280 : 240}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis
          dataKey="label"
          tick={tickEixo(ehCelular)}
          axisLine={false}
          tickLine={false}
          interval={intervaloEixoX(data.length, ehCelular)}
        />
        <YAxis tick={tickEixo(ehCelular)} axisLine={false} tickLine={false} tickFormatter={brlCompacto} width={52} />
        <Tooltip content={<CaixaTooltip />} />
        <Legend wrapperStyle={legendaStyle} iconSize={9} />
        <Line name="Otimista" dataKey="otimista" stroke={VERDE} strokeWidth={2} strokeDasharray="6 3" dot={false} />
        <Line name="Base" dataKey="base" stroke={AZUL} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
        <Line name="Pessimista" dataKey="pessimista" stroke={MAGENTA} strokeWidth={2} strokeDasharray="2 3" dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

/**
 * Rótulo do donut quando a fatia é DINHEIRO.
 *
 * O rótulo padrão (RotuloFunil) imprime o número cru, o que serve para
 * contagem de pessoas no funil e desserve para receita: "Mentoria · 116883"
 * não é um valor que alguém leia. Duas funções em vez de um `if` dentro de
 * uma só porque o recharts chama o label como função pura, sem acesso a prop.
 */
function RotuloDonutMoeda(props: {
  x?: number;
  y?: number;
  textAnchor?: "start" | "middle" | "end";
  name?: string;
  value?: number;
}) {
  return (
    <text
      x={props.x}
      y={props.y}
      textAnchor={props.textAnchor}
      dominantBaseline="central"
      fill="#A6A4B5"
      fontSize={11}
    >
      {props.name} · {fmtBRL(Number(props.value ?? 0))}
    </text>
  );
}

/** Donut de composição genérico (dobra além de 4 fatias em "Outros"). */
export function GraficoDonut({
  data,
  formato = "num",
}: {
  data: Array<{ name: string; value: number }>;
  formato?: "brl" | "num";
}) {
  const ehCelular = useEhCelular();
  const ordenado = [...data].filter((d) => d.value > 0).sort((a, b) => b.value - a.value);
  const visiveis = ordenado.slice(0, 3);
  const resto = ordenado.slice(3).reduce((s, d) => s + d.value, 0);
  if (resto > 0) visiveis.push({ name: "Outros", value: +resto.toFixed(2) });
  return (
    <ResponsiveContainer width="100%" height={250}>
      {/* mesmo ajuste do funil: raio menor no celular sobra margem pro
          rótulo direto ("Mentoria · R$116k") não estourar o card. */}
      <PieChart margin={{ top: 8, right: ehCelular ? 8 : 24, left: ehCelular ? 8 : 24, bottom: 8 }}>
        <Pie
          data={visiveis}
          dataKey="value"
          nameKey="name"
          innerRadius={ehCelular ? 40 : 48}
          outerRadius={ehCelular ? 62 : 74}
          paddingAngle={2}
          stroke={SURFACE}
          strokeWidth={2}
          labelLine={{ stroke: GRID }}
          label={formato === "brl" ? RotuloDonutMoeda : RotuloFunil}
        >
          {visiveis.map((d, i) => (
            <Cell key={d.name} fill={CORES_COMPOSICAO[i % CORES_COMPOSICAO.length]} />
          ))}
        </Pie>
        <Tooltip content={<CaixaTooltip formato="brl" />} />
        <Legend wrapperStyle={legendaStyle} iconSize={9} />
      </PieChart>
    </ResponsiveContainer>
  );
}

/** Mini-barras dos últimos 7 dias (quadro de avisos). */
export function MiniBarrasSemana({ data }: { data: Array<{ label: string; valor: number }> }) {
  return (
    <ResponsiveContainer width="100%" height={90}>
      <BarChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }} barCategoryGap="30%">
        {/* fontSize 10: piso de legibilidade do celular — abaixo disso a
            marcação de dia vira ruído visual, não informação. */}
        <XAxis dataKey="label" tick={{ ...TICK, fontSize: 10 }} axisLine={false} tickLine={false} interval={0} />
        <YAxis hide />
        <Tooltip content={<CaixaTooltip />} cursor={{ fill: "rgba(166,164,181,0.06)" }} />
        <Bar name="Faturamento" dataKey="valor" fill={SERIE_1} radius={[3, 3, 0, 0]} maxBarSize={18} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ============================================================
// P1 — camada de caixa: área empilhada de fluxo, projeção de saldo
// (barra + linha) e gauge de meta.
// Paleta semântica vem do módulo NEUTRO src/lib/cores.ts — este arquivo é
// "use client" e por isso não pode exportar constantes para o servidor.
// ============================================================

/** Uma série da área empilhada (ex.: uma categoria do plano de contas). */
export interface SerieFluxo {
  chave: string;
  nome: string;
  cor?: string;
}

/**
 * Área empilhada do fluxo de caixa: mostra a composição do dinheiro ao longo
 * do tempo (quais categorias engordam ou comem o caixa em cada período).
 * Cada série vira uma camada com gradiente 24%→0, no padrão do Sparkline.
 */
export function GraficoAreaFluxoCaixa({
  data,
  series,
  altura = 280,
}: {
  data: Array<Record<string, string | number>>;
  series: SerieFluxo[];
  altura?: number;
}) {
  const ehCelular = useEhCelular();
  return (
    <ResponsiveContainer width="100%" height={ehCelular ? Math.max(altura, 300) : altura}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          {series.map((s, i) => {
            const cor = s.cor ?? CORES_CATEGORIA_CAIXA[s.chave] ?? CORES_CATEGORICAS[i % CORES_CATEGORICAS.length];
            return (
              <linearGradient key={s.chave} id={`fluxo-${s.chave}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={cor} stopOpacity={0.24} />
                <stop offset="100%" stopColor={cor} stopOpacity={0} />
              </linearGradient>
            );
          })}
        </defs>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis
          dataKey="label"
          tick={tickEixo(ehCelular)}
          axisLine={false}
          tickLine={false}
          minTickGap={ehCelular ? 28 : 16}
        />
        <YAxis tick={tickEixo(ehCelular)} axisLine={false} tickLine={false} tickFormatter={brlCompacto} width={52} />
        <Tooltip content={<CaixaTooltip />} cursor={{ stroke: GRID }} />
        <Legend wrapperStyle={legendaStyle} iconSize={9} />
        {series.map((s, i) => {
          const cor = s.cor ?? CORES_CATEGORIA_CAIXA[s.chave] ?? CORES_CATEGORICAS[i % CORES_CATEGORICAS.length];
          return (
            <Area
              key={s.chave}
              type="monotone"
              stackId="fluxo"
              dataKey={s.chave}
              name={s.nome}
              stroke={cor}
              strokeWidth={1.5}
              fill={`url(#fluxo-${s.chave})`}
              dot={false}
              activeDot={{ r: 3, strokeWidth: 0 }}
            />
          );
        })}
      </AreaChart>
    </ResponsiveContainer>
  );
}

/**
 * Projeção de caixa: barras de entradas e saídas previstas por período mais a
 * linha do saldo acumulado. A linha zero fica marcada em laranja porque o que
 * o dono precisa enxergar de imediato é a semana em que o caixa vira negativo.
 * As saídas entram como valor positivo e são desenhadas para baixo pelo sinal
 * aplicado aqui, para as duas barras não competerem pelo mesmo espaço.
 */
export function GraficoProjecaoSaldo({
  data,
  altura = 300,
}: {
  data: Array<{ label: string; entradas: number; saidas: number; saldo: number }>;
  altura?: number;
}) {
  const ehCelular = useEhCelular();
  const serie = data.map((d) => ({
    label: d.label,
    entradas: d.entradas,
    saidas: -Math.abs(d.saidas), // saída sempre desenhada abaixo do eixo
    saldo: d.saldo,
  }));
  return (
    <ResponsiveContainer width="100%" height={ehCelular ? Math.max(altura, 320) : altura}>
      <ComposedChart data={serie} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="26%">
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis
          dataKey="label"
          tick={tickEixo(ehCelular)}
          axisLine={false}
          tickLine={false}
          minTickGap={ehCelular ? 16 : 8}
          interval={intervaloEixoX(serie.length, ehCelular)}
        />
        <YAxis tick={tickEixo(ehCelular)} axisLine={false} tickLine={false} tickFormatter={brlCompacto} width={56} />
        <Tooltip content={<CaixaTooltip />} cursor={{ fill: "rgba(166,164,181,0.06)" }} />
        <Legend wrapperStyle={legendaStyle} iconSize={9} />
        <ReferenceLine y={0} stroke={CORES_CAIXA.alerta} strokeOpacity={0.5} />
        <Bar name="Entradas" dataKey="entradas" fill={CORES_CAIXA.entrada} radius={[4, 4, 0, 0]} maxBarSize={18} />
        <Bar name="Saídas" dataKey="saidas" fill={CORES_CAIXA.saida} radius={[0, 0, 4, 4]} maxBarSize={18} />
        <Line
          name="Saldo acumulado"
          type="monotone"
          dataKey="saldo"
          stroke={CORES_CAIXA.saldo}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, strokeWidth: 0 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/**
 * Gauge semicircular de progresso de meta (faturamento vs. meta, caixa vs.
 * reserva mínima, etc.). Semáforo: vermelho abaixo de 70%, ouro entre 70% e
 * 99%, verde ao bater a meta. O arco satura em 100% — o excedente aparece no
 * número, não no desenho.
 */
export function GraficoGaugeMeta({
  valor,
  meta,
  formato = "brl",
  altura = 150,
}: {
  valor: number;
  meta: number;
  formato?: "brl" | "pct" | "num";
  altura?: number;
}) {
  const pct = meta > 0 ? +((valor / meta) * 100).toFixed(1) : 0;
  const preenchido = Math.max(0, Math.min(100, pct));
  const cor = pct >= 100 ? CORES_CAIXA.entrada : pct >= 70 ? SERIE_2 : CORES_CAIXA.alerta;
  const dados = [
    { name: "Atingido", value: preenchido },
    { name: "Falta", value: +(100 - preenchido).toFixed(1) },
  ];
  const rotulo =
    formato === "brl" ? fmtBRLExato(valor) : formato === "pct" ? fmtPct(valor) : String(valor);
  const rotuloMeta =
    formato === "brl" ? fmtBRLExato(meta) : formato === "pct" ? fmtPct(meta) : String(meta);
  // A linha "R$ X de R$ Y" saiu de DENTRO do arco. Ela é larga, e encaixada no
  // vão do gauge ela passava por baixo das pernas do arco — o número ficava
  // riscado pelo próprio gráfico. Dentro fica só a porcentagem, que é curta.
  return (
    <div>
      <div className="relative" style={{ height: altura }}>
        <ResponsiveContainer width="100%" height={altura}>
        <PieChart margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
          <Pie
            data={dados}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="92%"
            startAngle={180}
            endAngle={0}
            innerRadius="82%"
            outerRadius="97%"
            stroke="none"
            strokeWidth={0}
            paddingAngle={preenchido > 0 && preenchido < 100 ? 1.5 : 0}
            cornerRadius={999}
            isAnimationActive={false}
          >
            <Cell fill={cor} />
            <Cell fill="rgba(255,255,255,0.06)" />
          </Pie>
        </PieChart>
        </ResponsiveContainer>
        {/* A porcentagem fica ALINHADA ao centro do arco (cy=92%), e não ao
            fundo da caixa — encostada embaixo ela cruzava as pernas do arco. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-[16%] flex justify-center">
          <span className="font-display text-[26px] font-fino leading-none tabular-nums text-texto">
            {fmtPct(pct)}
          </span>
        </div>
      </div>
      <p className="mt-1.5 text-center text-[11px] leading-snug text-texto-2 tabular-nums">
        {rotulo} de {rotuloMeta}
      </p>
    </div>
  );
}
