// Testes de `lerOnboarding` e `lerMeuOnboarding`.
//
// O QUE ESTA SUÍTE PROVA
// ----------------------
// 1) `lerMeuOnboarding` NÃO recebe parâmetro nenhum — aridade ZERO, e a
//    identidade sai de `rpc("mentorado_atual")`. O plano pedia aridade 1 (o
//    relógio); zero é mais estrito no que importa (o id não entra) e honesto
//    no resto (nada aqui depende de que horas são);
// 2) a consulta de progresso é filtrada pelo id certo em cada caso: o do rpc
//    no portal, o do parâmetro na gestão;
// 3) sem Supabase configurado, ZERO consultas;
// 4) erro vira `conectado: false` com motivo humano, sem nome de tabela nem
//    código, e o log leva só o código.

import { afterEach, describe, expect, it, vi } from "vitest";

const criarSupabaseServerMock = vi.fn();
const supabaseConfiguradoMock = vi.fn(() => true);
vi.mock("../supabase/server", () => ({ criarSupabaseServer: criarSupabaseServerMock }));
vi.mock("../data", () => ({ supabaseConfigurado: supabaseConfiguradoMock }));

const { lerOnboarding, lerMeuOnboarding, lerModeloDeOnboarding } = await import("./dados");

const EU = "ment-eu";
const OUTRO = "ment-outro";

interface Consulta {
  tabela: string;
  filtros: Array<[string, unknown]>;
}

type Resposta = { data: unknown; error: { code?: string; message?: string } | null };

function cliente(respostas: Record<string, Resposta>, rpc: Resposta = { data: EU, error: null }) {
  const consultas: Consulta[] = [];
  const rpcMock = vi.fn(() => Promise.resolve(rpc));
  const c = {
    rpc: rpcMock,
    from(tabela: string) {
      const consulta: Consulta = { tabela, filtros: [] };
      consultas.push(consulta);
      const resposta = respostas[tabela] ?? { data: [], error: null };
      const b: Record<string, unknown> = {};
      b.select = () => b;
      b.order = () => b;
      b.eq = (coluna: string, valor: unknown) => {
        consulta.filtros.push([coluna, valor]);
        return b;
      };
      b.then = (r: (x: Resposta) => unknown) => Promise.resolve(resposta).then(r);
      return b;
    },
  };
  criarSupabaseServerMock.mockReturnValue(c);
  return { consultas, rpcMock };
}

function linhaEtapa(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "e1",
    workspace_id: "ws-1",
    ordem: 1,
    titulo: "Assinar o contrato",
    descricao: "",
    responsavel: "mentorado",
    obrigatoria: true,
    ativa: true,
    criado_em: "2026-08-01T10:00:00Z",
    ...over,
  };
}

function linhaMarca(over: Record<string, unknown> = {}): Record<string, unknown> {
  return { etapa_id: "e1", mentorado_id: EU, concluida: true, concluida_em: "2026-08-02T10:00:00Z", ...over };
}

afterEach(() => {
  vi.restoreAllMocks();
  criarSupabaseServerMock.mockReset();
  supabaseConfiguradoMock.mockReturnValue(true);
});

describe("lerMeuOnboarding — a identidade não entra por parâmetro", () => {
  it("aridade ZERO: não há por onde passar um id nem um relógio", () => {
    // Um parâmetro aqui seria `mentoradoId`, e quem o passasse escolheria de
    // quem é o roteiro. O plano pedia `agoraIso`, mas nada neste caminho
    // depende do relógio: `estadoDoOnboarding` é atemporal.
    expect(lerMeuOnboarding.length).toBe(0);
  });

  it("pergunta ao banco quem está logado e filtra o progresso por esse id", async () => {
    const { consultas, rpcMock } = cliente({
      onboarding_etapa: { data: [linhaEtapa()], error: null },
      onboarding_progresso: { data: [], error: null },
    });

    await lerMeuOnboarding();

    expect(rpcMock).toHaveBeenCalledWith("mentorado_atual");
    const progresso = consultas.find((c) => c.tabela === "onboarding_progresso");
    expect(progresso!.filtros).toEqual([["mentorado_id", EU]]);
  });

  it("sem ficha de mentorado: conectado, ehMentorado falso, e nenhuma consulta", async () => {
    const { consultas } = cliente({}, { data: null, error: null });
    const meu = await lerMeuOnboarding();

    expect(meu.conectado).toBe(true);
    expect(meu.ehMentorado).toBe(false);
    expect(meu.etapas).toEqual([]);
    expect(consultas).toEqual([]);
  });

  it("entrega o estado já calculado", async () => {
    cliente({
      onboarding_etapa: {
        data: [linhaEtapa({ id: "a" }), linhaEtapa({ id: "b", ordem: 2, responsavel: "mentor" })],
        error: null,
      },
      onboarding_progresso: { data: [linhaMarca({ etapa_id: "a" })], error: null },
    });

    const meu = await lerMeuOnboarding();

    expect(meu.estado.pct).toBe(50);
    expect(meu.estado.pendentesDoMentor.map((e) => e.id)).toEqual(["b"]);
    expect(meu.estado.pendentesDoMentorado).toEqual([]);
  });

  it("erro no rpc de identidade não vira 'não é mentorado'", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    cliente({}, { data: null, error: { code: "PGRST301" } });

    const meu = await lerMeuOnboarding();
    expect(meu.conectado).toBe(false);
    expect(meu.motivo).not.toBe("");
  });
});

