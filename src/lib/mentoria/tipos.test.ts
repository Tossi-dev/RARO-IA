import { describe, expect, it } from "vitest";
import {
  FORMATO_PROGRAMA_PADRAO,
  FORMATO_PROGRAMA_VALORES,
  STATUS_MATRICULA_PADRAO,
  STATUS_MATRICULA_VALORES,
  STATUS_MENTORADO_PADRAO,
  STATUS_MENTORADO_VALORES,
  STATUS_SESSAO_PADRAO,
  STATUS_SESSAO_VALORES,
  STATUS_TURMA_PADRAO,
  STATUS_TURMA_VALORES,
  formatoProgramaDe,
  statusMatriculaDe,
  statusMentoradoDe,
  statusSessaoDe,
  statusTurmaDe,
} from "./tipos";

// Entradas "hostis" comuns a todo normalizador fail-closed: string
// desconhecida, null, undefined, número e objeto — nenhuma delas é um valor
// literal do enum, então todas têm que cair no padrão. `[]` e funções não
// entram aqui de propósito: o objetivo é cobrir os formatos que realmente
// aparecem (linha de banco malformada, JSON de request, cookie), não todo
// tipo do universo.
const ENTRADAS_DESCONHECIDAS: unknown[] = [
  "valor-que-nao-existe",
  "",
  null,
  undefined,
  42,
  { valor: "individual" },
];

describe("FormatoPrograma / formatoProgramaDe", () => {
  it("a lista de valores válidos bate exatamente com o enum formato_programa do 0006", () => {
    expect(FORMATO_PROGRAMA_VALORES).toEqual(["individual", "turma", "online"]);
  });

  it("aceita cada um dos valores válidos", () => {
    for (const valor of FORMATO_PROGRAMA_VALORES) {
      expect(formatoProgramaDe(valor)).toBe(valor);
    }
  });

  it("normaliza caixa e espaços de um valor válido, no mesmo espírito de papelDe", () => {
    expect(formatoProgramaDe("TURMA")).toBe("turma");
    expect(formatoProgramaDe("  online  ")).toBe("online");
  });

  it("fail-closed: entrada desconhecida vira o padrão (individual, o default da coluna no Postgres)", () => {
    for (const entrada of ENTRADAS_DESCONHECIDAS) {
      expect(formatoProgramaDe(entrada)).toBe(FORMATO_PROGRAMA_PADRAO);
    }
  });

  it("o padrão é 'individual'", () => {
    expect(FORMATO_PROGRAMA_PADRAO).toBe("individual");
  });
});

describe("StatusTurma / statusTurmaDe", () => {
  it("a lista de valores válidos bate exatamente com o enum status_turma do 0006", () => {
    expect(STATUS_TURMA_VALORES).toEqual(["planejada", "em_andamento", "encerrada"]);
  });

  it("aceita cada um dos valores válidos", () => {
    for (const valor of STATUS_TURMA_VALORES) {
      expect(statusTurmaDe(valor)).toBe(valor);
    }
  });

  it("fail-closed: entrada desconhecida vira o padrão (planejada, o default da coluna no Postgres)", () => {
    for (const entrada of ENTRADAS_DESCONHECIDAS) {
      expect(statusTurmaDe(entrada)).toBe(STATUS_TURMA_PADRAO);
    }
  });

  it("o padrão é 'planejada'", () => {
    expect(STATUS_TURMA_PADRAO).toBe("planejada");
  });
});

describe("StatusMentorado / statusMentoradoDe", () => {
  it("a lista de valores válidos bate exatamente com o enum status_mentorado do 0006", () => {
    expect(STATUS_MENTORADO_VALORES).toEqual(["lead", "ativo", "pausado", "alumni"]);
  });

  it("aceita cada um dos valores válidos", () => {
    for (const valor of STATUS_MENTORADO_VALORES) {
      expect(statusMentoradoDe(valor)).toBe(valor);
    }
  });

  it("fail-closed: entrada desconhecida vira o padrão (lead, o default da coluna no Postgres)", () => {
    for (const entrada of ENTRADAS_DESCONHECIDAS) {
      expect(statusMentoradoDe(entrada)).toBe(STATUS_MENTORADO_PADRAO);
    }
  });

  it("o padrão é 'lead'", () => {
    expect(STATUS_MENTORADO_PADRAO).toBe("lead");
  });
});

describe("StatusMatricula / statusMatriculaDe", () => {
  it("a lista de valores válidos bate exatamente com o enum status_matricula_mentoria do 0006", () => {
    expect(STATUS_MATRICULA_VALORES).toEqual(["ativa", "concluida", "cancelada", "trancada"]);
  });

  it("aceita cada um dos valores válidos", () => {
    for (const valor of STATUS_MATRICULA_VALORES) {
      expect(statusMatriculaDe(valor)).toBe(valor);
    }
  });

  it("fail-closed: entrada desconhecida vira o padrão (ativa, o default da coluna no Postgres)", () => {
    for (const entrada of ENTRADAS_DESCONHECIDAS) {
      expect(statusMatriculaDe(entrada)).toBe(STATUS_MATRICULA_PADRAO);
    }
  });

  it("o padrão é 'ativa'", () => {
    expect(STATUS_MATRICULA_PADRAO).toBe("ativa");
  });
});

describe("StatusSessao / statusSessaoDe", () => {
  it("a lista de valores válidos bate exatamente com o enum status_sessao_mentoria do 0006", () => {
    expect(STATUS_SESSAO_VALORES).toEqual(["agendada", "realizada", "faltou", "cancelada"]);
  });

  it("aceita cada um dos valores válidos", () => {
    for (const valor of STATUS_SESSAO_VALORES) {
      expect(statusSessaoDe(valor)).toBe(valor);
    }
  });

  it("fail-closed: entrada desconhecida vira o padrão (agendada, o default da coluna no Postgres)", () => {
    for (const entrada of ENTRADAS_DESCONHECIDAS) {
      expect(statusSessaoDe(entrada)).toBe(STATUS_SESSAO_PADRAO);
    }
  });

  it("o padrão é 'agendada'", () => {
    expect(STATUS_SESSAO_PADRAO).toBe("agendada");
  });
});
