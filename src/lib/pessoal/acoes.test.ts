import { afterEach, describe, expect, it, vi } from "vitest";

const { criarSupabaseServerMock, redirectMock, revalidatePathMock, supabaseConfiguradoMock } = vi.hoisted(() => ({
  criarSupabaseServerMock: vi.fn(),
  redirectMock: vi.fn(),
  revalidatePathMock: vi.fn(),
  supabaseConfiguradoMock: vi.fn(() => false),
}));

vi.mock("../supabase/server", () => ({ criarSupabaseServer: criarSupabaseServerMock }));
vi.mock("../data", () => ({ supabaseConfigurado: supabaseConfiguradoMock }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));

import { registrarInvestimento, registrarPatrimonio } from "./acoes";

function form(campos: Record<string, string>): FormData {
  const resultado = new FormData();
  for (const [chave, valor] of Object.entries(campos)) resultado.set(chave, valor);
  return resultado;
}

function cliente() {
  const insert = vi.fn(() => Promise.resolve({ error: null }));
  const from = vi.fn(() => ({ insert }));
  criarSupabaseServerMock.mockReturnValue({ from });
  return { from, insert };
}

afterEach(() => vi.resetAllMocks());

describe("ações de finanças pessoais", () => {
  it("sem configuração falha fechada antes de consultar", async () => {
    await registrarPatrimonio(form({ nome: "Reserva", classe: "reserva", valor: "100" }));
    expect(criarSupabaseServerMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("registra patrimônio somente com classe explícita e valor não negativo", async () => {
    supabaseConfiguradoMock.mockReturnValue(true);
    const c = cliente();
    await registrarPatrimonio(form({ nome: "Reserva", classe: "reserva", valor: "100.25" }));
    expect(c.from).toHaveBeenCalledWith("patrimonio");
    expect(c.insert).toHaveBeenCalledWith({ nome: "Reserva", classe: "reserva", valor: 100.25 });
    expect(revalidatePathMock).toHaveBeenCalledWith("/pessoal");
  });

  it("recusa investimento incompleto antes de escrever", async () => {
    supabaseConfiguradoMock.mockReturnValue(true);
    const c = cliente();
    await registrarInvestimento(form({ nome: "Tesouro", aportado: "", valorAtual: "120" }));
    expect(c.from).not.toHaveBeenCalled();
    expect(redirectMock).toHaveBeenCalled();
  });
});
