import { describe, expect, it } from "vitest";
import { conectorAtivado, TAMANHO_MINIMO_TOKEN, tokenConfere, tokenDoHeader } from "./token";

const TOKEN = "token-de-teste-bem-comprido";

describe("tokenDoHeader", () => {
  it("extrai o token de um Bearer bem formado", () => {
    expect(tokenDoHeader(`Bearer ${TOKEN}`)).toBe(TOKEN);
  });

  it("aceita o esquema em qualquer caixa — a RFC 7235 define esquema sem caixa", () => {
    expect(tokenDoHeader(`bearer ${TOKEN}`)).toBe(TOKEN);
    expect(tokenDoHeader(`BEARER ${TOKEN}`)).toBe(TOKEN);
  });

  it("recusa header sem esquema, com esquema errado ou vazio", () => {
    expect(tokenDoHeader(TOKEN)).toBe("");
    expect(tokenDoHeader(`Basic ${TOKEN}`)).toBe("");
    expect(tokenDoHeader("")).toBe("");
    expect(tokenDoHeader(null)).toBe("");
    expect(tokenDoHeader(undefined)).toBe("");
  });
});

describe("conectorAtivado", () => {
  it("token curto é o mesmo que token nenhum", () => {
    expect(conectorAtivado("curto")).toBe(false);
    expect(conectorAtivado("x".repeat(TAMANHO_MINIMO_TOKEN - 1))).toBe(false);
    expect(conectorAtivado("x".repeat(TAMANHO_MINIMO_TOKEN))).toBe(true);
  });

  it("sem variável definida, o conector não existe", () => {
    expect(conectorAtivado(undefined)).toBe(false);
    expect(conectorAtivado("")).toBe(false);
    expect(conectorAtivado("   ")).toBe(false);
  });
});

describe("tokenConfere", () => {
  it("libera só com o token exato", () => {
    expect(tokenConfere(`Bearer ${TOKEN}`, TOKEN)).toBe(true);
  });

  it("recusa token errado, prefixo do token certo e caixa trocada", () => {
    expect(tokenConfere("Bearer outro-token-comprido", TOKEN)).toBe(false);
    expect(tokenConfere(`Bearer ${TOKEN.slice(0, -1)}`, TOKEN)).toBe(false);
    expect(tokenConfere(`Bearer ${TOKEN}x`, TOKEN)).toBe(false);
    expect(tokenConfere(`Bearer ${TOKEN.toUpperCase()}`, TOKEN)).toBe(false);
  });

  it("FALHA FECHADO: sem token configurado, nem o token certo passa", () => {
    expect(tokenConfere(`Bearer ${TOKEN}`, undefined)).toBe(false);
    expect(tokenConfere(`Bearer ${TOKEN}`, "")).toBe(false);
    // Token configurado abaixo do mínimo também não ativa nada.
    expect(tokenConfere("Bearer curto", "curto")).toBe(false);
  });

  it("recusa header ausente", () => {
    expect(tokenConfere(null, TOKEN)).toBe(false);
    expect(tokenConfere(undefined, TOKEN)).toBe(false);
  });
});
