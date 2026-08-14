// Testes de `dados-historico.ts` — a camada que LÊ as duas metades da vida do
// mentorado (a do CRM e a da mentoria) e as entrega como UMA linha do tempo só,
// mais o score de saúde.
//
// Dois dublês, porque são duas origens de leitura diferentes e o teste precisa
// contar cada uma separadamente:
//
// 1) `../supabase/server` — o cliente do Postgres, no mesmo molde de
//    `dados.test.ts` e `portal.test.ts`: um builder mínimo que encadeia
//    `.select()/.eq()/.is()` e resolve com a resposta que o teste declarou
//    para AQUELA tabela. É por ele que passam mentorado, matrícula, sessão,
//    tarefa, marco, score e documento.
//
// 2) `../data` — o provider do CRM (`getDB()`), o mesmo que `/crm/[id]` já
//    usa para notas, atividades e interações. Aqui ele é `vi.fn()` de
//    propósito: a asserção mais importante deste arquivo é que essas três
//    funções NÃO SÃO CHAMADAS quando o mentorado não tem `aluno_id`, e para
//    provar "não chamou" é preciso um dublê que conte.
//
// `supabaseConfigurado` do mock repete a implementação real (lê as duas
// variáveis de ambiente) em vez de virar um `vi.fn()` de valor fixo: é assim
// que `vi.stubEnv` continua sendo o botão que liga e desliga o Supabase no
// teste, e o caminho "sem configuração nenhuma" continua sendo exercitado
// pelo mesmo código que roda em produção.
//
// `vi.hoisted` porque `vi.mock` é içado para o topo do arquivo pelo transform
// do Vitest, antes de qualquer `const` comum — sem isto o mock cairia em TDZ
// quando a fábrica fosse executada (mesmo motivo de `dados.test.ts`).

import { afterEach, describe, expect, it, vi } from "vitest";

import { visibilidadeDoTipo } from "./historico";
import { saudeDoMentorado } from "./saude-mentorado";
import {
  linhaParaMarco,
  linhaParaMatricula,
  linhaParaProgramaOuNulo,
  linhaParaScoreEvolucao,
  linhaParaSessao,
  linhaParaTarefaMentoria,
} from "./dados";
import type { Atividade, Interacao, Nota } from "../types";

const { criarSupabaseServerMock, getDBMock, listNotasMock, listAtividadesMock, listInteracoesMock, estadoSimulacao } =
  vi.hoisted(() => {
    const listNotas = vi.fn();
    const listAtividades = vi.fn();
    const listInteracoes = vi.fn();
    return {
      criarSupabaseServerMock: vi.fn(),
      getDBMock: vi.fn(() => ({
        listNotas,
        listAtividades,
        listInteracoes,
      })),
      listNotasMock: listNotas,
      listAtividadesMock: listAtividades,
      listInteracoesMock: listInteracoes,
      // Objeto mutável, e não `vi.fn()`, porque `clearAllMocks` apagaria a
      // implementação de um mock e a simulação voltaria como `undefined`.
      estadoSimulacao: { ligada: false },
    };
  });

vi.mock("../supabase/server", () => ({
  criarSupabaseServer: criarSupabaseServerMock,
}));

// `modoDados`/`modoDadosEfetivo` repetem a implementação real (a diferença
// entre as duas é exatamente a simulação, que na vida real vem de cookie) em
// vez de virarem valor fixo: assim `vi.stubEnv` e `estadoSimulacao` continuam
// sendo os dois únicos botões, e o caminho exercitado é o mesmo de produção.
function modoConfigurado(): string {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
    ? "supabase"
    : "vazio";
}

vi.mock("../data", () => ({
  supabaseConfigurado: () =>
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  modoDados: () => modoConfigurado(),
  modoDadosEfetivo: () => (estadoSimulacao.ligada ? "demo" : modoConfigurado()),
  getDB: getDBMock,
}));

const { lerHistorico } = await import("./dados-historico");

const AGORA = "2026-05-20T12:00:00.000Z";

// ============================================================
// Dublê do cliente Supabase
// ============================================================

type RespostaTabela = {
  data: unknown;
  error: { code?: string; message?: string } | null;
};

/**
 * Builder mínimo: encadeia `.select()`/`.eq()`/`.is()` sem olhar os
 * argumentos (quem decide a resposta é o teste, via `respostas`, chaveado por
 * nome de tabela) e resolve como uma Promise quando `await`ado — é assim que o
 * supabase-js se comporta de verdade (o builder É um PromiseLike), e é só isso
 * que a camada de leitura usa.
 *
 * `jogaExcecaoEm`: quando `.from(tabela)` é chamado com esse nome, lança uma
 * exceção SÍNCRONA em vez de devolver um builder — simula o cliente quebrando
 * antes mesmo de montar a query (rede fora, cliente mal configurado), que é
 * um caminho diferente do `error` normal do supabase-js.
 *
 * `consultas` guarda o que cada query PEDIU, e não só qual tabela foi tocada.
 * Sem isso, apagar um `.eq("mentorado_id", …)` da leitura não faz nenhum teste
 * ficar vermelho — e em produção, com papel dono ou gestor, a RLS libera o
 * workspace inteiro: as tarefas, os marcos e os scores de TODO mundo cairiam
 * na ficha de uma pessoa só. O recorte no banco é conveniência, mas é ele que
 * decide o que a página monta, então precisa de teste.
 */
