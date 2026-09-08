import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import {
  chaveDoCofreGoogle,
  cifrarRefreshTokenGoogle,
  decifrarRefreshTokenGoogle,
  type RefreshTokenGoogleCifrado,
} from "./google-cofre";

const chaveValida = Buffer.alloc(32, 7).toString("base64");
const refreshToken = "1//0gTokenDeTesteQueNuncaSaiDoProcesso";

describe("cofre de refresh token do Google", () => {
  it("aceita apenas chave server-only em Base64 com 32 bytes", () => {
    expect(chaveDoCofreGoogle({ GOOGLE_TOKEN_ENCRYPTION_KEY: chaveValida })).not.toBeNull();
    expect(chaveDoCofreGoogle({ GOOGLE_TOKEN_ENCRYPTION_KEY: "curta" })).toBeNull();
    expect(chaveDoCofreGoogle({ GOOGLE_TOKEN_ENCRYPTION_KEY: "" })).toBeNull();
  });

  it("cifra e recupera o refresh token sem retorná-lo no registro persistível", () => {
    const chave = chaveDoCofreGoogle({ GOOGLE_TOKEN_ENCRYPTION_KEY: chaveValida });
    expect(chave).not.toBeNull();

    const registro = cifrarRefreshTokenGoogle(refreshToken, chave!);

    expect(JSON.stringify(registro)).not.toContain(refreshToken);
    expect(registro.versaoChave).toBe(1);
    expect(decifrarRefreshTokenGoogle(registro, chave!)).toBe(refreshToken);
  });

  it("usa IV aleatório para não repetir a cifra do mesmo token", () => {
    const chave = chaveDoCofreGoogle({ GOOGLE_TOKEN_ENCRYPTION_KEY: chaveValida })!;
    const primeiro = cifrarRefreshTokenGoogle(refreshToken, chave);
    const segundo = cifrarRefreshTokenGoogle(refreshToken, chave);

    expect(primeiro.iv).not.toBe(segundo.iv);
    expect(primeiro.cifra).not.toBe(segundo.cifra);
  });

  it("falha fechada quando qualquer parte persistida foi adulterada", () => {
    const chave = chaveDoCofreGoogle({ GOOGLE_TOKEN_ENCRYPTION_KEY: chaveValida })!;
    const original = cifrarRefreshTokenGoogle(refreshToken, chave);
    const adulterado: RefreshTokenGoogleCifrado = { ...original, tag: Buffer.alloc(16, 9).toString("base64") };

    expect(decifrarRefreshTokenGoogle(adulterado, chave)).toBeNull();
    expect(decifrarRefreshTokenGoogle({ ...original, versaoChave: 999 }, chave)).toBeNull();
  });
});
