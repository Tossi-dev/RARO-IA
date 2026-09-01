import { describe, expect, it } from "vitest";
import { decisaoDeContato } from "./consentimento";

describe("decisaoDeContato", () => {
  it("falha fechada sem consentimento e nunca habilita envio", () => {
    expect(decisaoDeContato(false, false)).toEqual({ podeCapturar: false, podeEnviar: false });
  });

  it("cancelamento vence consentimento e também nunca habilita envio", () => {
    expect(decisaoDeContato(true, true)).toEqual({ podeCapturar: false, podeEnviar: false });
  });

  it("consentimento permite somente a captura local, nunca envio padrão", () => {
    expect(decisaoDeContato(true, false)).toEqual({ podeCapturar: true, podeEnviar: false });
  });
});