describe("lerOnboarding — a leitura do time", () => {
  it("filtra o progresso pelo mentorado pedido", async () => {
    const { consultas } = cliente({
      onboarding_etapa: { data: [linhaEtapa()], error: null },
      onboarding_progresso: { data: [], error: null },
    });

    await lerOnboarding(OUTRO);

    const progresso = consultas.find((c) => c.tabela === "onboarding_progresso");
    expect(progresso!.filtros).toEqual([["mentorado_id", OUTRO]]);
  });

  it("traz as etapas INATIVAS junto — quem opera precisa ver o que tirou", async () => {
    cliente({
      onboarding_etapa: { data: [linhaEtapa({ id: "viva" }), linhaEtapa({ id: "morta", ativa: false })], error: null },
      onboarding_progresso: { data: [], error: null },
    });

    const onb = await lerOnboarding(OUTRO);

    expect(onb.etapas.map((e) => e.id)).toEqual(["viva", "morta"]);
    // E o cálculo ignora a inativa sozinho.
    expect(onb.estado.pendentesDoMentorado.map((e) => e.id)).toEqual(["viva"]);
  });

  it("id vazio é recusado antes de existir cliente de banco", async () => {
    cliente({});
    for (const id of ["", "   ", "x".repeat(101)]) {
      const onb = await lerOnboarding(id);
      expect([id, onb.conectado]).toEqual([id, false]);
    }
    expect(criarSupabaseServerMock).not.toHaveBeenCalled();
  });
});

describe("as duas leituras — sem banco e com erro", () => {
  it("sem Supabase configurado, zero consultas nas duas", async () => {
    supabaseConfiguradoMock.mockReturnValue(false);
    cliente({});

    expect((await lerOnboarding(OUTRO)).conectado).toBe(false);
    expect((await lerMeuOnboarding()).conectado).toBe(false);
    expect(criarSupabaseServerMock).not.toHaveBeenCalled();
  });

  it("erro vira conectado falso, com motivo humano e sem nome de tabela", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    cliente({ onboarding_etapa: { data: null, error: { code: "42501", message: "permission denied for table onboarding_etapa" } } });

    const onb = await lerOnboarding(OUTRO);

    expect(onb.conectado).toBe(false);
    expect(onb.etapas).toEqual([]);
    for (const proibido of ["onboarding", "etapa", "42501", "permission", "table"]) {
      expect(onb.motivo.toLowerCase()).not.toContain(proibido);
    }
  });

  it("o log leva o código do erro, nunca a mensagem", async () => {
    const avisos: unknown[][] = [];
    vi.spyOn(console, "warn").mockImplementation((...args: unknown[]) => {
      avisos.push(args);
    });
    cliente({ onboarding_etapa: { data: null, error: { code: "42501", message: `denied for ${EU}` } } });

    await lerOnboarding(OUTRO);

    const t = avisos.map((a) => a.map(String).join(" ")).join(" | ");
    expect(t).toContain("42501");
    expect(t).not.toContain("denied");
    expect(t).not.toContain(EU);
  });

  it("exceção inesperada não escapa nem vaza a mensagem", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    criarSupabaseServerMock.mockImplementation(() => {
      throw new Error("segredo que não pode vazar");
    });

    const onb = await lerOnboarding(OUTRO);
    expect(onb.conectado).toBe(false);
    expect(onb.motivo).not.toContain("segredo");
  });
});

// Tarefa 40 — a leitura da tela de gestão: a régua, sem ninguém medido.
describe("lerModeloDeOnboarding", () => {
  it("traz as etapas e NÃO consulta progresso de pessoa nenhuma", () => {
    const { consultas } = cliente({ onboarding_etapa: { data: [linhaEtapa()], error: null } });
    return lerModeloDeOnboarding().then((modelo) => {
      expect(modelo.etapas.map((e) => e.id)).toEqual(["e1"]);
      expect(consultas.map((c) => c.tabela)).toEqual(["onboarding_etapa"]);
    });
  });

  it("progresso vazio e estado VAZIO — sem inventar um número de ninguém", async () => {
    // O erro tentador é calcular `estadoDoOnboarding(etapas, [])`, que devolve
    // 0% quando há obrigatória. A tela de gestão mostraria "0% concluído" de
    // um progresso que não é de pessoa alguma.
    cliente({ onboarding_etapa: { data: [linhaEtapa(), linhaEtapa({ id: "e2", ordem: 2 })], error: null } });

    const modelo = await lerModeloDeOnboarding();

    expect(modelo.progresso).toEqual([]);
    expect(modelo.estado.pct).toBeNull();
    expect(modelo.estado.concluido).toBe(false);
    expect(modelo.estado.pendentesDoMentorado).toEqual([]);
  });

  it("sem Supabase configurado, zero consultas", async () => {
    supabaseConfiguradoMock.mockReturnValue(false);
    cliente({});

    const modelo = await lerModeloDeOnboarding();

    expect(modelo.conectado).toBe(false);
    expect(criarSupabaseServerMock).not.toHaveBeenCalled();
  });

  it("erro vira conectado falso, sem nome de tabela no motivo", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    cliente({ onboarding_etapa: { data: null, error: { code: "42501" } } });

    const modelo = await lerModeloDeOnboarding();

    expect(modelo.conectado).toBe(false);
    expect(modelo.motivo.toLowerCase()).not.toContain("onboarding");
  });
});
