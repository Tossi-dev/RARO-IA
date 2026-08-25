const ALFABETO = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const FORMATO = /^[0-9A-Za-z]{8,64}$/;
const BYTES_MAXIMOS = 47;
const DOMINIOS_DO_NEGOCIO = new Set(["raro-ia.vercel.app"]);

/** Converte somente bytes fornecidos pelo chamador em código URL-seguro e determinístico. */
export function gerarCodigo(bytes: Uint8Array): string {
  if (!(bytes instanceof Uint8Array) || bytes.length < 8 || bytes.length > BYTES_MAXIMOS || bytes.every((byte) => byte === 0)) throw new Error("Código precisa de oito a 47 bytes não zerados.");
  let numero = 0n;
  for (const byte of bytes) numero = (numero << 8n) | BigInt(byte);
  let codigo = "";
  while (numero > 0n) { codigo = ALFABETO[Number(numero % 62n)] + codigo; numero /= 62n; }
  return codigo.padStart(8, "0");
}

/** Porta de rota: aceita apenas o código puro, nunca um pedaço de caminho. */
export function codigoValido(codigo: unknown): codigo is string {
  return typeof codigo === "string" && FORMATO.test(codigo);
}

/** A mesma lista protege tanto a criação quanto o redirecionamento do link. */
export function destinoDoNegocioValido(destino: unknown, dominiosExtras = process.env.MARKETING_DOMINIOS_PERMITIDOS ?? ""): destino is string {
  if (typeof destino !== "string") return false;
  try {
    const url = new URL(destino);
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    const extras = dominiosExtras
      .split(",")
      .map((dominio) => dominio.trim().toLocaleLowerCase("pt-BR"))
      .filter(Boolean);
    return DOMINIOS_DO_NEGOCIO.has(url.hostname) || extras.includes(url.hostname);
  } catch {
    return false;
  }
}
