// Testes de `lerFeedDoTime` e `lerMeuFeed`.
//
// O QUE ESTA SUÍTE PROVA
// ----------------------
// 1) `lerMeuFeed` NÃO recebe id de fora — aridade 1, e a identidade sai de
//    `rpc("mentorado_atual")`. Mesma defesa de `lerPortal` e `lerMinhaTrilha`
//    contra o buraco clássico de trocar o número na URL;
// 2) A BUSCA DE COMENTÁRIOS PARTE DOS POSTS JÁ FILTRADOS. Nunca o contrário:
//    pedir todos os comentários e depois jogar fora os que não servem faria
//    o corpo de um comentário de mensagem direta alheia atravessar a rede e
//    passar pela memória do servidor. A RLS de 0022 barraria assim mesmo —
//    mas "o banco me protege" não é motivo para pedir o que não se pode ver;
// 3) sem Supabase configurado, ZERO consultas;
// 4) erro vira `conectado: false` com motivo humano, sem nome de tabela nem
//    código, e o log leva só o código.

import { afterEach, describe, expect, it, vi } from "vitest";

const criarSupabaseServerMock = vi.fn();
const supabaseConfiguradoMock = vi.fn(() => true);
vi.mock("../supabase/server", () => ({ criarSupabaseServer: criarSupabaseServerMock }));
vi.mock("../data", () => ({ supabaseConfigurado: supabaseConfiguradoMock }));

const { lerFeedDoTime, lerMeuFeed } = await import("./dados");

const AGORA = "2026-08-20T12:00:00Z";
const EU = "ment-eu";
const OUTRO = "ment-outro";

interface Consulta {
  tabela: string;
  filtros: Array<[string, unknown]>;
  emColuna?: string;
  emValores?: unknown[];
}

type Resposta = { data: unknown; error: { code?: string; message?: string } | null };

function cliente(respostas: Record<string, Resposta>, rpc: Resposta = { data: EU, error: null }) {
  const consultas: Consulta[] = [];
  const rpcMock = vi.fn(() => Promise.resolve(rpc));

  const c = {
    rpc: rpcMock,
    from(tabela: string) {
      const consulta: Consulta = { tabela, filtros: [] };
      consultas.push(consulta);
      const resposta = respostas[tabela] ?? { data: [], error: null };
      const b: Record<string, unknown> = {};
      b.select = () => b;
      b.eq = (coluna: string, valor: unknown) => {
        consulta.filtros.push([coluna, valor]);
        return b;
      };
      b.in = (coluna: string, valores: unknown[]) => {
        consulta.emColuna = coluna;
        consulta.emValores = valores;
        return b;
      };
      b.order = () => b;
      b.then = (resolver: (r: Resposta) => unknown) => Promise.resolve(resposta).then(resolver);
      return b;
    },
  };
  criarSupabaseServerMock.mockReturnValue(c);
  return { consultas, rpcMock };
}

function linhaPost(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "p1",
    workspace_id: "ws-1",
    autor_perfil_id: "perfil-1",
    escopo: "feed",
    titulo: "Aviso",
    corpo: "Corpo do aviso",
    publicado_em: "2026-08-19T10:00:00Z",
    arquivado: false,
    criado_em: "2026-08-19T09:00:00Z",
    ...over,
  };
}

function linhaDest(over: Record<string, unknown> = {}): Record<string, unknown> {
  return { id: "d1", post_id: "p1", mentorado_id: EU, lido_em: null, ...over };
}

function linhaComentario(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "c1",
    post_id: "p1",
    autor_perfil_id: "perfil-2",
    corpo: "Comentário",
    arquivado: false,
    criado_em: "2026-08-19T11:00:00Z",
    ...over,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  criarSupabaseServerMock.mockReset();
  supabaseConfiguradoMock.mockReturnValue(true);
});

