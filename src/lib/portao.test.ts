import { describe, expect, it } from "vitest";
import { decidirAcesso, rotaSegura } from "./portao";

describe("decidirAcesso", () => {
  it("rota livre passa em qualquer modo, mesmo trancado", () => {
    for (const modo of ["aberto", "trancado", "senha", "supabase"] as const) {
      expect(decidirAcesso({ pathname: "/acesso", modo, seloOk: false })).toEqual({
        tipo: "passa",
      });
    }
  });

  it("modo aberto passa direto", () => {
    expect(decidirAcesso({ pathname: "/painel", modo: "aberto", seloOk: false })).toEqual({
      tipo: "passa",
    });
  });

  it("modo trancado manda para /acesso, sem detalhe na URL", () => {
    expect(decidirAcesso({ pathname: "/financeiro/caixa", modo: "trancado", seloOk: false })).toEqual(
      { tipo: "redireciona", para: "/acesso" }
    );
  });

  it("modo senha sem selo conferido manda para /acesso com a rota de origem", () => {
    expect(decidirAcesso({ pathname: "/crm/aluno-1", modo: "senha", seloOk: false })).toEqual({
      tipo: "redireciona",
      para: "/acesso?de=%2Fcrm%2Faluno-1",
    });
  });

  it("modo senha com selo conferido passa", () => {
    expect(decidirAcesso({ pathname: "/painel", modo: "senha", seloOk: true })).toEqual({
      tipo: "passa",
    });
  });

  it("modo supabase nunca deveria chegar aqui, mas se chegar tranca", () => {
    expect(decidirAcesso({ pathname: "/painel", modo: "supabase", seloOk: true })).toEqual({
      tipo: "redireciona",
      para: "/acesso",
    });
  });
});

describe("rotaSegura", () => {
  it("aceita caminho interno normal", () => {
    expect(rotaSegura("/financeiro/caixa")).toBe("/financeiro/caixa");
  });

  it("recusa URL relativa a protocolo (redirecionamento aberto)", () => {
    expect(rotaSegura("//evil.com/phishing")).toBe("/");
  });

  it("recusa URL absoluta de outro site", () => {
    expect(rotaSegura("https://evil.com")).toBe("/");
  });

  it("recusa vazio, nulo ou indefinido", () => {
    expect(rotaSegura("")).toBe("/");
    expect(rotaSegura(null)).toBe("/");
    expect(rotaSegura(undefined)).toBe("/");
  });
});
