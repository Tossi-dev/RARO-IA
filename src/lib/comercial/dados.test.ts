// Testes de `lerPipeline`, `lerOportunidade` e `lerPropostas`.
//
// O QUE ESTA SUÍTE PROVA
// ----------------------
// 1) sem Supabase configurado, ZERO consultas;
// 2) leitura PARCIAL não vira conta: `conversao` e `cicloMedioDias` voltam
//    `null` com `parcial: true`. Número calculado em cima de metade dos dados
//    é número inventado, e este é o número que decide onde o time vai bater;
// 3) o TOKEN da proposta não sai na listagem do pipeline — nem na consulta,
//    nem no objeto devolvido. Ele é a fechadura do link público;
// 4) o hash de IP e de agente NUNCA atravessa para a tela: serve para contar
//    visita, não para identificar quem abriu;
// 5) `motivo` é frase humana, sem nome de tabela e sem código de erro;
// 6) não se pede o que não se precisa: sem proposta, não há consulta de
//    visita.

import { afterEach, describe, expect, it, vi } from "vitest";

const criarSupabaseServerMock = vi.fn();
const supabaseConfiguradoMock = vi.fn(() => true);
vi.mock("../supabase/server", () => ({ criarSupabaseServer: criarSupabaseServerMock }));
vi.mock("../data", () => ({ supabaseConfigurado: supabaseConfiguradoMock }));

const { lerOportunidade, lerPipeline, lerPropostas } = await import("./dados");

const AGORA = "2026-08-20T12:00:00Z";
const OPORTUNIDADE = "0f8c1c2e-4f1a-4a11-9e33-0a1b2c3d4e5f";

interface Consulta {
  tabela: string;
  colunas: string;
  filtros: Array<[string, unknown]>;
  emColuna?: string;
  emValores?: unknown[];
}

type Resposta = { data: unknown; error: { code?: string; message?: string } | null };

function cliente(respostas: Record<string, Resposta>) {
  const consultas: Consulta[] = [];
  const c = {
    rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
    from(tabela: string) {
      const consulta: Consulta = { tabela, colunas: "", filtros: [] };
      consultas.push(consulta);
      const resposta = respostas[tabela] ?? { data: [], error: null };
      const b: Record<string, unknown> = {};
      b.select = (colunas = "*") => {
        consulta.colunas = String(colunas);
        return b;
      };
      b.eq = (coluna: string, valor: unknown) => {
        consulta.filtros.push([coluna, valor]);
        return b;
      };
      b.in = (coluna: string, valores: unknown[]) => {
        consulta.emColuna = coluna;
        consulta.emValores = valores;
        return b;
      };
      b.order = () => b;
      b.then = (resolver: (r: Resposta) => unknown) => Promise.resolve(resposta).then(resolver);
      return b;
    },
  };
  criarSupabaseServerMock.mockReturnValue(c);
  return { consultas };
}

function linhaEtapa(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "e1",
    workspace_id: "ws-1",
    chave: "contato",
    nome: "Primeiro contato",
    ordem: 1,
    tipo: "sdr",
    ativa: true,
    criado_em: "2026-08-01T10:00:00Z",
    ...over,
  };
}

function linhaOportunidade(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "op1",
    workspace_id: "ws-1",
    aluno_id: "al-1",
    mentorado_id: null,
    etapa_id: "e1",
    responsavel_perfil_id: "perfil-1",
    valor: 2500,
    probabilidade: 40,
    origem: "indicacao",
    status: "aberta",
    motivo_perda: "",
    criado_em: "2026-08-02T10:00:00Z",
    fechado_em: null,
    ...over,
  };
}

function linhaProposta(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "pr1",
    workspace_id: "ws-1",
    oportunidade_id: "op1",
    token: "aaaaaaaaaaaaaaaaaaaaaa",
    titulo: "Proposta de mentoria",
    corpo: "Corpo da proposta",
    valor: 2500,
    validade: "2026-09-01",
    status: "enviada",
    criado_em: "2026-08-03T10:00:00Z",
    ...over,
  };
}

