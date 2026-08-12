// Testes das funções puras da plataforma de curso (aceite do checker) — vitest
import { describe, expect, it } from "vitest";
import {
  alunosEmRisco,
  conteudoDoCurso,
  diasEntre,
  DIAS_SEM_CONCLUSAO_TRAVADO,
  funilPorModulo,
  mapaProgresso,
  presencaEncontros,
  progressoDaTurma,
  saudeTurma,
  type AlunoRosterItem,
} from "./metrics-curso";
import type { Aula, Encontro, Modulo, ProgressoAula } from "./types";

const HOJE = "2026-08-06";

function modulo(over: Partial<Modulo>): Modulo {
  return { id: "mo-1", produtoId: "pr-1", nome: "Módulo 1", ordem: 1, descricao: "", ...over };
}

function aula(over: Partial<Aula>): Aula {
  return {
    id: "au-1",
    moduloId: "mo-1",
    produtoId: "pr-1",
    titulo: "Aula 1",
    ordem: 1,
    duracaoMin: 10,
    tipo: "video",
    ...over,
  };
}

function prog(over: Partial<ProgressoAula>): ProgressoAula {
  return {
    id: "pa-1",
    alunoId: "al-1",
    aulaId: "au-1",
    produtoId: "pr-1",
    concluida: false,
    concluidaEm: null,
    minutosAssistidos: 0,
    ...over,
  };
}

// trilha padrão: 2 módulos, 2 aulas cada
const MODULOS: Modulo[] = [
  modulo({ id: "mo-1", nome: "Fundamentos", ordem: 1 }),
  modulo({ id: "mo-2", nome: "Avançado", ordem: 2 }),
];
const AULAS: Aula[] = [
  aula({ id: "au-1", moduloId: "mo-1", ordem: 1, titulo: "Aula 1" }),
  aula({ id: "au-2", moduloId: "mo-1", ordem: 2, titulo: "Aula 2" }),
  aula({ id: "au-3", moduloId: "mo-2", ordem: 1, titulo: "Aula 3" }),
  aula({ id: "au-4", moduloId: "mo-2", ordem: 2, titulo: "Aula 4" }),
];
const ROSTER: AlunoRosterItem[] = [
  { alunoId: "al-1", alunoNome: "Aluna Um" },
  { alunoId: "al-2", alunoNome: "Aluno Dois" },
  { alunoId: "al-3", alunoNome: "Aluna Três" },
];

describe("diasEntre", () => {
  it("conta dias corridos entre duas datas ISO", () => {
    expect(diasEntre("2026-08-01", "2026-08-06")).toBe(5);
    expect(diasEntre("2026-08-06", "2026-08-06")).toBe(0);
  });
});

