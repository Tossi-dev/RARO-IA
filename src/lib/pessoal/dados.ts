import "server-only";

import { supabaseConfigurado } from "../data";
import { criarSupabaseServer } from "../supabase/server";
import { resumoPatrimonial, type InvestimentoPatrimonial, type ItemPatrimonial, type ResumoPatrimonial } from "./patrimonio";

type Linha = Record<string, unknown>;

export interface DadosPessoais {
  conectado: boolean;
  motivo: string;
  parcial: boolean;
  itens: ItemPatrimonial[];
  investimentos: InvestimentoPatrimonial[];
  resumo: ResumoPatrimonial;
}

const SEM_CONEXAO = "Nenhuma conexão com o banco de dados configurada. As finanças pessoais não podem ser carregadas agora.";
const ERRO_LEITURA = "Não foi possível carregar as finanças pessoais agora. Tente novamente em instantes.";
const DADOS_INCOMPLETOS = "Há registros antigos sem classificação ou valores completos; eles não entram nos totais até serem informados.";

function numero(valor: unknown): number | null {
  if (valor === null || valor === undefined || (typeof valor === "string" && valor.trim() === "")) return null;
  const convertido = typeof valor === "number" ? valor : Number(valor);
  return Number.isFinite(convertido) && convertido >= 0 ? convertido : null;
}

function itemDaLinha(linha: Linha): ItemPatrimonial | null {
  const classe = typeof linha.classe === "string" ? linha.classe.trim() : "";
  const valor = numero(linha.valor);
  return classe && valor !== null ? { classe, valor } : null;
}

function investimentoDaLinha(linha: Linha): InvestimentoPatrimonial | null {
  const nome = typeof linha.nome === "string" ? linha.nome.trim() : "";
  const aportado = numero(linha.aportado);
  const valorAtual = numero(linha.valor_atual);
  return nome && aportado !== null && valorAtual !== null ? { nome, aportado, valorAtual } : null;
}

export async function lerDadosPessoais(): Promise<DadosPessoais> {
  const vazio = { itens: [], investimentos: [], resumo: resumoPatrimonial([], []) };
  if (!supabaseConfigurado()) return { conectado: false, motivo: SEM_CONEXAO, parcial: false, ...vazio };

  try {
    const supabase = criarSupabaseServer();
    const [patrimonio, investimentos] = await Promise.all([
      supabase.from("patrimonio").select("classe, valor").order("criado_em", { ascending: false }),
      supabase.from("investimento").select("nome, aportado, valor_atual").order("criado_em", { ascending: false }),
    ]);
    if (patrimonio.error || investimentos.error) return { conectado: false, motivo: ERRO_LEITURA, parcial: false, ...vazio };

    const linhasPatrimonio = (patrimonio.data ?? []) as Linha[];
    const linhasInvestimentos = (investimentos.data ?? []) as Linha[];
    const itens = linhasPatrimonio.map(itemDaLinha).filter((item): item is ItemPatrimonial => item !== null);
    const itensInvestidos = linhasInvestimentos.map(investimentoDaLinha).filter((item): item is InvestimentoPatrimonial => item !== null);
    const parcial = itens.length !== linhasPatrimonio.length || itensInvestidos.length !== linhasInvestimentos.length;
    return {
      conectado: true,
      motivo: parcial ? DADOS_INCOMPLETOS : "",
      parcial,
      itens,
      investimentos: itensInvestidos,
      resumo: resumoPatrimonial(itens, itensInvestidos),
    };
  } catch {
    return { conectado: false, motivo: ERRO_LEITURA, parcial: false, ...vazio };
  }
}
