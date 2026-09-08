import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export const VARIAVEL_CHAVE_COFRE_GOOGLE = "GOOGLE_TOKEN_ENCRYPTION_KEY";
export const VERSAO_CHAVE_COFRE_GOOGLE = 1;

const TAMANHO_CHAVE = 32;
const TAMANHO_IV = 12;
const TAMANHO_TAG = 16;

export type RefreshTokenGoogleCifrado = {
  /** AES-256-GCM em Base64; nunca é o refresh token em texto puro. */
  cifra: string;
  /** IV aleatório, em Base64. Não é segredo e é único por cifra. */
  iv: string;
  /** Tag de autenticação GCM em Base64. */
  tag: string;
  versaoChave: number;
};

type Ambiente = Record<string, string | undefined>;

function bytesBase64Estritos(valor: string, tamanho: number): Buffer | null {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(valor) || valor.length % 4 !== 0) return null;
  const bytes = Buffer.from(valor, "base64");
  if (bytes.length !== tamanho || bytes.toString("base64") !== valor) return null;
  return bytes;
}

/**
 * Lê a chave do cofre exclusivamente no ambiente do servidor.
 *
 * Não gera chave em tempo de execução: trocar ou perder a chave precisa ser
 * uma operação consciente de rotação, não um erro silencioso que torna todos
 * os vínculos antigos indecifráveis.
 */
export function chaveDoCofreGoogle(ambiente: Ambiente = process.env): Buffer | null {
  const valor = ambiente[VARIAVEL_CHAVE_COFRE_GOOGLE];
  if (!valor) return null;
  return bytesBase64Estritos(valor, TAMANHO_CHAVE);
}

function tokenValido(token: string): boolean {
  return typeof token === "string" && token.trim().length > 0 && token.length <= 4096;
}

/** Cifra um refresh token para persistência exclusiva do servidor. */
export function cifrarRefreshTokenGoogle(token: string, chave: Buffer): RefreshTokenGoogleCifrado {
  if (!tokenValido(token)) throw new Error("Refresh token do Google inválido para armazenamento seguro.");
  if (chave.length !== TAMANHO_CHAVE) throw new Error("Chave do cofre Google inválida.");

  const iv = randomBytes(TAMANHO_IV);
  const cifra = createCipheriv("aes-256-gcm", chave, iv);
  const cifrado = Buffer.concat([cifra.update(token, "utf8"), cifra.final()]);

  return {
    cifra: cifrado.toString("base64"),
    iv: iv.toString("base64"),
    tag: cifra.getAuthTag().toString("base64"),
    versaoChave: VERSAO_CHAVE_COFRE_GOOGLE,
  };
}

/**
 * Decifra somente um registro completo e íntegro. Todo dado inválido vira
 * `null`: o chamador deve pedir nova conexão, nunca tentar usar lixo parcial.
 */
export function decifrarRefreshTokenGoogle(
  registro: RefreshTokenGoogleCifrado,
  chave: Buffer,
): string | null {
  if (chave.length !== TAMANHO_CHAVE || registro.versaoChave !== VERSAO_CHAVE_COFRE_GOOGLE) return null;

  const iv = bytesBase64Estritos(registro.iv, TAMANHO_IV);
  const tag = bytesBase64Estritos(registro.tag, TAMANHO_TAG);
  if (!iv || !tag || typeof registro.cifra !== "string" || registro.cifra.length === 0) return null;

  try {
    const cifrado = Buffer.from(registro.cifra, "base64");
    if (cifrado.length === 0 || cifrado.toString("base64") !== registro.cifra) return null;
    const decifra = createDecipheriv("aes-256-gcm", chave, iv);
    decifra.setAuthTag(tag);
    const token = Buffer.concat([decifra.update(cifrado), decifra.final()]).toString("utf8");
    return tokenValido(token) ? token : null;
  } catch {
    return null;
  }
}