describe("lerMeuFeed — a identidade não entra por parâmetro", () => {
  it("aridade 1: o único parâmetro é o relógio", () => {
    // Um segundo parâmetro aqui seria `mentoradoId`, e quem o passasse
    // escolheria de quem é o feed. `Function.length` não conta parâmetro com
    // valor padrão — por isso `agoraIso` é obrigatório.
    expect(lerMeuFeed.length).toBe(1);
  });

  it("pergunta ao banco quem está logado, e não usa nada vindo de fora", async () => {
    const { rpcMock } = cliente({});
    await lerMeuFeed(AGORA);
    expect(rpcMock).toHaveBeenCalledWith("mentorado_atual");
  });

  it("a consulta de destinatários é filtrada pelo id que veio do rpc", async () => {
    // Duas coisas de uma vez: a leitura pede só as linhas DELE (não se pede
    // o que não se pode ver, mesmo com a RLS por trás), e o valor do filtro é
    // o que o banco respondeu — nunca algo que chegou por parâmetro.
    const { consultas } = cliente({
      post: { data: [linhaPost()], error: null },
      post_destinatario: { data: [], error: null },
      comentario: { data: [], error: null },
    });

    await lerMeuFeed(AGORA);

    const deDestinatario = consultas.find((c) => c.tabela === "post_destinatario");
    expect(deDestinatario, "esperava uma consulta a post_destinatario").toBeDefined();
    expect(deDestinatario!.filtros).toEqual([["mentorado_id", EU]]);
  });

  it("sem ficha de mentorado: conectado, ehMentorado falso, e nenhuma consulta", async () => {
    const { consultas } = cliente({}, { data: null, error: null });
    const feed = await lerMeuFeed(AGORA);

    expect(feed.conectado).toBe(true);
    expect(feed.ehMentorado).toBe(false);
    expect(feed.itens).toEqual([]);
    expect(consultas).toEqual([]);
  });
});

describe("lerMeuFeed — comentário parte do post, nunca o contrário", () => {
  it("a consulta de comentário filtra pelos ids dos posts VISÍVEIS", async () => {
    const { consultas } = cliente({
      post: {
        data: [
          linhaPost({ id: "publico", escopo: "feed" }),
          linhaPost({ id: "minha", escopo: "dm" }),
          linhaPost({ id: "alheia", escopo: "dm" }),
        ],
        error: null,
      },
      post_destinatario: {
        data: [linhaDest({ post_id: "minha" }), linhaDest({ post_id: "alheia", mentorado_id: OUTRO })],
        error: null,
      },
      comentario: { data: [linhaComentario({ post_id: "publico" })], error: null },
    });

    await lerMeuFeed(AGORA);

    const deComentario = consultas.find((c) => c.tabela === "comentario");
    expect(deComentario, "esperava uma consulta a comentario").toBeDefined();
    expect(deComentario!.emColuna).toBe("post_id");
    expect(deComentario!.emValores).toEqual(["publico", "minha"]);
    // A dm alheia não entra na lista pedida — o corpo do comentário dela nem
    // chega a atravessar a rede.
    expect(deComentario!.emValores).not.toContain("alheia");
  });

  it("sem post visível, a consulta de comentário nem acontece", async () => {
    const { consultas } = cliente({
      post: { data: [linhaPost({ id: "alheia", escopo: "dm" })], error: null },
      post_destinatario: { data: [linhaDest({ post_id: "alheia", mentorado_id: OUTRO })], error: null },
    });

    const feed = await lerMeuFeed(AGORA);

    expect(feed.itens).toEqual([]);
    expect(consultas.some((c) => c.tabela === "comentario")).toBe(false);
  });

  it("o comentário chega junto do post a que pertence", async () => {
    cliente({
      post: { data: [linhaPost({ id: "p1" }), linhaPost({ id: "p2" })], error: null },
      post_destinatario: { data: [], error: null },
      comentario: {
        data: [linhaComentario({ id: "c1", post_id: "p1" }), linhaComentario({ id: "c2", post_id: "p2" })],
        error: null,
      },
    });

    const feed = await lerMeuFeed(AGORA);

    expect(feed.itens.map((i) => i.post.id)).toEqual(["p1", "p2"]);
    expect(feed.itens[0].comentarios.map((c) => c.id)).toEqual(["c1"]);
    expect(feed.itens[1].comentarios.map((c) => c.id)).toEqual(["c2"]);
  });

  it("comentário arquivado não chega ao mentorado", async () => {
    cliente({
      post: { data: [linhaPost()], error: null },
      post_destinatario: { data: [], error: null },
      comentario: {
        data: [linhaComentario({ id: "c1" }), linhaComentario({ id: "c2", arquivado: true })],
        error: null,
      },
    });

    const feed = await lerMeuFeed(AGORA);
    expect(feed.itens[0].comentarios.map((c) => c.id)).toEqual(["c1"]);
  });
});

