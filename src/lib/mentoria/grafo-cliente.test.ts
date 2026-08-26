import { describe, expect, it } from "vitest";
import { montarGrafoCliente, relacoesDe } from "./grafo-cliente";

const nos = [
  { id: "dimensao-saude", clienteId: "mentorado-1", tipo: "dimensao" as const },
  { id: "meta-1", clienteId: "mentorado-1", tipo: "meta" as const },
  { id: "passo-1", clienteId: "mentorado-1", tipo: "passo" as const },
];

describe("montarGrafoCliente", () => {
  it("conecta apenas fatos declarados e mantém a ordem das relações", () => {
    const resultado = montarGrafoCliente({
      clienteId: "mentorado-1",
      nos,
      arestas: [
        { origemId: "dimensao-saude", destinoId: "meta-1", tipo: "informou" },
        { origemId: "meta-1", destinoId: "passo-1", tipo: "desdobra" },
      ],
    });

    expect(resultado.ok).toBe(true);
    if (resultado.ok) {
      expect(relacoesDe(resultado.valor, "dimensao-saude").map((aresta) => aresta.destinoId)).toEqual(["meta-1"]);
      expect(relacoesDe(resultado.valor, "meta-1").map((aresta) => aresta.destinoId)).toEqual(["passo-1"]);
    }
  });

  it.each([
    { nos: [...nos, { id: "meta-2", clienteId: "mentorado-2", tipo: "meta" as const }], arestas: [] },
    { nos: [...nos, { id: "meta-1", clienteId: "mentorado-1", tipo: "meta" as const }], arestas: [] },
    { nos, arestas: [{ origemId: "meta-1", destinoId: "meta-1", tipo: "informa" }] },
    { nos, arestas: [{ origemId: "meta-1", destinoId: "ausente", tipo: "informa" }] },
  ])("rejeita cliente, nó ou relação inválidos", ({ nos: nosEntrada, arestas }) => {
    expect(montarGrafoCliente({ clienteId: "mentorado-1", nos: nosEntrada, arestas }).ok).toBe(false);
  });

  it("rejeita referência de transcrição sem autorização", () => {
    expect(
      montarGrafoCliente({
        clienteId: "mentorado-1",
        nos: [...nos, { id: "transcricao-1", clienteId: "mentorado-1", tipo: "transcricao_referencia" }],
        arestas: [{ origemId: "meta-1", destinoId: "transcricao-1", tipo: "contextualiza" }],
      })
    ).toEqual({ ok: false, erro: "A referência de transcrição exige autorização explícita." });
  });

  it("rejeita tipo de nó desconhecido em tempo de execução", () => {
    expect(
      montarGrafoCliente({
        clienteId: "mentorado-1",
        nos: [...nos, { id: "novo", clienteId: "mentorado-1", tipo: "transcricao_referencia_falsa" as never }],
        arestas: [],
      })
    ).toEqual({ ok: false, erro: "O tipo de nó não pertence ao grafo do cliente." });
  });

  it("aceita referência de transcrição somente com autorização explícita", () => {
    expect(
      montarGrafoCliente({
        clienteId: "mentorado-1",
        nos: [
          ...nos,
          { id: "transcricao-1", clienteId: "mentorado-1", tipo: "transcricao_referencia", transcricaoAutorizada: true },
        ],
        arestas: [{ origemId: "meta-1", destinoId: "transcricao-1", tipo: "contextualiza" }],
      }).ok
    ).toBe(true);
  });

  it("copia nós e relações para impedir mutação posterior da entrada", () => {
    const entrada = {
      clienteId: "mentorado-1",
      nos: [...nos],
      arestas: [{ origemId: "meta-1", destinoId: "passo-1", tipo: "desdobra" }],
    };
    const resultado = montarGrafoCliente(entrada);
    entrada.nos[0].clienteId = "mentorado-2";
    entrada.arestas[0].destinoId = "dimensao-saude";

    expect(resultado).toEqual({
      ok: true,
      valor: {
        clienteId: "mentorado-1",
        nos: [
          { id: "dimensao-saude", clienteId: "mentorado-1", tipo: "dimensao" },
          { id: "meta-1", clienteId: "mentorado-1", tipo: "meta" },
          { id: "passo-1", clienteId: "mentorado-1", tipo: "passo" },
        ],
        arestas: [{ origemId: "meta-1", destinoId: "passo-1", tipo: "desdobra" }],
      },
    });
  });
});
