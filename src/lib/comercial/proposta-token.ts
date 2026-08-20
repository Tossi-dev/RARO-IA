// O token do link de proposta — módulo PURO. Não sorteia, não olha o relógio,
// não toca no banco.
//
// ============================================================
// O TOKEN É A FECHADURA INTEIRA
// ============================================================
//
// A proposta é lida SEM login (migração 0025): quem tem o link, lê. Isso quer
// dizer que o token não é um detalhe de implementação — ele é a única coisa
// entre um estranho e o valor negociado com um cliente. Link adivinhável é o
// pipeline inteiro na mão de quem chutar.
//
// Daí as três decisões deste arquivo:
//
//   1. O TOKEN NÃO DERIVA DE NADA. Nem de id, nem de e-mail, nem de nome, nem
//      de data. A função recebe BYTES e mais nada — aridade 1, travada por
//      teste. Token derivado de dado do negócio é token que alguém reconstrói
//      com o que já sabe do cliente;
//
//   2. O ACASO ENTRA POR PARÂMETRO. Este módulo não chama gerador aleatório
//      nenhum, e não usa `Math.random` (que não serve para segredo) nem
//      `Date.now` (que é público e sequencial). Quem chama traz os bytes de
//      uma fonte de verdade do runtime. O preço disso é ótimo: a função vira
//      DETERMINÍSTICA e, portanto, testável de verdade — mesma entrada, mesma
//      saída, sem `mock` de sorteio em teste nenhum;
//
//   3. ENTRADA FRACA LANÇA. Menos de 16 bytes, ou 16 bytes zerados, não geram
//      "um token um pouco pior": lançam. Gerar assim mesmo seria o pior dos
//      mundos — um link adivinhável com aparência de link seguro. O caso dos
//      zerados não é teórico: é exatamente o retrato de um buffer que ninguém
//      preencheu.
//
// ============================================================
// POR QUE BASE62, E NÃO BASE64
// ============================================================
//
// Base64 traz `+`, `/` e `=`. Os três viajam mal: dentro de uma URL, `+` vira
// espaço em alguns parsers e `/` vira separador de caminho — e o token chega
// do outro lado diferente do que saiu, sem erro nenhum, só um link que "não
// funciona". Base62 é o subconjunto que atravessa URL, WhatsApp, e-mail e
// captura de tela sem ninguém precisar escapar nada.
//
// 16 bytes são 128 bits; em base62 isso dá 22 caracteres. É o piso, e é o
// mesmo número que o `check` da coluna `proposta.token` (0025) exige. As duas
// réguas são conferidas uma contra a outra por teste: se divergirem, ou o
// banco recusa um token que a tela aceitou, ou o contrário.

/** Os 62 dígitos, em ordem de valor. `0` é o dígito zero — ver o `padStart`. */
const ALFABETO = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

const BASE = 62n;

/** 128 bits. Abaixo disso a função lança, em vez de gerar um segredo fraco. */
export const BYTES_MINIMOS = 16;

/**
 * Teto de entrada. Não é frescura: 64 bytes dão ~87 caracteres, e a coluna
 * aceita até 128. Recusar aqui evita o único jeito de este módulo produzir
 * um token que o banco rejeitaria.
 */
export const BYTES_MAXIMOS = 64;

/** 22 caracteres — os mesmos 128 bits do piso, escritos em base62. */
export const CARACTERES_MINIMOS = 22;

/**
 * A forma do token, e a MESMA régua que está no `check` de `proposta.token`
 * (migração 0025). Há teste que lê a migração e compara as duas.
 *
 * Sem a flag `m`, de propósito: com ela, `$` casaria antes de uma quebra de
 * linha, e `"<token>\nqualquer coisa"` passaria por token válido.
 */
export const FORMATO_TOKEN = /^[0-9A-Za-z]{22,128}$/;

const ERRO_TIPO = "Os bytes do token precisam vir num Uint8Array.";
const ERRO_CURTO = `O token precisa de pelo menos ${BYTES_MINIMOS} bytes de entropia.`;
const ERRO_LONGO = `O token aceita no máximo ${BYTES_MAXIMOS} bytes de entropia.`;
const ERRO_ZERADO = "Os bytes do token estão todos zerados — isso não é acaso, é buffer vazio.";

/**
 * Monta o token a partir dos bytes recebidos.
 *
 * Determinística por contrato: os mesmos bytes devolvem sempre o mesmo texto.
 * Para um COMPRIMENTO FIXO de entrada — o caso real, sempre 16 ou 32 bytes —
 * bytes diferentes dão tokens diferentes, porque a conversão é só a mesma
 * quantidade escrita noutra base.
 */
export function gerarToken(bytesAleatorios: Uint8Array): string {
  if (!(bytesAleatorios instanceof Uint8Array)) throw new Error(ERRO_TIPO);
  if (bytesAleatorios.length < BYTES_MINIMOS) throw new Error(ERRO_CURTO);
  if (bytesAleatorios.length > BYTES_MAXIMOS) throw new Error(ERRO_LONGO);
  if (bytesAleatorios.every((b) => b === 0)) throw new Error(ERRO_ZERADO);

  let numero = 0n;
  for (const b of bytesAleatorios) numero = (numero << 8n) | BigInt(b);

  let saida = "";
  while (numero > 0n) {
    saida = ALFABETO[Number(numero % BASE)] + saida;
    numero /= BASE;
  }

  // Bytes que começam com zero produzem um número menor e, portanto, menos
  // dígitos. O preenchimento à esquerda com o dígito zero mantém o token no
  // piso combinado sem mudar o valor que ele representa.
  return saida.padStart(CARACTERES_MINIMOS, ALFABETO[0]);
}

/**
 * A forma do token, conferida ANTES de qualquer ida ao banco.
 *
 * Não é a segurança — a segurança é o `check` da coluna e a função
 * `proposta_publica`, que compara por igualdade. Isto aqui é a porta: evita
 * transformar lixo de URL em consulta, e evita um erro cru de constraint na
 * cara de quem só clicou num link torto.
 */
export function tokenValido(texto: unknown): boolean {
  return typeof texto === "string" && FORMATO_TOKEN.test(texto);
}
