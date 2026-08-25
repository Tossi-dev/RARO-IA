import { createHmac } from "node:crypto";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

type Ambiente = Record<string, string | undefined>;

const PREFIXO_CAPTURA = "raro:captura:v1";

function valor(env: Ambiente, nome: string): string | null {
  const encontrado = env[nome]?.trim();
  return encontrado || null;
}

/** A identificação enviada ao Redis é pseudônima; o IP cru fica só nesta requisição. */
export function identificadorCaptura(ip: string, pepper: string): string {
  return createHmac("sha256", pepper).update(ip.trim() || "desconhecido").digest("hex");
}

export function redisConfigurado(env: Ambiente = process.env): boolean {
  return Boolean(
    valor(env, "UPSTASH_REDIS_REST_URL") &&
      valor(env, "UPSTASH_REDIS_REST_TOKEN") &&
      valor(env, "RARO_RATE_LIMIT_PEPPER")
  );
}

/**
 * Um pedido por minuto por origem. O estado está no Redis, não no processo:
 * duas instâncias serverless consultam a mesma janela.
 *
 * `null` representa indisponibilidade/configuração ausente e deve fechar a
 * rota pública; `false` é excesso de frequência e vira 429.
 */
export async function limitarCaptura(ip: string, env: Ambiente = process.env): Promise<boolean | null> {
  const url = valor(env, "UPSTASH_REDIS_REST_URL");
  const token = valor(env, "UPSTASH_REDIS_REST_TOKEN");
  const pepper = valor(env, "RARO_RATE_LIMIT_PEPPER");
  if (!url || !token || !pepper) return null;

  try {
    const redis = new Redis({ url, token });
    const rateLimit = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(1, "60 s"),
      prefix: PREFIXO_CAPTURA,
      analytics: false,
      // O Redis é a fonte compartilhada; sem cache local, não há garantia
      // aparente por instância que esconda falha de configuração.
      ephemeralCache: false,
    });
    const resultado = await rateLimit.limit(identificadorCaptura(ip, pepper));
    return resultado.success;
  } catch {
    return null;
  }
}
