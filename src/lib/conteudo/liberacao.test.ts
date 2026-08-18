// Testes de `aulasLiberadas` — a liberação gradual de uma trilha.
//
// O QUE ESTA SUÍTE PROVA
// ----------------------
// 1) SEM DATA DE INÍCIO, NADA LIBERA. Liberar por omissão entregaria a trilha
//    inteira a quem acabou de entrar — e o erro seria invisível, porque uma
//    trilha aberta demais não dá erro nenhum;
// 2) a conta é feita em DIAS CIVIS DE SÃO PAULO, não em janelas de 24 horas
//    sobre o instante do início: um começo às 23:00 não pode adiantar a
//    liberação em um dia;
// 3) a FRONTEIRA é testada nos dois lados — um milissegundo antes da
//    meia-noite de São Paulo ainda está fechada, na meia-noite já abriu;
// 4) o módulo é PURO: `agoraIso` entra por parâmetro, e a mesma entrada
//    produz a mesma saída em qualquer fuso de máquina.

import { describe, expect, it } from "vitest";
import { MOTIVO_SEM_AGORA, MOTIVO_SEM_INICIO, aulasLiberadas, type AulaParaLiberacao } from "./liberacao";

function aula(id: string, liberaEmDias: number): AulaParaLiberacao {
  return { id, liberaEmDias };
}

/** Um instante ISO a partir de uma hora de parede de São Paulo. */
function spIso(data: string, hora = "00:00:00.000"): string {
  // -03:00 é o deslocamento de São Paulo em qualquer data desde 2019 (o
  // horário de verão acabou); as datas desta suíte são todas posteriores.
  return new Date(`${data}T${hora}-03:00`).toISOString();
}

describe("aulasLiberadas — sem data de início nada abre", () => {
  it.each([[""], ["   "], ["ontem"], ["2026-13-45"], ["2026-02-31"]])(
    "início %j: zero aulas liberadas, e cada uma diz o motivo",
    (inicio) => {
      const r = aulasLiberadas([aula("a", 0), aula("b", 7)], inicio, spIso("2026-09-01"));

      expect(r).toHaveLength(2);
      for (const item of r) {
        expect(item.liberada).toBe(false);
        expect(item.motivo).toBe("sem data de início");
        // Sem base para calcular, não se inventa data nem contagem.
        expect(item.abreEm).toBeNull();
        expect(item.abreNoDia).toBeNull();
        expect(item.diasQueFaltam).toBeNull();
      }
    },
  );

  it("lista vazia devolve lista vazia, mesmo sem início", () => {
    expect(aulasLiberadas([], "", spIso("2026-09-01"))).toEqual([]);
    expect(aulasLiberadas([], "2026-08-01", spIso("2026-09-01"))).toEqual([]);
  });

  // `agora` torto é outro problema, e precisa de outro nome: com ele a data
  // de início pode estar perfeita, e dizer "sem data de início" mandaria quem
  // for investigar olhar para o campo errado.
  it.each([["amanhã"], [""], ["2026-02-31T10:00:00Z"]])(
    "agora %j não libera nada, e diz que o problema é a hora de referência",
    (agora) => {
      const r = aulasLiberadas([aula("a", 0)], "2026-08-01", agora);

      expect(r[0].liberada).toBe(false);
      expect(r[0].motivo).toBe(MOTIVO_SEM_AGORA);
      expect(r[0].motivo).not.toBe(MOTIVO_SEM_INICIO);
      expect(r[0].diasQueFaltam).toBeNull();
      expect(r[0].abreEm).toBeNull();
    },
  );
});

