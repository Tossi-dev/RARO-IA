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

import { rotaPermitida, type Papel } from "@/lib/papeis";

/** Nomes de ícone do lucide-react usados no catálogo — a lista fechada que
 *  springboard.tsx precisa mapear para o componente de fato. */
export type NomeIcone =
  | "LayoutDashboard"
  | "CalendarDays"
  | "Wallet"
  | "Users"
  | "Clapperboard"
  | "TrendingUp"
  | "ArrowLeftRight"
  | "LineChart"
  | "FileText"
  | "Undo2"
  | "Film"
  | "Megaphone"
  | "Trophy"
  | "ListChecks"
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
// cabeçalho de globals.css). Mas os OITO ícones da tela inicial (os cinco
// apps abaixo + os três de CATALOGO_SISTEMA) não carregam significado de
// dado nenhum — são só identidade visual, então são eles que precisavam
// virar para a família nova (azul-marinho + dourado do cliente), e não a
// paleta de gráfico.
//
// Critério de cada cor (todas as NOVE precisam ficar DISTINGUÍVEIS entre si,
// senão o usuário erra o clique):
//   - Mentoria fica no TERCEIRO tom oficial de --primaria (o escuro,
//     --primaria-press): é o mesmo tom que Lançamentos usava antes da virada
//     para mentoria e que, na época, foi deixado sem dono "pra não confundir
//     com outra área de trabalho" (comentário antigo desta seção). Agora tem
//     dono: Mentoria é o NÚCLEO do produto MentorOS, não mais um acessório
//     — reaproveitar o tom mais forte da própria marca (em vez de introduzir
//     uma cor nova) é o que marca essa posição de destaque.
//   - Dashboard e Agenda ficam nos outros dois tons de --primaria
//     (claro/base) — são os apps mais "centrais" do dia a dia, então também
//     herdam a cor forte da marca.
//   - Conteúdo & Redes ganha um quarto tom de azul (céu, mais aberto) em vez
//     de repetir um dos de cima: mídia/vídeo/transmissão já associa com essa
//     família, e assim não fica um ícone indistinguível dos outros azuis-marca.
//   - Financeiro é verde: já é a cor semântica de "positivo" no resto do
//     produto (--positivo, CORES_CAIXA.entrada), então reaproveitar aqui
//     mantém "verde = dinheiro indo bem" em vez de introduzir um quinto azul.
//   - Central de Clientes é o ÚNICO ícone dourado do grupo principal — o
//     dourado do cliente (--dourado) é acento de marca, não área, então um
//     módulo só (o de relacionamento com quem paga) é o bastante para ele
//     aparecer sem virar "alerta" por repetição.
// Os três utilitários de CATALOGO_SISTEMA (extrato, começar, integrações)
// usam tons de SLATE — neutros de propósito, porque são telas de
// configuração/entrada de dado, acessadas uma vez por semana ou uma vez na
// vida, não área de trabalho. Cor viva ali competiria por atenção com os
// apps de cima sem motivo de negócio. ("Coleta de dados" saiu do grupo na
// virada para mentoria — ver comentário de CATALOGO_SISTEMA.)
const COR_MENTORIA = "#1d4ed8"; // azul-marinho escuro (--primaria-press) — o núcleo do produto
const COR_DASHBOARD = "#2563eb"; // azul-marinho base (--primaria)
const COR_AGENDA = "#3b82f6"; // azul claro (--primaria-2)
const COR_FINANCEIRO = "#10b981"; // verde — mesma leitura de "positivo" do resto do produto
const COR_CRM = "#f59e0b"; // dourado do cliente (--dourado) — único do grupo principal
const COR_CONTEUDO = "#0ea5e9"; // azul-céu — quarto tom de azul, mais aberto (mídia/transmissão)

/**
 * Financeiro (src/components/fin-rotas.ts é o mapa oficial das telas do
 * módulo — usado aqui ao pé da letra, na mesma ordem, com a MESMA pergunta
 * de negócio de cada rota como frase do ícone).
 */
