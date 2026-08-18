// Testes de `lerTrilhas` e `lerMinhaTrilha`.
//
// O QUE ESTA SUÍTE PROVA
// ----------------------
// 1) A LEITURA APAGA O CONTEÚDO DA AULA NÃO LIBERADA. Não é a tela que decide
//    esconder: quando a linha chega ao portal, a `url_video` e o `texto` já
//    vêm vazios. Tela que decide esconder é tela que um dia esquece;
// 2) `lerMinhaTrilha` NÃO recebe id de fora — aridade 1, e a identidade sai de
//    `rpc("mentorado_atual")`. É a mesma defesa de `lerPortal` contra trocar o
//    número na URL;
// 3) sem Supabase configurado, ZERO consultas;
// 4) falha parcial é DITA (`parcial: true`), nunca convertida em lista vazia —
//    lista vazia leria como "esta pessoa não tem trilha nenhuma".

import { afterEach, describe, expect, it, vi } from "vitest";

const criarSupabaseServerMock = vi.fn();
vi.mock("../supabase/server", () => ({ criarSupabaseServer: criarSupabaseServerMock }));

const { lerTrilhas, lerMinhaTrilha } = await import("./dados-trilha");

type Resposta = { data: unknown; error: { code?: string; message?: string } | null };

function cliente(respostas: Record<string, Resposta>, rpc: Resposta = { data: "ment-1", error: null }) {
  const consultadas: string[] = [];
  const rpcMock = vi.fn(() => Promise.resolve(rpc));
  const c = {
    from(tabela: string) {
      consultadas.push(tabela);
      const resposta = respostas[tabela] ?? { data: [], error: null };
      const b: Record<string, unknown> = {};
      b.select = () => b;
      b.eq = () => b;
      b.order = () => b;
      b.maybeSingle = () => Promise.resolve(resposta);
      b.then = (ok: (v: Resposta) => void, err: (e: unknown) => void) =>
        Promise.resolve(resposta).then(ok, err);
      return b;
    },
    rpc: rpcMock,
  };
  criarSupabaseServerMock.mockReturnValue(c);
  return { consultadas, rpcMock };
}

