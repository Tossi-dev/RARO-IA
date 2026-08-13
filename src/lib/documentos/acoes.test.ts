// Testes de `documentos/acoes.ts` — as Server Actions que ESCREVEM documento:
// anexar (Storage + linha), arquivar e publicar/despublicar no portal.
//
// MÉTODO TDD: este arquivo nasceu ANTES de `acoes.ts` — cada bloco abaixo
// rodou contra um módulo que ainda não existia, falhou, e só depois ganhou
// implementação.
//
// Dublê do cliente Supabase via `vi.mock` ("../supabase/server"), mesmo
// espírito de `src/lib/mentoria/acoes.test.ts` e de `./dados.test.ts`: nada
// aqui fala com um Postgres nem com um Storage de verdade. Quem decide se
// ESTA pessoa pode anexar é a RLS do 0015 (tabela E bucket), e isso é assunto
// de `src/lib/supabase/migracoes.test.ts` — não dá para exercitar política de
// banco com objeto em memória.
//
// `vi.hoisted` porque `vi.mock` é içado para o topo pelo transform do Vitest,
// antes de qualquer `const` comum.
//
// AS CINCO ASSERÇÕES QUE ESTA SUÍTE EXISTE PARA SUSTENTAR (Tarefa 7 do
// docs/PLANO-FASE-2.md), em ordem de gravidade:
//
//   1) NÃO APAGA. Nenhuma função do arquivo chama `.delete()` (tabela) nem
//      `remove()` (bucket). O teste lê o PRÓPRIO FONTE, como já se faz para
//      "nunca apagar" em `migracoes.test.ts` — dublê nenhum prova ausência de
//      um caminho que ninguém percorreu no teste.
//   2) Arquivo reprovado por `tipoPermitido` NÃO chega ao Storage: o dublê do
//      upload FALHA se for chamado.
//   3) `mentorado_id` vem do formulário e é gravado; `workspace_id` NÃO é
//      aceito do formulário — a linha nasce com o default do banco e a pasta
//      do Storage vem de `workspace_atual()`, resolvido DENTRO do banco.
//   4) Erro do Storage não deixa linha órfã: o insert só acontece DEPOIS de o
//      upload dar certo.
//   5) A URL de redirect nunca carrega o texto do erro do banco, só um CÓDIGO
//      curto (a correção MÉDIO 5 descrita no cabeçalho de `acoes-portal.ts`).
//
// Os blocos 6 e 7, no fim do arquivo, nasceram de uma REVISÃO: cada um existe
// porque um defeito plantado naquele ponto exato passava com a suíte inteira
// verde. Um teste que não morre com o defeito dentro não é rede, é decoração —
// então cada bloco lá embaixo diz, no comentário, qual defeito ele mata.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
// A lista das categorias vem de `validacao.ts` (que espelha o enum do 0015) em
// vez de ser recopiada aqui: uma categoria nova entra automaticamente na
// varredura de `visivel_portal` abaixo, que é justamente onde a cópia
// desatualizada custaria caro.
import { CATEGORIA_DOCUMENTO_VALORES } from "./validacao";

const { criarSupabaseServerMock, redirectMock, revalidatePathMock } = vi.hoisted(() => ({
  criarSupabaseServerMock: vi.fn(),
  redirectMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}));

vi.mock("../supabase/server", () => ({
  criarSupabaseServer: criarSupabaseServerMock,
}));

// `redirect()` de verdade LANÇA (é assim que o Next interrompe a Server
// Action) — mas o dublê aqui, de propósito, NÃO lança: é o jeito de provar que
// `acoes.ts` não depende da exceção para parar de escrever. Sem o `return`
// explícito depois de cada erro, os testes de "entrada inválida" veriam
// upload/insert acontecendo mesmo assim.
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));

const { anexarDocumento, arquivarDocumento, alternarVisivelPortal } = await import("./acoes");

// ============================================================
// Dublê do cliente Supabase — tabela, storage, rpc e auth
// ============================================================

type ErroSupabase = { code?: string; message?: string };

interface OpcoesCliente {
  erroInsert?: ErroSupabase | null;
  erroUpdate?: ErroSupabase | null;
  erroUpload?: ErroSupabase | null;
  erroRpc?: ErroSupabase | null;
  /** O que `workspace_atual()` devolve. `undefined` = o workspace de teste. */
  workspaceAtual?: unknown;
  /** Quando `true`, chamar `upload` LANÇA — é assim que o teste 2 prova que o arquivo reprovado nem chega ao bucket. */
  uploadProibido?: boolean;
}

const WORKSPACE = "11111111-1111-1111-1111-111111111111";

/** Um uuid QUALQUER, diferente de `WORKSPACE`: é o que o formulário tenta (e não consegue) impor. */
const WORKSPACE_FORJADO = "99999999-9999-9999-9999-999999999999";