type ConsultaRegistrada = { tabela: string; eq: Array<[string, unknown]>; is: Array<[string, unknown]> };

function construirCliente(
  respostas: Record<string, RespostaTabela>,
  jogaExcecaoEm?: string
): { from: ReturnType<typeof vi.fn>; consultas: ConsultaRegistrada[] } {
  const consultas: ConsultaRegistrada[] = [];
  const fromMock = vi.fn((tabela: string) => {
    if (jogaExcecaoEm === tabela) {
      throw new Error("falha de rede simulada");
    }
    const registro: ConsultaRegistrada = { tabela, eq: [], is: [] };
    consultas.push(registro);
    const resposta: RespostaTabela = respostas[tabela] ?? { data: [], error: null };
    const builder = {
      select: () => builder,
      eq: (coluna: string, valor: unknown) => {
        registro.eq.push([coluna, valor]);
        return builder;
      },
      is: (coluna: string, valor: unknown) => {
        registro.is.push([coluna, valor]);
        return builder;
      },
      order: () => builder,
      maybeSingle: () => Promise.resolve(resposta),
      then: (resolve: (v: RespostaTabela) => void, reject: (e: unknown) => void) =>
        Promise.resolve(resposta).then(resolve, reject),
    };
    return builder;
  });
  return { from: fromMock, consultas };
}

function ligarCliente(respostas: Record<string, RespostaTabela>, jogaExcecaoEm?: string) {
  const cliente = construirCliente(respostas, jogaExcecaoEm);
  criarSupabaseServerMock.mockReturnValue(cliente);
  return cliente;
}

function ligarSupabase() {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://exemplo-teste.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "chave-anonima-de-teste");
}

/** As três leituras de CRM respondem o que o teste mandar; por padrão, nada. */
function ligarCrm(dados: { notas?: Nota[]; atividades?: Atividade[]; interacoes?: Interacao[] } = {}) {
  listNotasMock.mockResolvedValue(dados.notas ?? []);
  listAtividadesMock.mockResolvedValue(dados.atividades ?? []);
  listInteracoesMock.mockResolvedValue(dados.interacoes ?? []);
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  estadoSimulacao.ligada = false;
  // `getDB()` volta a devolver o trio de dublês: `clearAllMocks` limpa a
  // implementação declarada no `vi.hoisted`, e sem isto o teste seguinte
  // receberia `undefined` no lugar do provider.
  getDBMock.mockImplementation(() => ({
    listNotas: listNotasMock,
    listAtividades: listAtividadesMock,
    listInteracoes: listInteracoesMock,
  }));
});

// ============================================================
// Fixtures — linhas CRUAS (snake_case), como o Postgres devolveria.
// ============================================================

function linhaMentorado(parcial: Record<string, unknown> = {}) {
  return {
    id: "ment-1",
    workspace_id: "ws-1",
    aluno_id: null,
    perfil_id: null,
    nome: "Ana Souza",
    telefone: "11988887777",
    email: "ana@exemplo.com",
    origem: "indicacao",
    status: "ativo",
    criado_em: "2026-02-01T00:00:00.000Z",
    ...parcial,
  };
}

function linhaPrograma(parcial: Record<string, unknown> = {}) {
  return {
    id: "prog-1",
    workspace_id: "ws-1",
    nome: "Elite",
    formato: "individual",
    total_sessoes: 8,
    preco: 12000,
    ativo: true,
    criado_em: "2026-01-01T00:00:00.000Z",
    ...parcial,
  };
}

function linhaMatricula(parcial: Record<string, unknown> = {}) {
  return {
    id: "mat-1",
    workspace_id: "ws-1",
    mentorado_id: "ment-1",
    programa_id: "prog-1",
    turma_id: null,
    inicio: "2026-03-01T00:00:00.000Z",
    fim_previsto: "2026-08-01T00:00:00.000Z",
    status: "ativa",
    sessoes_previstas: 8,
    criado_em: "2026-03-01T00:00:00.000Z",
    programa: linhaPrograma(),
    ...parcial,
  };
}

function linhaSessao(parcial: Record<string, unknown> = {}) {
  return {
    id: "ses-1",
    workspace_id: "ws-1",
    matricula_id: "mat-1",
    turma_id: null,
    numero: 1,
    quando: "2026-04-10T14:00:00.000Z",
    duracao_min: 60,
    status: "realizada",
    link_gravacao: "",
    transcricao: "",
    resumo: "Desenhamos a oferta nova",
    criado_em: "2026-04-01T00:00:00.000Z",
    ...parcial,
  };
}

