// Testes de `portal.ts` — a camada de LEITURA do Portal do Mentorado.
//
// Mesmo dublê de cliente Supabase de `dados.test.ts` (`vi.mock` em
// "../supabase/server", `vi.hoisted` para escapar do TDZ do `vi.mock`
// içado), com UM acréscimo: `portal.ts` também chama `.rpc("mentorado_atual")`
// — a mesma função SQL que toda política de RLS do grupo 3 (0007/0008) usa
// para decidir "quem está logado é qual mentorado". O dublê aqui simula essa
// chamada também, porque é dela que `lerPortal` decide `ehMentorado`.

import { afterEach, describe, expect, it, vi } from "vitest";

const { criarSupabaseServerMock } = vi.hoisted(() => ({
  criarSupabaseServerMock: vi.fn(),
}));

vi.mock("../supabase/server", () => ({
  criarSupabaseServer: criarSupabaseServerMock,
}));

const { lerPortal } = await import("./portal");

// ============================================================
// Dublê do cliente Supabase
// ============================================================

type RespostaTabela = {
  data: unknown;
  error: { code?: string; message?: string } | null;
};

type RespostaRpc = {
  data: unknown;
  error: { code?: string; message?: string } | null;
};

/**
 * Builder mínimo, mesmo espírito de `dados.test.ts`: encadeia
 * `.select()`/`.eq()`/`.maybeSingle()` sem interpretar os argumentos — quem
 * decide a resposta é o teste, via `respostas`, chaveado por nome de
 * tabela. `rpc` é um mock à parte (não é um builder de tabela).
 *
 * BAIXO 7 da auditoria — `select()` agora TAMBÉM é registrado (não só
 * ignorado): `selecoes[tabela]` guarda o argumento cru de cada chamada, na
 * ordem em que aconteceram. É o que permite ao teste de BAIXO 7 provar QUE
 * COLUNA foi pedida ao Postgres para `sessao`, sem precisar de um Postgres
 * de verdade — o dublê não interpreta a string, só a guarda.
 */
function construirCliente(
  respostas: Record<string, RespostaTabela>,
  respostaRpc: RespostaRpc,
  jogaExcecaoEm?: string
): { from: ReturnType<typeof vi.fn>; rpc: ReturnType<typeof vi.fn>; selecoes: Record<string, unknown[]> } {
  const selecoes: Record<string, unknown[]> = {};
  const fromMock = vi.fn((tabela: string) => {
    if (jogaExcecaoEm === tabela) {
      throw new Error("falha de rede simulada");
    }
    const resposta: RespostaTabela = respostas[tabela] ?? { data: [], error: null };
    const builder = {
      select: (colunas?: unknown) => {
        (selecoes[tabela] ??= []).push(colunas);
        return builder;
      },
      eq: () => builder,
      order: () => builder,
      maybeSingle: () => Promise.resolve(resposta),
      then: (resolve: (v: RespostaTabela) => void, reject: (e: unknown) => void) =>
        Promise.resolve(resposta).then(resolve, reject),
    };
    return builder;
  });
  const rpcMock = vi.fn(() => Promise.resolve(respostaRpc));
  return { from: fromMock, rpc: rpcMock, selecoes };
}

function ligarCliente(
  respostas: Record<string, RespostaTabela>,
  respostaRpc: RespostaRpc,
  jogaExcecaoEm?: string
) {
  const cliente = construirCliente(respostas, respostaRpc, jogaExcecaoEm);
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
});

// ============================================================
// Fixtures — linhas CRUAS (snake_case), como o Postgres devolveria.
// ============================================================

