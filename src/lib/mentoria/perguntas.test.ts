import { describe, expect, it } from "vitest";
import { perguntasPara, registrarReflexao } from "./perguntas";

describe("perguntasPara", () => {
  it("oferece perguntas abertas e limitadas para uma dimensão", () => {
    const perguntas = perguntasPara("profissional", { objetivo: "Delegar melhor" });

    expect(perguntas.length).toBeGreaterThan(0);
    expect(perguntas.length).toBeLessThanOrEqual(5);
    expect(perguntas.every((pergunta) => pergunta.endsWith("?"))).toBe(true);
    expect(perguntas.join(" ")).toContain("Delegar melhor");
  });

  it("não transforma uma pergunta em conselho ou diagnóstico", () => {
    const texto = perguntasPara("emocional", { medo: "Errar em público" }).join(" ");

    expect(texto).not.toMatch(/diagn[oó]stic|tratamento|voc[eê] deve|fa[çc]a /i);
  });

  it("falha fechada para dimensão inválida em tempo de execução", () => {
    expect(perguntasPara("inexistente" as never, { objetivo: "Qualquer" })).toEqual([]);
  });
});

describe("registrarReflexao", () => {
  it("preserva origem e visibilidade escolhidas", () => {
    expect(
      registrarReflexao({
        clienteId: "mentorado-1",
        texto: "  Percebi que tenho mais clareza quando preparo a conversa. ",
        origem: "cliente",
        visibilidade: "compartilhavel",
      })
    ).toEqual({
      ok: true,
      valor: {
        clienteId: "mentorado-1",
        texto: "Percebi que tenho mais clareza quando preparo a conversa.",
        origem: "cliente",
        visibilidade: "compartilhavel",
      },
    });
  });

  it.each([
    { clienteId: "", texto: "Reflexão", origem: "cliente", visibilidade: "compartilhavel" },
    { clienteId: "mentorado-1", texto: "", origem: "cliente", visibilidade: "compartilhavel" },
    { clienteId: "mentorado-1", texto: "Reflexão", origem: "sistema", visibilidade: "compartilhavel" },
    { clienteId: "mentorado-1", texto: "Reflexão", origem: "cliente", visibilidade: "publica" },
  ])("rejeita origem, visibilidade ou conteúdo inválidos", (entrada) => {
    expect(registrarReflexao(entrada).ok).toBe(false);
  });

  it("não compartilha uma reflexão entre clientes", () => {
    const privada = registrarReflexao({
      clienteId: "mentorado-1",
      texto: "Prefiro discutir isto apenas na próxima sessão.",
      origem: "profissional",
      visibilidade: "privada_profissional",
    });
    const compartilhavel = registrarReflexao({
      clienteId: "mentorado-2",
      texto: "Quero revisar minha meta antes do próximo encontro.",
      origem: "cliente",
      visibilidade: "compartilhavel",
    });

    expect(privada).toEqual({
      ok: true,
      valor: {
        clienteId: "mentorado-1",
        texto: "Prefiro discutir isto apenas na próxima sessão.",
        origem: "profissional",
        visibilidade: "privada_profissional",
      },
    });
    expect(compartilhavel).toEqual({
      ok: true,
      valor: {
        clienteId: "mentorado-2",
        texto: "Quero revisar minha meta antes do próximo encontro.",
        origem: "cliente",
        visibilidade: "compartilhavel",
      },
    });
  });
});