function linhaTarefa(parcial: Record<string, unknown> = {}) {
  return {
    id: "tar-1",
    workspace_id: "ws-1",
    mentorado_id: "ment-1",
    sessao_id: null,
    titulo: "Escrever a oferta",
    prazo: "2026-05-10T00:00:00.000Z",
    concluida: true,
    concluida_em: "2026-05-09T10:00:00.000Z",
    marcada_por: "mentor",
    criado_em: "2026-04-11T00:00:00.000Z",
    ...parcial,
  };
}

function linhaMarco(parcial: Record<string, unknown> = {}) {
  return {
    id: "mar-1",
    workspace_id: "ws-1",
    mentorado_id: "ment-1",
    titulo: "Primeiro cliente fechado",
    descricao: "Fechou o primeiro contrato do programa",
    conquistado_em: "2026-05-05T00:00:00.000Z",
    criado_em: "2026-05-05T00:00:00.000Z",
    ...parcial,
  };
}

function linhaScore(parcial: Record<string, unknown> = {}) {
  return {
    id: "sco-1",
    workspace_id: "ws-1",
    mentorado_id: "ment-1",
    semana: "2026-05-04T00:00:00.000Z",
    score: 60,
    motivo: "Entregou tudo no prazo",
    criado_em: "2026-05-04T00:00:00.000Z",
    ...parcial,
  };
}

function linhaDocumento(parcial: Record<string, unknown> = {}) {
  return {
    id: "doc-1",
    workspace_id: "ws-1",
    mentorado_id: "ment-1",
    aluno_id: null,
    titulo: "Contrato assinado",
    caminho_storage: "ws-1/ment-1/contrato.pdf",
    mime: "application/pdf",
    bytes: 1024,
    categoria: "contrato",
    visivel_portal: false,
    enviado_por: "perfil-1",
    criado_em: "2026-05-06T00:00:00.000Z",
    arquivado: false,
    ...parcial,
  };
}

function notaDe(parcial: Partial<Nota> = {}): Nota {
  return {
    id: "nota-1",
    alunoId: "aluno-1",
    autor: "Jefson",
    texto: "Cliente pediu para ligar depois do almoço",
    criadoEm: "2026-05-12T10:00:00.000Z",
    ...parcial,
  };
}

function atividadeDe(parcial: Partial<Atividade> = {}): Atividade {
  return {
    id: "ativ-1",
    alunoId: "aluno-1",
    tipo: "ligacao",
    titulo: "Ligação de retomada",
    detalhe: "Falamos sobre o próximo passo",
    data: "2026-05-13T10:00:00.000Z",
    ...parcial,
  };
}

function interacaoDe(parcial: Partial<Interacao> = {}): Interacao {
  return {
    id: "int-1",
    alunoId: "aluno-1",
    canal: "whatsapp",
    direcao: "recebida",
    texto: "Bom dia, consigo remarcar?",
    quando: "2026-05-19T10:00:00.000Z",
    idExterno: "wa-1",
    tipoMidia: "",
    nomeExibicao: "Ana",
    telefone: "11988887777",
    ...parcial,
  };
}

/** O conjunto completo de respostas do banco, com todas as tabelas cheias. */
function respostasCheias(mentorado: Record<string, unknown> = linhaMentorado()): Record<string, RespostaTabela> {
  return {
    mentorado: { data: mentorado, error: null },
    matricula: { data: [linhaMatricula()], error: null },
    sessao: {
      data: [
        linhaSessao(),
        linhaSessao({ id: "ses-2", numero: 2, quando: "2026-05-08T14:00:00.000Z", resumo: "Revisão da meta" }),
      ],
      error: null,
    },
    tarefa_mentoria: { data: [linhaTarefa()], error: null },
    marco: { data: [linhaMarco()], error: null },
    score_evolucao: {
      data: [linhaScore(), linhaScore({ id: "sco-2", semana: "2026-05-11T00:00:00.000Z", score: 70 })],
      error: null,
    },
    documento: { data: [linhaDocumento()], error: null },
  };
}

// ============================================================
// Sem Supabase configurado
// ============================================================

describe("lerHistorico sem Supabase configurado", () => {
  it("não faz consulta nenhuma e devolve conectado: false com fatos vazios", async () => {
    const cliente = ligarCliente(respostasCheias());
    ligarCrm();

    const resultado = await lerHistorico("ment-1", AGORA);

    expect(resultado.conectado).toBe(false);
    expect(resultado.motivo).not.toBe("");
    expect(resultado.fatos).toEqual([]);
    expect(cliente.from).not.toHaveBeenCalled();
    expect(criarSupabaseServerMock).not.toHaveBeenCalled();
    expect(getDBMock).not.toHaveBeenCalled();
  });

  it("devolve saúde sem base — nunca score 0 disfarçado de dado", async () => {
    ligarCliente(respostasCheias());
    ligarCrm();

    const resultado = await lerHistorico("ment-1", AGORA);

    expect(resultado.saude.score).toBeNull();
    expect(resultado.saude.semBase).toBe(true);
  });
});

// ============================================================
// Mentorado SEM aluno_id — o CRM não é sequer consultado
// ============================================================

