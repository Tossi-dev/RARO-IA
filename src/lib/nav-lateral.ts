// Catálogo da navegação lateral (a gaveta do celular, src/components/
// sidebar.tsx `<SidebarNav />`) — módulo NEUTRO, mesmo motivo de
// src/lib/apps.ts: a gaveta é "use client" (usa `usePathname`), mas o papel
// de quem está logado só pode ser lido no servidor (`papelAtual()`, Server
// Component). Só o NOME do ícone (string) atravessa essa fronteira; quem
// troca nome por componente do lucide-react é src/components/sidebar.tsx.
//
// B2.7 — POR QUE A FILTRAGEM ACONTECE AQUI E NÃO DENTRO DE `<SidebarNav />`:
// antes desta tarefa, `GRUPOS` era uma constante hardcoded DENTRO do
// componente cliente. Filtrar ali — mesmo recebendo o papel como prop e
// aplicando `.filter()` no render — seria decoração, não proteção: o
// JavaScript enviado ao navegador já teria a lista INTEIRA de rotas escrita
// no bundle, visível em "view-source" ou nas devtools, independente do que
// a tela desenha. A informação que a regra 1 de /sem-acesso (não vazar o
// mapa do que existe do outro lado) protege já teria viajado. Por isso quem
// filtra é o SERVIDOR (`gruposNavPorPapel`, chamada em
// src/app/(app)/layout.tsx com o papel já resolvido): só os grupos e itens
// que sobram depois do filtro são serializados para o componente cliente —
// o que nunca foi enviado não pode ser lido, nem pelas devtools.

import { rotaPermitida, type Papel } from "@/lib/papeis";

/** Nomes de ícone do lucide-react usados na navegação lateral — lista
 *  FECHADA e própria deste menu (não a mesma de src/lib/apps.ts: este menu
 *  inclui "Início" e "Tour", que não têm tile na grade da tela inicial, e
 *  não inclui os ícones que só aparecem dentro de uma pasta, como os
 *  sub-apps de Financeiro). Só o NOME atravessa a fronteira para
 *  sidebar.tsx, que troca por componente de fato — mesmo padrão de
 *  src/lib/apps.ts. */
export type NomeIconeLateral =
  | "LayoutGrid"
  | "LayoutDashboard"
  | "Compass"
  | "CalendarDays"
  | "Wallet"
  | "Users"
  | "Clapperboard"
  | "ListChecks"
  | "Upload"
  | "Plug"
  | "UserCircle"
  | "Trophy"
  | "Route"
  | "Handshake"
  | "Megaphone";

export interface ItemNavLateral {
  href: string;
  rotulo: string;
  icone: NomeIconeLateral;
}

export interface GrupoNavLateral {
  titulo: string;
  itens: ItemNavLateral[];
}

/**
 * O menu INTEIRO, sem filtro nenhum — a mesma lista que existia hardcoded
 * dentro de sidebar.tsx antes da B2.7. Não é exportado: quem precisa da
 * navegação sempre passa por `gruposNavPorPapel`, nunca lê isto direto (é
 * exatamente o vazamento que este arquivo existe para fechar).
 */
