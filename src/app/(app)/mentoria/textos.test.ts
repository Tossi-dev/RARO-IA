// Testes de `textos.ts` — a parte de FORMATAÇÃO da tela de mentoria (a que
// não depende de React, então roda em vitest puro, sem montar componente
// nenhum). MÉTODO TDD: este arquivo nasceu antes de `textos.ts` — cada bloco
// abaixo descreve o comportamento esperado, foi rodado falhando, e só depois
// ganhou implementação.

import { describe, expect, it } from "vitest";
import type { ScoreEvolucao } from "@/lib/mentoria/tipos";
import type { LinhaCarteira } from "@/lib/mentoria/dados";
import {
  contarMentoradosDistintos,
  dataBr,
  dataHoraBr,
  hrefSeguro,
  rotuloAlertaCarteira,
  rotuloContagemMentorados,
  rotuloProximaSessao,
  rotuloTempoSemSessao,
  variacaoScore,
} from "./textos";

function scoreDe(parcial: Partial<ScoreEvolucao>): ScoreEvolucao {
  return {
    id: `score-${Math.random()}`,
    workspaceId: "ws-1",
    mentoradoId: "mentorado-1",
    semana: "2026-01-01",
    score: 50,
    motivo: "",
    criadoEm: "2026-01-01T00:00:00Z",
    ...parcial,
  };
}

// ============================================================
// dataHoraBr
// ============================================================

describe("dataHoraBr", () => {
  it("entrada vazia, inválida ou null não lança — devolve string vazia", () => {
    expect(dataHoraBr("")).toBe("");
    expect(dataHoraBr("não é data")).toBe("");
    expect(() => dataHoraBr(null as unknown as string)).not.toThrow();
    expect(dataHoraBr(null as unknown as string)).toBe("");
    expect(() => dataHoraBr(undefined as unknown as string)).not.toThrow();
    expect(dataHoraBr(undefined as unknown as string)).toBe("");
  });

  it("formata um ISO conhecido em pt-BR, fuso fixo America/Sao_Paulo", () => {
    // meio-dia UTC de um dia qualquer -> 09:00 em São Paulo (UTC-3), mesmo dia
    expect(dataHoraBr("2026-08-12T12:00:00Z")).toBe("12/08/2026 às 09:00");
  });

  it("horário que muda de DIA quando convertido para America/Sao_Paulo — prova que o fuso está fixo na implementação, não no relógio de quem roda o teste", () => {
    // 02:00 UTC de 13/08 - 3h = 23:00 de 12/08 em São Paulo
    expect(dataHoraBr("2026-08-13T02:00:00Z")).toBe("12/08/2026 às 23:00");
  });
});

// ============================================================
// rotuloProximaSessao
// ============================================================

describe("rotuloProximaSessao", () => {
  const agora = "2026-08-12T12:00:00Z";

  it("sem sessão marcada (quandoIso null) -> texto fixo", () => {
    expect(rotuloProximaSessao(null, agora)).toBe("sem sessão marcada");
  });

  it("com data válida -> data e hora legíveis em pt-BR", () => {
    expect(rotuloProximaSessao("2026-08-20T15:30:00Z", agora)).toContain("20/08/2026");
  });

  it("data inválida se comporta como 'sem sessão marcada' — nunca mostra lixo na tela", () => {
    expect(rotuloProximaSessao("não é data", agora)).toBe("sem sessão marcada");
  });
});

// ============================================================
// rotuloTempoSemSessao
// ============================================================

describe("rotuloTempoSemSessao", () => {
  it("null -> vazio (sem última sessão realizada, nada a alertar)", () => {
    expect(rotuloTempoSemSessao(null)).toBe("");
  });

  it("3 e 14 dias -> vazio: não alarma cedo demais", () => {
    expect(rotuloTempoSemSessao(3)).toBe("");
    expect(rotuloTempoSemSessao(14)).toBe("");
  });

  it("15 e 60 dias -> texto de alerta, com o número certo", () => {
    expect(rotuloTempoSemSessao(15)).not.toBe("");
    expect(rotuloTempoSemSessao(15)).toContain("15");
    expect(rotuloTempoSemSessao(60)).not.toBe("");
    expect(rotuloTempoSemSessao(60)).toContain("60");
  });
});

// ============================================================
// variacaoScore
// ============================================================

