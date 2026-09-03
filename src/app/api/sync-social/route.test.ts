import { beforeEach, describe, expect, it, vi } from "vitest";

const { contaUatMock, sincronizarRedesMock } = vi.hoisted(() => ({
  contaUatMock: vi.fn(),
  sincronizarRedesMock: vi.fn(),
}));

vi.mock("@/lib/uat/isolamento", () => ({ contaUatSinteticaAtual: contaUatMock }));
vi.mock("@/lib/integracoes/social", () => ({
  algumaRedeConfigurada: () => true,
  sincronizarRedes: sincronizarRedesMock,
}));
vi.mock("@/lib/data", () => ({ supabaseConfigurado: () => false }));
vi.mock("@/lib/supabase/server", () => ({ criarSupabaseServer: vi.fn() }));

const { GET } = await import("./route");

beforeEach(() => {
  vi.clearAllMocks();
  contaUatMock.mockResolvedValue(true);
});

describe("sync social em UAT sintético", () => {
  it("recusa antes de consultar qualquer rede externa", async () => {
    const resposta = await GET(new Request("http://localhost/api/sync-social"));
    expect(resposta.status).toBe(403);
    expect(sincronizarRedesMock).not.toHaveBeenCalled();
  });

  it("preserva o cron autenticado sem cookie de usuário", async () => {
    contaUatMock.mockResolvedValue(true);
    sincronizarRedesMock.mockResolvedValue({ conteudos: [], avisos: [] });
    process.env.CRON_SECRET = "cron-teste";
    const resposta = await GET(new Request("http://localhost/api/sync-social", {
      headers: { authorization: "Bearer cron-teste" },
    }));
    delete process.env.CRON_SECRET;
    expect(resposta.status).toBe(200);
    expect(sincronizarRedesMock).toHaveBeenCalledOnce();
    expect(contaUatMock).not.toHaveBeenCalled();
  });
});
