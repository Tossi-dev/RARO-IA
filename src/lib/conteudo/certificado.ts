// O código de verificação de um certificado.
//
// Módulo PURO, e aqui isso tem uma consequência incomum: a fonte de
// aleatoriedade entra por PARÂMETRO. Um módulo que sorteia sozinho não pode
// ser testado — não há como afirmar a saída de algo que muda a cada execução,
// e o teste degeneraria em "tem 12 caracteres", que passa até com o código
// errado. Quem chama decide de onde vem o acaso; aqui só se decide o formato.
//
// POR QUE O CÓDIGO NÃO SAI DO `mentorado_id`
// -------------------------------------------
// Derivar o código de quem é a pessoa (hash do id, do e-mail, da data) parece
// elegante e é o mesmo buraco de um link de proposta sequencial: quem tem o
// próprio código descobre a regra e chega ao dos outros. O código é sorteado,
// e a unicidade quem garante é o banco (`codigo text not null unique`, na
// migração 0020) — não uma promessa deste arquivo.
//
// POR QUE ESTE ALFABETO
// ---------------------
// Este código vai ser LIDO EM VOZ ALTA no telefone e DIGITADO por alguém
// olhando para um PDF. `0` e `O`, `1` e `I` e `l` são a diferença entre "seu
// certificado é válido" e "não encontramos esse código" — e quem digitou não
// tem como saber qual dos dois caracteres era. Fora os cinco ambíguos, sobram
// 32 símbolos; em 12 posições, mais de 10^18 combinações.
//
// NORMALIZAÇÃO NÃO MORA AQUI, DE PROPÓSITO
// -----------------------------------------
// `codigoValido` é estrito: maiúscula, 12 caracteres, nada além do alfabeto.
// Quem construir uma página pública de verificação vai querer aceitar
// minúscula e hífen do que a pessoa digitou — e é lá que a normalização deve
// ficar, antes de chamar esta função. Assim `codigoValido` continua servindo
// como a checagem de FORMA, a mesma que vale para conferir o que está gravado
// no banco.

/**
 * 32 símbolos: dígitos de 2 a 9 e as letras maiúsculas menos `I` e `O`.
 *
 * `L` fica: ele só se confunde com `1`, e `1` não existe neste alfabeto.
 */
export const ALFABETO_CODIGO = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export const TAMANHO_CODIGO = 12;

/**
 * Um índice válido do alfabeto a partir de um número em [0, 1).
 *
 * Uma fonte torta (NaN, negativa, maior que 1, infinita) não pode produzir um
 * código torto: o índice sairia da faixa e o código nasceria com `undefined`
 * no meio — e isso seria GRAVADO num certificado. Melhor um código válido
 * vindo de uma fonte ruim que um código inválido impresso num papel.
 */
function indiceDoAlfabeto(valor: number): number {
  const finito = Number.isFinite(valor) ? valor : 0;
  const dentro = Math.min(Math.max(finito, 0), 0.9999999999);
  return Math.floor(dentro * ALFABETO_CODIGO.length);
}

/**
 * Um código de 12 caracteres.
 *
 * `aleatorio` é chamado uma vez por caractere e deve devolver um número em
 * [0, 1) — a mesma forma de `Math.random`, que é o que a borda vai passar.
 */
export function gerarCodigo(aleatorio: () => number): string {
  let codigo = "";
  for (let i = 0; i < TAMANHO_CODIGO; i += 1) {
    codigo += ALFABETO_CODIGO[indiceDoAlfabeto(aleatorio())];
  }
  return codigo;
}

const REGEX_CODIGO = new RegExp(`^[${ALFABETO_CODIGO}]{${TAMANHO_CODIGO}}$`);

/**
 * A FORMA está certa? Não diz nada sobre o código existir no banco — para
 * isso é preciso consultar, e esta função é pura.
 *
 * Aceita `unknown` na prática (o valor pode vir de uma query string, de um
 * formulário, de um JSON): qualquer coisa que não seja string cai no `false`,
 * sem lançar.
 */
export function codigoValido(texto: string): boolean {
  if (typeof texto !== "string") return false;
  return REGEX_CODIGO.test(texto);
}
