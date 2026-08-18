import { describe, expect, it } from "vitest";
import { eventoDaSessao } from "./calendario";
import type { Mentorado, Programa, Sessao } from "./tipos";

// ---------- fixtures mínimas (mesmo padrão de progresso.test.ts) ----------

function mentoradoDe(parcial: Partial<Mentorado>): Mentorado {
  return {
    id: "mentorado-1",
    workspaceId: "ws-1",
    alunoId: null,
    perfilId: null,
    nome: "Maria Fernandes",
    telefone: "11987654321",
    email: "maria@exemplo.com",
    origem: "indicacao",
    status: "ativo",
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
    totalSessoes: 12,
    preco: 4500,
    ativo: true,
    criadoEm: "2026-01-01T00:00:00Z",
    ...parcial,
  };
}

function sessaoDe(parcial: Partial<Sessao>): Sessao {
  return {
    id: "sessao-1",
    workspaceId: "ws-1",
    matriculaId: "matricula-1",
    turmaId: null,
    numero: 8,
    quando: "2026-08-20T15:00:00Z",
    duracaoMin: 60,
    status: "agendada",
    linkGravacao: "",
    transcricao: "",
    resumo: "",
    criadoEm: "2026-01-01T00:00:00Z",
    ...parcial,
  };
}

describe("eventoDaSessao — título", () => {
  it("carrega o primeiro nome do mentorado e o número da sessão", () => {
    const evento = eventoDaSessao(
      sessaoDe({ numero: 8 }),
      mentoradoDe({ nome: "Maria Fernandes" }),
      programaDe({}),
    );
    expect(evento).not.toBeNull();
    expect(evento!.titulo).toContain("Maria");
    expect(evento!.titulo).not.toContain("Fernandes");
    // D2 — `toContain("8")` era um teste vazio: o título "Maria — sessão 8
    // — 20/08 12:00" já tem um "8" dentro de "20/08" mesmo que
    // `tituloDaSessao` nunca imprima o número da sessão. `toMatch` com o
    // padrão "sessão 8" (aceitando "sessao"/"sessão") é o que de fato
    // morre se o número sumir do título — provado por mutação (ver relato
    // na resposta final).
    expect(evento!.titulo).toMatch(/sess[ãa]o\s*8/i);
  });

  it("numero null: título não menciona 'sessão null' nem quebra, mas mantém o primeiro nome", () => {
    const evento = eventoDaSessao(sessaoDe({ numero: null }), mentoradoDe({}), programaDe({}));
    expect(evento).not.toBeNull();
    expect(evento!.titulo).not.toContain("null");
    expect(evento!.titulo).toContain("Maria");
  });
});

describe("eventoDaSessao — convidados: turma nunca gera convidado individual", () => {
  it("sessão de turma (turmaId preenchido, matriculaId nulo) -> convidados vazio", () => {
    const evento = eventoDaSessao(
      sessaoDe({ matriculaId: null, turmaId: "turma-1" }),
      mentoradoDe({}),
      programaDe({ formato: "turma" }),
    );
    expect(evento).not.toBeNull();
    expect(evento!.convidados).toEqual([]);
  });

  it("sessão 1:1 (matriculaId preenchido) -> convidados traz o e-mail do mentorado", () => {
    const evento = eventoDaSessao(
      sessaoDe({ matriculaId: "matricula-1", turmaId: null }),
      mentoradoDe({ email: "maria@exemplo.com" }),
      programaDe({}),
    );
    expect(evento).not.toBeNull();
    expect(evento!.convidados).toEqual(["maria@exemplo.com"]);
  });

  it("sessão 1:1 mas mentorado sem e-mail cadastrado -> convidados vazio, nunca inventa endereço", () => {
    const evento = eventoDaSessao(
      sessaoDe({ matriculaId: "matricula-1", turmaId: null }),
      mentoradoDe({ email: "" }),
      programaDe({}),
    );
    expect(evento).not.toBeNull();
    expect(evento!.convidados).toEqual([]);
  });
});

