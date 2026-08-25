// Mapa das telas do módulo Financeiro (P1 · Módulo F) — módulo NEUTRO.
// Sem "use client" de propósito: a sub-nav (client) e o command palette /
// sidebar (server e client) consomem a mesma lista. Um módulo "use client"
// não pode exportar dados lidos no servidor (React Client Manifest → 500).

/** Regime contábil que a tela enxerga. A separação é a regra de ouro do P1. */
export type RegimeFin = "caixa" | "competencia" | "misto";

export interface RotaFin {
  href: string;
  rotulo: string;
  /** Pergunta de negócio que a tela responde em ≤10s. */
  pergunta: string;
  regime: RegimeFin;
}

export const ROTAS_FIN: RotaFin[] = [
  {
    href: "/financeiro",
    rotulo: "Resultado",
    pergunta: "O ano está dando lucro e batendo as metas?",
    regime: "competencia",
  },
  {
    href: "/financeiro/caixa",
    rotulo: "Fluxo de caixa",
    pergunta: "Sobrou ou faltou dinheiro no período, e por causa de quê?",
    regime: "caixa",
  },
  {
    href: "/financeiro/projecao",
    rotulo: "Projeção 13 semanas",
    pergunta: "Em que semana o caixa fica negativo se nada mudar?",
    regime: "caixa",
  },
  {
    href: "/financeiro/dre",
    rotulo: "DRE gerencial",
    pergunta: "A operação deu lucro no mês, independente de já ter recebido?",
    regime: "competencia",
  },
  // "Capital de giro" saiu daqui na virada para mentoria (rota removida).
  {
    href: "/financeiro/reembolsos",
    rotulo: "Reembolsos",
    // O teto de 1% do gateway não vale aqui: este cliente recebe SÓ por Pix e
    // não tem conta em gateway nenhum. A pergunta certa é sobre o dinheiro que
    // volta, não sobre um limite de plataforma que ele não usa.
    pergunta: "Quanto do faturamento está voltando, e por qual produto?",
    regime: "misto",
  },
  {
    href: "/financeiro/cobrancas",
    rotulo: "Cobranças",
    pergunta: "O que venceu, o que entrou e qual lembrete precisa de aprovação?",
    regime: "competencia",
  },
  {
    href: "/financeiro/contratos",
    rotulo: "Contratos",
    pergunta: "Quais contratos estão registrados e em que situação?",
    regime: "competencia",
  },
  {
    href: "/financeiro/recorrencia",
    rotulo: "Recorrência",
    pergunta: "Qual receita recorrente foi recebida e o que ainda não tem base?",
    regime: "competencia",
  },
  // "Comissões" saiu daqui na virada para mentoria (rota removida).
];

export const REGIME_LABEL: Record<RegimeFin, string> = {
  caixa: "Regime de caixa",
  competencia: "Regime de competência",
  misto: "Competência + caixa",
};

export const REGIME_EXPLICACAO: Record<RegimeFin, string> = {
  caixa: "Dinheiro que entrou ou saiu da conta na data em que bateu. Faturar não é receber.",
  competencia: "Fato econômico na data em que aconteceu, mesmo que o dinheiro ainda não tenha caído.",
  misto: "Base de venda em competência; efeito no dinheiro em caixa. Cada número diz qual usa.",
};
