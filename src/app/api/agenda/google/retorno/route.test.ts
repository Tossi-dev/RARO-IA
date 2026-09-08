import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  contaUatMock,
  trocarCodigoPorTokensMock,
  salvarRefreshTokenGoogleDaOrganizacaoMock,
  consumirEstadoOAuthGoogleMock,
} = vi.hoisted(() => ({
  contaUatMock: vi.fn(() => Promise.resolve(false)),
  trocarCodigoPorTokensMock: vi.fn(),
  salvarRefreshTokenGoogleDaOrganizacaoMock: vi.fn(),
  consumirEstadoOAuthGoogleMock: vi.fn(),
}));

vi.mock("@/lib/uat/isolamento", () => ({ contaUatSinteticaAtual: contaUatMock }));
vi.mock("@/lib/integracoes/google-agenda", () => ({
  ESCOPO_AGENDA: "https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events",
  trocarCodigoPorTokens: trocarCodigoPorTokensMock,
}));
vi.mock("@/lib/integracoes/google-conexao-servidor", () => ({
  consumirEstadoOAuthGoogle: consumirEstadoOAuthGoogleMock,
  salvarRefreshTokenGoogleDaOrganizacao: salvarRefreshTokenGoogleDaOrganizacaoMock,
}));

const { GET } = await import("./route");

beforeEach(() => {
  contaUatMock.mockReset().mockResolvedValue(false);
  trocarCodigoPorTokensMock.mockReset();
  salvarRefreshTokenGoogleDaOrganizacaoMock.mockReset();
  consumirEstadoOAuthGoogleMock.mockReset().mockResolvedValue({ ok: true });
});

function requisicao(params: Record<string, string> = {}) {
  const url = new URL("http://localhost:3000/api/agenda/google/retorno");
  for (const [chave, valor] of Object.entries(params)) url.searchParams.set(chave, valor);
  return {
    url: url.toString(),
    nextUrl: url,
    cookies: { get: vi.fn(() => undefined) },
  } as never;
}

describe("retorno OAuth Google", () => {
  it("consome state no servidor e armazena somente pelo cofre da organização", async () => {
    trocarCodigoPorTokensMock.mockResolvedValue({ ok: true, refreshToken: "1//token-de-teste" });
    salvarRefreshTokenGoogleDaOrganizacaoMock.mockResolvedValue({ ok: true });

    const resposta = await GET(requisicao({ code: "codigo", state: "a".repeat(64) }));

    expect(resposta.headers.get("location")).toBe("http://localhost:3000/agenda?conectado=1");
    expect(consumirEstadoOAuthGoogleMock).toHaveBeenCalledWith("a".repeat(64));
    expect(trocarCodigoPorTokensMock).toHaveBeenCalledWith("codigo");
    expect(salvarRefreshTokenGoogleDaOrganizacaoMock).toHaveBeenCalledWith({
      refreshToken: "1//token-de-teste",
      escopos: [
        "https://www.googleapis.com/auth/calendar.readonly",
        "https://www.googleapis.com/auth/calendar.events",
      ],
    });
    const cookie = resposta.headers.get("set-cookie") ?? "";
    expect(cookie).not.toContain("raro_google_agenda");
    expect(cookie).not.toContain("1//token-de-teste");
  });

  it("recusa state inválido no servidor, sem trocar código", async () => {
    consumirEstadoOAuthGoogleMock.mockResolvedValueOnce({ ok: false, motivo: "estado_invalido" });
    const resposta = await GET(requisicao({ code: "codigo", state: "b".repeat(64) }));

    expect(resposta.headers.get("location")).toBe("http://localhost:3000/agenda?erro=estado");
    expect(consumirEstadoOAuthGoogleMock).toHaveBeenCalledWith("b".repeat(64));
    expect(trocarCodigoPorTokensMock).not.toHaveBeenCalled();
  });

  it("consome state também quando o consentimento é cancelado", async () => {
    const resposta = await GET(requisicao({ error: "access_denied", state: "c".repeat(64) }));

    expect(resposta.headers.get("location")).toBe("http://localhost:3000/agenda?erro=recusado");
    expect(consumirEstadoOAuthGoogleMock).toHaveBeenCalledWith("c".repeat(64));
  });

  it("não expõe token nem motivo interno quando o cofre recusa a persistência", async () => {
    trocarCodigoPorTokensMock.mockResolvedValue({ ok: true, refreshToken: "1//token-que-nao-pode-vazar" });
    salvarRefreshTokenGoogleDaOrganizacaoMock.mockResolvedValue({ ok: false, motivo: "nao_autorizado" });

    const resposta = await GET(requisicao({ code: "codigo", state: "d".repeat(64) }));

    expect(resposta.headers.get("location")).toBe("http://localhost:3000/agenda?erro=conexao");
    expect(resposta.headers.get("location")).not.toContain("token-que-nao-pode-vazar");
    expect(resposta.headers.get("location")).not.toContain("nao_autorizado");
  });

  it("continua fechada para UAT sintético", async () => {
    contaUatMock.mockResolvedValueOnce(true);
    const resposta = await GET(requisicao({ code: "codigo", state: "e".repeat(64) }));

    expect(resposta.status).toBe(403);
    expect(trocarCodigoPorTokensMock).not.toHaveBeenCalled();
  });
});
