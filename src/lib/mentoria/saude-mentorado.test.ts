import { describe, expect, it } from "vitest";
import {
  NIVEL_SAUDE_MENTORADO_LABEL,
  saudeDoMentorado,
  type EntradaSaudeMentorado,
  type SaudeMentorado,
} from "./saude-mentorado";
import type { Matricula, Programa, ScoreEvolucao, Sessao, TarefaMentoria } from "./tipos";

// ---------- fixtures mínimas ----------
// Mesmo estilo de `progresso.test.ts`: só os campos que a conta lê recebem
// valor "real"; o resto fica no valor mais neutro possível, para deixar
// explícito no teste que ele não influencia o resultado.

function matriculaDe(parcial: Partial<Matricula>): Matricula {
  return {
    id: "matricula-1",
    workspaceId: "ws-1",
    mentoradoId: "mentorado-1",
    programaId: "programa-1",
    turmaId: null,
    inicio: "2026-05-02T00:00:00Z",
    fimPrevisto: null,
    status: "ativa",
    sessoesPrevistas: null,
    criadoEm: "2026-05-02T00:00:00Z",
    ...parcial,
  };
}

function programaDe(parcial: Partial<Programa>): Programa {
  return {
    id: "programa-1",
    workspaceId: "ws-1",
    nome: "Elite",
    formato: "individual",
    totalSessoes: null,
    preco: 0,
    ativo: true,
    criadoEm: "2026-01-01T00:00:00Z",
    ...parcial,
  };
}

let contadorSessao = 0;
function sessaoDe(parcial: Partial<Sessao>): Sessao {
  contadorSessao += 1;
  return {
    id: `sessao-${contadorSessao}`,
    workspaceId: "ws-1",
    matriculaId: "matricula-1",
    turmaId: null,
    numero: null,
    quando: "2026-05-04T00:00:00Z",
    duracaoMin: 60,
    status: "agendada",
    linkGravacao: "",
    transcricao: "",
    resumo: "",
    criadoEm: "2026-05-01T00:00:00Z",
    ...parcial,
  };
}

let contadorTarefa = 0;
function tarefaDe(parcial: Partial<TarefaMentoria>): TarefaMentoria {
  contadorTarefa += 1;
  return {
    id: `tarefa-${contadorTarefa}`,
    workspaceId: "ws-1",
    mentoradoId: "mentorado-1",
    sessaoId: null,
    titulo: "Fazer o exercício",
    prazo: null,
    concluida: false,
    concluidaEm: null,
    marcadaPor: "",
    criadoEm: "2026-05-01T00:00:00Z",
    ...parcial,
  };
}

let contadorScore = 0;
function scoreDe(parcial: Partial<ScoreEvolucao>): ScoreEvolucao {
  contadorScore += 1;
  return {
    id: `score-${contadorScore}`,
    workspaceId: "ws-1",
    mentoradoId: "mentorado-1",
    semana: "2026-05-04",
    score: 50,
    motivo: "",
    criadoEm: "2026-05-04T00:00:00Z",
    ...parcial,
  };
}

function entradaDe(parcial: Partial<EntradaSaudeMentorado>): EntradaSaudeMentorado {
  return {
    matriculas: [{ matricula: matriculaDe({}), programa: programaDe({}) }],
    sessoes: [],
    tarefas: [],
    scores: [],
    ...parcial,
  };
}

const AGORA = "2026-06-01T00:00:00Z";

function fator(saude: SaudeMentorado, chave: string) {
  const achado = saude.fatores.find((f) => f.chave === chave);
  if (!achado) throw new Error(`fator ${chave} não existe no resultado`);
  return achado;
}

// ============================================================
// Sem base — a asserção que dá nome ao módulo
// ============================================================

describe("saudeDoMentorado — sem base nunca vira zero", () => {
  it("mentorado sem NENHUMA sessão passada devolve score null e semBase true", () => {
    const saude = saudeDoMentorado(
      entradaDe({
        // só sessão no futuro: nada aconteceu ainda para ser julgado
        sessoes: [sessaoDe({ status: "agendada", quando: "2026-06-10T00:00:00Z" })],
      }),
      AGORA,
    );

    expect(saude.semBase).toBe(true);
    expect(saude.score).toBeNull();
    // A asserção que importa: zero é uma NOTA (a pior de todas), não é
    // "não sei". Se um refactor trocar `null` por `0`, este teste morre.
    expect(saude.score).not.toBe(0);
    expect(saude.nivel).toBeNull();
    expect(saude.maxComBase).toBe(0);
    expect(saude.parcial).toBe(false);
    expect(saude.fatores.every((f) => f.temBase === false && f.pontos === null)).toBe(true);
  });

  it("entrada completamente vazia (sem matrícula, sessão, tarefa ou score) não lança e é semBase", () => {
    const saude = saudeDoMentorado({ matriculas: [], sessoes: [], tarefas: [], scores: [] }, AGORA);
    expect(saude.semBase).toBe(true);
    expect(saude.score).toBeNull();
    expect(saude.score).not.toBe(0);
  });

  it("mentorado sem sessão nenhuma mas matriculado há meses: silêncio SEM base, com o motivo na tela", () => {
    // O alerta "nunca teve a primeira sessão" é de `diasEmSilencio`/
    // `rotuloAlertaCarteira`, não deste score: sem sessão nenhuma não houve
    // conversa para ficar em silêncio, e virar nota baixa aqui seria julgar
    // sem prova. O fator diz isso em vez de pontuar.
    const saude = saudeDoMentorado(
      entradaDe({ matriculas: [{ matricula: matriculaDe({ inicio: "2026-01-01T00:00:00Z" }), programa: null }] }),
      AGORA,
    );
    const silencio = fator(saude, "silencio");
    expect(silencio.temBase).toBe(false);
    expect(silencio.pontos).toBeNull();
    expect(silencio.detalhe).toContain("primeira sessão");
  });

  it("agoraIso inválido não lança e devolve semBase", () => {
    const entrada = entradaDe({
      sessoes: [
        sessaoDe({ status: "realizada", quando: "2026-05-04T00:00:00Z" }),
        sessaoDe({ status: "faltou", quando: "2026-05-11T00:00:00Z" }),
      ],
      tarefas: [tarefaDe({ prazo: "2026-05-10T00:00:00Z", concluida: true, concluidaEm: "2026-05-09T00:00:00Z" })],
      scores: [scoreDe({ semana: "2026-05-04", score: 40 }), scoreDe({ semana: "2026-05-11", score: 60 })],
    });

    for (const agoraRuim of ["", "ontem", "2026-13-45", "NaN"]) {
      const saude = saudeDoMentorado(entrada, agoraRuim);
      expect(saude.semBase).toBe(true);
      expect(saude.score).toBeNull();
      expect(saude.maxComBase).toBe(0);
    }
  });
});

