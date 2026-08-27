import { afterEach, describe, expect, it, vi } from "vitest";

const { criarSupabaseServerMock, revalidatePathMock } = vi.hoisted(() => ({
  criarSupabaseServerMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}));

vi.mock("../supabase/server", () => ({ criarSupabaseServer: criarSupabaseServerMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));

const { registrarReflexaoAtendimento } = await import("./acoes-atendimento");

const CLIENTE = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

function formulario(campos: Record<string, string>) {
  const form = new FormData();
  for (const [chave, valor] of Object.entries(campos)) form.set(chave, valor);
  return form;
}

function cliente(erro: { code?: string } | null = null) {
  const insert = vi.fn(() => Promise.resolve({ error: erro }));
  criarSupabaseServerMock.mockReturnValue({ from: vi.fn(() => ({ insert })) });
  return insert;
}

afterEach(() => vi.clearAllMocks());

describe("registrarReflexaoAtendimento", () => {
  it("ignora workspace_id do formulário e deixa o banco decidir o escopo", async () => {
    const insert = cliente();
    const resultado = await registrarReflexaoAtendimento(formulario({
      mentoradoId: CLIENTE,
      texto: "Percebi uma alternativa que faz sentido para mim.",
      origem: "cliente",
      visibilidade: "privada_profissional",
      workspace_id: "workspace-de-outro-cliente",
    }));

    expect(resultado).toEqual({ ok: true });
    expect(insert).toHaveBeenCalledWith({
      mentorado_id: CLIENTE,
      texto: "Percebi uma alternativa que faz sentido para mim.",
      origem: "cliente",
      visibilidade: "privada_profissional",
    });
    expect(revalidatePathMock).toHaveBeenCalledWith(`/mentoria/${CLIENTE}`);
  });

  it("recusa texto vazio antes de escrever", async () => {
    const insert = cliente();
    const resultado = await registrarReflexaoAtendimento(formulario({ mentoradoId: CLIENTE, texto: "", origem: "cliente", visibilidade: "compartilhavel" }));
    expect(resultado.ok).toBe(false);
    expect(insert).not.toHaveBeenCalled();
  });

  it("transforma erro do banco em mensagem genérica e não revalida", async () => {
    const insert = cliente({ code: "42501" });
    const resultado = await registrarReflexaoAtendimento(formulario({ mentoradoId: CLIENTE, texto: "texto", origem: "profissional", visibilidade: "privada_profissional" }));
    expect(resultado).toEqual({ ok: false, erro: "Não foi possível salvar agora. Tente novamente em instantes." });
    expect(insert).toHaveBeenCalledTimes(1);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});
