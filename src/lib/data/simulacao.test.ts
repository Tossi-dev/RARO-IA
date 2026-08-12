// A simulação é a única porta pela qual dado fictício volta a entrar no painel.
// Esta porta já foi arrombada uma vez neste projeto — o dono leu faturamento
// inventado e acreditou. Então ela tem testes travando as três coisas que, se
// afrouxarem, repetem o estrago:
//
//   1. desligada é o padrão (cookie ausente ou com qualquer outro valor);
//   2. só o cookie liga — nenhuma variável de ambiente tem esse poder;
//   3. o erro de bailout do Next é RELANÇADO, senão a página seria cacheada
//      estaticamente com a simulação desligada e o botão pareceria quebrado.

import { afterEach, describe, expect, it, vi } from "vitest";

const mockCookies = vi.fn();
vi.mock("next/headers", () => ({ cookies: () => mockCookies() }));

// import depois do mock, senão o módulo pega o next/headers real
const { simulacaoLigada, COOKIE_SIMULACAO, SIMULACAO_MAX_AGE } = await import("./simulacao");

/** Simula o jar de cookies do Next com um valor (ou nenhum). */
function comCookie(valor: string | undefined) {
  mockCookies.mockReturnValue({
    get: (nome: string) => (nome === COOKIE_SIMULACAO && valor !== undefined ? { value: valor } : undefined),
  });
}

afterEach(() => {
  mockCookies.mockReset();
});

describe("simulacaoLigada", () => {
  it("desligada quando o cookie não existe", () => {
    comCookie(undefined);
    expect(simulacaoLigada()).toBe(false);
  });

  it("ligada só com o valor exato '1'", () => {
    comCookie("1");
    expect(simulacaoLigada()).toBe(true);
  });

  it("qualquer outro valor conta como desligada", () => {
    for (const v of ["0", "", "true", "sim", "on", "ligada"]) {
      comCookie(v);
      expect(simulacaoLigada(), `valor ${JSON.stringify(v)} não podia ligar`).toBe(false);
    }
  });

  it("nenhuma variável de ambiente liga a simulação", () => {
    const salvo = { ...process.env };
    process.env.RARO_MODO = "demo";
    process.env.RARO_SIMULACAO = "1";
    comCookie(undefined);
    try {
      expect(simulacaoLigada()).toBe(false);
    } finally {
      process.env = salvo;
    }
  });

  it("fora de uma requisição responde desligada em vez de derrubar", () => {
    mockCookies.mockImplementation(() => {
      throw new Error("cookies() fora de contexto de requisição");
    });
    expect(simulacaoLigada()).toBe(false);
  });

  it("relança o bailout dinâmico do Next em vez de engolir", () => {
    // Se este erro fosse engolido, o Next cacharia a página como estática com
    // a simulação desligada — e o clique no botão não mudaria nada.
    const bailout = Object.assign(new Error("Dynamic server usage"), {
      digest: "DYNAMIC_SERVER_USAGE:cookies",
    });
    mockCookies.mockImplementation(() => {
      throw bailout;
    });
    expect(() => simulacaoLigada()).toThrow(bailout);
  });
});

describe("cookie da simulação", () => {
  it("não é permanente — dura uma demonstração, não um regime", () => {
    expect(SIMULACAO_MAX_AGE).toBeLessThanOrEqual(60 * 60 * 24);
    expect(SIMULACAO_MAX_AGE).toBeGreaterThan(60 * 60);
  });
});
