import { afterEach, describe, expect, it, vi } from "vitest";

const { revalidatePathMock, supabaseConfiguradoMock, criarSupabaseServerMock } = vi.hoisted(() => ({
  revalidatePathMock: vi.fn(),
  supabaseConfiguradoMock: vi.fn(),
  criarSupabaseServerMock: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@/lib/data", () => ({ supabaseConfigurado: supabaseConfiguradoMock }));
vi.mock("@/lib/supabase/server", () => ({ criarSupabaseServer: criarSupabaseServerMock }));

import { resolverAlerta } from "./page";

afterEach(() => vi.resetAllMocks());

describe("resolverAlerta", () => {
  it("não revalida a tela quando a escrita falha", async () => {
    supabaseConfiguradoMock.mockReturnValue(true);
    const eq = vi.fn(() => Promise.resolve({ error: { message: "falhou" } }));
    const update = vi.fn(() => ({ eq }));
    criarSupabaseServerMock.mockReturnValue({ from: vi.fn(() => ({ update })) });
    const form = new FormData(); form.set("alertaId", "a-1");

    await resolverAlerta(form);

    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});