describe("aulasLiberadas — a conta", () => {
  it("libera_em_dias 0 abre no primeiro instante do dia de início", () => {
    const r = aulasLiberadas([aula("a", 0)], "2026-08-01", spIso("2026-08-01", "00:00:00.000"));
    expect(r[0].liberada).toBe(true);
    expect(r[0].diasQueFaltam).toBe(0);
    expect(r[0].motivo).toBe("");
  });

  it("libera_em_dias 3 abre três dias depois, e não antes", () => {
    const aulas = [aula("a", 3)];
    expect(aulasLiberadas(aulas, "2026-08-01", spIso("2026-08-03", "23:59:59.999"))[0].liberada).toBe(false);
    expect(aulasLiberadas(aulas, "2026-08-01", spIso("2026-08-04", "00:00:00.000"))[0].liberada).toBe(true);
  });

  it("diz em que dia abre, e quantos dias faltam", () => {
    const r = aulasLiberadas([aula("a", 7)], "2026-08-01", spIso("2026-08-03", "10:00:00.000"));
    expect(r[0].abreNoDia).toBe("2026-08-08");
    expect(r[0].diasQueFaltam).toBe(5);
    expect(r[0].motivo).toContain("08/08/2026");
  });

  // A FRONTEIRA, nos dois lados. É aqui que uma implementação que soma
  // 24 horas ao instante do início erra por horas.
  it("um milissegundo antes da meia-noite de São Paulo ainda está fechada", () => {
    const aulas = [aula("a", 1)];
    const antes = new Date(new Date(spIso("2026-08-02", "00:00:00.000")).getTime() - 1).toISOString();
    expect(aulasLiberadas(aulas, "2026-08-01", antes)[0].liberada).toBe(false);
    expect(aulasLiberadas(aulas, "2026-08-01", spIso("2026-08-02", "00:00:00.000"))[0].liberada).toBe(true);
  });

  it("agora ANTES do início não libera e não devolve dias negativos", () => {
    const r = aulasLiberadas([aula("a", 0), aula("b", 5)], "2026-08-10", spIso("2026-08-01"));
    for (const item of r) {
      expect(item.liberada).toBe(false);
      expect(item.diasQueFaltam).toBeGreaterThanOrEqual(0);
    }
    expect(r[0].diasQueFaltam).toBe(9);
    expect(r[1].diasQueFaltam).toBe(14);
  });

  // Aula aberta há muito tempo: `diasQueFaltam` é 0, nunca um número
  // negativo. "Faltam -12 dias" é o tipo de coisa que chega à tela.
  it("aula liberada há tempos não devolve dias negativos", () => {
    const r = aulasLiberadas([aula("a", 0), aula("b", 1)], "2026-08-01", spIso("2026-12-25"));

    for (const item of r) {
      expect(item.liberada).toBe(true);
      expect(item.diasQueFaltam).toBe(0);
    }
  });

  it("preserva a ordem e a identidade das aulas recebidas", () => {
    const r = aulasLiberadas([aula("c", 0), aula("a", 30), aula("b", 1)], "2026-08-01", spIso("2026-08-02"));
    expect(r.map((x) => x.id)).toEqual(["c", "a", "b"]);
    expect(r.map((x) => x.liberada)).toEqual([true, false, true]);
  });
});

describe("aulasLiberadas — fuso e formas de data", () => {
  // O caso que o plano nomeia: um início às 23:00 não pode adiantar a
  // liberação em um dia. A conta é sobre o DIA CIVIL de São Paulo em que a
  // trilha começou, não sobre o instante exato.
  it("início às 23:00 de São Paulo conta como o mesmo dia civil", () => {
    const cedo = aulasLiberadas([aula("a", 1)], spIso("2026-08-01", "08:00:00.000"), spIso("2026-08-02"));
    const tarde = aulasLiberadas([aula("a", 1)], spIso("2026-08-01", "23:00:00.000"), spIso("2026-08-02"));

    expect(tarde[0].abreNoDia).toBe(cedo[0].abreNoDia);
    expect(tarde[0].abreNoDia).toBe("2026-08-02");
    expect(tarde[0].liberada).toBe(true);
  });

  // 23:00 em São Paulo é 02:00 do dia SEGUINTE em UTC. Uma implementação que
  // lesse a data em UTC começaria a trilha um dia adiante.
  it("não usa o dia UTC: 23:00 de SP é 02:00 do dia seguinte em UTC", () => {
    const inicio = spIso("2026-08-01", "23:00:00.000");
    expect(inicio).toContain("2026-08-02T02:00");

    const r = aulasLiberadas([aula("a", 0)], inicio, spIso("2026-08-01", "23:30:00.000"));
    // Meia hora depois de começar, uma aula de dia 0 já está aberta. Pelo dia
    // UTC, ela só abriria no dia seguinte.
    expect(r[0].liberada).toBe(true);
  });

  it("aceita data pura (o formato de `trilha_matricula.inicio`) e datetime", () => {
    const pura = aulasLiberadas([aula("a", 2)], "2026-08-01", spIso("2026-08-03"));
    const comHora = aulasLiberadas([aula("a", 2)], spIso("2026-08-01", "09:00:00.000"), spIso("2026-08-03"));

    expect(pura[0].abreNoDia).toBe("2026-08-03");
    expect(comHora[0].abreNoDia).toBe("2026-08-03");
    expect(pura[0].liberada).toBe(true);
    expect(comHora[0].liberada).toBe(true);
  });

  it("libera_em_dias negativo ou não finito é tratado como 0, nunca abre antes do início", () => {
    const r = aulasLiberadas(
      [aula("a", -5), aula("b", Number.NaN), aula("c", Number.POSITIVE_INFINITY)],
      "2026-08-10",
      spIso("2026-08-09", "23:59:59.999"),
    );
    // Véspera do início: nenhuma delas pode estar aberta.
    for (const item of r) expect(item.liberada).toBe(false);

    const noDia = aulasLiberadas(
      [aula("a", -5), aula("b", Number.NaN), aula("c", Number.POSITIVE_INFINITY)],
      "2026-08-10",
      spIso("2026-08-10", "00:00:00.000"),
    );
    for (const item of noDia) expect(item.liberada).toBe(true);
  });
});
