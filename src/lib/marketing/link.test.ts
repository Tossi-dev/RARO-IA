import { describe, expect, it } from "vitest";
import { codigoValido, gerarCodigo } from "./link";

describe("código de link", () => {
  it("é determinístico pelos bytes, e não pelo destino", () => {
    expect(gerarCodigo(Uint8Array.from([1,2,3,4,5,6,7,8]))).not.toBe(gerarCodigo(Uint8Array.from([8,7,6,5,4,3,2,1])));
  });
  it.each([null, "", "abc/def", "abc%20", "..", "a\nb", 7])("recusa caminho ou tipo inválido: %j", (codigo) => expect(codigoValido(codigo)).toBe(false));
  it("aceita somente código gerado", () => expect(codigoValido(gerarCodigo(Uint8Array.from([1,2,3,4,5,6,7,8])))).toBe(true));
  it("recusa bytes que produziriam código maior que a coluna aceita", () => expect(() => gerarCodigo(new Uint8Array(80).fill(1))).toThrow());
});
