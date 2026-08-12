import { describe, expect, it } from "vitest";
import {
  classificarMensagem,
  eventoSse,
  respostaErro,
  respostaOk,
  VERSAO_PREFERIDA,
  versaoSuportada,
} from "./protocolo";

describe("classificarMensagem", () => {
  it("reconhece um pedido com id", () => {
    const m = classificarMensagem({ jsonrpc: "2.0", id: 1, method: "tools/list" });
    expect(m.tipo).toBe("pedido");
    if (m.tipo === "pedido") {
      expect(m.pedido.id).toBe(1);
      expect(m.pedido.metodo).toBe("tools/list");
      expect(m.pedido.params).toEqual({});
    }
  });

  it("trata mensagem SEM id como notificação — notificação não tem resposta", () => {
    const m = classificarMensagem({ jsonrpc: "2.0", method: "notifications/initialized" });
    expect(m.tipo).toBe("notificacao");
  });

  it("trata id null como notificação, porque a especificação proíbe id null em pedido", () => {
    const m = classificarMensagem({ jsonrpc: "2.0", id: null, method: "ping" });
    expect(m.tipo).toBe("notificacao");
  });

  it("recusa envelope sem jsonrpc 2.0", () => {
    const m = classificarMensagem({ jsonrpc: "1.0", id: 7, method: "ping" });
    expect(m.tipo).toBe("invalido");
  });

  it("preserva o id na recusa, para o cliente casar o erro com a chamada dele", () => {
    const m = classificarMensagem({ jsonrpc: "2.0", id: "abc", method: 42 });
    expect(m.tipo).toBe("invalido");
    if (m.tipo === "invalido") expect(m.id).toBe("abc");
  });

  it("recusa corpo que não é objeto", () => {
    expect(classificarMensagem("oi").tipo).toBe("invalido");
    expect(classificarMensagem(null).tipo).toBe("invalido");
    expect(classificarMensagem([{ jsonrpc: "2.0", id: 1, method: "ping" }]).tipo).toBe("invalido");
  });

  it("ignora params que não é objeto em vez de derrubar o pedido", () => {
    const m = classificarMensagem({ jsonrpc: "2.0", id: 1, method: "ping", params: "nada" });
    expect(m.tipo).toBe("pedido");
    if (m.tipo === "pedido") expect(m.pedido.params).toEqual({});
  });
});

describe("negociação de versão", () => {
  it("aceita as versões anunciadas e recusa o resto", () => {
    expect(versaoSuportada("2025-06-18")).toBe(true);
    expect(versaoSuportada("2024-11-05")).toBe(true);
    expect(versaoSuportada("1.0.0")).toBe(false);
    expect(versaoSuportada(undefined)).toBe(false);
    expect(VERSAO_PREFERIDA).toBe("2025-06-18");
  });
});

describe("envelopes de saída", () => {
  it("resposta de sucesso tem jsonrpc, id e result", () => {
    expect(respostaOk(3, { ok: true })).toEqual({ jsonrpc: "2.0", id: 3, result: { ok: true } });
  });

  it("resposta de erro omite data quando não há nada estruturado a dizer", () => {
    const r = respostaErro(3, -32601, "sem método");
    expect(r).toEqual({ jsonrpc: "2.0", id: 3, error: { code: -32601, message: "sem método" } });
    expect("data" in r.error).toBe(false);
  });

  it("evento SSE termina em linha em branco — sem isso o cliente trava esperando mais", () => {
    const e = eventoSse({ a: 1 });
    expect(e.startsWith("data: ")).toBe(true);
    expect(e.endsWith("\n\n")).toBe(true);
    expect(JSON.parse(e.slice("data: ".length))).toEqual({ a: 1 });
  });
});