describe("variacaoScore", () => {
  it("lista vazia -> null", () => {
    expect(variacaoScore([])).toBeNull();
  });

  // ESTE É O TESTE MAIS IMPORTANTE DO ARQUIVO: com um único ponto de score,
  // não existe "variação" nenhuma — variação é a diferença entre DOIS
  // pontos. Uma medição sozinha não é uma série; inventar tendência (subiu,
  // caiu, estável) a partir dela seria exatamente o tipo de número falso que
  // este projeto não aceita (a mesma razão pela qual `progressoDe` nunca
  // inventa denominador e `lerCarteira` nunca inventa linha de demonstração).
  // Por isso a única resposta honesta aqui é `null` — "não há o que mostrar
  // ainda", não um glifo de tendência inventado.
  it("um único ponto -> null (uma medição não é uma série, não inventa tendência)", () => {
    expect(variacaoScore([scoreDe({ score: 70 })])).toBeNull();
  });

  it("subida entre o primeiro e o último -> ▲ com o valor certo", () => {
    const r = variacaoScore([scoreDe({ score: 50 }), scoreDe({ score: 62 })]);
    expect(r).toEqual({ glifo: "▲", valor: 12, texto: "▲ 12" });
  });

  it("descida entre o primeiro e o último -> ▼ com o valor certo", () => {
    const r = variacaoScore([scoreDe({ score: 70 }), scoreDe({ score: 62 })]);
    expect(r).toEqual({ glifo: "▼", valor: 8, texto: "▼ 8" });
  });

  it("empate entre o primeiro e o último -> ▬ com valor 0", () => {
    const r = variacaoScore([scoreDe({ score: 55 }), scoreDe({ score: 55 })]);
    expect(r).toEqual({ glifo: "▬", valor: 0, texto: "▬ 0" });
  });

  it("com mais de dois pontos, olha só o primeiro e o último — o meio não entra na conta", () => {
    const r = variacaoScore([scoreDe({ score: 50 }), scoreDe({ score: 90 }), scoreDe({ score: 55 })]);
    expect(r).toEqual({ glifo: "▲", valor: 5, texto: "▲ 5" });
  });
});

// ============================================================
// hrefSeguro — ALTO 1: `sessao.linkGravacao` vira `<a href>` cru na ficha do
// mentorado. `linkGravacaoValido` (validacao.ts) só roda na ESCRITA; uma
// linha inserida por fora dessa validação (Studio, script, dado anterior à
// regra) chega intacta na LEITURA. `hrefSeguro` é o portão do lado da
// leitura — reaproveita `linkGravacaoValido` (mesma regra, não duplicada)
// mas devolve "" (nunca um booleano) para a tela decidir entre desenhar o
// `<a>` ou avisar que o link é inválido, sem nunca renderizar o valor cru.
// ============================================================

describe("hrefSeguro", () => {
  it.each([
    ["javascript:alert(1)", "esquema javascript: puro"],
    ["JaVaScRiPt:alert(1)", "esquema javascript: com caixa mista — new URL normaliza o esquema, não pode vazar por isso"],
    ["java\tscript:alert(1)", "tab quebrando o esquema — o parser de URL remove caracteres de controle, o esquema resultante ainda é javascript:"],
    [" javascript:alert(1)", "espaço na frente, mesmo ataque"],
    ["data:text/html;base64,x", "esquema data: (poderia embutir HTML/script)"],
    ["vbscript:msgbox(1)", "esquema vbscript: (IE legado, mesma família de ataque)"],
    ["//evil.com", "protocol-relative — herdaria o esquema da própria página"],
    ["", "vazio — não há link nenhum para desenhar"],
  ])("%s -> string vazia (%s)", (valor) => {
    expect(hrefSeguro(valor)).toBe("");
  });

  it("null e undefined não lançam — devolvem string vazia", () => {
    expect(() => hrefSeguro(null)).not.toThrow();
    expect(hrefSeguro(null)).toBe("");
    expect(() => hrefSeguro(undefined)).not.toThrow();
    expect(hrefSeguro(undefined)).toBe("");
  });

  it("http:// e https:// absolutos são preservados, sem normalizar caixa ou caminho", () => {
    expect(hrefSeguro("https://x.com/a")).toBe("https://x.com/a");
    expect(hrefSeguro("HTTP://X.COM")).toBe("HTTP://X.COM");
  });
});