// ============================================================
// Parcial — fator sem base sai da soma e do denominador
// ============================================================

describe("saudeDoMentorado — renormalização sobre o que tem base", () => {
  it("com sessões mas sem tarefa nenhuma: parcial true e maxComBase menor que 100", () => {
    const saude = saudeDoMentorado(
      entradaDe({
        sessoes: [
          sessaoDe({ status: "realizada", quando: "2026-05-04T00:00:00Z" }),
          sessaoDe({ status: "realizada", quando: "2026-05-11T00:00:00Z" }),
        ],
        tarefas: [],
      }),
      AGORA,
    );

    expect(saude.semBase).toBe(false);
    expect(saude.parcial).toBe(true);
    expect(saude.maxComBase).toBeGreaterThan(0);
    expect(saude.maxComBase).toBeLessThan(100);
    expect(fator(saude, "tarefas").temBase).toBe(false);
    expect(fator(saude, "tarefas").pontos).toBeNull();
    expect(fator(saude, "presenca").temBase).toBe(true);
  });

  it("tarefa ainda dentro do prazo não é base: não dá nota nem tira nota", () => {
    const saude = saudeDoMentorado(
      entradaDe({
        sessoes: [sessaoDe({ status: "realizada", quando: "2026-05-04T00:00:00Z" })],
        tarefas: [tarefaDe({ prazo: "2026-06-20T00:00:00Z", concluida: false })],
      }),
      AGORA,
    );
    expect(fator(saude, "tarefas").temBase).toBe(false);
  });

  it("tarefa sem prazo nenhum não é base: 'no prazo' precisa de um prazo", () => {
    const saude = saudeDoMentorado(
      entradaDe({
        sessoes: [sessaoDe({ status: "realizada", quando: "2026-05-04T00:00:00Z" })],
        tarefas: [tarefaDe({ prazo: null, concluida: true, concluidaEm: "2026-05-05T00:00:00Z" })],
      }),
      AGORA,
    );
    expect(fator(saude, "tarefas").temBase).toBe(false);
  });

  it("tarefa concluída sem `concluidaEm` (linha antiga do 0006) não é base: não dá para saber se foi no prazo", () => {
    const saude = saudeDoMentorado(
      entradaDe({
        sessoes: [sessaoDe({ status: "realizada", quando: "2026-05-04T00:00:00Z" })],
        tarefas: [tarefaDe({ prazo: "2026-05-10T00:00:00Z", concluida: true, concluidaEm: null })],
      }),
      AGORA,
    );
    expect(fator(saude, "tarefas").temBase).toBe(false);
  });

  it("todos os cinco fatores com base: parcial false e maxComBase exatamente 100", () => {
    const saude = saudeDoMentorado(entradaCompleta(), AGORA);
    expect(saude.parcial).toBe(false);
    expect(saude.maxComBase).toBe(100);
    expect(saude.fatores).toHaveLength(5);
  });
});

// ============================================================
// Presença — realizadas ÷ sessões passadas que aconteceram ou faltaram
// ============================================================

describe("saudeDoMentorado — presença nas sessões", () => {
  it("sessão cancelada não conta como falta (não foi o mentorado que sumiu)", () => {
    const saude = saudeDoMentorado(
      entradaDe({
        sessoes: [
          sessaoDe({ status: "realizada", quando: "2026-05-04T00:00:00Z" }),
          sessaoDe({ status: "cancelada", quando: "2026-05-11T00:00:00Z" }),
        ],
      }),
      AGORA,
    );
    const presenca = fator(saude, "presenca");
    expect(presenca.temBase).toBe(true);
    expect(presenca.pontos).toBe(presenca.max);
  });

  it("sessão passada ainda 'agendada' (sem baixa) fica fora da conta, e o detalhe avisa", () => {
    const saude = saudeDoMentorado(
      entradaDe({
        sessoes: [
          sessaoDe({ status: "realizada", quando: "2026-05-04T00:00:00Z" }),
          sessaoDe({ status: "agendada", quando: "2026-05-11T00:00:00Z" }),
        ],
      }),
      AGORA,
    );
    const presenca = fator(saude, "presenca");
    expect(presenca.pontos).toBe(presenca.max); // 1 de 1, não 1 de 2
    expect(presenca.detalhe).toContain("sem baixa");
  });

  it("faltou em metade das sessões passadas: metade dos pontos", () => {
    const saude = saudeDoMentorado(
      entradaDe({
        sessoes: [
          sessaoDe({ status: "realizada", quando: "2026-05-04T00:00:00Z" }),
          sessaoDe({ status: "faltou", quando: "2026-05-11T00:00:00Z" }),
        ],
      }),
      AGORA,
    );
    const presenca = fator(saude, "presenca");
    expect(presenca.pontos).toBe(presenca.max / 2);
  });

  it("sessão com data inválida não quebra nem entra na conta", () => {
    const saude = saudeDoMentorado(
      entradaDe({
        sessoes: [
          sessaoDe({ status: "realizada", quando: "2026-05-04T00:00:00Z" }),
          sessaoDe({ status: "faltou", quando: "não é data" }),
          sessaoDe({ status: "faltou", quando: "" }),
        ],
      }),
      AGORA,
    );
    const presenca = fator(saude, "presenca");
    expect(presenca.pontos).toBe(presenca.max);
  });
});

// ============================================================
// Tendência — precisa de DOIS pontos, e olha só as quatro últimas semanas
// ============================================================

