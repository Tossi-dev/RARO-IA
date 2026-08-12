// O protocolo inteiro exercitado sem subir servidor.
//
// A base é a de DEMONSTRAÇÃO porque é a única que existe dentro do teste — e
// isso deixa provar de quebra a regra mais importante das ferramentas: a
// linha de origem PRECISA anunciar que os dados são fictícios.

import { beforeAll, describe, expect, it } from "vitest";
import { CATALOGO } from "./ferramentas";
import { classificarMensagem, CODIGO_ERRO, type RespostaJsonRpc } from "./protocolo";
import { despachar } from "./servidor";

beforeAll(() => {
  process.env.RARO_MODO = "demo";
});

async function pedir(metodo: string, params?: Record<string, unknown>): Promise<RespostaJsonRpc> {
  const entrada = classificarMensagem({ jsonrpc: "2.0", id: 1, method: metodo, params });
  const r = await despachar(entrada);
  if (r === null) throw new Error("esperava resposta e veio notificação");
  return r;
}

function resultado(r: RespostaJsonRpc): Record<string, unknown> {
  if ("error" in r) throw new Error(`esperava sucesso, veio erro: ${r.error.message}`);
  return r.result as Record<string, unknown>;
}

function conteudoTexto(r: RespostaJsonRpc): string {
  const res = resultado(r) as { content: Array<{ type: string; text: string }> };
  return res.content.map((c) => c.text).join("\n");
}

describe("initialize", () => {
  it("ecoa a versão pedida quando é uma que o servidor fala", async () => {
    const res = resultado(await pedir("initialize", { protocolVersion: "2024-11-05" }));
    expect(res.protocolVersion).toBe("2024-11-05");
  });

  it("cai na versão preferida quando a pedida é desconhecida, em vez de recusar", async () => {
    const res = resultado(await pedir("initialize", { protocolVersion: "1.0.0" }));
    expect(res.protocolVersion).toBe("2025-06-18");
  });

  it("anuncia a capacidade de ferramentas, o serverInfo e as instruções", async () => {
    const res = resultado(await pedir("initialize", { protocolVersion: "2025-06-18" }));
    expect(res.capabilities).toEqual({ tools: { listChanged: false } });
    expect((res.serverInfo as { name: string }).name).toBe("raro-ia");
    expect(String(res.instructions)).toContain("Origem");
  });
});

describe("enquadramento", () => {
  it("notificação não gera resposta nenhuma", async () => {
    const entrada = classificarMensagem({ jsonrpc: "2.0", method: "notifications/initialized" });
    expect(await despachar(entrada)).toBeNull();
  });

  it("ping responde objeto vazio — é a verificação de vida da especificação", async () => {
    expect(resultado(await pedir("ping"))).toEqual({});
  });

  it("método desconhecido vira -32601", async () => {
    const r = await pedir("resources/list");
    expect("error" in r && r.error.code).toBe(CODIGO_ERRO.metodoInexistente);
  });

  it("envelope inválido vira -32600 sem chegar às ferramentas", async () => {
    const r = await despachar(classificarMensagem({ jsonrpc: "2.0", id: 1 }));
    expect(r && "error" in r && r.error.code).toBe(CODIGO_ERRO.pedidoInvalido);
  });
});

describe("tools/list", () => {
  it("lista exatamente as cinco ferramentas de leitura", async () => {
    const res = resultado(await pedir("tools/list")) as { tools: Array<{ name: string }> };
    expect(res.tools.map((t) => t.name).sort()).toEqual([
      "alertas",
      "buscar_cliente",
      "fila_do_dia",
      "historico_do_cliente",
      "resumo_do_negocio",
    ]);
  });

  it("toda ferramenta tem inputSchema de objeto — o cliente valida por ele", () => {
    for (const f of CATALOGO) {
      expect(f.inputSchema.type).toBe("object");
      expect(f.description.length).toBeGreaterThan(40);
    }
  });

  it("nenhuma ferramenta desta versão escreve", () => {
    const proibido = /criar|gravar|enviar|aprovar|apagar|atualizar/i;
    for (const f of CATALOGO) expect(f.name).not.toMatch(proibido);
  });
});

describe("tools/call", () => {
  it("ferramenta inexistente é erro de protocolo, não resultado com isError", async () => {
    const r = await pedir("tools/call", { name: "apagar_tudo", arguments: {} });
    expect("error" in r && r.error.code).toBe(CODIGO_ERRO.parametroInvalido);
  });

  it("argumento obrigatório faltando vira -32602", async () => {
    const r = await pedir("tools/call", { name: "buscar_cliente", arguments: {} });
    expect("error" in r && r.error.code).toBe(CODIGO_ERRO.parametroInvalido);
  });

  it("período inválido em resumo_do_negocio vira -32602 com a lista do que vale", async () => {
    const r = await pedir("tools/call", {
      name: "resumo_do_negocio",
      arguments: { periodo: "década" },
    });
    expect("error" in r && r.error.message).toContain("trimestre");
  });

  it("cada ferramenta devolve conteúdo de texto e anuncia a origem do número", async () => {
    const chamadas: Array<[string, Record<string, unknown>]> = [
      ["buscar_cliente", { termo: "a" }],
      ["fila_do_dia", { limite: 3 }],
      ["resumo_do_negocio", { periodo: "mes" }],
      ["alertas", { limite: 3 }],
    ];
    for (const [name, args] of chamadas) {
      const r = await pedir("tools/call", { name, arguments: args });
      const texto = conteudoTexto(r);
      expect(texto, name).toContain("Origem:");
      // A base de demonstração precisa se anunciar como fictícia em TODA
      // resposta: é o que impede o dono de decidir em cima de dado inventado.
      expect(texto, name).toContain("DEMONSTRAÇÃO");
      const res = resultado(r) as { structuredContent?: Record<string, unknown> };
      expect(res.structuredContent?.origem, name).toBeTruthy();
    }
  });

  it("historico_do_cliente aceita o id devolvido por buscar_cliente", async () => {
    const busca = resultado(await pedir("tools/call", { name: "buscar_cliente", arguments: { termo: "a" } }));
    const clientes = (busca.structuredContent as { clientes: Array<{ id: string }> }).clientes;
    expect(clientes.length).toBeGreaterThan(0);

    const r = await pedir("tools/call", {
      name: "historico_do_cliente",
      arguments: { cliente_id: clientes[0].id },
    });
    const texto = conteudoTexto(r);
    expect(texto).toContain("Temperatura");
    expect(texto).toContain("Origem:");
  });

  it("cliente inexistente é falha DA FERRAMENTA (isError), não queda da conversa", async () => {
    const r = await pedir("tools/call", {
      name: "historico_do_cliente",
      arguments: { cliente_id: "nao-existe" },
    });
    expect((resultado(r) as { isError: boolean }).isError).toBe(true);
  });

  it("termo ambíguo devolve os candidatos em vez de escolher um por conta própria", async () => {
    const r = await pedir("tools/call", { name: "historico_do_cliente", arguments: { termo: "a" } });
    const res = resultado(r) as { isError: boolean; structuredContent: { ambiguo?: boolean } };
    expect(res.isError).toBe(true);
    expect(res.structuredContent.ambiguo).toBe(true);
  });

  it("limite absurdo é cortado no teto em vez de derrubar a chamada", async () => {
    const r = await pedir("tools/call", { name: "fila_do_dia", arguments: { limite: 9999 } });
    const fila = (resultado(r).structuredContent as { fila: unknown[] }).fila;
    expect(fila.length).toBeLessThanOrEqual(100);
  });
});