describe("lerHistorico de mentorado sem aluno vinculado", () => {
  it("não dispara consulta nenhuma às tabelas de CRM", async () => {
    ligarSupabase();
    ligarCliente(respostasCheias(linhaMentorado({ aluno_id: null })));
    ligarCrm({ notas: [notaDe()], atividades: [atividadeDe()], interacoes: [interacaoDe()] });

    const resultado = await lerHistorico("ment-1", AGORA);

    expect(resultado.conectado).toBe(true);
    expect(listNotasMock).not.toHaveBeenCalled();
    expect(listAtividadesMock).not.toHaveBeenCalled();
    expect(listInteracoesMock).not.toHaveBeenCalled();
    expect(getDBMock).not.toHaveBeenCalled();
  });

  it("o histórico sai só com fatos de mentoria, e nenhum fato de CRM", async () => {
    ligarSupabase();
    ligarCliente(respostasCheias(linhaMentorado({ aluno_id: null })));
    // Os dublês de CRM respondem lista cheia de propósito: se a leitura
    // chamasse mesmo assim, o fato apareceria e o teste morreria aqui.
    ligarCrm({ notas: [notaDe()], atividades: [atividadeDe()], interacoes: [interacaoDe()] });

    const { fatos } = await lerHistorico("ment-1", AGORA);
    const tipos = new Set(fatos.map((f) => f.tipo));

    expect(tipos.has("sessao")).toBe(true);
    expect(tipos.has("tarefa")).toBe(true);
    expect(tipos.has("marco")).toBe(true);
    expect(tipos.has("score")).toBe(true);
    expect(tipos.has("documento_interno")).toBe(true);
    expect(tipos.has("nota")).toBe(false);
    expect(tipos.has("atividade")).toBe(false);
    expect(tipos.has("interacao")).toBe(false);
    expect(tipos.has("temperatura")).toBe(false);
  });

  it("documento arquivado continua na linha do tempo, e como fato interno", async () => {
    ligarSupabase();
    const respostas = respostasCheias(linhaMentorado({ aluno_id: null }));
    // Arquivado E marcado como visível no portal: o pior par possível. A
    // linha não some do histórico do time (a casa não apaga), e mesmo assim
    // não pode nascer pública.
    respostas.documento = {
      data: [linhaDocumento({ arquivado: true, visivel_portal: true })],
      error: null,
    };
    ligarCliente(respostas);
    ligarCrm();

    const { fatos } = await lerHistorico("ment-1", AGORA);
    const documentos = fatos.filter((f) => f.tipo === "documento_interno" || f.tipo === "documento_portal");

    expect(documentos).toHaveLength(1);
    expect(documentos[0].tipo).toBe("documento_interno");
    expect(documentos[0].visibilidade).toBe("interno");
  });

  it("não é histórico parcial: nada faltou, nada falhou", async () => {
    ligarSupabase();
    ligarCliente(respostasCheias(linhaMentorado({ aluno_id: null })));
    ligarCrm();

    const resultado = await lerHistorico("ment-1", AGORA);

    // Ausência de aluno vinculado é um FATO da ficha, não uma leitura que
    // falhou — marcar `parcial` aqui faria a tela avisar de um problema que
    // não existe, e o aviso perderia o sentido quando houvesse um de verdade.
    expect(resultado.parcial).toBe(false);
  });
});

// ============================================================
// Mentorado COM aluno_id — as duas metades na mesma série
// ============================================================

describe("lerHistorico de mentorado com aluno vinculado", () => {
  it("junta as duas metades numa série ordenada do mais recente para o mais antigo", async () => {
    ligarSupabase();
    ligarCliente(respostasCheias(linhaMentorado({ aluno_id: "aluno-1" })));
    ligarCrm({ notas: [notaDe()], atividades: [atividadeDe()], interacoes: [interacaoDe()] });

    const { fatos, parcial } = await lerHistorico("ment-1", AGORA);
    const tipos = new Set(fatos.map((f) => f.tipo));

    expect(parcial).toBe(false);
    expect(tipos.has("sessao")).toBe(true);
    expect(tipos.has("nota")).toBe(true);
    expect(tipos.has("atividade")).toBe(true);
    expect(tipos.has("interacao")).toBe(true);

    const instantes = fatos.map((f) => Date.parse(f.quando)).filter((t) => Number.isFinite(t));
    const decrescente = [...instantes].sort((a, b) => b - a);
    expect(instantes).toEqual(decrescente);
  });

  it("pergunta ao CRM pelo `aluno_id` da ficha, não pelo id do mentorado", async () => {
    ligarSupabase();
    ligarCliente(respostasCheias(linhaMentorado({ aluno_id: "aluno-1" })));
    ligarCrm();

    await lerHistorico("ment-1", AGORA);

    expect(listNotasMock).toHaveBeenCalledWith("aluno-1");
    expect(listAtividadesMock).toHaveBeenCalledWith("aluno-1");
    expect(listInteracoesMock).toHaveBeenCalledWith("aluno-1");
  });

  it("é a tela do TIME: o fato interno continua na série (quem filtra é o portal)", async () => {
    ligarSupabase();
    ligarCliente(respostasCheias(linhaMentorado({ aluno_id: "aluno-1" })));
    ligarCrm({ notas: [notaDe()], atividades: [], interacoes: [] });

    const { fatos } = await lerHistorico("ment-1", AGORA);
    const internos = fatos.filter((f) => visibilidadeDoTipo(f.tipo) === "interno");

    expect(internos.length).toBeGreaterThan(0);
    expect(internos.every((f) => f.visibilidade === "interno")).toBe(true);
  });
});

