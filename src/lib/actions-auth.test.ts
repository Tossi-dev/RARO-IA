import { beforeEach, describe, expect, it, vi } from "vitest";

const signOut = vi.hoisted(() => vi.fn());
const criarSupabaseServer = vi.hoisted(() => vi.fn(() => ({ auth: { signOut } })));
const supabaseConfigurado = vi.hoisted(() => vi.fn());
const redirect = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({ redirect }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("./data", () => ({ getDB: vi.fn(), supabaseConfigurado }));
vi.mock("./supabase/server", () => ({ criarSupabaseServer }));

import { sair } from "./actions";

describe("sair", () => {
  beforeEach(() => {
    signOut.mockReset().mockResolvedValue({ error: null });
    criarSupabaseServer.mockClear();
    redirect.mockReset();
  });

  it("encerra a sessão Supabase e sempre volta para a rota pública de login", async () => {
    supabaseConfigurado.mockReturnValue(true);

    await sair();

    expect(signOut).toHaveBeenCalledOnce();
    expect(redirect).toHaveBeenCalledWith("/login");
  });

  it("sem Supabase não tenta criar sessão, mas ainda sai para uma rota segura", async () => {
    supabaseConfigurado.mockReturnValue(false);

    await sair();

    expect(criarSupabaseServer).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
    expect(redirect).toHaveBeenCalledWith("/login");
  });
});