describe("eventoDaSessao — descrição nunca vaza dado sensível", () => {
  it("não contém '@' (e-mail de terceiro) mesmo com e-mail do mentorado presente", () => {
    const evento = eventoDaSessao(sessaoDe({}), mentoradoDe({ email: "maria@exemplo.com" }), programaDe({}));
    expect(evento!.descricao).not.toContain("@");
  });

  it("não contém sequência de dígitos de telefone mesmo com telefone presente", () => {
    const evento = eventoDaSessao(sessaoDe({}), mentoradoDe({ telefone: "11987654321" }), programaDe({}));
    expect(evento!.descricao).not.toMatch(/\d{4,}/);
  });

  it("não contém 'R$' (valor de contrato) mesmo com preco presente no programa", () => {
    const evento = eventoDaSessao(sessaoDe({}), mentoradoDe({}), programaDe({ preco: 12345.67 }));
    expect(evento!.descricao).not.toContain("R$");
  });

  it("não contém sessao.linkGravacao mesmo quando ele existe", () => {
    const link = "https://drive.google.com/gravacao-secreta-123";
    const evento = eventoDaSessao(sessaoDe({ linkGravacao: link }), mentoradoDe({}), programaDe({}));
    expect(evento).not.toBeNull();
    expect(evento!.descricao).not.toContain(link);
  });

  it("não contém transcrição nem resumo — texto livre pode carregar qualquer um dos dados proibidos acima", () => {
    const evento = eventoDaSessao(
      sessaoDe({
        transcricao: "Ligar pro 11987654321 e cobrar R$ 4500 combinado com maria@exemplo.com",
        resumo: "Falamos sobre o pagamento de R$ 4500 e o telefone 11987654321",
      }),
      mentoradoDe({}),
      programaDe({}),
    );
    expect(evento!.descricao).not.toContain("@");
    expect(evento!.descricao).not.toMatch(/\d{4,}/);
    expect(evento!.descricao).not.toContain("R$");
  });
});

describe("eventoDaSessao — fimIso a partir de quando + duracaoMin", () => {
  it("duracaoMin normal soma minutos corretamente", () => {
    const evento = eventoDaSessao(
      sessaoDe({ quando: "2026-08-20T15:00:00Z", duracaoMin: 60 }),
      mentoradoDe({}),
      programaDe({}),
    );
    expect(evento!.inicioIso).toBe("2026-08-20T15:00:00.000Z");
    expect(evento!.fimIso).toBe("2026-08-20T16:00:00.000Z");
  });

  it("duracaoMin 0 -> fimIso === inicioIso, e não vira data inválida", () => {
    const evento = eventoDaSessao(
      sessaoDe({ quando: "2026-08-20T15:00:00Z", duracaoMin: 0 }),
      mentoradoDe({}),
      programaDe({}),
    );
    expect(evento).not.toBeNull();
    expect(evento!.fimIso).toBe(evento!.inicioIso);
    expect(Number.isNaN(Date.parse(evento!.fimIso))).toBe(false);
  });
});

describe("eventoDaSessao — quando inválido devolve null em vez de lançar", () => {
  it("quando vazio -> null", () => {
    expect(() => eventoDaSessao(sessaoDe({ quando: "" }), mentoradoDe({}), programaDe({}))).not.toThrow();
    expect(eventoDaSessao(sessaoDe({ quando: "" }), mentoradoDe({}), programaDe({}))).toBeNull();
  });

  it("quando é texto que não é data -> null", () => {
    expect(eventoDaSessao(sessaoDe({ quando: "não é data" }), mentoradoDe({}), programaDe({}))).toBeNull();
  });
});

describe("eventoDaSessao — fuso: título usa o horário de São Paulo, não o da máquina", () => {
  it("sessão às 23:00 em São Paulo (02:00 UTC do dia seguinte) mostra a data de São Paulo no título", () => {
    // 2026-08-20T23:00:00 em America/Sao_Paulo (UTC-3, sem horário de
    // verão) é 2026-08-21T02:00:00Z — se o título fosse montado a partir do
    // dia em UTC (o fuso do container de CI), apareceria dia 21, não 20.
    const quandoUtc = "2026-08-21T02:00:00Z";
    const evento = eventoDaSessao(sessaoDe({ quando: quandoUtc }), mentoradoDe({}), programaDe({}));
    expect(evento).not.toBeNull();
    expect(evento!.titulo).toContain("20/08");
    expect(evento!.titulo).not.toContain("21/08");
  });
});

