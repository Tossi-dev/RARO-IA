import { describe, expect, it } from "vitest";
import { auditoriaDeArquivosRastreados } from "./prontidao-local";

describe("auditoriaDeArquivosRastreados", () => {
  it("aceita somente exemplos de ambiente e arquivos-fonte", () => {
    expect(
      auditoriaDeArquivosRastreados([
        ".env.example",
        "agente-whatsapp/.env.example",
        "src/lib/mentoria/portal.ts",
        "docs/operacao/roteiro-uat-local.md",
      ]),
    ).toEqual({ aprovado: true, segredos: [], artefatos: [] });
  });

  it("bloqueia arquivos de ambiente reais e chaves sem ler o conteúdo", () => {
    expect(auditoriaDeArquivosRastreados([".env.local", "config/producao.env", "certificado.pem", "chave.key"])).toEqual({
      aprovado: false,
      segredos: [".env.local", "certificado.pem", "chave.key", "config/producao.env"],
      artefatos: [],
    });
  });

  it("bloqueia somente artefatos gerados conhecidos", () => {
    expect(auditoriaDeArquivosRastreados([".next/server/app.js", "coverage/index.html", "node_modules/a/index.js", "tsconfig.tsbuildinfo"])).toEqual({
      aprovado: false,
      segredos: [],
      artefatos: [".next/server/app.js", "coverage/index.html", "node_modules/a/index.js", "tsconfig.tsbuildinfo"],
    });
  });
});
