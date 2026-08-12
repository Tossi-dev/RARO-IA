// Catálogo dos "aplicativos" da tela inicial (/inicio) — módulo NEUTRO.
//
// Por que existe: a tela inicial (src/app/(app)/inicio/page.tsx) é Server
// Component e o painel/springboard (src/components/springboard.tsx) é
// "use client". Um módulo "use client" não pode exportar dado lido no
// servidor (React Client Manifest → 500 em runtime) — então o catálogo, que
// os dois precisam ler, mora aqui, sem diretiva nenhuma. O mesmo motivo por
// trás de src/components/fin-rotas.ts.
//
// O componente de ícone do lucide-react NÃO é resolvido aqui: só o NOME
// (string) viaja neste módulo. Quem troca nome por componente é a tela
// (src/components/springboard.tsx), porque lucide-react é biblioteca de UI.
//
// A lista foi montada lendo o que EXISTE hoje — src/components/sidebar.tsx,
// src/components/fin-rotas.ts e as pastas de src/app/(app)/ — para não
// inventar rota que não existe nem esquecer nenhuma tela ligada no menu.

/** Nomes de ícone do lucide-react usados no catálogo — a lista fechada que
 *  springboard.tsx precisa mapear para o componente de fato. */
export type NomeIcone =
  | "LayoutDashboard"
  | "CalendarDays"
  | "Wallet"
  | "Users"
  | "Rocket"
  | "Clapperboard"
  | "TrendingUp"
  | "ArrowLeftRight"
  | "LineChart"
  | "FileText"
  | "Landmark"
  | "Undo2"
  | "HandCoins"
  | "Film"
  | "Megaphone"
  | "Trophy"
  | "Layers"
  | "ListChecks"
  | "Workflow"
  | "Upload"
  | "Plug";

export interface SubApp {
  id: string;
  nome: string;
  href: string;
  icone: NomeIcone;
  /** Cor de acento em hex — vem de CORES_CATEGORICAS (src/lib/cores.ts), sem inventar tom novo. */
  cor: string;
  /** Frase curta do que a tela faz. */
  frase: string;
}

export interface AppCatalogo {
  id: string;
  nome: string;
  href: string;
  icone: NomeIcone;
  cor: string;
  frase: string;
  /** Presente só nos apps que agrupam outras telas (Financeiro, Conteúdo, Lançamentos). */
  subApps?: SubApp[];
}

// Paleta PRÓPRIA da tela inicial — não é mais a de CORES_CATEGORICAS
// (src/lib/cores.ts). Aquela paleta continua violeta/magenta de propósito:
// é a cor SEMÂNTICA dos gráficos ("entrou" é sempre a mesma cor, em toda
// tela, então não pode mudar com o rebrand — ver o comentário do bloco 4 no
// cabeçalho de globals.css). Mas os DEZ ícones da tela inicial (os seis
// apps abaixo + os quatro de CATALOGO_SISTEMA) não carregam significado de
// dado nenhum — são só identidade visual, então são eles que precisavam
// virar para a família nova (azul-marinho + dourado do cliente), e não a
// paleta de gráfico.
//
// Critério de cada cor (todas as dez precisam ficar DISTINGUÍVEIS entre si,
// senão o usuário erra o clique):
//   - Dashboard, Agenda e Lançamentos ficam nos TRÊS tons oficiais de
//     --primaria (claro/base/escuro) — são os três apps mais "centrais" do
//     dia a dia, então herdam a cor mais forte da marca, cada um num degrau.
//   - Conteúdo & Redes ganha um quarto tom de azul (céu, mais aberto) em vez
//     de repetir um dos três de cima: mídia/vídeo/transmissão já associa
//     com essa família, e assim não fica um quarto ícone indistinguível dos
//     outros três azuis-marca.
//   - Financeiro é verde: já é a cor semântica de "positivo" no resto do
//     produto (--positivo, CORES_CAIXA.entrada), então reaproveitar aqui
//     mantém "verde = dinheiro indo bem" em vez de introduzir um quinto azul.
//   - Central de Clientes é o ÚNICO ícone dourado do grupo principal — o
//     dourado do cliente (--dourado) é acento de marca, não área, então um
//     módulo só (o de relacionamento com quem paga) é o bastante para ele
//     aparecer sem virar "alerta" por repetição.
// Os quatro utilitários de CATALOGO_SISTEMA (extrato, coleta, começar,
// integrações) usam tons de SLATE — neutros de propósito, porque são telas
// de configuração/entrada de dado, acessadas uma vez por semana ou uma vez
// na vida, não área de trabalho. Cor viva ali competiria por atenção com os
// seis apps de cima sem motivo de negócio.
const COR_DASHBOARD = "#2563eb"; // azul-marinho base (--primaria)
const COR_AGENDA = "#3b82f6"; // azul claro (--primaria-2)
const COR_FINANCEIRO = "#10b981"; // verde — mesma leitura de "positivo" do resto do produto
const COR_CRM = "#f59e0b"; // dourado do cliente (--dourado) — único do grupo principal
const COR_LANCAMENTOS = "#1d4ed8"; // azul escuro/royal (--primaria-press)
const COR_CONTEUDO = "#0ea5e9"; // azul-céu — quarto tom de azul, mais aberto (mídia/transmissão)

