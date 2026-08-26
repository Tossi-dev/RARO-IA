import { describe, expect, it } from "vitest";
import { atualizarPasso, criarPlanoDeAcao, proximosPassosDe } from "./plano-acao";

const AGORA = "2026-08-26T12:00:00.000Z";

describe("criarPlanoDeAcao", () => {
  it("cria uma meta futura com passos ordenados e responsáveis", () => {
    expect(
      criarPlanoDeAcao(
        {
          planoId: "plano-1",
          clienteId: "mentorado-1",
          meta: "Delegar a rotina semanal",
          prazo: "2026-09-30T12:00:00.000Z",
          passos: [
            { id: "passo-1", titulo: "Listar tarefas", responsavel: "cliente" },
            { id: "passo-2", titulo: "Conversar com a equipe", responsavel: "cliente" },
          ],
        },
        AGORA
      )
    ).toEqual({
      ok: true,
      valor: {
        planoId: "plano-1",
        clienteId: "mentorado-1",
        meta: "Delegar a rotina semanal",
        prazo: "2026-09-30T12:00:00.000Z",
        passos: [
          { id: "passo-1", titulo: "Listar tarefas", responsavel: "cliente", status: "pendente" },
          { id: "passo-2", titulo: "Conversar com a equipe", responsavel: "cliente", status: "pendente" },
        ],
      },
    });
  });

  it.each([
    { planoId: "plano-1", clienteId: "", meta: "Meta", prazo: "2026-09-30T12:00:00.000Z", passos: [] },
    { planoId: "plano-1", clienteId: "mentorado-1", meta: "", prazo: "2026-09-30T12:00:00.000Z", passos: [] },
    { planoId: "plano-1", clienteId: "mentorado-1", meta: "Meta", prazo: "invalido", passos: [] },
    { planoId: "plano-1", clienteId: "mentorado-1", meta: "Meta", prazo: "2026-09-30T12:00:00", passos: [] },
    { planoId: "plano-1", clienteId: "mentorado-1", meta: "Meta", prazo: "September 30, 2026", passos: [] },
    { planoId: "plano-1", clienteId: "mentorado-1", meta: "Meta", prazo: "2026-08-26T12:00:00.000Z", passos: [] },
  ])("rejeita cliente, meta ou prazo inválido", (entrada) => {
    expect(criarPlanoDeAcao(entrada, AGORA).ok).toBe(false);
  });

  it("rejeita passo duplicado", () => {
    expect(
      criarPlanoDeAcao(
        {
          planoId: "plano-1",
          clienteId: "mentorado-1",
          meta: "Meta",
          prazo: "2026-09-30T12:00:00.000Z",
          passos: [
            { id: "passo-1", titulo: "Primeiro", responsavel: "cliente" },
            { id: "passo-1", titulo: "Segundo", responsavel: "cliente" },
          ],
        },
        AGORA
      )
    ).toEqual({ ok: false, erro: "Cada passo precisa de um identificador único." });
  });
});

describe("atualizarPasso e proximosPassosDe", () => {
  const plano = {
    planoId: "plano-1",
    clienteId: "mentorado-1",
    meta: "Meta",
    prazo: "2026-09-30T12:00:00.000Z",
    passos: [
      { id: "passo-1", titulo: "Primeiro", responsavel: "cliente", status: "pendente" as const },
      { id: "passo-2", titulo: "Segundo", responsavel: "profissional", status: "concluido" as const },
      { id: "passo-3", titulo: "Terceiro", responsavel: "cliente", status: "em_andamento" as const },
    ],
  };

  it("atualiza apenas o passo indicado e preserva o plano de origem", () => {
    const resultado = atualizarPasso(plano, "passo-1", "concluido");

    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(resultado.valor.passos[0].status).toBe("concluido");
      expect(plano.passos[0].status).toBe("pendente");
      expect(resultado.valor.clienteId).toBe("mentorado-1");
    }
  });

  it("mantém em ordem somente os próximos passos ativos", () => {
    expect(proximosPassosDe(plano).map((passo) => passo.id)).toEqual(["passo-1", "passo-3"]);
  });

  it("rejeita passo ou estado inexistente", () => {
    expect(atualizarPasso(plano, "ausente", "concluido").ok).toBe(false);
    expect(atualizarPasso(plano, "passo-1", "automatico" as never).ok).toBe(false);
  });
});
