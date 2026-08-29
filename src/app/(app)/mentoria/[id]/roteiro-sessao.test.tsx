import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { converterPerguntaEmPasso, editarPergunta, registrarReflexaoLocal, roteiroDaFicha, RoteiroSessao } from "./roteiro-sessao";

describe("roteiro de sessão da ficha profissional", () => {
  it("representa roteiro vazio sem inventar perguntas", () => {
    expect(roteiroDaFicha({ mapa: [], metas: [], consentimentos: [] })).toEqual([]);
  });
  it("permite editar uma pergunta contextual sem alterar as demais", () => {
    const roteiro = roteiroDaFicha({ mapa: [{ id: "m1", dimensao: "profissional", objetivo: "organizar a semana" }], metas: [], consentimentos: [{ categoria: "mapa", consentido: true }] });
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

  it.each([
    ["desconectado", { conectado: false, encontrado: true, consentimentos: [{ categoria: "mapa", consentido: true }] }],
    ["ficha inexistente", { conectado: true, encontrado: false, consentimentos: [{ categoria: "mapa", consentido: true }] }],
    ["consentimento de mapa ausente", { conectado: true, encontrado: true, consentimentos: [] }],
    ["consentimento de meta ausente", { conectado: true, encontrado: true, consentimentos: [{ categoria: "mapa", consentido: true }] }],
  ])("não deriva perguntas quando o atendimento está indisponível (%s)", (_nome, estado) => {
    const atendimento = {
      ...estado,
      mapa: [{ id: "m1", dimensao: "profissional", objetivo: "OBJETIVO CONFIDENCIAL" }],
      metas: [{ id: "meta-1", titulo: "Meta confidencial" }], passos: [], reflexoes: [],
    } as any;
    const html = renderToStaticMarkup(<RoteiroSessao atendimento={atendimento} />);
    expect(roteiroDaFicha(atendimento)).toEqual([]);
    expect(html).not.toContain("OBJETIVO CONFIDENCIAL");
    expect(html).not.toContain("Meta confidencial");
    expect(html).toContain("Roteiro indisponível");
  });

  it("trata consentimentos ausentes como indisponível e não imprime o objetivo", () => {
    const atendimento = { conectado: true, encontrado: true, mapa: [{ dimensao: "profissional", objetivo: "OBJETIVO SEM CONSENTIMENTO" }], metas: [], passos: [], reflexoes: [] } as any;
    const html = renderToStaticMarkup(<RoteiroSessao atendimento={atendimento} />);
    expect(roteiroDaFicha(atendimento)).toEqual([]);
    expect(html).toContain("Roteiro indisponível");
    expect(html).not.toContain("OBJETIVO SEM CONSENTIMENTO");
  });
});
