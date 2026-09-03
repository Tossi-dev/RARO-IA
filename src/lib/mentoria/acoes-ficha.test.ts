// Testes dos dois invólucros de formulário da ficha.
//
// O QUE PROVAM: (1) o invólucro repassa o MESMO formData, sem acrescentar nem
// tirar campo — se ele mexesse na entrada, a validação da ação de dentro
// passaria a julgar outra coisa; (2) sucesso não redireciona; (3) falha volta
// para a ficha do mentorado certo, com o motivo da ação de dentro, sem
// reescrevê-lo; (4) sem `mentoradoId` a volta é para a carteira, nunca para
// uma URL quebrada.

import { beforeEach, describe, expect, it, vi } from "vitest";

const sincronizarMock = vi.fn();
const transcreverMock = vi.fn();
const vincularAudioMock = vi.fn();
const revogarAudioMock = vi.fn();
const transcricaoManualMock = vi.fn();
const redirectMock = vi.fn((destino: string) => {
  throw new Error(`REDIRECT:${destino}`);
});

vi.mock("./acoes-calendario", () => ({ sincronizarSessaoNaAgenda: sincronizarMock }));
vi.mock("./acoes-transcricao", () => ({ transcreverSessao: transcreverMock }));
vi.mock("./acoes-transcricao-arquivo", () => ({ vincularAudioDaSessao: vincularAudioMock, revogarAudioDaSessao: revogarAudioMock }));
vi.mock("./acoes-transcricao-manual", () => ({ registrarTranscricaoManual: transcricaoManualMock }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

const { sincronizarSessaoDaFicha, transcreverSessaoDaFicha, vincularAudioDaFicha, revogarAudioDaFicha } = await import("./acoes-ficha");

function formulario(campos: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
}

async function destinoDoRedirect(promessa: Promise<unknown>): Promise<string> {
  try {
    await promessa;
    return "";
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    return m.startsWith("REDIRECT:") ? m.slice("REDIRECT:".length) : "";
  }
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("sincronizarSessaoDaFicha", () => {
  it("repassa o formData inteiro e nao redireciona quando deu certo", async () => {
    sincronizarMock.mockResolvedValue({ ok: true });
    const f = formulario({ mentoradoId: "ment-1", sessaoId: "ses-1" });

    await sincronizarSessaoDaFicha(f);

    expect(sincronizarMock).toHaveBeenCalledWith(f);
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("volta para a ficha com o motivo da acao de dentro, sem reescrever", async () => {
    sincronizarMock.mockResolvedValue({ ok: false, erro: "A agenda do Google nao esta conectada." });

    const destino = await destinoDoRedirect(
      sincronizarSessaoDaFicha(formulario({ mentoradoId: "ment-7", sessaoId: "ses-1" })),
    );

    expect(destino).toBe(`/mentoria/ment-7?erro=${encodeURIComponent("A agenda do Google nao esta conectada.")}`);
  });

  it("sem mentoradoId volta para a carteira, nunca para uma URL quebrada", async () => {
    sincronizarMock.mockResolvedValue({ ok: false, erro: "x" });

    const destino = await destinoDoRedirect(sincronizarSessaoDaFicha(formulario({ sessaoId: "ses-1" })));

    expect(destino.startsWith("/mentoria?erro=")).toBe(true);
  });
});

describe("transcreverSessaoDaFicha", () => {
  it("repassa a transcricao manual e nao redireciona quando deu certo", async () => {
    transcricaoManualMock.mockResolvedValue({ ok: true, caracteres: 120 });
    const f = formulario({ mentoradoId: "ment-1", sessaoId: "ses-1", texto: "Registro manual", visibilidade: "privada_profissional" });

    await transcreverSessaoDaFicha(f);

    expect(transcricaoManualMock).toHaveBeenCalledWith(f);
    expect(transcreverMock).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("volta com o motivo de 'ja transcrita' em vez de um erro generico", async () => {
    transcricaoManualMock.mockResolvedValue({ ok: false, erro: "Esta sessao ja tem transcricao." });

    const destino = await destinoDoRedirect(
      transcreverSessaoDaFicha(formulario({ mentoradoId: "ment-2", sessaoId: "ses-9", texto: "Registro manual" })),
    );

    expect(destino).toContain(encodeURIComponent("Esta sessao ja tem transcricao."));
  });

  // O texto transcrito nunca volta pela URL: URL vai para histórico do
  // navegador, para log de servidor e para o Referer da próxima requisição.
  it("nunca coloca o texto transcrito na URL de volta", async () => {
    transcricaoManualMock.mockResolvedValue({ ok: false, erro: "Falhou.", texto: "MARCADOR-DA-CONVERSA" });

    const destino = await destinoDoRedirect(
      transcreverSessaoDaFicha(formulario({ mentoradoId: "ment-2", sessaoId: "ses-9", texto: "Registro manual" })),
    );

    expect(destino).not.toContain("MARCADOR");
  });

  it("não trata arquivo como transcrição: só o vínculo privado recebe o upload", async () => {
    vincularAudioMock.mockResolvedValue({ ok: true });
    const f = formulario({ mentoradoId: "ment-2", sessaoId: "ses-9" });
    f.set("arquivo", new Blob(["audio"], { type: "audio/mpeg" }));

    await vincularAudioDaFicha(f);

    expect(transcricaoManualMock).not.toHaveBeenCalled();
    expect(transcreverMock).not.toHaveBeenCalled();
    expect(vincularAudioMock).toHaveBeenCalledWith(f);
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("repassa a revogação e preserva o motivo de falha", async () => {
    revogarAudioMock.mockResolvedValue({ ok: false, erro: "Não foi possível revogar." });
    const f = formulario({ mentoradoId: "ment-2", sessaoId: "ses-9" });

    const destino = await destinoDoRedirect(revogarAudioDaFicha(f));

    expect(revogarAudioMock).toHaveBeenCalledWith(f);
    expect(destino).toBe(`/mentoria/ment-2?erro=${encodeURIComponent("Não foi possível revogar.")}`);
  });
});
