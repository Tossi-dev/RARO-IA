// Health score do negócio (0–100), explicável fator a fator.
// Inspirado no "financial health" do Badget, adaptado a mentoria/infoproduto.
//
// REGRA DE BASE: fator só pontua quando o dado que ele mede existe. Reembolso
// de 0% em cima de faturamento 0 não é "nenhum cliente pediu dinheiro de volta",
// é "ninguém comprou" — dar nota cheia por isso é inventar um veredito que os
// dados não sustentam. Fator sem base fica de fora da soma e o score é
// renormalizado sobre o que sobrou; sem nenhum fator com base não há score.

import { porProduto, serieMensal } from "./metrics";
import type { Aluno, DatasetFinanceiro, Produto } from "./types";

export type NivelSaudeScore = "critico" | "atencao" | "saudavel" | "excelente";

export interface FatorSaude {
  nome: string;
  temBase: boolean;
  pontos: number | null; // null = sem base: não pontua e não empresta pontos
  max: number;
  detalhe: string;
}

export interface SaudeScore {
  // `number | null` em vez de número sempre presente: força cada tela a decidir
  // o que dizer quando não há base, em vez de deixar a ausência virar nota baixa.
  score: number | null; // 0..100 sobre os pesos que TÊM base
  semBase: boolean; // nenhum fator com base — não há score
  parcial: boolean; // parte dos fatores ficou de fora do cálculo
  maxComBase: number; // soma dos pesos considerados (denominador do score)
  nivel: NivelSaudeScore | null;
  fatores: FatorSaude[];
}

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const r1 = (v: number) => +v.toFixed(1);

export function healthScore(
  ds: DatasetFinanceiro,
  alunos: Aluno[],
  produtos: Produto[],
  ref = new Date()
): SaudeScore {
  const serie = serieMensal(ds, 6, ref);
  const ult3 = serie.slice(-3);
  const ant3 = serie.slice(0, 3);

  // 1) Margem média (3m) — 25 pts (cheio a partir de 60%)
  // base: faturamento nos últimos 3 meses (é o denominador da margem)
  const fatUlt = ult3.reduce((s, m) => s + m.faturamento, 0);
  const margemMedia = ult3.reduce((s, m) => s + m.margem, 0) / (ult3.length || 1);
  const pMargem = fatUlt > 0 ? r1(25 * clamp(margemMedia / 60, 0, 1)) : null;

  // 2) Crescimento de faturamento (últimos 3m vs 3m anteriores) — 25 pts (cheio a +30%)
  // base: faturamento no trimestre ANTERIOR — sem ele não há de onde crescer
  const fatAnt = ant3.reduce((s, m) => s + m.faturamento, 0);
  const cresc = fatAnt > 0 ? ((fatUlt - fatAnt) / fatAnt) * 100 : 0;
  const pCresc = fatAnt > 0 ? r1(25 * clamp(cresc / 30, 0, 1)) : null;

  // 3) Diversificação de receita (ano) — 15 pts (1 − HHI das shares por produto)
  // base: receita no ano — sem receita não existe distribuição para medir
  const prods = porProduto(ds, produtos, ref.getFullYear());
  const totalReceita = prods.reduce((s, p) => s + p.receita, 0);
  const hhi = totalReceita
    ? prods.reduce((s, p) => s + Math.pow(p.receita / totalReceita, 2), 0)
    : 1;
  const pDiv = totalReceita > 0 ? r1(15 * clamp((1 - hhi) / 0.6, 0, 1)) : null;

  // 4) Taxa de reembolso (ano) — 15 pts (cheio até 1%, zera em 8%)
  // base: faturamento no ano — sem venda não há o que ser reembolsado
  const ano = String(ref.getFullYear());
  const fatAno = ds.matriculas
    .filter((m) => m.data.startsWith(ano) && m.statusPagamento !== "pendente")
    .reduce((s, m) => s + m.valor, 0);
  const reeAno = ds.reembolsos.filter((x) => x.data.startsWith(ano)).reduce((s, x) => s + x.valor, 0);
  const taxaRee = fatAno ? (reeAno / fatAno) * 100 : 0;
  const pRee = fatAno > 0 ? r1(15 * clamp((8 - taxaRee) / 7, 0, 1)) : null;

  // 5) Retenção de clientes — 20 pts (cheio com 50%+ de recorrentes entre compradores)
  // base: existir comprador na base
  const compradores = alunos.filter((a) => a.statusFunil !== "potencial");
  const recorrentes = alunos.filter((a) => a.statusFunil === "recorrente");
  const pctRet = compradores.length ? (recorrentes.length / compradores.length) * 100 : 0;
  const pRet = compradores.length ? r1(20 * clamp(pctRet / 50, 0, 1)) : null;

  const fatores: FatorSaude[] = [
    {
      nome: "Margem de lucro (3 meses)",
      pontos: pMargem,
      max: 25,
      temBase: pMargem !== null,
      detalhe:
        pMargem === null
          ? "sem faturamento nos últimos 3 meses — não há margem para medir"
          : `média de ${margemMedia.toFixed(1)}% — referência: 60%+`,
    },
    {
      nome: "Crescimento do faturamento",
      pontos: pCresc,
      max: 25,
      temBase: pCresc !== null,
      detalhe:
        pCresc === null
          ? "sem faturamento no trimestre anterior — não há base de comparação"
          : `${cresc >= 0 ? "+" : ""}${cresc.toFixed(1)}% vs trimestre anterior — referência: +30%`,
    },
    {
      nome: "Diversificação de receita",
      pontos: pDiv,
      max: 15,
      temBase: pDiv !== null,
      detalhe:
        pDiv === null
          ? "sem receita no ano — não há distribuição para medir"
          : prods.length > 1
            ? `${prods.length} produtos ativos`
            : "receita concentrada em 1 produto",
    },
    {
      nome: "Taxa de reembolso",
      pontos: pRee,
      max: 15,
      temBase: pRee !== null,
      detalhe:
        pRee === null
          ? "sem venda no ano — não há o que ser reembolsado"
          : `${taxaRee.toFixed(1)}% do faturamento do ano — saudável: até 2%`,
    },
    {
      nome: "Retenção de alunos",
      pontos: pRet,
      max: 20,
      temBase: pRet !== null,
      detalhe:
        pRet === null
          ? "sem comprador na base — não há retenção para medir"
          : `${pctRet.toFixed(0)}% dos compradores são recorrentes — referência: 50%+`,
    },
  ];

  const comBase = fatores.filter((f) => f.temBase);
  const maxComBase = comBase.reduce((s, f) => s + f.max, 0);
  const semBase = maxComBase === 0;
  // com os 5 fatores em pé o divisor é 100 e o score é idêntico ao de antes
  const score = semBase
    ? null
    : Math.round((comBase.reduce((s, f) => s + (f.pontos ?? 0), 0) / maxComBase) * 100);
  const nivel: NivelSaudeScore | null =
    score === null ? null : score >= 80 ? "excelente" : score >= 60 ? "saudavel" : score >= 40 ? "atencao" : "critico";
  return {
    score,
    semBase,
    parcial: !semBase && comBase.length < fatores.length,
    maxComBase,
    nivel,
    fatores,
  };
}

export const NIVEL_SAUDE_LABEL: Record<NivelSaudeScore, string> = {
  critico: "Crítico",
  atencao: "Atenção",
  saudavel: "Saudável",
  excelente: "Excelente",
};