describe("saudeDoMentorado — tendência do score_evolucao", () => {
  it("uma linha só não gera tendência (precisa de duas)", () => {
    const saude = saudeDoMentorado(
      entradaDe({
        sessoes: [sessaoDe({ status: "realizada", quando: "2026-05-04T00:00:00Z" })],
        scores: [scoreDe({ semana: "2026-05-25", score: 70 })],
      }),
      AGORA,
    );
    const tendencia = fator(saude, "tendencia");
    expect(tendencia.temBase).toBe(false);
    expect(tendencia.pontos).toBeNull();
  });

  it("duas linhas já geram tendência", () => {
    const saude = saudeDoMentorado(
      entradaDe({
        sessoes: [sessaoDe({ status: "realizada", quando: "2026-05-04T00:00:00Z" })],
        scores: [scoreDe({ semana: "2026-05-18", score: 40 }), scoreDe({ semana: "2026-05-25", score: 70 })],
      }),
      AGORA,
    );
    const tendencia = fator(saude, "tendencia");
    expect(tendencia.temBase).toBe(true);
    expect(tendencia.pontos).toBe(tendencia.max); // subiu 30 pontos: acima do teto de +10
  });

  it("olha SÓ as quatro últimas semanas, mesmo com a lista fora de ordem", () => {
    // Seis semanas: a queda antiga (90 -> 20) não pode mais pesar; as quatro
    // últimas são 20, 30, 40, 50 (subida de +30).
    const scoresForaDeOrdem = [
      scoreDe({ semana: "2026-05-25", score: 50 }),
      scoreDe({ semana: "2026-04-20", score: 90 }),
      scoreDe({ semana: "2026-05-11", score: 30 }),
      scoreDe({ semana: "2026-04-27", score: 80 }),
      scoreDe({ semana: "2026-05-18", score: 40 }),
      scoreDe({ semana: "2026-05-04", score: 20 }),
    ];
    const saude = saudeDoMentorado(
      entradaDe({
        sessoes: [sessaoDe({ status: "realizada", quando: "2026-05-04T00:00:00Z" })],
        scores: scoresForaDeOrdem,
      }),
      AGORA,
    );
    const tendencia = fator(saude, "tendencia");
    expect(tendencia.pontos).toBe(tendencia.max);
  });

  it("série estável fica no meio da faixa: estável não é bom nem ruim", () => {
    const saude = saudeDoMentorado(
      entradaDe({
        sessoes: [sessaoDe({ status: "realizada", quando: "2026-05-04T00:00:00Z" })],
        scores: [scoreDe({ semana: "2026-05-18", score: 55 }), scoreDe({ semana: "2026-05-25", score: 55 })],
      }),
      AGORA,
    );
    const tendencia = fator(saude, "tendencia");
    expect(tendencia.pontos).toBe(tendencia.max / 2);
  });

  it("semana inválida é descartada: sobra uma linha válida e não há tendência", () => {
    const saude = saudeDoMentorado(
      entradaDe({
        sessoes: [sessaoDe({ status: "realizada", quando: "2026-05-04T00:00:00Z" })],
        scores: [scoreDe({ semana: "semana passada", score: 10 }), scoreDe({ semana: "2026-05-25", score: 70 })],
      }),
      AGORA,
    );
    expect(fator(saude, "tendencia").temBase).toBe(false);
  });
});

// ============================================================
// Ritmo previsto — só existe quando existe um ritmo combinado
// ============================================================

describe("saudeDoMentorado — aderência ao ritmo previsto", () => {
  it("sem fim previsto não há ritmo combinado: fator sem base", () => {
    const saude = saudeDoMentorado(
      entradaDe({
        matriculas: [{ matricula: matriculaDe({ fimPrevisto: null, sessoesPrevistas: 10 }), programa: null }],
        sessoes: [sessaoDe({ status: "realizada", quando: "2026-05-04T00:00:00Z" })],
      }),
      AGORA,
    );
    expect(fator(saude, "ritmo").temBase).toBe(false);
  });

  it("`sessoes_previstas: 0` é ausência de pacote, não pacote de zero: fator sem base", () => {
    const saude = saudeDoMentorado(
      entradaDe({
        matriculas: [
          {
            matricula: matriculaDe({ sessoesPrevistas: 0, fimPrevisto: "2026-07-01T00:00:00Z" }),
            programa: programaDe({ totalSessoes: null }),
          },
        ],
        sessoes: [sessaoDe({ status: "realizada", quando: "2026-05-04T00:00:00Z" })],
      }),
      AGORA,
    );
    expect(fator(saude, "ritmo").temBase).toBe(false);
  });

  it("metade do prazo corrido com metade das sessões dadas: pontos cheios", () => {
    // 2026-05-02 -> 2026-07-01 são 60 dias; em 2026-06-01 passaram 30 (metade).
    // Pacote de 10 -> esperadas 5; com 5 realizadas, está exatamente no ritmo.
    const saude = saudeDoMentorado(
      entradaDe({
        matriculas: [
          {
            matricula: matriculaDe({ sessoesPrevistas: 10, fimPrevisto: "2026-07-01T00:00:00Z" }),
            programa: null,
          },
        ],
        sessoes: [
          sessaoDe({ status: "realizada", quando: "2026-05-04T00:00:00Z" }),
          sessaoDe({ status: "realizada", quando: "2026-05-06T00:00:00Z" }),
          sessaoDe({ status: "realizada", quando: "2026-05-08T00:00:00Z" }),
          sessaoDe({ status: "realizada", quando: "2026-05-11T00:00:00Z" }),
          sessaoDe({ status: "realizada", quando: "2026-05-13T00:00:00Z" }),
        ],
      }),
      AGORA,
    );
    const ritmo = fator(saude, "ritmo");
    expect(ritmo.temBase).toBe(true);
    expect(ritmo.pontos).toBe(ritmo.max);
  });

  it("adiantado não vale mais que 100%: o fator satura no máximo", () => {
    const saude = saudeDoMentorado(
      entradaDe({
        matriculas: [
          {
            matricula: matriculaDe({ sessoesPrevistas: 10, fimPrevisto: "2026-07-01T00:00:00Z" }),
            programa: null,
          },
        ],
        sessoes: Array.from({ length: 9 }, (_, i) =>
          sessaoDe({ status: "realizada", quando: `2026-05-0${i + 1}T00:00:00Z` }),
        ),
      }),
      AGORA,
    );
    const ritmo = fator(saude, "ritmo");
    expect(ritmo.pontos).toBe(ritmo.max);
  });

  it("programa manda quando a matrícula não diz nada (mesma cascata de progressoDe)", () => {
    const saude = saudeDoMentorado(
      entradaDe({
        matriculas: [
          {
            matricula: matriculaDe({ sessoesPrevistas: null, fimPrevisto: "2026-07-01T00:00:00Z" }),
            programa: programaDe({ totalSessoes: 10 }),
          },
        ],
        sessoes: [sessaoDe({ status: "realizada", quando: "2026-05-04T00:00:00Z" })],
      }),
      AGORA,
    );
    expect(fator(saude, "ritmo").temBase).toBe(true);
  });
});

// ============================================================
// Matrícula de referência — a escolha mora aqui, não em cada chamador
// ============================================================