// ============================================================
// dataBr — MÉDIO 2: `tarefa_mentoria.prazo`, `marco.conquistado_em` e
// `score_evolucao.semana` são colunas `date` (sem hora, sem fuso) no
// Postgres. Passar essas strings por `dataHoraBr` (que usa `new Date(iso)`
// e depois converte para America/Sao_Paulo) volta um dia — meia-noite UTC
// de "2026-01-01" é 21h de 31/12/2025 em São Paulo. `dataBr` nunca cria um
// `Date`: lê os três números do formato `AAAA-MM-DD` na marra e formata.
// ============================================================

describe("dataBr", () => {
  it("formata AAAA-MM-DD como data civil, sem NENHUMA conversão de fuso", () => {
    expect(dataBr("2026-01-01")).toBe("01/01/2026");
    expect(dataBr("2026-08-20")).toBe("20/08/2026");
  });

  it("vazio, null, undefined ou texto que não é data -> string vazia, nunca lança", () => {
    expect(dataBr("")).toBe("");
    expect(dataBr(null)).toBe("");
    expect(dataBr(undefined)).toBe("");
    expect(dataBr("não é data")).toBe("");
    expect(() => dataBr(null)).not.toThrow();
  });

  it("independe do fuso do processo — mesmo resultado com TZ=Asia/Tokyo e TZ=UTC (a função não usa Date)", () => {
    const original = process.env.TZ;
    try {
      process.env.TZ = "Asia/Tokyo";
      const tokyo = dataBr("2026-01-01");
      process.env.TZ = "UTC";
      const utc = dataBr("2026-01-01");
      expect(tokyo).toBe(utc);
      expect(tokyo).toBe("01/01/2026");
    } finally {
      process.env.TZ = original;
    }
  });
});

// ============================================================
// rotuloAlertaCarteira — BAIXO: quem NUNCA teve sessão (`diasEmSilencio`
// devolvendo `{ nunca: true }`) hoje nunca dispara o alerta dourado, mesmo
// matriculado há meses — o maior risco de churn do produto ficando
// invisível. `rotuloAlertaCarteira` recebe direto o resultado de
// `diasEmSilencio` (progresso.ts) e junta as duas causas do mesmo alerta
// (silêncio prolongado OU nunca começou) sem confundir os dois textos.
// ============================================================

describe("rotuloAlertaCarteira", () => {
  it("já teve sessão (nunca: false): mesmo texto de rotuloTempoSemSessao, sem mudança", () => {
    expect(rotuloAlertaCarteira({ dias: 3, nunca: false })).toBe("");
    expect(rotuloAlertaCarteira({ dias: 14, nunca: false })).toBe("");
    expect(rotuloAlertaCarteira({ dias: 20, nunca: false })).toBe(rotuloTempoSemSessao(20));
  });

  it("nunca teve sessão e exatamente 14 dias desde o início -> sem alerta (limite)", () => {
    expect(rotuloAlertaCarteira({ dias: 14, nunca: true })).toBe("");
  });

  it("nunca teve sessão e 15 dias desde o início -> alerta, com o número certo e o texto 'ainda sem a primeira sessão' (nunca 'há N dias sem sessão', que sugere que houve alguma)", () => {
    const r = rotuloAlertaCarteira({ dias: 15, nunca: true });
    expect(r).toContain("15");
    expect(r).toContain("ainda sem a primeira sessão");
    expect(r).not.toContain("há 15 dias sem sessão");
  });

  it("silencio null (sem sessão e início inválido, ou agora inválido) -> sem alerta, nunca lança", () => {
    expect(rotuloAlertaCarteira(null)).toBe("");
  });
});

// ============================================================
// contarMentoradosDistintos / rotuloContagemMentorados — MÉDIO: "Mentorados
// em programa (N)" contava MATRÍCULAS, não pessoas. Uma mentorada com
// pacote concluído + renovação (o caso normal) aparecia contada duas vezes.
// ============================================================

function mentoradoDe(id: string, nome: string) {
  return {
    id,
    workspaceId: "ws-1",
    alunoId: null,
    perfilId: null,
    nome,
    telefone: "",
    email: "",
    origem: "",
    status: "ativo" as const,
    criadoEm: "2026-01-01T00:00:00Z",
  };
}

function matriculaDe(id: string, mentoradoId: string) {
  return {
    id,
    workspaceId: "ws-1",
    mentoradoId,
    programaId: "prog-1",
    turmaId: null,
    inicio: "2026-01-01",
    fimPrevisto: null,
    status: "ativa" as const,
    sessoesPrevistas: null,
    criadoEm: "2026-01-01T00:00:00Z",
  };
}