// ============================================================
// Falha em UMA consulta não zera as outras
// ============================================================

describe("lerHistorico com uma consulta falhando", () => {
  it("mantém os fatos das outras consultas e avisa a tela com parcial: true", async () => {
    ligarSupabase();
    const respostas = respostasCheias(linhaMentorado({ aluno_id: "aluno-1" }));
    respostas.marco = { data: null, error: { code: "42501", message: "permission denied for table marco" } };
    ligarCliente(respostas);
    ligarCrm({ notas: [notaDe()], atividades: [atividadeDe()], interacoes: [interacaoDe()] });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const resultado = await lerHistorico("ment-1", AGORA);
    const tipos = new Set(resultado.fatos.map((f) => f.tipo));

    // O detalhe técnico existe — só que no log, nunca no que a tela lê.
    expect(warnSpy).toHaveBeenCalled();
    expect(resultado.conectado).toBe(true);
    expect(resultado.parcial).toBe(true);
    expect(tipos.has("marco")).toBe(false);
    // O resto sobreviveu inteiro — é isto que "não zera as outras" quer dizer.
    expect(tipos.has("sessao")).toBe(true);
    expect(tipos.has("tarefa")).toBe(true);
    expect(tipos.has("score")).toBe(true);
    expect(tipos.has("documento_interno")).toBe(true);
    expect(tipos.has("nota")).toBe(true);
    expect(tipos.has("interacao")).toBe(true);
  });

  it("exceção síncrona do cliente numa tabela também é parcial, não queda", async () => {
    ligarSupabase();
    ligarCliente(respostasCheias(linhaMentorado({ aluno_id: "aluno-1" })), "score_evolucao");
    ligarCrm();
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const resultado = await lerHistorico("ment-1", AGORA);
    const tipos = new Set(resultado.fatos.map((f) => f.tipo));

    expect(resultado.conectado).toBe(true);
    expect(resultado.parcial).toBe(true);
    expect(tipos.has("score")).toBe(false);
    expect(tipos.has("sessao")).toBe(true);
  });

  it("falha SÓ no CRM não derruba a metade da mentoria", async () => {
    ligarSupabase();
    ligarCliente(respostasCheias(linhaMentorado({ aluno_id: "aluno-1" })));
    ligarCrm();
    listNotasMock.mockRejectedValue(new Error("provider do CRM fora do ar"));
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const resultado = await lerHistorico("ment-1", AGORA);
    const tipos = new Set(resultado.fatos.map((f) => f.tipo));

    expect(resultado.conectado).toBe(true);
    expect(resultado.parcial).toBe(true);
    expect(tipos.has("nota")).toBe(false);
    expect(tipos.has("sessao")).toBe(true);
  });

  it("histórico completo nunca sai marcado como parcial", async () => {
    ligarSupabase();
    ligarCliente(respostasCheias(linhaMentorado({ aluno_id: "aluno-1" })));
    ligarCrm({ notas: [notaDe()], atividades: [atividadeDe()], interacoes: [interacaoDe()] });

    const resultado = await lerHistorico("ment-1", AGORA);

    expect(resultado.parcial).toBe(false);
  });
});

// ============================================================
// `motivo` não vaza o mapa do banco
// ============================================================

describe("motivo que vai para a tela", () => {
  // Nome de tabela, de coluna e vocabulário de SQL: nada disso pode aparecer
  // no texto que uma pessoa lê na tela (mesma regra de `dados.ts` e
  // `documentos/dados.ts`). O detalhe técnico vive só no `console.warn`.
  const PROIBIDOS = [
    "mentorado",
    "matricula",
    "matrícula",
    "sessao",
    "sessão",
    "tarefa_mentoria",
    "score_evolucao",
    "documento",
    "nota",
    "atividade",
    "interacao",
    "interação",
    "select",
    "from",
    "where",
    "sql",
    "permission denied",
    "42501",
  ];

  function conferirMotivo(motivo: string) {
    const minusculo = motivo.toLowerCase();
    for (const proibido of PROIBIDOS) {
      expect(minusculo).not.toContain(proibido);
    }
  }

  it("sem Supabase configurado, o motivo não nomeia tabela nem coluna", async () => {
    ligarCliente(respostasCheias());
    ligarCrm();

    const { motivo } = await lerHistorico("ment-1", AGORA);

    expect(motivo).not.toBe("");
    conferirMotivo(motivo);
  });

  it("com erro na leitura da ficha, o motivo não nomeia tabela nem repete o erro do banco", async () => {
    ligarSupabase();
    const respostas = respostasCheias();
    respostas.mentorado = {
      data: null,
      error: { code: "42501", message: "permission denied for table mentorado" },
    };
    ligarCliente(respostas);
    ligarCrm();
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const resultado = await lerHistorico("ment-1", AGORA);

    expect(resultado.conectado).toBe(false);
    expect(resultado.motivo).not.toBe("");
    conferirMotivo(resultado.motivo);
  });

  it("conectado, o motivo é vazio — texto de erro sobrando é erro que ninguém teve", async () => {
    ligarSupabase();
    ligarCliente(respostasCheias());
    ligarCrm();

    const { motivo } = await lerHistorico("ment-1", AGORA);

    expect(motivo).toBe("");
  });
});