function linhaMentorado(parcial: Partial<Record<string, unknown>> = {}) {
  return {
    id: "ment-1",
    workspace_id: "ws-1",
    aluno_id: null,
    perfil_id: "perfil-1",
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

function linhaTarefa(parcial: Partial<Record<string, unknown>> = {}) {
  return {
    id: `tarefa-${Math.random()}`,
    workspace_id: "ws-1",
    mentorado_id: "ment-1",
    sessao_id: null,
    titulo: "Fazer algo",
    prazo: null,
    concluida: false,
    marcada_por: "",
    criado_em: "2026-01-01T00:00:00Z",
    ...parcial,
  };
}

function linhaMarco(parcial: Partial<Record<string, unknown>> = {}) {
  return {
    id: `marco-${Math.random()}`,
    workspace_id: "ws-1",
    mentorado_id: "ment-1",
    titulo: "Primeira venda",
    descricao: "",
    conquistado_em: "2026-01-01",
    criado_em: "2026-01-01T00:00:00Z",
    ...parcial,
  };
}

function linhaScore(parcial: Partial<Record<string, unknown>> = {}) {
  return {
    id: `score-${Math.random()}`,
    workspace_id: "ws-1",
    mentorado_id: "ment-1",
    semana: "2026-01-05",
    score: 80,
    motivo: "",
    criado_em: "2026-01-01T00:00:00Z",
    ...parcial,
  };
}

function linhaConteudo(parcial: Partial<Record<string, unknown>> = {}) {
  return {
    id: `conteudo-${Math.random()}`,
    workspace_id: "ws-1",
    mentorado_id: "ment-1",
    titulo: "Aula 1",
    url: "https://exemplo.com/aula-1",
    liberado_em: "2026-01-01T00:00:00Z",
    criado_em: "2026-01-01T00:00:00Z",
    ...parcial,
  };
}

/** Conjunto vazio para as tabelas dependentes — usado quando o teste só quer preencher `mentorado`/`matricula`/`sessao` e ignorar o resto. */
function tabelasVazias(): Record<string, RespostaTabela> {
  return {
    tarefa_mentoria: { data: [], error: null },
    marco: { data: [], error: null },
    score_evolucao: { data: [], error: null },
    conteudo_liberado: { data: [], error: null },
  };
}

const AGORA = "2026-08-12T00:00:00Z";

// ============================================================
// Sem Supabase configurado
// ============================================================

describe("lerPortal — sem Supabase configurado", () => {
  it("devolve conectado:false e ZERO consultas (nem o rpc de identidade é chamado)", async () => {
    const resultado = await lerPortal(AGORA);

    expect(resultado.conectado).toBe(false);
    expect(resultado.ehMentorado).toBe(false);
    expect(resultado.mentorado).toBeNull();
    expect(resultado.matriculas).toEqual([]);
    expect(resultado.sessoes).toEqual([]);
    expect(resultado.tarefas).toEqual([]);
    expect(resultado.marcos).toEqual([]);
    expect(resultado.scores).toEqual([]);
    expect(resultado.conteudos).toEqual([]);
    expect(resultado.proxima).toBeNull();
    expect(resultado.motivo.length).toBeGreaterThan(0);
    expect(criarSupabaseServerMock).not.toHaveBeenCalled();
  });
});

// ============================================================
// Erro na consulta
// ============================================================

describe("lerPortal — erro na consulta", () => {
  it("erro no rpc mentorado_atual: conectado:false, motivo sem detalhe técnico, console.warn chamado", async () => {
    ligarSupabase();
    ligarCliente(
      { ...tabelasVazias() },
      { data: null, error: { code: "42501", message: 'permission denied for function "mentorado_atual"' } }
    );
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const resultado = await lerPortal(AGORA);

    expect(resultado.conectado).toBe(false);
    expect(resultado.motivo.toLowerCase()).not.toContain("mentorado_atual");
    expect(resultado.motivo.toLowerCase()).not.toContain("function");
    expect(resultado.motivo.toLowerCase()).not.toContain("42501");
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it("erro numa tabela dependente (matricula): conectado:false, motivo sem nome de tabela, console.warn chamado", async () => {
    ligarSupabase();
    ligarCliente(
      {
        mentorado: { data: linhaMentorado(), error: null },
        matricula: {
          data: null,
          error: { code: "42501", message: 'permission denied for table "matricula"' },
        },
        sessao: { data: [], error: null },
        ...tabelasVazias(),
      },
      { data: "ment-1", error: null }
    );
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const resultado = await lerPortal(AGORA);

    expect(resultado.conectado).toBe(false);
    expect(resultado.motivo.toLowerCase()).not.toContain("matricula");
    expect(resultado.motivo.toLowerCase()).not.toContain("table");
    expect(resultado.motivo.toLowerCase()).not.toContain("select");
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it("exceção lançada pelo cliente: não propaga, conectado:false, console.warn chamado", async () => {
    ligarSupabase();
    ligarCliente(
      {
        mentorado: { data: linhaMentorado(), error: null },
        sessao: { data: [], error: null },
        ...tabelasVazias(),
      },
      { data: "ment-1", error: null },
      "matricula"
    );
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const resultado = await lerPortal(AGORA);

    expect(resultado.conectado).toBe(false);
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });
});

// ============================================================
// Sem linha de mentorado — conectado, mas sem portal
// ============================================================

describe("lerPortal — quem está logado não é mentorado", () => {
  it("mentorado_atual() devolve null: conectado:true, ehMentorado:false, listas vazias, NENHUMA consulta às tabelas dependentes", async () => {
    ligarSupabase();
    const cliente = ligarCliente({ ...tabelasVazias() }, { data: null, error: null });

    const resultado = await lerPortal(AGORA);

    expect(resultado.conectado).toBe(true);
    expect(resultado.motivo).toBe("");
    expect(resultado.ehMentorado).toBe(false);
    expect(resultado.mentorado).toBeNull();
    expect(resultado.matriculas).toEqual([]);
    expect(resultado.sessoes).toEqual([]);
    expect(resultado.tarefas).toEqual([]);
    expect(resultado.marcos).toEqual([]);
    expect(resultado.scores).toEqual([]);
    expect(resultado.conteudos).toEqual([]);
    expect(resultado.proxima).toBeNull();

    // A prova de que "sem mentorado" não gera trabalho à toa: nenhuma
    // tabela foi consultada — só o rpc de identidade.
    expect(cliente.from).not.toHaveBeenCalled();
  });
});

// ============================================================
// Caminho feliz
// ============================================================

describe("lerPortal — caminho feliz", () => {
  it("progresso recalculado, próxima sessão correta, ordem das tarefas provada com prazo nulo no meio", async () => {
    ligarSupabase();
    ligarCliente(
      {
        mentorado: { data: linhaMentorado({ id: "ment-1", nome: "Ana Souza" }), error: null },
        matricula: {
          data: [linhaMatricula({ id: "mat-1", mentorado_id: "ment-1", sessoes_previstas: 12 })],
          error: null,
        },
        sessao: {
          data: [
            linhaSessao({ id: "s1", matricula_id: "mat-1", status: "realizada", quando: "2026-01-05T10:00:00Z" }),
            linhaSessao({ id: "s2", matricula_id: "mat-1", status: "realizada", quando: "2026-01-12T10:00:00Z" }),
            // A "próxima" tem que ser a mais próxima no futuro, não a mais distante.
            linhaSessao({ id: "s3", matricula_id: "mat-1", status: "agendada", quando: "2026-09-01T10:00:00Z" }),
            linhaSessao({ id: "s4", matricula_id: "mat-1", status: "agendada", quando: "2026-08-20T10:00:00Z" }),
          ],
          error: null,
        },
        tarefa_mentoria: {
          data: [
            // Ordem esperada depois de ordenar: t-cedo (não concluída, prazo mais cedo),
            // t-tarde (não concluída, prazo mais tarde), t-sem-prazo (não concluída,
            // prazo nulo — vai por ÚLTIMA dentro das não concluídas), t-feita (concluída,
            // vai para o final independente do prazo dela).
            linhaTarefa({ id: "t-sem-prazo", titulo: "Sem prazo", prazo: null, concluida: false }),
            linhaTarefa({ id: "t-feita", titulo: "Já feita", prazo: "2026-01-01", concluida: true }),
            linhaTarefa({ id: "t-tarde", titulo: "Prazo tarde", prazo: "2026-09-01", concluida: false }),
            linhaTarefa({ id: "t-cedo", titulo: "Prazo cedo", prazo: "2026-08-15", concluida: false }),
          ],
          error: null,
        },
        marco: {
          data: [
            linhaMarco({ id: "m-antigo", conquistado_em: "2026-01-01" }),
            linhaMarco({ id: "m-recente", conquistado_em: "2026-06-01" }),
          ],
          error: null,
        },
        score_evolucao: {
          data: [
            linhaScore({ id: "sc-3", semana: "2026-03-01", score: 70 }),
            linhaScore({ id: "sc-1", semana: "2026-01-01", score: 50 }),
            linhaScore({ id: "sc-2", semana: "2026-02-01", score: 60 }),
          ],
          error: null,
        },
        conteudo_liberado: {
          data: [linhaConteudo({ id: "c-1", titulo: "Aula 1" })],
          error: null,
        },
      },
      { data: "ment-1", error: null }
    );

    const resultado = await lerPortal(AGORA);

    expect(resultado.conectado).toBe(true);
    expect(resultado.motivo).toBe("");
    expect(resultado.ehMentorado).toBe(true);
    expect(resultado.mentorado?.id).toBe("ment-1");

    // Progresso recalculado com `progressoDe`, não lido pronto: 2 sessões
    // realizadas de 12 previstas.
    expect(resultado.matriculas).toHaveLength(1);
    expect(resultado.matriculas[0].progresso.realizadas).toBe(2);
    expect(resultado.matriculas[0].progresso.previstas).toBe(12);

    // Próxima sessão: a mais próxima no futuro (20/08), não a mais distante (01/09).
    expect(resultado.proxima?.id).toBe("s4");

    // Sessões: mais recente primeiro.
    expect(resultado.sessoes.map((s) => s.id)).toEqual(["s3", "s4", "s2", "s1"]);

    // Tarefas: não concluídas primeiro (por prazo crescente, nulo por
    // último dentro do grupo), concluídas por último.
    expect(resultado.tarefas.map((t) => t.id)).toEqual(["t-cedo", "t-tarde", "t-sem-prazo", "t-feita"]);

    // Marcos: mais recente primeiro.
    expect(resultado.marcos.map((m) => m.id)).toEqual(["m-recente", "m-antigo"]);

    // Scores: cronológico crescente (é série temporal).
    expect(resultado.scores.map((s) => s.id)).toEqual(["sc-1", "sc-2", "sc-3"]);

    // Conteúdo liberado.
    expect(resultado.conteudos.map((c) => c.id)).toEqual(["c-1"]);
  });
});

// ============================================================
// Enum desconhecido não vaza
// ============================================================

describe("lerPortal — enum desconhecido não vaza", () => {
  it("status de mentorado 'valor-que-nao-existe' cai no padrão da normalizadora ('lead')", async () => {
    ligarSupabase();
    ligarCliente(
      {
        mentorado: { data: linhaMentorado({ status: "valor-que-nao-existe" }), error: null },
        matricula: { data: [], error: null },
        sessao: { data: [], error: null },
        ...tabelasVazias(),
      },
      { data: "ment-1", error: null }
    );

    const resultado = await lerPortal(AGORA);

    expect(resultado.mentorado?.status).toBe("lead");
  });
});

// ============================================================
// BAIXO 7 — sessao: select explícito de colunas, sem transcricao.
// ============================================================
//
// `lerPortal` fazia `s.from("sessao").select("*")` — puxando `transcricao`
// (o campo mais pesado E mais sensível da tabela: o texto integral de uma
// call gravada) do banco A CADA RENDER do portal, mesmo a tela nunca
// mostrando esse campo. Dado que não vai para a tela não precisa sair do
// banco. A correção lista as colunas explicitamente, deixando `transcricao`
// de fora.

describe("lerPortal — BAIXO 7: select de sessao é explícito e não pede transcricao", () => {
  it("select('*') não é mais usado para sessao — argumento é uma lista de colunas", async () => {
    ligarSupabase();
    const cliente = ligarCliente(
      {
        mentorado: { data: linhaMentorado({ id: "ment-1" }), error: null },
        matricula: { data: [], error: null },
        sessao: { data: [], error: null },
        ...tabelasVazias(),
      },
      { data: "ment-1", error: null }
    );

    await lerPortal(AGORA);

    const chamadasSessao = cliente.selecoes.sessao ?? [];
    expect(chamadasSessao.length).toBeGreaterThan(0);
    for (const colunas of chamadasSessao) {
      expect(typeof colunas).toBe("string");
      const texto = String(colunas);
      expect(texto.trim()).not.toBe("*");
      expect(texto).not.toContain("transcricao");
      // as colunas que a tela de fato usa (ver `linhaParaSessao`,
      // `dados.ts`) continuam sendo pedidas — a mudança é SÓ tirar
      // `transcricao`, não empobrecer o resto do portal.
      for (const coluna of [
        "id",
        "workspace_id",
        "matricula_id",
        "turma_id",
        "numero",
        "quando",
        "duracao_min",
        "status",
        "link_gravacao",
        "resumo",
        "criado_em",
      ]) {
        expect(texto).toContain(coluna);
      }
    }
  });
});

// ============================================================
// A assinatura da função — regra dura #4
// ============================================================

describe("lerPortal — nunca recebe id vindo de fora", () => {
  it("a assinatura tem UM parâmetro só (agoraIso) — quem responde 'quem sou eu' é a sessão + RLS, nunca um id por parâmetro", () => {
    // Este teste é deliberadamente sobre a ASSINATURA, não o comportamento:
    // um id de mentorado como segundo parâmetro (`lerPortal(agoraIso, id)`)
    // seria exatamente o buraco clássico de "trocar o número da URL" para
    // ver o portal de outra pessoa — bastaria a tela (ou um chamador futuro
    // descuidado) passar um id vindo de `params`/query string. Sem esse
    // parâmetro existir, não tem como esse buraco nascer aqui: a única
    // forma de `lerPortal` saber "de quem é esse portal" é perguntar para o
    // banco quem é o usuário autenticado (`mentorado_atual()`, que lê
    // `auth.uid()` — nunca um valor que veio da requisição).
    expect(lerPortal.length).toBe(1);
  });
});