describe("progressoDaTurma", () => {
  it("aluno sem nenhum registro de progresso = nao_comecou, 0%", () => {
    const out = progressoDaTurma(
      [{ alunoId: "al-1", alunoNome: "Aluna Um" }],
      MODULOS,
      AULAS,
      [],
      HOJE
    );
    expect(out).toHaveLength(1);
    expect(out[0].status).toBe("nao_comecou");
    expect(out[0].pct).toBe(0);
    expect(out[0].ultimaConclusao).toBeNull();
    expect(out[0].diasSemConcluir).toBeNull();
  });

  it("aluno que concluiu todas as aulas = concluido, 100%", () => {
    const progresso = AULAS.map((a) =>
      prog({ id: `pa-${a.id}`, alunoId: "al-1", aulaId: a.id, concluida: true, concluidaEm: "2026-07-01T10:00:00" })
    );
    const out = progressoDaTurma([{ alunoId: "al-1", alunoNome: "X" }], MODULOS, AULAS, progresso, HOJE);
    expect(out[0].status).toBe("concluido");
    expect(out[0].pct).toBe(100);
  });

  it("aluno com conclusão recente (dentro do limite) = em_andamento", () => {
    const progresso = [
      prog({ alunoId: "al-1", aulaId: "au-1", concluida: true, concluidaEm: "2026-08-01T10:00:00" }),
    ];
    const out = progressoDaTurma([{ alunoId: "al-1", alunoNome: "X" }], MODULOS, AULAS, progresso, HOJE);
    expect(out[0].status).toBe("em_andamento");
    expect(out[0].diasSemConcluir).toBe(diasEntre("2026-08-01", HOJE));
    expect(out[0].diasSemConcluir!).toBeLessThan(DIAS_SEM_CONCLUSAO_TRAVADO);
    expect(out[0].moduloAtualNome).toBe("Fundamentos");
  });

  it("aluno sem concluir aula há >= limite de dias = travado", () => {
    const progresso = [
      prog({ alunoId: "al-1", aulaId: "au-1", concluida: true, concluidaEm: "2026-06-01T10:00:00" }),
    ];
    const out = progressoDaTurma([{ alunoId: "al-1", alunoNome: "X" }], MODULOS, AULAS, progresso, HOJE);
    expect(out[0].status).toBe("travado");
  });

  it("aluno que abriu mas nunca concluiu nada (só linha parcial) = travado", () => {
    const progresso = [prog({ alunoId: "al-1", aulaId: "au-1", concluida: false, concluidaEm: null })];
    const out = progressoDaTurma([{ alunoId: "al-1", alunoNome: "X" }], MODULOS, AULAS, progresso, HOJE);
    expect(out[0].status).toBe("travado");
    expect(out[0].diasSemConcluir).toBeNull();
  });

  it("trilha sem nenhuma aula: pct sempre 0 e ninguém conclui", () => {
    const out = progressoDaTurma([{ alunoId: "al-1", alunoNome: "X" }], [], [], [], HOJE);
    expect(out[0].pct).toBe(0);
    expect(out[0].status).toBe("nao_comecou");
  });

  it("roster vazio devolve lista vazia", () => {
    expect(progressoDaTurma([], MODULOS, AULAS, [], HOJE)).toEqual([]);
  });
});

describe("saudeTurma", () => {
  it("turma vazia: zeros em tudo, sem dividir por zero", () => {
    const s = saudeTurma([]);
    expect(s).toEqual({
      totalAlunos: 0,
      progressoMedioPct: 0,
      concluiram: 0,
      emAndamento: 0,
      travados: 0,
      naoComecaram: 0,
    });
  });

  it("classifica e tira a média corretamente", () => {
    const porAluno = progressoDaTurma(
      ROSTER,
      MODULOS,
      AULAS,
      [
        ...AULAS.map((a) => prog({ alunoId: "al-1", aulaId: a.id, concluida: true, concluidaEm: "2026-07-01T10:00:00" })),
        prog({ alunoId: "al-2", aulaId: "au-1", concluida: true, concluidaEm: "2026-08-01T10:00:00" }),
      ],
      HOJE
    );
    const s = saudeTurma(porAluno);
    expect(s.totalAlunos).toBe(3);
    expect(s.concluiram).toBe(1); // al-1
    expect(s.emAndamento).toBe(1); // al-2
    expect(s.naoComecaram).toBe(1); // al-3
    expect(s.travados).toBe(0);
  });
});