describe("saudeDoMentorado — matrícula de referência", () => {
  it("com duas matrículas, a ATIVA manda mesmo sendo mais antiga que uma cancelada", () => {
    const ativa = matriculaDe({
      id: "matricula-ativa",
      status: "ativa",
      inicio: "2026-05-02T00:00:00Z",
      fimPrevisto: "2026-07-01T00:00:00Z",
      sessoesPrevistas: 10,
    });
    const cancelada = matriculaDe({
      id: "matricula-cancelada",
      status: "cancelada",
      inicio: "2026-05-20T00:00:00Z",
      fimPrevisto: null,
      sessoesPrevistas: null,
    });

    const saude = saudeDoMentorado(
      entradaDe({
        matriculas: [
          { matricula: cancelada, programa: null },
          { matricula: ativa, programa: null },
        ],
        sessoes: [sessaoDe({ status: "realizada", quando: "2026-05-04T00:00:00Z", matriculaId: "matricula-ativa" })],
      }),
      AGORA,
    );
    // Só a matrícula ativa tem fim previsto e pacote: se ela não fosse a
    // escolhida, o ritmo ficaria sem base.
    expect(fator(saude, "ritmo").temBase).toBe(true);
  });

  it("a mesma entrada em outra ordem devolve exatamente o mesmo resultado", () => {
    const entrada = entradaCompleta();
    const invertida: EntradaSaudeMentorado = {
      matriculas: [...entrada.matriculas].reverse(),
      sessoes: [...entrada.sessoes].reverse(),
      tarefas: [...entrada.tarefas].reverse(),
      scores: [...entrada.scores].reverse(),
    };
    expect(saudeDoMentorado(invertida, AGORA)).toEqual(saudeDoMentorado(entrada, AGORA));
  });
});

// ============================================================
// Valores travados — número exato, não intervalo
// ============================================================

/**
 * Presença 100% (3 realizadas, nenhuma falta), tarefas 100% no prazo (2 de 2),
 * silêncio de 3 dias e meio (dentro da faixa cheia), tendência estável.
 * Sem fim previsto: o ritmo fica de fora.
 *
 * presença 30 + tarefas 25 + silêncio 20 + tendência 5 = 80 sobre 85 -> 94.
 */
describe("saudeDoMentorado — valores exatos", () => {
  it("100% de presença e 100% de tarefas dá 94 (valor travado, não intervalo)", () => {
    const saude = saudeDoMentorado(
      entradaDe({
        sessoes: [
          sessaoDe({ status: "realizada", quando: "2026-05-15T00:00:00Z" }),
          sessaoDe({ status: "realizada", quando: "2026-05-22T00:00:00Z" }),
          sessaoDe({ status: "realizada", quando: "2026-05-29T00:00:00Z" }),
          sessaoDe({ status: "agendada", quando: "2026-06-10T00:00:00Z" }),
        ],
        tarefas: [
          tarefaDe({ prazo: "2026-05-10T00:00:00Z", concluida: true, concluidaEm: "2026-05-09T00:00:00Z" }),
          // concluída no limite do prazo: no prazo, não atrasada
          tarefaDe({ prazo: "2026-05-20T00:00:00Z", concluida: true, concluidaEm: "2026-05-20T00:00:00Z" }),
        ],
        scores: [scoreDe({ semana: "2026-05-18", score: 60 }), scoreDe({ semana: "2026-05-25", score: 60 })],
      }),
      "2026-06-01T12:00:00Z",
    );

    expect(saude.score).toBe(94);
    expect(saude.maxComBase).toBe(85);
    expect(saude.parcial).toBe(true);
    expect(saude.nivel).toBe("excelente");
    expect(fator(saude, "presenca").pontos).toBe(30);
    expect(fator(saude, "tarefas").pontos).toBe(25);
    expect(fator(saude, "silencio").pontos).toBe(20);
    expect(fator(saude, "tendencia").pontos).toBe(5);
  });

  /**
   * Os cinco fatores em pé, nenhum deles no extremo:
   * presença 3 de 4 -> 22.5; tarefas 3 de 4 no prazo -> 18.8;
   * silêncio de 20 dias -> 14.3; ritmo 3 de 5 esperadas -> 9;
   * tendência de -5 pontos -> 2.5. Soma 67.1 sobre 100 -> 67.
   */
  it("cinco fatores com base dão 67 (valor travado, fator a fator)", () => {
    const saude = saudeDoMentorado(entradaCompleta(), AGORA);

    expect(fator(saude, "presenca").pontos).toBe(22.5);
    expect(fator(saude, "tarefas").pontos).toBe(18.8);
    expect(fator(saude, "silencio").pontos).toBe(14.3);
    expect(fator(saude, "ritmo").pontos).toBe(9);
    expect(fator(saude, "tendencia").pontos).toBe(2.5);
    expect(saude.maxComBase).toBe(100);
    expect(saude.score).toBe(67);
    expect(saude.nivel).toBe("saudavel");
  });

  it("todo fator tem rótulo em português e detalhe não vazio, com base ou sem base", () => {
    for (const saude of [saudeDoMentorado(entradaCompleta(), AGORA), saudeDoMentorado(entradaDe({}), AGORA)]) {
      for (const f of saude.fatores) {
        expect(f.nome.trim().length).toBeGreaterThan(0);
        expect(f.detalhe.trim().length).toBeGreaterThan(0);
        expect(f.max).toBeGreaterThan(0);
      }
    }
  });

  it("os quatro níveis têm rótulo em português", () => {
    expect(NIVEL_SAUDE_MENTORADO_LABEL.critico).toBe("Crítico");
    expect(NIVEL_SAUDE_MENTORADO_LABEL.atencao).toBe("Atenção");
    expect(NIVEL_SAUDE_MENTORADO_LABEL.saudavel).toBe("Saudável");
    expect(NIVEL_SAUDE_MENTORADO_LABEL.excelente).toBe("Excelente");
  });
});

/**
 * Entrada com os CINCO fatores em pé — usada pelos testes de valor travado,
 * de determinismo e de `parcial: false`. Cada número aqui foi escolhido para
 * cair no meio da faixa do seu fator, não no extremo: um erro de sinal ou de
 * denominador na implementação muda o resultado.
 */
