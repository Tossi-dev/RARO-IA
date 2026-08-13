// Testes de `documentos/dados.ts` — a camada que LÊ os documentos do Supabase.
//
// Dublê do cliente via `vi.mock` em "../supabase/server", exatamente como
// `src/lib/mentoria/dados.test.ts` faz (e pelo mesmo motivo): o teste não fala
// com um Postgres de verdade, só prova que `dados.ts` reage certo ao que o
// cliente devolve. RLS é assunto de `src/lib/supabase/migracoes.test.ts`.
//
// `vi.hoisted` porque `vi.mock` é içado para o topo do arquivo pelo transform
// do Vitest, antes de qualquer `const` comum — sem isto o mock cairia em TDZ
// quando a fábrica fosse executada.
//
// O dublê CONTA chamadas de propósito: a asserção mais importante deste
// arquivo não é sobre o que volta, é sobre o que NÃO acontece — sem Supabase
// configurado, nenhuma consulta pode ser tentada (regra 1 da casa: sem
// conexão, a tela DIZ que não tem, e ninguém sai perguntando ao vazio).

import { afterEach, describe, expect, it, vi } from "vitest";

const { criarSupabaseServerMock } = vi.hoisted(() => ({
  criarSupabaseServerMock: vi.fn(),
}));

vi.mock("../supabase/server", () => ({
  criarSupabaseServer: criarSupabaseServerMock,
}));

const { lerDocumentosDoMentorado, lerDocumentosDoNegocio, linhaParaDocumento } = await import("./dados");

// ============================================================
// Dublê do cliente Supabase
// ============================================================

type RespostaTabela = {
  data: unknown;
  error: { code?: string; message?: string } | null;
};

/** Uma passagem por `.from(tabela)`, com os filtros que vieram encadeados. */
type ChamadaRegistrada = {
  tabela: string;
  /**
   * `[operador, coluna, valor]` de cada `.eq()`/`.is()`. O OPERADOR entra no
   * registro de propósito: `is null` e `eq null` são a mesma chamada com o
   * mesmo par coluna/valor, e no PostgREST são coisas opostas — `mentorado_id=eq.null`
   * vira `= NULL`, que nunca é verdadeiro, e a lista do negócio voltaria vazia
   * PARA SEMPRE com cara de resposta ("não há documentos do negócio") sem nunca
   * ter perguntado direito. Sem o operador aqui, o dublê deixaria essa troca
   * passar despercebida.
   */
  filtros: Array<[string, string, unknown]>;
};

/**
 * Builder mínimo: encadeia `.select()`/`.eq()`/`.is()`/`.order()` e resolve
 * como Promise quando `await`ado — é assim que o supabase-js se comporta de
 * verdade (o builder É um PromiseLike), e é só isso que `dados.ts` usa.
 *
 * O builder NÃO aplica os filtros que recebe: quem decide a resposta é o
 * teste. Isso é proposital e é o que dá valor ao caso do arquivado — se o
 * filtro de `arquivado` vivesse só na consulta, o dublê devolveria a linha
 * arquivada assim mesmo e o teste falharia. Ou seja: este arquivo só passa se
 * a lista padrão for filtrada em memória, do lado de cá.
 *
 * `jogaExcecaoEm`: quando `.from(tabela)` é chamado com esse nome, lança uma
 * exceção síncrona em vez de devolver um builder — simula o cliente quebrando
 * antes mesmo de montar a query (rede fora, cliente mal configurado), que é
 * caminho diferente do `error` normal do supabase-js.
 */
function construirCliente(respostas: Record<string, RespostaTabela>, jogaExcecaoEm?: string) {
  const chamadas: ChamadaRegistrada[] = [];

  const fromMock = vi.fn((tabela: string) => {
    if (jogaExcecaoEm === tabela) {
      throw new Error("falha de rede simulada");
    }
    const registro: ChamadaRegistrada = { tabela, filtros: [] };
    chamadas.push(registro);

    const resposta: RespostaTabela = respostas[tabela] ?? { data: [], error: null };
    const builder = {
      select: () => builder,
      eq: (coluna: string, valor: unknown) => {
        registro.filtros.push(["eq", coluna, valor]);
        return builder;
      },
      is: (coluna: string, valor: unknown) => {
        registro.filtros.push(["is", coluna, valor]);
        return builder;
      },
      order: () => builder,
      then: (resolve: (v: RespostaTabela) => void, reject: (e: unknown) => void) =>
        Promise.resolve(resposta).then(resolve, reject),
    };
    return builder;
  });

  return { cliente: { from: fromMock }, chamadas, fromMock };
}

