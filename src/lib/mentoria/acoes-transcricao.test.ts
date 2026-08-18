// Testes de `acoes-transcricao.ts` — Server Action que transcreve o áudio
// de uma sessão (Tarefa 17). Mesmo espírito de `acoes-calendario.test.ts`:
// dublês por `vi.mock`, nada fala com um Postgres ou uma Groq de verdade.
//
// As asserções obrigatórias do plano (item 17):
//   (1) provider "demo" NÃO grava nada no banco, e devolve erro explicando
//       que a transcrição não está configurada;
//   (2) arquivo de 0 byte é recusado ANTES da chamada à Groq
//       (`transcreverAudio` nem é chamada);
//   (3) erro HTTP da Groq não grava transcrição parcial nem `transcrita_em`;
//   (4) transcrever de novo uma sessão que já tem transcrição é RECUSADO,
//       a menos que venha a flag de substituição — decisão travada aqui;
//   (5) `transcricao_liberada` nunca é tocada por esta ação;
//   (6) `transcricao_origem` grava o provider de fato devolvido, nunca um
//       literal "groq" chumbado.

import { afterEach, describe, expect, it, vi } from "vitest";

const { criarSupabaseServerMock, revalidatePathMock, transcreverAudioMock } = vi.hoisted(() => ({
  criarSupabaseServerMock: vi.fn(),
  revalidatePathMock: vi.fn(),
  transcreverAudioMock: vi.fn(),
}));

vi.mock("../supabase/server", () => ({
  criarSupabaseServer: criarSupabaseServerMock,
}));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("../integracoes/stt", () => ({
  transcreverAudio: transcreverAudioMock,
}));

const {
  transcreverSessao,
  MOTIVO_DEMO_NAO_CONFIGURADO,
  MOTIVO_JA_TRANSCRITA,
  MOTIVO_ARQUIVO_VAZIO,
  MOTIVO_ARQUIVO_GRANDE,
  MOTIVO_ARQUIVO_NAO_AUDIO,
  MOTIVO_ERRO_LEITURA,
  MOTIVO_SESSAO_NAO_ENCONTRADA,
  MOTIVO_TRANSCRICAO_VAZIA,
  MOTIVO_SESSAO_INVALIDA,
} = await import("./acoes-transcricao");

// ============================================================
// Dublê do cliente Supabase — encadeia `.select()/.eq()/.maybeSingle()` e
// `.update()/.eq()`, resposta escolhida pelo teste, indexada por NOME DE
// TABELA (mesmo padrão de `acoes-calendario.test.ts`).
// ============================================================

type ErroSupabase = { code?: string; message?: string };
type RespostaSelect = { data: unknown; error: ErroSupabase | null };
type RespostaUpdate = { data: null; error: ErroSupabase | null };

/**
 * `selectLanca` — o `.maybeSingle()` da tabela indicada REJEITA em vez de
 * resolver. É o único jeito de reproduzir uma segunda ida ao Postgres que
 * morre (rede caiu entre o UPDATE e a leitura da matrícula), que é o defeito
 * do caminho "gravou e depois buscou a ficha".
 */
type OpcoesCliente = {
  updateSessaoResposta?: RespostaUpdate;
  updateSessaoLanca?: Error;
  selectLanca?: Record<string, unknown>;
};

function construirCliente(selects: Record<string, RespostaSelect>, opcoes: OpcoesCliente = {}) {
  const eqChamadas: Array<{ tabela: string; coluna: string; valor: unknown }> = [];
  const updateSessaoMock = vi.fn((_valores: Record<string, unknown>) => ({
    eq: (coluna: string, valor: unknown) => {
      eqChamadas.push({ tabela: "sessao(update)", coluna, valor });
      // D1/D2 — simula um `.update()` que LANÇA (em vez de devolver
      // `{ error }`, o caminho normal do supabase-js) para provar que o
      // catch geral da ação nunca ecoa a mensagem crua dessa exceção no
      // log, mesmo quando ela carrega o corpo da requisição que falhou.
      if (opcoes.updateSessaoLanca) {
        return Promise.reject(opcoes.updateSessaoLanca);
      }
      return Promise.resolve(opcoes.updateSessaoResposta ?? { data: null, error: null });
    },
  }));
  const deleteMock = vi.fn(() => ({
    eq: vi.fn(() => Promise.resolve({ data: null, error: null })),
  }));

  const fromMock = vi.fn((tabela: string) => ({
    select: () => {
      const builder = {
        eq: (coluna: string, valor: unknown) => {
          eqChamadas.push({ tabela, coluna, valor });
          return builder;
        },
        maybeSingle: () => {
          if (opcoes.selectLanca && Object.prototype.hasOwnProperty.call(opcoes.selectLanca, tabela)) {
            return Promise.reject(opcoes.selectLanca[tabela]);
          }
          return Promise.resolve(selects[tabela] ?? { data: null, error: null });
        },
      };
      return builder;
    },
    update: tabela === "sessao" ? updateSessaoMock : vi.fn(() => ({ eq: vi.fn() })),
    delete: deleteMock,
  }));

  return { from: fromMock, eqChamadas, updateSessaoMock, deleteMock };
}

function ligarCliente(selects: Record<string, RespostaSelect>, opcoes: OpcoesCliente = {}) {
  const cliente = construirCliente(selects, opcoes);
  criarSupabaseServerMock.mockReturnValue(cliente);
  return cliente;
}

// ============================================================
// Fixtures — linhas CRUAS (snake_case), como o Postgres devolveria.
// ============================================================

function linhaSessao(parcial: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: "ses-1",
    workspace_id: "ws-1",
    matricula_id: "mat-1",
    turma_id: null,
    numero: 3,
    quando: "2026-08-20T23:00:00.000Z",
    duracao_min: 60,
    status: "realizada",
    link_gravacao: "",
    transcricao: "",
    transcrita_em: null,
    transcricao_origem: "",
    transcricao_liberada: false,
    resumo: "",
    criado_em: "2026-01-01T00:00:00Z",
    evento_google_id: "",
    ...parcial,
  };
}

function linhaMatricula(parcial: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
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
    ...parcial,
  };
}

function selectsFeliz(overridesSessao: Partial<Record<string, unknown>> = {}): Record<string, RespostaSelect> {
  return {
    sessao: { data: linhaSessao(overridesSessao), error: null },
    matricula: { data: linhaMatricula(), error: null },
  };
}

/** Áudio válido de tamanho arbitrário (padrão: pequeno, tipo audio/mpeg). */
function arquivoAudio(bytes = 1024, tipo = "audio/mpeg"): Blob {
  return new Blob([new Uint8Array(bytes)], { type: tipo });
}

