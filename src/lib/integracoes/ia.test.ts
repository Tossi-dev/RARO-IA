import { afterEach, describe, expect, it, vi } from "vitest";

import { gerarTexto, iaConfigurada } from "./ia";

const chaveOriginal = process.env.ANTHROPIC_API_KEY;

afterEach(() => {
  if (chaveOriginal === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = chaveOriginal;
  vi.restoreAllMocks();
});

describe("IA — caminho local seguro", () => {
  it("usa resposta demo e não transmite o prompt quando não há chave", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const resultado = await gerarTexto("crie uma copy para uma campanha sintética");

    expect(iaConfigurada()).toBe(false);
    expect(resultado.provider).toBe("demo");
    expect(resultado.texto).toContain("COPY SUGERIDA (demo)");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
