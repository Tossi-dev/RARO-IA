import { describe, expect, it } from "vitest";
import { DIMENSOES_VIDA, validarMapaCliente } from "./mapa-cliente";

describe("validarMapaCliente", () => {
  it("preserva apenas autoavaliações explícitas de 0 a 10", () => {
    const resultado = validarMapaCliente({
      clienteId: "mentorado-1",
      dor: "  Tenho dificuldade de delegar.  ",
      medo: "Perder o controle",
      objetivo: "Construir uma equipe confiável",
      notas: { saude: 7, emocional: 10 },
    });

    expect(resultado).toEqual({
      ok: true,
      valor: {
        clienteId: "mentorado-1",
        dor: "Tenho dificuldade de delegar.",
        medo: "Perder o controle",
        objetivo: "Construir uma equipe confiável",
        notas: { saude: 7, emocional: 10 },
      },
    });
  });

  it("preserva ausência sem inventar nota ou diagnóstico", () => {
    const resultado = validarMapaCliente({ clienteId: "mentorado-1", notas: { profissional: 8 } });

    expect(resultado).toEqual({
      ok: true,
      valor: { clienteId: "mentorado-1", notas: { profissional: 8 } },
    });
    if (resultado.ok) {
      expect("emocional" in resultado.valor.notas).toBe(false);
      expect(JSON.stringify(resultado.valor)).not.toMatch(/diagn[oó]stico|risco/i);
    }
  });

  it("não compartilha notas entre mapas de clientes diferentes", () => {
    const primeiro = validarMapaCliente({ clienteId: "mentorado-1", notas: { saude: 4 } });
    const segundo = validarMapaCliente({ clienteId: "mentorado-2", notas: { saude: 9 } });

    expect(primeiro).toEqual({ ok: true, valor: { clienteId: "mentorado-1", notas: { saude: 4 } } });
    expect(segundo).toEqual({ ok: true, valor: { clienteId: "mentorado-2", notas: { saude: 9 } } });
  });

  it.each([-1, 10.5, 11, Number.NaN])("rejeita nota inválida %s", (nota) => {
    const resultado = validarMapaCliente({ clienteId: "mentorado-1", notas: { saude: nota } });

    expect(resultado.ok).toBe(false);
  });

  it("rejeita dimensão que não pertence ao mapa", () => {
    const resultado = validarMapaCliente({
      clienteId: "mentorado-1",
      notas: { inexistente: 7 } as unknown as Record<string, number>,
    });

    expect(resultado).toEqual({ ok: false, erro: "A dimensão 'inexistente' não pertence ao mapa do cliente." });
  });

  it("rejeita cliente vazio e texto acima do limite", () => {
    expect(validarMapaCliente({ clienteId: " ", notas: {} })).toEqual({
      ok: false,
      erro: "Informe o cliente do mapa.",
    });
    expect(validarMapaCliente({ clienteId: "mentorado-1", dor: "x".repeat(1001), notas: {} })).toEqual({
      ok: false,
      erro: "A dor deve ter no máximo 1000 caracteres.",
    });
  });

  it("declara as onze dimensões que o profissional pode escolher", () => {
    expect(DIMENSOES_VIDA).toEqual([
      "espiritual",
      "familia_parentes",
      "casamento_conjuge",
      "filhos",
      "social",
      "saude",
      "servir",
      "intelectual",
      "financeiro",
      "profissional",
      "emocional",
    ]);
  });
});
