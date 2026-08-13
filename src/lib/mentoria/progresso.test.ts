import { describe, expect, it } from "vitest";
import {
  diasDesdeUltimaSessao,
  diasEmSilencio,
  progressoDe,
  proximaSessao,
  ultimaSessaoRealizada,
} from "./progresso";
import type { Matricula, Programa, Sessao } from "./tipos";

// ---------- fixtures mínimas ----------
// Só os campos que os cálculos leem são preenchidos com valor "real"; o
// resto é o valor mais neutro possível, para deixar claro no teste que ele
// não influencia o resultado.

function matriculaDe(parcial: Partial<Matricula>): Matricula {
  return {
    id: "matricula-1",
    workspaceId: "ws-1",
    mentoradoId: "mentorado-1",
    programaId: "programa-1",
    turmaId: null,
    inicio: "2026-01-01",
    fimPrevisto: null,
    status: "ativa",
    sessoesPrevistas: null,
    criadoEm: "2026-01-01T00:00:00Z",
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

function sessaoDe(parcial: Partial<Sessao>): Sessao {
  return {
    id: `sessao-${Math.random()}`,
    workspaceId: "ws-1",
    matriculaId: "matricula-1",
    turmaId: null,
    numero: null,
    quando: "2026-01-01T10:00:00Z",
    duracaoMin: 60,
    status: "agendada",
    linkGravacao: "",
    transcricao: "",
    resumo: "",
    criadoEm: "2026-01-01T00:00:00Z",
    ...parcial,
  };
}

describe("progressoDe — regra 1: de onde vem 'previstas'", () => {
  it("matrícula diz 10 e programa diz 12 -> usa o da matrícula (10)", () => {
    const matricula = matriculaDe({ sessoesPrevistas: 10 });
    const programa = programaDe({ totalSessoes: 12 });
    expect(progressoDe(matricula, programa, []).previstas).toBe(10);
  });

  it("matrícula null e programa diz 12 -> cai para o do programa (12)", () => {
    const matricula = matriculaDe({ sessoesPrevistas: null });
    const programa = programaDe({ totalSessoes: 12 });
    expect(progressoDe(matricula, programa, []).previstas).toBe(12);
  });

  it("ambos null -> previstas é null (pacote aberto)", () => {
    const matricula = matriculaDe({ sessoesPrevistas: null });
    const programa = programaDe({ totalSessoes: null });
    expect(progressoDe(matricula, programa, []).previstas).toBeNull();
  });

  it("programa null (não carregado) e matrícula null -> previstas é null, não lança", () => {
    const matricula = matriculaDe({ sessoesPrevistas: null });
    expect(progressoDe(matricula, null, []).previstas).toBeNull();
  });
});

describe("progressoDe — regra 2: 'realizadas' só conta status realizada", () => {
  it("ignora agendada, faltou e cancelada; conta só realizada", () => {
    const matricula = matriculaDe({ sessoesPrevistas: 12 });
    const programa = programaDe({});
    const sessoes = [
      sessaoDe({ status: "realizada" }),
      sessaoDe({ status: "realizada" }),
      sessaoDe({ status: "agendada" }),
      sessaoDe({ status: "faltou" }),
      sessaoDe({ status: "cancelada" }),
    ];
    expect(progressoDe(matricula, programa, sessoes).realizadas).toBe(2);
  });
});

describe("progressoDe — regra 3: nunca inventar denominador", () => {
  it("previstas null -> percentual null e rótulo sem 'de X', mesmo com sessões cadastradas", () => {
    const matricula = matriculaDe({ sessoesPrevistas: null });
    const programa = programaDe({ totalSessoes: null });
    const sessoes = [
      sessaoDe({ status: "realizada" }),
      sessaoDe({ status: "realizada" }),
      sessaoDe({ status: "realizada" }),
      sessaoDe({ status: "agendada" }),
      sessaoDe({ status: "agendada" }),
    ];
    const progresso = progressoDe(matricula, programa, sessoes);
    expect(progresso.percentual).toBeNull();
    expect(progresso.realizadas).toBe(3);
    // o total de sessões CADASTRADAS (5) nunca pode vazar para o rótulo
    // como se fosse o pacote contratado.
    expect(progresso.rotulo).toBe("3 sessões realizadas");
    expect(progresso.rotulo).not.toContain("de 5");
  });
});

// BAIXO 8 da auditoria — pacote aberto (previstas null) sempre dizia
// "N sessões realizadas", plural, mesmo com N=1 ("1 sessões realizadas" —
// concordância errada). 0, 1 e 2 são os três casos que decidem plural vs.
// singular em português: zero é plural ("0 sessões"), um é singular
// ("1 sessão"), dois em diante volta a ser plural.
describe("progressoDe — BAIXO 8: concordância de plural em 'N sessões realizadas' (pacote aberto)", () => {
  it("0 sessões realizadas -> plural ('0 sessões realizadas')", () => {
    const matricula = matriculaDe({ sessoesPrevistas: null });
    const programa = programaDe({ totalSessoes: null });
    const progresso = progressoDe(matricula, programa, []);
    expect(progresso.realizadas).toBe(0);
    expect(progresso.rotulo).toBe("0 sessões realizadas");
  });

  it("1 sessão realizada -> SINGULAR ('1 sessão realizada', nunca '1 sessões realizadas')", () => {
    const matricula = matriculaDe({ sessoesPrevistas: null });
    const programa = programaDe({ totalSessoes: null });
    const sessoes = [sessaoDe({ status: "realizada" })];
    const progresso = progressoDe(matricula, programa, sessoes);
    expect(progresso.realizadas).toBe(1);
    expect(progresso.rotulo).toBe("1 sessão realizada");
  });

  it("2 sessões realizadas -> plural de volta ('2 sessões realizadas')", () => {
    const matricula = matriculaDe({ sessoesPrevistas: null });
    const programa = programaDe({ totalSessoes: null });
    const sessoes = [sessaoDe({ status: "realizada" }), sessaoDe({ status: "realizada" })];
    const progresso = progressoDe(matricula, programa, sessoes);
    expect(progresso.realizadas).toBe(2);
    expect(progresso.rotulo).toBe("2 sessões realizadas");
  });
});

describe("progressoDe — regra 4: excedeu (sessões de cortesia)", () => {
  it("realizadas > previstas: percentual trava em 100, excedeu é true, rótulo mostra o número real", () => {
    const matricula = matriculaDe({ sessoesPrevistas: 12 });
    const programa = programaDe({});
    const sessoes = Array.from({ length: 14 }, () => sessaoDe({ status: "realizada" }));
    const progresso = progressoDe(matricula, programa, sessoes);
    expect(progresso.realizadas).toBe(14);
    expect(progresso.previstas).toBe(12);
    expect(progresso.excedeu).toBe(true);
    expect(progresso.percentual).toBe(100);
    expect(progresso.rotulo).toBe("sessão 14 de 12");
  });

  it("realizadas === previstas não é excedeu", () => {
    const matricula = matriculaDe({ sessoesPrevistas: 3 });
    const programa = programaDe({});
    const sessoes = Array.from({ length: 3 }, () => sessaoDe({ status: "realizada" }));
    const progresso = progressoDe(matricula, programa, sessoes);
    expect(progresso.excedeu).toBe(false);
    expect(progresso.percentual).toBe(100);
  });
});

describe("progressoDe — regra 5: percentual inteiro, sem divisão por zero", () => {
  // ATENÇÃO: antes da correção do item BAIXO (sessoesPrevistas <= 0 é dado
  // ruim, ver `previstasValida`), este teste validava "previstas 0 ->
  // percentual 0" — mas "0%" ao lado de sessões JÁ realizadas é a MESMA
  // contradição citada na revisão ("sessão 2 de -5", "0% com 3 sessões além
  // do pacote"): um denominador de zero não é um pacote, é ausência de
  // pacote. O comportamento correto (provado abaixo) é `previstas: null` —
  // dividir por zero nunca chega a acontecer porque `previstasValida`
  // descarta o zero antes da divisão.
  it("previstas 0 -> tratado como pacote aberto (previstas/percentual null), nunca NaN/Infinity, e não lança", () => {
    const matricula = matriculaDe({ sessoesPrevistas: 0 });
    const programa = programaDe({ totalSessoes: null });
    const sessoes = [sessaoDe({ status: "realizada" })];
    const progresso = progressoDe(matricula, programa, sessoes);
    expect(progresso.previstas).toBeNull();
    expect(progresso.percentual).toBeNull();
    expect(Number.isNaN(progresso.percentual)).toBe(false);
  });

  it("percentual é arredondado para inteiro", () => {
    const matricula = matriculaDe({ sessoesPrevistas: 3 });
    const programa = programaDe({});
    const sessoes = [sessaoDe({ status: "realizada" })]; // 1/3 = 33.33...%
    const progresso = progressoDe(matricula, programa, sessoes);
    expect(progresso.percentual).toBe(33);
    expect(Number.isInteger(progresso.percentual)).toBe(true);
  });
});

describe("progressoDe — BAIXO: sessoesPrevistas <= 0 é dado ruim, não pacote fechado de zero", () => {
  it("sessoesPrevistas -5 vira previstas:null, percentual:null, excedeu:false, rótulo sem 'de'", () => {
    const matricula = matriculaDe({ sessoesPrevistas: -5 });
    const programa = programaDe({});
    const sessoes = [sessaoDe({ status: "realizada" }), sessaoDe({ status: "realizada" })];
    const progresso = progressoDe(matricula, programa, sessoes);
    expect(progresso.previstas).toBeNull();
    expect(progresso.percentual).toBeNull();
    expect(progresso.excedeu).toBe(false);
    expect(progresso.realizadas).toBe(2);
    expect(progresso.rotulo).not.toContain(" de ");
    expect(progresso.rotulo).toBe("2 sessões realizadas");
  });

  it("sessoesPrevistas 0 vira previstas:null (zero sessões não é um pacote), mesma coisa", () => {
    const matricula = matriculaDe({ sessoesPrevistas: 0 });
    const programa = programaDe({});
    const sessoes = [sessaoDe({ status: "realizada" }), sessaoDe({ status: "realizada" }), sessaoDe({ status: "realizada" })];
    const progresso = progressoDe(matricula, programa, sessoes);
    expect(progresso.previstas).toBeNull();
    expect(progresso.percentual).toBeNull();
    expect(progresso.excedeu).toBe(false);
    expect(progresso.rotulo).not.toContain(" de ");
  });

  it("previstas negativo/zero é tratado exatamente como ausência: cai para o programa.totalSessoes válido", () => {
    const matricula = matriculaDe({ sessoesPrevistas: -1 });
    const programa = programaDe({ totalSessoes: 8 });
    expect(progressoDe(matricula, programa, []).previstas).toBe(8);
  });

  it("percentual nunca é negativo mesmo com previstas inválido e sessões realizadas", () => {
    const matricula = matriculaDe({ sessoesPrevistas: -5 });
    const sessoes = [sessaoDe({ status: "realizada" })];
    const progresso = progressoDe(matricula, null, sessoes);
    expect(progresso.percentual === null || progresso.percentual >= 0).toBe(true);
  });
});

describe("proximaSessao", () => {
  const agora = "2026-06-15T12:00:00Z";

  it("regra 6: pega a mais próxima no futuro com status agendada, empate resolvido pela mais antiga", () => {
    const maisProxima = sessaoDe({ id: "s-mais-proxima", status: "agendada", quando: "2026-06-16T09:00:00Z" });
    const maisLonge = sessaoDe({ id: "s-mais-longe", status: "agendada", quando: "2026-07-01T09:00:00Z" });
    const sessoes = [maisLonge, maisProxima];
    expect(proximaSessao(sessoes, agora)?.id).toBe("s-mais-proxima");
  });

  it("regra 6: sessão agendada no PASSADO (baixa esquecida) não é a próxima", () => {
    const passadaEsquecida = sessaoDe({ id: "s-passada", status: "agendada", quando: "2026-01-01T09:00:00Z" });
    const futura = sessaoDe({ id: "s-futura", status: "agendada", quando: "2026-06-20T09:00:00Z" });
    const sessoes = [passadaEsquecida, futura];
    expect(proximaSessao(sessoes, agora)?.id).toBe("s-futura");
  });

  it("devolve null quando não há nenhuma sessão agendada futura", () => {
    const sessoes = [
      sessaoDe({ status: "agendada", quando: "2026-01-01T09:00:00Z" }), // passada
      sessaoDe({ status: "realizada", quando: "2026-06-20T09:00:00Z" }), // status errado
    ];
    expect(proximaSessao(sessoes, agora)).toBeNull();
    expect(proximaSessao([], agora)).toBeNull();
  });
});

describe("ultimaSessaoRealizada — regra 7", () => {
  it("pega a mais recente com status realizada, independente da ordem de entrada", () => {
    const antiga = sessaoDe({ id: "s-antiga", status: "realizada", quando: "2026-01-01T09:00:00Z" });
    const recente = sessaoDe({ id: "s-recente", status: "realizada", quando: "2026-05-01T09:00:00Z" });
    const meio = sessaoDe({ id: "s-meio", status: "realizada", quando: "2026-03-01T09:00:00Z" });
    // ordem embaralhada de propósito — a função não pode confiar em ordem de entrada
    const sessoes = [recente, antiga, meio];
    expect(ultimaSessaoRealizada(sessoes)?.id).toBe("s-recente");

    const sessoesOutraOrdem = [antiga, meio, recente];
    expect(ultimaSessaoRealizada(sessoesOutraOrdem)?.id).toBe("s-recente");
  });

  it("ignora sessões que não são realizada", () => {
    const sessoes = [
      sessaoDe({ status: "agendada", quando: "2026-06-01T09:00:00Z" }),
      sessaoDe({ status: "cancelada", quando: "2026-07-01T09:00:00Z" }),
    ];
    expect(ultimaSessaoRealizada(sessoes)).toBeNull();
  });

  it("devolve null para lista vazia", () => {
    expect(ultimaSessaoRealizada([])).toBeNull();
  });
});

describe("regra 8: nenhuma função muta o array recebido", () => {
  it("proximaSessao, ultimaSessaoRealizada e progressoDe funcionam com array congelado (Object.freeze)", () => {
    const sessoes = Object.freeze([
      sessaoDe({ status: "agendada", quando: "2026-06-20T09:00:00Z" }),
      sessaoDe({ status: "realizada", quando: "2026-05-01T09:00:00Z" }),
      sessaoDe({ status: "realizada", quando: "2026-01-01T09:00:00Z" }),
    ]);

    expect(() => proximaSessao(sessoes, "2026-06-15T12:00:00Z")).not.toThrow();
    expect(() => ultimaSessaoRealizada(sessoes)).not.toThrow();
    expect(() =>
      progressoDe(matriculaDe({ sessoesPrevistas: 5 }), programaDe({}), sessoes),
    ).not.toThrow();
    expect(() => diasDesdeUltimaSessao(sessoes, "2026-06-15T12:00:00Z")).not.toThrow();

    // se alguma função tivesse feito `.sort()` direto no array recebido, o
    // freeze faria isso lançar TypeError antes mesmo de chegar aqui — o
    // ponto do teste é este bloco todo ter passado sem exceção.
    expect(sessoes.length).toBe(3);
  });
});

describe("regra 9: agoraIso é sempre parâmetro (documentado no código)", () => {
  it("o mesmo agoraIso sempre produz o mesmo resultado, chamando duas vezes seguidas", () => {
    const sessoes = [sessaoDe({ status: "agendada", quando: "2026-06-20T09:00:00Z" })];
    const r1 = proximaSessao(sessoes, "2026-06-15T12:00:00Z");
    const r2 = proximaSessao(sessoes, "2026-06-15T12:00:00Z");
    expect(r1?.quando).toBe(r2?.quando);
  });
});

describe("regra 10: data inválida ou vazia em sessao.quando não derruba nada", () => {
  const sessoesComDataRuim = [
    sessaoDe({ status: "agendada", quando: "" }),
    sessaoDe({ status: "agendada", quando: "não é data" }),
    sessaoDe({ status: "realizada", quando: "" }),
    sessaoDe({ status: "realizada", quando: "não é data" }),
  ];

  it("proximaSessao ignora as sessões com data inválida e não lança", () => {
    expect(() => proximaSessao(sessoesComDataRuim, "2026-06-15T12:00:00Z")).not.toThrow();
    expect(proximaSessao(sessoesComDataRuim, "2026-06-15T12:00:00Z")).toBeNull();
  });

  it("ultimaSessaoRealizada ignora as sessões com data inválida e não lança", () => {
    expect(() => ultimaSessaoRealizada(sessoesComDataRuim)).not.toThrow();
    expect(ultimaSessaoRealizada(sessoesComDataRuim)).toBeNull();
  });

  it("diasDesdeUltimaSessao não lança e devolve null quando não há última sessão válida", () => {
    expect(() => diasDesdeUltimaSessao(sessoesComDataRuim, "2026-06-15T12:00:00Z")).not.toThrow();
    expect(diasDesdeUltimaSessao(sessoesComDataRuim, "2026-06-15T12:00:00Z")).toBeNull();
  });

  it("uma lista mista (data ruim + data boa) ainda encontra a sessão válida", () => {
    const sessoes = [
      sessaoDe({ status: "realizada", quando: "" }),
      sessaoDe({ status: "realizada", quando: "não é data", id: "s-invalida" }),
      sessaoDe({ status: "realizada", quando: "2026-03-01T09:00:00Z", id: "s-valida" }),
    ];
    expect(ultimaSessaoRealizada(sessoes)?.id).toBe("s-valida");
  });
});

describe("diasDesdeUltimaSessao", () => {
  it("calcula os dias corridos entre a última sessão realizada e agoraIso", () => {
    const sessoes = [sessaoDe({ status: "realizada", quando: "2026-06-01T12:00:00Z" })];
    expect(diasDesdeUltimaSessao(sessoes, "2026-06-15T12:00:00Z")).toBe(14);
  });

  it("devolve null quando não há nenhuma sessão realizada", () => {
    const sessoes = [sessaoDe({ status: "agendada", quando: "2026-06-01T12:00:00Z" })];
    expect(diasDesdeUltimaSessao(sessoes, "2026-06-15T12:00:00Z")).toBeNull();
  });

  it("devolve null para lista vazia", () => {
    expect(diasDesdeUltimaSessao([], "2026-06-15T12:00:00Z")).toBeNull();
  });
});

describe("diasEmSilencio — BAIXO: quem NUNCA teve sessão nunca disparava o alerta de silêncio", () => {
  const agora = "2026-06-15T12:00:00Z";

  it("sem nenhuma sessão realizada, matrícula iniciada há 90 dias -> { dias: 90, nunca: true }", () => {
    // `inicio` é `date` (meia-noite ao ser parseado) — comparado contra um
    // "agora" também em meia-noite, para o intervalo dar um número exato de
    // dias sem depender de arredondamento de meio-dia.
    const agoraMeiaNoite = "2026-06-15T00:00:00Z";
    const matricula = matriculaDe({ inicio: "2026-03-17" }); // 90 dias antes de 2026-06-15
    const sessoes = [sessaoDe({ status: "agendada", quando: "2026-06-20T09:00:00Z" })];
    expect(diasEmSilencio(matricula, sessoes, agoraMeiaNoite)).toEqual({ dias: 90, nunca: true });
  });

  it("com sessão realizada há 5 dias -> { dias: 5, nunca: false }, independente de quando a matrícula começou", () => {
    const matricula = matriculaDe({ inicio: "2020-01-01" }); // bem antigo — não pode vazar para o resultado
    const sessoes = [sessaoDe({ status: "realizada", quando: "2026-06-10T12:00:00Z" })];
    expect(diasEmSilencio(matricula, sessoes, agora)).toEqual({ dias: 5, nunca: false });
  });

  it("nunca teve sessão e matricula.inicio é inválido -> null, nunca lança", () => {
    const matricula = matriculaDe({ inicio: "não é data" });
    expect(() => diasEmSilencio(matricula, [], agora)).not.toThrow();
    expect(diasEmSilencio(matricula, [], agora)).toBeNull();
  });

  it("agoraIso inválido -> null, nunca lança (mesma cautela de diasDesdeUltimaSessao)", () => {
    const matricula = matriculaDe({ inicio: "2026-01-01" });
    expect(() => diasEmSilencio(matricula, [], "não é data")).not.toThrow();
    expect(diasEmSilencio(matricula, [], "não é data")).toBeNull();
  });

  it("não muta o array de sessões recebido (array congelado não lança)", () => {
    const matricula = matriculaDe({ inicio: "2026-01-01" });
    const sessoes = Object.freeze([sessaoDe({ status: "realizada", quando: "2026-06-10T12:00:00Z" })]);
    expect(() => diasEmSilencio(matricula, sessoes, agora)).not.toThrow();
  });
});
