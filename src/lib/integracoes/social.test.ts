import { afterEach, describe, expect, it, vi } from "vitest";

import { algumaRedeConfigurada, sincronizarRedes } from "./social";

const ambienteOriginal = {
  meta: process.env.META_ACCESS_TOKEN,
  instagram: process.env.IG_USER_ID,
  tiktok: process.env.TIKTOK_ACCESS_TOKEN,
};

afterEach(() => {
  for (const [chave, valor] of Object.entries({
    META_ACCESS_TOKEN: ambienteOriginal.meta,
    IG_USER_ID: ambienteOriginal.instagram,
    TIKTOK_ACCESS_TOKEN: ambienteOriginal.tiktok,
  })) {
    if (valor === undefined) delete process.env[chave];
    else process.env[chave] = valor;
  }
  vi.restoreAllMocks();
});

describe("Redes sociais — caminho local seguro", () => {
  it("não consulta Meta ou TikTok sem tokens configurados", async () => {
    delete process.env.META_ACCESS_TOKEN;
    delete process.env.IG_USER_ID;
    delete process.env.TIKTOK_ACCESS_TOKEN;
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const resultado = await sincronizarRedes();

    expect(algumaRedeConfigurada()).toBe(false);
    expect(resultado.provider).toBe("demo");
    expect(resultado.conteudos).toEqual([]);
    expect(resultado.avisos[0]).toContain("Nenhum token configurado");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
