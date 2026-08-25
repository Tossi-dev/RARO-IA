import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());
const createClient = vi.hoisted(() => vi.fn(() => ({ rpc })));

vi.mock("@supabase/supabase-js", () => ({ createClient }));

import { POST, quantidadeDeIpsLimitadosParaTeste, resetarLimiteCapturaParaTeste } from "./route";

function requisicao(corpo: unknown, headers: HeadersInit = {}): Request {
  return new Request("https://raro-ia.vercel.app/api/marketing/captura", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.10", ...headers },
    body: JSON.stringify(corpo),
  });
}

describe("POST /api/marketing/captura", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://exemplo.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-de-teste");
    rpc.mockReset().mockResolvedValue({ error: null });
    createClient.mockClear();
    resetarLimiteCapturaParaTeste();
  });

  it("recusa captura sem e-mail e telefone antes de chamar o banco", async () => {
    const resposta = await POST(requisicao({ nome: "Sem contato" }));

    expect(resposta.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("recusa corpo acima de 200 KB antes de ler ou persistir", async () => {
    const resposta = await POST(
      requisicao({ email: "lead@exemplo.com" }, { "content-length": String(200 * 1024 + 1) })
    );

    expect(resposta.status).toBe(413);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("barra a segunda captura imediata do mesmo IP", async () => {
    const primeira = await POST(requisicao({ email: "lead@exemplo.com" }));
    const segunda = await POST(requisicao({ email: "lead@exemplo.com" }));

    expect(primeira.status).toBe(201);
    expect(segunda.status).toBe(429);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("mantém o rate limit local limitado mesmo com IPs variados", async () => {
    for (let indice = 0; indice < 1030; indice++) {
      await POST(requisicao({ email: `lead${indice}@exemplo.com` }, { "x-forwarded-for": `198.51.100.${indice}` }));
    }

    expect(quantidadeDeIpsLimitadosParaTeste()).toBeLessThanOrEqual(1024);
  });

  it("persiste somente via RPC estreita e não devolve a captura", async () => {
    const resposta = await POST(
      requisicao({
        nome: "Ada",
        email: "ada@exemplo.com",
        pagina: "/diagnostico",
        utm_source: "Instagram",
      })
    );

    expect(resposta.status).toBe(201);
    expect(await resposta.json()).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith("registrar_captura", {
      p_nome: "Ada",
      p_email: "ada@exemplo.com",
      p_telefone: "",
      p_utm_source: "instagram",
      p_utm_medium: "",
      p_utm_campaign: "",
      p_utm_content: "",
      p_utm_term: "",
      p_pagina: "/diagnostico",
    });
  });
});
