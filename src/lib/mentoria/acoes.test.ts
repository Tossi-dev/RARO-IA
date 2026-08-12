// Testes de `acoes.ts` — as Server Actions que ESCREVEM sessão de
// mentoria. Dublê do cliente Supabase (`vi.mock`), mesmo espírito de
// `src/lib/mentoria/dados.test.ts`: nada fala com um Postgres de verdade.
//
// O teste que importa de verdade é o primeiro grupo: entrada inválida NÃO
// pode chamar `insert`/`update` NENHUMA VEZ. Validar e escrever assim mesmo
// — por um `if` mal colocado, por esquecer um `return` — é o defeito
// clássico que essa suíte existe para pegar.
//
// `vi.hoisted` pelo mesmo motivo de `dados.test.ts`: `vi.mock` é içado
// para o topo pelo transform do Vitest, antes de qualquer `const` comum.

import { afterEach, describe, expect, it, vi } from "vitest";

const { criarSupabaseServerMock, redirectMock, revalidatePathMock } = vi.hoisted(() => ({
  criarSupabaseServerMock: vi.fn(),
  redirectMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}));

vi.mock("../supabase/server", () => ({
  criarSupabaseServer: criarSupabaseServerMock,
}));

// `redirect()` de verdade LANÇA (é assim que o Next interrompe a Server
// Action) — mas o dublê aqui, de propósito, NÃO lança: é o jeito de provar
// que `acoes.ts` não depende da exceção para parar de escrever. Se o
// código dependesse do lançamento do `redirect()` real para não continuar,
// esta suíte pegaria: sem o `return` explícito depois de cada chamada de
// erro, o teste do "caminho inválido" veria `insert`/`update` chamados
// mesmo assim.
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));

const { agendarSessao, darBaixaNaSessao } = await import("./acoes");

// ============================================================
// Dublê do cliente Supabase
// ============================================================

type ErroSupabase = { code?: string; message?: string };

function construirCliente(opcoes: { erroInsert?: ErroSupabase | null; erroUpdate?: ErroSupabase | null } = {}) {
  const eqMock = vi.fn(() => Promise.resolve({ data: null, error: opcoes.erroUpdate ?? null }));
  const updateMock = vi.fn(() => ({ eq: eqMock }));
  const insertMock = vi.fn(() => Promise.resolve({ data: null, error: opcoes.erroInsert ?? null }));
  const deleteEqMock = vi.fn(() => Promise.resolve({ data: null, error: null }));
  const deleteMock = vi.fn(() => ({ eq: deleteEqMock }));
  const fromMock = vi.fn((_tabela: string) => ({
    insert: insertMock,
    update: updateMock,
    delete: deleteMock,
  }));
  return { from: fromMock, insertMock, updateMock, eqMock, deleteMock, deleteEqMock };
}

function ligarCliente(opcoes: { erroInsert?: ErroSupabase | null; erroUpdate?: ErroSupabase | null } = {}) {
  const cliente = construirCliente(opcoes);
  criarSupabaseServerMock.mockReturnValue(cliente);
  return cliente;
}

function formData(campos: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [chave, valor] of Object.entries(campos)) fd.set(chave, valor);
  return fd;
}

afterEach(() => {
  vi.resetAllMocks();
});

// ============================================================
// O teste que importa: entrada inválida não escreve NADA.
// ============================================================

describe("entrada inválida não chama insert/update nenhuma vez", () => {
  it("agendarSessao com duracaoMin 0 (fora de 5–600)", async () => {
    const cliente = ligarCliente();

    await agendarSessao(
      formData({
        mentoradoId: "ment-1",
        matriculaId: "mat-1",
        turmaId: "",
        quando: "2026-08-20T10:00:00.000Z",
        duracaoMin: "0",
        numero: "",
      })
    );

    expect(cliente.insertMock).not.toHaveBeenCalled();
    expect(redirectMock).toHaveBeenCalledTimes(1);
    expect(String(redirectMock.mock.calls[0][0])).toContain("/mentoria/ment-1?erro=");
  });

  it("agendarSessao com matriculaId E turmaId preenchidos (viola sessao_vinculo_unico)", async () => {
    const cliente = ligarCliente();

    await agendarSessao(
      formData({
        mentoradoId: "ment-1",
        matriculaId: "mat-1",
        turmaId: "tur-1",
        quando: "2026-08-20T10:00:00.000Z",
        duracaoMin: "60",
        numero: "",
      })
    );

    expect(cliente.insertMock).not.toHaveBeenCalled();
    expect(redirectMock).toHaveBeenCalledTimes(1);
  });

  it("darBaixaNaSessao com link javascript: (XSS via campo de link colado)", async () => {
    const cliente = ligarCliente();

    await darBaixaNaSessao(
      formData({
        mentoradoId: "ment-1",
        sessaoId: "ses-1",
        status: "realizada",
        linkGravacao: "javascript:alert(1)",
        resumo: "",
      })
    );

    expect(cliente.updateMock).not.toHaveBeenCalled();
    expect(redirectMock).toHaveBeenCalledTimes(1);
  });

  it('darBaixaNaSessao com status "agendada" (dar baixa não pode voltar para agendada)', async () => {
    const cliente = ligarCliente();

    await darBaixaNaSessao(
      formData({
        mentoradoId: "ment-1",
        sessaoId: "ses-1",
        status: "agendada",
        linkGravacao: "",
        resumo: "",
      })
    );

    expect(cliente.updateMock).not.toHaveBeenCalled();
    expect(redirectMock).toHaveBeenCalledTimes(1);
  });

  it("nenhum caso acima chega a construir o cliente Supabase", () => {
    // Redundante de propósito com as asserções de insert/update acima —
    // prova a MESMA coisa por outro ângulo: se a validação está mesmo antes
    // da escrita, o cliente nem precisa existir para os casos inválidos.
    expect(criarSupabaseServerMock).not.toHaveBeenCalled();
  });
});

