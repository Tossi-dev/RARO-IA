import { describe, expect, it } from "vitest";
import { lerResposta, montarPrompt } from "./analise-call";

describe("montarPrompt de análise de call", () => {
  it("leva somente a transcrição da oportunidade atual, sem valor de proposta", () => {
    const prompt = montarPrompt(
      { transcricao: "Cliente quer entender o programa e combinar próximos passos." },
      { titulo: "Oportunidade atual", valorProposta: "R$ 12.000,00", telefone: "+55 11 99999-0000" },
    );

    expect(prompt).toContain("Cliente quer entender o programa");
    expect(prompt).not.toMatch(/R\$|12\.000|\+55|99999/);
  });
});

describe("lerResposta de análise de call", () => {
  it.each(["120", "-5", "ótimo", ""])('não inventa score para valor ilegível ou fora da faixa: %j', (score) => {
    const scoreLinha = score ? `SCORE: ${score}\n` : "";
    expect(lerResposta(`${scoreLinha}OBJEÇÕES:\n- Prazo\nSUGESTÕES:\n- Enviar proposta`)).toMatchObject({ score: null });
  });

  it("trata objeções vazias como informação parcial e remove emoji", () => {
    expect(lerResposta("SCORE: 78\nOBJEÇÕES:\nSUGESTÕES:\n- Retomar amanhã ✨")).toEqual({
      score: 78,
      objecoes: [],
      sugestoes: ["Retomar amanhã"],
      parcial: true,
    });
  });

  it("falha fechada para resposta vazia", () => {
    expect(lerResposta("")).toBeNull();
  });
});
