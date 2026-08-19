// Testes das Server Actions de trilha.
//
// O QUE ESTA SUÍTE PROVA
// ----------------------
// 1) `marcarAula` escreve pela FUNÇÃO do banco (`rpc`), nunca por `.update()`
//    — a razão inteira está no cabeçalho de 0020: RLS decide se a linha
//    aparece, nunca que coluna pode ser escrita, e um PATCH direto forjava a
//    data de conclusão;
// 2) marcar aula NÃO liberada é recusado ANTES de tocar o banco;
// 3) emitir certificado sem direito é recusado e não grava NADA;
// 4) emitir duas vezes devolve o MESMO código — o `unique (mentorado_id,
//    trilha_id)` é a garantia, e a ação trata o conflito como sucesso, não
//    como erro. Um certificado que muda de número a cada clique é um
//    certificado que não verifica;
// 5) nenhuma ação lê `workspace_id` do formulário.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const criarSupabaseServerMock = vi.fn();
const revalidatePathMock = vi.fn();
const lerMinhaTrilhaMock = vi.fn();
const redirectMock = vi.fn((destino: string) => {
  const e = new Error(`REDIRECT:${destino}`) as Error & { digest: string };
  e.digest = `NEXT_REDIRECT;${destino}`;
  throw e;
});

