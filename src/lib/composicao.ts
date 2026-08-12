// Composição de KPI — a memória de cálculo que acompanha todo número do app.
//
// MÓDULO NEUTRO de propósito (sem "use client"): estes tipos e funções puras são
// consumidos por Server Components (as páginas de /financeiro, a faixa de comando)
// E pelo componente client `KpiDetalhe`. Um módulo "use client" não pode exportar
// valor de runtime lido no servidor — dá "React Client Manifest" e 500 em runtime
// com o build verde. Por isso a conta mora aqui e só o componente mora lá.
//
// Regra de negócio (skills `dashboard-mc` e `diagnostico-comercial`):
// todo KPI abre a sua composição. Um número sem composição é uma afirmação de
// autoridade; com a conta visível, a discussão pula direto para o que interessa.
// E nunca se inventa a conta — composição errada é pior que composição ausente.

import { fmtBRLExato, fmtNum, fmtPct } from "@/lib/format";

/** Operação que liga as partes da composição. */
export type FormulaComposicao = "soma" | "subtracao" | "multiplicacao" | "divisao" | "media";

/** Como o número deve ser lido: dinheiro, contagem ou percentual. */
export type FormatoValor = "moeda" | "numero" | "percentual";

export type ParteComposicao = {
  /** Rótulo em linguagem clara — sem sigla interna, sem nome de coluna. */
  rotulo: string;
  valor: number;
  /** Quando ausente, herda o formato do próprio KPI. */
  formato?: FormatoValor;
};

export type ComposicaoEstruturada = {
  formula: FormulaComposicao;
  /** Mínimo 2 partes: uma parte só não é conta, é o próprio número. */
  partes: ParteComposicao[];
  /** De qual tabela/método/filtro os dados saíram. */
  origem?: string;
  /** Ressalva honesta (ex.: "DRE consolidado: não há rateio de despesa fixa por braço"). */
  nota?: string;
};

/**
 * Ou a frase pronta (quando a origem do número não cabe numa fórmula),
 * ou a estrutura — que o app converte em frase e em linhas no detalhe.
 */
export type Composicao = string | ComposicaoEstruturada;

/**
 * Formatação brasileira dos três tipos de número que o app mostra.
 * Reaproveita `src/lib/format.ts` (que já resolve as três regras) para não
 * existirem dois padrões de formatação concorrentes no mesmo produto:
 *  - moeda      → `R$ 47.000,00` · `-R$ 1.250,50` (sempre 2 casas, nunca abreviado)
 *  - numero     → `1.234.567` · `18,42`
 *  - percentual → recebe PONTOS PERCENTUAIS (18.4 → `18,4%`), nunca a fração 0,184
 */
export function formatarValor(valor: number, formato: FormatoValor): string {
  const v = Number.isFinite(valor) ? valor : 0;
  if (formato === "moeda") return fmtBRLExato(v);
  if (formato === "percentual") return fmtPct(v);
  return fmtNum(v);
}

/**
 * Operador infixo da fórmula. `media` devolve `null` de propósito: média não é
 * uma operação infixa entre as partes — a frase dela vira "média de A, B e C".
 * Multiplicação usa "x" (e não "*" ou "×") porque é o glifo que o dono lê.
 */
export function operadorDe(formula: FormulaComposicao): "+" | "-" | "x" | "/" | null {
  switch (formula) {
    case "soma":
      return "+";
    case "subtracao":
      return "-";
    case "multiplicacao":
      return "x";
    case "divisao":
      return "/";
    case "media":
      return null;
  }
}

/** "A, B e C" — enumeração no padrão brasileiro (vírgula, e o último com "e"). */
function enumerar(itens: string[]): string {
  if (itens.length <= 1) return itens[0] ?? "";
  return `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}`;
}

/** Cada parte vira "Rótulo Valor" — o rótulo herda o formato do KPI se não tiver o seu. */
function parteEmTexto(p: ParteComposicao, formatoDoKpi: FormatoValor): string {
  return `${p.rotulo} ${formatarValor(p.valor, p.formato ?? formatoDoKpi)}`;
}

/**
 * Monta a frase da memória de cálculo a partir do valor JÁ FORMATADO do KPI.
 * Existe separada de `frase` porque nem todo KPI da tela tem o número cru à mão
 * (várias telas já recebem a string pronta) — e mesmo assim a conta precisa aparecer.
 */
export function fraseComValorFormatado(
  valorFormatado: string,
  formato: FormatoValor,
  c: Composicao
): string {
  // composição escrita à mão volta exatamente como veio: quem escreveu, escreveu.
  if (typeof c === "string") return c;
  const partes = c.partes.map((p) => parteEmTexto(p, formato));
  if (!partes.length) return valorFormatado;
  const direita =
    c.formula === "media" ? `média de ${enumerar(partes)}` : partes.join(` ${operadorDe(c.formula)} `);
  return `${valorFormatado} = ${direita}`;
}

/**
 * Frase completa da composição, no padrão da skill:
 * `R$ 38,90 = Investimento em mídia R$ 58.583,40 / Leads gerados 1.506`.
 * Se `c` for string, devolve a string exatamente como veio.
 */
export function frase(valorKpi: number, formato: FormatoValor, c: Composicao): string {
  if (typeof c === "string") return c;
  return fraseComValorFormatado(formatarValor(valorKpi, formato), formato, c);
}

/**
 * Variação percentual contra a referência (meta, mês anterior, ano passado).
 * Usa `Math.abs` no denominador para que a queda de um número negativo não
 * inverta o sinal da variação (prejuízo que piora não pode aparecer como alta).
 * Devolve `null` quando não há base de comparação: referência ausente, zero ou
 * não finita. Sem base, o honesto é dizer "sem base" — não fingir 0%.
 */
export function variacaoPct(valor: number, referencia: number | null | undefined): number | null {
  if (referencia === null || referencia === undefined) return null;
  if (!Number.isFinite(referencia) || referencia === 0) return null;
  if (!Number.isFinite(valor)) return null;
  return +(((valor - referencia) / Math.abs(referencia)) * 100).toFixed(2);
}

/** Abaixo disso a variação é ruído de arredondamento, não movimento. */
const LIMIAR_NEUTRO = 0.05;

/**
 * Cor semântica da variação, respeitando `direcao_boa`.
 * Em métrica onde MENOR é melhor (custo, churn, inadimplência, reembolso,
 * chargeback, tempo, prazo) a direção é "baixo" — e aí a QUEDA fica VERDE.
 * Confundir isso pinta de vermelho exatamente o que o dono queria ver acontecer.
 */
export function tomDaVariacao(
  variacao: number | null,
  direcaoBoa: "cima" | "baixo"
): "positivo" | "negativo" | "neutro" {
  if (variacao === null || !Number.isFinite(variacao)) return "neutro";
  if (Math.abs(variacao) < LIMIAR_NEUTRO) return "neutro";
  const subiu = variacao > 0;
  return (direcaoBoa === "cima") === subiu ? "positivo" : "negativo";
}

/**
 * Glifo tipográfico da direção. Nunca emoji: ▲ subiu, ▼ caiu, ▬ estável/sem base.
 * O glifo diz só a DIREÇÃO; quem diz se é bom ou ruim é a cor de `tomDaVariacao`.
 */
export function glifoDaVariacao(variacao: number | null): "▲" | "▼" | "▬" {
  if (variacao === null || !Number.isFinite(variacao)) return "▬";
  if (Math.abs(variacao) < LIMIAR_NEUTRO) return "▬";
  return variacao > 0 ? "▲" : "▼";
}