function linhaCarteiraDe(id: string, mentoradoId: string, nome: string): LinhaCarteira {
  return {
    mentorado: mentoradoDe(mentoradoId, nome),
    matricula: matriculaDe(id, mentoradoId),
    programa: null,
    progresso: { realizadas: 0, previstas: null, rotulo: "0 sessões realizadas", percentual: null, excedeu: false },
    proxima: null,
    ultimaRealizada: null,
    silencio: null,
  };
}

describe("contarMentoradosDistintos", () => {
  it("uma mentorada com duas matrículas conta como UMA pessoa, não duas", () => {
    const linhas: LinhaCarteira[] = [
      linhaCarteiraDe("mat-1", "ment-ana", "Ana (pacote concluído)"),
      linhaCarteiraDe("mat-2", "ment-ana", "Ana (renovação)"),
      linhaCarteiraDe("mat-3", "ment-bruno", "Bruno"),
    ];
    expect(contarMentoradosDistintos(linhas)).toBe(2);
  });

  it("lista vazia -> 0", () => {
    expect(contarMentoradosDistintos([])).toBe(0);
  });
});

describe("rotuloContagemMentorados", () => {
  it("uma pessoa com duas matrículas -> '1 mentorado · 2 matrículas' (os dois números, nunca um só escondendo o outro)", () => {
    const linhas: LinhaCarteira[] = [
      linhaCarteiraDe("mat-1", "ment-ana", "Ana (pacote concluído)"),
      linhaCarteiraDe("mat-2", "ment-ana", "Ana (renovação)"),
    ];
    expect(rotuloContagemMentorados(linhas)).toBe("1 mentorado · 2 matrículas");
  });

  it("três pessoas com uma matrícula cada -> '3 mentorados', sem repetir o número (matrículas === mentorados)", () => {
    const linhas: LinhaCarteira[] = [
      linhaCarteiraDe("mat-1", "ment-ana", "Ana"),
      linhaCarteiraDe("mat-2", "ment-bruno", "Bruno"),
      linhaCarteiraDe("mat-3", "ment-carla", "Carla"),
    ];
    expect(rotuloContagemMentorados(linhas)).toBe("3 mentorados");
  });

  it("lista vazia -> string vazia, nunca '0 mentorados'", () => {
    expect(rotuloContagemMentorados([])).toBe("");
  });
});

// ============================================================
// Zero emoji — regra de estilo da casa. Percorre uma amostra de saídas de
// TODAS as funções do módulo e falha se algum caractere estiver fora da
// faixa latina (Básico + Latin-1 Supplement, onde vivem "ã", "ç", "õ" etc.)
// e fora dos três glifos permitidos (▲ ▼ ▬).
// ============================================================

describe("zero emoji em todo o módulo", () => {
  const GLIFOS_PERMITIDOS = new Set(["▲", "▼", "▬"].map((c) => c.codePointAt(0)));
  /** Latin Extended-A/B inclusos (até 0x24F) como margem de segurança para
   *  qualquer acentuação futura — nenhum emoji conhecido vive abaixo disso. */
  const LIMITE_FAIXA_LATINA = 0x250;

  function semEmoji(texto: string): boolean {
    for (const char of texto) {
      const codigo = char.codePointAt(0) ?? 0;
      if (codigo < LIMITE_FAIXA_LATINA) continue;
      if (GLIFOS_PERMITIDOS.has(codigo)) continue;
      return false;
    }
    return true;
  }

  const amostras: string[] = [
    dataHoraBr(""),
    dataHoraBr("não é data"),
    dataHoraBr("2026-08-12T12:00:00Z"),
    rotuloProximaSessao(null, "2026-08-12T12:00:00Z"),
    rotuloProximaSessao("2026-08-20T15:30:00Z", "2026-08-12T12:00:00Z"),
    rotuloTempoSemSessao(null),
    rotuloTempoSemSessao(3),
    rotuloTempoSemSessao(15),
    rotuloTempoSemSessao(60),
    variacaoScore([scoreDe({ score: 50 }), scoreDe({ score: 62 })])?.texto ?? "",
    variacaoScore([scoreDe({ score: 70 }), scoreDe({ score: 62 })])?.texto ?? "",
    variacaoScore([scoreDe({ score: 55 }), scoreDe({ score: 55 })])?.texto ?? "",
  ];

  it("nenhuma amostra tem caractere fora da faixa latina + glifos ▲ ▼ ▬", () => {
    for (const texto of amostras) {
      expect(semEmoji(texto)).toBe(true);
    }
  });
});