describe("eventoDaSessao — D1: nome do programa como vetor de vazamento (vocabulário fechado)", () => {
  // Os quatro ataques do primeiro laudo MAIS os seis que derrubaram a
  // segunda tentativa (a defesa por regex). `programa.nome` é texto livre
  // sem CHECK no banco, e cada um destes nomes é uma forma real de um
  // mentor (sem má intenção nenhuma, só nomeando o programa do jeito que
  // fala) colar exatamente o dado que a descrição promete nunca carregar.
  //
  // Os seis últimos são a prova de que FILTRAR não funciona: moeda em
  // formato brasileiro nunca tem 4 dígitos consecutivos (o separador de
  // milhar quebra a sequência), e domínio sem esquema não casa com
  // `https?://` embora todo app de calendário o transforme em link. Eles
  // hoje passam POR CONSTRUÇÃO — nenhum texto livre chega à descrição —
  // e ficam aqui registrados como cobertos.
  const ataques: Array<[string, string]> = [
    ["Elite R$ 5.000", "valor de contrato"],
    ["Turma do contato@raro.com", "e-mail de terceiro"],
    ["Grupo 11987654321", "telefone"],
    ["Elite https://drive.google.com/gravacao-secreta-123", "link de gravação"],
    ["Elite 5.000,00", "valor de contrato em moeda pt-BR, sem 4 dígitos seguidos"],
    ["Elite 12x de 900 reais", "valor de contrato parcelado, escrito por extenso"],
    ["Elite 1.000.000,00", "valor de contrato com dois separadores de milhar"],
    ["Elite drive.google.com/gravacao-secreta", "link sem esquema (o app linkifica assim mesmo)"],
    ["Elite www.x.com/gravacao", "link com www e sem esquema"],
    ["Elite R $ 5.000", "valor de contrato com espaço dentro do símbolo de moeda"],
  ];

  it.each(ataques)("nome de programa \"%s\" (%s) nunca aparece na descrição", (nomePrograma) => {
    const evento = eventoDaSessao(sessaoDe({}), mentoradoDe({}), programaDe({ nome: nomePrograma }));
    expect(evento).not.toBeNull();
    expect(evento!.descricao).not.toContain(nomePrograma);
    expect(evento!.descricao).not.toContain("@");
    expect(evento!.descricao).not.toMatch(/r\s*\$/i);
    expect(evento!.descricao).not.toMatch(/https?:\/\//i);
    expect(evento!.descricao).not.toMatch(/\d{4,}/);
    // Nem um FRAGMENTO do nome sobra: "Elite" é o prefixo comum a quase
    // todos os ataques, e vê-lo na saída significaria que o filtro voltou
    // (recorte/mascaramento) em vez da construção fechada.
    expect(evento!.descricao).not.toContain("Elite");
  });

  it("nome de programa LIMPO também não aparece — a garantia é estrutural, não um filtro", () => {
    const evento = eventoDaSessao(sessaoDe({}), mentoradoDe({}), programaDe({ nome: "Elite" }));
    expect(evento).not.toBeNull();
    expect(evento!.descricao).not.toContain("Elite");
  });

  it("a descrição é exatamente o vocabulário fechado do módulo — literais + número + formato", () => {
    const evento = eventoDaSessao(
      sessaoDe({ numero: 8 }),
      mentoradoDe({ nome: "Maria Fernandes" }),
      programaDe({ nome: "Elite R$ 5.000", formato: "individual" }),
    );
    expect(evento).not.toBeNull();
    // Igualdade exata: qualquer campo de texto livre que alguém tentar
    // acrescentar no futuro quebra este teste imediatamente.
    expect(evento!.descricao).toBe("Sessão de mentoria individual (sessão 8)");
  });

  it("nenhum outro texto livre entra: nome do mentorado, resumo e transcrição ficam fora", () => {
    const evento = eventoDaSessao(
      sessaoDe({ resumo: "Fechamos por 5.000,00", transcricao: "manda no zap 11987654321" }),
      mentoradoDe({ nome: "Maria Fernandes" }),
      programaDe({ nome: "Elite" }),
    );
    expect(evento).not.toBeNull();
    expect(evento!.descricao).not.toContain("Maria");
    expect(evento!.descricao).not.toContain("Fernandes");
    expect(evento!.descricao).not.toContain("5.000");
    expect(evento!.descricao).not.toContain("zap");
  });

  it("formato de turma muda o rótulo, e o rótulo é literal deste módulo", () => {
    const evento = eventoDaSessao(
      sessaoDe({ matriculaId: null, turmaId: "turma-1", numero: null }),
      mentoradoDe({}),
      programaDe({ formato: "turma" }),
    );
    expect(evento).not.toBeNull();
    expect(evento!.descricao).toBe("Sessão de mentoria em turma");
  });
});

describe("eventoDaSessao — D3: string sem offset é hora de parede de São Paulo, nunca do fuso do processo", () => {
  const fusosDoProcesso = ["UTC", "Pacific/Kiritimati", "Asia/Tokyo", "America/Sao_Paulo"];
  const quandoSemOffset = "2026-08-20T23:00:00";

  it("o mesmo `quando` sem offset produz o MESMO inicioIso e o MESMO título nos quatro fusos do laudo", () => {
    const tzOriginal = process.env.TZ;
    try {
      const resultados = fusosDoProcesso.map((fuso) => {
        process.env.TZ = fuso;
        return eventoDaSessao(sessaoDe({ quando: quandoSemOffset }), mentoradoDe({ nome: "Maria Fernandes" }), programaDe({}));
      });

      for (const evento of resultados) expect(evento).not.toBeNull();

      const [primeiro, ...resto] = resultados;
      for (const evento of resto) {
        expect(evento!.inicioIso).toBe(primeiro!.inicioIso);
        expect(evento!.titulo).toBe(primeiro!.titulo);
      }

      // 23:00 em São Paulo (-03:00, sem horário de verão em 2026) é
      // 02:00 UTC do dia seguinte — conferido de propósito, e não só
      // "os quatro batem entre si", porque os quatro poderiam bater
      // errado da mesma forma.
      expect(primeiro!.inicioIso).toBe("2026-08-21T02:00:00.000Z");
      expect(primeiro!.titulo).toContain("20/08");
    } finally {
      process.env.TZ = tzOriginal;
    }
  });

  it("só data (sem hora nenhuma) é meia-noite de São Paulo, nunca meia-noite UTC", () => {
    const evento = eventoDaSessao(sessaoDe({ quando: "2026-08-20" }), mentoradoDe({}), programaDe({}));
    expect(evento).not.toBeNull();
    // meia-noite em São Paulo (-03:00) é 03:00 UTC do MESMO dia.
    expect(evento!.inicioIso).toBe("2026-08-20T03:00:00.000Z");
  });
});

describe("eventoDaSessao — D4: duracaoMin não-finito nunca lança", () => {
  it("NaN vira 0 (fimIso === inicioIso), não lança RangeError", () => {
    expect(() => eventoDaSessao(sessaoDe({ duracaoMin: NaN }), mentoradoDe({}), programaDe({}))).not.toThrow();
    const evento = eventoDaSessao(sessaoDe({ duracaoMin: NaN }), mentoradoDe({}), programaDe({}));
    expect(evento).not.toBeNull();
    expect(evento!.fimIso).toBe(evento!.inicioIso);
  });

  it("Infinity vira 0, não lança e não produz Invalid Date", () => {
    expect(() => eventoDaSessao(sessaoDe({ duracaoMin: Infinity }), mentoradoDe({}), programaDe({}))).not.toThrow();
    const evento = eventoDaSessao(sessaoDe({ duracaoMin: Infinity }), mentoradoDe({}), programaDe({}));
    expect(evento).not.toBeNull();
    expect(evento!.fimIso).toBe(evento!.inicioIso);
    expect(Number.isNaN(Date.parse(evento!.fimIso))).toBe(false);
  });

  it("-Infinity vira 0 também (não vira duração negativa nem lança)", () => {
    expect(() => eventoDaSessao(sessaoDe({ duracaoMin: -Infinity }), mentoradoDe({}), programaDe({}))).not.toThrow();
    const evento = eventoDaSessao(sessaoDe({ duracaoMin: -Infinity }), mentoradoDe({}), programaDe({}));
    expect(evento).not.toBeNull();
    expect(evento!.fimIso).toBe(evento!.inicioIso);
  });
});

describe("eventoDaSessao — D5: data civil impossível devolve null, nunca rola para outro dia", () => {
  it("31 de fevereiro, com offset Z -> null (não '03/03')", () => {
    expect(eventoDaSessao(sessaoDe({ quando: "2026-02-31T10:00:00Z" }), mentoradoDe({}), programaDe({}))).toBeNull();
  });

  it("31 de abril -> null (abril tem 30 dias)", () => {
    expect(eventoDaSessao(sessaoDe({ quando: "2026-04-31T10:00:00Z" }), mentoradoDe({}), programaDe({}))).toBeNull();
  });

  it("30 de fevereiro, sem offset (caminho de hora de parede de SP) -> null", () => {
    expect(eventoDaSessao(sessaoDe({ quando: "2026-02-30T10:00:00" }), mentoradoDe({}), programaDe({}))).toBeNull();
  });

  it("29 de fevereiro em ano bissexto (2028) é válido", () => {
    expect(eventoDaSessao(sessaoDe({ quando: "2028-02-29T10:00:00Z" }), mentoradoDe({}), programaDe({}))).not.toBeNull();
  });

  it("29 de fevereiro em ano NÃO bissexto (2026) é inválido", () => {
    expect(eventoDaSessao(sessaoDe({ quando: "2026-02-29T10:00:00Z" }), mentoradoDe({}), programaDe({}))).toBeNull();
  });
});

describe("eventoDaSessao — N1: o módulo aceita de volta o que ele mesmo emite", () => {
  // A REGRESSÃO: `sessao.quando` é `timestamptz` SEM precisão declarada no
  // `0006_mentoros_mentoria.sql` — ou seja, microssegundos. O PostgREST
  // devolve fração de segundo, o Postgres pode usar espaço no lugar do "T",
  // e o próprio `toISOString()` deste módulo emite ".000Z". Nenhum desses
  // formatos era reconhecido, e o modo de falha era `null` silencioso —
  // indistinguível de "não tenho dado".
  const formatos: Array<[string, string, string]> = [
    ["2026-08-20T15:00:00.000Z", "2026-08-20T15:00:00.000Z", "milissegundos — o formato que o próprio toISOString() produz"],
    ["2026-08-20T15:00:00.123456+00:00", "2026-08-20T15:00:00.123Z", "microssegundos — o que o PostgREST devolve de um timestamptz"],
    ["2026-08-20T15:00:00.123-03:00", "2026-08-20T18:00:00.123Z", "milissegundos com offset negativo"],
    ["2026-08-20T15:00:00+00", "2026-08-20T15:00:00.000Z", "offset de 2 dígitos"],
    ["2026-08-20 15:00:00+00:00", "2026-08-20T15:00:00.000Z", "separador espaço, formato do Postgres"],
    ["2026-08-20T15:00:00z", "2026-08-20T15:00:00.000Z", "z minúsculo"],
    ["2026-08-20 15:00:00", "2026-08-20T18:00:00.000Z", "espaço e sem offset — hora de parede de São Paulo"],
    ["2026-08-20T15:00:00.500", "2026-08-20T18:00:00.500Z", "fração sem offset — a fração sobrevive à conversão de fuso"],
  ];

  it.each(formatos)("%s -> %s (%s)", (quando, esperado) => {
    const evento = eventoDaSessao(sessaoDe({ quando }), mentoradoDe({}), programaDe({}));
    expect(evento).not.toBeNull();
    expect(evento!.inicioIso).toBe(esperado);
  });

  it("ROUND-TRIP: o inicioIso de um evento, realimentado como `quando`, gera o MESMO instante", () => {
    const primeiro = eventoDaSessao(
      sessaoDe({ quando: "2026-08-20T23:00:00", duracaoMin: 60 }),
      mentoradoDe({}),
      programaDe({}),
    );
    expect(primeiro).not.toBeNull();

    const segundo = eventoDaSessao(
      sessaoDe({ quando: primeiro!.inicioIso, duracaoMin: 60 }),
      mentoradoDe({}),
      programaDe({}),
    );
    expect(segundo).not.toBeNull();
    expect(segundo!.inicioIso).toBe(primeiro!.inicioIso);
    expect(segundo!.fimIso).toBe(primeiro!.fimIso);
    expect(segundo!.titulo).toBe(primeiro!.titulo);

    // Terceira volta: um formato que sobrevive a duas idas e voltas não
    // está sendo aceito por acidente.
    const terceiro = eventoDaSessao(
      sessaoDe({ quando: segundo!.inicioIso, duracaoMin: 60 }),
      mentoradoDe({}),
      programaDe({}),
    );
    expect(terceiro!.inicioIso).toBe(primeiro!.inicioIso);
  });

  it("concorda com os módulos irmãos: o que `Date.parse` aceita (progresso.ts/dados.ts), este módulo também aceita", () => {
    // O pior modo de falha do defeito: para a MESMA linha do banco,
    // `progressoDe` contava a sessão e `eventoDaSessao` dizia que a data
    // era inválida. Dois módulos irmãos discordando sobre o mesmo dado.
    const doBanco = [
      "2026-08-20T15:00:00.000Z",
      "2026-08-20T15:00:00.123456+00:00",
      "2026-08-20 15:00:00+00:00",
      "2026-08-20T15:00:00z",
    ];
    for (const quando of doBanco) {
      // A direção que importa: nada que os irmãos contam pode ser recusado
      // aqui. (A recíproca NÃO é exigida — ver o caso "+00" abaixo.)
      expect(Number.isFinite(Date.parse(quando))).toBe(true);
      expect(eventoDaSessao(sessaoDe({ quando }), mentoradoDe({}), programaDe({}))).not.toBeNull();
    }

    // Assimetria consciente, medida e não suposta: `Date.parse` do V8 devolve
    // NaN para offset de 2 dígitos ("+00"), formato que o `to_char`/dump do
    // Postgres imprime. Aqui ele é aceito. Ser MAIS tolerante que os irmãos é
    // seguro (o evento nasce onde antes não nascia); o inverso é que produzia
    // a discordância silenciosa do laudo.
    expect(Number.isNaN(Date.parse("2026-08-20T15:00:00+00"))).toBe(true);
    expect(
      eventoDaSessao(sessaoDe({ quando: "2026-08-20T15:00:00+00" }), mentoradoDe({}), programaDe({})),
    ).not.toBeNull();
  });

  it("aceitar fração NÃO reabre a leniência que o D5 fechou: data civil impossível segue null", () => {
    const impossiveis = [
      "2026-02-31T10:00:00.000Z",
      "2026-02-31 10:00:00.123456+00:00",
      "2026-04-31T10:00:00.000-03:00",
      "2026-02-29T10:00:00.500",
    ];
    for (const quando of impossiveis) {
      expect(eventoDaSessao(sessaoDe({ quando }), mentoradoDe({}), programaDe({}))).toBeNull();
    }
  });

  it("lixo parecido com data continua sendo null (a regex não virou 'aceita quase tudo')", () => {
    const lixo = [
      "2026-08-20T15:00:00.",        // ponto sem fração
      "2026-08-20T15:00:00+0",       // offset de 1 dígito
      "2026-08-20T15:00:00 Z",       // espaço antes do Z
      "2026-08-20T25:00:00.000Z",    // hora 25
      "2026-08-20T15:60:00.000Z",    // minuto 60
      "2026-08-20  15:00:00Z",       // dois espaços
      "2026-08-20Tx5:00:00Z",
    ];
    for (const quando of lixo) {
      expect(eventoDaSessao(sessaoDe({ quando }), mentoradoDe({}), programaDe({}))).toBeNull();
    }
  });
});

describe("eventoDaSessao — D4 residual: duração finita porém absurda não lança", () => {
  it("duracaoMin 1e15 (finito, mas joga o fim para fora do alcance de Date) não lança RangeError", () => {
    expect(() =>
      eventoDaSessao(sessaoDe({ duracaoMin: 1e15 }), mentoradoDe({}), programaDe({})),
    ).not.toThrow();
    const evento = eventoDaSessao(sessaoDe({ duracaoMin: 1e15 }), mentoradoDe({}), programaDe({}));
    expect(evento).not.toBeNull();
    expect(evento!.fimIso).toBe(evento!.inicioIso);
    expect(Number.isNaN(Date.parse(evento!.fimIso))).toBe(false);
  });

  it("duracaoMin gigante porém representável continua somando de verdade", () => {
    const evento = eventoDaSessao(
      sessaoDe({ quando: "2026-08-20T15:00:00Z", duracaoMin: 1440 }),
      mentoradoDe({}),
      programaDe({}),
    );
    expect(evento!.fimIso).toBe("2026-08-21T15:00:00.000Z");
  });
});
