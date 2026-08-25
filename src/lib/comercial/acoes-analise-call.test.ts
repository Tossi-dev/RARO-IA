import { afterEach, describe, expect, it, vi } from "vitest";

const { gerarTextoMock, lerRespostaMock, montarPromptMock, criarSupabaseServerMock, transcreverAudioMock } = vi.hoisted(() => ({
  gerarTextoMock: vi.fn(),
  lerRespostaMock: vi.fn(),
  montarPromptMock: vi.fn(() => "prompt"),
  criarSupabaseServerMock: vi.fn(),
  transcreverAudioMock: vi.fn(),
}));

vi.mock("../integracoes/ia", () => ({ gerarTexto: gerarTextoMock }));
vi.mock("./analise-call", () => ({ lerResposta: lerRespostaMock, montarPrompt: montarPromptMock }));
vi.mock("../supabase/server", () => ({ criarSupabaseServer: criarSupabaseServerMock }));
vi.mock("../integracoes/stt", () => ({ transcreverAudio: transcreverAudioMock }));

import { analisarCall } from "./acoes-analise-call";

const OPORTUNIDADE = "11111111-1111-4111-8111-111111111111";
function form(transcricao = "Conversa da call") { const f = new FormData(); f.set("oportunidadeId", OPORTUNIDADE); f.set("transcricao", transcricao); return f; }
afterEach(() => vi.resetAllMocks());

describe("analisarCall", () => {
  it("recusa transcrição vazia antes de chamar IA ou banco", async () => {
    await analisarCall(form("   "));
    expect(gerarTextoMock).not.toHaveBeenCalled();
    expect(criarSupabaseServerMock).not.toHaveBeenCalled();
  });

  it.each([{ provider: "demo", texto: "demo" }, { provider: "anthropic", texto: "inválido" }])("não grava provider demo ou parser inválido: %j", async (resposta) => {
    gerarTextoMock.mockResolvedValue(resposta); lerRespostaMock.mockReturnValue(null);
    await analisarCall(form());
    expect(criarSupabaseServerMock).not.toHaveBeenCalled();
  });

  it("grava resposta válida com autoria do usuário autenticado", async () => {
    gerarTextoMock.mockResolvedValue({ provider: "anthropic", texto: "ok" });
    lerRespostaMock.mockReturnValue({ score: 72, objecoes: ["prazo"], sugestoes: ["retomar"], parcial: false });
    const insert = vi.fn(() => Promise.resolve({ error: null }));
    criarSupabaseServerMock.mockReturnValue({ auth: { getUser: vi.fn(() => Promise.resolve({ data: { user: { id: "u-1" } } })) }, from: vi.fn(() => ({ insert })) });
    await analisarCall(form());
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ oportunidade_id: OPORTUNIDADE, score: 72, modelo: "anthropic", gerada_por: "u-1", transcricao: "Conversa da call" }));
  });
});
