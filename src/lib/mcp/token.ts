// A porta do conector do Claude.
//
// POR QUE MAIS UMA PORTA, SE JÁ EXISTEM DUAS NESTE SISTEMA
// --------------------------------------------------------
// `src/lib/acesso.ts` fala com um NAVEGADOR (cookie, sessão, tela de
// destravar). `src/lib/atendimento/segredo.ts` fala com o AGENTE LOCAL do
// WhatsApp (header fixo, programa desatendido no Mac do dono). Esta terceira
// fala com os SERVIDORES DA ANTHROPIC: quem bate aqui não é o navegador do
// dono nem um programa dele, é a infraestrutura do Claude fazendo a chamada em
// nome dele. Três interlocutores diferentes, três chaves diferentes — misturar
// as chaves faria com que vazar uma vazasse as outras.
//
// O que este arquivo COPIA de `segredo.ts`, e é a parte que importa: comparação
// em TEMPO CONSTANTE. Um `===` normal para no primeiro caractere diferente, e
// essa diferença de microssegundos é medível pela rede — dá para descobrir o
// token caractere por caractere sem nunca acertá-lo por inteiro. Aqui todo
// caractere é sempre percorrido, inclusive quando o tamanho já está errado.
//
// E O QUE ELE NUNCA FAZ: escrever o token — nem o esperado, nem o recebido,
// nem um pedaço, nem o tamanho — em log, mensagem de erro ou corpo de
// resposta. Nem mesmo o nome do header que faltou. Endpoint que explica POR QUE
// a credencial não bateu entrega informação para quem está adivinhando.

/** O header padrão do HTTP para credencial. Um nome só, num lugar só. */
export const HEADER_AUTORIZACAO = "authorization";

/**
 * Token curto é o mesmo que token nenhum: doze caracteres é o piso abaixo do
 * qual o conector é tratado como NÃO ativado — e aí ele recusa tudo, em vez de
 * ficar de pé com uma senha que cai em segundos. Mesmo piso de
 * `atendimento/segredo.ts`, de propósito: duas portas com a mesma exigência.
 */
export const TAMANHO_MINIMO_TOKEN = 12;

/** Lê o ambiente de verdade; o resto do módulo continua puro e testável. */
export function tokenConfigurado(): string | undefined {
  return process.env.RARO_MCP_TOKEN;
}

export function conectorAtivado(esperado: string | undefined): boolean {
  return typeof esperado === "string" && esperado.trim().length >= TAMANHO_MINIMO_TOKEN;
}

function igualEmTempoConstante(a: string, b: string): boolean {
  // A diferença de tamanho entra no acumulador em vez de sair mais cedo, então
  // token de tamanho errado também é recusado sem revelar isso pelo relógio.
  let diferenca = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    diferenca |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diferenca === 0;
}

/**
 * Extrai o token de um header `Authorization`.
 *
 * O esquema `Bearer` é comparado sem diferenciar maiúsculas porque a RFC 7235
 * define o esquema como case-insensitive — e o campo de cabeçalho do conector
 * é preenchido à mão pelo dono, onde "bearer" minúsculo é erro provável e
 * inofensivo. O TOKEN, esse sim, é comparado byte a byte.
 */
export function tokenDoHeader(bruto: string | null | undefined): string {
  if (typeof bruto !== "string") return "";
  const partes = bruto.trim().split(/\s+/);
  if (partes.length !== 2) return "";
  if (partes[0].toLowerCase() !== "bearer") return "";
  return partes[1];
}

/** O header apresentado corresponde ao token configurado? */
export function tokenConfere(
  headerBruto: string | null | undefined,
  esperado: string | undefined
): boolean {
  if (!conectorAtivado(esperado)) return false; // sem token configurado, nada passa
  const enviado = tokenDoHeader(headerBruto);
  if (enviado === "") return false;
  return igualEmTempoConstante(enviado, esperado as string);
}