function ligarSupabase() {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://exemplo-teste.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "chave-anonima-de-teste");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});

const AGORA = "2026-08-10T12:00:00.000Z";

function linhaTrilha(over: Record<string, unknown> = {}) {
  return {
    id: "tr-1",
    workspace_id: "ws-1",
    nome: "Fundamentos",
    descricao: "",
    programa_id: "prog-1",
    ativa: true,
    criado_em: "2026-01-01T00:00:00Z",
    ...over,
  };
}

function linhaAula(over: Record<string, unknown> = {}) {
  return {
    id: "au-1",
    workspace_id: "ws-1",
    trilha_id: "tr-1",
    ordem: 1,
    titulo: "Aula 1",
    tipo: "video",
    url_video: "https://youtube.com/watch?v=SEGREDO",
    texto: "O TEXTO INTEIRO DA AULA",
    duracao_min: 30,
    libera_em_dias: 0,
    criado_em: "2026-01-01T00:00:00Z",
    ...over,
  };
}

describe("sem Supabase configurado", () => {
  it("lerTrilhas: zero consultas e diz por quê", async () => {
    const { consultadas } = cliente({});
    const r = await lerTrilhas();

    expect(r.conectado).toBe(false);
    expect(r.motivo).not.toBe("");
    expect(r.trilhas).toEqual([]);
    expect(consultadas).toEqual([]);
  });

  it("lerMinhaTrilha: zero consultas, nem o rpc de identidade", async () => {
    const { consultadas, rpcMock } = cliente({});
    const r = await lerMinhaTrilha(AGORA);

    expect(r.conectado).toBe(false);
    expect(r.trilhas).toEqual([]);
    expect(consultadas).toEqual([]);
    expect(rpcMock).not.toHaveBeenCalled();
  });
});

describe("lerTrilhas — a lista da gestão", () => {
  it("junta cada trilha com as aulas dela", async () => {
    ligarSupabase();
    cliente({
      trilha: { data: [linhaTrilha(), linhaTrilha({ id: "tr-2", nome: "Avançado" })], error: null },
      trilha_aula: {
        data: [linhaAula(), linhaAula({ id: "au-2", trilha_id: "tr-2", titulo: "Outra" })],
        error: null,
      },
    });

    const r = await lerTrilhas();

    expect(r.conectado).toBe(true);
    expect(r.trilhas).toHaveLength(2);
    expect(r.trilhas[0].aulas.map((a) => a.id)).toEqual(["au-1"]);
    expect(r.trilhas[1].aulas.map((a) => a.id)).toEqual(["au-2"]);
  });

  // A gestão MONTA a trilha: precisa ver a url e o texto para conferir o que
  // cadastrou. Quem não pode ver antes da hora é o mentorado.
  it("a gestão enxerga url e texto de todas as aulas", async () => {
    ligarSupabase();
    cliente({
      trilha: { data: [linhaTrilha()], error: null },
      trilha_aula: { data: [linhaAula({ libera_em_dias: 999 })], error: null },
    });

    const r = await lerTrilhas();

    expect(r.trilhas[0].aulas[0].urlVideo).toContain("SEGREDO");
    expect(r.trilhas[0].aulas[0].texto).toContain("O TEXTO INTEIRO");
  });

  it("falha ao ler as aulas é DITA, e a lista não vira vazia em silêncio", async () => {
    ligarSupabase();
    cliente({
      trilha: { data: [linhaTrilha()], error: null },
      trilha_aula: { data: null, error: { code: "42501" } },
    });

    const r = await lerTrilhas();

    expect(r.parcial).toBe(true);
    expect(r.motivo).not.toBe("");
    expect(r.motivo).not.toContain("42501");
  });
});

describe("lerMinhaTrilha — o portal", () => {
  it("tem aridade 1: não há por onde um id entrar", () => {
    expect(lerMinhaTrilha.length).toBe(1);
  });

  it("resolve a identidade por rpc('mentorado_atual')", async () => {
    ligarSupabase();
    const { rpcMock } = cliente({});
    await lerMinhaTrilha(AGORA);

    expect(rpcMock).toHaveBeenCalledWith("mentorado_atual");
  });

  it("sem ficha de mentorado: conectado, mas ehMentorado false e listas vazias", async () => {
    ligarSupabase();
    const { consultadas } = cliente({}, { data: null, error: null });

    const r = await lerMinhaTrilha(AGORA);

    expect(r.conectado).toBe(true);
    expect(r.ehMentorado).toBe(false);
    expect(r.trilhas).toEqual([]);
    // Sem saber quem é, não se consulta trilha nenhuma.
    expect(consultadas).toEqual([]);
  });

  // O CORAÇÃO DESTA TAREFA.
  it("aula NÃO liberada chega com url_video e texto VAZIOS", async () => {
    ligarSupabase();
    cliente({
      trilha_matricula: {
        data: [{ id: "tm-1", workspace_id: "ws-1", mentorado_id: "ment-1", trilha_id: "tr-1", inicio: "2026-08-10", ativa: true, criado_em: "2026-08-10T00:00:00Z" }],
        error: null,
      },
      trilha: { data: [linhaTrilha()], error: null },
      trilha_aula: {
        data: [linhaAula({ id: "aberta", libera_em_dias: 0 }), linhaAula({ id: "fechada", libera_em_dias: 30 })],
        error: null,
      },
      progresso_trilha: { data: [], error: null },
    });

    const r = await lerMinhaTrilha(AGORA);
    const aulas = r.trilhas[0].aulas;
    const aberta = aulas.find((a) => a.id === "aberta");
    const fechada = aulas.find((a) => a.id === "fechada");

    expect(aberta?.liberada).toBe(true);
    expect(aberta?.urlVideo).toContain("SEGREDO");

    expect(fechada?.liberada).toBe(false);
    expect(fechada?.urlVideo).toBe("");
    // O texto também: uma aula do tipo "texto" vazaria inteira se só a url
    // fosse apagada — é a porta do lado, e ela fica fechada junto.
    expect(fechada?.texto).toBe("");
    // O título continua, para a pessoa ver o que vem pela frente.
    expect(fechada?.titulo).toBe("Aula 1");
    expect(fechada?.motivo).not.toBe("");
  });

  it("nenhum segredo de aula fechada aparece em lugar nenhum do retorno", async () => {
    ligarSupabase();
    cliente({
      trilha_matricula: {
        data: [{ id: "tm-1", workspace_id: "ws-1", mentorado_id: "ment-1", trilha_id: "tr-1", inicio: "2026-08-10", ativa: true, criado_em: "2026-08-10T00:00:00Z" }],
        error: null,
      },
      trilha: { data: [linhaTrilha()], error: null },
      trilha_aula: { data: [linhaAula({ libera_em_dias: 30 })], error: null },
      progresso_trilha: { data: [], error: null },
    });

    const r = await lerMinhaTrilha(AGORA);

    expect(JSON.stringify(r)).not.toContain("SEGREDO");
    expect(JSON.stringify(r)).not.toContain("O TEXTO INTEIRO");
  });

  it("traz o progresso e o direito ao certificado já resolvidos", async () => {
    ligarSupabase();
    cliente({
      trilha_matricula: {
        data: [{ id: "tm-1", workspace_id: "ws-1", mentorado_id: "ment-1", trilha_id: "tr-1", inicio: "2026-08-01", ativa: true, criado_em: "2026-08-01T00:00:00Z" }],
        error: null,
      },
      trilha: { data: [linhaTrilha()], error: null },
      trilha_aula: {
        data: [linhaAula({ id: "a1", libera_em_dias: 0 }), linhaAula({ id: "a2", libera_em_dias: 1 })],
        error: null,
      },
      progresso_trilha: {
        data: [{ trilha_aula_id: "a1", concluida: true }, { trilha_aula_id: "a2", concluida: false }],
        error: null,
      },
    });

    const r = await lerMinhaTrilha(AGORA);

    expect(r.trilhas[0].progresso).toEqual({ total: 2, concluidas: 1, pct: 50 });
    expect(r.trilhas[0].temCertificado).toBe(false);
    expect(r.trilhas[0].aulas.find((a) => a.id === "a1")?.concluida).toBe(true);
  });

  // O denominador do progresso é a trilha INTEIRA. Um mutante que contasse só
  // as aulas já abertas mostraria "100% concluído" para quem fez a única aula
  // que abriu na primeira semana.
  it("o progresso conta as aulas ainda fechadas no total", async () => {
    ligarSupabase();
    cliente({
      trilha_matricula: {
        data: [{ id: "tm-1", workspace_id: "ws-1", mentorado_id: "ment-1", trilha_id: "tr-1", inicio: "2026-08-10", ativa: true, criado_em: "2026-08-10T00:00:00Z" }],
        error: null,
      },
      trilha: { data: [linhaTrilha()], error: null },
      trilha_aula: {
        data: [linhaAula({ id: "aberta", libera_em_dias: 0 }), linhaAula({ id: "fechada", libera_em_dias: 60 })],
        error: null,
      },
      progresso_trilha: { data: [{ trilha_aula_id: "aberta", concluida: true }], error: null },
    });

    const r = await lerMinhaTrilha(AGORA);

    expect(r.trilhas[0].progresso).toEqual({ total: 2, concluidas: 1, pct: 50 });
    // E não há certificado: sobrou aula por liberar.
    expect(r.trilhas[0].temCertificado).toBe(false);
  });

  // O `rpc` de identidade é o primeiro passo da leitura, e o único caminho de
  // erro dela que não passa pelas quatro consultas seguintes.
  it("falha no rpc de identidade vira motivo humano, sem detalhe do banco", async () => {
    ligarSupabase();
    cliente({}, { data: null, error: { code: "42883", message: "function does not exist" } });

    const r = await lerMinhaTrilha(AGORA);

    expect(r.conectado).toBe(false);
    expect(r.motivo).not.toContain("42883");
    expect(r.motivo).not.toContain("function does not exist");
    expect(r.trilhas).toEqual([]);
  });

  it("matrícula inativa não traz a trilha", async () => {
    ligarSupabase();
    cliente({
      trilha_matricula: {
        data: [{ id: "tm-1", workspace_id: "ws-1", mentorado_id: "ment-1", trilha_id: "tr-1", inicio: "2026-08-01", ativa: false, criado_em: "2026-08-01T00:00:00Z" }],
        error: null,
      },
      trilha: { data: [linhaTrilha()], error: null },
      trilha_aula: { data: [linhaAula()], error: null },
      progresso_trilha: { data: [], error: null },
    });

    const r = await lerMinhaTrilha(AGORA);

    expect(r.trilhas).toEqual([]);
  });

  it("erro de leitura não lança e vira motivo humano", async () => {
    ligarSupabase();
    cliente({ trilha_matricula: { data: null, error: { code: "42501", message: "permission denied" } } });

    const r = await lerMinhaTrilha(AGORA);

    expect(r.conectado).toBe(false);
    expect(r.motivo).not.toContain("permission denied");
    expect(r.trilhas).toEqual([]);
  });

  it("cliente que lança não derruba a leitura", async () => {
    ligarSupabase();
    criarSupabaseServerMock.mockImplementation(() => {
      throw new Error("sem cookie");
    });

    const r = await lerMinhaTrilha(AGORA);

    expect(r.conectado).toBe(false);
    expect(r.motivo).not.toContain("cookie");
  });
});
