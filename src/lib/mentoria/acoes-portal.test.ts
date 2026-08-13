// Testes de `acoes-portal.ts` — as Server Actions do PORTAL DO MENTORADO
// (B3.2): `concluirTarefa`/`reabrirTarefa`. Mesmo espírito de dublê de
// `acoes.test.ts` (`vi.mock` do cliente Supabase, `vi.hoisted` para escapar
// do TDZ do `vi.mock` içado).
//
// MÉTODO TDD: este arquivo nasceu ANTES de `acoes-portal.ts` — cada bloco
// abaixo roda contra um módulo que ainda não existe, falha, e só depois
// ganha implementação.
//
// ALTO 1 da auditoria (ver `supabase/migrations/0013_portal_tarefa_por_funcao.sql`):
// um `.update()` direto na tabela, mesmo escopado por `.eq("id", tarefaId)`,
// é RLS por LINHA — nada impede reescrever `titulo`/`prazo`, forjar
// `concluida_em`, ou mover a tarefa para outro `mentorado_id` no mesmo PATCH.
// Por isso esta suíte não afirma mais `update`/`eq`: afirma que a ação chama
// `s.rpc("portal_marcar_tarefa", { p_tarefa_id, p_concluida })`, a ÚNICA
// porta que 0013 deixa aberta para o mentorado escrever nesta tabela.
//
// O teste que mais importa aqui, na mesma ordem de prioridade de
// `acoes.test.ts`:
//   1) id inválido (vazio, ou maior que o razoável) NUNCA chama `rpc`.
//   2) NUNCA chama `delete` (nem `update` direto na tabela) — dar baixa/
//      reabrir é sempre `rpc`, nunca escrita direta.
//   3) quem decide se a pessoa pode marcar ESTA tarefa é a função
//      `security definer` do banco (ver 0013) — esta suíte não simula
//      "outro mentorado tentando", porque não é isto que a Server Action
//      decide: ela só valida o FORMATO do id e chama o `rpc`. Quem barra a
//      tarefa errada é `portal_marcar_tarefa`, que não tem como ser
//      exercitada por um dublê em memória.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { criarSupabaseServerMock, revalidatePathMock, redirectMock } = vi.hoisted(() => ({
  criarSupabaseServerMock: vi.fn(),
  revalidatePathMock: vi.fn(),
  redirectMock: vi.fn(),
}));

vi.mock("../supabase/server", () => ({
  criarSupabaseServer: criarSupabaseServerMock,
}));

vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));

// `redirect()` de verdade LANÇA — o dublê aqui, de propósito, NÃO lança:
// prova que `acoes-portal.ts` não depende da exceção para parar de escrever
// (mesmo raciocínio documentado em `acoes.test.ts`).
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

const { concluirTarefa, reabrirTarefa } = await import("./acoes-portal");

// ============================================================
// Dublê do cliente Supabase — `rpc`, o único caminho de escrita desta
// tabela para o mentorado (ver 0013). `from`/`update`/`delete` continuam no
// dublê só para o teste "nunca chama delete/update direto" ter algo
// concreto para verificar que NÃO foi chamado — nenhum caminho feliz deste
// arquivo os usa.
// ============================================================

type ErroSupabase = { code?: string; message?: string };

function construirCliente(opcoes: { erroRpc?: ErroSupabase | null } = {}) {
  const rpcMock = vi.fn(() => Promise.resolve({ data: null, error: opcoes.erroRpc ?? null }));
  const eqMock = vi.fn(() => Promise.resolve({ data: null, error: null }));
  const updateMock = vi.fn(() => ({ eq: eqMock }));
  const deleteEqMock = vi.fn(() => Promise.resolve({ data: null, error: null }));
  const deleteMock = vi.fn(() => ({ eq: deleteEqMock }));
  const fromMock = vi.fn((_tabela: string) => ({
    update: updateMock,
    delete: deleteMock,
  }));
  return { rpc: rpcMock, from: fromMock, rpcMock, updateMock, eqMock, deleteMock, deleteEqMock };
}

function ligarCliente(opcoes: { erroRpc?: ErroSupabase | null } = {}) {
  const cliente = construirCliente(opcoes);
  criarSupabaseServerMock.mockReturnValue(cliente);
  return cliente;
}

function formData(campos: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [chave, valor] of Object.entries(campos)) fd.set(chave, valor);
  return fd;
}