function construirCliente(opcoes: OpcoesCliente = {}) {
  // Os parâmetros são NOMEADOS (mesmo sem serem usados) porque é isso que dá
  // tipo a `mock.calls[0][0]`: com `vi.fn(() => ...)` o TypeScript entende a
  // lista de argumentos como tupla vazia, e toda asserção sobre a LINHA que
  // foi gravada viraria erro de compilação.
  const insertMock = vi.fn((_linha: Record<string, unknown>) =>
    Promise.resolve({ data: null, error: opcoes.erroInsert ?? null })
  );
  const eqMock = vi.fn((_coluna: string, _valor: unknown) =>
    Promise.resolve({ data: null, error: opcoes.erroUpdate ?? null })
  );
  const updateMock = vi.fn((_campos: Record<string, unknown>) => ({ eq: eqMock }));
  const deleteEqMock = vi.fn(() => Promise.resolve({ data: null, error: null }));
  const deleteMock = vi.fn(() => ({ eq: deleteEqMock }));
  const fromMock = vi.fn((_tabela: string) => ({
    insert: insertMock,
    update: updateMock,
    delete: deleteMock,
  }));

  const uploadMock = vi.fn((..._argumentos: unknown[]) => {
    if (opcoes.uploadProibido) {
      throw new Error("upload foi chamado para um arquivo que deveria ter sido recusado na borda");
    }
    return Promise.resolve({ data: { path: "" }, error: opcoes.erroUpload ?? null });
  });
  const removeMock = vi.fn(() => Promise.resolve({ data: null, error: null }));
  const storageFromMock = vi.fn((_balde: string) => ({ upload: uploadMock, remove: removeMock }));

  const rpcMock = vi.fn((_nome: string) =>
    Promise.resolve({
      data: opcoes.erroRpc ? null : opcoes.workspaceAtual === undefined ? WORKSPACE : opcoes.workspaceAtual,
      error: opcoes.erroRpc ?? null,
    })
  );

  const getUserMock = vi.fn(() =>
    Promise.resolve({ data: { user: { id: "perfil-1" } }, error: null })
  );

  return {
    from: fromMock,
    storage: { from: storageFromMock },
    rpc: rpcMock,
    auth: { getUser: getUserMock },
    fromMock,
    insertMock,
    updateMock,
    eqMock,
    deleteMock,
    deleteEqMock,
    storageFromMock,
    uploadMock,
    removeMock,
    rpcMock,
  };
}

function ligarCliente(opcoes: OpcoesCliente = {}) {
  const cliente = construirCliente(opcoes);
  criarSupabaseServerMock.mockReturnValue(cliente);
  return cliente;
}

/**
 * `File` de verdade (Node 20+ tem o global), porque é isso que o `FormData` de
 * uma Server Action entrega: `set()` com um objeto solto viraria a STRING
 * "[object Object]" e o teste passaria a medir outra coisa.
 */
function arquivo(nome: string, tipo: string, bytes = 8): File {
  return new File([new Uint8Array(bytes)], nome, { type: tipo });
}

function formData(campos: Record<string, string | File>): FormData {
  const fd = new FormData();
  for (const [chave, valor] of Object.entries(campos)) fd.set(chave, valor);
  return fd;
}

/** O formulário completo de anexo, com o arquivo já aprovado — cada teste troca só o que lhe interessa. */
function formularioAnexo(troca: Record<string, string | File> = {}): FormData {
  return formData({
    mentoradoId: "ment-1",
    titulo: "Contrato assinado",
    categoria: "contrato",
    arquivo: arquivo("contrato.pdf", "application/pdf"),
    ...troca,
  });
}

function urlDoRedirect(indice = 0): string {
  return String(redirectMock.mock.calls[indice][0]);
}

/**
 * A URL de erro é `/caminho?erro=<codigo>`, e `<codigo>` é uma palavra curta de
 * uma tabela fechada — nunca uma frase, nunca o texto do banco. Espaço
 * codificado (`%20`, `+`) é o sinal mais barato de que uma MENSAGEM vazou para
 * a URL, então ele é conferido junto.
 */
function pareceCodigoCurto(url: string): boolean {
  return /^\/[a-z0-9/-]*\?erro=[a-z-]{1,24}$/.test(url) && !/%|\+/.test(url);
}

afterEach(() => {
  vi.resetAllMocks();
});

// ============================================================
// 1) NÃO APAGA — o teste lê o próprio fonte
// ============================================================