function entradaCompleta(): EntradaSaudeMentorado {
  return {
    matriculas: [
      {
        matricula: matriculaDe({
          inicio: "2026-05-02T00:00:00Z",
          fimPrevisto: "2026-07-01T00:00:00Z",
          sessoesPrevistas: 10,
        }),
        programa: programaDe({ totalSessoes: 12 }),
      },
    ],
    sessoes: [
      sessaoDe({ status: "realizada", quando: "2026-05-04T00:00:00Z" }),
      sessaoDe({ status: "realizada", quando: "2026-05-11T00:00:00Z" }),
      sessaoDe({ status: "realizada", quando: "2026-05-12T00:00:00Z" }),
      sessaoDe({ status: "faltou", quando: "2026-05-18T00:00:00Z" }),
      sessaoDe({ status: "agendada", quando: "2026-06-10T00:00:00Z" }),
    ],
    tarefas: [
      tarefaDe({ prazo: "2026-05-06T00:00:00Z", concluida: true, concluidaEm: "2026-05-05T00:00:00Z" }),
      tarefaDe({ prazo: "2026-05-13T00:00:00Z", concluida: true, concluidaEm: "2026-05-12T00:00:00Z" }),
      tarefaDe({ prazo: "2026-05-20T00:00:00Z", concluida: true, concluidaEm: "2026-05-19T00:00:00Z" }),
      // atrasada: venceu e ninguém concluiu
      tarefaDe({ prazo: "2026-05-25T00:00:00Z", concluida: false, concluidaEm: null }),
    ],
    scores: [
      scoreDe({ semana: "2026-05-04", score: 60 }),
      scoreDe({ semana: "2026-05-11", score: 58 }),
      scoreDe({ semana: "2026-05-18", score: 55 }),
      scoreDe({ semana: "2026-05-25", score: 55 }),
    ],
  };
}

// ============================================================
// Entradas absurdas — o score nunca sai da faixa e nunca vira NaN
// ============================================================

describe("saudeDoMentorado — score sempre entre 0 e 100 inclusive", () => {
  const absurdos: Array<[string, EntradaSaudeMentorado]> = [
    [
      "todas as sessões no futuro",
      entradaDe({
        matriculas: [
          {
            matricula: matriculaDe({ sessoesPrevistas: 10, fimPrevisto: "2026-07-01T00:00:00Z" }),
            programa: null,
          },
        ],
        sessoes: [
          sessaoDe({ status: "realizada", quando: "2030-01-01T00:00:00Z" }),
          sessaoDe({ status: "faltou", quando: "2030-02-01T00:00:00Z" }),
        ],
      }),
    ],
    [
      "prazo de tarefa anterior à própria criação, e conclusão antes do começo de tudo",
      entradaDe({
        sessoes: [sessaoDe({ status: "realizada", quando: "2026-05-04T00:00:00Z" })],
        tarefas: [
          tarefaDe({ prazo: "1900-01-01T00:00:00Z", concluida: true, concluidaEm: "1899-01-01T00:00:00Z" }),
          tarefaDe({ prazo: "2026-05-01T00:00:00Z", concluida: true, concluidaEm: "2099-01-01T00:00:00Z" }),
        ],
      }),
    ],
    [
      "prazo e datas inválidas por toda parte",
      entradaDe({
        matriculas: [
          {
            matricula: matriculaDe({ inicio: "quando der", fimPrevisto: "nunca", sessoesPrevistas: 10 }),
            programa: null,
          },
        ],
        sessoes: [
          sessaoDe({ status: "realizada", quando: "2026-05-04T00:00:00Z" }),
          sessaoDe({ status: "faltou", quando: "" }),
        ],
        tarefas: [tarefaDe({ prazo: "amanhã", concluida: true, concluidaEm: "hoje" })],
        scores: [scoreDe({ semana: "", score: 10 }), scoreDe({ semana: "2026-05-25", score: 70 })],
      }),
    ],
    [
      "sessoes_previstas 0 e janela de prazo negativa (fim antes do início)",
      entradaDe({
        matriculas: [
          {
            matricula: matriculaDe({
              inicio: "2026-06-01T00:00:00Z",
              fimPrevisto: "2026-01-01T00:00:00Z",
              sessoesPrevistas: 0,
            }),
            programa: programaDe({ totalSessoes: 0 }),
          },
        ],
        sessoes: [
          sessaoDe({ status: "realizada", quando: "2026-05-04T00:00:00Z" }),
          sessaoDe({ status: "faltou", quando: "2026-05-11T00:00:00Z" }),
        ],
        tarefas: [tarefaDe({ prazo: "2026-05-01T00:00:00Z", concluida: false })],
        scores: [scoreDe({ semana: "2026-05-18", score: 999 }), scoreDe({ semana: "2026-05-25", score: -999 })],
      }),
    ],
    [
      "última sessão 'realizada' no futuro (silêncio negativo)",
      entradaDe({
        sessoes: [
          sessaoDe({ status: "realizada", quando: "2026-05-04T00:00:00Z" }),
          sessaoDe({ status: "realizada", quando: "2026-05-30T00:00:00Z" }),
        ],
      }),
    ],
    [
      "score de evolução fora da faixa 0-100 no banco",
      entradaDe({
        sessoes: [sessaoDe({ status: "realizada", quando: "2026-05-04T00:00:00Z" })],
        scores: [scoreDe({ semana: "2026-05-18", score: -5000 }), scoreDe({ semana: "2026-05-25", score: 9000 })],
      }),
    ],
  ];

  for (const [nome, entrada] of absurdos) {
    it(`${nome}: score é null ou 0..100, nunca NaN`, () => {
      const saude = saudeDoMentorado(entrada, AGORA);

      if (saude.score !== null) {
        expect(Number.isFinite(saude.score)).toBe(true);
        expect(saude.score).toBeGreaterThanOrEqual(0);
        expect(saude.score).toBeLessThanOrEqual(100);
      }

      for (const f of saude.fatores) {
        if (f.pontos !== null) {
          expect(Number.isFinite(f.pontos)).toBe(true);
          expect(f.pontos).toBeGreaterThanOrEqual(0);
          expect(f.pontos).toBeLessThanOrEqual(f.max);
        }
      }

      expect(saude.maxComBase).toBeGreaterThanOrEqual(0);
      expect(saude.maxComBase).toBeLessThanOrEqual(100);
    });
  }
});

// ============================================================
// Matrícula de referência — a regra completa, não só "ativa ganha de cancelada"
// ============================================================
//
// O bloco acima cobria uma ativa contra uma cancelada, caso em que só sobra
// UMA candidata e o desempate nunca roda. Os testes daqui exercitam a decisão
// de verdade: qual ativa manda quando há mais de uma, e o que acontece no
// empate. É a decisão que o cabeçalho do módulo declara existir para impedir
// "duas contas para o mesmo número" — sem estes casos, ela pode ser invertida
// sem nenhum teste reclamar.

