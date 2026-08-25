import { beforeEach, describe, expect, it, vi } from "vitest";

const { from, criarSupabaseServerMock, supabaseConfiguradoMock } = vi.hoisted(() => {
  const from = vi.fn();
  return {
    from,
    criarSupabaseServerMock: vi.fn(() => ({ from })),
    supabaseConfiguradoMock: vi.fn(() => false),
  };
});

vi.mock("server-only", () => ({}));
vi.mock("../supabase/server", () => ({ criarSupabaseServer: criarSupabaseServerMock }));
vi.mock("../data", () => ({ supabaseConfigurado: supabaseConfiguradoMock }));

import { lerCobrancas, lerContratos, lerIndicadoresRecorrencia } from "./dados-cobranca";

describe("dados de cobrança", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabaseConfiguradoMock.mockReturnValue(false);
  });

  it("sem Supabase não consulta e devolve uma leitura desconectada", async () => {
    await expect(lerCobrancas()).resolves.toMatchObject({ conectado: false, cobrancas: [], parcial: false });
    await expect(lerContratos()).resolves.toMatchObject({ conectado: false, contratos: [], parcial: false });
    expect(from).not.toHaveBeenCalled();
  });

  it("mapeia cobranças e contratos sem expor a linha crua", async () => {
    supabaseConfiguradoMock.mockReturnValue(true);
    from.mockImplementation((nome: string) => {
      const dados = nome === "cobranca"
        ? [{ id: "c1", mentorado_id: "m1", matricula_id: null, competencia: "2026-08-01", vencimento: "2026-08-10", valor: "100.50", status: "paga", pago_em: "2026-08-10", forma: "pix", movimento_id: null, observacao: "interna", criado_em: "2026-07-01T00:00:00Z" }]
        : [{ id: "ct1", mentorado_id: "m1", matricula_id: null, documento_id: null, assinado_em: "2026-07-01", vigencia_inicio: "2026-07-01", vigencia_fim: null, valor_total: "1200.00", status: "assinado", criado_em: "2026-07-01T00:00:00Z" }];
      const q = { select: vi.fn(() => q), order: vi.fn(() => Promise.resolve({ data: dados, error: null })) };
      return q;
    });
    const cobrancas = await lerCobrancas();
    const contratos = await lerContratos();
    expect(cobrancas.cobrancas[0]).toMatchObject({ id: "c1", mentoradoId: "m1", valor: 100.5, valorCentavos: 10050, status: "paga" });
    expect(contratos.contratos[0]).toMatchObject({ id: "ct1", mentoradoId: "m1", valorTotal: 1200, valorTotalCentavos: 120000 });
    expect(cobrancas.cobrancas[0]).not.toHaveProperty("observacao");
  });

  it("aplica todos os filtros de cobrança na consulta", async () => {
    supabaseConfiguradoMock.mockReturnValue(true);
    const q = {
      select: vi.fn(() => q), order: vi.fn(() => q), eq: vi.fn(() => q), limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
      then: (resolver: (resultado: { data: unknown[]; error: null }) => unknown) => Promise.resolve({ data: [], error: null }).then(resolver),
    };
    from.mockReturnValue(q);
    await lerCobrancas({ status: "paga", mentoradoId: "m1", matriculaId: "mat1", competencia: "2026-08-01" });
    expect(q.eq).toHaveBeenCalledWith("status", "paga");
    expect(q.eq).toHaveBeenCalledWith("mentorado_id", "m1");
    expect(q.eq).toHaveBeenCalledWith("matricula_id", "mat1");
    expect(q.eq).toHaveBeenCalledWith("competencia", "2026-08-01");
  });

  it("leitura parcial não calcula MRR nem régua e explica sem nome de tabela", async () => {
    supabaseConfiguradoMock.mockReturnValue(true);
    from.mockImplementation((nome: string) => {
      const q = { select: vi.fn(() => q), order: vi.fn(() => Promise.resolve({ data: nome === "cobranca" ? [{ id: "c1", vencimento: "2026-08-10", competencia: "2026-08-01", valor: 100, status: "paga" }] : [], error: nome === "cobranca" ? null : { code: "42P01" } })) };
      return q;
    });
    const resultado = await lerIndicadoresRecorrencia("2026-08-10");
    expect(resultado.parcial).toBe(true);
    expect(resultado.mrr).toBeNull();
    expect(resultado.regua).toBeNull();
    expect(resultado.motivo).not.toMatch(/cobranca|contrato|tabela|42P01/i);
  });

  it("sinaliza leitura limitada para que a régua não use a lista truncada", async () => {
    supabaseConfiguradoMock.mockReturnValue(true);
    from.mockImplementation(() => {
      const q = { select: vi.fn(() => q), order: vi.fn(() => q), limit: vi.fn(() => Promise.resolve({ data: [{ id: "c1" }], error: null })) };
      return q;
    });
    const resultado = await lerCobrancas({ limite: 1 });
    expect(resultado.limitado).toBe(true);
    expect(resultado.parcial).toBe(true);
  });

  it("omite indicadores quando a leitura pedida para eles está limitada", async () => {
    supabaseConfiguradoMock.mockReturnValue(true);
    from.mockImplementation((nome: string) => {
      const q = {
        select: vi.fn(() => q), order: vi.fn(() => q), limit: vi.fn(() => Promise.resolve({ data: [{ id: nome }], error: null })),
        then: (resolver: (resultado: { data: unknown[]; error: null }) => unknown) => Promise.resolve({ data: [{ id: nome }], error: null }).then(resolver),
      };
      return q;
    });
    const resultado = await lerIndicadoresRecorrencia("2026-08-10", { limite: 1 });
    expect(resultado).toMatchObject({ parcial: true, mrr: null, arr: null, regua: null, reguaLimitada: true });
  });
});
