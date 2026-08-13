// Testes de `textos.ts` do Portal do Mentorado — módulo PURO, mesmo espírito
// de `src/app/(app)/mentoria/textos.test.ts`. MÉTODO TDD: este arquivo nasceu
// ANTES de `textos.ts` — cada bloco abaixo descreve o comportamento esperado,
// rodou falhando (módulo inexistente), e só depois ganhou implementação.

import { describe, expect, it } from "vitest";
import {
  dataHoraPorExtenso,
  diasAte,
  mensagemDeErro,
  programaAtual,
  saudacao,
  tomDoPrazo,
} from "./textos";

// ============================================================
// saudacao — só o primeiro nome, nunca o sobrenome, nunca lança.
// ============================================================

describe("saudacao", () => {
  it("nome completo -> só o primeiro nome", () => {
    expect(saudacao("Ana Souza")).toBe("Ana");
    expect(saudacao("João Pedro de Almeida")).toBe("João");
  });

  it("nome com espaços nas pontas e entre palavras -> mesmo resultado", () => {
    expect(saudacao("   Ana    Souza  ")).toBe("Ana");
  });

  it("um nome só (sem sobrenome) -> ele mesmo", () => {
    expect(saudacao("Ana")).toBe("Ana");
  });

  it("vazio, só espaço, null ou undefined -> string vazia, nunca lança", () => {
    expect(saudacao("")).toBe("");
    expect(saudacao("   ")).toBe("");
    expect(() => saudacao(null as unknown as string)).not.toThrow();
    expect(saudacao(null as unknown as string)).toBe("");
    expect(() => saudacao(undefined as unknown as string)).not.toThrow();
    expect(saudacao(undefined as unknown as string)).toBe("");
  });
});

// ============================================================
// diasAte — "hoje"/"amanhã"/"em N dias"/"" para inválido. Calendário do
// FUSO do Brasil, não diferença bruta de milissegundos: 23h de hoje até 1h de
// amanhã (fuso BR) são dias civis DIFERENTES mesmo separados por só 2h.
// ============================================================

describe("diasAte", () => {
  it("mesmo dia civil (fuso BR) -> 'hoje', mesmo com horas de diferença", () => {
    // 09:00 BR até 20:00 BR do mesmo dia (ambos em UTC = BR+3h)
    expect(diasAte("2026-08-13T23:00:00Z", "2026-08-13T12:00:00Z")).toBe("hoje");
  });

  it("dia civil seguinte (fuso BR) -> 'amanhã'", () => {
    expect(diasAte("2026-08-14T14:00:00Z", "2026-08-13T12:00:00Z")).toBe("amanhã");
  });

  it("virada de meia-noite BR: 02:00 UTC de amanhã é 23:00 BR de HOJE -> 'hoje', não 'amanhã'", () => {
    // 2026-08-14T02:00:00Z -3h = 2026-08-13T23:00 em São Paulo: mesmo dia civil de agora.
    expect(diasAte("2026-08-14T02:00:00Z", "2026-08-13T12:00:00Z")).toBe("hoje");
  });

  it("vários dias à frente -> 'em N dias'", () => {
    expect(diasAte("2026-08-20T10:00:00Z", "2026-08-13T12:00:00Z")).toBe("em 7 dias");
  });

  it("data inválida, vazia ou no passado -> string vazia, nunca lança", () => {
    expect(diasAte("", "2026-08-13T12:00:00Z")).toBe("");
    expect(diasAte("não é data", "2026-08-13T12:00:00Z")).toBe("");
    expect(diasAte("2026-08-13T12:00:00Z", "não é data")).toBe("");
    expect(diasAte("2026-08-01T12:00:00Z", "2026-08-13T12:00:00Z")).toBe("");
    expect(() => diasAte(null as unknown as string, "2026-08-13T12:00:00Z")).not.toThrow();
  });
});

// ============================================================
// tomDoPrazo — "vencido"|"proximo"|"neutro"|"sem prazo".
// ============================================================