describe("saudeDoMentorado — qual matrícula manda quando há mais de uma ativa", () => {
  it("entre DUAS ativas, manda a que começou mais recentemente (renovação, não o pacote vencido)", () => {
    // Pacote velho já vencido (jan–mar) e renovação em curso (mai–jul), os
    // dois com status ativa — o desenho normal de quem renovou sem ninguém
    // ter fechado a matrícula anterior no banco.
    const antiga = matriculaDe({
      id: "matricula-antiga",
      status: "ativa",
      inicio: "2026-01-05T00:00:00Z",
      fimPrevisto: "2026-03-05T00:00:00Z",
      sessoesPrevistas: 10,
    });
    const nova = matriculaDe({
      id: "matricula-nova",
      status: "ativa",
      inicio: "2026-05-02T00:00:00Z",
      fimPrevisto: "2026-07-01T00:00:00Z",
      sessoesPrevistas: 10,
    });

    const saude = saudeDoMentorado(
      entradaDe({
        matriculas: [
          { matricula: antiga, programa: null },
          { matricula: nova, programa: null },
        ],
        sessoes: Array.from({ length: 5 }, (_, i) =>
          sessaoDe({
            status: "realizada",
            quando: `2026-05-0${i + 4}T00:00:00Z`,
            matriculaId: "matricula-nova",
          }),
        ),
      }),
      AGORA,
    );

    const ritmo = fator(saude, "ritmo");
    // Metade do prazo da renovação corrida, metade das sessões dadas: em dia.
    // Pela matrícula ANTIGA a conta seria 0 de 10 (prazo 100% corrido, nenhuma
    // sessão do pacote velho) — nota zero para quem está em dia.
    expect(ritmo.temBase).toBe(true);
    expect(ritmo.pontos).toBe(ritmo.max);
    expect(ritmo.detalhe).toContain("5 de 5.0");
  });

  it("empate de início entre duas ativas: o `id` desempata, e a ordem das linhas não muda nada", () => {
    // Mesmo `inicio` nas duas. Sem desempate estável, a que manda seria a que
    // o banco devolveu primeiro — e o MESMO mentorado teria dois scores em
    // duas telas. `matricula-b` (id maior) é a que deve mandar nas DUAS ordens.
    const a = matriculaDe({
      id: "matricula-a",
      status: "ativa",
      inicio: "2026-05-02T00:00:00Z",
      fimPrevisto: null,
      sessoesPrevistas: null,
    });
    const b = matriculaDe({
      id: "matricula-b",
      status: "ativa",
      inicio: "2026-05-02T00:00:00Z",
      fimPrevisto: "2026-07-01T00:00:00Z",
      sessoesPrevistas: 10,
    });
    const sessoes = Array.from({ length: 5 }, (_, i) =>
      sessaoDe({ status: "realizada", quando: `2026-05-0${i + 4}T00:00:00Z`, matriculaId: "matricula-b" }),
    );

    const numaOrdem = saudeDoMentorado(
      entradaDe({
        matriculas: [
          { matricula: a, programa: null },
          { matricula: b, programa: null },
        ],
        sessoes,
      }),
      AGORA,
    );
    const naOutra = saudeDoMentorado(
      entradaDe({
        matriculas: [
          { matricula: b, programa: null },
          { matricula: a, programa: null },
        ],
        sessoes,
      }),
      AGORA,
    );

    // Só `matricula-b` tem prazo e pacote: se ela não mandar, o ritmo some.
    expect(fator(numaOrdem, "ritmo").temBase).toBe(true);
    expect(fator(naOutra, "ritmo").temBase).toBe(true);
    expect(numaOrdem).toEqual(naOutra);
  });

  it("as duas com início ilegível: o `id` ainda desempata e o resultado não depende da ordem", () => {
    // Ramo do empate por AUSÊNCIA de data (as duas ilegíveis). Nenhuma das
    // duas dá ritmo — mas o MOTIVO na tela é diferente em cada uma, e é por
    // ele que se vê qual foi escolhida.
    const a = matriculaDe({
      id: "matricula-a",
      status: "ativa",
      inicio: "quando der",
      fimPrevisto: null,
      sessoesPrevistas: null,
    });
    const b = matriculaDe({
      id: "matricula-b",
      status: "ativa",
      inicio: "sei lá",
      fimPrevisto: "2026-07-01T00:00:00Z",
      sessoesPrevistas: 10,
    });

    const numaOrdem = saudeDoMentorado(
      entradaDe({
        matriculas: [
          { matricula: a, programa: null },
          { matricula: b, programa: null },
        ],
        sessoes: [sessaoDe({ status: "realizada", quando: "2026-05-25T00:00:00Z", matriculaId: "matricula-b" })],
      }),
      AGORA,
    );
    const naOutra = saudeDoMentorado(
      entradaDe({
        matriculas: [
          { matricula: b, programa: null },
          { matricula: a, programa: null },
        ],
        sessoes: [sessaoDe({ status: "realizada", quando: "2026-05-25T00:00:00Z", matriculaId: "matricula-b" })],
      }),
      AGORA,
    );

    // `matricula-b` (id maior) tem pacote: o motivo dela é a data ilegível,
    // não a falta de pacote.
    expect(fator(numaOrdem, "ritmo").detalhe).toContain("início e fim previstos legíveis");
    expect(fator(naOutra, "ritmo").detalhe).toContain("início e fim previstos legíveis");
    expect(fator(numaOrdem, "ritmo").detalhe).toEqual(fator(naOutra, "ritmo").detalhe);
  });
});

// ============================================================
// Vínculo sessão ↔ matrícula — ritmo lê o pacote CERTO
// ============================================================

