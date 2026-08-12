// Lógica pura da tela "Começar" — o passo a passo que tira a planilha do zero.
//
// O PROBLEMA QUE ISTO RESOLVE
// A planilha do cliente nasce com todas as abas de entrada em zero linhas. O
// painel calcula certo e mostra vazio, porque não existe cadastro base: sem
// produto não há fonte de renda, sem responsável não há braço nem comissão,
// sem conta não há caixa, sem meta não há norte. Este módulo não sabe nada de
// banco de dados — ele só transforma "quantos registros existem de cada tipo"
// na resposta de negócio "quanto falta para o painel sair do zero". Fica puro
// de propósito: fácil de testar e reaproveitável fora da tela (ex.: um aviso
// no dashboard, no futuro).

export type IdPassoComecar = "produtos" | "responsaveis" | "contas" | "metas";

export interface PassoComecar {
  id: IdPassoComecar;
  titulo: string;
  quantidade: number;
  concluido: boolean;
}

/**
 * O passo "Agrupamentos" — cadastro explicitamente OPCIONAL (juntar produtos
 * da mesma linha de negócio para ver quanto cada linha pesa). Fica de fora de
 * `PassoComecar`/`IdPassoComecar` de propósito: esse tipo e o array `passos`
 * abaixo são o que alimenta "quanto falta para o painel sair do zero", e um
 * passo que dá pra pular não é pendência — nunca deve somar em `total` nem em
 * `concluidos`. `cadastrado`, e não `concluido`, é o nome do campo aqui só
 * para deixar claro visualmente que nada trava por causa dele.
 */
export interface PassoOpcionalComecar {
  titulo: string;
  quantidade: number;
  cadastrado: boolean;
}

export interface ResumoComecar {
  passos: PassoComecar[];
  /** Fora da conta de pendência — ver `PassoOpcionalComecar`. */
  passoOpcional: PassoOpcionalComecar;
  concluidos: number;
  total: number;
  completo: boolean;
  /** Primeiro passo ainda pendente, na ordem de dependência — null quando completo. */
  proximoPendente: PassoComecar | null;
}

/** Contagem de registros já cadastrados de cada tipo, na ordem em que um habilita o próximo. */
export interface ContagensComecar {
  produtos: number;
  responsaveis: number;
  contas: number;
  metas: number;
  /** Cadastro opcional — nunca entra na conta de "quanto falta". */
  agrupamentos: number;
}

// A ordem aqui É a ordem de dependência da tela: produto habilita venda,
// responsável habilita braço/comissão, conta habilita caixa, meta dá o norte.
const TITULO_PASSO: Record<IdPassoComecar, string> = {
  produtos: "Fontes de renda",
  responsaveis: "Quem vende",
  contas: "Onde o dinheiro fica",
  metas: "Metas do ano",
};

const ORDEM_PASSOS: IdPassoComecar[] = ["produtos", "responsaveis", "contas", "metas"];

/** Monta o resumo dos quatro passos a partir da contagem de cada cadastro. */
export function resumoComecar(c: ContagensComecar): ResumoComecar {
  const passos: PassoComecar[] = ORDEM_PASSOS.map((id) => {
    const quantidade = c[id];
    return { id, titulo: TITULO_PASSO[id], quantidade, concluido: quantidade > 0 };
  });
  const concluidos = passos.filter((p) => p.concluido).length;
  return {
    passos,
    // `c.agrupamentos` só alimenta este campo à parte — não entra em `total`
    // nem em `concluidos`, exatamente para não virar pendência.
    passoOpcional: {
      titulo: "Agrupamentos",
      quantidade: c.agrupamentos,
      cadastrado: c.agrupamentos > 0,
    },
    concluidos,
    total: passos.length,
    completo: concluidos === passos.length,
    proximoPendente: passos.find((p) => !p.concluido) ?? null,
  };
}

/**
 * A frase-resposta da seção do topo — uma frase de gente, conclusiva.
 * "3 de 4 passos prontos — falta só X" serve; "58% concluído" não serve para
 * quem não é técnico.
 */
export function fraseResumoComecar(r: ResumoComecar): string {
  if (r.total === 0) return "Nada para cadastrar ainda.";
  if (r.completo) return "Os 4 passos estão prontos — o painel já tem de onde calcular.";
  if (r.concluidos === 0) {
    return "Nenhum passo pronto ainda — comece cadastrando as fontes de renda.";
  }
  const falta = r.total - r.concluidos;
  if (falta === 1 && r.proximoPendente) {
    return `${r.concluidos} de ${r.total} passos prontos — falta só ${r.proximoPendente.titulo.toLowerCase()}.`;
  }
  return `${r.concluidos} de ${r.total} passos prontos.`;
}