describe("tomDoPrazo", () => {
  const agora = "2026-08-13T12:00:00Z"; // hoje = 13/08 no fuso BR

  it("sem prazo (null ou vazio) -> 'sem prazo'", () => {
    expect(tomDoPrazo(null, agora)).toBe("sem prazo");
    expect(tomDoPrazo("", agora)).toBe("sem prazo");
  });

  it("prazo antes de hoje -> 'vencido'", () => {
    expect(tomDoPrazo("2026-08-12", agora)).toBe("vencido");
    expect(tomDoPrazo("2026-01-01", agora)).toBe("vencido");
  });

  it("prazo hoje, amanhã, ou dentro do limiar de dias próximos -> 'proximo'", () => {
    expect(tomDoPrazo("2026-08-13", agora)).toBe("proximo");
    expect(tomDoPrazo("2026-08-14", agora)).toBe("proximo");
    expect(tomDoPrazo("2026-08-16", agora)).toBe("proximo");
  });

  it("prazo bem à frente -> 'neutro'", () => {
    expect(tomDoPrazo("2026-09-01", agora)).toBe("neutro");
  });

  it("prazo mal formado (não é data civil AAAA-MM-DD) -> 'neutro', nunca lança", () => {
    expect(() => tomDoPrazo("não é data", agora)).not.toThrow();
    expect(tomDoPrazo("não é data", agora)).toBe("neutro");
  });

  it("não usa `new Date()` no prazo — independe do fuso do processo (mesma cautela de dataBr em mentoria/textos.ts)", () => {
    const original = process.env.TZ;
    try {
      process.env.TZ = "Asia/Tokyo";
      const tokyo = tomDoPrazo("2026-08-12", agora);
      process.env.TZ = "UTC";
      const utc = tomDoPrazo("2026-08-12", agora);
      expect(tokyo).toBe(utc);
    } finally {
      process.env.TZ = original;
    }
  });

  // Defeito visual 1 (fotos/portal.png) — uma tarefa CONCLUÍDA aparecia com
  // o prazo em vermelho de "vencido", como se o cliente ainda devesse algo
  // que ele já entregou. `concluida: true` tem que zerar o alarme, seja
  // qual for o prazo — inclusive um prazo no passado.
  describe("tarefa concluída -> sempre 'neutro', seja qual for o prazo (nunca regride para 'vencido')", () => {
    it("concluída com prazo no passado -> 'neutro' (não 'vencido')", () => {
      expect(tomDoPrazo("2026-08-05", agora, true)).toBe("neutro");
    });

    it("concluída com prazo no futuro -> 'neutro' (não 'proximo')", () => {
      expect(tomDoPrazo("2026-08-14", agora, true)).toBe("neutro");
    });

    it("NÃO concluída com prazo no passado -> continua 'vencido' (o comportamento de hoje não regride)", () => {
      expect(tomDoPrazo("2026-08-05", agora, false)).toBe("vencido");
      // `concluida` some sozinha (padrão `false`) — chamador antigo sem o
      // terceiro argumento continua vendo o mesmo resultado de sempre.
      expect(tomDoPrazo("2026-08-05", agora)).toBe("vencido");
    });
  });
});

// ============================================================
// dataHoraPorExtenso — data e hora por extenso, em pt-BR, fuso fixo.
// ============================================================

describe("dataHoraPorExtenso", () => {
  it("formata por extenso, fuso America/Sao_Paulo", () => {
    expect(dataHoraPorExtenso("2026-08-20T15:30:00Z")).toBe(
      "quinta-feira, 20 de agosto de 2026 às 12:30"
    );
  });

  it("vazio, inválido, null ou undefined -> string vazia, nunca lança", () => {
    expect(dataHoraPorExtenso("")).toBe("");
    expect(dataHoraPorExtenso("não é data")).toBe("");
    expect(() => dataHoraPorExtenso(null as unknown as string)).not.toThrow();
    expect(dataHoraPorExtenso(null as unknown as string)).toBe("");
  });
});

// ============================================================
// programaAtual — o programa da matrícula ativa (ou da primeira, sem
// nenhuma ativa) para a saudação. Lista vazia -> "".
// ============================================================

/** Fixture reaproveitada por `programaAtual` e pela suíte de zero-emoji abaixo. */
function itemMatricula(
  status: "ativa" | "concluida" | "cancelada" | "trancada",
  nomePrograma: string | null
) {
  return {
    matricula: {
      id: "mat-1",
      workspaceId: "ws-1",
      mentoradoId: "ment-1",
      programaId: "prog-1",
      turmaId: null,
      inicio: "2026-01-01",
      fimPrevisto: null,
      status,
      sessoesPrevistas: null,
      criadoEm: "2026-01-01T00:00:00Z",
    },
    programa: nomePrograma
      ? {
          id: "prog-1",
          workspaceId: "ws-1",
          nome: nomePrograma,
          formato: "individual" as const,
          totalSessoes: null,
          preco: 0,
          ativo: true,
          criadoEm: "2026-01-01T00:00:00Z",
        }
      : null,
  };
}

describe("programaAtual", () => {
  const item = itemMatricula;

  it("lista vazia -> string vazia", () => {
    expect(programaAtual([])).toBe("");
  });

  it("uma matrícula só -> o nome do programa dela", () => {
    expect(programaAtual([item("ativa", "Elite")])).toBe("Elite");
  });

  it("mais de uma matrícula: prioriza a ATIVA, mesmo que não seja a primeira da lista", () => {
    expect(programaAtual([item("concluida", "Fundamentos"), item("ativa", "Elite")])).toBe("Elite");
  });

  it("nenhuma ativa -> a primeira da lista", () => {
    expect(programaAtual([item("concluida", "Fundamentos"), item("cancelada", "Elite")])).toBe(
      "Fundamentos"
    );
  });

  it("matrícula sem programa vinculado -> string vazia (nunca inventa nome)", () => {
    expect(programaAtual([item("ativa", null)])).toBe("");
  });
});

