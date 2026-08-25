import { afterEach, describe, expect, it, vi } from "vitest";

const criarSupabaseServerMock = vi.fn();
const supabaseConfiguradoMock = vi.fn(() => true);
vi.mock("../supabase/server", () => ({ criarSupabaseServer: criarSupabaseServerMock }));
vi.mock("../data", () => ({ supabaseConfigurado: supabaseConfiguradoMock }));

const { lerDadosMarketing } = await import("./dados");

type Resposta = { data: unknown; error: { code?: string } | null };

function cliente(respostas: Record<string, Resposta>) {
  const consultas: Array<{ tabela: string; colunas: string }> = [];
  const c = {
    from(tabela: string) {
      const consulta = { tabela, colunas: "" };
      consultas.push(consulta);
      const resposta = respostas[tabela] ?? { data: [], error: null };
      const b: Record<string, unknown> = {};
      b.select = (colunas: string) => {
        consulta.colunas = colunas;
        return b;
      };
      b.order = () => b;
      b.then = (resolver: (valor: Resposta) => unknown) => Promise.resolve(resposta).then(resolver);
      return b;
    },
  };
  criarSupabaseServerMock.mockReturnValue(c);
  return consultas;
}

const OK = (data: unknown): Resposta => ({ data, error: null });

afterEach(() => {
  vi.restoreAllMocks();
  supabaseConfiguradoMock.mockReturnValue(true);
});

describe("lerDadosMarketing", () => {
  it("sem Supabase não consulta e não inventa métricas", async () => {
    supabaseConfiguradoMock.mockReturnValue(false);
    const consultas = cliente({});

    const dados = await lerDadosMarketing();

    expect(consultas).toHaveLength(0);
    expect(dados.conectado).toBe(false);
    expect(dados.capturasPorOrigem).toEqual([]);
    expect(dados.links).toEqual([]);
  });

  it("agrega captura por origem e trata UTM vazia como sem origem informada", async () => {
    const consultas = cliente({
      captura: OK([{ utm_source: "instagram" }, { utm_source: "" }, { utm_source: "instagram" }]),
      link_rastreado: OK([{ id: "l1", codigo: "AbCd1234", destino: "https://raro-ia.vercel.app/a", campanha: "Lançamento", ativo: true, criado_em: "2026-08-25T10:00:00Z" }]),
      clique: OK([{ link_id: "l1", quando: "2026-08-25T11:00:00Z" }]),
    });

    const dados = await lerDadosMarketing();

    expect(dados.capturasPorOrigem).toEqual([
      { origem: "instagram", quantidade: 2 },
      { origem: "sem origem informada", quantidade: 1 },
    ]);
    expect(dados.links).toEqual([
      expect.objectContaining({ codigo: "AbCd1234", cliques: 1, ultimoClique: "2026-08-25T11:00:00Z" }),
    ]);
    const textoConsultado = consultas.map((consulta) => consulta.colunas).join(" ").toLowerCase();
    for (const proibido of ["email", "telefone", "ip", "hash", "agente"]) {
      expect(textoConsultado).not.toContain(proibido);
    }
  });

  it("mantém links, mas não inventa cliques quando a leitura deles falha", async () => {
    cliente({
      captura: OK([]),
      link_rastreado: OK([{ id: "l1", codigo: "AbCd1234", destino: "https://raro-ia.vercel.app/a", campanha: "", ativo: true, criado_em: "2026-08-25T10:00:00Z" }]),
      clique: { data: null, error: { code: "42501" } },
    });

    const dados = await lerDadosMarketing();

    expect(dados.conectado).toBe(true);
    expect(dados.parcial).toBe(true);
    expect(dados.links[0]).toMatchObject({ cliques: null, ultimoClique: null });
  });
});
