import { afterEach, describe, expect, it, vi } from "vitest";

const { criarSupabaseServerMock } = vi.hoisted(() => ({
  criarSupabaseServerMock: vi.fn(),
}));

vi.mock("../supabase/server", () => ({ criarSupabaseServer: criarSupabaseServerMock }));

const { vincularAudioDaSessao, MOTIVO_CONSENTIMENTO_NAO_CONFIRMADO } = await import("./acoes-transcricao-arquivo");

type Resposta = { data: unknown; error: { code?: string } | null };

function cliente(respostas: Record<string, Resposta> = {}) {
  const chamadas: Array<{ tabela: string; valores: Record<string, unknown> }> = [];
  const upload = vi.fn<(caminho: string, arquivo: Blob, opcoes: { contentType: string; upsert: boolean }) => Promise<{ data: { path: string }; error: null }>>(
    () => Promise.resolve({ data: { path: "ok" }, error: null }),
  );
  const remove = vi.fn(() => Promise.resolve({ data: [], error: null }));
  const from = vi.fn((tabela: string) => ({
    select: () => {
      const cadeia = {
        eq: () => cadeia,
        maybeSingle: () => Promise.resolve(respostas[tabela] ?? { data: null, error: null }),
      };
      return cadeia;
    },
    upsert: (valores: Record<string, unknown>) => {
      chamadas.push({ tabela, valores });
      return Promise.resolve({ data: null, error: null });
    },
    insert: (valores: Record<string, unknown>) => {
      chamadas.push({ tabela, valores });
      return Promise.resolve({ data: null, error: null });
    },
  }));
  return { from, storage: { from: vi.fn(() => ({ upload, remove })) }, chamadas, upload, remove };
}

function formulario(campos: Record<string, string | File> = {}): FormData {
  const dados = new FormData();
  dados.set("sessaoId", "ses-1");
  dados.set("confirmarConsentimento", "1");
  dados.set("arquivo", new File(["audio"], "sessao.mp3", { type: "audio/mpeg" }));
  for (const [chave, valor] of Object.entries(campos)) dados.set(chave, valor);
  return dados;
}

afterEach(() => vi.resetAllMocks());

describe("vincularAudioDaSessao", () => {
  it("não recebe nem envia arquivo sem a confirmação explícita da sessão", async () => {
    const s = cliente();
    criarSupabaseServerMock.mockReturnValue(s);

    const resultado = await vincularAudioDaSessao(formulario({ confirmarConsentimento: "" }));

    expect(resultado).toEqual({ ok: false, erro: MOTIVO_CONSENTIMENTO_NAO_CONFIRMADO });
    expect(criarSupabaseServerMock).not.toHaveBeenCalled();
    expect(s.upload).not.toHaveBeenCalled();
  });

  it("deriva workspace e mentorado da sessão acessível, nunca dos campos do formulário", async () => {
    const s = cliente({
      sessao: { data: { id: "ses-1", workspace_id: "ws-1", matricula_id: "mat-1" }, error: null },
      matricula: { data: { id: "mat-1", mentorado_id: "ment-1" }, error: null },
    });
    criarSupabaseServerMock.mockReturnValue(s);

    const resultado = await vincularAudioDaSessao(formulario({ mentoradoId: "ment-forjado", workspaceId: "ws-forjado" }));

    expect(resultado).toEqual({ ok: true });
    expect(s.upload).toHaveBeenCalledTimes(1);
    const caminho = String(s.upload.mock.calls[0][0]);
    expect(caminho).toMatch(/^ws-1\/sessao\/ses-1\//);
    expect(s.chamadas).toContainEqual(expect.objectContaining({
      tabela: "sessao_transcricao_consentimento",
      valores: expect.objectContaining({ workspace_id: "ws-1", mentorado_id: "ment-1", sessao_id: "ses-1", consentido: true }),
    }));
    expect(s.chamadas).toContainEqual(expect.objectContaining({
      tabela: "sessao_transcricao_arquivo",
      valores: expect.objectContaining({ workspace_id: "ws-1", mentorado_id: "ment-1", sessao_id: "ses-1", bytes: 5 }),
    }));
  });

  it("sem sessão acessível não envia nem registra referência", async () => {
    const s = cliente({ sessao: { data: null, error: null } });
    criarSupabaseServerMock.mockReturnValue(s);

    const resultado = await vincularAudioDaSessao(formulario());

    expect(resultado.ok).toBe(false);
    expect(s.upload).not.toHaveBeenCalled();
    expect(s.chamadas).toEqual([]);
  });

  it("não substitui silenciosamente uma referência existente nem cria objeto órfão", async () => {
    const s = cliente({
      sessao: { data: { id: "ses-1", workspace_id: "ws-1", matricula_id: "mat-1" }, error: null },
      matricula: { data: { id: "mat-1", mentorado_id: "ment-1" }, error: null },
      sessao_transcricao_arquivo: { data: { caminho_storage: "ws-1/sessao/ses-1/anterior.mp3" }, error: null },
    });
    criarSupabaseServerMock.mockReturnValue(s);

    const resultado = await vincularAudioDaSessao(formulario());

    expect(resultado.ok).toBe(false);
    expect(s.upload).not.toHaveBeenCalled();
  });
});