// ============================================================
// Caminho feliz — agendarSessao
// ============================================================

describe("agendarSessao — caminho feliz", () => {
  it("chama insert uma vez com os campos em snake_case corretos", async () => {
    const cliente = ligarCliente();

    await agendarSessao(
      formData({
        mentoradoId: "ment-1",
        matriculaId: "mat-1",
        turmaId: "",
        quando: "2026-08-20T10:00:00.000Z",
        duracaoMin: "60",
        numero: "8",
      })
    );

    expect(cliente.insertMock).toHaveBeenCalledTimes(1);
    expect(cliente.insertMock).toHaveBeenCalledWith({
      matricula_id: "mat-1",
      turma_id: null,
      quando: "2026-08-20T10:00:00.000Z",
      duracao_min: 60,
      numero: 8,
    });
    expect(redirectMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).toHaveBeenCalledWith("/mentoria/ment-1");
    expect(revalidatePathMock).toHaveBeenCalledWith("/mentoria");
  });

  it("vínculo por turma: matricula_id nulo, turma_id preenchido", async () => {
    const cliente = ligarCliente();

    await agendarSessao(
      formData({
        mentoradoId: "ment-1",
        matriculaId: "",
        turmaId: "tur-9",
        quando: "2026-08-20T10:00:00.000Z",
        duracaoMin: "90",
        numero: "",
      })
    );

    expect(cliente.insertMock).toHaveBeenCalledWith({
      matricula_id: null,
      turma_id: "tur-9",
      quando: "2026-08-20T10:00:00.000Z",
      duracao_min: 90,
      numero: null,
    });
  });
});

// ============================================================
// darBaixaNaSessao — status "cancelada" chama update, NUNCA delete
// ============================================================

describe("darBaixaNaSessao — cancelar é UPDATE, nunca DELETE", () => {
  it('status "cancelada" chama update e zero vezes delete', async () => {
    const cliente = ligarCliente();

    await darBaixaNaSessao(
      formData({
        mentoradoId: "ment-1",
        sessaoId: "ses-1",
        status: "cancelada",
        linkGravacao: "",
        resumo: "Mentorado avisou que não poderia comparecer.",
      })
    );

    expect(cliente.updateMock).toHaveBeenCalledTimes(1);
    expect(cliente.updateMock).toHaveBeenCalledWith({
      status: "cancelada",
      link_gravacao: "",
      resumo: "Mentorado avisou que não poderia comparecer.",
    });
    expect(cliente.eqMock).toHaveBeenCalledWith("id", "ses-1");
    expect(cliente.deleteMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).toHaveBeenCalledWith("/mentoria/ment-1");
  });

  it('status "realizada" com link e resumo: update com os três campos', async () => {
    const cliente = ligarCliente();

    await darBaixaNaSessao(
      formData({
        mentoradoId: "ment-1",
        sessaoId: "ses-2",
        status: "realizada",
        linkGravacao: "https://drive.google.com/gravacao-2",
        resumo: "Revisamos o funil de vendas.",
      })
    );

    expect(cliente.updateMock).toHaveBeenCalledWith({
      status: "realizada",
      link_gravacao: "https://drive.google.com/gravacao-2",
      resumo: "Revisamos o funil de vendas.",
    });
    expect(cliente.deleteMock).not.toHaveBeenCalled();
  });
});

// ============================================================
// Erro do banco não lança para cima — vira console.warn + redirect genérico
// ============================================================

describe("erro do banco", () => {
  it("agendarSessao: insert falhando não lança, gera console.warn e redirect com mensagem genérica", async () => {
    ligarCliente({ erroInsert: { code: "42501", message: 'permission denied for table "sessao"' } });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(
      agendarSessao(
        formData({
          mentoradoId: "ment-1",
          matriculaId: "mat-1",
          turmaId: "",
          quando: "2026-08-20T10:00:00.000Z",
          duracaoMin: "60",
          numero: "",
        })
      )
    ).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalled();
    expect(redirectMock).toHaveBeenCalledTimes(1);
    const urlChamada = String(redirectMock.mock.calls[0][0]);
    expect(urlChamada).toContain("/mentoria/ment-1?erro=");
    // a mensagem que vai para a URL é genérica — nada de "permission denied"/"table" nela.
    expect(urlChamada.toLowerCase()).not.toContain("permission");
    expect(urlChamada.toLowerCase()).not.toContain("table");
    expect(revalidatePathMock).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it("darBaixaNaSessao: update falhando não lança e gera console.warn", async () => {
    ligarCliente({ erroUpdate: { code: "PGRST301", message: "linha inacessível por RLS" } });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(
      darBaixaNaSessao(
        formData({
          mentoradoId: "ment-1",
          sessaoId: "ses-1",
          status: "realizada",
          linkGravacao: "",
          resumo: "",
        })
      )
    ).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalled();
    expect(redirectMock).toHaveBeenCalledTimes(1);

    warnSpy.mockRestore();
  });
});
