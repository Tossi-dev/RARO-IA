// Testes de `liberarConteudo` e `revogarConteudo`.
//
// O QUE ESTA SUÍTE PROVA
// ----------------------
// 1) URL fora de http/https é recusada ANTES de qualquer escrita — e "antes"
//    aqui é provado por espião: nem o cliente do Supabase chega a ser criado;
// 2) revogar NUNCA chama `.delete()`, em caminho nenhum;
// 3) nenhuma das duas funções lê `workspace_id` do formulário;
// 4) mentorado inexistente volta erro humano e não cria linha órfã;
// 5) nada lança: toda borda vira redirecionamento com `?erro=`.

import { beforeEach, describe, expect, it, vi } from "vitest";

const criarSupabaseServerMock = vi.fn();
const revalidatePathMock = vi.fn();
// O `redirect` do Next sinaliza por EXCEÇÃO, e a exceção dele carrega um
// `digest` que começa com "NEXT_REDIRECT". O dublê precisa carregar o digest
// também: sem ele, o `catch` da ação (que relança o controle de fluxo do
// framework e engole o resto) trataria o próprio redirecionamento como falha
// e o converteria numa mensagem genérica. Um dublê que não imita a forma do
// original testa outra coisa.
const redirectMock = vi.fn((destino: string) => {
  const e = new Error(`REDIRECT:${destino}`) as Error & { digest: string };
  e.digest = `NEXT_REDIRECT;${destino}`;
  throw e;
});