/**
 * Financeiro (src/components/fin-rotas.ts é o mapa oficial das telas do
 * módulo — usado aqui ao pé da letra, na mesma ordem, com a MESMA pergunta
 * de negócio de cada rota como frase do ícone).
 */
const SUBAPPS_FINANCEIRO: SubApp[] = [
  {
    id: "financeiro-resultado",
    nome: "Resultado",
    href: "/financeiro",
    icone: "TrendingUp",
    cor: COR_FINANCEIRO,
    frase: "O ano está dando lucro e batendo as metas?",
  },
  {
    id: "financeiro-caixa",
    nome: "Fluxo de caixa",
    href: "/financeiro/caixa",
    icone: "ArrowLeftRight",
    cor: COR_FINANCEIRO,
    frase: "Sobrou ou faltou dinheiro no período, e por causa de quê?",
  },
  {
    id: "financeiro-projecao",
    nome: "Projeção 13 semanas",
    href: "/financeiro/projecao",
    icone: "LineChart",
    cor: COR_FINANCEIRO,
    frase: "Em que semana o caixa fica negativo se nada mudar?",
  },
  {
    id: "financeiro-dre",
    nome: "DRE gerencial",
    href: "/financeiro/dre",
    icone: "FileText",
    cor: COR_FINANCEIRO,
    frase: "A operação deu lucro no mês, independente de já ter recebido?",
  },
  {
    id: "financeiro-capital-de-giro",
    nome: "Capital de giro",
    href: "/financeiro/capital-de-giro",
    icone: "Landmark",
    cor: COR_FINANCEIRO,
    frase: "Quanto tenho a receber, quanto devo e quando cada um cai?",
  },
  {
    id: "financeiro-reembolsos",
    nome: "Reembolsos",
    href: "/financeiro/reembolsos",
    icone: "Undo2",
    cor: COR_FINANCEIRO,
    frase: "Quanto do faturamento está voltando, e por qual produto?",
  },
  {
    id: "financeiro-comissoes",
    nome: "Comissões",
    href: "/financeiro/comissoes",
    icone: "HandCoins",
    cor: COR_FINANCEIRO,
    frase: "Quanto devo para a rede hoje e quem já está atrasado?",
  },
];

/** Conteúdo & Redes — as três telas reais (src/app/(app)/conteudo/*), com a
 *  frase copiada do PageHeader de cada uma. */
const SUBAPPS_CONTEUDO: SubApp[] = [
  {
    id: "conteudo-posts",
    nome: "Posts & reels",
    href: "/conteudo",
    icone: "Film",
    cor: COR_CONTEUDO,
    frase: "Perfis, reels e posts — o que alimenta o funil",
  },
  {
    id: "conteudo-campanhas",
    nome: "Campanhas",
    href: "/conteudo/campanhas",
    icone: "Megaphone",
    cor: COR_CONTEUDO,
    frase: "Tráfego pago e orgânico amarrados aos conteúdos que performam",
  },
  {
    id: "conteudo-ranking",
    nome: "Ranking",
    href: "/conteudo/ranking",
    icone: "Trophy",
    cor: COR_CONTEUDO,
    frase: "Quem performou melhor, por quê — e o roteiro do próximo vencedor",
  },
];

