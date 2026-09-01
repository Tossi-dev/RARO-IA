import { afterEach, describe, expect, it, vi } from "vitest";

const { enviarMentoradoMock, enviarGestaoMock, revalidatePathMock, redirectMock } = vi.hoisted(() => ({
  enviarMentoradoMock: vi.fn(),
  enviarGestaoMock: vi.fn(),
  revalidatePathMock: vi.fn(),
  redirectMock: vi.fn(),
}));

vi.mock("./acoes-mensagem", () => ({
  enviarMensagemDoMentorado: enviarMentoradoMock,
  enviarMensagemDaGestao: enviarGestaoMock,
}));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

const { enviarMensagemDoPortal, enviarMensagemDaFicha } = await import("./acoes-mensagem-form");

function formulario(campos: Record<string, string>): FormData {
  const dados = new FormData();
  for (const [chave, valor] of Object.entries(campos)) dados.set(chave, valor);
  return dados;
}

afterEach(() => vi.resetAllMocks());

describe("ações de formulário da conversa", () => {
  it("portal revalida a rota fixa após registrar a mensagem do próprio mentorado", async () => {
    enviarMentoradoMock.mockResolvedValue({ ok: true });

    await enviarMensagemDoPortal(formulario({ texto: "Vou testar esta pergunta." }));

    expect(enviarMentoradoMock).toHaveBeenCalledOnce();
    expect(revalidatePathMock).toHaveBeenCalledWith("/portal");
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("portal não expõe erro interno: redireciona apenas com código fechado", async () => {
    enviarMentoradoMock.mockResolvedValue({ ok: false, erro: "detalhe interno que não pode ir para a URL" });

    await enviarMensagemDoPortal(formulario({ texto: "x" }));

    expect(revalidatePathMock).not.toHaveBeenCalled();
    expect(redirectMock).toHaveBeenCalledWith("/portal?erro=mensagem");
  });

  it("ficha da gestão usa a ação privada e revalida a lista, sem endereço externo", async () => {
    enviarGestaoMock.mockResolvedValue({ ok: true });

    await enviarMensagemDaFicha(formulario({ mentoradoId: "ment-1", texto: "O que você percebeu?" }));

    expect(enviarGestaoMock).toHaveBeenCalledOnce();
    expect(revalidatePathMock).toHaveBeenCalledWith("/mentoria");
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
