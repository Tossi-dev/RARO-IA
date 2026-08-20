// Testes das Server Actions do feed.
//
// O QUE ESTA SUÍTE PROVA
// ----------------------
// 1) DM SEM DESTINATÁRIO É RECUSADA ANTES DO BANCO. Um post de escopo `dm`
//    sem ninguém endereçado nasceria invisível para todo mundo — o mentor
//    escreveria um recado que nenhum cliente recebe, e nada avisaria;
// 2) BROADCAST COM LISTA DE DESTINATÁRIOS É RECUSADO. Broadcast é para todos;
//    aceitar a lista significaria a carteira de clientes do Jefson viajando
//    dentro de um formulário do navegador. Quem monta a lista é o servidor;
// 3) arquivar NUNCA chama `.delete()`;
// 4) marcar como lido passa pelo `rpc`, nunca por `.update()` — não existe
//    política de update de `post_destinatario` para mentorado (0022);
// 5) o corpo é gravado EXATAMENTE como veio: nada de interpretar HTML, nada
//    de "sanitizar" aqui. Quem escapa é o React, na hora de desenhar;
// 6) nenhuma ação lê `workspace_id` nem `autor_perfil_id` do formulário.

import { beforeEach, describe, expect, it, vi } from "vitest";

const criarSupabaseServerMock = vi.fn();
const revalidatePathMock = vi.fn();
const redirectMock = vi.fn((destino: string) => {
  const e = new Error(`REDIRECT:${destino}`) as Error & { digest: string };
  e.digest = `NEXT_REDIRECT;${destino}`;
  throw e;
});

