import { afterEach, describe, expect, it, vi } from "vitest";

const { criarSupabaseServerMock } = vi.hoisted(() => ({ criarSupabaseServerMock: vi.fn() }));
vi.mock("../supabase/server", () => ({ criarSupabaseServer: criarSupabaseServerMock }));

const { enviarMensagemDaGestao, enviarMensagemDoMentorado } = await import("./acoes-mensagem");

function cliente(opcoes: { mentorado?: unknown; mentoradoErro?: unknown; mentoradoAtual?: unknown; rpcErro?: unknown } = {}) {
  const inserts: Array<{ tabela: string; valores: Record<string, unknown> }> = [];
  const from = vi.fn((tabela: string) => ({
    select: () => {
      const cadeia = { eq: () => cadeia, maybeSingle: () => Promise.resolve({ data: opcoes.mentorado ?? null, error: opcoes.mentoradoErro ?? null }) };
      return cadeia;
    },
    insert: (valores: Record<string, unknown>) => {
      inserts.push({ tabela, valores });
      return Promise.resolve({ data: null, error: null });
    },
  }));
  const rpc = vi.fn(() => Promise.resolve({ data: opcoes.mentoradoAtual ?? null, error: opcoes.rpcErro ?? null }));
  return { from, rpc, inserts };
}

function formulario(campos: Record<string, string> = {}): FormData {
  const dados = new FormData();
  for (const [chave, valor] of Object.entries(campos)) dados.set(chave, valor);
  return dados;
}

afterEach(() => vi.resetAllMocks());

describe("conversa privada de mentoria", () => {
  it("a gestão deriva workspace e destinatário da linha acessível, ignorando campos forjados", async () => {
    const s = cliente({ mentorado: { id: "ment-1", workspace_id: "ws-1" } });
    criarSupabaseServerMock.mockReturnValue(s);

    const resultado = await enviarMensagemDaGestao(formulario({ mentoradoId: "ment-1", texto: "Como você percebeu esse avanço?", workspaceId: "ws-forjado", autorId: "autor-forjado" }));

    expect(resultado).toEqual({ ok: true });
    expect(s.inserts).toEqual([{ tabela: "mensagem_mentoria", valores: {
      workspace_id: "ws-1", mentorado_id: "ment-1", direcao: "gestao_para_mentorado", texto: "Como você percebeu esse avanço?",
    }}]);
  });

  it("a gestão não escreve quando o mentorado não está acessível", async () => {
    const s = cliente();
    criarSupabaseServerMock.mockReturnValue(s);

    const resultado = await enviarMensagemDaGestao(formulario({ mentoradoId: "outro", texto: "x" }));

    expect(resultado.ok).toBe(false);
    expect(s.inserts).toEqual([]);
  });

  it("o mentorado deriva a própria identidade no servidor e não recebe destinatário do formulário", async () => {
    const s = cliente({ mentorado: { id: "ment-1", workspace_id: "ws-1" }, mentoradoAtual: "ment-1" });
    criarSupabaseServerMock.mockReturnValue(s);

    const resultado = await enviarMensagemDoMentorado(formulario({ texto: "Quero refletir mais sobre isso.", mentoradoId: "ment-forjado" }));

    expect(resultado).toEqual({ ok: true });
    expect(s.rpc).toHaveBeenCalledWith("mentorado_atual");
    expect(s.inserts).toEqual([{ tabela: "mensagem_mentoria", valores: {
      workspace_id: "ws-1", mentorado_id: "ment-1", direcao: "mentorado_para_gestao", texto: "Quero refletir mais sobre isso.",
    }}]);
  });
});
