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

import { ROTAS_FIN } from "@/components/fin-rotas";
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
  | "Plug"
  | "UserCircle"
  | "Route"
  | "Handshake";

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
// B3.2 — violeta, fora da família azul/verde/dourado de cima de propósito:
// dono/gestor veem Mentoria (Trophy, azul-marinho escuro) e Portal (Trophy
// seria o MESMO ícone) lado a lado na mesma grade — precisa de cor E ícone
// distintos dos dois, não só cor.
const COR_PORTAL = "#7c3aed"; // violeta-600 — identidade própria, sem repetir tom de nenhum app acima
// Tarefa 29 — Trilhas. A escolha aqui é por ELIMINAÇÃO, e vale registrar o
// caminho: um quinto azul ficaria indistinguível dos quatro de cima (os três
// tons de --primaria + o azul-céu de Conteúdo); a família do vermelho está
// comprometida com --negativo (#f26d6d) e leria como erro num tile que não é
// erro; o dourado é acento de marca e já tem dono único (Central de
// Clientes). Sobrou o verde-azulado. Ele é vizinho do verde de Financeiro
// (#10b981) — a proximidade é real e não adianta fingir que não é —, mas os
// dois nunca se confundem no uso: o teal é visivelmente mais escuro e mais
// azul, os ícones são Wallet e Route (silhuetas sem nada em comum), e as
// duas telas ficam em pontas opostas da grade. É o último tom que esta
// paleta comporta: um décimo primeiro tile pede repensar a GRADE (pastas,
// como Financeiro fez com seus sub-apps), não inventar a décima primeira cor.
const COR_TRILHAS = "#0d9488"; // teal-600 — a esteira de conteúdo da mentoria

/**
 * Financeiro (src/components/fin-rotas.ts é o mapa oficial das telas do
 * módulo — usado aqui ao pé da letra, na mesma ordem, com a MESMA pergunta
 * de negócio de cada rota como frase do ícone).
 */
// "Capital de giro" e "Comissões" saíram deste catálogo na virada para
// mentoria (rota removida — ver docs/DESENHO-MENTOROS.md, seção 8).
const ICONE_FINANCEIRO: Record<string, NomeIcone> = {
  "/financeiro": "TrendingUp",
  "/financeiro/caixa": "ArrowLeftRight",
  "/financeiro/projecao": "LineChart",
  "/financeiro/dre": "FileText",
  "/financeiro/reembolsos": "Undo2",
  "/financeiro/cobrancas": "Wallet",
  "/financeiro/contratos": "FileText",
  "/financeiro/recorrencia": "TrendingUp",
};

const SUBAPPS_FINANCEIRO: SubApp[] = ROTAS_FIN.map((rota) => ({
  id: `financeiro-${rota.href.split("/").at(-1) || "resultado"}`,
  nome: rota.rotulo,
  href: rota.href,
  icone: ICONE_FINANCEIRO[rota.href],
  cor: COR_FINANCEIRO,
  frase: rota.pergunta,
}));

/**
 * Central de Clientes — as duas telas do lado comercial.
 *
 * TAREFA 47 — `/comercial` entrou como SUB-APP, e não como o décimo primeiro
 * tile da grade. O motivo está escrito no comentário de paleta acima: em 29,
 * o teal de Trilhas foi registrado como o último tom que esta paleta tolera
 * no primeiro nível, e um tile novo exigiria cor nova. Contrariar aquela
 * decisão três blocos depois, por conveniência, seria transformar um critério
 * em enfeite.
 *
 * E o lugar é o certo, não só o disponível: `/crm` é "quem são os clientes e
 * os leads" e `/comercial` é "o que está sendo negociado com eles". Duas
 * perguntas sobre as mesmas pessoas — o dourado do cliente vale para as duas.
 */
const SUBAPPS_CRM: SubApp[] = [
  {
    id: "crm-clientes",
    nome: "Clientes e leads",
    href: "/crm",
    icone: "Users",
    cor: COR_CRM,
    frase: "Quem são, em que estágio estão e o histórico de cada um.",
  },
  {
    id: "crm-negociacoes",
    nome: "Negociações",
    href: "/comercial",
    icone: "Handshake",
    cor: COR_CRM,
    frase: "O funil aberto: em que etapa está cada negócio, e quanto vale.",
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
    // Tarefa 29 — logo depois de Mentoria, e não no fim da grade: Mentoria
    // ("quem são os mentorados") e Trilhas ("o que eles têm para consumir")
    // são as duas metades do mesmo produto; Dashboard, Agenda e Financeiro
    // são a operação em volta. `Route` (o traçado com paradas) é o ícone
    // mais literal de "trilha" no lucide e não conflita com nenhum outro do
    // catálogo — a bateria de testes garante que nem cor nem ícone se
    // repetem no primeiro nível.
    //
    // Este tile NÃO aparece para mentorado/afiliado/aluno: `appsDoPapel`
    // pergunta a `rotaPermitida` (papeis.ts), que nega `/trilhas` para os
    // três — a tela DELES é `/portal/trilha`, dentro do Portal, e chega lá
    // pelo próprio Portal, não por um tile na grade de quem opera.
    id: "trilhas",
    nome: "Trilhas",
    href: "/trilhas",
    icone: "Route",
    cor: COR_TRILHAS,
    frase: "A esteira de aulas: o que abre, quando abre e quem já concluiu.",
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
    subApps: SUBAPPS_CRM,
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
  {
    // B3.2 — o Portal do Mentorado: a própria jornada do cliente (progresso,
    // sessões, tarefas, marcos, evolução). Último da grade porque, para
    // dono/gestor, é uma tela de PREVIEW do que o cliente vê, não uma
    // ferramenta de trabalho do dia a dia como as de cima; para
    // mentorado/afiliado/aluno é a ÚNICA tela deste catálogo que
    // `appsDoPapel` libera (`rotaPermitida`, via `/lib/papeis.ts`, nega os
    // outros seis hrefs para esses três papéis) — é a casa deles, mesmo
    // aparecendo por último aqui.
    id: "portal",
    nome: "Portal",
    href: "/portal",
    icone: "UserCircle",
    cor: COR_PORTAL,
    frase: "A jornada do cliente: progresso, sessões, tarefas e evolução.",
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
  {
    id: "pessoal",
    nome: "Finanças pessoais",
    href: "/pessoal",
    icone: "Wallet",
    cor: "#0f172a", // slate-900: dado exclusivo do dono, fora da operação diária
    frase: "Patrimônio e investimentos pessoais, sem misturar com a operação.",
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
