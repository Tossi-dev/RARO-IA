import { afterEach, describe, expect, it, vi } from "vitest";

const { criarSupabaseServerMock, supabaseConfiguradoMock } = vi.hoisted(() => ({
  criarSupabaseServerMock: vi.fn(),
  supabaseConfiguradoMock: vi.fn(() => true),
}));

vi.mock("../supabase/server", () => ({ criarSupabaseServer: criarSupabaseServerMock }));
vi.mock("../data", () => ({ supabaseConfigurado: supabaseConfiguradoMock }));
vi.mock("server-only", () => ({}));

const { lerAtendimento } = await import("./dados-atendimento");

function cliente(respostas: Record<string, { data: unknown; error: unknown }>) {
  const consultas: Array<{ tabela: string; eq: Array<[string, unknown]> }> = [];
  criarSupabaseServerMock.mockReturnValue({
    from(tabela: string) {
      const consulta = { tabela, eq: [] as Array<[string, unknown]> };
      consultas.push(consulta);
      const resposta = respostas[tabela] ?? { data: [], error: null };
      const builder = {
        select: () => builder,
        eq: (campo: string, valor: unknown) => { consulta.eq.push([campo, valor]); return builder; },
        maybeSingle: () => Promise.resolve(resposta),
        then: (resolver: (valor: unknown) => unknown) => Promise.resolve(resposta).then(resolver),
      };
      return builder;
    },
  });
  return consultas;
}

afterEach(() => {
  vi.clearAllMocks();
  supabaseConfiguradoMock.mockReturnValue(true);
});

describe("lerAtendimento", () => {
  it("não consulta nada sem conexão configurada", async () => {
    supabaseConfiguradoMock.mockReturnValue(false);
    await expect(lerAtendimento("ment-1")).resolves.toMatchObject({ conectado: false, encontrado: false, mapa: [] });
    expect(criarSupabaseServerMock).not.toHaveBeenCalled();
  });

  it("falha fechada quando o cliente não é visível pela RLS", async () => {
    const consultas = cliente({ mentorado: { data: null, error: null } });
    await expect(lerAtendimento("mentorado-inexistente")).resolves.toMatchObject({ conectado: true, encontrado: false, mapa: [], reflexoes: [] });
    expect(consultas.map((c) => c.tabela)).toEqual(["mentorado"]);
  });

  it("consulta cada dado pelo mentorado, nunca por workspace vindo de fora", async () => {
    const consultas = cliente({ mentorado: { data: { id: "ment-1" }, error: null } });
    await lerAtendimento("ment-1");
    for (const consulta of consultas.filter((c) => c.tabela !== "mentorado")) {
      expect(consulta.eq).toEqual([["mentorado_id", "ment-1"]]);
    }
  });
});