function linhaVisita(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "v1",
    workspace_id: "ws-1",
    proposta_id: "pr1",
    quando: "2026-08-04T10:00:00Z",
    ip_hash: "a".repeat(64),
    agente_hash: "b".repeat(64),
    ...over,
  };
}

const OK = (data: unknown): Resposta => ({ data, error: null });
const FALHOU: Resposta = { data: null, error: { code: "42501", message: 'permission denied for table "oportunidade"' } };

/** Nada do que a tela mostra pode citar a estrutura do banco. */
function naoVazaEstrutura(texto: string): void {
  for (const proibido of ["oportunidade", "funil_etapa", "proposta_visita", "workspace", "select", "42501", "PGRST"]) {
    expect(texto.toLowerCase(), `motivo citou ${proibido}`).not.toContain(proibido.toLowerCase());
  }
}

afterEach(() => {
  vi.restoreAllMocks();
  supabaseConfiguradoMock.mockReturnValue(true);
});

describe("sem banco configurado", () => {
  it("as três leituras não consultam nada e explicam em português", async () => {
    supabaseConfiguradoMock.mockReturnValue(false);
    const { consultas } = cliente({});

    const pipeline = await lerPipeline(AGORA);
    const uma = await lerOportunidade(OPORTUNIDADE);
    const propostas = await lerPropostas(OPORTUNIDADE);

    expect(consultas).toHaveLength(0);
    for (const r of [pipeline, uma, propostas]) {
      expect(r.conectado).toBe(false);
      expect(r.motivo.length).toBeGreaterThan(10);
      naoVazaEstrutura(r.motivo);
    }
    expect(pipeline.conversao).toBeNull();
  });
});

