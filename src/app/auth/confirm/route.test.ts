import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const exchangeCodeForSession = vi.hoisted(() => vi.fn());
const createServerClient = vi.hoisted(() => vi.fn(() => ({ auth: { exchangeCodeForSession } })));

vi.mock("@supabase/ssr", () => ({ createServerClient }));

import { GET } from "./route";

describe("GET /auth/confirm", () => {
  beforeEach(() => {
    exchangeCodeForSession.mockReset().mockResolvedValue({ error: null });
    createServerClient.mockClear();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://teste.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "publishable-teste";
  });

  it("troca somente o código recebido e segue para a rota interna permitida", async () => {
    const resposta = await GET(
      new NextRequest("https://raro-ia.vercel.app/auth/confirm?code=abc&next=%2Flogin%3Fconfirmado%3D1"),
    );

    expect(exchangeCodeForSession).toHaveBeenCalledWith("abc");
    expect(resposta.headers.get("location")).toBe("https://raro-ia.vercel.app/login?confirmado=1");
  });

  it("recusa destino externo mesmo que ele venha no link de confirmação", async () => {
    const resposta = await GET(
      new NextRequest("https://raro-ia.vercel.app/auth/confirm?code=abc&next=https%3A%2F%2Finvalido.example"),
    );

    expect(resposta.headers.get("location")).toBe("https://raro-ia.vercel.app/login");
  });

  it("recusa barra invertida que a URL normalizaria como outro host", async () => {
    const resposta = await GET(
      new NextRequest("https://raro-ia.vercel.app/auth/confirm?code=abc&next=/%5Cevil.example"),
    );

    expect(resposta.headers.get("location")).toBe("https://raro-ia.vercel.app/login");
  });

  it("não tenta trocar sessão sem código", async () => {
    const resposta = await GET(new NextRequest("https://raro-ia.vercel.app/auth/confirm"));

    expect(createServerClient).not.toHaveBeenCalled();
    expect(resposta.headers.get("location")).toBe("https://raro-ia.vercel.app/login?erro=confirmacao");
  });
});
