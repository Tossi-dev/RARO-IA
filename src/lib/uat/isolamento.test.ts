import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getUserMock } = vi.hoisted(() => ({ getUserMock: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  criarSupabaseServer: () => ({ auth: { getUser: getUserMock } }),
}));

const { contaUatSinteticaAtual, emailEhUatSintetico } = await import("./isolamento");

beforeEach(() => {
  getUserMock.mockReset();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://projeto.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-teste";
});
afterEach(() => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
});

describe("isolamento UAT", () => {
  it.each([
    "rls-audit-gestor@audit.invalid",
    "MENTORADO@AUDIT.INVALID",
    " pessoa@audit.invalid ",
  ])("reconhece %s como identidade sintética", (email) => {
    expect(emailEhUatSintetico(email)).toBe(true);
  });

  it.each([undefined, null, "", "gestor@empresa.com", "audit.invalid@empresa.com"])(
    "não classifica %s como identidade sintética",
    (email) => expect(emailEhUatSintetico(email)).toBe(false)
  );

  it("deriva a identidade da sessão autenticada no servidor", async () => {
    getUserMock.mockResolvedValue({ data: { user: { email: "comercial@audit.invalid" } } });
    await expect(contaUatSinteticaAtual()).resolves.toBe(true);
    expect(getUserMock).toHaveBeenCalledOnce();
  });

  it("falha fechado quando a leitura da sessão falha", async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: { message: "sessão indisponível" } });
    await expect(contaUatSinteticaAtual()).resolves.toBe(true);
  });

  it("não confunde ausência legítima de sessão Supabase com conta UAT", async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: null });
    await expect(contaUatSinteticaAtual()).resolves.toBe(false);
  });

  it("mantém usuário normal fora do isolamento", async () => {
    getUserMock.mockResolvedValue({ data: { user: { email: "gestor@empresa.com" } }, error: null });
    await expect(contaUatSinteticaAtual()).resolves.toBe(false);
  });

  it("preserva instalações sem Supabase", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    await expect(contaUatSinteticaAtual()).resolves.toBe(false);
    expect(getUserMock).not.toHaveBeenCalled();
  });
});