const GRUPOS_COMPLETOS: GrupoNavLateral[] = [
  {
    titulo: "Visão geral",
    itens: [
      { href: "/", rotulo: "Início", icone: "LayoutGrid" },
      // B3.2 — logo depois de "Início": para mentorado/afiliado/aluno é a
      // primeira rota do próprio papel (`primeiraRotaDe`, em papeis.ts), a
      // casa deles; para dono/gestor é o preview do que o cliente vê.
      { href: "/portal", rotulo: "Portal", icone: "UserCircle" },
      { href: "/painel", rotulo: "Dashboard", icone: "LayoutDashboard" },
      { href: "/tour", rotulo: "Tour pelos resultados", icone: "Compass" },
      { href: "/agenda", rotulo: "Agenda", icone: "CalendarDays" },
    ],
  },
  {
    titulo: "Gestão",
    itens: [
      // Tarefa 29 — Mentoria e Trilhas abrem o grupo, nesta ordem (quem são
      // os mentorados, depois o que eles consomem), antes de Financeiro e
      // Central de Clientes.
      //
      // MENTORIA ESTAVA FALTANDO NA GAVETA. Não é parte do pedido da tarefa
      // 29, é uma falha que ela revelou: `/mentoria` é o primeiro tile da
      // tela inicial desde a B2.3 ("o NÚCLEO do produto MentorOS") e não
      // tinha entrada nenhuma aqui — quem abrisse a gaveta no celular não
      // tinha como chegar na carteira de mentorados. Entrou junto porque
      // acrescentar Trilhas e deixar a Mentoria de fora produziria um menu
      // que fala do conteúdo da mentoria sem falar da mentoria.
      //
      // `Trophy` é o mesmo ícone que o tile de Mentoria usa em apps.ts, de
      // propósito: é a MESMA porta, vista de dois lugares diferentes.
      { href: "/mentoria", rotulo: "Mentoria", icone: "Trophy" },
      { href: "/trilhas", rotulo: "Trilhas", icone: "Route" },
      // Tarefa 36 — avisos e mensagem direta. Fica em Gestão junto com
      // Mentoria e Trilhas: é o terceiro lado da mesma coisa (quem são os
      // mentorados, o que eles consomem, o que se fala com eles).
      //
      // NÃO ganhou tile na tela inicial, e isso foi decisão: a grade tem dez
      // ícones e o comentário de paleta de `apps.ts` já registrou que o
      // décimo primeiro pede repensar a GRADE (agrupar em pastas, como
      // Financeiro fez), não inventar a décima primeira cor. A gaveta não tem
      // esse limite — ela é lista, não mosaico.
      { href: "/feed", rotulo: "Avisos", icone: "Megaphone" },
      // Tarefa 40 — o roteiro de entrada. `ListChecks` é o mesmo ícone de
      // "Começar" (grupo Sistema): os dois são checklist de configuração, um
      // do negócio e outro de cada cliente novo, e nunca aparecem lado a lado.
      { href: "/onboarding", rotulo: "Onboarding", icone: "ListChecks" },
      { href: "/financeiro", rotulo: "Financeiro", icone: "Wallet" },
      { href: "/crm", rotulo: "Central de Clientes", icone: "Users" },
      // Tarefa 47 — logo depois da Central de Clientes, pelo mesmo motivo que
      // fez `/comercial` virar sub-app dela em apps.ts: são duas perguntas
      // sobre as mesmas pessoas (quem são; o que está sendo negociado).
      { href: "/comercial", rotulo: "Negociações", icone: "Handshake" },
    ],
  },
  {
    titulo: "Marketing",
    itens: [{ href: "/conteudo", rotulo: "Conteúdo & Redes", icone: "Clapperboard" }],
  },
  {
    titulo: "Sistema",
    itens: [
      { href: "/comecar", rotulo: "Começar", icone: "ListChecks" },
      { href: "/extrato", rotulo: "Importar extrato", icone: "Upload" },
      { href: "/integracoes", rotulo: "Integrações", icone: "Plug" },
    ],
  },
];

/**
 * O menu que o papel pode de fato ver — mesma regra de `appsDoPapel`
 * (src/lib/apps.ts): delega a decisão a `rotaPermitida`, nunca reimplementa
 * casamento de rota. Um grupo cujos itens ficaram todos de fora some
 * inteiro (não faz sentido desenhar o título "Gestão" sobre uma lista
 * vazia).
 */
export function gruposNavPorPapel(papel: Papel): GrupoNavLateral[] {
  const grupos: GrupoNavLateral[] = [];
  for (const grupo of GRUPOS_COMPLETOS) {
    const itens = grupo.itens.filter((item) => rotaPermitida(papel, item.href));
    if (itens.length > 0) grupos.push({ titulo: grupo.titulo, itens });
  }
  return grupos;
}
