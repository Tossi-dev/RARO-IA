// Parte PURA e testável da tela /sem-acesso — sem "use client", sem Next,
// sem Supabase: só texto e a conta de "para onde volta o botão". A regra de
// não vazar papel/rota (comentário completo em page.tsx) é testada aqui em
// cima destas duas exportações, em sem-acesso.test.ts.

import { primeiraRotaDe, type Papel } from "@/lib/papeis";

/**
 * Para onde o botão principal manda quem foi barrado.
 *
 * `papel === null` cobre dois casos reais, não só "sem sessão": modo sem
 * Supabase configurado (não há papel algum a resolver) e sessão que caiu no
 * meio da leitura (falha de rede lendo `profiles`, por exemplo — a página
 * trata como se não houvesse sessão, nunca lança). Em ambos, `/` é o único
 * destino que não pressupõe nada sobre quem está de fato logado.
 *
 * Com papel conhecido, o destino é sempre `primeiraRotaDe(papel)` — a MESMA
 * rota que o portão (`decidirAcessoSupabase`) usa como destino seguro depois
 * do login. Reusar essa função (em vez de escrever um mapa próprio aqui)
 * é o que garante o teste "o próprio papel pode abrir o destino devolvido":
 * duas fontes de verdade para a mesma pergunta poderiam divergir e criar um
 * botão "voltar" que joga a pessoa de volta para /sem-acesso.
 */
export function destinoDeVolta(papel: Papel | null): { href: string; rotulo: string } {
  const href = papel === null ? "/" : primeiraRotaDe(papel);
  return { href, rotulo: "Voltar para o início" };
}

/**
 * Os três textos fixos da tela. Nenhum deles pode citar um nome de papel, um
 * código HTTP ou o nome de uma rota protegida — é a regra 1 do comentário no
 * topo de page.tsx, e é o que sem-acesso.test.ts confere termo a termo.
 */
export const TEXTO_SEM_ACESSO = {
  titulo: "Esta área não é sua",
  explicacao:
    "O acesso aqui é definido por pessoa: cada uma vê exatamente o que precisa para o seu trabalho, nem mais nem menos. Isto não é um erro do sistema nem uma falha de carregamento — é assim que esta parte foi desenhada para funcionar.",
  rodape: "Se você acha que deveria ver esta tela, fale com quem administra o sistema.",
} as const;
