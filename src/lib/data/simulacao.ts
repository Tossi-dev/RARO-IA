// Modo simulação — dados fictícios LIGADOS À MÃO, por navegador.
//
// Por que isso existe: o painel do cliente começa vazio de verdade (a planilha
// dele ainda está zerada), e tela vazia não explica para que serve a tela.
// A simulação preenche o painel com um negócio fictício só para mostrar como
// ele vai se comportar quando os dados reais entrarem.
//
// Por que isso NÃO é o antigo "modo demo padrão" (que causou o pior estrago
// deste projeto — o dono leu faturamento inventado e acreditou):
//   1. Desligado por padrão. Nenhuma variável de ambiente liga isso.
//   2. Opt-in por clique, guardado em COOKIE — vale só naquele navegador,
//      nunca para quem abrir o link do outro lado.
//   3. Faixa fixa no topo, em todas as telas, dizendo que o número é fictício.
//   4. Sai em um clique.
//   5. Sessão curta: o cookie morre em 12h, então ninguém "esquece ligado".
//
// Módulo server-only (usa next/headers). Nenhum componente client pode
// importar daqui — importaria next/headers para dentro do bundle do navegador.

import { cookies } from "next/headers";

export const COOKIE_SIMULACAO = "raro_simulacao";

/** 12 horas: tempo de uma demonstração, não de um regime permanente. */
export const SIMULACAO_MAX_AGE = 60 * 60 * 12;

/**
 * O cookie está ligado?
 *
 * O `catch` aqui é cirúrgico de propósito. Em renderização estática, `cookies()`
 * lança um DynamicServerError que o próprio Next captura para desistir do cache
 * e renderizar dinamicamente. Se engolíssemos esse erro, o Next cacharia a
 * página com a simulação DESLIGADA e o botão pareceria não funcionar. Por isso
 * o erro de bailout é relançado; só o resto (fora de requisição, como no
 * vitest) vira `false`.
 */
export function simulacaoLigada(): boolean {
  try {
    return cookies().get(COOKIE_SIMULACAO)?.value === "1";
  } catch (erro) {
    const digest = (erro as { digest?: unknown } | null)?.digest;
    if (typeof digest === "string" && digest.startsWith("DYNAMIC_SERVER_USAGE")) throw erro;
    return false;
  }
}
