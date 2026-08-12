// Testes de `papelAtual()` — B2.7. Mesmo espírito de dublê de
// `src/middleware.test.ts` (o ramo `modo === "supabase"` do middleware): um
// cliente Supabase falso, sem falar com Postgres nenhum.
//
// `vi.hoisted` porque `vi.mock` é içado para o topo do arquivo pelo
// transform do Vitest, antes de qualquer `const` comum.

import { afterEach, describe, expect, it, vi } from "vitest";

const { getUserMock, maybeSingleMock, criarSupabaseServerMock, supabaseConfiguradoMock } =
  vi.hoisted(() => ({
    getUserMock: vi.fn(),
    maybeSingleMock: vi.fn(),
    criarSupabaseServerMock: vi.fn(),
    supabaseConfiguradoMock: vi.fn(),
  }));

vi.mock("./supabase/server", () => ({
  criarSupabaseServer: criarSupabaseServerMock,
}));

vi.mock("./data", () => ({
  supabaseConfigurado: supabaseConfiguradoMock,
}));

const { papelAtual } = await import("./papel-atual");

function ligarClienteFalso() {
  criarSupabaseServerMock.mockReturnValue({
    auth: { getUser: getUserMock },
    from: (_tabela: string) => ({
      select: (_colunas: string) => ({
        eq: (_coluna: string, _valor: string) => ({
          maybeSingle: maybeSingleMock,
        }),
      }),
    }),
  });
}

afterEach(() => {
  vi.resetAllMocks();
});

describe("papelAtual — sem Supabase configurado (modo planilha/senha)", () => {
  it('devolve "dono", NUNCA PAPEL_PADRAO — quem passou pelo portão sem Supabase já é o dono operando o próprio negócio', async () => {
    supabaseConfiguradoMock.mockReturnValue(false);
    const papel = await papelAtual();
    expect(papel).toBe("dono");
  });

  it("zero consulta ao Supabase: nem o cliente é criado", async () => {
    supabaseConfiguradoMock.mockReturnValue(false);
    await papelAtual();
    expect(criarSupabaseServerMock).not.toHaveBeenCalled();
  });
});

describe("papelAtual — com Supabase configurado", () => {
  it("sessão de gestor: devolve 'gestor'", async () => {
    supabaseConfiguradoMock.mockReturnValue(true);
    ligarClienteFalso();
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    maybeSingleMock.mockResolvedValue({ data: { papel: "gestor" }, error: null });

    expect(await papelAtual()).toBe("gestor");
  });

  it("sem sessão: devolve PAPEL_PADRAO, e a consulta a profiles nunca acontece", async () => {
    supabaseConfiguradoMock.mockReturnValue(true);
    ligarClienteFalso();
    getUserMock.mockResolvedValue({ data: { user: null } });

    const { PAPEL_PADRAO } = await import("./papeis");
    expect(await papelAtual()).toBe(PAPEL_PADRAO);
    expect(maybeSingleMock).not.toHaveBeenCalled();
  });

  it("erro na consulta (RLS/rede): devolve PAPEL_PADRAO e loga com console.warn, sem id nem e-mail", async () => {
    supabaseConfiguradoMock.mockReturnValue(true);
    ligarClienteFalso();
    getUserMock.mockResolvedValue({ data: { user: { id: "11111111-aaaa-bbbb-cccc-000000000000" } } });
    maybeSingleMock.mockResolvedValue({
      data: null,
      error: { code: "PGRST301", message: "linha inacessível por RLS" },
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { PAPEL_PADRAO } = await import("./papeis");
    expect(await papelAtual()).toBe(PAPEL_PADRAO);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const mensagem = warnSpy.mock.calls[0].join(" ");
    expect(mensagem).toContain("PGRST301");
    expect(mensagem).not.toContain("11111111-aaaa-bbbb-cccc-000000000000");

    warnSpy.mockRestore();
  });

  it("consulta LANÇA: devolve PAPEL_PADRAO, nunca deixa a exceção subir", async () => {
    supabaseConfiguradoMock.mockReturnValue(true);
    ligarClienteFalso();
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    maybeSingleMock.mockRejectedValue(new Error("rede caiu"));

    const { PAPEL_PADRAO } = await import("./papeis");
    await expect(papelAtual()).resolves.toBe(PAPEL_PADRAO);
  });

  it("valor fora do enum ('chefe-supremo'): devolve PAPEL_PADRAO", async () => {
    supabaseConfiguradoMock.mockReturnValue(true);
    ligarClienteFalso();
    getUserMock.mockResolvedValue({ data: { user: { id: "u1" } } });
    maybeSingleMock.mockResolvedValue({ data: { papel: "chefe-supremo" }, error: null });

    const { PAPEL_PADRAO } = await import("./papeis");
    expect(await papelAtual()).toBe(PAPEL_PADRAO);
  });
});
