import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const {
  criarSupabaseServicoMock,
  criarSupabaseServerMock,
  fromMock,
  upsertMock,
  selectMock,
  eqMock,
  maybeSingleMock,
  authGetUserMock,
  perfilFromMock,
  perfilSelectMock,
  perfilEqMock,
  perfilMaybeSingleMock,
} = vi.hoisted(() => ({
  criarSupabaseServicoMock: vi.fn(),
  criarSupabaseServerMock: vi.fn(),
  fromMock: vi.fn(),
  upsertMock: vi.fn(),
  selectMock: vi.fn(),
  eqMock: vi.fn(),
  maybeSingleMock: vi.fn(),
  authGetUserMock: vi.fn(),
  perfilFromMock: vi.fn(),
  perfilSelectMock: vi.fn(),
  perfilEqMock: vi.fn(),
  perfilMaybeSingleMock: vi.fn(),
}));

vi.mock("@/lib/supabase/servico", () => ({ criarSupabaseServico: criarSupabaseServicoMock }));
vi.mock("@/lib/supabase/server", () => ({ criarSupabaseServer: criarSupabaseServerMock }));

import { cifrarRefreshTokenGoogle, chaveDoCofreGoogle } from "./google-cofre";
import { lerRefreshTokenGoogleDaOrganizacao, salvarRefreshTokenGoogleDaOrganizacao } from "./google-conexao-servidor";

const chaveValida = Buffer.alloc(32, 3).toString("base64");
const refreshToken = "1//0gTokenDeTesteQueNuncaVaiParaOBanco";
const workspaceId = "00000000-0000-0000-0000-000000000001";
const usuarioId = "00000000-0000-0000-0000-000000000002";

beforeEach(() => {
  vi.stubEnv("GOOGLE_TOKEN_ENCRYPTION_KEY", chaveValida);
  maybeSingleMock.mockReset();
  eqMock.mockReset().mockReturnValue({ maybeSingle: maybeSingleMock });
  selectMock.mockReset().mockReturnValue({ eq: eqMock });
  upsertMock.mockReset();
  fromMock.mockReset().mockReturnValue({ upsert: upsertMock, select: selectMock });
  criarSupabaseServicoMock.mockReset().mockReturnValue({ from: fromMock });
  perfilMaybeSingleMock.mockReset().mockResolvedValue({
    data: { id: usuarioId, workspace_id: workspaceId, papel: "gestor" },
    error: null,
  });
  perfilEqMock.mockReset().mockReturnValue({ maybeSingle: perfilMaybeSingleMock });
  perfilSelectMock.mockReset().mockReturnValue({ eq: perfilEqMock });
  perfilFromMock.mockReset().mockReturnValue({ select: perfilSelectMock });
  authGetUserMock.mockReset().mockResolvedValue({ data: { user: { id: usuarioId } }, error: null });
  criarSupabaseServerMock.mockReset().mockReturnValue({
    auth: { getUser: authGetUserMock },
    from: perfilFromMock,
  });
});

afterEach(() => vi.unstubAllEnvs());

describe("repositório server-only da conexão Google", () => {
  it("persiste somente refresh token cifrado na linha do workspace", async () => {
    upsertMock.mockResolvedValue({ error: null });

    const resultado = await salvarRefreshTokenGoogleDaOrganizacao({
      refreshToken,
      escopos: ["https://www.googleapis.com/auth/calendar.events"],
    });

    expect(resultado).toEqual({ ok: true });
    expect(fromMock).toHaveBeenCalledWith("google_calendar_conexao");
    const [linha, opcoes] = upsertMock.mock.calls[0];
    expect(linha.workspace_id).toBe(workspaceId);
    expect(linha.conectado_por).toBe(usuarioId);
    expect(JSON.stringify(linha)).not.toContain(refreshToken);
    expect(linha.refresh_token_cifrado).toBeTruthy();
    expect(linha.iv).toBeTruthy();
    expect(linha.tag_autenticacao).toBeTruthy();
    expect(opcoes).toEqual({ onConflict: "workspace_id" });
  });

  it("não tenta persistir quando o cofre ou o cliente de serviço não está configurado", async () => {
    vi.stubEnv("GOOGLE_TOKEN_ENCRYPTION_KEY", "");
    expect(await salvarRefreshTokenGoogleDaOrganizacao({ refreshToken, escopos: [] }))
      .toEqual({ ok: false, motivo: "cofre_nao_configurado" });
    expect(fromMock).not.toHaveBeenCalled();

    vi.stubEnv("GOOGLE_TOKEN_ENCRYPTION_KEY", chaveValida);
    criarSupabaseServicoMock.mockReturnValue(null);
    expect(await salvarRefreshTokenGoogleDaOrganizacao({ refreshToken, escopos: [] }))
      .toEqual({ ok: false, motivo: "servico_nao_configurado" });
  });

  it("recupera o token somente no servidor e falha fechada com cifra inválida", async () => {
    const chave = chaveDoCofreGoogle()!;
    const registro = cifrarRefreshTokenGoogle(refreshToken, chave);
    maybeSingleMock.mockResolvedValue({
      data: {
        refresh_token_cifrado: registro.cifra,
        iv: registro.iv,
        tag_autenticacao: registro.tag,
        versao_chave: registro.versaoChave,
      },
      error: null,
    });

    expect(await lerRefreshTokenGoogleDaOrganizacao()).toEqual({ ok: true, refreshToken });

    maybeSingleMock.mockResolvedValue({
      data: { refresh_token_cifrado: registro.cifra, iv: registro.iv, tag_autenticacao: "invalida", versao_chave: 1 },
      error: null,
    });
    expect(await lerRefreshTokenGoogleDaOrganizacao()).toEqual({ ok: false, motivo: "registro_invalido" });
  });

  it("deriva o workspace da sessão e recusa ator sem papel de gestão", async () => {
    upsertMock.mockResolvedValue({ error: null });
    perfilMaybeSingleMock.mockResolvedValue({
      data: { id: usuarioId, workspace_id: "00000000-0000-0000-0000-000000000009", papel: "dono" },
      error: null,
    });

    await salvarRefreshTokenGoogleDaOrganizacao({ refreshToken, escopos: [] });
    expect(upsertMock.mock.calls[0][0].workspace_id).toBe("00000000-0000-0000-0000-000000000009");

    perfilMaybeSingleMock.mockResolvedValue({
      data: { id: usuarioId, workspace_id: workspaceId, papel: "mentorado" },
      error: null,
    });
    expect(await salvarRefreshTokenGoogleDaOrganizacao({ refreshToken, escopos: [] }))
      .toEqual({ ok: false, motivo: "nao_autorizado" });
  });

  it("não devolve token de conexão revogada", async () => {
    const chave = chaveDoCofreGoogle()!;
    const registro = cifrarRefreshTokenGoogle(refreshToken, chave);
    maybeSingleMock.mockResolvedValue({
      data: {
        refresh_token_cifrado: registro.cifra,
        iv: registro.iv,
        tag_autenticacao: registro.tag,
        versao_chave: registro.versaoChave,
        revogado_em: "2026-09-08T00:00:00Z",
      },
      error: null,
    });

    expect(await lerRefreshTokenGoogleDaOrganizacao()).toEqual({ ok: false, motivo: "conexao_revogada" });
  });
});
