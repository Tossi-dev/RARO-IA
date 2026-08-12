// Cobre a única decisão de verdade das telas de erro: se a linha do digest
// aparece. O resto de error.tsx/global-error.tsx/not-found.tsx é JSX estático
// — testá-lo seria só re-renderizar strings fixas, teste de fachada.

import { describe, expect, it } from "vitest";
import { linhaDigest } from "./erro-texto";

describe("linhaDigest", () => {
  it("mostra o código quando o Next calculou um digest", () => {
    expect(linhaDigest("abc123")).toBe("Código para o suporte: abc123");
  });

  it("some quando não há digest — nunca mostra 'undefined' na tela", () => {
    expect(linhaDigest(undefined)).toBeNull();
  });

  it("trata string vazia como 'não há digest', não como código válido", () => {
    expect(linhaDigest("")).toBeNull();
  });

  it("trata string só de espaço como 'não há digest'", () => {
    expect(linhaDigest("   ")).toBeNull();
  });

  it("apara espaço em volta de um digest real", () => {
    expect(linhaDigest("  xyz789  ")).toBe("Código para o suporte: xyz789");
  });
});
