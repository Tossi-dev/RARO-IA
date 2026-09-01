import { afterEach, describe, expect, it, vi } from "vitest";

const { criarSupabaseServerMock, redirectMock, revalidatePathMock } = vi.hoisted(() => ({
  criarSupabaseServerMock: vi.fn(),
  redirectMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}));

vi.mock("../supabase/server", () => ({ criarSupabaseServer: criarSupabaseServerMock }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));

const { gerarRecorrencia, darBaixaCobranca, cancelarCobranca, registrarContrato, alternarVisibilidadeContrato } = await import("./acoes-cobranca");

type Opcoes = { erroMovimento?: { code?: string } | null; erroCobranca?: { code?: string } | null; erroUpdate?: { code?: string } | null; erroRpc?: { code?: string } | null; documento?: unknown };
function cliente(opcoes: Opcoes = {}) {
  const insercoes: Record<string, unknown[]> = {};
  const tabelas = new Map<string, any>();
  const rpc = vi.fn(() => Promise.resolve({ data: "mov-1", error: opcoes.erroRpc ?? null }));
  const from = vi.fn((tabela: string) => {
    if (tabelas.has(tabela)) return tabelas.get(tabela);
    const insert = vi.fn((linha: unknown) => {
      insercoes[tabela] ??= [];
      insercoes[tabela].push(linha);
      if (tabela === "movimentos_caixa" && opcoes.erroMovimento) return Promise.resolve({ data: null, error: opcoes.erroMovimento });
      if (tabela === "cobranca" && opcoes.erroCobranca) return Promise.resolve({ data: null, error: opcoes.erroCobranca });
      if (tabela === "cobranca" && opcoes.erroUpdate) return Promise.resolve({ data: null, error: opcoes.erroUpdate });
      return Promise.resolve({ data: tabela === "movimentos_caixa" ? { id: "mov-1" } : null, error: null });
    });
    const deleteEq = vi.fn(() => Promise.resolve({ data: null, error: null }));
    const deleteMock = vi.fn(() => ({ eq: deleteEq }));
    const eq = vi.fn(() => ({ maybeSingle: vi.fn(() => Promise.resolve({ data: opcoes.documento ?? { categoria: "contrato", arquivado: false, caminho_storage: "workspace/contrato.pdf" }, error: null })), then: undefined }));
    const select = vi.fn(() => ({ eq }));
    const update = vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ data: null, error: opcoes.erroUpdate ?? null })) }));
    const tabelaMock = { insert, select, update, delete: deleteMock, deleteEq };
    tabelas.set(tabela, tabelaMock);
    return tabelaMock;
  });
  return { from, insercoes, rpc };
}
function fd(campos: Record<string, string>) { const f = new FormData(); for (const [k, v] of Object.entries(campos)) f.set(k, v); return f; }
function ligar(opcoes: Opcoes = {}) { const c = cliente(opcoes); criarSupabaseServerMock.mockReturnValue(c); return c; }

afterEach(() => vi.resetAllMocks());

describe("ações de cobrança", () => {
  it("baixa por RPC atômica com valor canônico da cobrança", async () => {
    const c = ligar();
    await darBaixaCobranca(fd({ cobrancaId: "c-1", pagoEm: "2026-08-20", forma: "pix", valor: "999999" }));
    expect(c.rpc).toHaveBeenCalledWith("baixar_cobranca_com_movimento", {
      p_cobranca_id: "c-1", p_pago_em: "2026-08-20", p_forma: "pix",
    });
    expect(c.from).not.toHaveBeenCalled();
  });

  it("usa a data civil de São Paulo ao barrar uma baixa que ainda é futura", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-20T02:30:00.000Z"));
    const c = ligar();
    await darBaixaCobranca(fd({ cobrancaId: "c-1", pagoEm: "2026-08-20", forma: "pix" }));
    expect(c.rpc).not.toHaveBeenCalled();
    expect(c.from).not.toHaveBeenCalled();
    expect(redirectMock).toHaveBeenCalledWith(expect.stringContaining("futuro"));
    vi.useRealTimers();
  });

  it("gera parcelas e trata conflito de duplicata como já existente", async () => {
    const c = ligar({ erroCobranca: { code: "23505" } });
    await gerarRecorrencia(fd({ matriculaId: "mat-1", mentoradoId: "ment-1", inicio: "2026-08-10", periodicidade: "mensal", quantidade: "2", valor: "100", diaVencimento: "10" }));
    expect(c.from).toHaveBeenCalledWith("cobranca");
    expect(c.insercoes.cobranca).toHaveLength(2);
    expect(redirectMock).not.toHaveBeenCalledWith(expect.stringContaining("erro"));
  });

  it("recusa baixa com data futura antes de escrever", async () => {
    const c = ligar();
    await darBaixaCobranca(fd({ cobrancaId: "c-1", pagoEm: "2999-01-01", forma: "pix" }));
    expect(c.from).not.toHaveBeenCalled();
  });

  it("não confirma baixa nem grava por fora quando a RPC falha", async () => {
    const c = ligar({ erroRpc: { code: "500" } });
    await darBaixaCobranca(fd({ cobrancaId: "c-1", pagoEm: "2026-08-20", forma: "pix" }));
    expect(c.rpc).toHaveBeenCalledTimes(1);
    expect(c.from).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("cancela por update e nunca por delete", async () => {
    const c = ligar();
    await cancelarCobranca(fd({ cobrancaId: "c-1" }));
    expect(c.from).toHaveBeenCalledWith("cobranca");
    expect(c.from("cobranca").delete).not.toHaveBeenCalled();
  });

  it("recusa documento que não é contrato", async () => {
    const c = ligar({ documento: { categoria: "material" } });
    await registrarContrato(fd({ mentoradoId: "ment-1", documentoId: "doc-1", valorTotal: "100" }));
    expect(c.from).not.toHaveBeenCalledWith("contrato");
  });

  it.each([
    { arquivado: true, caminho_storage: "workspace/contrato.pdf" },
    { arquivado: false, caminho_storage: "" },
  ])("recusa contrato arquivado ou sem envio: %j", async (documento) => {
    const c = ligar({ documento: { categoria: "contrato", ...documento } });
    await registrarContrato(fd({ mentoradoId: "ment-1", documentoId: "doc-1", valorTotal: "100" }));
    expect(c.from).not.toHaveBeenCalledWith("contrato");
  });

  it("publica o contrato somente por ato explícito e nunca apaga a linha", async () => {
    const c = ligar();
    await alternarVisibilidadeContrato(fd({ contratoId: "contrato-1", visivel: "on" }));
    expect(c.from).toHaveBeenCalledWith("contrato");
    expect(c.from("contrato").update).toHaveBeenCalledWith({ visivel_portal: true });
    expect(c.from("contrato").delete).not.toHaveBeenCalled();
    expect(revalidatePathMock).toHaveBeenCalledWith("/financeiro");
  });
});