describe("saudeDoMentorado — o ritmo só conta as sessões da matrícula de referência", () => {
  it("sessão de OUTRA matrícula do mesmo mentorado não entra no ritmo do pacote atual", () => {
    // 4 sessões do pacote encerrado + 1 do pacote novo. Creditar as quatro
    // velhas ao pacote novo daria "em dia" a quem só teve uma sessão desde a
    // renovação — sessão já consumida contada duas vezes.
    const antiga = matriculaDe({
      id: "matricula-antiga",
      status: "concluida",
      inicio: "2026-01-05T00:00:00Z",
      fimPrevisto: "2026-03-05T00:00:00Z",
      sessoesPrevistas: 10,
    });
    const nova = matriculaDe({
      id: "matricula-nova",
      status: "ativa",
      inicio: "2026-05-02T00:00:00Z",
      fimPrevisto: "2026-07-01T00:00:00Z",
      sessoesPrevistas: 10,
    });

    const saude = saudeDoMentorado(
      entradaDe({
        matriculas: [
          { matricula: antiga, programa: null },
          { matricula: nova, programa: null },
        ],
        sessoes: [
          sessaoDe({ status: "realizada", quando: "2026-01-10T00:00:00Z", matriculaId: "matricula-antiga" }),
          sessaoDe({ status: "realizada", quando: "2026-01-17T00:00:00Z", matriculaId: "matricula-antiga" }),
          sessaoDe({ status: "realizada", quando: "2026-01-24T00:00:00Z", matriculaId: "matricula-antiga" }),
          sessaoDe({ status: "realizada", quando: "2026-01-31T00:00:00Z", matriculaId: "matricula-antiga" }),
          sessaoDe({ status: "realizada", quando: "2026-05-04T00:00:00Z", matriculaId: "matricula-nova" }),
        ],
      }),
      AGORA,
    );

    const ritmo = fator(saude, "ritmo");
    expect(ritmo.detalhe).toContain("1 de 5.0");
    expect(ritmo.pontos).toBe(3); // 1 de 5 esperadas -> 20% de 15
  });

  it("sessão de TURMA conta para a matrícula daquela turma (aula em grupo)", () => {
    // O segundo vínculo que `sessao` admite (`sessao_vinculo_unico`, 0006):
    // a sessão não aponta para a matrícula, aponta para a turma dela.
    const emTurma = matriculaDe({
      id: "matricula-turma",
      turmaId: "turma-1",
      inicio: "2026-05-02T00:00:00Z",
      fimPrevisto: "2026-07-01T00:00:00Z",
      sessoesPrevistas: 10,
    });

    const saude = saudeDoMentorado(
      entradaDe({
        matriculas: [{ matricula: emTurma, programa: null }],
        sessoes: Array.from({ length: 5 }, (_, i) =>
          sessaoDe({
            status: "realizada",
            quando: `2026-05-0${i + 4}T00:00:00Z`,
            matriculaId: null,
            turmaId: "turma-1",
          }),
        ),
      }),
      AGORA,
    );

    const ritmo = fator(saude, "ritmo");
    expect(ritmo.detalhe).toContain("5 de 5.0");
    expect(ritmo.pontos).toBe(ritmo.max);
  });

  it("sessão de OUTRA turma não entra no ritmo", () => {
    const emTurma = matriculaDe({
      id: "matricula-turma",
      turmaId: "turma-1",
      inicio: "2026-05-02T00:00:00Z",
      fimPrevisto: "2026-07-01T00:00:00Z",
      sessoesPrevistas: 10,
    });

    const saude = saudeDoMentorado(
      entradaDe({
        matriculas: [{ matricula: emTurma, programa: null }],
        sessoes: Array.from({ length: 5 }, (_, i) =>
          sessaoDe({
            status: "realizada",
            quando: `2026-05-0${i + 4}T00:00:00Z`,
            matriculaId: null,
            turmaId: "turma-outra",
          }),
        ),
      }),
      AGORA,
    );

    expect(fator(saude, "ritmo").detalhe).toContain("0 de 5.0");
    expect(fator(saude, "ritmo").pontos).toBe(0);
  });
});

// ============================================================
// Mentorado novo — a guarda que impede "crítico em cima de nada"
// ============================================================

describe("saudeDoMentorado — quem se matriculou ontem não é crítico", () => {
  it("antes da primeira sessão prevista o ritmo NÃO pontua, e o mentorado novo fica sem score", () => {
    // Matriculado ontem, pacote de 10 sessões em 3 meses: a esta altura são
    // 0,1 sessões esperadas. Sem a guarda, a conta vira "0 de 0.1" -> zero
    // pontos, e um mentorado de um dia aparece como crítico — alerta de risco
    // em cima de nada.
    const saude = saudeDoMentorado(
      entradaDe({
        matriculas: [
          {
            matricula: matriculaDe({
              inicio: "2026-05-31T00:00:00Z",
              fimPrevisto: "2026-08-31T00:00:00Z",
              sessoesPrevistas: 10,
            }),
            programa: null,
          },
        ],
        sessoes: [],
        tarefas: [],
        scores: [],
      }),
      AGORA,
    );

    const ritmo = fator(saude, "ritmo");
    expect(ritmo.temBase).toBe(false);
    expect(ritmo.pontos).toBeNull();
    expect(ritmo.detalhe).toContain("primeira sessão prevista");
    // O que a tela recebe: "não há como saber", nunca a pior nota possível.
    expect(saude.score).toBeNull();
    expect(saude.score).not.toBe(0);
    expect(saude.semBase).toBe(true);
    expect(saude.nivel).not.toBe("critico");
  });
});

// ============================================================
// Níveis — as duas faixas que o alerta de risco vai consumir
// ============================================================

describe("saudeDoMentorado — limiares de nível travados na faixa de alerta", () => {
  it("presença de 1 em 3, nenhuma tarefa no prazo, 52 dias em silêncio e tendência de queda: 12, crítico", () => {
    const saude = saudeDoMentorado(
      entradaDe({
        sessoes: [
          sessaoDe({ status: "realizada", quando: "2026-04-10T00:00:00Z" }),
          sessaoDe({ status: "faltou", quando: "2026-05-04T00:00:00Z" }),
          sessaoDe({ status: "faltou", quando: "2026-05-11T00:00:00Z" }),
        ],
        tarefas: [
          tarefaDe({ prazo: "2026-05-06T00:00:00Z", concluida: false }),
          tarefaDe({ prazo: "2026-05-13T00:00:00Z", concluida: false }),
        ],
        scores: [scoreDe({ semana: "2026-05-18", score: 60 }), scoreDe({ semana: "2026-05-25", score: 40 })],
      }),
      AGORA,
    );

    expect(fator(saude, "presenca").pontos).toBe(10);
    expect(fator(saude, "tarefas").pontos).toBe(0);
    expect(fator(saude, "silencio").pontos).toBe(0); // 52 dias: passou dos 45 que zeram
    expect(fator(saude, "tendencia").pontos).toBe(0); // caiu 20 pontos
    expect(saude.maxComBase).toBe(85);
    expect(saude.score).toBe(12);
    expect(saude.nivel).toBe("critico");
  });

  it("metade da presença, metade das tarefas e 28 dias em silêncio: 50, atenção", () => {
    const saude = saudeDoMentorado(
      entradaDe({
        sessoes: [
          sessaoDe({ status: "realizada", quando: "2026-04-27T00:00:00Z" }),
          sessaoDe({ status: "realizada", quando: "2026-05-04T00:00:00Z" }),
          sessaoDe({ status: "faltou", quando: "2026-05-11T00:00:00Z" }),
          sessaoDe({ status: "faltou", quando: "2026-05-18T00:00:00Z" }),
        ],
        tarefas: [
          tarefaDe({ prazo: "2026-05-06T00:00:00Z", concluida: true, concluidaEm: "2026-05-05T00:00:00Z" }),
          tarefaDe({ prazo: "2026-05-13T00:00:00Z", concluida: false }),
        ],
      }),
      AGORA,
    );

    expect(fator(saude, "presenca").pontos).toBe(15);
    expect(fator(saude, "tarefas").pontos).toBe(12.5);
    expect(fator(saude, "silencio").pontos).toBe(9.7);
    expect(saude.maxComBase).toBe(75);
    expect(saude.score).toBe(50);
    expect(saude.nivel).toBe("atencao");
  });
});

