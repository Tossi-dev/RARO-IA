import { afterEach, describe, expect, it, vi } from "vitest";

const { lerHistoricoMock, criarSupabaseServerMock, revalidatePathMock } = vi.hoisted(() => ({
  lerHistoricoMock: vi.fn(), criarSupabaseServerMock: vi.fn(), revalidatePathMock: vi.fn(),
}));
vi.mock("./dados-historico", () => ({ lerHistorico: lerHistoricoMock }));
vi.mock("../supabase/server", () => ({ criarSupabaseServer: criarSupabaseServerMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
import { gravarScoreSemanal } from "./acoes-score";

function form(mentoradoId: string) { const f = new FormData(); f.set("mentoradoId", mentoradoId); return f; }
afterEach(() => vi.resetAllMocks());

describe("gravarScoreSemanal", () => {
  it("não grava score sem base", async () => {
    lerHistoricoMock.mockResolvedValue({ conectado: true, parcial: false, saude: { score: null } });
    await gravarScoreSemanal(form("m-1"), "2026-08-12T12:00:00.000Z");
    expect(criarSupabaseServerMock).not.toHaveBeenCalled();
  });

  it("não grava score calculado sobre leitura parcial", async () => {
    lerHistoricoMock.mockResolvedValue({ conectado: true, parcial: true, saude: { score: 73 } });
    await gravarScoreSemanal(form("m-1"), "2026-08-12T12:00:00.000Z");
    expect(criarSupabaseServerMock).not.toHaveBeenCalled();
  });

  it("deriva a segunda-feira do agoraIso e faz upsert, ignorando semana do formulário", async () => {
    lerHistoricoMock.mockResolvedValue({ conectado: true, parcial: false, saude: { score: 73 } });
    const upsert = vi.fn(() => Promise.resolve({ error: null }));
    criarSupabaseServerMock.mockReturnValue({ from: vi.fn(() => ({ upsert })) });
    const f = form("m-1"); f.set("semana", "1999-01-01");
    await gravarScoreSemanal(f, "2026-08-12T12:00:00.000Z");
    expect(upsert).toHaveBeenCalledWith({ mentorado_id: "m-1", semana: "2026-08-10", score: 73 }, { onConflict: "mentorado_id,semana" });
  });
});
