import { describe, expect, it } from "vitest";
import { podeRegistrar, revogarConsentimento } from "./consentimento";
import { podeExibirParaCliente } from "./visibilidade-atendimento";

describe("consentimento", () => {
  const consentimentos = { mapa: true, reflexao: true, meta: true, transcricao: false, portal: true };

  it("permite somente categorias consentidas", () => {
    expect(podeRegistrar("mapa", consentimentos)).toBe(true);
    expect(podeRegistrar("transcricao", consentimentos)).toBe(false);
    expect(podeRegistrar("invalido", consentimentos)).toBe(false);
  });

  it("revoga sem mutar o consentimento original", () => {
    const revogado = revogarConsentimento(consentimentos, "reflexao");
    expect(revogado).toEqual({ ...consentimentos, reflexao: false });
    expect(consentimentos.reflexao).toBe(true);
  });

  it("só projeta conteúdo compartilhável quando portal foi consentido", () => {
    expect(podeExibirParaCliente("privada_profissional", consentimentos)).toBe(false);
    expect(podeExibirParaCliente("compartilhavel", consentimentos)).toBe(true);
    expect(podeExibirParaCliente("compartilhavel", { ...consentimentos, portal: false })).toBe(false);
  });
});
