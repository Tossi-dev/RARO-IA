// Regras de negócio da MentorOS.
// As taxas por forma de pagamento vêm da lógica validada no projeto LA Beauty.

import type { FormaPgto, StatusFunil, StatusLancamento, TipoDespesa, TipoProduto } from "./types";

export const TAXAS_PGTO: Record<FormaPgto, number> = {
  pix: 0,
  dinheiro: 0,
  debito: 1.69,
  credito_vista: 2.69,
  credito_2x6x: 3.09,
  credito_7x12x: 3.99,
};

export const FORMA_PGTO_LABEL: Record<FormaPgto, string> = {
  pix: "Pix",
  dinheiro: "Dinheiro",
  debito: "Débito",
  credito_vista: "Crédito à vista",
  credito_2x6x: "Crédito 2x–6x",
  credito_7x12x: "Crédito 7x–12x",
};

/** Valor líquido após a taxa da forma de pagamento. */
export function calcLiquido(valor: number, forma: FormaPgto): number {
  const taxa = TAXAS_PGTO[forma] ?? 0;
  return +(valor * (1 - taxa / 100)).toFixed(2);
}

/** Comissão de afiliado sobre uma venda. */
export function calcComissao(valor: number, pct: number): number {
  return +((valor * pct) / 100).toFixed(2);
}

export const CATEGORIAS_DESPESA = [
  "Tráfego pago",
  "Ferramentas e software",
  "Plataforma de curso",
  "Equipe",
  "Produção de conteúdo",
  "Impostos",
  "Taxas de pagamento",
  "Eventos e presencial",
  "Outros",
] as const;

export const STATUS_FUNIL_LABEL: Record<StatusFunil, string> = {
  potencial: "Potencial",
  novo: "Novo",
  recorrente: "Recorrente",
  inativo: "Inativo",
};

export const TIPO_PRODUTO_LABEL: Record<TipoProduto, string> = {
  low_ticket: "Low ticket",
  high_ticket: "High ticket",
  mentoria: "Mentoria",
};

export const STATUS_LANCAMENTO_LABEL: Record<StatusLancamento, string> = {
  planejado: "Planejado",
  ativo: "Ativo",
  encerrado: "Encerrado",
};

export const TIPO_DESPESA_LABEL: Record<TipoDespesa, string> = {
  fixa: "Fixa",
  variavel: "Variável",
};

// ===== Expansão v2 =====

import type {
  AtividadeTipo,
  CampanhaTipo,
  ConteudoTipo,
  PilarVideo,
  PlataformaSocial,
  ReuniaoStatus,
  TarefaPrioridade,
} from "./types";

export const ATIVIDADE_LABEL: Record<AtividadeTipo, string> = {
  nota: "Nota",
  contato: "Contato",
  whatsapp: "WhatsApp",
  ligacao: "Ligação",
  email: "E-mail",
  evento: "Reunião/Evento",
  compra: "Compra",
  tarefa: "Tarefa",
  sistema: "Sistema",
};

// Sem mapa de ícones por tipo de atividade: a timeline usa marcador tipográfico
// neutro e o tipo aparece por extenso em ATIVIDADE_LABEL (regra de ouro: zero emoji).

export const REUNIAO_STATUS_LABEL: Record<ReuniaoStatus, string> = {
  agendada: "Agendada",
  realizada: "Realizada",
  cancelada: "Cancelada",
};

export const PLATAFORMA_LABEL: Record<PlataformaSocial, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  facebook: "Facebook",
};

export const CONTEUDO_TIPO_LABEL: Record<ConteudoTipo, string> = {
  reel: "Reel",
  post: "Post",
  story: "Story",
  video: "Vídeo",
  carrossel: "Carrossel",
};

export const PILAR_LABEL: Record<PilarVideo, string> = {
  gancho: "Gancho",
  desenvolvimento: "Desenvolvimento",
  cta: "CTA",
};

export const PILAR_DICA: Record<PilarVideo, string> = {
  gancho: "Primeiros 3s — o que segura a pessoa no vídeo",
  desenvolvimento: "O miolo — entrega de valor que sustenta a retenção",
  cta: "Chamada final — o que a pessoa deve fazer",
};

export const CAMPANHA_TIPO_LABEL: Record<CampanhaTipo, string> = {
  pago: "Tráfego pago",
  organico: "Orgânico",
};