/**
 * Lançamentos (src/app/(app)/lancamentos/page.tsx) NÃO tem duas rotas: é uma
 * página só, com dois assuntos empilhados sob dois PageHeader — "Fontes de
 * renda" (categoria/agrupamento/lista de produto) e "Lançamentos" (campanhas
 * com início e fim). Os dois sub-apps abaixo apontam para o MESMO /lancamentos
 * de propósito: inventar uma rota "/lancamentos/fontes" que não existe seria
 * pior do que dois ícones levando ao mesmo lugar — a tela em si já rola até o
 * bloco certo pelo título. Se um dia a página ganhar âncora própria, os href
 * daqui viram "/lancamentos#fontes-de-renda" etc.
 */
const SUBAPPS_LANCAMENTOS: SubApp[] = [
  {
    id: "lancamentos-fontes",
    nome: "Fontes de renda",
    href: "/lancamentos",
    icone: "Layers",
    cor: COR_LANCAMENTOS,
    frase: "Cada fonte de receita — cursos, mentorias, serviços, produtos, assinaturas e eventos.",
  },
  {
    id: "lancamentos-campanhas",
    nome: "Campanhas",
    href: "/lancamentos",
    icone: "Rocket",
    cor: COR_LANCAMENTOS,
    frase: "Campanhas com início e fim, do planejamento ao pós-venda",
  },
];

/**
 * O catálogo. Ordem = a mesma da sidebar (Visão geral → Gestão → Marketing).
 * "Começar", "Coleta de dados", "Importar extrato" e "Integrações" (grupo
 * "Sistema" da sidebar) ficaram FORA de propósito: são tela de configuração/
 * utilitário de entrada de dado, não área de trabalho do dia a dia — o pedido
 * do cliente listou os seis apps de trabalho ("Dashboard, Agenda, Financeiro,
 * Central de Clientes, Lançamentos, Conteúdo e Redes"), e essas quatro
 * continuam acessíveis só pela sidebar, como sempre.
 */
export const CATALOGO_APPS: AppCatalogo[] = [
  {
    // O Dashboard mora em "/painel" desde que a raiz do sistema virou a tela
    // inicial (os ícones). Ele deixou de ser a porta de entrada de propósito:
    // o dono entra vendo as áreas do negócio, e escolhe o painel quando quer
    // número — não o contrário.
    id: "dashboard",
    nome: "Dashboard",
    href: "/painel",
    icone: "LayoutDashboard",
    cor: COR_DASHBOARD,
    frase: "O posto de comando: meta, caixa, tendência e alerta em um lugar.",
  },
  {
    id: "agenda",
    nome: "Agenda",
    href: "/agenda",
    icone: "CalendarDays",
    cor: COR_AGENDA,
    frase: "As reuniões do dono, em dia, semana e mês.",
  },
  {
    id: "financeiro",
    nome: "Financeiro",
    href: "/financeiro",
    icone: "Wallet",
    cor: COR_FINANCEIRO,
    frase: "Resultado, caixa, projeção, DRE, capital de giro, reembolso e comissão.",
    subApps: SUBAPPS_FINANCEIRO,
  },
  {
    id: "crm",
    nome: "Central de Clientes",
    href: "/crm",
    icone: "Users",
    cor: COR_CRM,
    frase: "Alunos, estágio do funil e o histórico de cada um.",
  },
  {
    id: "lancamentos",
    nome: "Lançamentos",
    href: "/lancamentos",
    icone: "Rocket",
    cor: COR_LANCAMENTOS,
    frase: "Fontes de renda e campanhas de lançamento.",
    subApps: SUBAPPS_LANCAMENTOS,
  },
  {
    id: "conteudo",
    nome: "Conteúdo & Redes",
    href: "/conteudo",
    icone: "Clapperboard",
    cor: COR_CONTEUDO,
    frase: "Posts, reels, campanhas e ranking do que performa.",
    subApps: SUBAPPS_CONTEUDO,
  },
];