// ============================================================
// A ficha não encontrada não é falha de conexão
// ============================================================

describe("mentorado que não existe", () => {
  it("conectou e não achou: conectado true, fatos vazios, saúde sem base, e nenhuma consulta dependente", async () => {
    ligarSupabase();
    const respostas = respostasCheias();
    respostas.mentorado = { data: null, error: null };
    const cliente = ligarCliente(respostas);
    ligarCrm();

    const resultado = await lerHistorico("ment-inexistente", AGORA);
    const tabelasConsultadas = cliente.from.mock.calls.map((c) => c[0]);

    expect(resultado.conectado).toBe(true);
    expect(resultado.motivo).toBe("");
    expect(resultado.fatos).toEqual([]);
    expect(resultado.saude.semBase).toBe(true);
    expect(resultado.saude.score).toBeNull();
    expect(tabelasConsultadas).toEqual(["mentorado"]);
    expect(listNotasMock).not.toHaveBeenCalled();
  });
});

// ============================================================
// A saúde é a MESMA conta de `saude-mentorado.ts` — não uma segunda
// ============================================================

describe("saúde devolvida junto com o histórico", () => {
  it("é idêntica ao que `saudeDoMentorado` devolve com os mesmos dados", async () => {
    ligarSupabase();
    ligarCliente(respostasCheias(linhaMentorado({ aluno_id: "aluno-1" })));
    ligarCrm({ notas: [notaDe()], atividades: [atividadeDe()], interacoes: [interacaoDe()] });

    const resultado = await lerHistorico("ment-1", AGORA);

    // As mesmas linhas cruas das fixtures, convertidas pelos MESMOS
    // mapeadores que a leitura usa, entregues direto ao módulo puro. Se
    // `dados-historico.ts` tivesse uma segunda conta (um arredondamento
    // próprio, um fator a mais, um recorte diferente de sessões), os dois
    // objetos não bateriam.
    const respostas = respostasCheias(linhaMentorado({ aluno_id: "aluno-1" }));
    const esperada = saudeDoMentorado(
      {
        matriculas: (respostas.matricula.data as Record<string, unknown>[]).map((r) => ({
          matricula: linhaParaMatricula(r),
          programa: linhaParaProgramaOuNulo(r),
        })),
        sessoes: (respostas.sessao.data as Record<string, unknown>[]).map(linhaParaSessao),
        tarefas: (respostas.tarefa_mentoria.data as Record<string, unknown>[]).map(linhaParaTarefaMentoria),
        scores: (respostas.score_evolucao.data as Record<string, unknown>[]).map(linhaParaScoreEvolucao),
      },
      AGORA
    );

    expect(resultado.saude).toEqual(esperada);
    expect(resultado.saude.score).not.toBeNull();
  });

  it("os marcos lidos não entram na conta da saúde — a fixture prova que a série existe mesmo assim", async () => {
    ligarSupabase();
    ligarCliente(respostasCheias());
    ligarCrm();

    const resultado = await lerHistorico("ment-1", AGORA);
    const marcos = resultado.fatos.filter((f) => f.tipo === "marco");

    expect(marcos.map((f) => f.titulo)).toEqual([`Marco: ${linhaParaMarco(linhaMarco()).titulo}`]);
  });
});

// ============================================================
// O recorte por mentorado sai no PEDIDO, não só em memória
// ============================================================

describe("o que cada consulta pede ao banco", () => {
  it("pede tarefa, marco, score, matrícula e documento SÓ deste mentorado", async () => {
    ligarSupabase();
    const cliente = ligarCliente(respostasCheias(linhaMentorado({ aluno_id: null })));
    ligarCrm();

    await lerHistorico("ment-1", AGORA);

    const pedidoDe = (tabela: string) => cliente.consultas.find((c) => c.tabela === tabela);

    // A RLS é a garantia de que a ficha de outra pessoa não aparece; este
    // recorte é o que evita puxar o workspace inteiro para descartar em
    // memória. Sem esta asserção, ele pode cair num refactor em silêncio.
    for (const tabela of ["matricula", "tarefa_mentoria", "marco", "score_evolucao", "documento"]) {
      expect(pedidoDe(tabela)?.eq).toContainEqual(["mentorado_id", "ment-1"]);
    }
    // A ficha é pedida pelo id dela, e de um em um (`maybeSingle`).
    expect(pedidoDe("mentorado")?.eq).toContainEqual(["id", "ment-1"]);
  });

  it("a sessão é a única sem recorte no banco — e por isso o recorte dela em memória é obrigatório", async () => {
    ligarSupabase();
    const cliente = ligarCliente(respostasCheias(linhaMentorado({ aluno_id: null })));
    ligarCrm();

    await lerHistorico("ment-1", AGORA);

    // `sessao` não carrega `mentorado_id` (0006: ou `matricula_id` ou
    // `turma_id`), então não há `.eq` possível. Este teste existe para
    // documentar POR QUE a exceção é aceitável e para que ela não vire regra
    // sem alguém decidir — quem prova que o recorte em memória acontece é o
    // teste da sessão alheia, logo abaixo.
    expect(cliente.consultas.find((c) => c.tabela === "sessao")?.eq).toEqual([]);
  });
});

