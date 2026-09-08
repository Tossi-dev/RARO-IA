import { afterEach, describe, expect, it, vi } from "vitest";

import { sttConfigurado, transcreverAudio } from "./stt";

const chaveOriginal = process.env.GROQ_API_KEY;

afterEach(() => {
  if (chaveOriginal === undefined) delete process.env.GROQ_API_KEY;
  else process.env.GROQ_API_KEY = chaveOriginal;
  vi.restoreAllMocks();
});

describe("STT — caminho local seguro", () => {
  it("fica em demonstração e não envia áudio quando a chave não está configurada", async () => {
    delete process.env.GROQ_API_KEY;
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const resultado = await transcreverAudio(new Blob(["audio-sintetico"], { type: "audio/mpeg" }), "teste.mp3");

    expect(sttConfigurado()).toBe(false);
    expect(resultado.provider).toBe("demo");
    expect(resultado.texto).toContain("TRANSCRIÇÃO DEMO");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
