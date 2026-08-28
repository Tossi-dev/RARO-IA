import { describe, expect, it } from "vitest";
import { converterPerguntaEmPasso, editarPergunta, registrarReflexaoLocal, roteiroDaFicha } from "./roteiro-sessao";

describe("roteiro de sessão da ficha profissional", () => {
  it("representa roteiro vazio sem inventar perguntas", () => {
    expect(roteiroDaFicha({ mapa: [], metas: [] })).toEqual([]);
  });
  it("permite editar uma pergunta contextual sem alterar as demais", () => {
    const roteiro = roteiroDaFicha({ mapa: [{ id: "m1", dimensao: "profissional", objetivo: "organizar a semana" }], metas: [] });
    const editado = editarPergunta(roteiro, roteiro[0].id, "O que você quer observar nesta semana?");
    expect(editado[0].pergunta).toBe("O que você quer observar nesta semana?");
    expect(roteiro[0].pergunta).toContain("organizar a semana");
  });
  it("registra reflexão livre como nota do profissional, sem resposta prescrita", () => {
    expect(registrarReflexaoLocal([], "Quero retomar este tema na próxima conversa.")).toEqual([
      { id: expect.stringContaining("reflexao-local-"), texto: "Quero retomar este tema na próxima conversa.", origem: "profissional", visibilidade: "privada_profissional" },
    ]);
  });
  it("converte uma pergunta editada em passo pendente para o profissional", () => {
    expect(converterPerguntaEmPasso([], [{ id: "p1", pergunta: "O que observar?", dimensao: "profissional" }], "p1")).toEqual([
      expect.objectContaining({ descricao: "O que observar?", status: "pendente", responsavel: "profissional" }),
    ]);
  });
});