describe("funilPorModulo", () => {
  it("módulo sem aula cadastrada vem marcado semAula, sem contar ninguém", () => {
    const modulosComVazio: Modulo[] = [...MODULOS, modulo({ id: "mo-3", nome: "Bônus", ordem: 3 })];
    const out = funilPorModulo(ROSTER, modulosComVazio, AULAS, []);
    const bonus = out.find((f) => f.moduloId === "mo-3")!;
    expect(bonus.semAula).toBe(true);
    expect(bonus.concluiram).toBe(0);
    expect(bonus.pct).toBe(0);
  });

  it("conta só quem concluiu TODAS as aulas do módulo — barras decrescem ao longo da trilha", () => {
    const progresso = [
      // al-1 termina o módulo 1 inteiro e avança no 2
      prog({ alunoId: "al-1", aulaId: "au-1", concluida: true, concluidaEm: "2026-07-01T10:00:00" }),
      prog({ alunoId: "al-1", aulaId: "au-2", concluida: true, concluidaEm: "2026-07-02T10:00:00" }),
      prog({ alunoId: "al-1", aulaId: "au-3", concluida: true, concluidaEm: "2026-07-03T10:00:00" }),
      // al-2 só conclui a primeira aula do módulo 1 (não conta como "passou" do módulo)
      prog({ alunoId: "al-2", aulaId: "au-1", concluida: true, concluidaEm: "2026-07-01T10:00:00" }),
    ];
    const out = funilPorModulo(ROSTER, MODULOS, AULAS, progresso);
    expect(out[0].concluiram).toBe(1); // só al-1 terminou o módulo 1
    expect(out[1].concluiram).toBe(0); // ninguém terminou o módulo 2
    expect(out[0].ordem).toBeLessThan(out[1].ordem);
  });

  it("turma vazia: pct 0 sem dividir por zero", () => {
    const out = funilPorModulo([], MODULOS, AULAS, []);
    expect(out.every((f) => f.pct === 0)).toBe(true);
  });
});

describe("alunosEmRisco", () => {
  it("quem nunca começou entra com o motivo certo e maior score", () => {
    const porAluno = progressoDaTurma(ROSTER, MODULOS, AULAS, [], HOJE);
    const risco = alunosEmRisco(porAluno);
    expect(risco).toHaveLength(3); // ninguém concluiu, todos entram
    expect(risco[0].motivos[0]).toMatch(/nunca abriu/);
  });

  it("quem concluiu tudo nunca aparece", () => {
    const progresso = AULAS.map((a) =>
      prog({ alunoId: "al-1", aulaId: a.id, concluida: true, concluidaEm: "2026-07-01T10:00:00" })
    );
    const porAluno = progressoDaTurma(ROSTER, MODULOS, AULAS, progresso, HOJE);
    const risco = alunosEmRisco(porAluno);
    expect(risco.find((r) => r.alunoId === "al-1")).toBeUndefined();
  });

  it("aluno muito abaixo da média da turma aparece com o motivo de distância", () => {
    const progresso = [
      // al-1 e al-2 avançam bastante; al-3 fica muito para trás
      ...AULAS.slice(0, 3).map((a) =>
        prog({ alunoId: "al-1", aulaId: a.id, concluida: true, concluidaEm: "2026-08-05T10:00:00" })
      ),
      ...AULAS.slice(0, 3).map((a) =>
        prog({ alunoId: "al-2", aulaId: a.id, concluida: true, concluidaEm: "2026-08-05T10:00:00" })
      ),
      prog({ alunoId: "al-3", aulaId: "au-1", concluida: true, concluidaEm: "2026-08-05T10:00:00" }),
    ];
    const porAluno = progressoDaTurma(ROSTER, MODULOS, AULAS, progresso, HOJE);
    const risco = alunosEmRisco(porAluno);
    const al3 = risco.find((r) => r.alunoId === "al-3")!;
    expect(al3.motivos.some((m) => m.includes("pontos percentuais abaixo"))).toBe(true);
  });

  it("turma vazia devolve lista vazia", () => {
    expect(alunosEmRisco([])).toEqual([]);
  });
});

