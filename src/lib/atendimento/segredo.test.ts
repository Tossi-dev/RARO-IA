// Testes da porta dos endpoints do agente local.
//
// O caso que mais importa é o primeiro: SEM segredo configurado, nada passa.
// Uma porta que abre por falta de configuração é a forma mais comum de expor
// dado real — o servidor sobe sem a variável, ninguém percebe, e a conversa
// inteira dos clientes fica pública.

import { describe, expect, it } from "vitest";
import { integracaoAtivada, segredoConfere, TAMANHO_MINIMO_SEGREDO } from "./segredo";

const SEGREDO = "segredo-de-teste-longo";

describe("segredoConfere", () => {
  it("sem segredo configurado, NADA passa — nem string vazia, nem undefined", () => {
    expect(segredoConfere("qualquer-coisa", undefined)).toBe(false);
    expect(segredoConfere("", undefined)).toBe(false);
    expect(segredoConfere(undefined, undefined)).toBe(false);
    // Nem mandar exatamente o que está configurado, quando o configurado é vazio.
    expect(segredoConfere("", "")).toBe(false);
  });

  it("segredo curto demais conta como não configurado", () => {
    const curto = "a".repeat(TAMANHO_MINIMO_SEGREDO - 1);
    expect(integracaoAtivada(curto)).toBe(false);
    expect(segredoConfere(curto, curto)).toBe(false);
  });

  it("o segredo certo passa; qualquer variação não", () => {
    expect(segredoConfere(SEGREDO, SEGREDO)).toBe(true);
    expect(segredoConfere(`${SEGREDO} `, SEGREDO)).toBe(false);
    expect(segredoConfere(SEGREDO.toUpperCase(), SEGREDO)).toBe(false);
    expect(segredoConfere(SEGREDO.slice(0, -1), SEGREDO)).toBe(false);
    expect(segredoConfere(`${SEGREDO}x`, SEGREDO)).toBe(false);
  });

  it("prefixo correto não vale nada — o laço percorre tudo", () => {
    expect(segredoConfere(SEGREDO.slice(0, 3), SEGREDO)).toBe(false);
  });

  it("header ausente é recusa, não erro", () => {
    expect(segredoConfere(null, SEGREDO)).toBe(false);
  });
});