function ligarCliente(respostas: Record<string, RespostaTabela>, jogaExcecaoEm?: string) {
  const duble = construirCliente(respostas, jogaExcecaoEm);
  criarSupabaseServerMock.mockReturnValue(duble.cliente);
  return duble;
}

function ligarSupabase() {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://exemplo-teste.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "chave-anonima-de-teste");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});

// ============================================================
// Fixtures — linhas CRUAS (snake_case), como o Postgres devolveria,
// espelhando `supabase/migrations/0015_documento.sql`.
// ============================================================

function linhaDocumento(parcial: Partial<Record<string, unknown>> = {}) {
  return {
    id: "doc-1",
    workspace_id: "00000000-0000-0000-0000-000000000001",
    mentorado_id: "ment-1",
    aluno_id: null,
    titulo: "Contrato assinado",
    caminho_storage: "00000000-0000-0000-0000-000000000001/contrato/doc-1/contrato.pdf",
    mime: "application/pdf",
    bytes: 2048,
    categoria: "contrato",
    visivel_portal: false,
    enviado_por: null,
    criado_em: "2026-02-01T10:00:00Z",
    arquivado: false,
    ...parcial,
  };
}

// ============================================================
// Regra 1 — sem Supabase configurado, ZERO consulta
// ============================================================

describe("sem Supabase configurado", () => {
  it("lerDocumentosDoMentorado devolve conectado:false, documentos:[] e não faz NENHUMA consulta", async () => {
    const resultado = await lerDocumentosDoMentorado("ment-1");

    expect(resultado.conectado).toBe(false);
    expect(resultado.documentos).toEqual([]);
    expect(resultado.motivo.length).toBeGreaterThan(0);
    expect(criarSupabaseServerMock).not.toHaveBeenCalled();
  });

  it("lerDocumentosDoNegocio devolve conectado:false, documentos:[] e não faz NENHUMA consulta", async () => {
    const resultado = await lerDocumentosDoNegocio();

    expect(resultado.conectado).toBe(false);
    expect(resultado.documentos).toEqual([]);
    expect(resultado.motivo.length).toBeGreaterThan(0);
    expect(criarSupabaseServerMock).not.toHaveBeenCalled();
  });

  it("o motivo não menciona tabela, coluna nem SQL — quem lê a tela não é quem depura", async () => {
    const { motivo } = await lerDocumentosDoMentorado("ment-1");
    const texto = motivo.toLowerCase();

    expect(texto).not.toContain("documento");
    expect(texto).not.toContain("select");
    expect(texto).not.toContain("mentorado_id");
    expect(texto).not.toContain("supabase");
  });
});

// ============================================================
// Regra 2 — erro de leitura não vaza detalhe técnico para a tela
// ============================================================

describe("erro do supabase-js", () => {
  it("vira conectado:false com motivo genérico, sem nome de tabela, sem 'select' e sem o texto do erro", async () => {
    ligarSupabase();
    ligarCliente({
      documento: {
        data: null,
        error: { code: "42501", message: 'permission denied for table "documento"' },
      },
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const resultado = await lerDocumentosDoMentorado("ment-1");
    const texto = resultado.motivo.toLowerCase();

    expect(resultado.conectado).toBe(false);
    expect(resultado.documentos).toEqual([]);
    expect(resultado.motivo.length).toBeGreaterThan(0);
    expect(texto).not.toContain("documento");
    expect(texto).not.toContain("select");
    expect(texto).not.toContain("permission denied");
    expect(texto).not.toContain("42501");

    // O detalhe técnico existe — só que no log, e em nenhum outro lugar.
    expect(warnSpy).toHaveBeenCalled();
    const argumentos = warnSpy.mock.calls[0].join(" ");
    expect(argumentos).toContain("42501");

    warnSpy.mockRestore();
  });

  it("erro na leitura do negócio recebe o mesmo tratamento", async () => {
    ligarSupabase();
    ligarCliente({
      documento: { data: null, error: { code: "PGRST301", message: "JWT expired" } },
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const resultado = await lerDocumentosDoNegocio();

    expect(resultado.conectado).toBe(false);
    expect(resultado.documentos).toEqual([]);
    expect(resultado.motivo.toLowerCase()).not.toContain("jwt");

    warnSpy.mockRestore();
  });

  it("exceção síncrona do cliente não sobe para quem chamou — vira o mesmo formato", async () => {
    ligarSupabase();
    ligarCliente({}, "documento");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const resultado = await lerDocumentosDoMentorado("ment-1");

    expect(resultado.conectado).toBe(false);
    expect(resultado.documentos).toEqual([]);
    expect(resultado.motivo.toLowerCase()).not.toContain("rede");

    warnSpy.mockRestore();
  });

  it("exceção síncrona na leitura do negócio também vira desconectado, NUNCA lista vazia conectada", async () => {
    ligarSupabase();
    ligarCliente({}, "documento");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const resultado = await lerDocumentosDoNegocio();

    // "não consegui perguntar" NÃO pode se passar por "não há documentos do
    // negócio": é a distinção que este arquivo inteiro existe para manter, e
    // ela precisa valer nos DOIS caminhos de leitura, não só no do mentorado.
    expect(resultado.conectado).toBe(false);
    expect(resultado.motivo.length).toBeGreaterThan(0);
    expect(resultado.documentos).toEqual([]);
    expect(resultado.motivo.toLowerCase()).not.toContain("rede");
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it("data null sem erro nenhum vira lista vazia CONECTADA — conectou e não achou é diferente de não conectou", async () => {
    ligarSupabase();
    ligarCliente({ documento: { data: null, error: null } });

    const resultado = await lerDocumentosDoMentorado("ment-1");

    expect(resultado.conectado).toBe(true);
    expect(resultado.motivo).toBe("");
    expect(resultado.documentos).toEqual([]);
  });
});

// ============================================================
// linhaParaDocumento — normalização campo a campo
// ============================================================

describe("linhaParaDocumento", () => {
  it("campo faltando vira valor neutro, e NUNCA undefined", () => {
    // A linha vem VAZIA de propósito: uma fixture que entrega `id`,
    // `workspace_id` e `caminho_storage` prontos não deixa o laço lá embaixo
    // provar nada sobre eles — e `caminho_storage` é o campo que vira URL
    // assinada do Storage, onde `undefined` não dá tela vazia, dá caminho
    // "undefined" ou exceção.
    const documento = linhaParaDocumento({});

    expect(documento.id).toBe("");
    expect(documento.workspaceId).toBe("");
    expect(documento.caminhoStorage).toBe("");
    expect(documento.criadoEm).toBe("");
    expect(documento.bytes).toBeNull();
    expect(documento.titulo).toBe("");
    expect(documento.mime).toBe("");
    expect(documento.mentoradoId).toBeNull();
    expect(documento.alunoId).toBeNull();
    expect(documento.enviadoPor).toBeNull();
    expect(documento.visivelPortal).toBe(false);
    expect(documento.arquivado).toBe(false);
    expect(documento.categoria).toBe("outro");

    // Nenhum campo pode chegar `undefined` na tela — quem renderiza não tem
    // como distinguir "não veio" de "veio vazio".
    for (const [campo, valor] of Object.entries(documento)) {
      expect(valor, `campo ${campo} veio undefined`).not.toBeUndefined();
    }

    // O laço acima só vale se ele varrer o contrato INTEIRO: campo novo que
    // entre em `Documento` sem normalizador passaria despercebido aqui.
    expect(Object.keys(documento).sort()).toEqual(
      [
        "alunoId",
        "arquivado",
        "bytes",
        "caminhoStorage",
        "categoria",
        "criadoEm",
        "enviadoPor",
        "id",
        "mentoradoId",
        "mime",
        "titulo",
        "visivelPortal",
        "workspaceId",
      ].sort()
    );
  });

  it("id que é só espaço em branco conta como ausência — chave que não aponta para nada é pior que nula", () => {
    expect(linhaParaDocumento({ mentorado_id: "   " }).mentoradoId).toBeNull();
    expect(linhaParaDocumento({ aluno_id: "\t\n" }).alunoId).toBeNull();
    expect(linhaParaDocumento({ enviado_por: " " }).enviadoPor).toBeNull();
    // E o id de verdade continua chegando limpo dos dois lados.
    expect(linhaParaDocumento({ mentorado_id: " ment-7 " }).mentoradoId).toBe("ment-7");
  });

  it("bytes ausente NÃO vira 0 — tamanho que ninguém mediu é null, nunca zero disfarçado de dado", () => {
    expect(linhaParaDocumento({ bytes: null }).bytes).toBeNull();
    expect(linhaParaDocumento({ bytes: undefined }).bytes).toBeNull();
    expect(linhaParaDocumento({ bytes: "" }).bytes).toBeNull();
    expect(linhaParaDocumento({ bytes: 0 }).bytes).toBeNull();
    expect(linhaParaDocumento({ bytes: -5 }).bytes).toBeNull();
    expect(linhaParaDocumento({ bytes: "não é número" }).bytes).toBeNull();
  });

  it("bytes de verdade é preservado, inclusive quando o PostgREST manda bigint como texto", () => {
    expect(linhaParaDocumento({ bytes: 2048 }).bytes).toBe(2048);
    expect(linhaParaDocumento({ bytes: "2048" }).bytes).toBe(2048);
    expect(linhaParaDocumento({ bytes: " 2048 " }).bytes).toBe(2048);
  });

  it("texto que só PARECE número não vira tamanho — 0x10 não são 16 bytes, é lixo", () => {
    // `Number()` sozinho aceita hexadecimal, notação científica e sinal, e
    // devolveria um tamanho que ninguém mediu: número inventado na leitura, que
    // é exatamente o que a casa proíbe. Só dígitos passam.
    expect(linhaParaDocumento({ bytes: "0x10" }).bytes).toBeNull();
    expect(linhaParaDocumento({ bytes: "1e3" }).bytes).toBeNull();
    expect(linhaParaDocumento({ bytes: "+2048" }).bytes).toBeNull();
    expect(linhaParaDocumento({ bytes: "2048.5" }).bytes).toBeNull();
    expect(linhaParaDocumento({ bytes: "12,5" }).bytes).toBeNull();
    expect(linhaParaDocumento({ bytes: "Infinity" }).bytes).toBeNull();
  });

  it("byte fracionário e bigint fora do alcance seguro viram null — meio byte não existe, e o que não cabe não dá para afirmar", () => {
    expect(linhaParaDocumento({ bytes: 1.5 }).bytes).toBeNull();
    expect(linhaParaDocumento({ bytes: Infinity }).bytes).toBeNull();

    // Acima de 2^53 o `Number` do JS ARREDONDA: "9007199254740993" viraria
    // ...992, um byte a menos do que o banco disse, apresentado como exato.
    // Preferimos dizer "não sei" a dizer um número quase certo.
    expect(linhaParaDocumento({ bytes: "9007199254740993" }).bytes).toBeNull();
    expect(linhaParaDocumento({ bytes: String(Number.MAX_SAFE_INTEGER) }).bytes).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("categoria desconhecida cai em 'outro' (fail-closed), e variação de caixa/espaço é tolerada", () => {
    expect(linhaParaDocumento({ categoria: "contrato" }).categoria).toBe("contrato");
    expect(linhaParaDocumento({ categoria: " Anamnese " }).categoria).toBe("anamnese");
    expect(linhaParaDocumento({ categoria: "categoria_nova_do_futuro" }).categoria).toBe("outro");
    expect(linhaParaDocumento({ categoria: null }).categoria).toBe("outro");
    expect(linhaParaDocumento({ categoria: 7 }).categoria).toBe("outro");
  });

  it("visivel_portal só é verdadeiro quando o banco disse que sim", () => {
    expect(linhaParaDocumento({ visivel_portal: true }).visivelPortal).toBe(true);
    expect(linhaParaDocumento({ visivel_portal: undefined }).visivelPortal).toBe(false);
    expect(linhaParaDocumento({ visivel_portal: null }).visivelPortal).toBe(false);
  });

  it("mapeia snake_case para camelCase sem perder campo nenhum", () => {
    const documento = linhaParaDocumento(linhaDocumento({ aluno_id: "alu-1", enviado_por: "perf-1" }));

    expect(documento).toEqual({
      id: "doc-1",
      workspaceId: "00000000-0000-0000-0000-000000000001",
      mentoradoId: "ment-1",
      alunoId: "alu-1",
      titulo: "Contrato assinado",
      caminhoStorage: "00000000-0000-0000-0000-000000000001/contrato/doc-1/contrato.pdf",
      mime: "application/pdf",
      bytes: 2048,
      categoria: "contrato",
      visivelPortal: false,
      enviadoPor: "perf-1",
      criadoEm: "2026-02-01T10:00:00Z",
      arquivado: false,
    });
  });
});

// ============================================================
// A lista padrão
// ============================================================

describe("lista padrão", () => {
  it("documento com arquivado:true não entra", async () => {
    ligarSupabase();
    ligarCliente({
      documento: {
        data: [
          linhaDocumento({ id: "doc-vivo", arquivado: false }),
          linhaDocumento({ id: "doc-arquivado", arquivado: true }),
        ],
        error: null,
      },
    });

    const { documentos } = await lerDocumentosDoMentorado("ment-1");

    expect(documentos.map((d) => d.id)).toEqual(["doc-vivo"]);
  });

  it("arquivado também fica de fora da lista do negócio", async () => {
    ligarSupabase();
    ligarCliente({
      documento: {
        data: [linhaDocumento({ id: "doc-arquivado", mentorado_id: null, arquivado: true })],
        error: null,
      },
    });

    const { conectado, documentos } = await lerDocumentosDoNegocio();

    expect(conectado).toBe(true);
    expect(documentos).toEqual([]);
  });

  it("quem PEDE os arquivados os recebe — a linha não sumiu, só saiu da lista padrão", async () => {
    ligarSupabase();
    ligarCliente({
      documento: {
        data: [
          linhaDocumento({ id: "doc-vivo", arquivado: false }),
          linhaDocumento({ id: "doc-arquivado", arquivado: true }),
        ],
        error: null,
      },
    });

    const { documentos } = await lerDocumentosDoMentorado("ment-1", { incluirArquivados: true });

    expect(documentos.map((d) => d.id).sort()).toEqual(["doc-arquivado", "doc-vivo"]);
  });

  it("incluirArquivados:false EXPLÍCITO deixa o arquivado de fora, igualzinho a não passar nada", async () => {
    ligarSupabase();
    ligarCliente({
      documento: {
        data: [
          linhaDocumento({ id: "doc-vivo", arquivado: false }),
          linhaDocumento({ id: "doc-arquivado", arquivado: true }),
        ],
        error: null,
      },
    });

    // Uma tela com caixa de seleção manda o estado do campo, não `undefined`.
    // Se `false` explícito ligasse o histórico, a lista contradiria o filtro que
    // a própria tela diz estar aplicando.
    const { documentos } = await lerDocumentosDoMentorado("ment-1", { incluirArquivados: false });

    expect(documentos.map((d) => d.id)).toEqual(["doc-vivo"]);
  });

  it("incluirArquivados:false EXPLÍCITO também vale para a lista do negócio", async () => {
    ligarSupabase();
    ligarCliente({
      documento: {
        data: [linhaDocumento({ id: "doc-arquivado", mentorado_id: null, arquivado: true })],
        error: null,
      },
    });

    const { documentos } = await lerDocumentosDoNegocio({ incluirArquivados: false });

    expect(documentos).toEqual([]);
  });

  it("ordena do mais recente para o mais antigo, e data inválida vai para o fim sem quebrar a ordem", async () => {
    ligarSupabase();
    ligarCliente({
      documento: {
        data: [
          linhaDocumento({ id: "antigo", criado_em: "2026-01-01T00:00:00Z" }),
          linhaDocumento({ id: "torto", criado_em: "data-que-não-é-data" }),
          linhaDocumento({ id: "novo", criado_em: "2026-06-01T00:00:00Z" }),
        ],
        error: null,
      },
    });

    const { documentos } = await lerDocumentosDoMentorado("ment-1");

    expect(documentos.map((d) => d.id)).toEqual(["novo", "antigo", "torto"]);
  });
});

// ============================================================
// O recorte de cada consulta
// ============================================================

describe("recorte da consulta", () => {
  it("lerDocumentosDoMentorado filtra pelo mentorado pedido, em uma única consulta a `documento`", async () => {
    ligarSupabase();
    const { chamadas, fromMock } = ligarCliente({
      documento: { data: [linhaDocumento()], error: null },
    });

    await lerDocumentosDoMentorado("ment-42");

    expect(fromMock).toHaveBeenCalledTimes(1);
    expect(chamadas[0].tabela).toBe("documento");
    expect(chamadas[0].filtros).toContainEqual(["eq", "mentorado_id", "ment-42"]);
  });

  it("lerDocumentosDoNegocio pede as linhas SEM dono — mentorado_id nulo é o documento do negócio", async () => {
    ligarSupabase();
    const { chamadas, fromMock } = ligarCliente({
      documento: { data: [linhaDocumento({ mentorado_id: null })], error: null },
    });

    const { documentos } = await lerDocumentosDoNegocio();

    expect(fromMock).toHaveBeenCalledTimes(1);
    expect(chamadas[0].tabela).toBe("documento");
    // `is` e não `eq`: em SQL `mentorado_id = null` não é falso, é NULO, e a
    // consulta não devolveria linha nenhuma — nunca. A troca de operador é
    // invisível no resultado do dublê, então o teste olha para o operador.
    expect(chamadas[0].filtros).toContainEqual(["is", "mentorado_id", null]);
    expect(chamadas[0].filtros).not.toContainEqual(["eq", "mentorado_id", null]);
    expect(documentos).toHaveLength(1);
    expect(documentos[0].mentoradoId).toBeNull();
  });
});
