export type ItemPatrimonial = { classe: string; valor: number };
export type InvestimentoPatrimonial = { nome: string; aportado: number; valorAtual: number };

export type AlocacaoPatrimonial = { classe: string; valor: number; percentual: number };
export type InvestimentoResumo = InvestimentoPatrimonial & { rentabilidade: number | null };
export type ResumoPatrimonial = {
  total: number | null;
  alocacao: AlocacaoPatrimonial[];
  dividas: ItemPatrimonial[];
  investimentos: InvestimentoResumo[];
};

function numeroFinito(valor: number): boolean { return Number.isFinite(valor); }
function classeDe(classe: string): string { return classe.trim() || "outro"; }

function percentuais(valores: Array<{ classe: string; valor: number }>): AlocacaoPatrimonial[] {
  const totalAtivos = valores.reduce((soma, item) => soma + item.valor, 0);
  if (totalAtivos <= 0) return [];
  const agrupados = new Map<string, number>();
  for (const item of valores) agrupados.set(item.classe, (agrupados.get(item.classe) ?? 0) + item.valor);
  const base = [...agrupados.entries()].sort(([a], [b]) => a.localeCompare(b, "pt-BR")).map(([classe, valor]) => ({
    classe, valor, centesimos: Math.floor((valor / totalAtivos) * 10_000),
  }));
  let restantes = 10_000 - base.reduce((soma, item) => soma + item.centesimos, 0);
  for (let indice = 0; restantes > 0; indice = (indice + 1) % base.length, restantes--) base[indice].centesimos++;
  return base.map(({ classe, valor, centesimos }) => ({ classe, valor, percentual: centesimos / 100 }));
}

export function resumoPatrimonial(itens: ItemPatrimonial[], investimentos: InvestimentoPatrimonial[]): ResumoPatrimonial {
  const itensValidos = itens.filter((item) => numeroFinito(item.valor)).map((item) => ({ ...item, classe: classeDe(item.classe) }));
  const investimentosValidos = investimentos.filter((item) => numeroFinito(item.aportado) && numeroFinito(item.valorAtual));
  const investimentosResumo = investimentosValidos.map((item) => ({
    ...item,
    rentabilidade: item.aportado === 0 ? null : (item.valorAtual - item.aportado) / item.aportado,
  }));
  if (itensValidos.length === 0 && investimentosResumo.length === 0) return { total: null, alocacao: [], dividas: [], investimentos: [] };
  const dividas = [
    ...itensValidos.filter((item) => item.valor < 0),
    ...investimentosResumo.filter((item) => item.valorAtual < 0).map((item) => ({ classe: "investimento", valor: item.valorAtual })),
  ];
  const ativos = [
    ...itensValidos.filter((item) => item.valor >= 0),
    ...investimentosResumo.filter((item) => item.valorAtual >= 0).map((item) => ({ classe: "investimento", valor: item.valorAtual })),
  ];
  const total = itensValidos.reduce((soma, item) => soma + item.valor, 0) + investimentosResumo.reduce((soma, item) => soma + item.valorAtual, 0);
  return { total, alocacao: percentuais(ativos), dividas, investimentos: investimentosResumo };
}