function formData(campos: {
  sessaoId?: string;
  arquivo?: Blob | null;
  /** Nome do arquivo no upload — default "audio.mp3". Variar isto é o único jeito de testar o fallback por extensão (D7). */
  arquivoNome?: string;
  substituir?: string;
  [extra: string]: string | Blob | null | undefined;
}): FormData {
  const fd = new FormData();
  if (campos.sessaoId !== undefined) fd.set("sessaoId", campos.sessaoId);
  if (campos.arquivo !== undefined && campos.arquivo !== null) {
    fd.set("arquivo", campos.arquivo, campos.arquivoNome ?? "audio.mp3");
  }
  if (campos.substituir !== undefined) fd.set("substituir", campos.substituir);
  for (const [chave, valor] of Object.entries(campos)) {
    if (["sessaoId", "arquivo", "arquivoNome", "substituir"].includes(chave)) continue;
    if (valor === undefined || valor === null) continue;
    if (typeof valor === "string") fd.set(chave, valor);
  }
  return fd;
}

afterEach(() => {
  vi.resetAllMocks();
});

// ============================================================
// Entrada inválida / sessão não encontrada — zero chamada externa.
// ============================================================

describe("entrada inválida e sessão não encontrada", () => {
  it("sessaoId vazio: nem chega a construir o cliente Supabase, nem chama transcreverAudio", async () => {
    const resultado = await transcreverSessao(formData({ arquivo: arquivoAudio() }));

    expect(resultado.ok).toBe(false);
    expect(resultado.erro).toBeTruthy();
    expect(criarSupabaseServerMock).not.toHaveBeenCalled();
    expect(transcreverAudioMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("sessão não encontrada (RLS de outro workspace devolve o mesmo null): erro humano, zero chamada externa", async () => {
    ligarCliente({ sessao: { data: null, error: null } });

    const resultado = await transcreverSessao(formData({ sessaoId: "ses-fantasma", arquivo: arquivoAudio() }));

    expect(resultado.ok).toBe(false);
    expect(resultado.erro).toBeTruthy();
    expect(transcreverAudioMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("erro do banco na leitura da sessão não lança: vira console.warn + retorno de erro", async () => {
    ligarCliente({ sessao: { data: null, error: { code: "PGRST301", message: "linha inacessível" } } });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(
      transcreverSessao(formData({ sessaoId: "ses-1", arquivo: arquivoAudio() }))
    ).resolves.toMatchObject({ ok: false });
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

// ============================================================
// A ação lê SÓ sessaoId, arquivo e substituir do formulário.
// ============================================================

describe("campos fora dos três lidos são ignorados", () => {
  it("workspaceId/mentoradoId forjados não mudam o resultado nem chegam a uma consulta", async () => {
    transcreverAudioMock.mockResolvedValue({ provider: "groq", texto: "conteúdo da sessão" });

    const clienteSemForjar = ligarCliente(selectsFeliz());
    const resultadoSemForjar = await transcreverSessao(formData({ sessaoId: "ses-1", arquivo: arquivoAudio() }));

    const clienteComForjar = ligarCliente(selectsFeliz());
    const resultadoComForjar = await transcreverSessao(
      formData({
        sessaoId: "ses-1",
        arquivo: arquivoAudio(),
        workspaceId: "ws-do-invasor",
        mentoradoId: "ment-de-outra-pessoa",
      })
    );

    expect(resultadoComForjar).toEqual(resultadoSemForjar);
    for (const chamadas of [clienteSemForjar.eqChamadas, clienteComForjar.eqChamadas]) {
      for (const c of chamadas) {
        expect(c.valor).not.toBe("ws-do-invasor");
        expect(c.valor).not.toBe("ment-de-outra-pessoa");
      }
    }
  });
});

// ============================================================
// (2) Limites do arquivo — recusados ANTES de qualquer chamada externa.
// ============================================================

describe("limites do arquivo, checados antes da chamada à Groq", () => {
  it("sem arquivo nenhum: recusa, zero chamada externa", async () => {
    const resultado = await transcreverSessao(formData({ sessaoId: "ses-1" }));

    expect(resultado.ok).toBe(false);
    expect(criarSupabaseServerMock).not.toHaveBeenCalled();
    expect(transcreverAudioMock).not.toHaveBeenCalled();
  });

  it("arquivo de 0 byte: recusado, transcreverAudio NUNCA é chamada", async () => {
    const resultado = await transcreverSessao(formData({ sessaoId: "ses-1", arquivo: arquivoAudio(0) }));

    expect(resultado.ok).toBe(false);
    expect(resultado.erro).toBe(MOTIVO_ARQUIVO_VAZIO);
    expect(criarSupabaseServerMock).not.toHaveBeenCalled();
    expect(transcreverAudioMock).not.toHaveBeenCalled();
  });

  it("arquivo acima de 25 MB: recusado com o limite em MB na mensagem, transcreverAudio NUNCA é chamada", async () => {
    const grande = arquivoAudio(25 * 1024 * 1024 + 1);
    const resultado = await transcreverSessao(formData({ sessaoId: "ses-1", arquivo: grande }));

    expect(resultado.ok).toBe(false);
    expect(resultado.erro).toBe(MOTIVO_ARQUIVO_GRANDE);
    expect(resultado.erro).toMatch(/25\s*MB/);
    expect(transcreverAudioMock).not.toHaveBeenCalled();
  });

  it("exatamente 25 MB é aceito (o limite é 'acima de', não 'a partir de')", async () => {
    transcreverAudioMock.mockResolvedValue({ provider: "groq", texto: "ok" });
    ligarCliente(selectsFeliz());

    const noLimite = arquivoAudio(25 * 1024 * 1024);
    const resultado = await transcreverSessao(formData({ sessaoId: "ses-1", arquivo: noLimite }));

    expect(resultado.ok).toBe(true);
    expect(transcreverAudioMock).toHaveBeenCalledTimes(1);
  });

  it("tipo de arquivo que claramente não é áudio: recusado, transcreverAudio NUNCA é chamada", async () => {
    const naoAudio = arquivoAudio(1024, "image/png");
    const resultado = await transcreverSessao(formData({ sessaoId: "ses-1", arquivo: naoAudio }));

    expect(resultado.ok).toBe(false);
    expect(resultado.erro).toBe(MOTIVO_ARQUIVO_NAO_AUDIO);
    expect(transcreverAudioMock).not.toHaveBeenCalled();
  });

  it("outro tipo claramente não-áudio (text/plain) também é recusado — prova que não é só um caso isolado", async () => {
    const naoAudio = arquivoAudio(1024, "text/plain");
    const resultado = await transcreverSessao(formData({ sessaoId: "ses-1", arquivo: naoAudio }));

    expect(resultado.ok).toBe(false);
    expect(resultado.erro).toBe(MOTIVO_ARQUIVO_NAO_AUDIO);
  });
});

// ============================================================
// (1) provider "demo" nunca grava — mesmo que a leitura da sessão e o
// arquivo estejam perfeitos.
// ============================================================

describe("provider demo recusa gravar", () => {
  it("GROQ_API_KEY ausente (transcreverAudio devolve provider:'demo'): zero UPDATE, erro explica falta de configuração", async () => {
    transcreverAudioMock.mockResolvedValue({
      provider: "demo",
      texto: "[TRANSCRIÇÃO DEMO — configure GROQ_API_KEY para transcrever áudio real]",
    });
    const cliente = ligarCliente(selectsFeliz());

    const resultado = await transcreverSessao(formData({ sessaoId: "ses-1", arquivo: arquivoAudio() }));

    expect(resultado.ok).toBe(false);
    expect(resultado.erro).toBe(MOTIVO_DEMO_NAO_CONFIGURADO);
    expect(cliente.updateSessaoMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
    // O texto de demonstração nunca aparece no retorno da ação.
    expect(JSON.stringify(resultado)).not.toContain("TRANSCRIÇÃO DEMO");
  });
});

// ============================================================
// (3) Erro HTTP da Groq não grava nada — nem transcrição parcial, nem
// `transcrita_em`.
// ============================================================

describe("erro HTTP da Groq não grava nada", () => {
  it("transcreverAudio rejeita (Groq 500): zero UPDATE em sessao, erro humano, zero revalidatePath", async () => {
    transcreverAudioMock.mockRejectedValue(new Error("Groq 500: falha interna"));
    const cliente = ligarCliente(selectsFeliz());
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const resultado = await transcreverSessao(formData({ sessaoId: "ses-1", arquivo: arquivoAudio() }));

    expect(resultado.ok).toBe(false);
    expect(cliente.updateSessaoMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
    // O detalhe técnico da Groq nunca vaza para o retorno da ação.
    expect(resultado.erro).not.toContain("Groq 500");
    warnSpy.mockRestore();
  });
});

// ============================================================
// (4) Sessão já transcrita: recusa sem a flag; grava com `substituir=1`.
// ============================================================

describe("sobrescrever exige a flag de substituição", () => {
  it("sessão já tem transcrição, sem substituir=1: recusa, transcreverAudio NUNCA é chamada, zero UPDATE", async () => {
    const cliente = ligarCliente(
      selectsFeliz({ transcricao: "texto antigo", transcrita_em: "2026-01-05T00:00:00Z", transcricao_origem: "groq" })
    );

    const resultado = await transcreverSessao(formData({ sessaoId: "ses-1", arquivo: arquivoAudio() }));

    expect(resultado.ok).toBe(false);
    expect(resultado.erro).toBe(MOTIVO_JA_TRANSCRITA);
    expect(transcreverAudioMock).not.toHaveBeenCalled();
    expect(cliente.updateSessaoMock).not.toHaveBeenCalled();
  });

  it("sessão já tem transcrição, COM substituir=1: sobrescreve normalmente", async () => {
    transcreverAudioMock.mockResolvedValue({ provider: "groq", texto: "texto novo" });
    const cliente = ligarCliente(
      selectsFeliz({ transcricao: "texto antigo", transcrita_em: "2026-01-05T00:00:00Z", transcricao_origem: "groq" })
    );

    const resultado = await transcreverSessao(
      formData({ sessaoId: "ses-1", arquivo: arquivoAudio(), substituir: "1" })
    );

    expect(resultado.ok).toBe(true);
    expect(transcreverAudioMock).toHaveBeenCalledTimes(1);
    expect(cliente.updateSessaoMock).toHaveBeenCalledTimes(1);
    expect(cliente.updateSessaoMock).toHaveBeenCalledWith(
      expect.objectContaining({ transcricao: "texto novo" })
    );
  });

  it("substituir com qualquer outro valor (ex: 'true', 'sim') NÃO conta — só '1' é o caminho válido", async () => {
    const cliente = ligarCliente(
      selectsFeliz({ transcricao: "texto antigo", transcrita_em: "2026-01-05T00:00:00Z", transcricao_origem: "groq" })
    );

    const resultado = await transcreverSessao(
      formData({ sessaoId: "ses-1", arquivo: arquivoAudio(), substituir: "true" })
    );

    expect(resultado.ok).toBe(false);
    expect(resultado.erro).toBe(MOTIVO_JA_TRANSCRITA);
    expect(cliente.updateSessaoMock).not.toHaveBeenCalled();
  });

  it("sessão SEM transcrição prévia: substituir ausente não bloqueia (nada para substituir)", async () => {
    transcreverAudioMock.mockResolvedValue({ provider: "groq", texto: "primeira transcrição" });
    ligarCliente(selectsFeliz({ transcricao: "", transcrita_em: null }));

    const resultado = await transcreverSessao(formData({ sessaoId: "ses-1", arquivo: arquivoAudio() }));

    expect(resultado.ok).toBe(true);
    expect(transcreverAudioMock).toHaveBeenCalledTimes(1);
  });
});

// ============================================================
// (5) `transcricao_liberada` nunca é tocada por esta ação.
// ============================================================

describe("transcricao_liberada nunca é tocada", () => {
  it("depois de transcrever com sucesso, o UPDATE não contém a coluna transcricao_liberada", async () => {
    transcreverAudioMock.mockResolvedValue({ provider: "groq", texto: "conteúdo transcrito" });
    const cliente = ligarCliente(selectsFeliz());

    const resultado = await transcreverSessao(formData({ sessaoId: "ses-1", arquivo: arquivoAudio() }));

    expect(resultado.ok).toBe(true);
    expect(cliente.updateSessaoMock).toHaveBeenCalledTimes(1);
    const valoresGravados = cliente.updateSessaoMock.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(valoresGravados, "transcricao_liberada")).toBe(false);
  });
});

// ============================================================
// (6) `transcricao_origem` grava o provider DE FATO devolvido — nunca um
// literal "groq" chumbado, ignorando o provider real.
// ============================================================

describe("transcricao_origem grava o provider real, nunca um literal chumbado", () => {
  it("provider devolvido por transcreverAudio é gravado tal e qual em transcricao_origem", async () => {
    // Cast para simular, em teste, um segundo motor que a tipagem de
    // produção ainda não prevê — a única forma de matar o mutante que
    // chumba a string "groq" independente do que a função devolveu.
    transcreverAudioMock.mockResolvedValue({ provider: "groq-turbo-x", texto: "conteúdo" } as unknown as {
      provider: "groq";
      texto: string;
    });
    const cliente = ligarCliente(selectsFeliz());

    const resultado = await transcreverSessao(formData({ sessaoId: "ses-1", arquivo: arquivoAudio() }));

    expect(resultado.ok).toBe(true);
    expect(cliente.updateSessaoMock).toHaveBeenCalledWith(
      expect.objectContaining({ transcricao_origem: "groq-turbo-x" })
    );
  });
});

// ============================================================
// Grava transcrição + transcrita_em NA MESMA escrita; caminho feliz completo.
// ============================================================

describe("caminho feliz: grava transcricao + transcrita_em juntos, revalida a ficha, texto não vaza no retorno", () => {
  it("UPDATE contém transcricao, transcrita_em e transcricao_origem juntos; revalidatePath na ficha do mentorado; retorno não devolve o texto inteiro", async () => {
    transcreverAudioMock.mockResolvedValue({ provider: "groq", texto: "conversa inteira do cliente, bem sensível" });
    const cliente = ligarCliente(selectsFeliz());

    const resultado = await transcreverSessao(formData({ sessaoId: "ses-1", arquivo: arquivoAudio() }));

    expect(resultado.ok).toBe(true);
    expect(cliente.updateSessaoMock).toHaveBeenCalledTimes(1);
    const valores = cliente.updateSessaoMock.mock.calls[0][0] as Record<string, unknown>;
    expect(valores.transcricao).toBe("conversa inteira do cliente, bem sensível");
    expect(valores.transcrita_em).toBeTruthy();
    expect(valores.transcricao_origem).toBe("groq");

    expect(revalidatePathMock).toHaveBeenCalledWith("/mentoria/ment-1");

    // Decisão 8: no máximo um indicador — nunca o texto sensível inteiro.
    expect(JSON.stringify(resultado)).not.toContain("conversa inteira do cliente");
  });

  it("update falha ao gravar: erro humano, zero revalidatePath (a transcrição não fica órfã sem confirmação)", async () => {
    transcreverAudioMock.mockResolvedValue({ provider: "groq", texto: "texto" });
    ligarCliente(selectsFeliz(), {
      updateSessaoResposta: { data: null, error: { code: "PGRST301", message: "linha inacessível" } },
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const resultado = await transcreverSessao(formData({ sessaoId: "ses-1", arquivo: arquivoAudio() }));

    expect(resultado.ok).toBe(false);
    expect(revalidatePathMock).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

// ============================================================
// Nada de cron/gatilho — este arquivo só exporta a Server Action acionada
// por formulário. Prova estrutural: nenhum efeito colateral roda no
// module-load (nada de setInterval/setTimeout/topo de arquivo chamando a
// ação sozinha).
// ============================================================

describe("nenhum disparo automático embutido no módulo", () => {
  it("importar o módulo não chama transcreverAudio nem toca no Supabase", () => {
    expect(transcreverAudioMock).not.toHaveBeenCalled();
    expect(criarSupabaseServerMock).not.toHaveBeenCalled();
  });
});

// ============================================================
// REVISÃO — correção de laudo independente (Defeitos 1-7). Os testes
// abaixo provam cada correção separadamente.
// ============================================================

// ------------------------------------------------------------
// D1 + D2 — log NUNCA repassa mensagem crua de exceção/erro do banco, nem
// quando ela ecoa o texto transcrito. Marcador único plantado no texto para
// provar, por busca literal em TODAS as chamadas de `console.warn`, que ele
// nunca aparece.
// ------------------------------------------------------------

describe("D1/D2 — log nunca vaza o texto transcrito, mesmo com exceção que o ecoa", () => {
  const MARCADOR_SECRETO = "MARCADOR-SECRETO-CONVERSA-DO-CLIENTE-9f3a";

  it("`.update()` lança um Error cuja mensagem embute o marcador: nenhuma chamada de console.warn contém o marcador", async () => {
    transcreverAudioMock.mockResolvedValue({ provider: "groq", texto: `conteúdo com ${MARCADOR_SECRETO} dentro` });
    ligarCliente(selectsFeliz(), {
      updateSessaoLanca: new Error(`falha ao persistir payload: ${MARCADOR_SECRETO}`),
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const resultado = await transcreverSessao(formData({ sessaoId: "ses-1", arquivo: arquivoAudio() }));

    expect(resultado.ok).toBe(false);
    // Nenhuma chamada de warn/error, em NENHUM argumento, contém o marcador.
    const todasChamadas = [...warnSpy.mock.calls, ...errorSpy.mock.calls];
    for (const chamada of todasChamadas) {
      for (const arg of chamada) {
        expect(String(arg)).not.toContain(MARCADOR_SECRETO);
      }
    }
    // E o marcador também não vaza no retorno da ação.
    expect(JSON.stringify(resultado)).not.toContain(MARCADOR_SECRETO);
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("erro de leitura da sessão: console.warn é chamado só com código curto — nunca com `.message`", async () => {
    const MENSAGEM_LONGA_COM_DETALHE = `detalhe interno sensível ${MARCADOR_SECRETO}`;
    ligarCliente({ sessao: { data: null, error: { code: "PGRST301", message: MENSAGEM_LONGA_COM_DETALHE } } });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await transcreverSessao(formData({ sessaoId: "ses-1", arquivo: arquivoAudio() }));

    for (const chamada of warnSpy.mock.calls) {
      for (const arg of chamada) {
        expect(String(arg)).not.toContain(MARCADOR_SECRETO);
        expect(String(arg)).not.toBe(MENSAGEM_LONGA_COM_DETALHE);
      }
    }
    warnSpy.mockRestore();
  });
});

// ------------------------------------------------------------
// D3 — a leitura da sessão usa `.eq("id", sessaoId)`, provado via
// `eqChamadas` (o dublê já coletava isso e não era assertado).
// ------------------------------------------------------------

describe("D3 — leitura da sessão usa .eq('id', sessaoId)", () => {
  it("a primeira chamada .eq() na tabela sessao é exatamente coluna 'id' com o sessaoId pedido", async () => {
    const cliente = ligarCliente({ sessao: { data: null, error: null } });

    await transcreverSessao(formData({ sessaoId: "ses-especifica-77", arquivo: arquivoAudio() }));

    const chamadaNaSessao = cliente.eqChamadas.find((c) => c.tabela === "sessao");
    expect(chamadaNaSessao).toEqual({ tabela: "sessao", coluna: "id", valor: "ses-especifica-77" });
  });
});

// ------------------------------------------------------------
// D4 — revalidatePath fora do caminho que pode virar ok:false: gravação
// confirmada é sempre sucesso, mesmo que a revalidação lance.
// ------------------------------------------------------------

describe("D4 — falha de revalidatePath não desfaz um sucesso já gravado", () => {
  it("revalidatePath lança na ficha do mentorado: resultado AINDA é ok:true, e a segunda chamada (/mentoria) ainda é tentada", async () => {
    transcreverAudioMock.mockResolvedValue({ provider: "groq", texto: "texto gravado com sucesso" });
    const cliente = ligarCliente(selectsFeliz());
    revalidatePathMock.mockImplementation((caminho: string) => {
      if (caminho === "/mentoria/ment-1") throw new Error("cache indisponível");
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const resultado = await transcreverSessao(formData({ sessaoId: "ses-1", arquivo: arquivoAudio() }));

    expect(resultado.ok).toBe(true);
    expect(cliente.updateSessaoMock).toHaveBeenCalledTimes(1);
    expect(revalidatePathMock).toHaveBeenCalledWith("/mentoria/ment-1");
    expect(revalidatePathMock).toHaveBeenCalledWith("/mentoria");
    warnSpy.mockRestore();
  });
});

// ------------------------------------------------------------
// D5 — texto vazio/só espaço/só quebra de linha NÃO é sucesso: recusa,
// nada é gravado.
// ------------------------------------------------------------

describe("D5 — transcrição vazia não é sucesso", () => {
  it.each([
    ["string vazia", ""],
    ["só espaços", "   "],
    ["só quebras de linha", "\n\n"],
  ])("texto '%s' devolvido pela Groq: recusa, zero UPDATE, mensagem de vazio", async (_rotulo, textoVazio) => {
    transcreverAudioMock.mockResolvedValue({ provider: "groq", texto: textoVazio });
    const cliente = ligarCliente(selectsFeliz());

    const resultado = await transcreverSessao(formData({ sessaoId: "ses-1", arquivo: arquivoAudio() }));

    expect(resultado.ok).toBe(false);
    expect(resultado.erro).toBe(MOTIVO_TRANSCRICAO_VAZIA);
    expect(cliente.updateSessaoMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("texto com conteúdo de verdade (só cercado de espaço) É gravado normalmente", async () => {
    transcreverAudioMock.mockResolvedValue({ provider: "groq", texto: "  fala de verdade aqui  " });
    const cliente = ligarCliente(selectsFeliz());

    const resultado = await transcreverSessao(formData({ sessaoId: "ses-1", arquivo: arquivoAudio() }));

    expect(resultado.ok).toBe(true);
    expect(cliente.updateSessaoMock).toHaveBeenCalledTimes(1);
  });
});

// ------------------------------------------------------------
// D6 — erro de leitura do banco e "sessão não encontrada" são mensagens
// DIFERENTES, com o texto exato de cada uma.
// ------------------------------------------------------------

describe("D6 — erro de banco e 'sessão não encontrada' têm mensagens distintas", () => {
  it("erro de banco na leitura: mensagem EXATA é MOTIVO_ERRO_LEITURA, não MOTIVO_SESSAO_NAO_ENCONTRADA", async () => {
    ligarCliente({ sessao: { data: null, error: { code: "PGRST301", message: "linha inacessível" } } });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const resultado = await transcreverSessao(formData({ sessaoId: "ses-1", arquivo: arquivoAudio() }));

    expect(resultado.erro).toBe(MOTIVO_ERRO_LEITURA);
    expect(resultado.erro).not.toBe(MOTIVO_SESSAO_NAO_ENCONTRADA);
    warnSpy.mockRestore();
  });

  it("sessão inexistente (sem erro de banco): mensagem EXATA é MOTIVO_SESSAO_NAO_ENCONTRADA, não MOTIVO_ERRO_LEITURA", async () => {
    ligarCliente({ sessao: { data: null, error: null } });

    const resultado = await transcreverSessao(formData({ sessaoId: "ses-1", arquivo: arquivoAudio() }));

    expect(resultado.erro).toBe(MOTIVO_SESSAO_NAO_ENCONTRADA);
    expect(resultado.erro).not.toBe(MOTIVO_ERRO_LEITURA);
  });
});

// ------------------------------------------------------------
// D7 — lista de PERMITIDOS, não de proibidos: vídeo de reunião (mp4/webm)
// é aceito; tipo ausente cai para a extensão do nome, com a mesma lista.
// ------------------------------------------------------------

describe("D7 — política de tipo de arquivo é lista de PERMITIDOS", () => {
  it("video/mp4 (gravação real do Zoom) é ACEITO", async () => {
    transcreverAudioMock.mockResolvedValue({ provider: "groq", texto: "call do zoom transcrita" });
    ligarCliente(selectsFeliz());

    const resultado = await transcreverSessao(
      formData({ sessaoId: "ses-1", arquivo: arquivoAudio(1024, "video/mp4") })
    );

    expect(resultado.ok).toBe(true);
    expect(transcreverAudioMock).toHaveBeenCalledTimes(1);
  });

  it("video/webm (gravação real do Meet) é ACEITO", async () => {
    transcreverAudioMock.mockResolvedValue({ provider: "groq", texto: "call do meet transcrita" });
    ligarCliente(selectsFeliz());

    const resultado = await transcreverSessao(
      formData({ sessaoId: "ses-1", arquivo: arquivoAudio(1024, "video/webm") })
    );

    expect(resultado.ok).toBe(true);
  });

  it("video/x-matroska (contêiner fora da lista) continua RECUSADO — não é 'qualquer vídeo passa'", async () => {
    const resultado = await transcreverSessao(
      formData({ sessaoId: "ses-1", arquivo: arquivoAudio(1024, "video/x-matroska") })
    );

    expect(resultado.ok).toBe(false);
    expect(resultado.erro).toBe(MOTIVO_ARQUIVO_NAO_AUDIO);
    expect(transcreverAudioMock).not.toHaveBeenCalled();
  });

  it("type vazio + extensão reconhecida (.m4a): decide pela extensão, é ACEITO", async () => {
    transcreverAudioMock.mockResolvedValue({ provider: "groq", texto: "transcrito via extensao" });
    ligarCliente(selectsFeliz());

    const semTipo = arquivoAudio(1024, "");
    const resultado = await transcreverSessao(
      formData({ sessaoId: "ses-1", arquivo: semTipo, arquivoNome: "reuniao-mentoria.m4a" })
    );

    expect(resultado.ok).toBe(true);
    expect(transcreverAudioMock).toHaveBeenCalledTimes(1);
  });

  it("type vazio + extensão NÃO reconhecida: recusa — ausência de informação nunca vira 'deve ser válido'", async () => {
    const semTipo = arquivoAudio(1024, "");
    const resultado = await transcreverSessao(
      formData({ sessaoId: "ses-1", arquivo: semTipo, arquivoNome: "relatorio-financeiro.xlsx" })
    );

    expect(resultado.ok).toBe(false);
    expect(resultado.erro).toBe(MOTIVO_ARQUIVO_NAO_AUDIO);
    expect(transcreverAudioMock).not.toHaveBeenCalled();
  });

  it("type vazio + sem extensão nenhuma no nome: recusa", async () => {
    const semTipo = arquivoAudio(1024, "");
    const resultado = await transcreverSessao(
      formData({ sessaoId: "ses-1", arquivo: semTipo, arquivoNome: "audiosemextensao" })
    );

    expect(resultado.ok).toBe(false);
    expect(resultado.erro).toBe(MOTIVO_ARQUIVO_NAO_AUDIO);
  });
});

// ============================================================
// RODADA 3 DE REVISÃO — Defeitos D8 a D12 (numeração continua a dos sete
// anteriores). Cada bloco abaixo prova UMA correção, isolada.
// ============================================================

/**
 * Espião de TODOS os canais de `console` — não só `warn`.
 *
 * Por que os cinco: a suíte anterior só vigiava `console.warn`, então um
 * `console.log`/`error`/`info`/`debug` com o texto transcrito passaria batido.
 * O texto é a conversa inteira do cliente: a prova precisa ser "não sai por
 * canal NENHUM", não "não sai pelo canal que eu lembrei de olhar".
 */
function espiarConsole() {
  const metodos = ["log", "warn", "error", "info", "debug"] as const;
  const espioes = metodos.map((metodo) => vi.spyOn(console, metodo).mockImplementation(() => {}));
  return {
    /** Todos os argumentos de todas as chamadas, de todos os canais, achatados. */
    argumentos(): string[] {
      return espioes.flatMap((espiao) => espiao.mock.calls.flatMap((chamada) => chamada.map((arg) => String(arg))));
    },
    restaurar(): void {
      for (const espiao of espioes) espiao.mockRestore();
    },
  };
}

// ------------------------------------------------------------
// D8 — a busca do caminho da ficha é uma SEGUNDA ida ao Postgres, e ela
// acontece DEPOIS do UPDATE já confirmado. Se ela morrer, a resposta NÃO
// pode virar ok:false: a pessoa veria "não foi possível transcrever" sobre
// uma transcrição já salva, tentaria de novo, e a retentativa queimaria uma
// SEGUNDA chamada paga da Groq pelo mesmo áudio.
// ------------------------------------------------------------

describe("D8 — falha ao buscar o caminho da ficha não desfaz um sucesso já gravado", () => {
  const MARCADOR_FICHA = "MARCADOR-D8-CONVERSA-DO-CLIENTE-7b1e";

  it("UPDATE confirma e a leitura da matrícula REJEITA: resultado ainda é ok:true, e /mentoria ainda é revalidada", async () => {
    transcreverAudioMock.mockResolvedValue({ provider: "groq", texto: `fala com ${MARCADOR_FICHA} dentro` });
    const cliente = ligarCliente(selectsFeliz(), {
      selectLanca: { matricula: new Error(`conexão perdida ao ler payload ${MARCADOR_FICHA}`) },
    });
    const console_ = espiarConsole();

    const resultado = await transcreverSessao(formData({ sessaoId: "ses-1", arquivo: arquivoAudio() }));
    const logado = console_.argumentos();
    console_.restaurar();

    expect(resultado.ok).toBe(true);
    expect(resultado.erro).toBeUndefined();
    expect(cliente.updateSessaoMock).toHaveBeenCalledTimes(1);
    // A carteira continua sendo revalidada mesmo sem saber a ficha exata.
    expect(revalidatePathMock).toHaveBeenCalledWith("/mentoria");
    // E o log desse caminho não carrega o texto.
    for (const arg of logado) expect(arg).not.toContain(MARCADOR_FICHA);
  });
});

// ------------------------------------------------------------
// D9 — bailout dinâmico do Next: RELANÇADO, nunca engolido.
//
// Padrão já resolvido na casa em `src/lib/data/simulacao.ts:42` e
// `src/lib/integracoes/google-agenda-escrita.ts:249`: quando o `digest`
// começa com `DYNAMIC_SERVER_USAGE`, o erro NÃO é falha — é o Next avisando
// que a renderização precisa sair do cache. Engolir faz a página ser
// cacheada com o resultado errado, em silêncio. Divergir do padrão da casa
// sem dizer por quê é como a divergência vira norma.
// ------------------------------------------------------------

describe("D9 — bailout dinâmico do Next é relançado, o resto é engolido", () => {
  function erroComDigest(digest: string): Error {
    const erro = new Error("Dynamic server usage: cookies");
    (erro as Error & { digest?: string }).digest = digest;
    return erro;
  }

  const BAILOUT = "DYNAMIC_SERVER_USAGE:cookies";

  it("catch geral: exceção com digest DYNAMIC_SERVER_USAGE sobe", async () => {
    criarSupabaseServerMock.mockImplementation(() => {
      throw erroComDigest(BAILOUT);
    });

    await expect(transcreverSessao(formData({ sessaoId: "ses-1", arquivo: arquivoAudio() }))).rejects.toThrow(
      /Dynamic server usage/i
    );
  });

  it("catch geral: exceção com OUTRO digest continua sendo engolida (ok:false, não lança)", async () => {
    criarSupabaseServerMock.mockImplementation(() => {
      throw erroComDigest("NEXT_REDIRECT_OU_QUALQUER_OUTRA_COISA");
    });
    const console_ = espiarConsole();

    const resultado = await transcreverSessao(formData({ sessaoId: "ses-1", arquivo: arquivoAudio() }));
    console_.restaurar();

    expect(resultado.ok).toBe(false);
    expect(resultado.erro).toBeTruthy();
  });

  it("catch da Groq: bailout sobe em vez de virar 'não foi possível transcrever'", async () => {
    transcreverAudioMock.mockRejectedValue(erroComDigest(BAILOUT));
    ligarCliente(selectsFeliz());

    await expect(transcreverSessao(formData({ sessaoId: "ses-1", arquivo: arquivoAudio() }))).rejects.toThrow(
      /Dynamic server usage/i
    );
  });

  it("tentarRevalidar: bailout do revalidatePath sobe (é sinalização de framework, não falha de cache)", async () => {
    transcreverAudioMock.mockResolvedValue({ provider: "groq", texto: "texto gravado" });
    ligarCliente(selectsFeliz());
    revalidatePathMock.mockImplementation(() => {
      throw erroComDigest(BAILOUT);
    });

    await expect(transcreverSessao(formData({ sessaoId: "ses-1", arquivo: arquivoAudio() }))).rejects.toThrow(
      /Dynamic server usage/i
    );
  });

  it("busca do caminho da ficha: bailout sobe, enquanto uma falha comum vira ok:true (ver D8)", async () => {
    transcreverAudioMock.mockResolvedValue({ provider: "groq", texto: "texto gravado" });
    ligarCliente(selectsFeliz(), { selectLanca: { matricula: erroComDigest(BAILOUT) } });

    await expect(transcreverSessao(formData({ sessaoId: "ses-1", arquivo: arquivoAudio() }))).rejects.toThrow(
      /Dynamic server usage/i
    );
  });
});

// ------------------------------------------------------------
// D10 — `nomeDaExcecao` e `codigoDe` prometem `string` na assinatura, mas o
// runtime não garante nada: `.name` pode vir de um getter, e `error.code`
// pode chegar como objeto ou array vindo de uma biblioteca. Se qualquer um
// deles carregar o corpo da requisição — a conversa do cliente — ele vai
// direto para o `console.warn`. `String(x).slice(0, 40)` fecha os dois: o
// que não é string vira string, e nada longo o bastante para ser fala passa.
// ------------------------------------------------------------

describe("D10 — nomeDaExcecao e codigoDe não confiam no runtime", () => {
  const MARCADOR_D10 = "MARCADOR-D10-CONVERSA-DO-CLIENTE-4c8d";
  const PREFIXO_LONGO = "TypeError-vindo-de-biblioteca-que-poe-corpo-de-requisicao-no-name: ";

  it("`.name` hostil (getter que devolve o corpo da requisição): nada do marcador chega ao log", async () => {
    transcreverAudioMock.mockResolvedValue({ provider: "groq", texto: `fala com ${MARCADOR_D10} dentro` });
    const excecaoHostil = new Error(`corpo enviado: ${MARCADOR_D10}`);
    Object.defineProperty(excecaoHostil, "name", {
      get: () => `${PREFIXO_LONGO}${MARCADOR_D10}`,
    });
    ligarCliente(selectsFeliz(), { updateSessaoLanca: excecaoHostil });
    const console_ = espiarConsole();

    const resultado = await transcreverSessao(formData({ sessaoId: "ses-1", arquivo: arquivoAudio() }));
    const logado = console_.argumentos();
    console_.restaurar();

    expect(resultado.ok).toBe(false);
    for (const arg of logado) {
      expect(arg).not.toContain(MARCADOR_D10);
      // Nenhum detalhe logado por esta ação passa de 40 caracteres — é curto
      // demais para carregar fala, por construção.
      expect(arg.length).toBeLessThanOrEqual(80);
    }
    expect(JSON.stringify(resultado)).not.toContain(MARCADOR_D10);
  });

  it("`error.code` como OBJETO (não string): vira string curta no log, sem carregar o marcador", async () => {
    const codeHostil = {
      toString: () => `codigo-inventado-por-biblioteca-de-terceiro:${MARCADOR_D10}`,
    };
    ligarCliente({
      sessao: { data: null, error: { code: codeHostil, message: "irrelevante" } as unknown as ErroSupabase },
    });
    const console_ = espiarConsole();

    const resultado = await transcreverSessao(formData({ sessaoId: "ses-1", arquivo: arquivoAudio() }));
    const logado = console_.argumentos();
    console_.restaurar();

    expect(resultado.ok).toBe(false);
    expect(resultado.erro).toBe(MOTIVO_ERRO_LEITURA);
    for (const arg of logado) expect(arg).not.toContain(MARCADOR_D10);
  });

  it("`error.code` como ARRAY: mesmo tratamento, nada longo chega ao log", async () => {
    const codeArray = ["PGRST301", `detalhe-com-${MARCADOR_D10}`, "mais-um-item-so-para-esticar-a-string"];
    ligarCliente({
      sessao: { data: null, error: { code: codeArray, message: "irrelevante" } as unknown as ErroSupabase },
    });
    const console_ = espiarConsole();

    await transcreverSessao(formData({ sessaoId: "ses-1", arquivo: arquivoAudio() }));
    const logado = console_.argumentos();
    console_.restaurar();

    for (const arg of logado) expect(arg).not.toContain(MARCADOR_D10);
  });
});

// ------------------------------------------------------------
// D11 — `.trim()` sozinho não pega caractere de largura zero. U+200B e
// companhia NÃO são espaço para o `.trim()` da linguagem, mas também não
// são fala: uma transcrição feita só deles ocupa espaço, marca a sessão
// como "já transcrita" e não tem uma palavra dentro — pior do que uma
// vazia declarada. A checagem de vazio passa a desconsiderá-los.
//
// LIMITE DESTA CORREÇÃO: ela decide só se o texto É VAZIO. O texto REAL
// continua sendo gravado CRU, sem trim e sem remoção nenhuma — não é papel
// desta ação editar a fala do cliente (ver o último teste do bloco).
// ------------------------------------------------------------

describe("D11 — largura zero não é fala: continua sendo 'transcrição vazia'", () => {
  // Escapes `\u...` de propósito, nunca o caractere literal: um zero-width
  // colado no fonte é invisível no editor e some no primeiro "arruma os
  // espaços" que alguém rodar no arquivo — o teste passaria a testar "".
  it.each([
    ["zero-width space (U+200B)", "\u200B"],
    ["zero-width non-joiner (U+200C)", "\u200C"],
    ["zero-width joiner (U+200D)", "\u200D"],
    ["BOM no meio (U+FEFF)", "\uFEFF\uFEFF"],
    ["largura zero misturado com espaço comum", " \u200B \n \u200D "],
  ])("texto só com %s: recusa, zero UPDATE", async (_rotulo, textoInvisivel) => {
    transcreverAudioMock.mockResolvedValue({ provider: "groq", texto: textoInvisivel });
    const cliente = ligarCliente(selectsFeliz());

    const resultado = await transcreverSessao(formData({ sessaoId: "ses-1", arquivo: arquivoAudio() }));

    expect(resultado.ok).toBe(false);
    expect(resultado.erro).toBe(MOTIVO_TRANSCRICAO_VAZIA);
    expect(cliente.updateSessaoMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("fala de verdade COM um zero-width no meio é gravada — e gravada CRUA, sem edição", async () => {
    const falaComInvisivel = "  bom dia\u200B, vamos começar  ";
    transcreverAudioMock.mockResolvedValue({ provider: "groq", texto: falaComInvisivel });
    const cliente = ligarCliente(selectsFeliz());

    const resultado = await transcreverSessao(formData({ sessaoId: "ses-1", arquivo: arquivoAudio() }));

    expect(resultado.ok).toBe(true);
    const valores = cliente.updateSessaoMock.mock.calls[0][0] as Record<string, unknown>;
    // Byte a byte igual ao que o motor devolveu: nem trim, nem remoção do
    // U+200B. A limpeza vale só para DECIDIR se está vazio.
    expect(valores.transcricao).toBe(falaComInvisivel);
    expect(resultado.caracteres).toBe(falaComInvisivel.length);
  });
});

// ------------------------------------------------------------
// D12 — o marcador único só era plantado em cenários de FALHA. Faltava
// exatamente onde o texto EXISTE: o caminho feliz (a transcrição está em
// memória, prestes a ir para o banco) e o caminho de erro da Groq (a
// exceção pode carregar o corpo da resposta). Sem espião nesses dois, um
// `console.warn` com o texto passa despercebido.
//
// Cobertura: os CINCO canais de `console`, não só `warn` — ver `espiarConsole`.
// ------------------------------------------------------------

describe("D12 — nenhum canal de console carrega o texto no caminho feliz nem no erro da Groq", () => {
  const MARCADOR_D12 = "MARCADOR-D12-CONVERSA-INTEIRA-DO-CLIENTE-2e7f";

  it("caminho FELIZ (é onde o texto existe): grava com sucesso e nenhum canal de console cita o texto", async () => {
    transcreverAudioMock.mockResolvedValue({
      provider: "groq",
      texto: `bom dia, então o problema é ${MARCADOR_D12} e foi isso que aconteceu`,
    });
    const cliente = ligarCliente(selectsFeliz());
    const console_ = espiarConsole();

    const resultado = await transcreverSessao(formData({ sessaoId: "ses-1", arquivo: arquivoAudio() }));
    const logado = console_.argumentos();
    console_.restaurar();

    // Controle positivo: o caminho realmente rodou até o fim, com o texto na
    // mão. Sem isto, "não vazou" poderia ser só "nem chegou lá".
    expect(resultado.ok).toBe(true);
    expect(cliente.updateSessaoMock).toHaveBeenCalledTimes(1);
    const valores = cliente.updateSessaoMock.mock.calls[0][0] as Record<string, unknown>;
    expect(String(valores.transcricao)).toContain(MARCADOR_D12);

    for (const arg of logado) expect(arg).not.toContain(MARCADOR_D12);
    expect(JSON.stringify(resultado)).not.toContain(MARCADOR_D12);
  });

  it("erro da GROQ com o corpo da resposta na mensagem: nenhum canal de console cita esse corpo", async () => {
    // Uma API que devolve 400 costuma ecoar o payload recebido no corpo do
    // erro — e o payload, aqui, é o áudio/transcrição da sessão.
    const corpoEcoado = `Groq 400: {"error":"bad request","received":"${MARCADOR_D12}"}`;
    transcreverAudioMock.mockRejectedValue(new Error(corpoEcoado));
    const cliente = ligarCliente(selectsFeliz());
    const console_ = espiarConsole();

    const resultado = await transcreverSessao(formData({ sessaoId: "ses-1", arquivo: arquivoAudio() }));
    const logado = console_.argumentos();
    console_.restaurar();

    expect(resultado.ok).toBe(false);
    expect(cliente.updateSessaoMock).not.toHaveBeenCalled();
    // Controle positivo: o catch da Groq de fato logou alguma coisa — a
    // prova é "logou sem o corpo", não "não logou nada".
    expect(logado.length).toBeGreaterThan(0);

    for (const arg of logado) {
      expect(arg).not.toContain(MARCADOR_D12);
      expect(arg).not.toContain(corpoEcoado);
    }
    expect(JSON.stringify(resultado)).not.toContain(MARCADOR_D12);
  });
});

// ------------------------------------------------------------
// D13 — escopo do UPDATE provado por COLUNA + VALOR, não só por presença.
//
// Achado durante a mutação desta rodada: remover o `.eq` do UPDATE por
// inteiro já morria (a promise nunca resolvia), mas trocar a COLUNA
// (`workspace_id` no lugar de `id`) ou o VALOR (outro id) sobrevivia à
// suíte — ou seja, a escrita podia cair na linha errada sem nenhum teste
// reclamar. O dublê já coletava `eqChamadas` para `sessao(update)`; o que
// faltava era assertar. Escrever transcrição na sessão errada é vazar a
// conversa de um cliente para a ficha de outro.
// ------------------------------------------------------------

describe("D13 — o UPDATE é escopado em .eq('id', sessaoId), com coluna e valor exatos", () => {
  it("a chamada .eq do UPDATE é exatamente coluna 'id' com o sessaoId pedido — e é a única", async () => {
    transcreverAudioMock.mockResolvedValue({ provider: "groq", texto: "conteúdo transcrito" });
    const cliente = ligarCliente(selectsFeliz());

    const resultado = await transcreverSessao(
      formData({ sessaoId: "ses-escopo-42", arquivo: arquivoAudio() })
    );

    expect(resultado.ok).toBe(true);
    const eqDoUpdate = cliente.eqChamadas.filter((c) => c.tabela === "sessao(update)");
    expect(eqDoUpdate).toEqual([{ tabela: "sessao(update)", coluna: "id", valor: "ses-escopo-42" }]);
  });
});

// ------------------------------------------------------------
// D14 — a mensagem do zod é a ÚNICA saída de `erro` que não é uma constante
// literal no código: ela vem de `error.issues[0].message`. O zod, por
// padrão, ECOA valores em algumas mensagens ("expected string, received
// ..."), então "é do zod" não basta como garantia. Aqui as duas únicas
// issues possíveis (`min` e `max`) têm mensagem customizada, e este teste
// trava isso: entrada absurda sai com o texto EXATO da constante, sem um
// pedaço do que a pessoa mandou.
// ------------------------------------------------------------

describe("D14 — a mensagem do zod é sempre uma constante nossa, nunca ecoa a entrada", () => {
  it("sessaoId vazio: mensagem EXATA é MOTIVO_SESSAO_INVALIDA", async () => {
    const resultado = await transcreverSessao(formData({ sessaoId: "", arquivo: arquivoAudio() }));

    expect(resultado.erro).toBe(MOTIVO_SESSAO_INVALIDA);
  });

  it("sessaoId absurdamente longo: mensagem EXATA é MOTIVO_SESSAO_NAO_ENCONTRADA e não contém a entrada", async () => {
    const idAbsurdo = "id-forjado-com-conteudo-sensivel-".repeat(20);

    const resultado = await transcreverSessao(formData({ sessaoId: idAbsurdo, arquivo: arquivoAudio() }));

    expect(resultado.erro).toBe(MOTIVO_SESSAO_NAO_ENCONTRADA);
    expect(resultado.erro).not.toContain("id-forjado");
    expect(criarSupabaseServerMock).not.toHaveBeenCalled();
  });
});
