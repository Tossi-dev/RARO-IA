// Testes das Server Actions do onboarding.
//
// O QUE ESTA SUÍTE PROVA
// ----------------------
// 1) DEFESA DUPLA na etapa do mentor, e as DUAS são exercitadas: a ação
//    recusa antes do banco (conveniência, para a mensagem ser específica) e a
//    função do banco recusa de novo (a barreira de verdade). Uma suíte que só
//    testasse a primeira daria a impressão de que a segunda é supérflua;
// 2) `marcarMinhaEtapa` passa pelo `rpc` e por nenhum `.update()`;
// 3) reordenar e arquivar NUNCA apagam — apagar levaria junto, em cascata, o
//    progresso de quem já cumpriu a etapa;
// 4) nenhuma ação lê `workspace_id` do formulário, e nenhuma data de
//    conclusão vem de fora.

import { beforeEach, describe, expect, it, vi } from "vitest";

const criarSupabaseServerMock = vi.fn();
const revalidatePathMock = vi.fn();
const lerMeuOnboardingMock = vi.fn();
const redirectMock = vi.fn((destino: string) => {
  const e = new Error(`REDIRECT:${destino}`) as Error & { digest: string };
  e.digest = `NEXT_REDIRECT;${destino}`;
  throw e;
});

vi.mock("../supabase/server", () => ({ criarSupabaseServer: criarSupabaseServerMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("./dados", () => ({ lerMeuOnboarding: lerMeuOnboardingMock }));

const {
  salvarEtapa,
  reordenarEtapa,
  arquivarEtapa,
  marcarEtapaDoMentor,
  marcarMinhaEtapa,
  MOTIVO_TITULO_VAZIO,
  MOTIVO_ORDEM_INVALIDA,
  MOTIVO_RESPONSAVEL_INVALIDO,
  MOTIVO_ETAPA_INVALIDA,
  CODIGO_ETAPA,
} = await import("./acoes");

const ETAPA = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
const MENTORADO = "7f2504e0-4f89-11d3-9a0c-0305e82c3399";

interface Registro {
  tabela: string;
  operacao: string;
  valores?: unknown;
  opcoes?: unknown;
  eq: Array<[string, unknown]>;
}

function duble(opcoes: { erro?: { code?: string } | null; erroRpc?: { code?: string } | null } = {}) {
  const registros: Registro[] = [];
  const rpcMock = vi.fn((_nome: string, _args?: Record<string, unknown>) =>
    Promise.resolve({ data: null, error: opcoes.erroRpc ?? null }),
  );

  const cliente = {
    rpc: rpcMock,
    from(tabela: string) {
      const reg: Registro = { tabela, operacao: "", eq: [] };
      const b: Record<string, unknown> = {};
      b.insert = (v: unknown) => {
        reg.operacao = "insert";
        reg.valores = v;
        registros.push(reg);
        return Promise.resolve({ error: opcoes.erro ?? null });
      };
      b.upsert = (v: unknown, o: unknown) => {
        reg.operacao = "upsert";
        reg.valores = v;
        reg.opcoes = o;
        registros.push(reg);
        return Promise.resolve({ error: opcoes.erro ?? null });
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
        return Promise.resolve({ error: opcoes.erro ?? null });
      };
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

function meuOnboardingCom(responsavel: string) {
  return {
    conectado: true,
    motivo: "",
    ehMentorado: true,
    etapas: [
      {
        id: ETAPA,
        workspaceId: "ws-1",
        ordem: 1,
        titulo: "Etapa",
        descricao: "",
        responsavel,
        obrigatoria: true,
        ativa: true,
        criadoEm: "",
      },
    ],
    progresso: [],
    estado: { pct: 0, proximaEtapa: null, pendentesDoMentor: [], pendentesDoMentorado: [], concluido: false },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  lerMeuOnboardingMock.mockResolvedValue(meuOnboardingCom("mentorado"));
});

describe("salvarEtapa", () => {
  it("título vazio é recusado antes do banco", async () => {
    const { registros } = duble();
    const erro = await erroDe(salvarEtapa(form({ titulo: "  ", responsavel: "mentor" })));

    expect(erro).toBe(MOTIVO_TITULO_VAZIO);
    expect(registros).toEqual([]);
  });

  it("responsável fora do enum é ERRO, não vira 'mentor' calado", async () => {
    // `responsavelDaEtapa` cai em "mentor" na LEITURA, de propósito. Na
    // escrita, gravar um padrão no lugar de um valor torto seria decidir por
    // quem preencheu, sem avisar.
    const { registros } = duble();
    for (const valor of ["", "aluno", "MENTOR", "mentorados"]) {
      const erro = await erroDe(salvarEtapa(form({ titulo: "T", responsavel: valor })));
      expect([valor, erro]).toEqual([valor, MOTIVO_RESPONSAVEL_INVALIDO]);
    }
    expect(registros).toEqual([]);
  });

  it("espaço nas pontas é aceito — é ruído de digitação, não valor errado", async () => {
    // O `texto()` do módulo apara as pontas antes de comparar, como todas as
    // outras ações fazem. Caixa trocada NÃO é aceita: "MENTOR" vem de outro
    // lugar que não o formulário da tela, e nesse caso a recusa é o certo.
    const { registros } = duble();
    await salvarEtapa(form({ titulo: "T", responsavel: "  mentorado  " }));

    expect((registros[0].valores as Record<string, unknown>).responsavel).toBe("mentorado");
  });

  it("ordem negativa ou quebrada é recusada antes do banco", async () => {
    const { registros } = duble();
    for (const valor of ["-1", "1,5", "abc", "1.5"]) {
      const erro = await erroDe(salvarEtapa(form({ titulo: "T", responsavel: "mentor", ordem: valor })));
      expect([valor, erro]).toEqual([valor, MOTIVO_ORDEM_INVALIDA]);
    }
    expect(registros).toEqual([]);
  });

  it("não lê workspace_id do formulário, e a etapa nasce ativa", async () => {
    const { registros } = duble();

    await salvarEtapa(
      form({ titulo: "Assinar", responsavel: "mentorado", obrigatoria: "1", workspaceId: "ws-alheio" }),
    );

    const valores = registros[0].valores as Record<string, unknown>;
    expect(Object.keys(valores)).not.toContain("workspace_id");
    expect(valores).toEqual({
      titulo: "Assinar",
      descricao: "",
      responsavel: "mentorado",
      ordem: 0,
      obrigatoria: true,
      ativa: true,
    });
  });

  it("só o literal '1' torna a etapa obrigatória", async () => {
    for (const valor of ["0", "true", "sim", ""]) {
      const { registros } = duble();
      await salvarEtapa(form({ titulo: "T", responsavel: "mentor", obrigatoria: valor }));
      expect([valor, (registros[0].valores as Record<string, unknown>).obrigatoria]).toEqual([valor, false]);
    }
  });

  it("com id, atualiza a linha daquele id", async () => {
    const { registros } = duble();
    await salvarEtapa(form({ id: ETAPA, titulo: "T", responsavel: "mentor" }));

    expect(registros[0].operacao).toBe("update");
    expect(registros[0].eq).toEqual([["id", ETAPA]]);
  });
});

describe("reordenar e arquivar — nunca apagam", () => {
  it("reordenar só troca `ordem`, e não apaga linha nenhuma", async () => {
    // Recriar a etapa para mudar a posição destruiria, em cascata, o
    // progresso de todo mundo que já a cumpriu.
    const { registros } = duble();
    await reordenarEtapa(form({ id: ETAPA, ordem: "3" }));

    expect(registros[0].operacao).toBe("update");
    expect(registros[0].valores).toEqual({ ordem: 3 });
    expect(registros.some((r) => r.operacao === "delete")).toBe(false);
  });

  it("arquivar desliga `ativa`, e não apaga", async () => {
    const { registros } = duble();
    await arquivarEtapa(form({ id: ETAPA }));

    expect(registros[0].operacao).toBe("update");
    expect(registros[0].valores).toEqual({ ativa: false });
    expect(registros[0].eq).toEqual([["id", ETAPA]]);
    expect(registros.some((r) => r.operacao === "delete")).toBe(false);
  });

  it("id inválido é recusado antes do banco nas duas", async () => {
    const { registros } = duble();
    expect(await erroDe(reordenarEtapa(form({ id: "", ordem: "1" })))).toBe(MOTIVO_ETAPA_INVALIDA);
    expect(await erroDe(arquivarEtapa(form({ id: "" })))).toBe(MOTIVO_ETAPA_INVALIDA);
    expect(registros).toEqual([]);
  });

  it("o fonte não contém `.delete(` em lugar nenhum", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    expect(readFileSync(join(process.cwd(), "src/lib/onboarding/acoes.ts"), "utf8")).not.toContain(".delete(");
  });
});

describe("marcarEtapaDoMentor — a baixa da gestão", () => {
  it("faz upsert no par único, com a data vinda do servidor", async () => {
    const { registros } = duble();
    await marcarEtapaDoMentor(form({ etapaId: ETAPA, mentoradoId: MENTORADO, concluida: "1" }));

    const reg = registros[0];
    expect(reg.operacao).toBe("upsert");
    expect(reg.opcoes).toEqual({ onConflict: "mentorado_id,etapa_id" });

    const valores = reg.valores as Record<string, unknown>;
    expect(valores.mentorado_id).toBe(MENTORADO);
    expect(valores.etapa_id).toBe(ETAPA);
    expect(valores.concluida).toBe(true);
    expect(typeof valores.concluida_em).toBe("string");
  });

  it("desmarcar limpa a data em vez de deixar a antiga", async () => {
    const { registros } = duble();
    await marcarEtapaDoMentor(form({ etapaId: ETAPA, mentoradoId: MENTORADO, concluida: "0" }));

    const valores = registros[0].valores as Record<string, unknown>;
    expect(valores.concluida).toBe(false);
    expect(valores.concluida_em).toBeNull();
  });

  it("a data NÃO vem do formulário", async () => {
    const { registros } = duble();
    await marcarEtapaDoMentor(
      form({ etapaId: ETAPA, mentoradoId: MENTORADO, concluida: "1", concluidaEm: "2020-01-01T00:00:00Z" }),
    );

    expect((registros[0].valores as Record<string, unknown>).concluida_em).not.toBe("2020-01-01T00:00:00Z");
  });
});

describe("marcarMinhaEtapa — a defesa dupla", () => {
  it("passa pelo rpc, com os dois argumentos, e por nenhum update", async () => {
    const { registros, rpcMock } = duble();
    await marcarMinhaEtapa(form({ etapaId: ETAPA, concluida: "1" }));

    expect(rpcMock).toHaveBeenCalledWith("onboarding_marcar", { p_etapa_id: ETAPA, p_concluida: true });
    expect(registros.some((r) => r.operacao === "update")).toBe(false);
    expect(registros.some((r) => r.tabela === "onboarding_progresso")).toBe(false);
  });

  it("não manda data nem mentorado por parâmetro", async () => {
    const { rpcMock } = duble();
    await marcarMinhaEtapa(
      form({ etapaId: ETAPA, concluida: "1", concluidaEm: "2020-01-01T00:00:00Z", mentoradoId: "outro" }),
    );

    expect(Object.keys(rpcMock.mock.calls[0][1] as Record<string, unknown>)).toEqual([
      "p_etapa_id",
      "p_concluida",
    ]);
  });

  // DEFESA 1 — a conveniência.
  it("etapa do MENTOR é recusada aqui, ANTES do banco", async () => {
    lerMeuOnboardingMock.mockResolvedValue(meuOnboardingCom("mentor"));
    const { rpcMock } = duble();

    const erro = await erroDe(marcarMinhaEtapa(form({ etapaId: ETAPA, concluida: "1" })));

    expect(erro).toBe(CODIGO_ETAPA);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("etapa com responsável ilegível também é recusada — não é do mentorado", async () => {
    lerMeuOnboardingMock.mockResolvedValue(meuOnboardingCom("quem-sabe"));
    const { rpcMock } = duble();

    await erroDe(marcarMinhaEtapa(form({ etapaId: ETAPA, concluida: "1" })));
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("etapa que nem aparece na leitura é recusada", async () => {
    const { rpcMock } = duble();
    const erro = await erroDe(marcarMinhaEtapa(form({ etapaId: "outra-etapa", concluida: "1" })));

    expect(erro).toBe(CODIGO_ETAPA);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  // DEFESA 2 — a barreira. O caso em que a checagem de cima passou (a leitura
  // disse que a etapa é do mentorado) e o BANCO recusou assim mesmo.
  it("quando a checagem local passa e a FUNÇÃO recusa, o erro é tratado — nada de sucesso silencioso", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    lerMeuOnboardingMock.mockResolvedValue(meuOnboardingCom("mentorado"));
    const { rpcMock } = duble({ erroRpc: { code: "P0001" } });

    const erro = await erroDe(marcarMinhaEtapa(form({ etapaId: ETAPA, concluida: "1" })));

    expect(rpcMock).toHaveBeenCalled();
    expect(erro).toBe(CODIGO_ETAPA);
  });

  it("o erro volta como CÓDIGO curto, nunca como frase na URL", async () => {
    const { rpcMock } = duble();
    void rpcMock;
    const erro = await erroDe(marcarMinhaEtapa(form({ etapaId: "", concluida: "1" })));

    expect(erro).toBe(CODIGO_ETAPA);
    expect(erro).not.toContain(" ");
  });

  it("volta para /portal, e não para uma rota que não existe", async () => {
    duble();
    await erroDe(marcarMinhaEtapa(form({ etapaId: "", concluida: "1" })));
    expect(String(redirectMock.mock.calls.at(-1)?.[0] ?? "").split("?")[0]).toBe("/portal");
  });

  it("o código é um dos que a tela do portal sabe traduzir", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const textos = readFileSync(join(process.cwd(), "src/app/(app)/portal/textos.ts"), "utf8");
    expect(textos, `esperava o código ${CODIGO_ETAPA} em MENSAGENS_ERRO`).toContain(`  ${CODIGO_ETAPA}: "`);
  });
});