export const PRIORIDADE_LABEL: Record<TarefaPrioridade, string> = {
  alta: "Alta",
  media: "Média",
  baixa: "Baixa",
};

/** Indicadores do dashboard com drill-down (/analise/[indicador]) */
export const INDICADORES: Record<string, { titulo: string; descricao: string }> = {
  faturamento: {
    titulo: "Faturamento",
    descricao: "Tudo o que entrou de receita bruta — por produto, forma de pagamento e período.",
  },
  custos: {
    titulo: "Custos totais",
    descricao: "Para onde o dinheiro está indo — comissões, despesas fixas, variáveis e reembolsos.",
  },
  comissoes: {
    titulo: "Comissões",
    descricao: "Quanto cada afiliado gerou de comissão e o peso disso no resultado.",
  },
  margem: {
    titulo: "Margem de lucro",
    descricao: "O percentual que sobra de cada real faturado, e o que está comendo a margem.",
  },
  lucro: {
    titulo: "Resultado líquido",
    descricao: "A decomposição completa: do faturamento bruto ao que de fato sobra.",
  },
};

// ===== P1 — camada de caixa =====

import type {
  CategoriaCaixa,
  MotivoChargeback,
  RegimeTributario,
  StatusChargeback,
  StatusPagavel,
  StatusRecebivel,
  TipoContaBancaria,
} from "./types";

/**
 * Rótulos dos tipos de conta, na língua do dono. Moraram um tempo dentro de
 * src/components/comecar-passos.tsx, quando só aquela tela cadastrava conta;
 * subiram para cá quando a importação de extrato passou a cadastrar também —
 * duas telas com dicionários próprios acabam divergindo, e o dono lê nomes
 * diferentes para a mesma coisa em lugares diferentes.
 */
export const TIPO_CONTA_LABEL: Record<TipoContaBancaria, string> = {
  corrente: "Conta corrente",
  poupanca: "Poupança",
  gateway: "Saldo parado em gateway (Hotmart, Kiwify...)",
  caixa_fisico: "Caixa físico (dinheiro em espécie)",
  investimento: "Investimento",
};

/** Rótulos do plano de contas do fluxo de caixa direto. */
export const CATEGORIA_CAIXA_LABEL: Record<CategoriaCaixa, string> = {
  vendas: "Vendas",
  outras_receitas: "Outras receitas",
  trafego: "Tráfego pago",
  comissoes: "Comissões",
  taxas_gateway: "Taxas de gateway",
  impostos: "Impostos",
  folha_prolabore: "Folha e pró-labore",
  saas_ferramentas: "SaaS e ferramentas",
  producao_conteudo: "Produção de conteúdo",
  reembolsos: "Reembolsos",
  outros: "Outros",
};

/** Categorias que representam dinheiro entrando (as demais são saída). */
export const CATEGORIAS_ENTRADA: CategoriaCaixa[] = ["vendas", "outras_receitas"];

export const STATUS_RECEBIVEL_LABEL: Record<StatusRecebivel, string> = {
  a_vencer: "A vencer",
  recebido: "Recebido",
  atrasado: "Atrasado",
};

export const STATUS_PAGAVEL_LABEL: Record<StatusPagavel, string> = {
  a_vencer: "A vencer",
  pago: "Pago",
  atrasado: "Atrasado",
};

export const MOTIVO_CHARGEBACK_LABEL: Record<MotivoChargeback, string> = {
  nao_reconhecido: "Compra não reconhecida",
  produto_nao_entregue: "Produto não entregue",
  fraude: "Fraude",
  duplicidade: "Cobrança duplicada",
  insatisfacao: "Insatisfação",
  outros: "Outros",
};

export const STATUS_CHARGEBACK_LABEL: Record<StatusChargeback, string> = {
  aberto: "Em disputa",
  ganho: "Ganho",
  perdido: "Perdido",
};

export const REGIME_TRIBUTARIO_LABEL: Record<RegimeTributario, string> = {
  simples: "Simples Nacional",
  presumido: "Lucro Presumido",
  real: "Lucro Real",
  mei: "MEI",
};

/** Teto de chargeback tolerado pelas bandeiras antes de bloqueio (%). */
export const LIMITE_CHARGEBACK_PCT = 1;