// ============================================================
// Sessão de OUTRO mentorado do mesmo workspace
// ============================================================

describe("sessão que não é desta pessoa", () => {
  /** A mesma fixture das duas asserções: uma sessão da pessoa, uma de outra. */
  function respostasComSessaoAlheia() {
    const respostas = respostasCheias(linhaMentorado({ aluno_id: null }));
    respostas.sessao = {
      data: [
        linhaSessao(),
        // Mesmo workspace, matrícula de OUTRO mentorado: é exatamente o que a
        // consulta sem `.eq` traz do banco para um papel dono ou gestor.
        linhaSessao({
          id: "ses-99",
          matricula_id: "mat-99",
          numero: 3,
          quando: "2026-05-18T14:00:00.000Z",
          resumo: "SEGREDO DE OUTRO MENTORADO",
        }),
      ],
      error: null,
    };
    return respostas;
  }

  it("não entra na linha do tempo — nem o resumo dela vaza para a tela", async () => {
    ligarSupabase();
    ligarCliente(respostasComSessaoAlheia());
    ligarCrm();

    const { fatos } = await lerHistorico("ment-1", AGORA);
    const sessoes = fatos.filter((f) => f.tipo === "sessao");

    expect(sessoes).toHaveLength(1);
    expect(JSON.stringify(fatos)).not.toContain("SEGREDO DE OUTRO MENTORADO");
  });

  it("não entra na conta da saúde — o score é o das sessões DESTA matrícula", async () => {
    ligarSupabase();
    ligarCliente(respostasComSessaoAlheia());
    ligarCrm();

    const resultado = await lerHistorico("ment-1", AGORA);

    // A referência é montada com a sessão da pessoa e SÓ com ela: se a leitura
    // entregasse à conta a lista inteira do workspace, o silêncio seria medido
    // pela sessão alheia (2026-05-18, quase hoje) em vez da real (2026-04-10),
    // e o score subiria por causa de um encontro de outra pessoa.
    const esperada = saudeDoMentorado(
      {
        matriculas: [{ matricula: linhaParaMatricula(linhaMatricula()), programa: linhaParaProgramaOuNulo(linhaMatricula()) }],
        sessoes: [linhaParaSessao(linhaSessao())],
        tarefas: [linhaParaTarefaMentoria(linhaTarefa())],
        scores: (respostasCheias().score_evolucao.data as Record<string, unknown>[]).map(linhaParaScoreEvolucao),
      },
      AGORA
    );

    expect(resultado.saude).toEqual(esperada);
    expect(resultado.saude.score).not.toBeNull();
  });
});

// ============================================================
// A saúde nunca é calculada sobre leitura que falhou
// ============================================================

