// Testes das Server Actions do funil.
//
// O QUE ESTA SUÍTE PROVA
// ----------------------
// 1) perder SEM motivo é recusado ANTES do banco — e o `check` de 0024
//    recusaria de novo lá dentro; as duas existem e não são a mesma coisa;
// 2) ganhar NÃO escreve em `mentorado`: cadastro nascendo sozinho é dado que
//    ninguém conferiu;
// 3) duas propostas seguidas geram tokens DIFERENTES, e o token nunca aparece
//    em `?erro=` nem no log;
// 4) nenhuma ação apaga nada, e nenhuma lê `workspace_id` do formulário;
// 5) erro do banco vira frase humana; o log leva só o código.

import { describe, expect, it, vi } from "vitest";

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
  criarOportunidade,
  moverOportunidade,
  ganharOportunidade,
  perderOportunidade,
  criarProposta,
  enviarProposta,
  registrarRespostaDaProposta,
  MOTIVO_PERDA_SEM_MOTIVO,
  MOTIVO_ETAPA_INVALIDA,
  MOTIVO_OPORTUNIDADE_INVALIDA,
  MOTIVO_ALUNO_INVALIDO,
  MOTIVO_VALOR_INVALIDO,
  MOTIVO_PROBABILIDADE_INVALIDA,
  MOTIVO_TITULO_VAZIO,
  MOTIVO_PROPOSTA_INVALIDA,
  MOTIVO_RESPOSTA_INVALIDA,
  MOTIVO_ERRO_SALVAR,
} = await import("./acoes");
const { tokenValido } = await import("./proposta-token");

const OPORTUNIDADE = "0f8c1c2e-4f1a-4a11-9e33-0a1b2c3d4e5f";
const ETAPA = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
const ALUNO = "7f2504e0-4f89-41d3-9a0c-0305e82c3399";
const PROPOSTA = "9f2504e0-4f89-41d3-9a0c-0305e82c3322";

interface Registro {
  tabela: string;
  operacao: string;
  valores?: Record<string, unknown>;
  eq: Array<[string, unknown]>;
}

function duble(opcoes: { erro?: { code?: string } | null } = {}) {
  const registros: Registro[] = [];
  const cliente = {
    rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
    from(tabela: string) {
      const reg: Registro = { tabela, operacao: "", eq: [] };
      const b: Record<string, unknown> = {};
      const responder = () => Promise.resolve({ error: opcoes.erro ?? null });
      b.insert = (v: Record<string, unknown>) => {
        reg.operacao = "insert";
        reg.valores = v;
        registros.push(reg);
        return responder();
      };
      b.update = (v: Record<string, unknown>) => {
        reg.operacao = "update";
        reg.valores = v;
        registros.push(reg);
        return b;
      };
      b.delete = () => {
        throw new Error("nenhuma ação do funil pode apagar linha");
      };
      b.eq = (coluna: string, valor: unknown) => {
        reg.eq.push([coluna, valor]);
        return { ...b, then: (r: (x: unknown) => unknown) => responder().then(r) };
      };
      b.then = (r: (x: unknown) => unknown) => responder().then(r);
      return b;
    },
  };
  criarSupabaseServerMock.mockReturnValue(cliente);
  return registros;
}

function form(campos: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) fd.set(k, v);
  return fd;
}

/** Roda a ação e devolve para onde ela redirecionou, ou "" se não redirecionou. */
async function destino(acao: () => Promise<void>): Promise<string> {
  try {
    await acao();
    return "";
  } catch (e) {
    const m = /^REDIRECT:(.*)$/.exec((e as Error).message);
    if (!m) throw e;
    return m[1];
  }
}

