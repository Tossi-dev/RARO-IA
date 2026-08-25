import { describe, expect, it } from "vitest";

import { lerResposta, montarPrompt } from "./analise-sessao";

describe("montarPrompt", () => {
  it("inclui somente o mentorado alvo e remove contato e contrato do contexto", () => {
    const prompt = montarPrompt(
      { resumo: "Sessão sobre rotina e tarefas." },
      { nome: "Ana", telefone: "+55 11 99999-0000", email: "ana@exemplo.com", valorContrato: "R$ 2.000,00" },
      [
        { mentoradoNome: "Ana", resumo: "Concluiu a tarefa." },
        { mentoradoNome: "Bia", resumo: "Faltou à sessão." },
      ],
    );

    expect(prompt).toContain("Ana");
    expect(prompt).not.toMatch(/\+55|@|R\$|Bia|faltou/i);
  });

  it("corta o histórico no fim sem partir o nome do mentorado", () => {
    const prompt = montarPrompt(
      { resumo: "Sessão breve." },
      { nome: "Ana Maria" },
      [{ mentoradoNome: "Ana Maria", resumo: "x ".repeat(2_000) }],
      180,
    );

    expect(prompt.length).toBeLessThanOrEqual(180);
    expect(prompt).toContain("Ana Maria");
    expect(prompt).not.toMatch(/Ana Mari$/);
  });
});

describe("lerResposta", () => {
  it("lê as três seções e remove emoji do dado retornado", () => {
    expect(lerResposta("PONTOS FORTES:\n- Consistência ✨\nRISCOS:\n- Faltas\nRECOMENDAÇÕES:\n- Combinar agenda")).toEqual({
      pontosFortes: ["Consistência"],
      riscos: ["Faltas"],
      recomendacoes: ["Combinar agenda"],
    });
  });

  it("recusa texto solto dentro de uma seção e remove seletores ou junções de emoji", () => {
    expect(lerResposta("PONTOS FORTES:\n- Consistência\ncontinuação truncada\nRISCOS:\n- Faltas\nRECOMENDAÇÕES:\n- Combinar agenda")).toBeNull();
    expect(lerResposta("PONTOS FORTES:\n- Cuidado ❤️‍🔥 1️⃣\nRISCOS:\n- Faltas\nRECOMENDAÇÕES:\n- Combinar agenda")?.pontosFortes).toEqual(["Cuidado 1"]);
  });

  it.each(["", "PONTOS FORTES:\n- Algo", "RISCOS:\n- Algo\nRECOMENDAÇÕES:\n- Algo", "PONTOS FORTES:\n- Algo\nRISCOS:\n- Algo\nRECOMENDAÇÕES:"])("falha fechada para resposta inválida ou truncada: %j", (texto) => {
    expect(lerResposta(texto)).toBeNull();
  });
});
