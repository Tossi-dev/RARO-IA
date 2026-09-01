import { afterEach, describe, expect, it, vi } from "vitest";
import { montarGrafoCliente } from "./grafo-cliente";
import { validarMapaCliente } from "./mapa-cliente";
import { criarPlanoDeAcao } from "./plano-acao";

// Os módulos de ação/leitura passam pela mesma fronteira server-only. O dublê
// permite exercitar a jornada sem URL, chave, rede ou projeto Supabase real.
// @ts-expect-error Vitest aceita módulo virtual no runtime.
vi.mock("server-only", () => ({}), { virtual: true });

const { criarSupabaseServerMock } = vi.hoisted(() => ({
  criarSupabaseServerMock: vi.fn(),
}));

vi.mock("../supabase/server", () => ({
  criarSupabaseServer: criarSupabaseServerMock,
}));

vi.mock("../data", () => ({
  supabaseConfigurado: () => true,
}));

const { enviarMensagemDoMentorado } = await import("./acoes-mensagem");
const { lerPortal } = await import("./portal");

type Resposta = { data: unknown; error: { message?: string } | null };

function formulario(campos: Record<string, string>): FormData {
  const dados = new FormData();
  for (const [chave, valor] of Object.entries(campos)) dados.set(chave, valor);
  return dados;
}

function clienteDeMensagem() {
  const inserts: Array<{ tabela: string; valores: Record<string, unknown> }> = [];
  const from = vi.fn((tabela: string) => {
    const cadeia = {
      select: () => cadeia,
      eq: () => cadeia,
      maybeSingle: () => Promise.resolve({ data: { id: "ment-1", workspace_id: "ws-1" }, error: null }),
      insert: (valores: Record<string, unknown>) => {
        inserts.push({ tabela, valores });
        return Promise.resolve({ data: null, error: null });
      },
    };
    return cadeia;
  });
  return {
    from,
    rpc: vi.fn(() => Promise.resolve({ data: "ment-1", error: null })),
    inserts,
  };
}

function clienteDoPortal() {
  const respostas: Record<string, Resposta> = {
    mentorado: {
      data: {
        id: "ment-1", workspace_id: "ws-1", aluno_id: null, perfil_id: "perfil-1", nome: "Ana",
        telefone: "", email: "", origem: "", status: "ativo", criado_em: "2026-01-01T00:00:00Z",
      },
      error: null,
    },
    matricula: { data: [], error: null },
    sessao_do_portal: { data: [], error: null },
    tarefa_mentoria: { data: [], error: null },
    marco: { data: [], error: null },
    score_evolucao: { data: [], error: null },
    conteudo_liberado: { data: [], error: null },
    mensagem_mentoria: {
      data: [{ id: "msg-1", direcao: "gestao_para_mentorado", texto: "O que você percebeu?", criado_em: "2026-01-02T00:00:00Z", autor_id: "nao-pode-sair" }],
      error: null,
    },
  };
  const from = vi.fn((tabela: string) => {
    const resposta = respostas[tabela] ?? { data: [], error: null };
    const cadeia = {
      select: () => cadeia,
      eq: () => cadeia,
      order: () => cadeia,
      maybeSingle: () => Promise.resolve(resposta),
      then: (resolver: (valor: Resposta) => unknown) => Promise.resolve(resposta).then(resolver),
    };
    return cadeia;
  });
  const rpc = vi.fn((funcao: string) => Promise.resolve(
    funcao === "mentorado_atual"
      ? { data: "ment-1", error: null }
      : { data: [{ id: "contrato-1", assinado_em: null, vigencia_inicio: "2026-01-01", vigencia_fim: null, status: "assinado", valor_total: 9999 }], error: null }
  ));
  return { from, rpc };
}

afterEach(() => {
  vi.resetAllMocks();
});

describe("jornada integrada de mentoria simulada", () => {
  it("mantém mapa, plano e grafo no mesmo mentorado e bloqueia referência de transcrição sem consentimento", () => {
    const mapa = validarMapaCliente({
      clienteId: "ment-1",
      dor: "Medo de falhar",
      objetivo: "Liderar com mais clareza",
      notas: { profissional: 4, emocional: 6 },
    });
    expect(mapa).toMatchObject({ ok: true, valor: { clienteId: "ment-1" } });
    if (!mapa.ok) return;

    const plano = criarPlanoDeAcao({
      planoId: "meta-1", clienteId: mapa.valor.clienteId, meta: mapa.valor.objetivo,
      prazo: "2026-02-01T00:00:00Z", passos: [{ id: "passo-1", titulo: "Registrar uma escolha", responsavel: "cliente" }],
    }, "2026-01-01T00:00:00Z");
    expect(plano).toMatchObject({ ok: true, valor: { clienteId: "ment-1", passos: [{ id: "passo-1" }] } });

    const semConsentimento = montarGrafoCliente({
      clienteId: mapa.valor.clienteId,
      nos: [{ id: "dim-profissional", clienteId: "ment-1", tipo: "dimensao" }, { id: "audio-1", clienteId: "ment-1", tipo: "transcricao_referencia" }],
      arestas: [{ origemId: "dim-profissional", destinoId: "audio-1", tipo: "relaciona" }],
    });
    expect(semConsentimento).toEqual({ ok: false, erro: "A referência de transcrição exige autorização explícita." });

    const outroCliente = montarGrafoCliente({
      clienteId: "ment-1",
      nos: [{ id: "meta-forjada", clienteId: "ment-2", tipo: "meta" }],
      arestas: [],
    });
    expect(outroCliente).toEqual({ ok: false, erro: "Cada nó deve pertencer ao cliente do grafo." });
  });

  it("deriva a mensagem do mentorado no servidor e devolve ao portal apenas a projeção mínima", async () => {
    const clienteMensagem = clienteDeMensagem();
    criarSupabaseServerMock.mockReturnValue(clienteMensagem);
    const envio = await enviarMensagemDoMentorado(formulario({ texto: "Quero refletir mais.", mentoradoId: "ment-forjado", workspaceId: "ws-forjado" }));
    expect(envio).toEqual({ ok: true });
    expect(clienteMensagem.inserts).toEqual([{
      tabela: "mensagem_mentoria",
      valores: { workspace_id: "ws-1", mentorado_id: "ment-1", direcao: "mentorado_para_gestao", texto: "Quero refletir mais." },
    }]);

    criarSupabaseServerMock.mockReturnValue(clienteDoPortal());
    const portal = await lerPortal("2026-01-03T00:00:00Z");

    expect(portal).toMatchObject({ conectado: true, ehMentorado: true });
    expect(portal.mensagens).toEqual([{ id: "msg-1", direcao: "gestao_para_mentorado", texto: "O que você percebeu?", criadoEm: "2026-01-02T00:00:00Z" }]);
    expect(portal.contratos).toEqual([{ id: "contrato-1", assinadoEm: null, vigenciaInicio: "2026-01-01", vigenciaFim: null, status: "assinado" }]);
    expect(JSON.stringify({ mensagens: portal.mensagens, contratos: portal.contratos })).not.toContain("nao-pode-sair");
    expect(JSON.stringify(portal.contratos)).not.toContain("9999");
  });
});
