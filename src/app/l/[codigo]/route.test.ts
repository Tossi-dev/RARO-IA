import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());
const createClient = vi.hoisted(() => vi.fn(() => ({ rpc })));

vi.mock("@supabase/supabase-js", () => ({ createClient }));

import { GET } from "./route";

function requisicao(): Request {
  return new Request("https://raro-ia.vercel.app/l/AbCd1234", {
    headers: { referer: "https://instagram.com/anuncio", "user-agent": "teste-agente" },
  });
}

describe("GET /l/[codigo]", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://exemplo.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-de-teste");
    vi.stubEnv("MARKETING_DOMINIOS_PERMITIDOS", "raro-ia.vercel.app");
    rpc.mockReset().mockResolvedValue({ data: "https://raro-ia.vercel.app/oferta", error: null });
    createClient.mockClear();
  });

  it("recusa código inválido sem criar cliente ou tocar no banco", async () => {
    const resposta = await GET(requisicao(), { params: { codigo: "../financeiro" } });

    expect(resposta.status).toBe(404);
    expect(createClient).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("não vira redirecionador aberto e devolve o mesmo 404 de código ausente", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null });
    const ausente = await GET(requisicao(), { params: { codigo: "Inexist1" } });
    rpc.mockResolvedValueOnce({ data: "https://phishing.example/roubo", error: null });
    const proibido = await GET(requisicao(), { params: { codigo: "AbCd1234" } });

    expect(ausente.status).toBe(404);
    expect(proibido.status).toBe(404);
    expect(await proibido.text()).toBe(await ausente.text());
  });

  it("registra clique pela RPC e redireciona somente para domínio permitido", async () => {
    const resposta = await GET(requisicao(), { params: { codigo: "AbCd1234" } });

    expect(resposta.status).toBe(302);
    expect(resposta.headers.get("location")).toBe("https://raro-ia.vercel.app/oferta");
    expect(rpc).toHaveBeenCalledWith(
      "registrar_clique",
      expect.objectContaining({
        p_codigo: "AbCd1234",
        p_referer_host: "instagram.com",
        p_agente_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      })
    );
  });
});
