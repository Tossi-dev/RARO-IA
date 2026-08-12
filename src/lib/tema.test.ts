// O tema tem uma regra que não pode ser afrouxada por engano: ESCURO é o
// padrão. O painel no ar hoje é escuro, e qualquer valor estranho no cookie
// (adulterado, antigo, vazio) tem que cair nele — nunca no claro.

import { describe, expect, it } from "vitest";
import { TEMA_PADRAO, alternar, temaValido } from "./tema";

describe("temaValido", () => {
  it("o padrão é escuro", () => {
    expect(TEMA_PADRAO).toBe("escuro");
  });

  it("aceita os dois temas reais", () => {
    expect(temaValido("escuro")).toBe("escuro");
    expect(temaValido("claro")).toBe("claro");
  });

  it("cookie ausente, vazio ou lixo cai no escuro", () => {
    for (const v of [undefined, null, "", "light", "dark", "CLARO", "0", "{}"]) {
      expect(temaValido(v), `valor ${JSON.stringify(v)} não podia virar tema`).toBe("escuro");
    }
  });
});

describe("alternar", () => {
  it("troca de um para o outro", () => {
    expect(alternar("escuro")).toBe("claro");
    expect(alternar("claro")).toBe("escuro");
  });

  it("alternar duas vezes volta ao início", () => {
    expect(alternar(alternar("escuro"))).toBe("escuro");
    expect(alternar(alternar("claro"))).toBe("claro");
  });
});
