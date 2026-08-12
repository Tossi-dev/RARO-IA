// Testes da fila do dia.
//
// A garantia central: quem está ESPERANDO RESPOSTA fura a fila de qualquer
// temperatura, e entre dois que esperam vem primeiro quem espera há mais tempo.
// Deixar cliente falando sozinho é o único erro deste sistema que o cliente
// final percebe.

import { describe, expect, it } from "vitest";
import { montarFilaDoDia } from "./fila";

const AGORA = new Date("2026-03-01T12:00:00.000Z");
const diasAtras = (n: number) => new Date(AGORA.getTime() - n * 24 * 60 * 60 * 1000).toISOString();

describe("montarFilaDoDia", () => {
  it("quem espera resposta vem antes de quem já foi respondido, mesmo estando mais 'quente'", () => {
    const fila = montarFilaDoDia(
      [
        {
          id: "a1",
          nome: "Respondido hoje",
          telefone: "14991234567",
          fatos: [{ quando: diasAtras(0), direcao: "enviada" }],
        },
        {
          id: "a2",
          nome: "Esperando há 3 dias",
          telefone: "14991234568",
          fatos: [{ quando: diasAtras(3), direcao: "recebida" }],
        },
      ],
      AGORA
    );
    expect(fila.map((i) => i.alunoId)).toEqual(["a2", "a1"]);
    expect(fila[0].leitura.esperandoResposta).toBe(true);
  });

  it("entre dois esperando, o que espera há mais tempo vem primeiro", () => {
    const fila = montarFilaDoDia(
      [
        { id: "novo", nome: "Falou ontem", telefone: "1", fatos: [{ quando: diasAtras(1), direcao: "recebida" }] },
        { id: "velho", nome: "Falou há 8 dias", telefone: "2", fatos: [{ quando: diasAtras(8), direcao: "recebida" }] },
      ],
      AGORA
    );
    expect(fila.map((i) => i.alunoId)).toEqual(["velho", "novo"]);
  });

  it("quem não tem nenhum fato observado fica de fora — ausência não é fila", () => {
    const fila = montarFilaDoDia(
      [
        { id: "sem-sinal", nome: "Nunca conversou", telefone: "1", fatos: [] },
        { id: "com-sinal", nome: "Conversou", telefone: "2", fatos: [{ quando: diasAtras(2), direcao: "enviada" }] },
      ],
      AGORA
    );
    expect(fila.map((i) => i.alunoId)).toEqual(["com-sinal"]);
  });

  it("empate desempata pelo nome, para a fila não embaralhar a cada recarga", () => {
    const entrada = [
      { id: "z", nome: "Zeca", telefone: "1", fatos: [{ quando: diasAtras(2), direcao: "enviada" as const }] },
      { id: "a", nome: "Ana", telefone: "2", fatos: [{ quando: diasAtras(2), direcao: "enviada" as const }] },
    ];
    const primeira = montarFilaDoDia(entrada, AGORA).map((i) => i.alunoId);
    const segunda = montarFilaDoDia([...entrada].reverse(), AGORA).map((i) => i.alunoId);
    expect(primeira).toEqual(["a", "z"]);
    expect(segunda).toEqual(primeira);
  });

  it("cada item carrega a leitura inteira, com o porquê já datado", () => {
    const fila = montarFilaDoDia(
      [{ id: "a1", nome: "Cliente", telefone: "1", fatos: [{ quando: diasAtras(1), direcao: "recebida" }] }],
      AGORA
    );
    expect(fila[0].leitura.porque.length).toBeGreaterThan(0);
    expect(fila[0].leitura.sugestao).not.toBe("");
    expect(fila[0].peso).toBeGreaterThan(1000);
  });

  it("lista vazia devolve fila vazia, sem inventar ninguém", () => {
    expect(montarFilaDoDia([], AGORA)).toEqual([]);
  });
});