describe("lerMeuFeed — o que ele resolve antes de entregar", () => {
  it("marca o que já foi lido e conta o que falta", async () => {
    cliente({
      post: { data: [linhaPost({ id: "a" }), linhaPost({ id: "b" })], error: null },
      post_destinatario: {
        data: [linhaDest({ post_id: "a", lido_em: "2026-08-19T23:00:00Z" }), linhaDest({ post_id: "b" })],
        error: null,
      },
      comentario: { data: [], error: null },
    });

    const feed = await lerMeuFeed(AGORA);

    expect(feed.itens.find((i) => i.post.id === "a")!.lido).toBe(true);
    expect(feed.itens.find((i) => i.post.id === "b")!.lido).toBe(false);
    expect(feed.naoLidos.total).toBe(1);
  });

  it("rascunho e agendado não chegam", async () => {
    cliente({
      post: {
        data: [
          linhaPost({ id: "rascunho", publicado_em: null }),
          linhaPost({ id: "agendado", publicado_em: "2026-09-01T10:00:00Z" }),
          linhaPost({ id: "vale" }),
        ],
        error: null,
      },
      post_destinatario: { data: [], error: null },
      comentario: { data: [], error: null },
    });

    const feed = await lerMeuFeed(AGORA);
    expect(feed.itens.map((i) => i.post.id)).toEqual(["vale"]);
  });
});

describe("lerFeedDoTime — a leitura da gestão", () => {
  it("traz post, destinatários e comentários, inclusive rascunho e arquivado", async () => {
    // Quem opera precisa ver o rascunho que escreveu e o que arquivou —
    // quem decide se ele pode é a RLS, não este módulo.
    cliente({
      post: { data: [linhaPost({ id: "rascunho", publicado_em: null }), linhaPost({ id: "vivo" })], error: null },
      post_destinatario: { data: [linhaDest({ post_id: "vivo" })], error: null },
      comentario: { data: [linhaComentario({ post_id: "vivo" })], error: null },
    });

    const feed = await lerFeedDoTime();

    expect(feed.conectado).toBe(true);
    expect(feed.posts.map((p) => p.post.id)).toEqual(["rascunho", "vivo"]);
    expect(feed.posts[1].destinatarios).toHaveLength(1);
    expect(feed.posts[1].comentarios).toHaveLength(1);
  });

  it("aridade 0: não recebe filtro nenhum de fora", async () => {
    expect(lerFeedDoTime.length).toBe(0);
  });
});

describe("as duas leituras — sem banco e com erro", () => {
  it("sem Supabase configurado, zero consultas nas duas", async () => {
    supabaseConfiguradoMock.mockReturnValue(false);
    cliente({});

    const time = await lerFeedDoTime();
    const meu = await lerMeuFeed(AGORA);

    expect(time.conectado).toBe(false);
    expect(meu.conectado).toBe(false);
    expect(criarSupabaseServerMock).not.toHaveBeenCalled();
  });

  it("erro vira conectado falso, com motivo humano e sem nome de tabela", async () => {
    cliente({ post: { data: null, error: { code: "42501", message: "permission denied for table post" } } });

    const feed = await lerFeedDoTime();

    expect(feed.conectado).toBe(false);
    expect(feed.posts).toEqual([]);
    expect(feed.motivo).not.toBe("");
    for (const proibido of ["post", "comentario", "42501", "permission", "denied", "table"]) {
      expect(feed.motivo.toLowerCase()).not.toContain(proibido);
    }
  });

  it("o log leva o código do erro, nunca a mensagem", async () => {
    const avisos: unknown[][] = [];
    vi.spyOn(console, "warn").mockImplementation((...args: unknown[]) => {
      avisos.push(args);
    });
    cliente({
      post: { data: null, error: { code: "42501", message: "permission denied for ment-eu" } },
    });

    await lerFeedDoTime();

    const texto = avisos.map((a) => a.map(String).join(" ")).join(" | ");
    expect(texto).toContain("42501");
    expect(texto).not.toContain("permission denied");
    expect(texto).not.toContain(EU);
  });

  it("erro no rpc de identidade não vira 'não é mentorado'", async () => {
    // A diferença importa: "não consegui ler" mostra um aviso; "não é
    // mentorado" mostra uma tela dizendo que a pessoa não tem acompanhamento.
    cliente({}, { data: null, error: { code: "PGRST301" } });

    const feed = await lerMeuFeed(AGORA);

    expect(feed.conectado).toBe(false);
    expect(feed.ehMentorado).toBe(false);
    expect(feed.motivo).not.toBe("");
  });

  it("exceção inesperada não escapa", async () => {
    criarSupabaseServerMock.mockImplementation(() => {
      throw new Error("segredo que não pode vazar");
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const feed = await lerFeedDoTime();

    expect(feed.conectado).toBe(false);
    expect(feed.motivo).not.toContain("segredo");
  });
});
