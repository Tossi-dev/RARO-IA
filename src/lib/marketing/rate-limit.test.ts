import { beforeEach, describe, expect, it, vi } from "vitest";

const limitar = vi.hoisted(() => vi.fn());
const criarRedis = vi.hoisted(() => vi.fn());
const slidingWindow = vi.hoisted(() => vi.fn(() => "janela"));
const criarRateLimit = vi.hoisted(() => vi.fn(() => ({ limit: limitar })));

vi.mock("@upstash/redis", () => ({ Redis: criarRedis }));
vi.mock("@upstash/ratelimit", () => ({
  Ratelimit: Object.assign(criarRateLimit, { slidingWindow }),
}));

import { identificadorCaptura, limitarCaptura, redisConfigurado } from "./rate-limit";

const AMBIENTE = {
  UPSTASH_REDIS_REST_URL: "https://redis.exemplo.upstash.io",
  UPSTASH_REDIS_REST_TOKEN: "token-de-teste",
  RARO_RATE_LIMIT_PEPPER: "segredo-de-teste",
};

const AMBIENTE_VERCEL = {
  KV_REST_API_URL: "https://redis-da-vercel.exemplo.upstash.io",
  KV_REST_API_TOKEN: "token-da-vercel",
  RARO_RATE_LIMIT_PEPPER: "segredo-de-teste",
};

describe("rate limit distribuído da captura", () => {
  beforeEach(() => {
    limitar.mockReset().mockResolvedValue({ success: true });
    criarRedis.mockClear();
    criarRateLimit.mockClear();
    slidingWindow.mockClear();
  });

  it("só considera Redis configurado com URL, token e pepper", () => {
    expect(redisConfigurado(AMBIENTE)).toBe(true);
    expect(redisConfigurado({ ...AMBIENTE, RARO_RATE_LIMIT_PEPPER: "" })).toBe(false);
    expect(redisConfigurado({ ...AMBIENTE, UPSTASH_REDIS_REST_TOKEN: undefined })).toBe(false);
  });

  it("aceita os nomes injetados pela integração Vercel/Upstash", async () => {
    expect(redisConfigurado(AMBIENTE_VERCEL)).toBe(true);

    await expect(limitarCaptura("198.51.100.10", AMBIENTE_VERCEL)).resolves.toBe(true);

    expect(criarRedis).toHaveBeenCalledWith({
      url: AMBIENTE_VERCEL.KV_REST_API_URL,
      token: AMBIENTE_VERCEL.KV_REST_API_TOKEN,
    });
  });

  it("não mistura uma URL Upstash residual com o token KV da Vercel", async () => {
    const ambienteComUrlResidual = {
      ...AMBIENTE_VERCEL,
      UPSTASH_REDIS_REST_URL: "https://redis-residual.exemplo.upstash.io",
    };

    expect(redisConfigurado(ambienteComUrlResidual)).toBe(true);
    await expect(limitarCaptura("198.51.100.10", ambienteComUrlResidual)).resolves.toBe(true);
    expect(criarRedis).toHaveBeenCalledWith({
      url: AMBIENTE_VERCEL.KV_REST_API_URL,
      token: AMBIENTE_VERCEL.KV_REST_API_TOKEN,
    });
  });

  it("não envia IP cru ao provedor", async () => {
    const ip = "198.51.100.10";
    const identificador = identificadorCaptura(ip, AMBIENTE.RARO_RATE_LIMIT_PEPPER);
    const permitido = await limitarCaptura(ip, AMBIENTE);

    expect(permitido).toBe(true);
    expect(identificador).toMatch(/^[0-9a-f]{64}$/);
    expect(identificador).not.toContain(ip);
    expect(limitar).toHaveBeenCalledWith(identificador);
    expect(slidingWindow).toHaveBeenCalledWith(1, "60 s");
  });

  it("falha fechada quando não há configuração compartilhada", async () => {
    await expect(limitarCaptura("198.51.100.10", {})).resolves.toBeNull();
    expect(criarRedis).not.toHaveBeenCalled();
  });
});