describe("perder — o motivo é obrigatório antes do banco", () => {
  it("sem motivo, nem chega a escrever", async () => {
    const registros = duble();

    const ida = await destino(() => perderOportunidade(form({ id: OPORTUNIDADE })));

    expect(registros).toHaveLength(0);
    expect(ida).toContain(encodeURIComponent(MOTIVO_PERDA_SEM_MOTIVO));
  });

  it("motivo só com espaço é o mesmo que sem motivo", async () => {
    const registros = duble();
    await destino(() => perderOportunidade(form({ id: OPORTUNIDADE, motivo: "    " })));
    expect(registros).toHaveLength(0);
  });

  it("com motivo, marca perdida e guarda o porquê e a data", async () => {
    const registros = duble();

    await destino(() =>
      perderOportunidade(form({ id: OPORTUNIDADE, motivo: "Achou caro e foi para o concorrente" })),
    );

    expect(registros).toHaveLength(1);
    expect(registros[0].tabela).toBe("oportunidade");
    expect(registros[0].operacao).toBe("update");
    expect(registros[0].valores!.status).toBe("perdida");
    expect(registros[0].valores!.motivo_perda).toBe("Achou caro e foi para o concorrente");
    expect(String(registros[0].valores!.fechado_em)).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(registros[0].eq).toContainEqual(["id", OPORTUNIDADE]);
  });
});

describe("ganhar — não cria cliente sozinho", () => {
  it("marca ganha e NÃO escreve em mentorado", async () => {
    const registros = duble();

    await destino(() => ganharOportunidade(form({ id: OPORTUNIDADE })));

    expect(registros.map((r) => r.tabela)).toEqual(["oportunidade"]);
    expect(registros[0].valores!.status).toBe("ganha");
    // Nem cria mentorado, nem preenche o vínculo por conta própria: a
    // oportunidade ganha com `mentorado_id` nulo É o rascunho que alguém
    // confirma.
    expect(Object.keys(registros[0].valores!)).not.toContain("mentorado_id");
    expect(registros[0].valores!.motivo_perda).toBeUndefined();
  });
});

describe("mover — a etapa vem de fora, o inquilino não", () => {
  it("troca só a etapa, filtrando pelo id", async () => {
    const registros = duble();

    await destino(() => moverOportunidade(form({ id: OPORTUNIDADE, etapaId: ETAPA })));

    expect(registros[0].operacao).toBe("update");
    expect(registros[0].valores).toEqual({ etapa_id: ETAPA });
    expect(registros[0].eq).toContainEqual(["id", OPORTUNIDADE]);
  });

  it("etapa fora de forma é recusada antes do banco", async () => {
    const registros = duble();
    const ida = await destino(() => moverOportunidade(form({ id: OPORTUNIDADE, etapaId: "1 OR 1=1" })));
    expect(registros).toHaveLength(0);
    expect(ida).toContain(encodeURIComponent(MOTIVO_ETAPA_INVALIDA));
  });

  it("id fora de forma é recusado antes do banco", async () => {
    const registros = duble();
    const ida = await destino(() => moverOportunidade(form({ id: "x", etapaId: ETAPA })));
    expect(registros).toHaveLength(0);
    expect(ida).toContain(encodeURIComponent(MOTIVO_OPORTUNIDADE_INVALIDA));
  });

  it("workspace mandado no formulário é IGNORADO — quem decide o inquilino é o banco", async () => {
    const registros = duble();

    await destino(() =>
      moverOportunidade(form({ id: OPORTUNIDADE, etapaId: ETAPA, workspace_id: "ws-de-outro" })),
    );

    expect(JSON.stringify(registros[0].valores)).not.toContain("workspace");
    expect(JSON.stringify(registros[0].valores)).not.toContain("ws-de-outro");
  });
});

