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

import { lerDadosPessoais } from "./dados";

describe("dados pessoais", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabaseConfiguradoMock.mockReturnValue(false);
  });

  it("falha fechada sem Supabase e não consulta nada", async () => {
    await expect(lerDadosPessoais()).resolves.toMatchObject({ conectado: false, parcial: false, itens: [], investimentos: [] });
    expect(from).not.toHaveBeenCalled();
  });

  it("mapeia apenas campos explícitos e não transforma legado desconhecido em zero", async () => {
    supabaseConfiguradoMock.mockReturnValue(true);
    from.mockImplementation((tabela: string) => {
      const data = tabela === "patrimonio"
        ? [{ classe: "reserva", valor: "150.25" }, { classe: null, valor: "99" }]
        : [{ nome: "Tesouro", aportado: "100", valor_atual: "120" }, { nome: "Legado", aportado: null, valor_atual: null }];
      const q = { select: vi.fn(() => q), order: vi.fn(() => Promise.resolve({ data, error: null })) };
      return q;
    });

    const leitura = await lerDadosPessoais();

    expect(leitura).toMatchObject({ conectado: true, parcial: true, itens: [{ classe: "reserva", valor: 150.25 }], investimentos: [{ nome: "Tesouro", aportado: 100, valorAtual: 120 }] });
    expect(leitura.resumo.total).toBe(270.25);
    expect(leitura.motivo).not.toMatch(/patrimonio|investimento|tabela/i);
  });
});