// ============================================================
// mensagemDeErro — MÉDIO 5 da auditoria: `?erro=` NUNCA pode ser
// renderizado literalmente (era `searchParams.erro` direto no banner da
// tela, um convite para qualquer link com `?erro=<texto de ataque>`
// aparecer dentro do produto). `acoes-portal.ts` só manda um CÓDIGO curto
// ("tarefa"); esta função é a ÚNICA que traduz código em frase — código
// desconhecido (ou um texto arbitrário de ataque, já que a URL é
// controlada por quem monta o link, não pelo servidor) cai numa frase
// genérica, nunca ecoa o que veio na querystring.
// ============================================================

describe("mensagemDeErro", () => {
  it("sem código (undefined) -> null, a tela não mostra banner nenhum", () => {
    expect(mensagemDeErro(undefined)).toBeNull();
  });

  it("código conhecido ('tarefa') -> a frase certa, nunca a palavra 'tarefa' pura", () => {
    const msg = mensagemDeErro("tarefa");
    expect(msg).not.toBeNull();
    expect(msg).not.toBe("tarefa");
    expect((msg ?? "").length).toBeGreaterThan("tarefa".length);
  });

  it("código inventado, não cadastrado na tabela -> frase genérica, não o código cru", () => {
    const msg = mensagemDeErro("codigo-que-nao-existe-e2e-9x");
    expect(msg).not.toBeNull();
    expect(msg).not.toContain("codigo-que-nao-existe-e2e-9x");
  });

  it("texto de ataque no lugar do código -> NUNCA aparece na mensagem devolvida", () => {
    const ataque = "Sua conta foi suspensa, ligue para 0800-000-0000 agora";
    const msg = mensagemDeErro(ataque);
    expect(msg).not.toBeNull();
    expect(msg).not.toContain(ataque);
    expect(msg).not.toContain("0800");
    expect(msg).not.toContain("suspensa");
  });

  it("string vazia -> tratada como 'sem código', null (mesma cautela de código ausente)", () => {
    expect(mensagemDeErro("")).toBeNull();
  });
});

// ============================================================
// Zero emoji, zero nome de papel — regra de estilo da casa.
// ============================================================

describe("zero emoji e zero nome de papel em todo o módulo", () => {
  const GLIFOS_PERMITIDOS = new Set(["▲", "▼", "▬"].map((c) => c.codePointAt(0)));
  const LIMITE_FAIXA_LATINA = 0x250;
  const NOMES_DE_PAPEL = ["dono", "gestor", "comercial", "mentorado", "afiliado", "aluno"];

  function semEmoji(texto: string): boolean {
    for (const char of texto) {
      const codigo = char.codePointAt(0) ?? 0;
      if (codigo < LIMITE_FAIXA_LATINA) continue;
      if (GLIFOS_PERMITIDOS.has(codigo)) continue;
      return false;
    }
    return true;
  }

  function semNomeDePapel(texto: string): boolean {
    const minusculo = texto.toLowerCase();
    return NOMES_DE_PAPEL.every((papel) => !minusculo.includes(papel));
  }

  const amostras: string[] = [
    saudacao("Ana Souza"),
    saudacao(""),
    diasAte("2026-08-13T23:00:00Z", "2026-08-13T12:00:00Z"),
    diasAte("2026-08-14T14:00:00Z", "2026-08-13T12:00:00Z"),
    diasAte("2026-08-20T10:00:00Z", "2026-08-13T12:00:00Z"),
    tomDoPrazo(null, "2026-08-13T12:00:00Z"),
    tomDoPrazo("2026-08-12", "2026-08-13T12:00:00Z"),
    tomDoPrazo("2026-08-13", "2026-08-13T12:00:00Z"),
    tomDoPrazo("2026-09-01", "2026-08-13T12:00:00Z"),
    dataHoraPorExtenso("2026-08-20T15:30:00Z"),
    programaAtual([itemMatricula("ativa", "Elite")]),
    mensagemDeErro("tarefa") ?? "",
    mensagemDeErro("codigo-desconhecido") ?? "",
  ];

  it("nenhuma amostra tem emoji ou nome de papel", () => {
    for (const texto of amostras) {
      expect(semEmoji(texto)).toBe(true);
      expect(semNomeDePapel(texto)).toBe(true);
    }
  });
});