describe("criar oportunidade", () => {
  const bom = { alunoId: ALUNO, etapaId: ETAPA, valor: "2500", probabilidade: "40", origem: "indicacao" };

  it("nasce aberta, sem workspace e sem data de fechamento", async () => {
    const registros = duble();

    await destino(() => criarOportunidade(form(bom)));

    expect(registros[0].operacao).toBe("insert");
    const v = registros[0].valores!;
    expect(v.status).toBe("aberta");
    expect(v.aluno_id).toBe(ALUNO);
    expect(v.etapa_id).toBe(ETAPA);
    expect(v.valor).toBe(2500);
    expect(v.probabilidade).toBe(40);
    expect(Object.keys(v)).not.toContain("workspace_id");
    expect(Object.keys(v)).not.toContain("fechado_em");
  });

  it("recusa aluno e etapa fora de forma", async () => {
    let registros = duble();
    let ida = await destino(() => criarOportunidade(form({ ...bom, alunoId: "" })));
    expect(registros).toHaveLength(0);
    expect(ida).toContain(encodeURIComponent(MOTIVO_ALUNO_INVALIDO));

    registros = duble();
    ida = await destino(() => criarOportunidade(form({ ...bom, etapaId: "nao-uuid" })));
    expect(registros).toHaveLength(0);
    expect(ida).toContain(encodeURIComponent(MOTIVO_ETAPA_INVALIDA));
  });

  it("recusa valor negativo e probabilidade fora de 0 a 100", async () => {
    for (const [campo, valor, motivo] of [
      ["valor", "-1", MOTIVO_VALOR_INVALIDO],
      ["valor", "abc", MOTIVO_VALOR_INVALIDO],
      ["probabilidade", "101", MOTIVO_PROBABILIDADE_INVALIDA],
      ["probabilidade", "-5", MOTIVO_PROBABILIDADE_INVALIDA],
      ["probabilidade", "40.5", MOTIVO_PROBABILIDADE_INVALIDA],
      ["probabilidade", "40,5", MOTIVO_PROBABILIDADE_INVALIDA],
    ] as const) {
      const registros = duble();
      const ida = await destino(() => criarOportunidade(form({ ...bom, [campo]: valor })));
      expect(registros, `esperava recusar ${campo}=${valor}`).toHaveLength(0);
      expect(ida).toContain(encodeURIComponent(motivo));
    }
  });
});

describe("proposta", () => {
  it("duas propostas seguidas nascem com tokens DIFERENTES e válidos", async () => {
    const campos = { oportunidadeId: OPORTUNIDADE, titulo: "Mentoria 6 meses", corpo: "Escopo", valor: "3000" };

    const primeiros = duble();
    await destino(() => criarProposta(form(campos)));
    const segundos = duble();
    await destino(() => criarProposta(form(campos)));

    const a = String(primeiros[0].valores!.token);
    const b = String(segundos[0].valores!.token);

    expect(tokenValido(a)).toBe(true);
    expect(tokenValido(b)).toBe(true);
    expect(a).not.toBe(b);
    // Nasce rascunho: enviar é outro clique, e é ele que abre o link.
    expect(primeiros[0].valores!.status).toBe("rascunho");
  });

  it("o token não sai da ação NEM quando dá certo", async () => {
    // O caminho feliz é o que mais convida ao vazamento: seria natural
    // devolver o link novo na URL para a tela mostrar. Isso põe um segredo no
    // histórico do navegador e em qualquer captura de tela.
    redirectMock.mockClear();
    revalidatePathMock.mockClear();
    const registros = duble();

    await destino(() =>
      criarProposta(form({ oportunidadeId: OPORTUNIDADE, titulo: "Proposta", corpo: "x", valor: "10" })),
    );

    const token = String(registros[0].valores!.token);
    expect(token.length).toBeGreaterThan(20);
    const saidas = [
      ...redirectMock.mock.calls.map((c) => String(c[0])),
      ...revalidatePathMock.mock.calls.map((c) => String(c[0])),
    ].join(" | ");
    expect(saidas).not.toContain(token);
  });

  it("o token não aparece no redirecionamento nem no log quando dá erro", async () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    // A mensagem de uma violação de unicidade no PostgREST ecoa o VALOR que
    // colidiu — no caso de `proposta.token`, o token inteiro. Por isso o log
    // leva só o código.
    const registros = duble({
      erro: {
        code: "23505",
        message: 'duplicate key value violates unique constraint "proposta_token_key"',
      } as { code?: string },
    });

    const ida = await destino(() =>
      criarProposta(form({ oportunidadeId: OPORTUNIDADE, titulo: "Proposta", corpo: "x", valor: "10" })),
    );

    const token = String(registros[0].valores!.token);
    expect(ida).not.toContain(token);
    expect(ida).toContain(encodeURIComponent(MOTIVO_ERRO_SALVAR));
    const registrado = aviso.mock.calls.map((c) => c.join(" ")).join(" | ");
    expect(registrado).toContain("23505");
    expect(registrado).not.toContain(token);
    expect(registrado).not.toContain("duplicate key");
    aviso.mockRestore();
  });

  it("proposta sem título é recusada antes do banco", async () => {
    const registros = duble();
    const ida = await destino(() =>
      criarProposta(form({ oportunidadeId: OPORTUNIDADE, titulo: "   ", corpo: "x", valor: "10" })),
    );
    expect(registros).toHaveLength(0);
    expect(ida).toContain(encodeURIComponent(MOTIVO_TITULO_VAZIO));
  });

  it("validade fora de forma é recusada, e ausência de validade é aceita", async () => {
    let registros = duble();
    await destino(() =>
      criarProposta(form({ oportunidadeId: OPORTUNIDADE, titulo: "t", corpo: "c", valor: "10", validade: "31/12/2026" })),
    );
    expect(registros).toHaveLength(0);

    registros = duble();
    await destino(() =>
      criarProposta(form({ oportunidadeId: OPORTUNIDADE, titulo: "t", corpo: "c", valor: "10" })),
    );
    expect(registros[0].valores!.validade).toBeNull();
  });

  it("enviar muda o status, e id torto não chega ao banco", async () => {
    const registros = duble();
    await destino(() => enviarProposta(form({ id: PROPOSTA, oportunidadeId: OPORTUNIDADE })));
    expect(registros[0].valores).toEqual({ status: "enviada" });
    expect(registros[0].eq).toContainEqual(["id", PROPOSTA]);

    const outros = duble();
    const ida = await destino(() => enviarProposta(form({ id: "torto", oportunidadeId: OPORTUNIDADE })));
    expect(outros).toHaveLength(0);
    expect(ida).toContain(encodeURIComponent(MOTIVO_PROPOSTA_INVALIDA));
  });

  it("a resposta do cliente só pode ser aceita ou recusada", async () => {
    for (const resposta of ["aceita", "recusada"]) {
      const registros = duble();
      await destino(() =>
        registrarRespostaDaProposta(form({ id: PROPOSTA, oportunidadeId: OPORTUNIDADE, resposta })),
      );
      expect(registros[0].valores).toEqual({ status: resposta });
    }

    for (const resposta of ["enviada", "rascunho", "expirada", "aceito", ""]) {
      const registros = duble();
      const ida = await destino(() =>
        registrarRespostaDaProposta(form({ id: PROPOSTA, oportunidadeId: OPORTUNIDADE, resposta })),
      );
      expect(registros, `esperava recusar resposta=${resposta}`).toHaveLength(0);
      expect(ida).toContain(encodeURIComponent(MOTIVO_RESPOSTA_INVALIDA));
    }
  });
});

