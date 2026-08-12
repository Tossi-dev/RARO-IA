// Texto compartilhado pelas três fronteiras de erro (error.tsx,
// global-error.tsx, not-found.tsx) — um lugar só, para as telas nunca
// divergirem de tom entre si.
//
// POR QUE `linhaDigest` É UMA FUNÇÃO E NÃO SÓ UM TEXTO FIXO
// -----------------------------------------------------------
// O `digest` do Next só existe quando o framework consegue calcular um —
// acontece quase sempre em produção, mas nem sempre em todo caminho de erro.
// Mostrar "Código para o suporte: undefined" na tela é pior do que não
// mostrar nada: parece um bug novo em cima do erro que já aconteceu. Decidir
// SE a linha aparece é a única lógica de verdade destes arquivos — o resto é
// JSX estático — e é essa decisão que o teste ao lado cobre.

/** Mensagem da fronteira de erro DENTRO do app (error.tsx). */
export const MENSAGEM_ERRO_APP =
  "Esta tela travou. Não foi você — já ficou registrado aqui do nosso lado.";

/** Mensagem da fronteira de erro que derruba o layout inteiro (global-error.tsx). */
export const MENSAGEM_ERRO_GLOBAL =
  "O sistema travou ao carregar. Não foi você — já ficou registrado aqui do nosso lado.";

/** Mensagem da tela de rota inexistente (not-found.tsx). */
export const MENSAGEM_NAO_ENCONTRADO = "Essa página não existe, ou o link mudou.";

/**
 * Linha "código para o suporte" — só quando há um digest de verdade para
 * mostrar. `undefined`, string vazia ou só espaço contam como "não há".
 */
export function linhaDigest(digest: string | undefined): string | null {
  if (!digest || !digest.trim()) return null;
  return `Código para o suporte: ${digest.trim()}`;
}