describe("nunca apaga: o fonte não tem delete de linha nem remove de objeto", () => {
  const CAMINHO_FONTE = join(process.cwd(), "src", "lib", "documentos", "acoes.ts");
  const fonteCru = readFileSync(CAMINHO_FONTE, "utf8");

  /**
   * O fonte SEM comentário nenhum — mesma razão do `semComentarios()` de
   * `src/lib/supabase/migracoes.test.ts`: procurar garantia no arquivo cru
   * confunde promessa com entrega, para os dois lados. O cabeçalho de
   * `acoes.ts` explica em português por que a casa não apaga, e um comentário
   * que cite `.delete()` (como o de `mentoria/acoes.ts` cita) faria esta
   * asserção FALHAR sem nenhum defeito real; pior, um `// s.from(x).delete()`
   * comentado hoje e descomentado amanhã passaria batido se o teste medisse
   * só prosa. Aqui só o que o JavaScript executa é medido.
   */
  function semComentarios(fonte: string): string {
    return fonte.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  }

  const fonte = semComentarios(fonteCru);

  it("nenhuma chamada a .delete() (a linha fica; arquivar é UPDATE)", () => {
    expect(fonte).not.toMatch(/\.delete\s*\(/);
  });

  it("nenhuma chamada a remove() (o arquivo fica no bucket; 0015 nem tem política de delete)", () => {
    expect(fonte).not.toMatch(/\.remove\s*\(/);
    expect(fonte).not.toMatch(/\.destroy\s*\(/);
  });

  it("o arquivo DE FATO escreve por update — a busca acima não é vazia", () => {
    // Sem esta asserção, um `acoes.ts` vazio (ou que só faça insert) passaria
    // nos dois testes acima sem arquivar coisa nenhuma.
    expect(fonte).toMatch(/\.update\s*\(/);
    expect(fonte).toMatch(/\.upload\s*\(/);
  });
});

// ============================================================
// 2) Entrada recusada na borda NÃO chega ao Storage nem à tabela
// ============================================================

describe("arquivo reprovado na borda não chega ao Storage (o dublê do upload falha se chamado)", () => {
  it("mime e extensão discordando: application/pdf com nome .exe", async () => {
    const cliente = ligarCliente({ uploadProibido: true });

    await anexarDocumento(formularioAnexo({ arquivo: arquivo("contrato.exe", "application/pdf") }));

    expect(cliente.uploadMock).not.toHaveBeenCalled();
    expect(cliente.insertMock).not.toHaveBeenCalled();
    expect(redirectMock).toHaveBeenCalledTimes(1);
    expect(pareceCodigoCurto(urlDoRedirect())).toBe(true);
  });

  it("svg (XML que carrega script) é recusado mesmo sendo imagem", async () => {
    const cliente = ligarCliente({ uploadProibido: true });

    await anexarDocumento(formularioAnexo({ arquivo: arquivo("logo.svg", "image/svg+xml") }));

    expect(cliente.uploadMock).not.toHaveBeenCalled();
    expect(cliente.insertMock).not.toHaveBeenCalled();
  });

  it("arquivo de 0 byte (upload que falhou no meio) é recusado", async () => {
    const cliente = ligarCliente({ uploadProibido: true });

    await anexarDocumento(formularioAnexo({ arquivo: arquivo("vazio.pdf", "application/pdf", 0) }));

    expect(cliente.uploadMock).not.toHaveBeenCalled();
    expect(cliente.insertMock).not.toHaveBeenCalled();
  });

  it("10 MB + 1 byte é recusado", async () => {
    const cliente = ligarCliente({ uploadProibido: true });

    await anexarDocumento(
      formularioAnexo({ arquivo: arquivo("grande.pdf", "application/pdf", 10 * 1024 * 1024 + 1) })
    );

    expect(cliente.uploadMock).not.toHaveBeenCalled();
    expect(cliente.insertMock).not.toHaveBeenCalled();
  });

  it("nome que vira travessia de caminho (../../etc/passwd) não sobe", async () => {
    const cliente = ligarCliente({ uploadProibido: true });

    await anexarDocumento(formularioAnexo({ arquivo: arquivo("../../etc/passwd", "application/pdf") }));

    expect(cliente.uploadMock).not.toHaveBeenCalled();
    expect(cliente.insertMock).not.toHaveBeenCalled();
  });

  it("categoria fora do enum do 0015 não sobe", async () => {
    const cliente = ligarCliente({ uploadProibido: true });

    await anexarDocumento(formularioAnexo({ categoria: "sigiloso" }));

    expect(cliente.uploadMock).not.toHaveBeenCalled();
    expect(cliente.insertMock).not.toHaveBeenCalled();
  });

  it("formulário sem arquivo nenhum não sobe nem grava", async () => {
    const cliente = ligarCliente({ uploadProibido: true });

    const fd = formularioAnexo();
    fd.delete("arquivo");
    await anexarDocumento(fd);

    expect(cliente.uploadMock).not.toHaveBeenCalled();
    expect(cliente.insertMock).not.toHaveBeenCalled();
    expect(redirectMock).toHaveBeenCalledTimes(1);
  });
});

// ============================================================
// 3) Caminho feliz: mentorado_id vem do formulário, workspace_id NÃO
// ============================================================

describe("anexarDocumento — caminho feliz", () => {
  it("sobe para o bucket privado e grava a linha, nesta ordem", async () => {
    const cliente = ligarCliente();

    await anexarDocumento(formularioAnexo());

    expect(cliente.storageFromMock).toHaveBeenCalledWith("documentos");
    expect(cliente.uploadMock).toHaveBeenCalledTimes(1);
    expect(cliente.insertMock).toHaveBeenCalledTimes(1);
    // A ordem é a garantia contra linha órfã: o upload é invocado antes.
    expect(cliente.uploadMock.mock.invocationCallOrder[0]).toBeLessThan(
      cliente.insertMock.mock.invocationCallOrder[0]
    );
    expect(cliente.fromMock).toHaveBeenCalledWith("documento");
    expect(redirectMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).toHaveBeenCalledWith("/mentoria/ment-1");
  });

  it("grava mentorado_id e aluno_id do formulário, e NÃO grava workspace_id", async () => {
    const cliente = ligarCliente();

    await anexarDocumento(
      formularioAnexo({
        mentoradoId: "ment-1",
        alunoId: "aluno-7",
        // O formulário TENTA impor o workspace: é exatamente isto que não pode
        // ser aceito — a coluna nasce do default do banco e a RLS do 0015 só
        // aceita insert com `workspace_id = workspace_atual()`.
        workspaceId: WORKSPACE_FORJADO,
        workspace_id: WORKSPACE_FORJADO,
      })
    );

    const linha = cliente.insertMock.mock.calls[0][0] as Record<string, unknown>;
    expect(linha.mentorado_id).toBe("ment-1");
    expect(linha.aluno_id).toBe("aluno-7");
    expect(Object.keys(linha)).not.toContain("workspace_id");
    expect(JSON.stringify(linha)).not.toContain(WORKSPACE_FORJADO);
  });

  it("a pasta do Storage é o workspace vindo do banco (workspace_atual), nunca o do formulário", async () => {
    const cliente = ligarCliente();

    await anexarDocumento(formularioAnexo({ workspaceId: WORKSPACE_FORJADO }));

    expect(cliente.rpcMock).toHaveBeenCalledWith("workspace_atual");
    const chave = String(cliente.uploadMock.mock.calls[0][0]);
    expect(chave.startsWith(`${WORKSPACE}/`)).toBe(true);
    expect(chave).not.toContain(WORKSPACE_FORJADO);
  });

  it("a chave do objeto e o id da linha são o MESMO uuid, e a chave não tem .. nem começa com /", async () => {
    const cliente = ligarCliente();

    await anexarDocumento(formularioAnexo());

    const chave = String(cliente.uploadMock.mock.calls[0][0]);
    const linha = cliente.insertMock.mock.calls[0][0] as Record<string, unknown>;
    expect(chave).toBe(`${WORKSPACE}/contrato/${String(linha.id)}/contrato.pdf`);
    expect(linha.caminho_storage).toBe(chave);
    expect(chave.startsWith("/")).toBe(false);
    expect(chave).not.toContain("..");
  });

  it("visivel_portal nasce FALSO quando o interruptor não vem marcado", async () => {
    const cliente = ligarCliente();

    await anexarDocumento(formularioAnexo());

    const linha = cliente.insertMock.mock.calls[0][0] as Record<string, unknown>;
    expect(linha.visivel_portal).toBe(false);
    expect(linha.arquivado).toBeUndefined();
  });

  it("enviado_por é o id da SESSÃO autenticada, nunca um campo do formulário", async () => {
    const cliente = ligarCliente();

    await anexarDocumento(formularioAnexo({ enviadoPor: "perfil-do-chefe", enviado_por: "perfil-do-chefe" }));

    const linha = cliente.insertMock.mock.calls[0][0] as Record<string, unknown>;
    expect(cliente.auth.getUser).toHaveBeenCalled();
    expect(linha.enviado_por).toBe("perfil-1");
  });

  it("visivel_portal só fica verdadeiro com o interruptor marcado", async () => {
    const cliente = ligarCliente();

    await anexarDocumento(formularioAnexo({ visivelPortal: "on" }));

    const linha = cliente.insertMock.mock.calls[0][0] as Record<string, unknown>;
    expect(linha.visivel_portal).toBe(true);
  });

  it("bytes e mime gravados são os do arquivo medido, não texto do formulário", async () => {
    const cliente = ligarCliente();

    await anexarDocumento(
      formularioAnexo({
        arquivo: arquivo("planilha.csv", "text/csv; charset=utf-8", 4096),
        categoria: "outro",
        // Um formulário malicioso mandando bytes/mime próprios não pode vencer
        // o que foi de fato medido no arquivo.
        bytes: "1",
        mime: "application/pdf",
      })
    );

    const linha = cliente.insertMock.mock.calls[0][0] as Record<string, unknown>;
    expect(linha.bytes).toBe(4096);
    expect(linha.mime).toBe("text/csv");
  });

  it("documento do NEGÓCIO: sem mentoradoId, mentorado_id vai nulo e o retorno é a carteira", async () => {
    const cliente = ligarCliente();

    await anexarDocumento(formularioAnexo({ mentoradoId: "", categoria: "material" }));

    const linha = cliente.insertMock.mock.calls[0][0] as Record<string, unknown>;
    expect(linha.mentorado_id).toBeNull();
    expect(revalidatePathMock).toHaveBeenCalledWith("/mentoria");
  });

  it("título em branco cai no nome saneado do arquivo — nunca em texto inventado", async () => {
    const cliente = ligarCliente();

    await anexarDocumento(formularioAnexo({ titulo: "   ", arquivo: arquivo("anamnese.pdf", "application/pdf") }));

    const linha = cliente.insertMock.mock.calls[0][0] as Record<string, unknown>;
    expect(linha.titulo).toBe("anamnese.pdf");
  });
});

// ============================================================
// 4) Erro do Storage não deixa linha órfã
// ============================================================

describe("erro do Storage: nada é gravado na tabela", () => {
  it("upload falhando não chama insert e não lança", async () => {
    const cliente = ligarCliente({ erroUpload: { message: "The resource already exists" } });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(anexarDocumento(formularioAnexo())).resolves.toBeUndefined();

    expect(cliente.uploadMock).toHaveBeenCalledTimes(1);
    expect(cliente.insertMock).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    expect(redirectMock).toHaveBeenCalledTimes(1);
    expect(revalidatePathMock).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it("workspace_atual indisponível: nem upload nem insert acontecem", async () => {
    const cliente = ligarCliente({ erroRpc: { code: "42501", message: "permission denied" } });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await anexarDocumento(formularioAnexo());

    expect(cliente.uploadMock).not.toHaveBeenCalled();
    expect(cliente.insertMock).not.toHaveBeenCalled();
    expect(pareceCodigoCurto(urlDoRedirect())).toBe(true);

    warnSpy.mockRestore();
  });

  it("workspace_atual devolvendo lixo (não uuid) não vira pasta plausível", async () => {
    const cliente = ligarCliente({ workspaceAtual: "nao-e-uuid" });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await anexarDocumento(formularioAnexo());

    expect(cliente.uploadMock).not.toHaveBeenCalled();
    expect(cliente.insertMock).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });
});

// ============================================================
// 5) A URL de erro carrega CÓDIGO, nunca o texto do banco
// ============================================================

describe("a URL de redirect nunca carrega o texto do erro do banco", () => {
  it("insert falhando: só um código curto vai para a URL", async () => {
    ligarCliente({
      erroInsert: {
        code: "23505",
        message: 'duplicate key value violates unique constraint "uq_documento_caminho_storage"',
      },
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(anexarDocumento(formularioAnexo())).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalled();
    const url = urlDoRedirect();
    expect(pareceCodigoCurto(url)).toBe(true);
    for (const vazamento of ["duplicate", "constraint", "uq_documento", "23505", "documento", "insert"]) {
      expect(url.toLowerCase()).not.toContain(vazamento);
    }
    expect(revalidatePathMock).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it("upload falhando: idem, e o nome do bucket também não vaza", async () => {
    ligarCliente({ erroUpload: { message: 'new row violates row-level security policy for bucket "documentos"' } });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await anexarDocumento(formularioAnexo());

    const url = urlDoRedirect();
    expect(pareceCodigoCurto(url)).toBe(true);
    expect(url.toLowerCase()).not.toContain("row-level");
    expect(url.toLowerCase()).not.toContain("bucket");

    warnSpy.mockRestore();
  });

  it("validação recusando: também é código curto, não a frase da regra", async () => {
    ligarCliente({ uploadProibido: true });

    await anexarDocumento(formularioAnexo({ categoria: "sigiloso" }));

    expect(pareceCodigoCurto(urlDoRedirect())).toBe(true);
  });
});

// ============================================================
// arquivarDocumento — UPDATE, nunca DELETE
// ============================================================

describe("arquivarDocumento", () => {
  it("faz update de arquivado e nada mais; nem delete de linha, nem remove de objeto", async () => {
    const cliente = ligarCliente();

    await arquivarDocumento(formData({ mentoradoId: "ment-1", documentoId: "doc-1" }));

    expect(cliente.fromMock).toHaveBeenCalledWith("documento");
    expect(cliente.updateMock).toHaveBeenCalledTimes(1);
    expect(cliente.updateMock).toHaveBeenCalledWith({ arquivado: true });
    expect(cliente.eqMock).toHaveBeenCalledWith("id", "doc-1");
    expect(cliente.deleteMock).not.toHaveBeenCalled();
    expect(cliente.removeMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).toHaveBeenCalledWith("/mentoria/ment-1");
    // Arquivar tira o documento do portal (a própria RLS do 0015 filtra) —
    // então a tela do mentorado precisa ser revalidada junto.
    expect(revalidatePathMock).toHaveBeenCalledWith("/portal");
  });

  it("documentoId vazio não chama update nenhuma vez", async () => {
    const cliente = ligarCliente();

    await arquivarDocumento(formData({ mentoradoId: "ment-1", documentoId: "" }));

    expect(cliente.updateMock).not.toHaveBeenCalled();
    expect(pareceCodigoCurto(urlDoRedirect())).toBe(true);
  });

  it("erro do banco vira console.warn e código curto, sem revalidar", async () => {
    const cliente = ligarCliente({ erroUpdate: { code: "PGRST301", message: "linha inacessível por RLS" } });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(
      arquivarDocumento(formData({ mentoradoId: "ment-1", documentoId: "doc-1" }))
    ).resolves.toBeUndefined();

    expect(cliente.updateMock).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalled();
    const url = urlDoRedirect();
    expect(pareceCodigoCurto(url)).toBe(true);
    expect(url.toLowerCase()).not.toContain("rls");
    expect(revalidatePathMock).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });
});

// ============================================================
// alternarVisivelPortal — troca a flag e SÓ ela
// ============================================================

describe("alternarVisivelPortal", () => {
  it("publicar: update só de visivel_portal", async () => {
    const cliente = ligarCliente();

    await alternarVisivelPortal(formData({ mentoradoId: "ment-1", documentoId: "doc-1", visivel: "1" }));

    expect(cliente.updateMock).toHaveBeenCalledTimes(1);
    expect(cliente.updateMock).toHaveBeenCalledWith({ visivel_portal: true });
    expect(cliente.eqMock).toHaveBeenCalledWith("id", "doc-1");
    expect(cliente.deleteMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).toHaveBeenCalledWith("/portal");
  });

  it("despublicar: a mesma chamada, com false", async () => {
    const cliente = ligarCliente();

    await alternarVisivelPortal(formData({ mentoradoId: "ment-1", documentoId: "doc-1", visivel: "0" }));

    expect(cliente.updateMock).toHaveBeenCalledWith({ visivel_portal: false });
  });

  it("valor do interruptor ausente é fail-closed: despublica, nunca publica por engano", async () => {
    const cliente = ligarCliente();

    await alternarVisivelPortal(formData({ mentoradoId: "ment-1", documentoId: "doc-1" }));

    expect(cliente.updateMock).toHaveBeenCalledWith({ visivel_portal: false });
  });

  it("documentoId vazio não chama update nenhuma vez", async () => {
    const cliente = ligarCliente();

    await alternarVisivelPortal(formData({ mentoradoId: "ment-1", documentoId: "", visivel: "1" }));

    expect(cliente.updateMock).not.toHaveBeenCalled();
    expect(pareceCodigoCurto(urlDoRedirect())).toBe(true);
  });
});

// ============================================================
// Nenhuma das três ações constrói o cliente antes de validar
// ============================================================

describe("validação vem ANTES de tocar no Supabase", () => {
  it("as três ações recusam entrada inválida sem sequer criar o cliente", async () => {
    criarSupabaseServerMock.mockImplementation(() => {
      throw new Error("o cliente Supabase não deveria ter sido construído para entrada inválida");
    });

    const fd = formularioAnexo({ categoria: "sigiloso" });
    await anexarDocumento(fd);
    await arquivarDocumento(formData({ mentoradoId: "ment-1", documentoId: "" }));
    await alternarVisivelPortal(formData({ mentoradoId: "ment-1", documentoId: "", visivel: "1" }));

    expect(criarSupabaseServerMock).not.toHaveBeenCalled();
    expect(redirectMock).toHaveBeenCalledTimes(3);
  });
});

// ============================================================
// 6) Os buracos que a revisão achou — cada bloco abaixo existe porque um
//    defeito plantado no lugar certo passava com a suíte INTEIRA verde.
// ============================================================

/** As opções do `upload` (3º argumento) da primeira chamada — onde moram `upsert` e `contentType`. */
function opcoesDoUpload(cliente: ReturnType<typeof ligarCliente>): Record<string, unknown> {
  return (cliente.uploadMock.mock.calls[0][2] ?? {}) as Record<string, unknown>;
}

/** Todo caminho já passado para `revalidatePath`, em ordem. */
function caminhosRevalidados(): string[] {
  return revalidatePathMock.mock.calls.map((chamada) => String(chamada[0]));
}

describe("visivel_portal é fail-closed em TODAS as categorias, não só em contrato", () => {
  // Sem varrer as quatro, um defeito do tipo `categoria === "material" ? true
  // : interruptorLigado(...)` publicaria uma categoria inteira no portal do
  // mentorado com a suíte verde: os testes de interruptor usavam só
  // `contrato`, e o único caso com `material` não olhava a flag. É "o erro
  // caro" descrito no comentário de `interruptorLigado`.
  for (const categoria of CATEGORIA_DOCUMENTO_VALORES) {
    it(`categoria ${categoria}: sem interruptor marcado, visivel_portal nasce FALSO`, async () => {
      const cliente = ligarCliente();

      await anexarDocumento(formularioAnexo({ categoria, mentoradoId: "" }));

      const linha = cliente.insertMock.mock.calls[0][0] as Record<string, unknown>;
      expect(linha.visivel_portal).toBe(false);
    });

    it(`categoria ${categoria}: com o interruptor marcado, visivel_portal é VERDADEIRO`, async () => {
      const cliente = ligarCliente();

      await anexarDocumento(formularioAnexo({ categoria, mentoradoId: "", visivelPortal: "on" }));

      const linha = cliente.insertMock.mock.calls[0][0] as Record<string, unknown>;
      // O par (falso sem marcar / verdadeiro marcando) é o que impede que
      // esta asserção seja satisfeita por uma constante em qualquer das duas
      // pontas: nenhum valor fixo passa nos dois testes da mesma categoria.
      expect(linha.visivel_portal).toBe(true);
    });
  }
});

describe("as opções do upload são parte do contrato, não detalhe", () => {
  it("upsert é FALSE — a única linha deste código capaz de destruir arquivo de alguém", async () => {
    const cliente = ligarCliente();

    await anexarDocumento(formularioAnexo());

    const opcoes = opcoesDoUpload(cliente);
    // `upsert: true` sobrescreveria em silêncio um objeto existente, e a RLS
    // do 0015 NÃO segura (ela cria política de update em `storage.objects`
    // justamente para a troca feita pela gestão). A garantia de "nunca
    // apagar" no bucket é esta palavra — então ela é lida por teste.
    expect(opcoes.upsert).toBe(false);
  });

  it("contentType é a forma-base do mime, a MESMA que foi conferida e gravada na linha", async () => {
    const cliente = ligarCliente();

    await anexarDocumento(
      formularioAnexo({
        arquivo: arquivo("planilha.csv", "text/csv; charset=utf-8", 32),
        categoria: "outro",
      })
    );

    const opcoes = opcoesDoUpload(cliente);
    const linha = cliente.insertMock.mock.calls[0][0] as Record<string, unknown>;
    // O comentário de `mimeBase` promete as DUAS pontas (coluna e upload).
    // Só a coluna tinha teste; servir o objeto com um `Content-Type` que
    // diverge do `mime` da linha nasceria sem nenhum vermelho.
    expect(opcoes.contentType).toBe("text/csv");
    expect(opcoes.contentType).toBe(linha.mime);
  });
});

describe("a chave do Storage carrega o nome SANEADO, nunca o nome cru do arquivo", () => {
  // O teste antigo conferia `not.toContain("..")` em cima de `contrato.pdf`
  // — um nome que já era seguro, então a asserção não media nada. O nome
  // hostil que existia (`../../etc/passwd`) morria antes, em `tipoPermitido`,
  // por não ter extensão. Falta(va) o caso que importa: hostil COM extensão
  // válida, que passa na guarda de tipo e chega em `chaveDeStorage`.
  it("pasta, ponto-ponto, espaço e ponto-e-vírgula somem do nome antes de virar chave", async () => {
    const cliente = ligarCliente();

    await anexarDocumento(
      formularioAnexo({ arquivo: arquivo("../../Relatório Final;v2..pdf", "application/pdf") })
    );

    const chave = String(cliente.uploadMock.mock.calls[0][0]);
    const linha = cliente.insertMock.mock.calls[0][0] as Record<string, unknown>;
    expect(chave).toBe(`${WORKSPACE}/contrato/${String(linha.id)}/Relatorio-Final-v2.pdf`);
    expect(linha.caminho_storage).toBe(chave);
    // A chave tem exatamente quatro segmentos: workspace, categoria, uuid do
    // documento e arquivo. Separador vindo do nome viraria pasta a mais, em
    // silêncio, e o `(storage.foldername(name))[1]` que o 0015 confere
    // continuaria batendo.
    expect(chave.split("/")).toHaveLength(4);
    expect(chave).not.toContain("..");
    expect(chave).not.toContain(";");
    expect(chave).not.toContain(" ");
  });

  it("caminho de Windows no nome também perde as pastas", async () => {
    const cliente = ligarCliente();

    await anexarDocumento(
      formularioAnexo({ arquivo: arquivo("C:\\Users\\dono\\anamnese.pdf", "application/pdf"), categoria: "anamnese" })
    );

    const chave = String(cliente.uploadMock.mock.calls[0][0]);
    const linha = cliente.insertMock.mock.calls[0][0] as Record<string, unknown>;
    expect(chave).toBe(`${WORKSPACE}/anamnese/${String(linha.id)}/anamnese.pdf`);
    expect(chave.split("/")).toHaveLength(4);
    expect(chave).not.toContain("\\");
  });

  it("o título em branco também recebe o nome saneado, nunca o cru", async () => {
    const cliente = ligarCliente();

    await anexarDocumento(
      formularioAnexo({ titulo: "", arquivo: arquivo("../../Relatório Final;v2..pdf", "application/pdf") })
    );

    const linha = cliente.insertMock.mock.calls[0][0] as Record<string, unknown>;
    expect(linha.titulo).toBe("Relatorio-Final-v2.pdf");
  });
});

describe("anexarDocumento não remove objeto nem apaga linha em NENHUM caminho", () => {
  // `arquivarDocumento` e `alternarVisivelPortal` já tinham rede
  // comportamental para isto; `anexarDocumento` só tinha a varredura de
  // texto do próprio fonte, que mede a FORMA de escrever (uma remoção por
  // chamada indireta, `s.storage.from(B)["remo"+"ve"]([chave])`, escapa dela).
  // Rollback de upload é a tentação mais natural do mundo no caminho de erro
  // do insert — e a casa não apaga: o objeto órfão no bucket é inofensivo por
  // construção (sem linha, a política de leitura do 0015 não acha o par).
  it("caminho feliz", async () => {
    const cliente = ligarCliente();

    await anexarDocumento(formularioAnexo());

    expect(cliente.removeMock).not.toHaveBeenCalled();
    expect(cliente.deleteMock).not.toHaveBeenCalled();
  });

  it("erro do insert: o objeto recém-subido FICA no bucket", async () => {
    const cliente = ligarCliente({ erroInsert: { code: "23505", message: "duplicate key" } });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await anexarDocumento(formularioAnexo());

    expect(cliente.insertMock).toHaveBeenCalledTimes(1);
    expect(cliente.removeMock).not.toHaveBeenCalled();
    expect(cliente.deleteMock).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it("erro do upload: nada é removido nem apagado", async () => {
    const cliente = ligarCliente({ erroUpload: { message: "falhou" } });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await anexarDocumento(formularioAnexo());

    expect(cliente.removeMock).not.toHaveBeenCalled();
    expect(cliente.deleteMock).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });
});

// ============================================================
// 7) O `mentoradoId` do formulário monta a URL — e ele também é escolhido
//    por quem envia
// ============================================================

/**
 * O que o revisor mandou de fato pelo `FormData`. O primeiro carrega um
 * `?erro=` PRÓPRIO: como o Next entrega em `searchParams.erro` o valor do
 * PRIMEIRO `?`, quem monta o formulário passaria a escolher o texto exibido
 * dentro do banner oficial da tela — a falsificação de conteúdo que a tabela
 * fechada de seis códigos existe para impedir (MÉDIO 5).
 */
const ID_QUE_FORJA_O_ERRO = "<img src=x onerror=alert(1)>&x=?erro=";
/** Travessia: além da URL, este valor ia inteiro para `revalidatePath`. */
const ID_COM_TRAVESSIA = "../../outro";

describe("mentoradoId hostil não vaza para a URL de erro nem para o revalidatePath", () => {
  it("anexarDocumento: entrada recusada volta com CÓDIGO curto, mesmo com mentoradoId forjado", async () => {
    ligarCliente({ uploadProibido: true });

    await anexarDocumento(formularioAnexo({ mentoradoId: ID_QUE_FORJA_O_ERRO, categoria: "sigiloso" }));

    const url = urlDoRedirect();
    expect(pareceCodigoCurto(url)).toBe(true);
    expect(url).not.toContain("<");
    // Um `?` só: dois significam que quem enviou escolheu o primeiro, e é o
    // primeiro que a tela lê.
    expect(url.split("?")).toHaveLength(2);
  });

  it("arquivarDocumento: idem", async () => {
    ligarCliente();

    await arquivarDocumento(formData({ mentoradoId: ID_QUE_FORJA_O_ERRO, documentoId: "" }));

    expect(pareceCodigoCurto(urlDoRedirect())).toBe(true);
  });

  it("alternarVisivelPortal: idem", async () => {
    ligarCliente();

    await alternarVisivelPortal(formData({ mentoradoId: ID_QUE_FORJA_O_ERRO, documentoId: "", visivel: "1" }));

    expect(pareceCodigoCurto(urlDoRedirect())).toBe(true);
  });

  it("travessia no mentoradoId cai na carteira, e nenhum caminho revalidado carrega ..", async () => {
    const cliente = ligarCliente();

    await arquivarDocumento(formData({ mentoradoId: ID_COM_TRAVESSIA, documentoId: "doc-1" }));

    expect(cliente.updateMock).toHaveBeenCalledWith({ arquivado: true });
    const caminhos = caminhosRevalidados();
    for (const caminho of caminhos) expect(caminho).not.toContain("..");
    expect(caminhos).toContain("/mentoria");
  });

  it("anexo com mentoradoId hostil grava normalmente, mas revalida caminho são", async () => {
    const cliente = ligarCliente();

    await anexarDocumento(formularioAnexo({ mentoradoId: ID_QUE_FORJA_O_ERRO }));

    // A linha ainda é escrita: quem decide se este `mentorado_id` existe é a
    // chave estrangeira do 0015, não a montagem da URL. O que não pode é o
    // valor virar caminho.
    expect(cliente.insertMock).toHaveBeenCalledTimes(1);
    for (const caminho of caminhosRevalidados()) {
      expect(caminho).not.toContain("<");
      expect(caminho).not.toContain("?");
    }
  });

  it("mentoradoId legítimo continua levando para a ficha dele", async () => {
    // Contra-teste: sem ele, um `caminhoFicha` que devolvesse SEMPRE
    // "/mentoria" passaria em todos os testes acima.
    const cliente = ligarCliente();

    await arquivarDocumento(
      formData({ mentoradoId: "3f2b0c1a-1111-2222-3333-444455556666", documentoId: "doc-1" })
    );

    expect(cliente.updateMock).toHaveBeenCalledTimes(1);
    expect(caminhosRevalidados()).toContain("/mentoria/3f2b0c1a-1111-2222-3333-444455556666");
  });
});
