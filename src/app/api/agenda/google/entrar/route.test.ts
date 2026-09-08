import { beforeEach, describe, expect, it, vi } from "vitest";

const { contaUatMock, urlDeConsentimentoMock, criarEstadoOAuthGoogleMock } = vi.hoisted(() => ({
  contaUatMock: vi.fn(() => Promise.resolve(true)),
  urlDeConsentimentoMock: vi.fn(),
  criarEstadoOAuthGoogleMock: vi.fn(),
}));

vi.mock("@/lib/uat/isolamento", () => ({ contaUatSinteticaAtual: contaUatMock }));
vi.mock("@/lib/integracoes/google-agenda", () => ({
  googleAppConfigurado: () => true,
  urlDeConsentimento: urlDeConsentimentoMock,
}));
vi.mock("@/lib/integracoes/google-conexao-servidor", () => ({
  criarEstadoOAuthGoogle: criarEstadoOAuthGoogleMock,
}));

const { GET } = await import("./route");

beforeEach(() => {
  contaUatMock.mockReset().mockResolvedValue(false);
  urlDeConsentimentoMock.mockReset().mockImplementation((estado: string) => `https://accounts.google.com/?state=${estado}`);
  criarEstadoOAuthGoogleMock.mockReset().mockResolvedValue({ ok: true, state: "a".repeat(64) });
});

describe("entrada Google em UAT sintético", () => {
  it("não cria consentimento nem redireciona ao Google", async () => {
    contaUatMock.mockResolvedValueOnce(true);
    const req = {
      url: "http://localhost:3000/api/agenda/google/entrar",
      nextUrl: new URL("http://localhost:3000/api/agenda/google/entrar"),
    } as never;
    const resposta = await GET(req);
    expect(resposta.status).toBe(403);
    expect(urlDeConsentimentoMock).not.toHaveBeenCalled();
  });

  it("cria state no servidor e não deixa material OAuth durável no navegador", async () => {
    const req = {
      url: "http://localhost:3000/api/agenda/google/entrar",
      nextUrl: new URL("http://localhost:3000/api/agenda/google/entrar"),
    } as never;

    const resposta = await GET(req);
    const estado = urlDeConsentimentoMock.mock.calls[0][0];
    const cookie = resposta.headers.get("set-cookie") ?? "";

    expect(criarEstadoOAuthGoogleMock).toHaveBeenCalledOnce();
    expect(estado).toMatch(/^[a-f0-9]{64}$/);
    expect(resposta.headers.get("location")).toContain(`state=${estado}`);
    expect(cookie).not.toContain("raro_google_state");
    expect(cookie).not.toContain("refresh_token");
    expect(cookie).not.toContain("raro_google_agenda");
  });
});
