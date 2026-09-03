import { describe, expect, it, vi } from "vitest";

const { contaUatMock, urlDeConsentimentoMock } = vi.hoisted(() => ({
  contaUatMock: vi.fn(() => Promise.resolve(true)),
  urlDeConsentimentoMock: vi.fn(),
}));

vi.mock("@/lib/uat/isolamento", () => ({ contaUatSinteticaAtual: contaUatMock }));
vi.mock("@/lib/integracoes/google-agenda", () => ({
  googleAppConfigurado: () => true,
  urlDeConsentimento: urlDeConsentimentoMock,
}));

const { GET } = await import("./route");

describe("entrada Google em UAT sintético", () => {
  it("não cria consentimento nem redireciona ao Google", async () => {
    const req = {
      url: "http://localhost:3000/api/agenda/google/entrar",
      nextUrl: new URL("http://localhost:3000/api/agenda/google/entrar"),
    } as never;
    const resposta = await GET(req);
    expect(resposta.status).toBe(403);
    expect(urlDeConsentimentoMock).not.toHaveBeenCalled();
  });
});