vi.mock("../supabase/server", () => ({ criarSupabaseServer: criarSupabaseServerMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

const {
  publicarPost,
  comentar,
  arquivarPost,
  arquivarComentario,
  marcarPostLido,
  MOTIVO_CORPO_VAZIO,
  MOTIVO_ESCOPO_INVALIDO,
  MOTIVO_DM_SEM_DESTINATARIO,
  MOTIVO_BROADCAST_COM_DESTINATARIO,
  MOTIVO_POST_INVALIDO,
  CODIGO_COMENTARIO,
  CODIGO_AVISO,
} = await import("./acoes");

const PERFIL = "perfil-de-quem-esta-logado";
const POST = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";

interface Registro {
  tabela: string;
  operacao: string;
  valores?: unknown;
  eq: Array<[string, unknown]>;
  not: Array<[string, string, unknown]>;
}

function duble(
  opcoes: {
    erroInsert?: { code?: string } | null;
    erroUpdate?: { code?: string } | null;
    erroRpc?: { code?: string } | null;
    mentorados?: Array<Record<string, unknown>>;
    usuario?: string | null;
  } = {},
) {
  const registros: Registro[] = [];
  // Os parâmetros são declarados (mesmo sem uso) para o teste conseguir ler
  // `rpcMock.mock.calls[0][1]` — sem eles, o TypeScript tipa as chamadas como
  // tupla vazia e a asserção de "quais argumentos foram enviados" nem compila.
  const rpcMock = vi.fn((_nome: string, _argumentos?: Record<string, unknown>) =>
    Promise.resolve({ data: null, error: opcoes.erroRpc ?? null }),
  );

  const cliente = {
    auth: {
      getUser: vi.fn(() =>
        Promise.resolve({
          data: { user: opcoes.usuario === null ? null : { id: opcoes.usuario ?? PERFIL } },
          error: null,
        }),
      ),
    },
    rpc: rpcMock,
    from(tabela: string) {
      const reg: Registro = { tabela, operacao: "", eq: [], not: [] };
      const b: Record<string, unknown> = {};
      const dados = tabela === "mentorado" ? (opcoes.mentorados ?? []) : [];

      b.select = () => {
        reg.operacao ||= "select";
        registros.push(reg);
        return b;
      };
      b.insert = (v: unknown) => {
        reg.operacao = "insert";
        reg.valores = v;
        registros.push(reg);
        return {
          select: () => ({
            maybeSingle: () => Promise.resolve({ data: { id: POST }, error: opcoes.erroInsert ?? null }),
          }),
          then: (r: (x: unknown) => unknown) =>
            Promise.resolve({ error: opcoes.erroInsert ?? null }).then(r),
        };
      };
      b.update = (v: unknown) => {
        reg.operacao = "update";
        reg.valores = v;
        registros.push(reg);
        return b;
      };
      b.delete = () => {
        reg.operacao = "delete";
        registros.push(reg);
        return b;
      };
      b.eq = (coluna: string, valor: unknown) => {
        reg.eq.push([coluna, valor]);
        if (reg.operacao === "update") return Promise.resolve({ error: opcoes.erroUpdate ?? null });
        return b;
      };
      b.not = (coluna: string, operador: string, valor: unknown) => {
        reg.not.push([coluna, operador, valor]);
        return b;
      };
      b.then = (r: (x: unknown) => unknown) => Promise.resolve({ data: dados, error: null }).then(r);
      return b;
    },
  };

  criarSupabaseServerMock.mockReturnValue(cliente);
  return { registros, rpcMock, cliente };
}

function form(campos: Record<string, string | string[]>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) {
    if (Array.isArray(v)) for (const item of v) f.append(k, item);
    else f.set(k, v);
  }
  return f;
}

async function erroDe(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "";
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    if (!m.startsWith("REDIRECT:")) throw e;
    return decodeURIComponent(m.slice("REDIRECT:".length).split("?erro=")[1] ?? "");
  }
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("publicarPost — o que é recusado antes do banco", () => {
  it("corpo vazio", async () => {
    const { registros } = duble();
    const erro = await erroDe(publicarPost(form({ escopo: "feed", titulo: "Oi", corpo: "   " })));

    expect(erro).toBe(MOTIVO_CORPO_VAZIO);
    expect(registros).toEqual([]);
  });

  it("escopo desconhecido — nada de inventar um quarto valor", async () => {
    const { registros } = duble();
    const erro = await erroDe(publicarPost(form({ escopo: "publico", corpo: "Texto" })));

    expect(erro).toBe(MOTIVO_ESCOPO_INVALIDO);
    expect(registros).toEqual([]);
  });

  it("dm SEM destinatário: nasceria invisível para todo mundo", async () => {
    const { registros } = duble();
    const erro = await erroDe(publicarPost(form({ escopo: "dm", corpo: "Recado" })));

    expect(erro).toBe(MOTIVO_DM_SEM_DESTINATARIO);
    expect(registros).toEqual([]);
  });

  it("broadcast COM destinatário: a carteira não passa pelo formulário", async () => {
    const { registros } = duble();
    const erro = await erroDe(
      publicarPost(form({ escopo: "broadcast", corpo: "Aviso", destinatarios: ["m1", "m2"] })),
    );

    expect(erro).toBe(MOTIVO_BROADCAST_COM_DESTINATARIO);
    expect(registros).toEqual([]);
  });

  it("feed COM destinatário também é recusado — mesma razão do broadcast", async () => {
    const { registros } = duble();
    const erro = await erroDe(publicarPost(form({ escopo: "feed", corpo: "Aviso", destinatarios: ["m1"] })));

    expect(erro).toBe(MOTIVO_BROADCAST_COM_DESTINATARIO);
    expect(registros).toEqual([]);
  });
});

describe("publicarPost — o que ele grava", () => {
  it("o corpo vai EXATAMENTE como veio, sem interpretar HTML", async () => {
    // A tela escapa na hora de desenhar (React faz isso sozinho). Mexer no
    // texto aqui seria mudar o que a pessoa escreveu — e um "sanitizador"
    // caseiro é a forma mais confiável de estragar um texto legítimo e ainda
    // deixar passar o que importa.
    const corpo = '<script>alert(1)</script> & <b>negrito</b> "aspas" \'simples\'';
    const { registros } = duble();

    await publicarPost(form({ escopo: "feed", titulo: "T", corpo }));

    const insert = registros.find((r) => r.tabela === "post" && r.operacao === "insert");
    expect((insert!.valores as Record<string, unknown>).corpo).toBe(corpo);
  });

  it("não lê workspace_id nem autor do formulário", async () => {
    const { registros } = duble();

    await publicarPost(
      form({
        escopo: "feed",
        corpo: "Texto",
        workspaceId: "ws-de-outra-pessoa",
        workspace_id: "ws-de-outra-pessoa",
        autorPerfilId: "perfil-alheio",
      }),
    );

    const insert = registros.find((r) => r.tabela === "post" && r.operacao === "insert");
    const valores = insert!.valores as Record<string, unknown>;
    expect(Object.keys(valores)).not.toContain("workspace_id");
    // O autor é a SESSÃO, nunca o campo.
    expect(valores.autor_perfil_id).toBe(PERFIL);
  });

  it("rascunho sai sem data de publicação; publicar carimba a data", async () => {
    const { registros } = duble();
    await publicarPost(form({ escopo: "feed", corpo: "Rascunho" }));
    const rascunho = registros.find((r) => r.tabela === "post")!.valores as Record<string, unknown>;
    expect(rascunho.publicado_em).toBeNull();

    const outro = duble();
    await publicarPost(form({ escopo: "feed", corpo: "Vai ao ar", publicar: "1" }));
    const publicado = outro.registros.find((r) => r.tabela === "post")!.valores as Record<string, unknown>;
    expect(typeof publicado.publicado_em).toBe("string");
  });

  it("só o literal '1' publica — qualquer outra coisa fica rascunho", async () => {
    // O lado seguro: o erro possível é a pessoa precisar clicar de novo,
    // nunca um recado indo ao ar sem ninguém ter mandado.
    for (const valor of ["0", "true", "sim", "", "publicar"]) {
      const { registros } = duble();
      await publicarPost(form({ escopo: "feed", corpo: "X", publicar: valor }));
      const post = registros.find((r) => r.tabela === "post")!.valores as Record<string, unknown>;
      expect([valor, post.publicado_em]).toEqual([valor, null]);
    }
  });

  it("dm grava uma linha de destinatário por pessoa endereçada", async () => {
    const { registros } = duble();

    await publicarPost(form({ escopo: "dm", corpo: "Recado", destinatarios: ["m1", "m2"] }));

    const dest = registros.find((r) => r.tabela === "post_destinatario" && r.operacao === "insert");
    expect(dest).toBeDefined();
    expect(dest!.valores).toEqual([
      { post_id: POST, mentorado_id: "m1" },
      { post_id: POST, mentorado_id: "m2" },
    ]);
  });

  it("feed/broadcast: a lista de destinatários é montada NO SERVIDOR", async () => {
    // Só quem tem login — um mentorado sem `perfil_id` não abre o portal, e
    // uma linha de leitura para ele seria um badge que ninguém apaga.
    const { registros } = duble({
      mentorados: [{ id: "m1" }, { id: "m2" }],
    });

    await publicarPost(form({ escopo: "broadcast", corpo: "Aviso", publicar: "1" }));

    const dest = registros.find((r) => r.tabela === "post_destinatario" && r.operacao === "insert");
    expect(dest!.valores).toEqual([
      { post_id: POST, mentorado_id: "m1" },
      { post_id: POST, mentorado_id: "m2" },
    ]);

    // E a consulta pede SÓ quem tem login. Um mentorado sem `perfil_id` não
    // abre o portal: a linha de leitura dele viraria um "não lido" que
    // ninguém nunca apaga, inflando o contador por uma pessoa que nem entrou.
    const consultaMentorado = registros.find((r) => r.tabela === "mentorado");
    expect(consultaMentorado!.not).toEqual([["perfil_id", "is", null]]);
  });

  it("sem mentorado nenhum no workspace, não tenta gravar destinatário vazio", async () => {
    const { registros } = duble({ mentorados: [] });

    await publicarPost(form({ escopo: "feed", corpo: "Aviso" }));

    expect(registros.some((r) => r.tabela === "post_destinatario")).toBe(false);
  });
});

describe("comentar", () => {
  it("corpo vazio é recusado antes do banco, e volta com CÓDIGO", async () => {
    // O portal traduz código, nunca frase — ver `voltarComCodigo` e o MÉDIO 5
    // da auditoria. Mandar a frase pela URL aqui produziria o mesmo banner
    // que aquela correção existiu para fechar.
    const { registros } = duble();
    const erro = await erroDe(comentar(form({ postId: POST, corpo: "  " })));

    expect(erro).toBe(CODIGO_COMENTARIO);
    expect(erro).not.toContain(" ");
    expect(registros).toEqual([]);
  });

  it("post inválido é recusado antes do banco", async () => {
    const { registros } = duble();
    const erro = await erroDe(comentar(form({ postId: "", corpo: "Oi" })));

    expect(erro).toBe(CODIGO_COMENTARIO);
    expect(registros).toEqual([]);
  });

  it("assina com o id da SESSÃO, nunca com o do formulário", async () => {
    // A política de insert de 0022 exige `autor_perfil_id = auth.uid()`, e o
    // banco recusaria de qualquer jeito — mas mandar o campo do formulário
    // seria construir a ação já contando com o banco dizer não.
    const { registros } = duble();

    await comentar(form({ postId: POST, corpo: "Comentário", autorPerfilId: "perfil-alheio" }));

    const insert = registros.find((r) => r.tabela === "comentario")!;
    expect((insert.valores as Record<string, unknown>).autor_perfil_id).toBe(PERFIL);
  });

  it("sem sessão que responda, não grava nada", async () => {
    // `autor_perfil_id` nulo seria recusado pela política; recusar aqui dá
    // uma mensagem humana em vez de um erro de constraint.
    const { registros } = duble({ usuario: null });
    const erro = await erroDe(comentar(form({ postId: POST, corpo: "Comentário" })));

    expect(erro).not.toBe("");
    expect(registros.some((r) => r.tabela === "comentario")).toBe(false);
  });

  it("o corpo vai exatamente como veio", async () => {
    const corpo = "<img src=x onerror=alert(1)> & pronto";
    const { registros } = duble();

    await comentar(form({ postId: POST, corpo }));

    expect((registros.find((r) => r.tabela === "comentario")!.valores as Record<string, unknown>).corpo).toBe(
      corpo,
    );
  });
});

describe("arquivar — nunca apagar", () => {
  it("arquivarPost faz update de `arquivado`, e nenhum delete", async () => {
    const { registros } = duble();
    await arquivarPost(form({ postId: POST }));

    const reg = registros.find((r) => r.tabela === "post")!;
    expect(reg.operacao).toBe("update");
    expect(reg.valores).toEqual({ arquivado: true });
    expect(reg.eq).toEqual([["id", POST]]);
    expect(registros.some((r) => r.operacao === "delete")).toBe(false);
  });

  it("arquivarComentario faz update, e nenhum delete", async () => {
    const { registros } = duble();
    await arquivarComentario(form({ comentarioId: POST, postId: POST }));

    const reg = registros.find((r) => r.tabela === "comentario")!;
    expect(reg.operacao).toBe("update");
    expect(reg.valores).toEqual({ arquivado: true });
    expect(registros.some((r) => r.operacao === "delete")).toBe(false);
  });

  it("o fonte não contém `.delete(` em lugar nenhum", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const fonte = readFileSync(join(process.cwd(), "src/lib/feed/acoes.ts"), "utf8");
    expect(fonte).not.toContain(".delete(");
  });
});

describe("marcarPostLido", () => {
  it("chama a FUNÇÃO do banco, e nunca um update", async () => {
    // Não existe política de update de `post_destinatario` para mentorado
    // (0022), e isso foi decisão: RLS decide se a LINHA aparece, nunca QUE
    // COLUNA pode ser escrita.
    const { registros, rpcMock } = duble();

    await marcarPostLido(form({ postId: POST }));

    expect(rpcMock).toHaveBeenCalledWith("post_marcar_lido", { p_post_id: POST });
    expect(registros.some((r) => r.operacao === "update")).toBe(false);
    expect(registros.some((r) => r.tabela === "post_destinatario")).toBe(false);
  });

  it("não aceita data nem mentorado por parâmetro", async () => {
    const { rpcMock } = duble();

    await marcarPostLido(
      form({ postId: POST, lidoEm: "2020-01-01T00:00:00Z", mentoradoId: "outro-mentorado" }),
    );

    const argumentos = rpcMock.mock.calls[0][1] as Record<string, unknown>;
    expect(Object.keys(argumentos)).toEqual(["p_post_id"]);
  });

  it("post inválido é recusado antes do banco, e volta com CÓDIGO", async () => {
    const { rpcMock } = duble();
    const erro = await erroDe(marcarPostLido(form({ postId: "" })));

    expect(erro).toBe(CODIGO_AVISO);
    expect(erro).not.toContain(" ");
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("erro do banco não carrega código do Postgres nem nome de tabela na URL", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const erro = await erroDe(
      (() => {
        duble({ erroRpc: { code: "42501" } });
        return marcarPostLido(form({ postId: POST }));
      })(),
    );

    expect(erro).toBe(CODIGO_AVISO);
    for (const proibido of ["42501", "post_destinatario", "rpc"]) {
      expect(erro.toLowerCase()).not.toContain(proibido);
    }
  });

  it("os dois códigos do portal são exatamente os que a tela sabe traduzir", async () => {
    // Se um deles mudar aqui e não lá, o mentorado passa a receber a
    // mensagem genérica em vez da específica — sem erro, sem aviso, sem nada
    // que qualquer outro teste pegasse.
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const textos = readFileSync(join(process.cwd(), "src/app/(app)/portal/textos.ts"), "utf8");

    for (const codigo of [CODIGO_COMENTARIO, CODIGO_AVISO]) {
      expect(textos, `esperava o código ${codigo} em MENSAGENS_ERRO`).toContain(`  ${codigo}: "`);
    }
  });
});

// ---------------------------------------------------------------------------
// Tarefa 36 — para ONDE cada ação volta
// ---------------------------------------------------------------------------
//
// Mesma armadilha que mordeu em `acoes-trilha.ts`: caminho escrito antes da
// tela existir aponta para uma rota que nunca nasceu, e o estrago é
// silencioso — o `redirect` de erro joga num 404 em vez de mostrar o motivo, e
// o `revalidatePath` limpa o cache de uma rota que ninguém abre, então a tela
// certa segue servindo dado velho.
describe("acoes do feed — os caminhos de volta (tarefa 36)", () => {
  function caminhoDoRedirect(): string {
    return String(redirectMock.mock.calls.at(-1)?.[0] ?? "").split("?")[0];
  }

  it("erro da gestão volta para /feed", async () => {
    duble();
    await expect(publicarPost(form({ escopo: "feed", corpo: "" }))).rejects.toThrow(/REDIRECT/);
    expect(caminhoDoRedirect()).toBe("/feed");
  });

  it("erro do mentorado volta para /portal — os avisos são um card de lá, não uma tela à parte", async () => {
    duble();
    await expect(marcarPostLido(form({ postId: "" }))).rejects.toThrow(/REDIRECT/);
    expect(caminhoDoRedirect()).toBe("/portal");

    await expect(comentar(form({ postId: POST, corpo: "" }))).rejects.toThrow(/REDIRECT/);
    expect(caminhoDoRedirect()).toBe("/portal");
  });

  it("publicar revalida as DUAS pontas: quem escreveu e quem lê", async () => {
    // Um aviso novo muda a tela da gestão e a do mentorado ao mesmo tempo.
    // Revalidar só uma deixaria a outra mostrando a lista de antes.
    revalidatePathMock.mockClear();
    duble({ mentorados: [] });

    await publicarPost(form({ escopo: "feed", corpo: "Aviso" }));

    expect(revalidatePathMock).toHaveBeenCalledWith("/feed");
    expect(revalidatePathMock).toHaveBeenCalledWith("/portal");
  });
});