describe("lerPipeline", () => {
  it("com tudo lido, calcula a conversão e o ciclo", async () => {
    cliente({
      funil_etapa: OK([linhaEtapa(), linhaEtapa({ id: "e2", chave: "proposta", ordem: 2 })]),
      oportunidade: OK([
        linhaOportunidade({ id: "op1", etapa_id: "e2" }),
        linhaOportunidade({
          id: "op2",
          etapa_id: "e1",
          status: "ganha",
          fechado_em: "2026-08-12T10:00:00Z",
        }),
      ]),
      proposta: OK([linhaProposta()]),
    });

    const r = await lerPipeline(AGORA);

    expect(r.conectado).toBe(true);
    expect(r.parcial).toBe(false);
    expect(r.conversao).not.toBeNull();
    expect(r.conversao!.linhas.map((l) => l.etapaId)).toEqual(["e1", "e2"]);
    expect(r.cicloMedioDias).toBe(10);
  });

  it("erro em UMA das leituras NÃO vira conta pela metade", async () => {
    // O que já veio continua vindo — a tela mostra os cartões e avisa. O que
    // não volta é o NÚMERO: conversão em cima de metade dos dados é número
    // inventado, e é justamente o número que muda o discurso do time.
    vi.spyOn(console, "warn").mockImplementation(() => {});
    cliente({
      funil_etapa: OK([linhaEtapa()]),
      // FECHADA de propósito: com uma oportunidade só aberta, `cicloMedio`
      // devolveria `null` sozinho e a asserção de baixo passaria mesmo sem a
      // guarda de `parcial`. Foi o que um mutante mostrou.
      oportunidade: OK([linhaOportunidade({ status: "ganha", fechado_em: "2026-08-12T10:00:00Z" })]),
      proposta: FALHOU,
    });

    const r = await lerPipeline(AGORA);

    expect(r.conectado).toBe(true);
    expect(r.parcial).toBe(true);
    expect(r.conversao).toBeNull();
    expect(r.cicloMedioDias).toBeNull();
    expect(r.etapas).toHaveLength(1);
    expect(r.oportunidades).toHaveLength(1);
    expect(r.propostas).toEqual([]);
  });

  it("sem etapa e sem oportunidade não há funil: desconectado, não vazio", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    cliente({ funil_etapa: FALHOU, oportunidade: FALHOU, proposta: OK([]) });

    const r = await lerPipeline(AGORA);

    expect(r.conectado).toBe(false);
    expect(r.conversao).toBeNull();
    naoVazaEstrutura(r.motivo);
  });

  it("falha só nas oportunidades também derruba a tela — a espinha são as DUAS", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    cliente({ funil_etapa: OK([linhaEtapa()]), oportunidade: FALHOU, proposta: OK([]) });

    const r = await lerPipeline(AGORA);

    expect(r.conectado).toBe(false);
    expect(r.etapas).toEqual([]);
  });

  it("NÃO pede o token da proposta — nem na consulta, nem de volta", async () => {
    const { consultas } = cliente({
      funil_etapa: OK([linhaEtapa()]),
      oportunidade: OK([linhaOportunidade()]),
      proposta: OK([linhaProposta()]),
    });

    const r = await lerPipeline(AGORA);
    const consultaProposta = consultas.find((c) => c.tabela === "proposta");

    expect(consultaProposta, "esperava a consulta de proposta").toBeDefined();
    expect(consultaProposta!.colunas).not.toContain("*");
    expect(consultaProposta!.colunas).not.toContain("token");
    expect(consultaProposta!.colunas).not.toContain("corpo");
    expect(r.propostas).toHaveLength(1);
    expect(Object.keys(r.propostas[0])).not.toContain("token");
    expect(JSON.stringify(r.propostas)).not.toContain("aaaaaaaaaaaaaaaaaaaaaa");
  });

  it("diz quais propostas venceram, e é para isso que o relógio entra", async () => {
    cliente({
      funil_etapa: OK([linhaEtapa()]),
      oportunidade: OK([linhaOportunidade()]),
      proposta: OK([
        linhaProposta({ id: "velha", validade: "2026-08-19" }),
        linhaProposta({ id: "nova", validade: "2026-08-21" }),
        linhaProposta({ id: "hoje", validade: "2026-08-20" }),
        linhaProposta({ id: "sem-prazo", validade: null }),
      ]),
    });

    const r = await lerPipeline(AGORA);
    const por = (id: string) => r.propostas.find((p) => p.id === id)!;

    expect(por("velha").vencida).toBe(true);
    expect(por("nova").vencida).toBe(false);
    // O último dia ainda vale — é o mesmo `>= current_date` da função do banco.
    expect(por("hoje").vencida).toBe(false);
    expect(por("sem-prazo").vencida).toBe(false);
  });

  it("validade fora de forma não vira vencida", async () => {
    // Texto vazio comparado com data dá "menor que hoje" — ou seja, a
    // proposta apareceria vencida por causa de um campo em branco.
    cliente({
      funil_etapa: OK([linhaEtapa()]),
      oportunidade: OK([linhaOportunidade()]),
      proposta: OK([
        linhaProposta({ id: "vazia", validade: "" }),
        linhaProposta({ id: "numero", validade: 20260819 }),
      ]),
    });

    const r = await lerPipeline(AGORA);

    expect(r.propostas.find((p) => p.id === "vazia")!.vencida).toBe(false);
    expect(r.propostas.find((p) => p.id === "numero")!.vencida).toBe(false);
  });

  it("traz nome de aluno, e só id e nome", async () => {
    const { consultas } = cliente({
      funil_etapa: OK([linhaEtapa()]),
      oportunidade: OK([linhaOportunidade()]),
      proposta: OK([]),
      alunos: OK([{ id: "al-1", nome: "Joana", telefone: "11999", email: "j@x.com" }]),
    });

    const r = await lerPipeline(AGORA);

    expect(r.alunos).toEqual([{ id: "al-1", nome: "Joana" }]);
    expect(consultas.find((c) => c.tabela === "alunos")!.colunas).toBe("id, nome");
    expect(JSON.stringify(r.alunos)).not.toContain("11999");
  });

  it("falha na lista de alunos também é parcial", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    cliente({
      funil_etapa: OK([linhaEtapa()]),
      oportunidade: OK([linhaOportunidade({ status: "ganha", fechado_em: "2026-08-12T10:00:00Z" })]),
      proposta: OK([]),
      alunos: FALHOU,
    });

    const r = await lerPipeline(AGORA);

    expect(r.parcial).toBe(true);
    expect(r.conversao).toBeNull();
    expect(r.cicloMedioDias).toBeNull();
    expect(r.alunos).toEqual([]);
  });

  it("recebe UM parâmetro, e é o relógio", async () => {
    expect(lerPipeline.length).toBe(1);
  });
});

