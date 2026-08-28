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
  const consultas: Array<{ tabela: string; colunas: string; eq: Array<[string, unknown]> }> = [];
  criarSupabaseServerMock.mockReturnValue({
    from(tabela: string) {
      const consulta = { tabela, colunas: "", eq: [] as Array<[string, unknown]> };
      consultas.push(consulta);
      const resposta = respostas[tabela] ?? { data: [], error: null };
      const builder = {
        select: (colunas: string) => { consulta.colunas = colunas; return builder; },
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
    expect(consultas.map((c) => c.colunas)).toEqual([
      "id",
      "id,mentorado_id,dimensao,nota,dor,medo,objetivo,registrado_em",
      "id,mentorado_id,titulo,prazo,status,visibilidade,criada_em",
      "id,mentorado_id,meta_id,descricao,responsavel,ordem,status",
      "id,mentorado_id,texto,origem,visibilidade,criada_em",
      "id,mentorado_id,categoria,consentido,atualizado_em",
    ]);
  });

  it("falha fechada quando a consulta do mentorado retorna erro, sem vazar detalhe", async () => {
    const segredo = "relation mentorado denied: token-super-secreto";
    const consultas = cliente({ mentorado: { data: null, error: { message: segredo, code: "42501" } } });
    const resultado = await lerAtendimento("ment-1");
    expect(resultado).toEqual({ conectado: false, encontrado: false, mapa: [], metas: [], passos: [], reflexoes: [], consentimentos: [] });
    expect(JSON.stringify(resultado)).not.toContain(segredo);
    expect(consultas.map((c) => c.tabela)).toEqual(["mentorado"]);
  });

  it("falha fechada quando uma tabela de atendimento retorna erro, sem vazar detalhe", async () => {
    const segredo = "texto confidencial do banco";
    cliente({
      mentorado: { data: { id: "ment-1" }, error: null },
      atendimento_reflexao: { data: null, error: { message: segredo, details: "private" } },
    });
    const resultado = await lerAtendimento("ment-1");
    expect(resultado).toEqual({ conectado: false, encontrado: false, mapa: [], metas: [], passos: [], reflexoes: [], consentimentos: [] });
    expect(JSON.stringify(resultado)).not.toContain(segredo);
  });

  it("falha fechada quando o cliente lança exceção, sem vazar detalhe", async () => {
    const segredo = "stack com credencial";
    criarSupabaseServerMock.mockImplementation(() => { throw new Error(segredo); });
    const resultado = await lerAtendimento("ment-1");
    expect(resultado).toEqual({ conectado: false, encontrado: false, mapa: [], metas: [], passos: [], reflexoes: [], consentimentos: [] });
    expect(JSON.stringify(resultado)).not.toContain(segredo);
  });

  it("normaliza linhas sem aceitar colunas ou tipos inesperados", async () => {
    cliente({
      mentorado: { data: { id: "ment-1" }, error: null },
      atendimento_mapa: { data: [{ id: 123, mentorado_id: "ment-1", dimensao: "saude", nota: "8", dor: 4, medo: null, objetivo: "ok", registrado_em: "2026-01-01", segredo: "não deve sair" }], error: null },
    });
    const resultado = await lerAtendimento("ment-1");
    expect(resultado.mapa).toEqual([{ id: null, mentorado_id: "ment-1", dimensao: "saude", nota: null, dor: null, medo: null, objetivo: "ok", registrado_em: "2026-01-01" }]);
  });

  it("mantém a reflexão privada somente na leitura interna autorizada", async () => {
    cliente({
      mentorado: { data: { id: "ment-1" }, error: null },
      atendimento_reflexao: {
        data: [{ texto: "Ainda não quero compartilhar esta reflexão.", visibilidade: "privada_profissional" }],
        error: null,
      },
    });

    const atendimento = await lerAtendimento("ment-1");

    expect(atendimento.reflexoes).toEqual([
      { id: null, mentorado_id: null, texto: "Ainda não quero compartilhar esta reflexão.", origem: null, visibilidade: "privada_profissional", criada_em: null },
    ]);
  });
});