// ============================================================
// Score não-finito vindo do banco — o caminho real do NaN
// ============================================================

describe("saudeDoMentorado — linha de score_evolucao com número ilegível", () => {
  it("score NaN na série é descartado como se a linha não existisse (não contamina o total)", () => {
    // Caminho real: `dados.ts` faz `Number(r.score)`, e `Number(undefined)` é
    // NaN. Uma única linha assim, sem o descarte, faz a variação virar NaN, o
    // fator virar NaN e o score do mentorado inteiro virar NaN na tela.
    const saude = saudeDoMentorado(
      entradaDe({
        sessoes: [sessaoDe({ status: "realizada", quando: "2026-05-25T00:00:00Z" })],
        scores: [
          scoreDe({ semana: "2026-05-18", score: Number.NaN }),
          scoreDe({ semana: "2026-05-25", score: 70 }),
        ],
      }),
      AGORA,
    );

    const tendencia = fator(saude, "tendencia");
    expect(tendencia.temBase).toBe(false); // sobrou UMA linha legível
    expect(tendencia.pontos).toBeNull();
    expect(saude.score).not.toBeNull();
    expect(Number.isFinite(saude.score)).toBe(true);
  });

  it("com três linhas, a do meio ilegível não vira NaN: a variação sai das duas legíveis", () => {
    const saude = saudeDoMentorado(
      entradaDe({
        sessoes: [sessaoDe({ status: "realizada", quando: "2026-05-25T00:00:00Z" })],
        scores: [
          scoreDe({ semana: "2026-05-11", score: 50 }),
          scoreDe({ semana: "2026-05-18", score: Number.NaN }),
          scoreDe({ semana: "2026-05-25", score: 70 }),
        ],
      }),
      AGORA,
    );

    const tendencia = fator(saude, "tendencia");
    expect(tendencia.temBase).toBe(true);
    expect(tendencia.pontos).toBe(tendencia.max); // subiu 20: acima do teto de +10
    expect(Number.isFinite(saude.score)).toBe(true);
  });
});

// ============================================================
// Tendência — série parada não descreve o AGORA
// ============================================================

describe("saudeDoMentorado — tendência precisa de leitura RECENTE", () => {
  it("série de score que parou há anos não pontua (nem para bem, nem para mal)", () => {
    // O snapshot semanal pode simplesmente parar de rodar — e aí a série
    // congelada é o estado NORMAL de um mentorado abandonado. Pontuar a
    // subida de 2019 hoje é dizer, na tela de 2026, "está melhorando".
    const saude = saudeDoMentorado(
      entradaDe({
        sessoes: [sessaoDe({ status: "realizada", quando: "2026-05-25T00:00:00Z" })],
        scores: [scoreDe({ semana: "2019-03-04", score: 20 }), scoreDe({ semana: "2019-03-11", score: 70 })],
      }),
      AGORA,
    );

    const tendencia = fator(saude, "tendencia");
    expect(tendencia.temBase).toBe(false);
    expect(tendencia.pontos).toBeNull();
    expect(tendencia.detalhe).toContain("parou");
    expect(tendencia.detalhe).not.toContain("+50");
  });

  it("leitura velha é descartada, mas a janela recente ainda vale", () => {
    const saude = saudeDoMentorado(
      entradaDe({
        sessoes: [sessaoDe({ status: "realizada", quando: "2026-05-25T00:00:00Z" })],
        scores: [
          scoreDe({ semana: "2019-03-04", score: 100 }), // pré-histórico: fora
          scoreDe({ semana: "2026-05-18", score: 40 }),
          scoreDe({ semana: "2026-05-25", score: 70 }),
        ],
      }),
      AGORA,
    );

    const tendencia = fator(saude, "tendencia");
    expect(tendencia.temBase).toBe(true);
    expect(tendencia.pontos).toBe(tendencia.max); // +30 nas duas recentes
    expect(tendencia.detalhe).toContain("2 semanas registradas");
  });
});

// ============================================================
// Silêncio — sessão realizada com data no futuro não é silêncio
// ============================================================

describe("saudeDoMentorado — silêncio nunca é negativo", () => {
  it("sessão 'realizada' com data no futuro (ano digitado errado) não dá nota cheia de silêncio", () => {
    // O caso real é erro de digitação no ano ao dar baixa. Sem guarda, o
    // intervalo fica negativo, o `clamp` transforma isso em nota CHEIA — nota
    // máxima por uma sessão que ainda não aconteceu — e a tela recebe a frase
    // "última sessão há -121 dias".
    const saude = saudeDoMentorado(
      entradaDe({
        sessoes: [
          sessaoDe({ status: "realizada", quando: "2026-05-04T00:00:00Z" }),
          sessaoDe({ status: "realizada", quando: "2027-05-04T00:00:00Z" }),
        ],
      }),
      AGORA,
    );

    const silencio = fator(saude, "silencio");
    expect(silencio.temBase).toBe(false);
    expect(silencio.pontos).toBeNull();
    expect(silencio.detalhe).toContain("futuro");
    // Nenhum número negativo na frase que vai para a tela ("há -121 dias").
    expect(silencio.detalhe).not.toMatch(/-\d/);
  });
});