/**
 * As telas de ferramenta: cadastro base, entrada de dado e conexões. Elas
 * moravam só na sidebar, que saiu da tela. Sem elas na tela inicial, "importar
 * extrato" só existiria dentro do ⌘K — quem não sabe o nome não acha. Ficam
 * numa fileira separada de propósito: não são o trabalho do dia, são o que se
 * abre uma vez por semana ou uma vez na vida.
 */
export const CATALOGO_SISTEMA: AppCatalogo[] = [
  {
    id: "extrato",
    nome: "Importar extrato",
    href: "/extrato",
    icone: "Upload",
    cor: "#64748b", // slate-500 — ver comentário sobre a paleta acima de CATALOGO_APPS
    frase: "O extrato do banco vira lançamento no caixa, sem digitar linha por linha.",
  },
  {
    id: "coleta",
    nome: "Coleta de dados",
    href: "/coleta",
    icone: "Workflow",
    cor: "#94a3b8", // slate-400, mais claro que o de cima
    frase: "De onde cada número entra no sistema.",
  },
  {
    id: "comecar",
    nome: "Começar",
    href: "/comecar",
    icone: "ListChecks",
    cor: "#475569", // slate-600, mais escuro
    frase: "Cadastro base: produto, responsável, conta e meta.",
  },
  {
    id: "integracoes",
    nome: "Integrações",
    href: "/integracoes",
    icone: "Plug",
    cor: "#334155", // slate-700, o mais escuro dos quatro
    frase: "Planilha, agenda do Google e o que mais estiver ligado.",
  },
];

/** `pathname` é a própria rota do app, ou uma rota filha dela ("/x" cobre "/x/y"). */
function ehMesmaRotaOuFilha(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Acha qual app (e, se for o caso, qual sub-app) responde por uma rota.
 * Em empate de especificidade — a própria rota do app É a rota de um dos
 * sub-apps, caso de "/financeiro" e "/lancamentos" — o app-nível vence e
 * `subApp` volta `null`: é a rota "de entrada" da pasta, não de um cômodo
 * específico dela.
 */
export function acharAppPorRota(
  pathname: string,
  apps: AppCatalogo[] = CATALOGO_APPS
): { app: AppCatalogo; subApp: SubApp | null } | null {
  let melhor: { app: AppCatalogo; subApp: SubApp | null; especificidade: number } | null = null;
  for (const app of apps) {
    const candidatos: Array<{ subApp: SubApp | null; href: string }> = [
      { subApp: null, href: app.href },
      ...(app.subApps ?? []).map((s) => ({ subApp: s, href: s.href })),
    ];
    for (const c of candidatos) {
      if (!ehMesmaRotaOuFilha(pathname, c.href)) continue;
      const especificidade = c.href.length;
      if (!melhor || especificidade > melhor.especificidade) {
        melhor = { app, subApp: c.subApp, especificidade };
      }
    }
  }
  return melhor ? { app: melhor.app, subApp: melhor.subApp } : null;
}

/**
 * Valida um contador de badge: só número finito e positivo vira badge.
 * Badge inventado é pior que badge nenhum — 0, negativo, NaN ou ausente
 * significa "não desenha nada", nunca "desenha zero".
 */
export function badgeValido(n: number | null | undefined): number | undefined {
  if (n === null || n === undefined || !Number.isFinite(n) || n <= 0) return undefined;
  return Math.trunc(n);
}

/** Quantos apps do catálogo têm, hoje, um badge de verdade para mostrar. */
export function contarAppsComBadge(
  apps: AppCatalogo[],
  badges: Partial<Record<string, number | null | undefined>>
): number {
  return apps.filter((app) => badgeValido(badges[app.id]) !== undefined).length;
}

/** Ordem alfabética (pt-BR) — usada dentro de uma pasta, onde não existe uma
 *  ordem "de uso" curada como a da grade principal, só uma lista para escanear. */
export function ordenarApps<T extends { nome: string }>(itens: T[]): T[] {
  return [...itens].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}
