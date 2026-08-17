import { beforeEach, describe, expect, it } from "vitest";
import { JANELA_MS, TETO, _zerar, conferirLimite, ipDaRequisicao } from "./limite";

const T0 = new Date("2026-08-14T09:00:00.000Z");
const mais = (ms: number) => new Date(T0.getTime() + ms);

beforeEach(() => _zerar());

describe("conferirLimite", () => {
  it("deixa passar até o teto e barra a seguinte", () => {
    for (let i = 0; i < TETO; i++) {
      expect(conferirLimite("1.2.3.4", T0).permitido, `tentativa ${i + 1}`).toBe(true);
    }
    expect(conferirLimite("1.2.3.4", T0).permitido).toBe(false);
  });

  it("conta as restantes de forma decrescente", () => {
    expect(conferirLimite("1.2.3.4", T0).restantes).toBe(TETO - 1);
    expect(conferirLimite("1.2.3.4", T0).restantes).toBe(TETO - 2);
  });

  it("libera quando a janela vira", () => {
    for (let i = 0; i < TETO; i++) conferirLimite("1.2.3.4", T0);
    expect(conferirLimite("1.2.3.4", mais(JANELA_MS - 1)).permitido).toBe(false);
    expect(conferirLimite("1.2.3.4", mais(JANELA_MS)).permitido).toBe(true);
  });

  it("um IP estourado não afeta o vizinho", () => {
    for (let i = 0; i < TETO + 5; i++) conferirLimite("1.2.3.4", T0);
    expect(conferirLimite("9.9.9.9", T0).permitido).toBe(true);
  });

  it("diz quando libera, para a resposta poder mandar Retry-After", () => {
    for (let i = 0; i < TETO; i++) conferirLimite("1.2.3.4", T0);
    const v = conferirLimite("1.2.3.4", mais(1000));
    expect(v.liberaEm.getTime()).toBe(T0.getTime() + JANELA_MS);
  });

  it("requisição sem IP cai numa cesta só, e ela também tem teto", () => {
    for (let i = 0; i < TETO; i++) expect(conferirLimite("", T0).permitido).toBe(true);
    expect(conferirLimite("   ", T0).permitido).toBe(false);
  });
});

describe("ipDaRequisicao", () => {
  const req = (h: Record<string, string>) => new Request("https://x/api/diagnostico", { headers: h });

  it("pega o PRIMEIRO endereço do x-forwarded-for — o cliente", () => {
    // O último é o proxy. Usá-lo daria o mesmo IP para todo mundo, e o limite
    // valeria para o mundo inteiro junto.
    expect(ipDaRequisicao(req({ "x-forwarded-for": "203.0.113.9, 70.41.3.18, 150.172.238.178" })))
      .toBe("203.0.113.9");
  });

  it("cai no x-real-ip quando não há forwarded-for", () => {
    expect(ipDaRequisicao(req({ "x-real-ip": "198.51.100.7" }))).toBe("198.51.100.7");
  });

  it("devolve vazio quando não dá para saber — e não inventa", () => {
    expect(ipDaRequisicao(req({}))).toBe("");
  });
});
