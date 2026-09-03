import { afterEach, describe, expect, it, vi } from "vitest";
const { gerarTextoMock, lerRespostaMock, criarSupabaseServerMock, contaUatMock } = vi.hoisted(() => ({ gerarTextoMock: vi.fn(), lerRespostaMock: vi.fn(), criarSupabaseServerMock: vi.fn(), contaUatMock: vi.fn(() => Promise.resolve(false)) }));
vi.mock("../integracoes/ia", () => ({ gerarTexto: gerarTextoMock }));
vi.mock("./analise-sessao", () => ({ montarPrompt: vi.fn(() => "prompt"), lerResposta: lerRespostaMock }));
vi.mock("../supabase/server", () => ({ criarSupabaseServer: criarSupabaseServerMock }));
vi.mock("../uat/isolamento", () => ({ contaUatSinteticaAtual: contaUatMock }));
import { analisarSessao } from "./acoes-analise";
function form() { const f = new FormData(); f.set("mentoradoId", "m-1"); f.set("sessaoId", "s-1"); f.set("nome", "Ana"); f.set("resumo", "Sessão"); return f; }
afterEach(() => vi.resetAllMocks());
describe("analisarSessao", () => {
  it("não chama IA para conta audit.invalid", async () => {
    contaUatMock.mockResolvedValue(true);
    await analisarSessao(form());
    expect(gerarTextoMock).not.toHaveBeenCalled();
    expect(criarSupabaseServerMock).not.toHaveBeenCalled();
  });
  it.each([{ provider: "demo", texto: "demo" }, { provider: "anthropic", texto: "ruim" }])("não grava com provider demo ou resposta inválida: %j", async (resposta) => {
    gerarTextoMock.mockResolvedValue(resposta); lerRespostaMock.mockReturnValue(null); const insert = vi.fn(); criarSupabaseServerMock.mockReturnValue({ from: vi.fn(() => ({ insert })) });
    await analisarSessao(form()); expect(insert).not.toHaveBeenCalled();
  });
  it("grava análise válida com proveniência do usuário autenticado", async () => {
    gerarTextoMock.mockResolvedValue({ provider: "anthropic", texto: "ok" }); lerRespostaMock.mockReturnValue({ pontosFortes: ["x"], riscos: ["y"], recomendacoes: ["z"] }); const insert = vi.fn(() => Promise.resolve({ error: null })); criarSupabaseServerMock.mockReturnValue({ auth: { getUser: vi.fn(() => Promise.resolve({ data: { user: { id: "u-1" } } })) }, from: vi.fn(() => ({ insert })) });
    await analisarSessao(form()); expect(insert).toHaveBeenCalledWith(expect.objectContaining({ mentorado_id: "m-1", sessao_id: "s-1", gerada_por: "u-1", modelo: "anthropic" }));
  });
  it("não grava análise válida sem usuário autenticado", async () => {
    gerarTextoMock.mockResolvedValue({ provider: "anthropic", texto: "ok" }); lerRespostaMock.mockReturnValue({ pontosFortes: ["x"], riscos: ["y"], recomendacoes: ["z"] }); const insert = vi.fn(); criarSupabaseServerMock.mockReturnValue({ auth: { getUser: vi.fn(() => Promise.resolve({ data: { user: null } })) }, from: vi.fn(() => ({ insert })) });
    await analisarSessao(form()); expect(insert).not.toHaveBeenCalled();
  });
});