beforeEach(() => {
  vi.setSystemTime(new Date("2026-08-13T12:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
});

// ============================================================
// Entrada inválida nunca escreve — nem rpc, nem update, nem delete.
// ============================================================

describe("id inválido não chama rpc, update nem delete nenhuma vez", () => {
  it("tarefaId vazio", async () => {
    const cliente = ligarCliente();

    await concluirTarefa(formData({ tarefaId: "" }));

    expect(cliente.rpcMock).not.toHaveBeenCalled();
    expect(cliente.updateMock).not.toHaveBeenCalled();
    expect(cliente.deleteMock).not.toHaveBeenCalled();
    expect(redirectMock).toHaveBeenCalledTimes(1);
    expect(String(redirectMock.mock.calls[0][0])).toContain("/portal?erro=");
  });

  it("tarefaId ausente do formulário", async () => {
    const cliente = ligarCliente();

    await concluirTarefa(new FormData());

    expect(cliente.rpcMock).not.toHaveBeenCalled();
    expect(redirectMock).toHaveBeenCalledTimes(1);
  });

  it("tarefaId só espaço", async () => {
    const cliente = ligarCliente();

    await reabrirTarefa(formData({ tarefaId: "   " }));

    expect(cliente.rpcMock).not.toHaveBeenCalled();
    expect(redirectMock).toHaveBeenCalledTimes(1);
  });

  it("tarefaId absurdamente longo (acima do tamanho razoável)", async () => {
    const cliente = ligarCliente();

    await concluirTarefa(formData({ tarefaId: "x".repeat(500) }));

    expect(cliente.rpcMock).not.toHaveBeenCalled();
    expect(redirectMock).toHaveBeenCalledTimes(1);
  });

  it("nenhum caso acima chega a construir o cliente Supabase", () => {
    expect(criarSupabaseServerMock).not.toHaveBeenCalled();
  });
});

// ============================================================
// Caminho feliz — concluirTarefa
// ============================================================

describe("concluirTarefa — caminho feliz", () => {
  it("chama rpc(portal_marcar_tarefa, {p_tarefa_id, p_concluida:true}), nunca update/delete direto, revalida /portal", async () => {
    const cliente = ligarCliente();

    await concluirTarefa(formData({ tarefaId: "tarefa-1" }));

    expect(cliente.rpcMock).toHaveBeenCalledTimes(1);
    expect(cliente.rpcMock).toHaveBeenCalledWith("portal_marcar_tarefa", {
      p_tarefa_id: "tarefa-1",
      p_concluida: true,
    });
    expect(cliente.updateMock).not.toHaveBeenCalled();
    expect(cliente.deleteMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).toHaveBeenCalledWith("/portal");
    expect(redirectMock).not.toHaveBeenCalled();
  });
});

// ============================================================
// Caminho feliz — reabrirTarefa
// ============================================================

describe("reabrirTarefa — caminho feliz", () => {
  it("chama rpc(portal_marcar_tarefa, {p_tarefa_id, p_concluida:false})", async () => {
    const cliente = ligarCliente();

    await reabrirTarefa(formData({ tarefaId: "tarefa-2" }));

    expect(cliente.rpcMock).toHaveBeenCalledTimes(1);
    expect(cliente.rpcMock).toHaveBeenCalledWith("portal_marcar_tarefa", {
      p_tarefa_id: "tarefa-2",
      p_concluida: false,
    });
    expect(cliente.updateMock).not.toHaveBeenCalled();
    expect(cliente.deleteMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).toHaveBeenCalledWith("/portal");
    expect(redirectMock).not.toHaveBeenCalled();
  });
});

// ============================================================
// Nunca DELETE, nunca UPDATE direto — a garantia mais importante deste
// arquivo (é exatamente o que 0013 fecha: escrita direta nunca acontece,
// só via rpc).
// ============================================================

describe("nunca chama delete nem update direto na tabela, em nenhum caminho", () => {
  it("caminho feliz de concluirTarefa e reabrirTarefa", async () => {
    const cliente = ligarCliente();
    await concluirTarefa(formData({ tarefaId: "t-1" }));
    await reabrirTarefa(formData({ tarefaId: "t-2" }));
    expect(cliente.deleteMock).not.toHaveBeenCalled();
    expect(cliente.updateMock).not.toHaveBeenCalled();
  });

  it("caminho de erro do banco", async () => {
    const cliente = ligarCliente({ erroRpc: { code: "P0001", message: "Não foi possível marcar esta tarefa." } });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    await concluirTarefa(formData({ tarefaId: "t-1" }));
    expect(cliente.deleteMock).not.toHaveBeenCalled();
    expect(cliente.updateMock).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

// ============================================================
// Erro do banco (a função `raise exception`, ex.: zero linhas afetadas por
// RLS/id alheio) não lança — vira console.warn + mensagem genérica.
// ============================================================

describe("erro do rpc (ex.: portal_marcar_tarefa levanta exceção — MÉDIO 4)", () => {
  it("concluirTarefa: não lança, console.warn com o detalhe técnico, redirect com mensagem genérica em ?erro=", async () => {
    ligarCliente({ erroRpc: { code: "P0001", message: "Não foi possível marcar esta tarefa." } });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(concluirTarefa(formData({ tarefaId: "t-1" }))).resolves.toBeUndefined();

    // o detalhe técnico vai para o console.warn...
    expect(warnSpy).toHaveBeenCalled();
    const chamadasWarn = warnSpy.mock.calls.flat().join(" ").toLowerCase();
    expect(chamadasWarn).toContain("não foi possível marcar esta tarefa");

    // ...e a URL que a tela lê carrega um CÓDIGO curto, nunca o texto do
    // banco (MÉDIO 5 — ver `acoes-portal.ts`/`textos.ts`).
    expect(redirectMock).toHaveBeenCalledTimes(1);
    const urlChamada = String(redirectMock.mock.calls[0][0]);
    expect(urlChamada).toContain("/portal?erro=");
    expect(urlChamada.toLowerCase()).not.toContain("marcar+esta+tarefa");
    expect(urlChamada.toLowerCase()).not.toContain("permission");
    expect(urlChamada.toLowerCase()).not.toContain("table");
    expect(urlChamada.toLowerCase()).not.toContain("tarefa_mentoria");

    expect(revalidatePathMock).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it("reabrirTarefa: mesmo tratamento", async () => {
    ligarCliente({ erroRpc: { code: "P0001", message: "Não foi possível marcar esta tarefa." } });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(reabrirTarefa(formData({ tarefaId: "t-1" }))).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalled();
    expect(redirectMock).toHaveBeenCalledTimes(1);
    expect(String(redirectMock.mock.calls[0][0])).toContain("/portal?erro=");
    expect(revalidatePathMock).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });
});