// "Capital de giro" e "Comissões" saíram deste catálogo na virada para
// mentoria (rota removida — ver docs/DESENHO-MENTOROS.md, seção 8).
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
    id: "financeiro-reembolsos",
    nome: "Reembolsos",
    href: "/financeiro/reembolsos",
    icone: "Undo2",
    cor: COR_FINANCEIRO,
    frase: "Quanto do faturamento está voltando, e por qual produto?",
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
 * O catálogo. Ordem = a mesma da sidebar (Visão geral → Gestão → Marketing).
 * "Começar", "Importar extrato" e "Integrações" (grupo "Sistema" da sidebar)
 * ficaram FORA de propósito: são tela de configuração/utilitário de entrada
 * de dado, não área de trabalho do dia a dia — o pedido do cliente listou os
 * apps de trabalho ("Dashboard, Agenda, Financeiro, Central de Clientes,
 * Conteúdo e Redes"), e essas continuam acessíveis só pela sidebar, como
 * sempre. ("Lançamentos" também listava aqui — saiu do catálogo inteiro na
 * virada para mentoria, rota removida; ver docs/DESENHO-MENTOROS.md, seção 8.)
 */
export const CATALOGO_APPS: AppCatalogo[] = [
  {
    // Primeiro da grade, de propósito: a mentoria é o NÚCLEO do produto
    // MentorOS (B2.3), não mais um módulo de apoio — a carteira de
    // mentorados é a primeira pergunta do dia, antes até do Dashboard.
    // `Trophy` é reaproveitado de `SUBAPPS_CONTEUDO` (ranking) sem conflito
    // visual: lá é ícone de pasta (só aparece dentro de Conteúdo & Redes),
    // aqui é ícone de primeiro nível — nunca os dois lado a lado na mesma
    // grade — e o significado ("conquista") cabe tanto em ranking de
    // conteúdo quanto em marco de mentorado.
    id: "mentoria",
    nome: "Mentoria",
    href: "/mentoria",
    icone: "Trophy",
    cor: COR_MENTORIA,
    frase: "A carteira de mentorados: progresso, sessões e quem está sem contato.",
  },
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
    frase: "Resultado, caixa, projeção, DRE e reembolso.",
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
  // "Coleta de dados" saiu daqui na virada para mentoria (rota removida).
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

/**
 * Congela um catálogo (o array, cada app, e o array/objetos de cada
 * `subApps`) — B2.7. Antes desta função, nada impedia um `push` ou uma
 * atribuição acidental em `CATALOGO_APPS`/`CATALOGO_SISTEMA` de mudar o
 * catálogo em produção para sempre (os dois vivem no módulo, carregados uma
 * vez por processo). `appsDoPapel` (abaixo) só é seguro de chamar em cada
 * requisição, com papéis diferentes, porque a fonte que ele lê não pode ser
 * mexida por baixo dele — o teste "não muta CATALOGO_APPS" prova a
 * consequência; esta função é a causa.
 *
 * `Object.freeze` é raso (só a primeira camada) — por isso desce manualmente
 * até `subApps`, senão o array de sub-apps continuaria mutável por dentro de
 * um app "congelado".
 */
function congelarCatalogo(apps: readonly AppCatalogo[]): readonly AppCatalogo[] {
  for (const app of apps) {
    if (app.subApps) {
      for (const sub of app.subApps) Object.freeze(sub);
      Object.freeze(app.subApps);
    }
    Object.freeze(app);
  }
  return Object.freeze(apps);
}

congelarCatalogo(CATALOGO_APPS);
congelarCatalogo(CATALOGO_SISTEMA);

/** `pathname` é a própria rota do app, ou uma rota filha dela ("/x" cobre "/x/y"). */
function ehMesmaRotaOuFilha(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Acha qual app (e, se for o caso, qual sub-app) responde por uma rota.
 * Em empate de especificidade — a própria rota do app É a rota de um dos
 * sub-apps, caso de "/financeiro" — o app-nível vence e `subApp` volta
 * `null`: é a rota "de entrada" da pasta, não de um cômodo específico dela.
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
 * B2.7 — o filtro que faltava entre "o portão de rota está correto" e "a
 * navegação respeita o papel". `rotaPermitida` (src/lib/papeis.ts) já sabia
 * dizer "mentorado não abre /financeiro"; nada consultava essa resposta
 * antes de DESENHAR o tile de Financeiro na tela inicial. O resultado
 * medido era uma grade cheia de botões que levam a /sem-acesso — vazamento
 * de EXISTÊNCIA (a pessoa descobre que o módulo existe, só não pode abrir)
 * bem em cima da tela que foi escrita para não vazar isso.
 *
 * Não reimplementa casamento de rota: cada decisão é delegada a
 * `rotaPermitida`, a MESMA função que o middleware usa para barrar de
 * verdade — duas fontes de verdade aqui poderiam divergir (um app aparecer
 * na grade e mesmo assim ser barrado, ou o contrário).
 *
 * Regra de sub-apps: um app cujo HREF é permitido mas cujos sub-apps são
 * todos negados continua aparecendo — com `subApps` filtrado (podendo virar
 * `[]`, nunca `undefined` quando o app original tinha a chave) — porque a
 * própria rota do app pode ter algo para mostrar mesmo sem nenhum dos
 * cômodos internos (é o caso, hoje, de "/financeiro" ser a tela de
 * Resultado). Um app cujo HREF em si é negado some inteiro da lista, sub-apps
 * e tudo: não faz sentido oferecer a pasta se nem a porta da pasta abre.
 *
 * Não muta `apps` (nem o array recebido nem os objetos dele) — devolve
 * sempre objetos NOVOS. Como `CATALOGO_APPS`/`CATALOGO_SISTEMA` estão
 * congelados (`congelarCatalogo`, acima), uma tentativa de mutar lançaria em
 * modo estrito; esta função nunca tenta.
 */
export function appsDoPapel(papel: Papel, apps: AppCatalogo[] = CATALOGO_APPS): AppCatalogo[] {
  const permitidos: AppCatalogo[] = [];
  for (const app of apps) {
    if (!rotaPermitida(papel, app.href)) continue;
    if (!app.subApps) {
      permitidos.push({ ...app });
      continue;
    }
    permitidos.push({ ...app, subApps: app.subApps.filter((sub) => rotaPermitida(papel, sub.href)) });
  }
  return permitidos;
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