describe("o que nenhuma ação faz", () => {
  it("nenhuma apaga linha — o dublê estoura se alguém tentar", async () => {
    // `.delete()` no dublê lança. Se qualquer ação chamasse, o teste
    // quebraria aqui em vez de sumir com histórico de negociação.
    const acoes: Array<[string, () => Promise<void>]> = [
      ["criar", () => criarOportunidade(form({ alunoId: ALUNO, etapaId: ETAPA, valor: "1", probabilidade: "0" }))],
      ["mover", () => moverOportunidade(form({ id: OPORTUNIDADE, etapaId: ETAPA }))],
      ["ganhar", () => ganharOportunidade(form({ id: OPORTUNIDADE }))],
      ["perder", () => perderOportunidade(form({ id: OPORTUNIDADE, motivo: "preço" }))],
      ["proposta", () => criarProposta(form({ oportunidadeId: OPORTUNIDADE, titulo: "t", corpo: "c", valor: "1" }))],
      ["enviar", () => enviarProposta(form({ id: PROPOSTA, oportunidadeId: OPORTUNIDADE }))],
    ];

    for (const [nome, acao] of acoes) {
      const registros = duble();
      await destino(acao);
      expect(registros.every((r) => r.operacao !== "delete"), `${nome} apagou`).toBe(true);
    }
  });

  it("erro do banco vira frase humana, e o log leva só o código", async () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    duble({ erro: { code: "42501" } });

    const ida = await destino(() => ganharOportunidade(form({ id: OPORTUNIDADE })));

    expect(ida).toContain(encodeURIComponent(MOTIVO_ERRO_SALVAR));
    expect(aviso.mock.calls.map((c) => c.join(" ")).join(" ")).toContain("42501");
    aviso.mockRestore();
  });
});
