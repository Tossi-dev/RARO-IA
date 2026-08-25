import { describe, expect, it } from "vitest";
import { alertasDe } from "./alertas-risco";

const mentorado = { id: "m-1", nome: "Ana" };

describe("alertasDe", () => {
  it("só alerta queda de score entre semanas consecutivas", () => {
    const alerta = alertasDe(mentorado, [], [], [{ semana: "2026-08-03", score: 90 }, { semana: "2026-08-10", score: 70 }], "2026-08-15");
    expect(alerta.find((item) => item.tipo === "queda_score")?.fato).toContain("90");
    expect(alertasDe(mentorado, [], [], [{ semana: "2026-08-03", score: 90 }, { semana: "2026-08-17", score: 70 }], "2026-08-20").map((item) => item.tipo)).not.toContain("queda_score");
  });

  it("não alerta faltas sem sessões e identifica duas faltas seguidas", () => {
    expect(alertasDe(mentorado, [], [], [], "2026-08-15").map((item) => item.tipo)).not.toContain("faltas");
    expect(alertasDe(mentorado, [{ data: "2026-08-01", status: "faltou" }, { data: "2026-08-08", status: "faltou" }], [], [], "2026-08-15").map((item) => item.tipo)).toContain("faltas");
  });

  it("traz fatos de silêncio e tarefa vencida uma única vez, sem emoji", () => {
    const alertas = alertasDe(mentorado, [{ data: "2026-07-01", status: "presente" }], [{ id: "t-1", vencimento: "2026-08-01", concluida: false }, { id: "t-1", vencimento: "2026-08-01", concluida: false }], [], "2026-08-15");
    expect(alertas.filter((item) => item.tipo === "silencio")).toHaveLength(1);
    expect(alertas.filter((item) => item.tipo === "tarefas_atrasadas")).toHaveLength(1);
    expect(alertas.map((item) => item.texto).join(" ")).not.toMatch(/\p{Extended_Pictographic}|\p{Regional_Indicator}|\p{Emoji_Modifier}/u);
  });

  it("falha fechada para data inválida e não repete alerta resolvido", () => {
    expect(alertasDe(mentorado, [], [], [], "data-inválida")).toEqual([]);
    expect(alertasDe(mentorado, [{ data: "2026-08-01", status: "faltou" }, { data: "2026-08-08", status: "faltou" }], [], [], "2026-08-15", [{ tipo: "faltas", fato: "faltas:2026-08-01:2026-08-08", resolvido: true }])).toEqual([]);
  });

  it("não recria alerta aberto e não deixa emoji de ID atravessar o texto", () => {
    expect(alertasDe(mentorado, [{ data: "2026-08-01", status: "faltou" }, { data: "2026-08-08", status: "faltou" }], [], [], "2026-08-15", [{ tipo: "faltas", fato: "faltas:2026-08-01:2026-08-08", resolvido: false }])).toEqual([]);
    const alerta = alertasDe(mentorado, [], [{ id: "tarefa ✨", vencimento: "2026-08-01", concluida: false }], [], "2026-08-15")[0];
    expect(`${alerta.fato} ${alerta.texto}`).not.toMatch(/\p{Extended_Pictographic}|\p{Regional_Indicator}|\p{Emoji_Modifier}/u);
  });
});