describe("lerOportunidade", () => {
  it("id fora de forma nem chega ao banco", async () => {
    const { consultas } = cliente({ oportunidade: OK([linhaOportunidade()]) });

    const r = await lerOportunidade("../../etc/passwd");

    expect(consultas).toHaveLength(0);
    expect(r.conectado).toBe(false);
    naoVazaEstrutura(r.motivo);
  });

  it("filtra pelo id e devolve a oportunidade com a etapa dela", async () => {
    // DUAS etapas, e a oportunidade na SEGUNDA: com uma só na lista, devolver
    // sempre `etapas[0]` passaria no teste. Foi o que um mutante mostrou.
    const { consultas } = cliente({
      oportunidade: OK([linhaOportunidade({ id: OPORTUNIDADE, etapa_id: "e2" })]),
      funil_etapa: OK([linhaEtapa(), linhaEtapa({ id: "e2", chave: "proposta", ordem: 2 })]),
    });

    const r = await lerOportunidade(OPORTUNIDADE);

    expect(consultas.find((c) => c.tabela === "oportunidade")!.filtros).toContainEqual(["id", OPORTUNIDADE]);
    expect(r.conectado).toBe(true);
    expect(r.oportunidade?.id).toBe(OPORTUNIDADE);
    expect(r.etapa?.id).toBe("e2");
    expect(r.etapa?.chave).toBe("proposta");
  });

  it("não encontrada é conectado com oportunidade nula — não é erro de leitura", async () => {
    const r = await (async () => {
      cliente({ oportunidade: OK([]), funil_etapa: OK([linhaEtapa()]) });
      return lerOportunidade(OPORTUNIDADE);
    })();

    expect(r.conectado).toBe(true);
    expect(r.oportunidade).toBeNull();
    expect(r.motivo).toBe("");
  });
});