describe("saúde quando uma leitura que a alimenta não voltou", () => {
  // As quatro tabelas que entram na conta. A lista vazia de uma leitura que
  // falhou NÃO quer dizer "não houve" — e entregá-la à conta como se
  // quisesse é o jeito de transformar um `permission denied` num número que
  // a tela apresenta como medição.
  const TABELAS_DA_CONTA = ["matricula", "sessao", "tarefa_mentoria", "score_evolucao"];

  it.each(TABELAS_DA_CONTA)("falha em %s deixa a saúde sem base, nunca com nota", async (tabela) => {
    ligarSupabase();
    const respostas = respostasCheias(linhaMentorado({ aluno_id: null }));
    respostas[tabela] = { data: null, error: { code: "42501", message: `permission denied for table ${tabela}` } };
    ligarCliente(respostas);
    ligarCrm();
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const resultado = await lerHistorico("ment-1", AGORA);

    expect(resultado.parcial).toBe(true);
    expect(resultado.saude.score).toBeNull();
    expect(resultado.saude.semBase).toBe(true);
    expect(resultado.saude.fatores.some((f) => f.temBase)).toBe(false);
  });

  it("a sessão que não foi lida não vira 'zero sessões esperadas' no fator ritmo", async () => {
    ligarSupabase();
    const respostas = respostasCheias(linhaMentorado({ aluno_id: null }));
    // O caso concreto: a matrícula (2026-03-01 → 2026-08-01, 8 sessões) foi
    // lida, a sessão não. O denominador do ritmo vem da matrícula, então o
    // fator pontuaria `0 de 4,2 esperadas` — nota baixa produzida por uma
    // leitura que falhou, na ficha de quem talvez esteja em dia.
    respostas.sessao = { data: null, error: { code: "42501", message: "permission denied for table sessao" } };
    ligarCliente(respostas);
    ligarCrm();
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const resultado = await lerHistorico("ment-1", AGORA);
    const ritmo = resultado.saude.fatores.find((f) => f.chave === "ritmo");

    expect(ritmo?.temBase).toBe(false);
    expect(ritmo?.pontos).toBeNull();
    expect(resultado.saude.score).toBeNull();
  });

  it("leitura completa continua produzindo score — a regra não apagou o caso normal", async () => {
    ligarSupabase();
    ligarCliente(respostasCheias(linhaMentorado({ aluno_id: null })));
    ligarCrm();

    const resultado = await lerHistorico("ment-1", AGORA);

    expect(resultado.parcial).toBe(false);
    expect(resultado.saude.score).not.toBeNull();
    expect(resultado.saude.semBase).toBe(false);
  });

  it("falha SÓ no CRM ou nos arquivos não apaga o score — nenhuma das duas entra na conta", async () => {
    ligarSupabase();
    const respostas = respostasCheias(linhaMentorado({ aluno_id: "aluno-1" }));
    respostas.documento = { data: null, error: { code: "42501", message: "permission denied for table documento" } };
    ligarCliente(respostas);
    ligarCrm();
    listNotasMock.mockRejectedValue(new Error("provider do CRM fora do ar"));
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const resultado = await lerHistorico("ment-1", AGORA);

    expect(resultado.parcial).toBe(true);
    expect(resultado.saude.score).not.toBeNull();
  });
});

// ============================================================
// `aluno_id` que existe mas não vale nada
// ============================================================

describe("ficha com aluno_id vazio", () => {
  it("não pergunta ao CRM com id vazio — id falsy é 'sem filtro' do outro lado", async () => {
    ligarSupabase();
    ligarCliente(respostasCheias(linhaMentorado({ aluno_id: "" })));
    ligarCrm({ notas: [notaDe()], atividades: [atividadeDe()], interacoes: [interacaoDe()] });

    const { fatos, parcial } = await lerHistorico("ment-1", AGORA);
    const tipos = new Set(fatos.map((f) => f.tipo));

    // `listAtividades("")` e `listInteracoes("")` devolvem o workspace INTEIRO
    // (o provider trata id falsy como ausência de filtro): as conversas de
    // WhatsApp de todos os leads cairiam na linha do tempo de uma pessoa só.
    expect(getDBMock).not.toHaveBeenCalled();
    expect(listNotasMock).not.toHaveBeenCalled();
    expect(listAtividadesMock).not.toHaveBeenCalled();
    expect(listInteracoesMock).not.toHaveBeenCalled();
    expect(tipos.has("nota")).toBe(false);
    expect(tipos.has("atividade")).toBe(false);
    expect(tipos.has("interacao")).toBe(false);
    // Ficha sem aluno vinculado não é leitura que falhou (a mesma regra do
    // `aluno_id: null`).
    expect(parcial).toBe(false);
  });
});

// ============================================================
// Simulação ligada — as duas metades deixariam de ser a mesma pessoa
// ============================================================

describe("com o modo simulação ligado no navegador", () => {
  it("não afirma 'nada anotado no CRM' com dado de demonstração", async () => {
    ligarSupabase();
    estadoSimulacao.ligada = true;
    ligarCliente(respostasCheias(linhaMentorado({ aluno_id: "aluno-1" })));
    ligarCrm();
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const resultado = await lerHistorico("ment-1", AGORA);
    const tipos = new Set(resultado.fatos.map((f) => f.tipo));

    // A metade da mentoria vem do Postgres real (o cliente do servidor não
    // conhece simulação); a do CRM viria do provider de demonstração, que
    // filtra por um `aluno_id` fictício e devolveria três listas vazias com
    // cara de resposta. Duas pessoas diferentes na mesma linha do tempo.
    expect(getDBMock).not.toHaveBeenCalled();
    expect(tipos.has("nota")).toBe(false);
    expect(tipos.has("atividade")).toBe(false);
    expect(tipos.has("interacao")).toBe(false);
    // Não deu para ler o CRM desta pessoa — e isso a tela precisa dizer.
    expect(resultado.parcial).toBe(true);
    // A metade da mentoria continua inteira.
    expect(tipos.has("sessao")).toBe(true);
  });

  it("com a simulação desligada, o CRM é lido normalmente", async () => {
    ligarSupabase();
    ligarCliente(respostasCheias(linhaMentorado({ aluno_id: "aluno-1" })));
    ligarCrm({ notas: [notaDe()], atividades: [atividadeDe()], interacoes: [interacaoDe()] });

    const resultado = await lerHistorico("ment-1", AGORA);
    const tipos = new Set(resultado.fatos.map((f) => f.tipo));

    expect(tipos.has("nota")).toBe(true);
    expect(resultado.parcial).toBe(false);
  });
});
