// A porta dos endpoints do agente local.
//
// POR QUE ESTA PORTA É DIFERENTE DE TODAS AS OUTRAS DO SISTEMA
// -----------------------------------------------------------
// O resto do app é protegido por `src/lib/acesso.ts`, que fala com um NAVEGADOR:
// cookie, sessão, tela de destravar. Aqui do outro lado não há navegador nem
// pessoa — é um programa rodando desatendido no Mac do dono, que precisa entrar
// com um segredo fixo e nada mais.
//
// O que este arquivo copia de `acesso.ts`, e é a parte que importa: a comparação
// em TEMPO CONSTANTE. Um `===` normal para no primeiro caractere diferente, e
// essa diferença de microssegundos é medível pela rede — dá para descobrir o
// segredo caractere por caractere, sem nunca acertá-lo por inteiro. Aqui todo
// caractere é sempre percorrido, inclusive quando o tamanho já está errado.
//
// E O QUE ESTE ARQUIVO NUNCA FAZ: escrever o segredo — nem o esperado, nem o
// enviado, nem um pedaço, nem o tamanho — em log, em mensagem de erro ou em
// corpo de resposta. Endpoint que explica POR QUE o segredo não bateu entrega
// informação para quem está adivinhando.

/** O header que o agente local manda. Um nome só, num lugar só. */
export const HEADER_AGENTE = "x-raro-agente";

/**
 * Segredo curto é o mesmo que segredo nenhum: doze caracteres é o piso abaixo
 * do qual o sistema trata a integração como NÃO configurada — e aí ela recusa
 * tudo, em vez de ficar aberta com uma senha que cai em segundos.
 */
export const TAMANHO_MINIMO_SEGREDO = 12;

/** Lê o ambiente de verdade; o resto do módulo continua puro e testável. */
export function segredoConfigurado(): string | undefined {
  return process.env.RARO_AGENTE_SEGREDO;
}

export function integracaoAtivada(esperado: string | undefined): boolean {
  return typeof esperado === "string" && esperado.trim().length >= TAMANHO_MINIMO_SEGREDO;
}

/**
 * Comparação de tempo constante — igual à de `acesso.ts`, e de propósito: são
 * duas portas diferentes com a mesma exigência, e o dia em que uma delas
 * "otimizar" o laço é o dia em que ela vira vazamento.
 */
function igualEmTempoConstante(a: string, b: string): boolean {
  // A diferença de tamanho entra no acumulador em vez de sair mais cedo, então
  // segredo de tamanho errado também é recusado sem revelar isso pelo relógio.
  let diferenca = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    diferenca |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diferenca === 0;
}

/** O header apresentado corresponde ao segredo configurado? */
export function segredoConfere(enviado: string | null | undefined, esperado: string | undefined): boolean {
  if (!integracaoAtivada(esperado)) return false; // sem segredo, nada passa
  if (typeof enviado !== "string" || enviado === "") return false;
  return igualEmTempoConstante(enviado, esperado as string);
}