describe("lerPropostas", () => {
  it("id fora de forma nem chega ao banco", async () => {
    const { consultas } = cliente({ proposta: OK([linhaProposta()]) });

    const r = await lerPropostas("nao-e-uuid");

    expect(consultas).toHaveLength(0);
    expect(r.conectado).toBe(false);
  });

  it("devolve o token — é aqui que o link é montado", async () => {
    cliente({ proposta: OK([linhaProposta()]), proposta_visita: OK([]) });

    const r = await lerPropostas(OPORTUNIDADE);

    expect(r.propostas[0].token).toBe("aaaaaaaaaaaaaaaaaaaaaa");
  });

  it("filtra as propostas pela negociação pedida", async () => {
    const { consultas } = cliente({ proposta: OK([linhaProposta()]), proposta_visita: OK([]) });

    await lerPropostas(OPORTUNIDADE);

    expect(consultas.find((c) => c.tabela === "proposta")!.filtros).toContainEqual([
      "oportunidade_id",
      OPORTUNIDADE,
    ]);
  });

  it("conta visita POR proposta, e o HASH não é nem pedido", async () => {
    // O hash existe para contar quantas vezes o link foi aberto. Pedir o
    // valor faria o hash atravessar a rede e passar pela memória do servidor
    // sem necessidade — e a regra do projeto é não pedir o que não se precisa.
    const { consultas } = cliente({
      proposta: OK([linhaProposta({ id: "pr1" }), linhaProposta({ id: "pr2" })]),
      proposta_visita: OK([
        linhaVisita({ id: "v1", proposta_id: "pr1", quando: "2026-08-04T10:00:00Z" }),
        linhaVisita({ id: "v2", proposta_id: "pr1", quando: "2026-08-06T10:00:00Z" }),
        linhaVisita({ id: "v3", proposta_id: "pr2", quando: "2026-08-05T10:00:00Z" }),
      ]),
    });

    const r = await lerPropostas(OPORTUNIDADE);
    const por = (id: string) => r.propostas.find((p) => p.id === id)!;

    // Duas propostas com contagens DIFERENTES: com uma só, contar as visitas
    // de todo mundo para cada uma daria o mesmo número.
    expect(por("pr1").visitas).toBe(2);
    expect(por("pr1").ultimaVisita).toBe("2026-08-06T10:00:00Z");
    expect(por("pr2").visitas).toBe(1);
    expect(por("pr2").ultimaVisita).toBe("2026-08-05T10:00:00Z");

    const consultaVisita = consultas.find((c) => c.tabela === "proposta_visita")!;
    expect(consultaVisita.colunas).toBe("proposta_id, quando");
    expect(consultaVisita.colunas).not.toContain("hash");

    const texto = JSON.stringify(r);
    expect(texto).not.toContain("ip_hash");
    expect(texto).not.toContain("agente_hash");
    expect(texto).not.toContain("a".repeat(64));
  });

  it("sem proposta, NÃO pergunta por visita", async () => {
    const { consultas } = cliente({ proposta: OK([]), proposta_visita: OK([linhaVisita()]) });

    const r = await lerPropostas(OPORTUNIDADE);

    expect(consultas.map((c) => c.tabela)).toEqual(["proposta"]);
    expect(r.propostas).toEqual([]);
  });

  it("pergunta visita pelos ids que sobraram, e não pela oportunidade", async () => {
    const { consultas } = cliente({
      proposta: OK([linhaProposta({ id: "pr1" }), linhaProposta({ id: "pr2" })]),
      proposta_visita: OK([]),
    });

    await lerPropostas(OPORTUNIDADE);
    const visita = consultas.find((c) => c.tabela === "proposta_visita")!;

    expect(visita.emColuna).toBe("proposta_id");
    expect(visita.emValores).toEqual(["pr1", "pr2"]);
  });

  it("erro na visita não derruba a lista: as propostas vêm, marcadas como parciais", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    cliente({ proposta: OK([linhaProposta()]), proposta_visita: FALHOU });

    const r = await lerPropostas(OPORTUNIDADE);

    expect(r.conectado).toBe(true);
    expect(r.parcial).toBe(true);
    expect(r.propostas).toHaveLength(1);
    // Sem saber quantas visitas houve, o número não é 0 — é desconhecido.
    expect(r.propostas[0].visitas).toBeNull();
    expect(r.propostas[0].ultimaVisita).toBeNull();
  });
});

describe("o que vai para o log e o que vai para a tela", () => {
  it("o log leva só o código, e a tela leva só a frase", async () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    cliente({ funil_etapa: FALHOU, oportunidade: FALHOU, proposta: OK([]) });

    const r = await lerPipeline(AGORA);

    expect(aviso).toHaveBeenCalled();
    const registrado = aviso.mock.calls.map((c) => c.join(" ")).join(" | ");
    expect(registrado).toContain("42501");
    // A mensagem do PostgREST ecoa o corpo da requisição: nunca no log.
    expect(registrado).not.toContain("permission denied");
    naoVazaEstrutura(r.motivo);
  });

  it("exceção no cliente vira desconectado, não estouro", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    criarSupabaseServerMock.mockImplementation(() => {
      throw new Error("boom");
    });

    const r = await lerPipeline(AGORA);

    expect(r.conectado).toBe(false);
    expect(r.motivo).not.toContain("boom");
  });
});
