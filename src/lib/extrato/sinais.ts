// Normalização dos sinais de menos e de mais que aparecem em extrato real.
//
// POR QUE ESTE ARQUIVO EXISTE — o defeito que ele conserta
// -------------------------------------------------------
// O extrato do Nubank exporta o valor assim:
//
//     "−R$ 10,00"
//
// O primeiro caractere PARECE um hífen, mas não é: é U+2212 MINUS SIGN, o
// sinal de menos tipográfico. O hífen do teclado é U+002D. São dois
// caracteres diferentes, e um `s.startsWith("-")` não enxerga o primeiro.
//
// O estrago era silencioso e grave: os três leitores limpavam a célula com um
// `replace(/[^\d,.\-+]/g, "")`, que APAGA o U+2212 junto com o "R$" e o
// espaço. O que sobrava era "10,00" — positivo. Um extrato inteiro de Pix
// enviado e conta paga entrava no sistema como dinheiro RECEBIDO. O caixa
// ficava errado para cima, e ninguém desconfia de um caixa que só cresce.
//
// A limpeza tinha que acontecer DEPOIS de traduzir os sinais para ASCII, e é
// só isso que este módulo faz. Ele mora num arquivo próprio porque os três
// leitores (OFX, CSV, texto colado) precisam do mesmo tratamento e nenhum dos
// três pode importar do outro sem criar dependência circular com extrato.ts.

/**
 * Todos os "menos" que já vimos em extrato brasileiro, além do hífen normal:
 *
 *   U+2212 MINUS SIGN        — Nubank, e qualquer exportador que formate
 *                              número com tipografia de verdade
 *   U+2013 EN DASH           — planilha que "corrigiu" o hífen sozinha
 *   U+2014 EM DASH           — idem, versão longa
 *   U+2010 HYPHEN            — hífen tipográfico
 *   U+FE63 SMALL HYPHEN-MINUS
 *   U+FF0D FULLWIDTH HYPHEN-MINUS
 */
const MENOS = /[−–—‐﹣－]/g;

/** E os "mais" equivalentes, para a simetria não faltar. */
const MAIS = /[＋﹢]/g;

/**
 * Troca qualquer variante tipográfica de sinal pelo caractere ASCII
 * correspondente. Chame ANTES de qualquer limpeza que remova "caractere que
 * não é dígito" — depois já é tarde, o sinal virou pó junto com o "R$".
 */
export function normalizarSinais(texto: string): string {
  return texto.replace(MENOS, "-").replace(MAIS, "+");
}