vi.mock("../supabase/server", () => ({ criarSupabaseServer: criarSupabaseServerMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("./dados-trilha", () => ({ lerMinhaTrilha: lerMinhaTrilhaMock }));

const {
  marcarAula,
  salvarTrilha,
  salvarAula,
  matricularNaTrilha,
  MOTIVO_AULA_FECHADA,
  MOTIVO_AULA_INVALIDA,
  MOTIVO_ERRO_MARCAR,
} = await import("./acoes-trilha");

interface Registro {
  tabela: string;
  operacao: string;
  valores?: Record<string, unknown>;
  eq: [string, unknown][];
}

function duble(
  opcoes: {
    rpcErro?: { code?: string } | null;
    insertErro?: { code?: string } | null;
    certificadoExistente?: Record<string, unknown> | null;
  } = {},
) {
  const registros: Registro[] = [];
  const rpcMock = vi.fn(() => Promise.resolve({ data: null, error: opcoes.rpcErro ?? null }));
  const cliente = {
    rpc: rpcMock,
    from(tabela: string) {
      const reg: Registro = { tabela, operacao: "", eq: [] };
      const b: Record<string, unknown> = {};
      b.select = () => {
        reg.operacao ||= "select";
        registros.push(reg);
        return b;
      };
      b.insert = (v: Record<string, unknown>) => {
        reg.operacao = "insert";
        reg.valores = v;
        registros.push(reg);
        return Promise.resolve({ error: opcoes.insertErro ?? null });
      };
      b.update = (v: Record<string, unknown>) => {
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
        if (reg.operacao === "update") return Promise.resolve({ error: null });
        return b;
      };
      b.maybeSingle = () => Promise.resolve({ data: opcoes.certificadoExistente ?? null, error: null });
      return b;
    },
  };
  criarSupabaseServerMock.mockReturnValue(cliente);
  return { registros, rpcMock };
}

function form(campos: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
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

function minhaTrilhaCom(aulas: Array<{ id: string; liberada: boolean; concluida?: boolean }>, temCertificado = false) {
  return {
    conectado: true,
    motivo: "",
    ehMentorado: true,
    trilhas: [
      {
        trilha: { id: "tr-1", workspaceId: "ws-1", nome: "T", descricao: "", programaId: null, ativa: true, criadoEm: "" },
        inicio: "2026-08-01",
        aulas: aulas.map((a) => ({
          id: a.id,
          workspaceId: "ws-1",
          trilhaId: "tr-1",
          ordem: 1,
          titulo: "Aula",
          tipo: "video",
          urlVideo: "",
          texto: "",
          duracaoMin: 0,
          liberaEmDias: 0,
          criadoEm: "",
          liberada: a.liberada,
          abreNoDia: "2026-08-01",
          motivo: a.liberada ? "" : "abre em 30/08/2026",
          concluida: a.concluida ?? false,
        })),
        progresso: { total: aulas.length, concluidas: 0, pct: 0 },
        temCertificado,
      },
    ],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("marcarAula — escreve pela função, nunca por update", () => {
  it("chama rpc('trilha_marcar_aula') com o id e a intenção", async () => {
    lerMinhaTrilhaMock.mockResolvedValue(minhaTrilhaCom([{ id: "au-1", liberada: true }]));
    const { rpcMock, registros } = duble();

    await marcarAula(form({ aulaId: "au-1", concluida: "1" }));

    expect(rpcMock).toHaveBeenCalledWith("trilha_marcar_aula", {
      p_aula_id: "au-1",
      p_concluida: true,
    });
    // Nenhuma escrita direta em tabela.
    expect(registros.filter((r) => r.operacao === "update" || r.operacao === "delete")).toEqual([]);
  });

  it("desmarcar manda concluida false", async () => {
    lerMinhaTrilhaMock.mockResolvedValue(minhaTrilhaCom([{ id: "au-1", liberada: true }]));
    const { rpcMock } = duble();

    await marcarAula(form({ aulaId: "au-1", concluida: "0" }));

    expect(rpcMock).toHaveBeenCalledWith("trilha_marcar_aula", { p_aula_id: "au-1", p_concluida: false });
  });

  // A CHECAGEM QUE ACONTECE ANTES DO BANCO.
  it("aula não liberada é recusada e o rpc NEM é chamado", async () => {
    lerMinhaTrilhaMock.mockResolvedValue(minhaTrilhaCom([{ id: "au-1", liberada: false }]));
    const { rpcMock, registros } = duble();

    const erro = await erroDe(marcarAula(form({ aulaId: "au-1", concluida: "1" })));

    expect(erro).toBe(MOTIVO_AULA_FECHADA);
    expect(rpcMock).not.toHaveBeenCalled();
    expect(registros).toEqual([]);
  });

  it("aula que não é de nenhuma trilha do mentorado é recusada, sem rpc", async () => {
    lerMinhaTrilhaMock.mockResolvedValue(minhaTrilhaCom([{ id: "au-1", liberada: true }]));
    const { rpcMock } = duble();

    const erro = await erroDe(marcarAula(form({ aulaId: "au-de-outra-pessoa", concluida: "1" })));

    expect(rpcMock).not.toHaveBeenCalled();
    // O MOTIVO importa: sem ele, um mutante que tira a guarda ainda passa
    // (a linha seguinte estoura, o catch pega, e o rpc segue sem ser
    // chamado) — a ação faria a coisa certa por acidente, e o teste não
    // saberia a diferença.
    expect(erro).toBe(MOTIVO_AULA_INVALIDA);
  });

  // O valor combinado é o literal "1". Qualquer outra coisa DESMARCA: o erro
  // possível é a pessoa precisar clicar de novo, nunca uma aula constar como
  // feita sem ninguém ter dito isso.
  it.each([["0"], [""], ["true"], ["on"], ["sim"], ["01"], ["2"], ["1 1"]])(
    "concluida=%j desmarca em vez de marcar",
    async (valor) => {
      lerMinhaTrilhaMock.mockResolvedValue(minhaTrilhaCom([{ id: "au-1", liberada: true }]));
      const { rpcMock } = duble();

      await marcarAula(form({ aulaId: "au-1", concluida: valor }));

      expect(rpcMock).toHaveBeenCalledWith("trilha_marcar_aula", { p_aula_id: "au-1", p_concluida: false });
    },
  );

  // `" 1"` MARCA, e isso é coerência, não descuido: o helper que lê o
  // formulário apara espaço em TODO campo deste arquivo (ids, títulos,
  // números). Abrir exceção só aqui criaria uma regra que ninguém lembra.
  it("espaço em volta é aparado, como em todo campo — ' 1' marca", async () => {
    lerMinhaTrilhaMock.mockResolvedValue(minhaTrilhaCom([{ id: "au-1", liberada: true }]));
    const { rpcMock } = duble();

    await marcarAula(form({ aulaId: "au-1", concluida: " 1" }));

    expect(rpcMock).toHaveBeenCalledWith("trilha_marcar_aula", { p_aula_id: "au-1", p_concluida: true });
  });

  it("erro do rpc vira motivo humano, sem detalhe do banco", async () => {
    lerMinhaTrilhaMock.mockResolvedValue(minhaTrilhaCom([{ id: "au-1", liberada: true }]));
    duble({ rpcErro: { code: "P0001" } });

    const erro = await erroDe(marcarAula(form({ aulaId: "au-1", concluida: "1" })));

    expect(erro).toBe(MOTIVO_ERRO_MARCAR);
    expect(erro).not.toContain("P0001");
  });

  it("o fonte não contém update nem delete", () => {
    const fonte = readFileSync(join(process.cwd(), "src/lib/conteudo/acoes-trilha.ts"), "utf8");
    // Sem os comentários: eles EXPLICAM por que não há update, e a busca
    // ingênua acharia a menção e passaria por acidente.
    const codigo = fonte
      .split("\n")
      .filter((l) => !l.trim().startsWith("*") && !l.trim().startsWith("//") && !l.trim().startsWith("/*"))
      .join("\n");
    // O corte precisa parar na PRÓXIMA função exportada: `salvarTrilha` e
    // `salvarAula` usam `.update()` legitimamente (a gestão edita), e cortar
    // até o fim do arquivo faria este teste falhar pelo motivo errado.
    const inicio = codigo.indexOf("export async function marcarAula");
    const depois = codigo.indexOf("export async function", inicio + 1);
    const trechoMarcar = codigo.slice(inicio, depois < 0 ? undefined : depois);

    expect(trechoMarcar).not.toContain(".update(");
    expect(trechoMarcar).not.toContain(".delete(");
  });
});

// A emissão do certificado saiu desta tarefa por decisão do dono: a política
// de insert de `certificado` (0020) não permite ao mentorado emitir o próprio,
// e as duas saídas possíveis tinham defeito. Virou tarefa própria. Ver o
// comentário no meio de `acoes-trilha.ts`.

describe("as ações de gestão", () => {
  it("salvarTrilha não lê workspace_id do formulário", async () => {
    const { registros } = duble();

    await salvarTrilha(form({ nome: "Nova trilha", workspace_id: "ws-de-outro", workspaceId: "ws-de-outro" }));

    expect(JSON.stringify(registros)).not.toContain("ws-de-outro");
    expect(registros.find((r) => r.operacao === "insert")?.valores?.nome).toBe("Nova trilha");
  });

  it("salvarAula recusa libera_em_dias negativo antes do banco", async () => {
    const { registros } = duble();

    await erroDe(salvarAula(form({ trilhaId: "tr-1", titulo: "Aula", liberaEmDias: "-5" })));

    expect(registros).toEqual([]);
  });

  it("matricularNaTrilha não lê workspace_id do formulário", async () => {
    const { registros } = duble();

    await matricularNaTrilha(form({ mentoradoId: "ment-1", trilhaId: "tr-1", workspace_id: "ws-de-outro" }));

    expect(JSON.stringify(registros)).not.toContain("ws-de-outro");
    const insert = registros.find((r) => r.operacao === "insert");
    expect(insert?.valores).toEqual({ mentorado_id: "ment-1", trilha_id: "tr-1" });
  });

  it("nenhuma ação do arquivo chama .delete()", () => {
    const fonte = readFileSync(join(process.cwd(), "src/lib/conteudo/acoes-trilha.ts"), "utf8");
    const codigo = fonte
      .split("\n")
      .filter((l) => !l.trim().startsWith("*") && !l.trim().startsWith("//") && !l.trim().startsWith("/*"))
      .join("\n");

    expect(codigo).not.toContain(".delete(");
  });
});

// ---------------------------------------------------------------------------
// Tarefa 30 — para ONDE cada ação volta
// ---------------------------------------------------------------------------
//
// Estes caminhos foram escritos na tarefa 28, quando as telas ainda não
// existiam, e ficaram errados: a gestão apontava para `/conteudo/trilhas` e o
// portal para `/portal/trilhas`. As rotas de verdade, decididas na 29 e
// criadas na 30, são `/trilhas` e `/portal/trilha`.
//
// Não é detalhe de digitação. Um caminho errado quebra as DUAS pontas: o
// `redirect` de erro joga a pessoa num 404 em vez de mostrar o motivo, e o
// `revalidatePath` limpa o cache de uma rota que ninguém abre — a tela certa
// continua servindo o dado velho, e o mentor jura que o salvamento não
// funcionou. Nada disso aparecia porque nenhum teste perguntava o destino.
describe("acoes-trilha — os caminhos de volta (tarefa 30)", () => {
  function caminhoDoRedirect(): string {
    const chamada = redirectMock.mock.calls.at(-1);
    return String(chamada?.[0] ?? "").split("?")[0];
  }

  it("erro de gestão volta para /trilhas, não para /conteudo/trilhas", async () => {
    duble();
    const fd = new FormData();
    fd.set("nome", ""); // recusado antes do banco

    await expect(salvarTrilha(fd)).rejects.toThrow(/REDIRECT/);
    expect(caminhoDoRedirect()).toBe("/trilhas");
  });

  it("erro ao salvar aula volta para a trilha que estava aberta", async () => {
    duble();
    const fd = new FormData();
    fd.set("trilhaId", "3f2504e0-4f89-11d3-9a0c-0305e82c3301");
    fd.set("titulo", ""); // recusado antes do banco

    await expect(salvarAula(fd)).rejects.toThrow(/REDIRECT/);
    expect(caminhoDoRedirect()).toBe("/trilhas/3f2504e0-4f89-11d3-9a0c-0305e82c3301");
  });

  it("id de trilha que não é uuid não entra no caminho — volta para a lista", async () => {
    // O id vem do formulário. Interpolar direto o que veio de fora dentro de
    // uma URL de `redirect` é como se monta redirecionamento aberto e
    // caminho inventado; uuid ou nada.
    duble();
    for (const idTorto of ["../../financeiro", "abc", "3f2504e0-4f89-11d3-9a0c-0305e82c3301/../crm"]) {
      const fd = new FormData();
      fd.set("trilhaId", idTorto);
      fd.set("titulo", "");
      await expect(salvarAula(fd)).rejects.toThrow(/REDIRECT/);
      expect(caminhoDoRedirect()).toBe("/trilhas");
    }
  });

  it("erro do mentorado volta para /portal/trilha, não para /portal/trilhas", async () => {
    duble();
    const fd = new FormData();
    fd.set("aulaId", ""); // recusado antes do banco

    await expect(marcarAula(fd)).rejects.toThrow(/REDIRECT/);
    expect(caminhoDoRedirect()).toBe("/portal/trilha");
  });

  it("o sucesso revalida a MESMA rota que a tela usa", async () => {
    revalidatePathMock.mockClear();
    duble();

    const fd = new FormData();
    fd.set("nome", "Trilha nova");
    await salvarTrilha(fd);
    expect(revalidatePathMock).toHaveBeenCalledWith("/trilhas");

    revalidatePathMock.mockClear();
    const fdAula = new FormData();
    fdAula.set("trilhaId", "3f2504e0-4f89-11d3-9a0c-0305e82c3301");
    fdAula.set("titulo", "Aula 1");
    await salvarAula(fdAula);
    expect(revalidatePathMock).toHaveBeenCalledWith("/trilhas/3f2504e0-4f89-11d3-9a0c-0305e82c3301");
  });
});
