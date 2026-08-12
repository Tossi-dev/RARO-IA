// O que estes testes protegem: a bateria do notebook e a paciência do servidor.
//
// Backoff sem teto é agente que dorme por horas e acorda depois que o dono já
// desistiu. Backoff sem crescimento é 480 requisições numa tarde de wi-fi ruim.
// Os dois erros são invisíveis em produção até virarem conta na Vercel.

import { describe, expect, it } from "vitest";
import { atrasoDoBackoff, BACKOFF_BASE_MS, BACKOFF_TETO_MS, Recuo } from "../src/backoff.js";

/** Sorteio fixo em 0 para o cálculo ficar previsível: com tremor zero o
 *  resultado é o valor cru, e é o valor cru que o teste quer cobrar. */
const semTremor = { sorteio: () => 0 };

describe("atrasoDoBackoff", () => {
  it("dobra a cada falha consecutiva", () => {
    expect(atrasoDoBackoff(1, semTremor)).toBe(BACKOFF_BASE_MS);
    expect(atrasoDoBackoff(2, semTremor)).toBe(BACKOFF_BASE_MS * 2);
    expect(atrasoDoBackoff(3, semTremor)).toBe(BACKOFF_BASE_MS * 4);
    expect(atrasoDoBackoff(4, semTremor)).toBe(BACKOFF_BASE_MS * 8);
  });

  it("para de crescer no teto, para a rede voltar e o agente acordar junto", () => {
    expect(atrasoDoBackoff(10, semTremor)).toBe(BACKOFF_TETO_MS);
    expect(atrasoDoBackoff(500, semTremor)).toBe(BACKOFF_TETO_MS);
    // 2^1000 é Infinity: sem o corte de expoente isto viraria NaN, que como
    // atraso significa "tenta de novo imediatamente, para sempre".
    expect(Number.isFinite(atrasoDoBackoff(1000, semTremor))).toBe(true);
  });

  it("o tremor só encurta, nunca passa do teto", () => {
    const cheio = atrasoDoBackoff(99, { sorteio: () => 1 });
    expect(cheio).toBe(Math.round(BACKOFF_TETO_MS * 0.8));
    expect(atrasoDoBackoff(99, { sorteio: () => 0.5 })).toBeLessThanOrEqual(BACKOFF_TETO_MS);
  });

  it("trata tentativa inválida como a primeira", () => {
    expect(atrasoDoBackoff(0, semTremor)).toBe(BACKOFF_BASE_MS);
    expect(atrasoDoBackoff(-7, semTremor)).toBe(BACKOFF_BASE_MS);
    expect(atrasoDoBackoff("banana", semTremor)).toBe(BACKOFF_BASE_MS);
  });
});

describe("Recuo", () => {
  it("cresce enquanto falha e volta ao início quando dá certo", () => {
    const r = new Recuo(semTremor);
    expect(r.emFalha).toBe(false);

    expect(r.falhou()).toBe(BACKOFF_BASE_MS);
    expect(r.falhou()).toBe(BACKOFF_BASE_MS * 2);
    expect(r.emFalha).toBe(true);

    r.zerar();
    expect(r.emFalha).toBe(false);
    expect(r.falhou()).toBe(BACKOFF_BASE_MS);
  });
});