vi.mock("../supabase/server", () => ({ criarSupabaseServer: criarSupabaseServerMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

const {
  liberarConteudo,
  revogarConteudo,
  MOTIVO_TITULO_VAZIO,
  MOTIVO_URL_VAZIA,
  MOTIVO_URL_INVALIDA,
  MOTIVO_MENTORADO_NAO_ENCONTRADO,
  MOTIVO_ERRO_LIBERAR,
  MOTIVO_ERRO_REVOGAR,
  MOTIVO_CONTEUDO_INVALIDO,
} = await import("./acoes-conteudo-liberado");

interface Registro {
  tabela: string;
  operacao: string;
  valores?: Record<string, unknown>;
  eq: [string, unknown][];
}

function supabaseDuble(
  opcoes: {
    mentorado?: { data: unknown; error: { code?: string } | null };
    erroInsert?: { code?: string } | null;
    erroUpdate?: { code?: string } | null;
  } = {},
) {
  const registros: Registro[] = [];
  const cliente = {
    from(tabela: string) {
      const reg: Registro = { tabela, operacao: "", eq: [] };
      const builder = {
        select(..._a: unknown[]) {
          reg.operacao = "select";
          registros.push(reg);
          return builder;
        },
        insert(valores: Record<string, unknown>) {
          reg.operacao = "insert";
          reg.valores = valores;
          registros.push(reg);
          return Promise.resolve({ error: opcoes.erroInsert ?? null });
        },
        update(valores: Record<string, unknown>) {
          reg.operacao = "update";
          reg.valores = valores;
          registros.push(reg);
          return builder;
        },
        // Existe SÓ para o teste poder provar que nunca é chamado. Se a
        // implementação um dia chamar, o registro aparece e o teste morre.
        delete() {
          reg.operacao = "delete";
          registros.push(reg);
          return builder;
        },
        eq(coluna: string, valor: unknown) {
          reg.eq.push([coluna, valor]);
          if (reg.operacao === "update") return Promise.resolve({ error: opcoes.erroUpdate ?? null });
          return builder;
        },
        maybeSingle() {
          return Promise.resolve(opcoes.mentorado ?? { data: { id: "ment-1" }, error: null });
        },
      };
      return builder;
    },
  };
  return { cliente, registros };
}

function formulario(campos: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
}

async function erroDoRedirect(promessa: Promise<unknown>): Promise<string> {
  try {
    await promessa;
    return "";
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    if (!m.startsWith("REDIRECT:")) throw e;
    const destino = m.slice("REDIRECT:".length);
    return decodeURIComponent(destino.split("?erro=")[1] ?? "");
  }
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("liberarConteudo — caminho feliz", () => {
  it("insere título e url, sem tocar em workspace_id", async () => {
    const { cliente, registros } = supabaseDuble();
    criarSupabaseServerMock.mockReturnValue(cliente);

    await liberarConteudo(
      formulario({
        mentoradoId: "ment-1",
        titulo: "Aula 1 — fundamentos",
        url: "https://exemplo.com/aula-1",
      }),
    );

    const insert = registros.find((r) => r.operacao === "insert");
    expect(insert?.tabela).toBe("conteudo_liberado");
    expect(insert?.valores).toEqual({
      mentorado_id: "ment-1",
      titulo: "Aula 1 — fundamentos",
      url: "https://exemplo.com/aula-1",
    });
    // Quem decide de quem é a linha é o banco (default do schema + a
    // política de insert de 0008), nunca o formulário.
    expect(Object.keys(insert?.valores ?? {})).not.toContain("workspace_id");
    expect(insert?.valores).not.toHaveProperty("arquivado");
  });

  it("revalida a ficha E o portal — a outra ponta da liberação", async () => {
    const { cliente } = supabaseDuble();
    criarSupabaseServerMock.mockReturnValue(cliente);

    await liberarConteudo(
      formulario({ mentoradoId: "ment-1", titulo: "Aula 1", url: "https://exemplo.com/a" }),
    );

    expect(revalidatePathMock).toHaveBeenCalledWith("/mentoria/ment-1");
    expect(revalidatePathMock).toHaveBeenCalledWith("/portal");
  });

  it("campos com espaço nas pontas são aparados antes de gravar", async () => {
    const { cliente, registros } = supabaseDuble();
    criarSupabaseServerMock.mockReturnValue(cliente);

    await liberarConteudo(
      formulario({ mentoradoId: "  ment-1  ", titulo: "  Aula 1  ", url: "  https://exemplo.com/a  " }),
    );

    const insert = registros.find((r) => r.operacao === "insert");
    expect(insert?.valores).toEqual({
      mentorado_id: "ment-1",
      titulo: "Aula 1",
      url: "https://exemplo.com/a",
    });
  });
});

describe("liberarConteudo — a URL é recusada ANTES de qualquer escrita", () => {
  it.each([
    ["javascript:alert(1)"],
    ["JavaScript:alert(1)"],
    ["data:text/html,<script>alert(1)</script>"],
    ["ftp://exemplo.com/a"],
    ["file:///etc/passwd"],
    ["//evil.com/x"],
    ["/caminho/relativo"],
    ["exemplo.com/sem-esquema"],
    ["   "],
  ])("url %j não escreve nada e nem cria o cliente do Supabase", async (url) => {
    const { cliente, registros } = supabaseDuble();
    criarSupabaseServerMock.mockReturnValue(cliente);

    await erroDoRedirect(
      liberarConteudo(formulario({ mentoradoId: "ment-1", titulo: "Aula 1", url })),
    );

    expect(registros).toHaveLength(0);
    // "Antes de qualquer escrita" é forte: nem a conexão é aberta.
    expect(criarSupabaseServerMock).not.toHaveBeenCalled();
  });

  it("vazio e inválido têm mensagens DIFERENTES — um é esquecimento, o outro é o link errado", async () => {
    const { cliente } = supabaseDuble();
    criarSupabaseServerMock.mockReturnValue(cliente);

    const vazio = await erroDoRedirect(
      liberarConteudo(formulario({ mentoradoId: "ment-1", titulo: "Aula 1", url: "" })),
    );
    const invalido = await erroDoRedirect(
      liberarConteudo(formulario({ mentoradoId: "ment-1", titulo: "Aula 1", url: "javascript:alert(1)" })),
    );

    expect(vazio).toBe(MOTIVO_URL_VAZIA);
    expect(invalido).toBe(MOTIVO_URL_INVALIDA);
    expect(vazio).not.toBe(invalido);
  });

  it.each([["http://exemplo.com/a"], ["https://exemplo.com/a"], ["https://sub.exemplo.com/a?b=1#c"]])(
    "url %j é aceita",
    async (url) => {
      const { cliente, registros } = supabaseDuble();
      criarSupabaseServerMock.mockReturnValue(cliente);

      await liberarConteudo(formulario({ mentoradoId: "ment-1", titulo: "Aula 1", url }));

      expect(registros.some((r) => r.operacao === "insert")).toBe(true);
    },
  );

  it("título vazio também para antes de tudo", async () => {
    const { cliente, registros } = supabaseDuble();
    criarSupabaseServerMock.mockReturnValue(cliente);

    const erro = await erroDoRedirect(
      liberarConteudo(formulario({ mentoradoId: "ment-1", titulo: "   ", url: "https://exemplo.com/a" })),
    );

    expect(erro).toBe(MOTIVO_TITULO_VAZIO);
    expect(registros).toHaveLength(0);
  });
});

describe("liberarConteudo — mentorado inexistente não vira linha órfã", () => {
  it("volta erro humano e NÃO insere", async () => {
    const { cliente, registros } = supabaseDuble({ mentorado: { data: null, error: null } });
    criarSupabaseServerMock.mockReturnValue(cliente);

    const erro = await erroDoRedirect(
      liberarConteudo(formulario({ mentoradoId: "ment-fantasma", titulo: "Aula 1", url: "https://exemplo.com/a" })),
    );

    expect(erro).toBe(MOTIVO_MENTORADO_NAO_ENCONTRADO);
    expect(registros.some((r) => r.operacao === "insert")).toBe(false);
  });

  it("erro do insert vira mensagem humana, sem detalhe técnico", async () => {
    const { cliente } = supabaseDuble({ erroInsert: { code: "23503" } });
    criarSupabaseServerMock.mockReturnValue(cliente);

    const erro = await erroDoRedirect(
      liberarConteudo(formulario({ mentoradoId: "ment-1", titulo: "Aula 1", url: "https://exemplo.com/a" })),
    );

    expect(erro).toBe(MOTIVO_ERRO_LIBERAR);
    expect(erro).not.toContain("23503");
  });
});

describe("revogarConteudo", () => {
  it("liga arquivado, escopado pelo id, e NUNCA chama delete", async () => {
    const { cliente, registros } = supabaseDuble();
    criarSupabaseServerMock.mockReturnValue(cliente);

    await revogarConteudo(formulario({ mentoradoId: "ment-1", conteudoId: "cont-1" }));

    const update = registros.find((r) => r.operacao === "update");
    expect(update?.tabela).toBe("conteudo_liberado");
    expect(update?.valores).toEqual({ arquivado: true });
    expect(update?.eq).toEqual([["id", "cont-1"]]);
    expect(registros.some((r) => r.operacao === "delete")).toBe(false);
  });

  it("não reescreve o que foi prometido: só a flag entra no update", async () => {
    const { cliente, registros } = supabaseDuble();
    criarSupabaseServerMock.mockReturnValue(cliente);

    await revogarConteudo(formulario({ mentoradoId: "ment-1", conteudoId: "cont-1" }));

    const update = registros.find((r) => r.operacao === "update");
    expect(Object.keys(update?.valores ?? {})).toEqual(["arquivado"]);
  });

  it("id vazio não escreve nada", async () => {
    const { cliente, registros } = supabaseDuble();
    criarSupabaseServerMock.mockReturnValue(cliente);

    const erro = await erroDoRedirect(
      revogarConteudo(formulario({ mentoradoId: "ment-1", conteudoId: "  " })),
    );

    expect(erro).toBe(MOTIVO_CONTEUDO_INVALIDO);
    expect(registros).toHaveLength(0);
  });

  it("erro do banco vira mensagem humana e não revalida", async () => {
    const { cliente } = supabaseDuble({ erroUpdate: { code: "42501" } });
    criarSupabaseServerMock.mockReturnValue(cliente);

    const erro = await erroDoRedirect(
      revogarConteudo(formulario({ mentoradoId: "ment-1", conteudoId: "cont-1" })),
    );

    expect(erro).toBe(MOTIVO_ERRO_REVOGAR);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});

describe("as duas funções ignoram identidade vinda do formulário", () => {
  it.each([["liberar"], ["revogar"]])("%s ignora workspace_id, papel e perfil_id forjados", async (qual) => {
    const { cliente, registros } = supabaseDuble();
    criarSupabaseServerMock.mockReturnValue(cliente);

    const campos = {
      mentoradoId: "ment-1",
      titulo: "Aula 1",
      url: "https://exemplo.com/a",
      conteudoId: "cont-1",
      workspace_id: "ws-de-outro",
      workspaceId: "ws-de-outro",
      papel: "dono",
      perfil_id: "perfil-invasor",
      arquivado: "false",
    };

    if (qual === "liberar") await liberarConteudo(formulario(campos));
    else await revogarConteudo(formulario(campos));

    const escritos = JSON.stringify(registros);
    expect(escritos).not.toContain("ws-de-outro");
    expect(escritos).not.toContain("perfil-invasor");
    expect(escritos).not.toContain("papel");
  });
});

describe("nenhuma das duas lança", () => {
  it.each([["liberar"], ["revogar"]])("%s: cliente que lança vira redirecionamento com erro", async (qual) => {
    criarSupabaseServerMock.mockImplementation(() => {
      throw new Error("sem cookie de sessao");
    });

    const campos = {
      mentoradoId: "ment-1",
      titulo: "Aula 1",
      url: "https://exemplo.com/a",
      conteudoId: "cont-1",
    };
    const erro =
      qual === "liberar"
        ? await erroDoRedirect(liberarConteudo(formulario(campos)))
        : await erroDoRedirect(revogarConteudo(formulario(campos)));

    expect(erro === MOTIVO_ERRO_LIBERAR || erro === MOTIVO_ERRO_REVOGAR).toBe(true);
    expect(erro).not.toContain("cookie");
  });
});