describe("mapaProgresso", () => {
  it("célula concluído só quando TODAS as aulas do módulo estão concluídas", () => {
    const progresso = [
      prog({ alunoId: "al-1", aulaId: "au-1", concluida: true, concluidaEm: "2026-07-01T10:00:00" }),
      prog({ alunoId: "al-1", aulaId: "au-2", concluida: true, concluidaEm: "2026-07-02T10:00:00" }),
      prog({ alunoId: "al-1", aulaId: "au-3", concluida: false, concluidaEm: null }),
    ];
    const porAluno = progressoDaTurma([{ alunoId: "al-1", alunoNome: "X" }], MODULOS, AULAS, progresso, HOJE);
    const mapa = mapaProgresso([{ alunoId: "al-1", alunoNome: "X" }], MODULOS, AULAS, progresso, porAluno);
    expect(mapa.linhas[0].celulas["mo-1"]).toBe("concluido");
    expect(mapa.linhas[0].celulas["mo-2"]).toBe("em_andamento");
  });

  it("aluno sem nenhum progresso: todas as células nao_comecado", () => {
    const porAluno = progressoDaTurma([{ alunoId: "al-1", alunoNome: "X" }], MODULOS, AULAS, [], HOJE);
    const mapa = mapaProgresso([{ alunoId: "al-1", alunoNome: "X" }], MODULOS, AULAS, [], porAluno);
    expect(Object.values(mapa.linhas[0].celulas)).toEqual(["nao_comecado", "nao_comecado"]);
  });

  it("módulo sem aula cadastrada vira nao_comecado (não dá para marcar concluído)", () => {
    const modulosComVazio = [...MODULOS, modulo({ id: "mo-3", nome: "Bônus", ordem: 3 })];
    const porAluno = progressoDaTurma([{ alunoId: "al-1", alunoNome: "X" }], modulosComVazio, AULAS, [], HOJE);
    const mapa = mapaProgresso([{ alunoId: "al-1", alunoNome: "X" }], modulosComVazio, AULAS, [], porAluno);
    expect(mapa.linhas[0].celulas["mo-3"]).toBe("nao_comecado");
  });
});

describe("presencaEncontros", () => {
  it("calcula presentes/total ordenado por data", () => {
    const encontros: Encontro[] = [
      { id: "en-2", turmaId: "tu-1", titulo: "Semana 2", data: "2026-06-01T14:00:00", presentes: ["al-1"] },
      { id: "en-1", turmaId: "tu-1", titulo: "Semana 1", data: "2026-05-01T14:00:00", presentes: ["al-1", "al-2"] },
    ];
    const out = presencaEncontros(encontros, 4);
    expect(out.map((e) => e.id)).toEqual(["en-1", "en-2"]);
    expect(out[0].presentes).toBe(2);
    expect(out[0].pct).toBe(50);
  });

  it("sem alunos na turma: pct 0 sem dividir por zero", () => {
    const encontros: Encontro[] = [
      { id: "en-1", turmaId: "tu-1", titulo: "Semana 1", data: "2026-05-01T14:00:00", presentes: [] },
    ];
    expect(presencaEncontros(encontros, 0)[0].pct).toBe(0);
  });

  it("turma sem nenhum encontro devolve lista vazia", () => {
    expect(presencaEncontros([], 5)).toEqual([]);
  });
});

describe("conteudoDoCurso", () => {
  it("soma a duração das aulas por módulo e conta conclusões por aula", () => {
    const progresso = [
      prog({ alunoId: "al-1", aulaId: "au-1", concluida: true, concluidaEm: "2026-07-01T10:00:00" }),
      prog({ alunoId: "al-2", aulaId: "au-1", concluida: true, concluidaEm: "2026-07-01T10:00:00" }),
    ];
    const out = conteudoDoCurso(MODULOS, AULAS, progresso, 4);
    const mod1 = out.find((m) => m.id === "mo-1")!;
    expect(mod1.duracaoTotalMin).toBe(20); // 2 aulas de 10min
    const aula1 = mod1.aulas.find((a) => a.id === "au-1")!;
    expect(aula1.concluidosCount).toBe(2);
    expect(aula1.pctConcluido).toBe(50);
  });

  it("módulo sem aula: duração total 0 e lista de aulas vazia", () => {
    const modulosComVazio = [...MODULOS, modulo({ id: "mo-3", nome: "Bônus", ordem: 3 })];
    const out = conteudoDoCurso(modulosComVazio, AULAS, [], 4);
    const bonus = out.find((m) => m.id === "mo-3")!;
    expect(bonus.duracaoTotalMin).toBe(0);
    expect(bonus.aulas).toEqual([]);
  });

  it("curso sem nenhum módulo cadastrado devolve lista vazia", () => {
    expect(conteudoDoCurso([], [], [], 4)).toEqual([]);
  });
});
