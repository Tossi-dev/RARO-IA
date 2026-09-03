// Testes de `acoes-calendario.ts` — a Server Action que amarra sessão de
// mentoria e evento do Google (Tarefa 16). Dublês por `vi.mock`, mesmo
// espírito de `acoes.test.ts`/`dados.test.ts`: nada fala com um Postgres ou
// um Google de verdade.
//
// REVISADO após reprovação de revisor independente (laudo completo na
// sessão de correção). Além das cinco asserções originais da tarefa, esta
// suíte agora também prova:
//   (2) sessão CANCELADA sem Google conectado degrada para um `.ics` de
//       CANCELAMENTO (STATUS:CANCELLED/METHOD:CANCEL, mesmo UID) — nunca um
//       convite comum que reativaria o compromisso na agenda de quem
//       importar;
//   (3) falha ao gravar `evento_google_id` depois de o Google criar o
//       evento aciona uma AÇÃO COMPENSATÓRIA (`cancelarEventoDaSessao` no
//       evento recém-criado) em vez de instruir "sincronize de novo" — que
//       duplicaria o evento; os dois desfechos da compensação (sucesso e
//       falha) têm mensagens diferentes e testadas separadamente;
//   (g)-(j) os quatro mutantes que sobreviveram à rodada anterior:
//       `caminhoFicha` sempre errado, as duas mensagens de degradação
//       trocadas entre si, `revalidatePath` removido de todo caminho, e UID
//       do `.ics` virando aleatório.

import { afterEach, describe, expect, it, vi } from "vitest";

// `dados-atendimento.ts` é server-only no produto; o módulo marcador não é
// instalado no runtime do Vitest. Este mock virtual preserva a fronteira sem
// carregar Next, rede ou configuração de ambiente.
// @ts-expect-error Vitest aceita a opção virtual no runtime.
vi.mock("server-only", () => ({}), { virtual: true });

const {
  criarSupabaseServerMock,
  revalidatePathMock,
  criarEventoDaSessaoMock,
  atualizarEventoDaSessaoMock,
  cancelarEventoDaSessaoMock,
  googleConectadoMock,
  googleAppConfiguradoMock,
  contaUatMock,
} = vi.hoisted(() => ({
  criarSupabaseServerMock: vi.fn(),
  revalidatePathMock: vi.fn(),
  criarEventoDaSessaoMock: vi.fn(),
  atualizarEventoDaSessaoMock: vi.fn(),
  cancelarEventoDaSessaoMock: vi.fn(),
  googleConectadoMock: vi.fn(),
  googleAppConfiguradoMock: vi.fn(),
  contaUatMock: vi.fn(() => Promise.resolve(false)),
}));

vi.mock("../supabase/server", () => ({
  criarSupabaseServer: criarSupabaseServerMock,
}));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("../integracoes/google-agenda-escrita", () => ({
  criarEventoDaSessao: criarEventoDaSessaoMock,
  atualizarEventoDaSessao: atualizarEventoDaSessaoMock,
  cancelarEventoDaSessao: cancelarEventoDaSessaoMock,
}));
vi.mock("../integracoes/google-agenda", () => ({
  googleConectado: googleConectadoMock,
  googleAppConfigurado: googleAppConfiguradoMock,
}));
vi.mock("../uat/isolamento", () => ({ contaUatSinteticaAtual: contaUatMock }));

const { sincronizarSessaoNaAgenda, MOTIVO_SEM_CONEXAO_GOOGLE, MOTIVO_APP_NAO_CONFIGURADO, MOTIVO_UAT_SEM_GOOGLE } = await import(
  "./acoes-calendario"
);
const { eventoDaSessao } = await import("./calendario");
const { analisarICS } = await import("../integracoes/ics");

describe("isolamento UAT sintético", () => {
  it("recusa antes do banco e de qualquer operação no Google", async () => {
    contaUatMock.mockResolvedValue(true);
    const formData = new FormData();
    formData.set("sessaoId", "11111111-1111-4111-8111-111111111111");
    await expect(sincronizarSessaoNaAgenda(formData)).resolves.toEqual({ ok: false, erro: MOTIVO_UAT_SEM_GOOGLE });
    expect(criarSupabaseServerMock).not.toHaveBeenCalled();
    expect(criarEventoDaSessaoMock).not.toHaveBeenCalled();
    expect(atualizarEventoDaSessaoMock).not.toHaveBeenCalled();
    expect(cancelarEventoDaSessaoMock).not.toHaveBeenCalled();
  });
});

// ============================================================
// Dublê do cliente Supabase — encadeia `.select()/.eq()/.maybeSingle()` e
// `.update()/.eq()`, resposta escolhida pelo teste, indexada por NOME DE
// TABELA (mesmo padrão de `dados.test.ts`). Cada `.eq(coluna, valor)` fica
// registrado em `eqChamadas` para provar, por asserção direta, que nenhum
// valor vindo do formulário (workspace/mentorado forjados) chega a uma
// consulta.
// ============================================================

type ErroSupabase = { code?: string; message?: string };
type RespostaSelect = { data: unknown; error: ErroSupabase | null };
type RespostaUpdate = { data: null; error: ErroSupabase | null };

function construirCliente(
  selects: Record<string, RespostaSelect>,
  opcoes: { updateSessaoResposta?: RespostaUpdate } = {}
) {
  const eqChamadas: Array<{ tabela: string; coluna: string; valor: unknown }> = [];
  const updateSessaoMock = vi.fn((_valores: Record<string, unknown>) => ({
    eq: (coluna: string, valor: unknown) => {
      eqChamadas.push({ tabela: "sessao(update)", coluna, valor });
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
        maybeSingle: () => Promise.resolve(selects[tabela] ?? { data: null, error: null }),
      };
      return builder;
    },
    update: tabela === "sessao" ? updateSessaoMock : vi.fn(() => ({ eq: vi.fn() })),
    delete: deleteMock,
  }));

  return { from: fromMock, eqChamadas, updateSessaoMock, deleteMock };
}

function ligarCliente(
  selects: Record<string, RespostaSelect>,
  opcoes: { updateSessaoResposta?: RespostaUpdate } = {}
) {
  const cliente = construirCliente(selects, opcoes);
  criarSupabaseServerMock.mockReturnValue(cliente);
  return cliente;
}

function formData(campos: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [chave, valor] of Object.entries(campos)) fd.set(chave, valor);
  return fd;
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
    status: "agendada",
    link_gravacao: "",
    transcricao: "",
    resumo: "",
    eventoGoogleId: "",
    linkReuniao: "",
    gravacaoLiberada: false,
    transcricaoLiberada: false,
    transcritaEm: null,
    transcricaoOrigem: "",
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

function linhaMentorado(parcial: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: "ment-1",
    workspace_id: "ws-1",
    aluno_id: null,
    perfil_id: null,
    nome: "Maria Fernandes",
    telefone: "11987654321",
    email: "maria@exemplo.com",
    origem: "indicacao",
    status: "ativo",
    criado_em: "2026-01-01T00:00:00Z",
    ...parcial,
  };
}

function linhaPrograma(parcial: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: "prog-1",
    workspace_id: "ws-1",
    nome: "Elite",
    formato: "individual",
    total_sessoes: 12,
    preco: 4500,
    ativo: true,
    criado_em: "2026-01-01T00:00:00Z",
    ...parcial,
  };
}

/** As quatro tabelas felizes: sessão 1:1 (via matrícula), tudo encontrado. */
function selectsFeliz(
  overridesSessao: Partial<Record<string, unknown>> = {}
): Record<string, RespostaSelect> {
  return {
    sessao: { data: linhaSessao(overridesSessao), error: null },
    matricula: { data: linhaMatricula(), error: null },
    mentorado: { data: linhaMentorado(), error: null },
    programa: { data: linhaPrograma(), error: null },
  };
}

/** Linha de UID pura, para comparar entre dois `.ics` sem depender do resto do texto. */
function linhaUidDe(conteudo: string): string | undefined {
  return conteudo.match(/^UID:.*$/m)?.[0];
}

afterEach(() => {
  vi.resetAllMocks();
});

// ============================================================
// Entrada inválida / sessão não encontrada — zero chamada ao Google.
// ============================================================

describe("entrada inválida e sessão não encontrada", () => {
  it("sessaoId vazio: nem chega a construir o cliente Supabase, nem revalida path", async () => {
    const resultado = await sincronizarSessaoNaAgenda(formData({}));

    expect(resultado.ok).toBe(false);
    expect(resultado.erro).toBeTruthy();
    expect(criarSupabaseServerMock).not.toHaveBeenCalled();
    expect(googleConectadoMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("sessão não encontrada (RLS de outro workspace devolve o mesmo null): erro humano, zero chamada ao Google", async () => {
    ligarCliente({ sessao: { data: null, error: null } });

    const resultado = await sincronizarSessaoNaAgenda(formData({ sessaoId: "ses-fantasma" }));

    expect(resultado.ok).toBe(false);
    expect(resultado.erro).toBeTruthy();
    expect(criarEventoDaSessaoMock).not.toHaveBeenCalled();
    expect(atualizarEventoDaSessaoMock).not.toHaveBeenCalled();
    expect(cancelarEventoDaSessaoMock).not.toHaveBeenCalled();
    expect(googleConectadoMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("erro do banco na leitura da sessão não lança: vira console.warn + retorno de erro", async () => {
    ligarCliente({ sessao: { data: null, error: { code: "PGRST301", message: "linha inacessível" } } });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(sincronizarSessaoNaAgenda(formData({ sessaoId: "ses-1" }))).resolves.toMatchObject({
      ok: false,
    });
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

// ============================================================
// (e) — a Server Action NUNCA lê identidade do formulário.
// ============================================================

describe("workspace_id/mentoradoId do formulário são ignorados", () => {
  it("resultado idêntico com ou sem workspace_id forjado, e o valor forjado nunca chega a uma consulta", async () => {
    googleAppConfiguradoMock.mockReturnValue(true);
    googleConectadoMock.mockReturnValue(true);
    atualizarEventoDaSessaoMock.mockResolvedValue({ ok: true });

    const clienteSemForjar = ligarCliente(selectsFeliz({ evento_google_id: "evt-1" }));
    const resultadoSemForjar = await sincronizarSessaoNaAgenda(formData({ sessaoId: "ses-1" }));

    const clienteComForjar = ligarCliente(selectsFeliz({ evento_google_id: "evt-1" }));
    const resultadoComForjar = await sincronizarSessaoNaAgenda(
      formData({
        sessaoId: "ses-1",
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
    // A ÚNICA consulta pela sessão usa a coluna "id" com o `sessaoId` de
    // verdade — nunca uma coluna "workspace_id" vinda do formulário.
    expect(clienteComForjar.eqChamadas[0]).toEqual({ tabela: "sessao", coluna: "id", valor: "ses-1" });
  });
});

// ============================================================
// (a) — evento_google_id preenchido chama ATUALIZAR, nunca criar.
// ============================================================

describe("sessão já sincronizada chama atualizar, não criar", () => {
  it("evento_google_id preenchido: atualizarEventoDaSessao 1x, criarEventoDaSessao 0x, revalidatePath nos dois caminhos certos", async () => {
    googleAppConfiguradoMock.mockReturnValue(true);
    googleConectadoMock.mockReturnValue(true);
    atualizarEventoDaSessaoMock.mockResolvedValue({ ok: true });

    ligarCliente(selectsFeliz({ evento_google_id: "evt-existente" }));

    const resultado = await sincronizarSessaoNaAgenda(formData({ sessaoId: "ses-1" }));

    expect(resultado.ok).toBe(true);
    expect(atualizarEventoDaSessaoMock).toHaveBeenCalledTimes(1);
    expect(atualizarEventoDaSessaoMock).toHaveBeenCalledWith(
      "evt-existente",
      expect.objectContaining({ titulo: expect.stringContaining("Maria") })
    );
    expect(criarEventoDaSessaoMock).not.toHaveBeenCalled();

    // (g) mutante "caminhoFicha sempre errado" morre aqui: o caminho
    // exato precisa ser o da FICHA do mentorado retornado pelo banco.
    expect(revalidatePathMock).toHaveBeenCalledTimes(2);
    expect(revalidatePathMock).toHaveBeenCalledWith("/mentoria/ment-1");
    expect(revalidatePathMock).toHaveBeenCalledWith("/mentoria");
  });

  it("falha ao atualizar: revalidatePath NÃO é chamado", async () => {
    googleAppConfiguradoMock.mockReturnValue(true);
    googleConectadoMock.mockReturnValue(true);
    atualizarEventoDaSessaoMock.mockResolvedValue({ ok: false, erro: "Falhou." });

    ligarCliente(selectsFeliz({ evento_google_id: "evt-existente" }));
    const resultado = await sincronizarSessaoNaAgenda(formData({ sessaoId: "ses-1" }));

    expect(resultado.ok).toBe(false);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});

// ============================================================
// (b) — falha do Google no CRIAR não grava evento_google_id.
// ============================================================

describe("falha do Google ao criar não grava evento_google_id", () => {
  it("criarEventoDaSessao ok:false -> zero UPDATE em sessao, erro repassado, zero revalidatePath", async () => {
    googleAppConfiguradoMock.mockReturnValue(true);
    googleConectadoMock.mockReturnValue(true);
    criarEventoDaSessaoMock.mockResolvedValue({ ok: false, erro: "O Google recusou (HTTP 500)." });

    const cliente = ligarCliente(selectsFeliz({ evento_google_id: "" }));

    const resultado = await sincronizarSessaoNaAgenda(formData({ sessaoId: "ses-1" }));

    expect(resultado.ok).toBe(false);
    expect(resultado.erro).toBe("O Google recusou (HTTP 500).");
    expect(criarEventoDaSessaoMock).toHaveBeenCalledTimes(1);
    expect(cliente.updateSessaoMock).not.toHaveBeenCalled();
    expect(cancelarEventoDaSessaoMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("caminho feliz do criar GRAVA evento_google_id depois do Google confirmar, e revalida a ficha certa", async () => {
    googleAppConfiguradoMock.mockReturnValue(true);
    googleConectadoMock.mockReturnValue(true);
    criarEventoDaSessaoMock.mockResolvedValue({ ok: true, eventoGoogleId: "evt-novo" });

    const cliente = ligarCliente(selectsFeliz({ evento_google_id: "" }));

    const resultado = await sincronizarSessaoNaAgenda(formData({ sessaoId: "ses-1" }));

    expect(resultado.ok).toBe(true);
    expect(cliente.updateSessaoMock).toHaveBeenCalledTimes(1);
    expect(cliente.updateSessaoMock).toHaveBeenCalledWith({ evento_google_id: "evt-novo" });
    expect(revalidatePathMock).toHaveBeenCalledWith("/mentoria/ment-1");
    expect(revalidatePathMock).toHaveBeenCalledWith("/mentoria");
  });
});

// ============================================================
// (3 do laudo) — Google cria o evento, o BANCO falha ao gravar o id: ação
// COMPENSATÓRIA (desfazer no Google), não "sincronize de novo" (que
// duplicaria).
// ============================================================

describe("Google criou, banco não gravou o id: compensação", () => {
  it("compensação bem-sucedida: cancelarEventoDaSessao é chamado no evento recém-criado, mensagem diz que foi desfeito, zero revalidatePath", async () => {
    googleAppConfiguradoMock.mockReturnValue(true);
    googleConectadoMock.mockReturnValue(true);
    criarEventoDaSessaoMock.mockResolvedValue({ ok: true, eventoGoogleId: "evt-orfao" });
    cancelarEventoDaSessaoMock.mockResolvedValue({ ok: true });

    ligarCliente(selectsFeliz({ evento_google_id: "" }), {
      updateSessaoResposta: { data: null, error: { code: "PGRST301", message: "linha inacessível" } },
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const resultado = await sincronizarSessaoNaAgenda(formData({ sessaoId: "ses-1" }));

    expect(resultado.ok).toBe(false);
    expect(cancelarEventoDaSessaoMock).toHaveBeenCalledTimes(1);
    expect(cancelarEventoDaSessaoMock).toHaveBeenCalledWith("evt-orfao");
    // A mensagem precisa dizer que foi DESFEITO — não "sincronize de novo"
    // sozinho, que é exatamente o texto que duplicava o evento.
    expect(resultado.erro).toMatch(/desfeit/i);
    expect(resultado.erro).not.toMatch(/apague manualmente/i);
    expect(revalidatePathMock).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("compensação TAMBÉM falha: mensagem muda para avisar do evento solto (só agora é verdade)", async () => {
    googleAppConfiguradoMock.mockReturnValue(true);
    googleConectadoMock.mockReturnValue(true);
    criarEventoDaSessaoMock.mockResolvedValue({ ok: true, eventoGoogleId: "evt-orfao-2" });
    cancelarEventoDaSessaoMock.mockResolvedValue({ ok: false, erro: "O Google recusou (HTTP 500)." });

    ligarCliente(selectsFeliz({ evento_google_id: "" }), {
      updateSessaoResposta: { data: null, error: { code: "PGRST301", message: "linha inacessível" } },
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const resultado = await sincronizarSessaoNaAgenda(formData({ sessaoId: "ses-1" }));

    expect(resultado.ok).toBe(false);
    expect(cancelarEventoDaSessaoMock).toHaveBeenCalledWith("evt-orfao-2");
    expect(resultado.erro).toMatch(/apague manualmente/i);
    expect(resultado.erro).not.toMatch(/^Não foi possível salvar o vínculo desta sessão com o evento no Google; a criação foi desfeita/);
    expect(revalidatePathMock).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

// ============================================================
// (c) — cancelamento chama cancelar, mantém a linha (nada de DELETE, e
// evento_google_id é mantido — decisão travada aqui).
// ============================================================

describe("baixa cancelada (com Google conectado)", () => {
  it("chama cancelarEventoDaSessao e NUNCA escreve na linha (mantém evento_google_id, nunca deleta), revalida a ficha certa", async () => {
    googleAppConfiguradoMock.mockReturnValue(true);
    googleConectadoMock.mockReturnValue(true);
    cancelarEventoDaSessaoMock.mockResolvedValue({ ok: true });

    const cliente = ligarCliente(selectsFeliz({ status: "cancelada", evento_google_id: "evt-cancelar" }));

    const resultado = await sincronizarSessaoNaAgenda(formData({ sessaoId: "ses-1" }));

    expect(resultado.ok).toBe(true);
    expect(cancelarEventoDaSessaoMock).toHaveBeenCalledTimes(1);
    expect(cancelarEventoDaSessaoMock).toHaveBeenCalledWith("evt-cancelar");
    expect(criarEventoDaSessaoMock).not.toHaveBeenCalled();
    expect(atualizarEventoDaSessaoMock).not.toHaveBeenCalled();
    // Nada de DELETE.
    expect(cliente.deleteMock).not.toHaveBeenCalled();
    // Nada de UPDATE — é assim que `evento_google_id` fica mantido: a linha
    // não é tocada neste ramo (decisão do cabeçalho de acoes-calendario.ts).
    expect(cliente.updateSessaoMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).toHaveBeenCalledWith("/mentoria/ment-1");
    expect(revalidatePathMock).toHaveBeenCalledWith("/mentoria");
  });

  it("cancelar sem evento_google_id (nunca sincronizada): ainda assim não escreve na linha", async () => {
    googleAppConfiguradoMock.mockReturnValue(true);
    googleConectadoMock.mockReturnValue(true);
    cancelarEventoDaSessaoMock.mockResolvedValue({ ok: true });

    const cliente = ligarCliente(selectsFeliz({ status: "cancelada", evento_google_id: "" }));

    const resultado = await sincronizarSessaoNaAgenda(formData({ sessaoId: "ses-1" }));

    expect(resultado.ok).toBe(true);
    expect(cancelarEventoDaSessaoMock).toHaveBeenCalledWith(null);
    expect(cliente.updateSessaoMock).not.toHaveBeenCalled();
  });

  it("falha ao cancelar no Google: revalidatePath NÃO é chamado", async () => {
    googleAppConfiguradoMock.mockReturnValue(true);
    googleConectadoMock.mockReturnValue(true);
    cancelarEventoDaSessaoMock.mockResolvedValue({ ok: false, erro: "Falhou." });

    ligarCliente(selectsFeliz({ status: "cancelada", evento_google_id: "evt-1" }));
    const resultado = await sincronizarSessaoNaAgenda(formData({ sessaoId: "ses-1" }));

    expect(resultado.ok).toBe(false);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});

// ============================================================
// (d) — sem Google conectado / app não configurado: zero chamada à API,
// resultado traz o .ics, nunca finge sucesso. As duas causas têm mensagens
// EXATAS diferentes (não só "diferentes entre si" — cada uma com seu
// próprio conteúdo esperado, para matar o mutante que as troca).
// ============================================================

describe("caminho degradado (.ics) — sessão ATIVA (não cancelada)", () => {
  it("Google não conectado: zero chamadas às três funções de escrita, ok:false, .ics presente e montado a partir do MESMO eventoDaSessao, sem marca de cancelamento", async () => {
    googleAppConfiguradoMock.mockReturnValue(true);
    googleConectadoMock.mockReturnValue(false);

    ligarCliente(selectsFeliz({ evento_google_id: "" }));

    const resultado = await sincronizarSessaoNaAgenda(formData({ sessaoId: "ses-1" }));

    expect(resultado.ok).toBe(false);
    expect(resultado.erro).toBe(MOTIVO_SEM_CONEXAO_GOOGLE);
    expect(criarEventoDaSessaoMock).not.toHaveBeenCalled();
    expect(atualizarEventoDaSessaoMock).not.toHaveBeenCalled();
    expect(cancelarEventoDaSessaoMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();

    expect(resultado.ics).toBeDefined();
    expect(resultado.ics!.nomeArquivo).toBe("sessao-ses-1.ics");
    expect(resultado.ics!.conteudo).toContain("BEGIN:VCALENDAR");
    expect(resultado.ics!.conteudo).toContain("END:VCALENDAR");
    expect(resultado.ics!.conteudo).not.toContain("METHOD:CANCEL");
    expect(resultado.ics!.conteudo).not.toContain("STATUS:CANCELLED");

    // Decisão 5 do plano: o `.ics` usa EXATAMENTE o mesmo objeto que
    // `eventoDaSessao` produziria para esta sessão — não um texto à parte.
    // Prova com o parser de VERDADE do repositório (`analisarICS`), não só
    // "a string contém X".
    const { statusSessaoDe } = await import("./tipos");
    const eventoEsperado = eventoDaSessao(
      {
        id: "ses-1",
        workspaceId: "ws-1",
        matriculaId: "mat-1",
        turmaId: null,
        numero: 3,
        quando: "2026-08-20T23:00:00.000Z",
        duracaoMin: 60,
        status: statusSessaoDe("agendada"),
        linkGravacao: "",
        transcricao: "",
        resumo: "",
        eventoGoogleId: "",
        linkReuniao: "",
        gravacaoLiberada: false,
        transcricaoLiberada: false,
        transcritaEm: null,
        transcricaoOrigem: "",
        criadoEm: "2026-01-01T00:00:00Z",
      },
      {
        id: "ment-1",
        workspaceId: "ws-1",
        alunoId: null,
        perfilId: null,
        nome: "Maria Fernandes",
        telefone: "11987654321",
        email: "maria@exemplo.com",
        origem: "indicacao",
        status: "ativo",
        criadoEm: "2026-01-01T00:00:00Z",
      },
      {
        id: "prog-1",
        workspaceId: "ws-1",
        nome: "Elite",
        formato: "individual",
        totalSessoes: 12,
        preco: 4500,
        ativo: true,
        criadoEm: "2026-01-01T00:00:00Z",
      }
    );
    expect(eventoEsperado).not.toBeNull();

    const lido = analisarICS(
      resultado.ics!.conteudo,
      new Date("2026-01-01T00:00:00Z"),
      new Date("2026-12-31T00:00:00Z")
    );
    expect(lido.eventos).toHaveLength(1);
    expect(lido.eventos[0].titulo).toBe(eventoEsperado!.titulo);
    expect(lido.eventos[0].descricao).toBe(eventoEsperado!.descricao);
    expect(lido.eventos[0].cancelado).toBe(false);
  });

  it("app não configurado: também degrada para .ics, com o CONTEÚDO EXATO da mensagem de app não configurado — não a de conexão", async () => {
    googleAppConfiguradoMock.mockReturnValue(false);
    googleConectadoMock.mockReturnValue(true);

    ligarCliente(selectsFeliz({ evento_google_id: "" }));
    const resultado = await sincronizarSessaoNaAgenda(formData({ sessaoId: "ses-1" }));

    expect(resultado.ok).toBe(false);
    // (h) mutante "troca as duas mensagens entre si": asserção de conteúdo
    // EXATO de CADA uma, não só "são diferentes" — a antiga suíte só
    // provava a segunda parte, e um mutante que troca as duas passava.
    expect(resultado.erro).toBe(MOTIVO_APP_NAO_CONFIGURADO);
    expect(resultado.erro).not.toBe(MOTIVO_SEM_CONEXAO_GOOGLE);
    expect(criarEventoDaSessaoMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("sem conexão: o CONTEÚDO EXATO é o de 'não conectado' — não o de 'app não configurado'", async () => {
    googleAppConfiguradoMock.mockReturnValue(true);
    googleConectadoMock.mockReturnValue(false);

    ligarCliente(selectsFeliz({ evento_google_id: "" }));
    const resultado = await sincronizarSessaoNaAgenda(formData({ sessaoId: "ses-1" }));

    expect(resultado.ok).toBe(false);
    expect(resultado.erro).toBe(MOTIVO_SEM_CONEXAO_GOOGLE);
    expect(resultado.erro).not.toBe(MOTIVO_APP_NAO_CONFIGURADO);
  });

  it("app configurado tem prioridade de checagem sobre conexão quando os dois faltam (ainda assim mensagem exata de app não configurado)", async () => {
    googleAppConfiguradoMock.mockReturnValue(false);
    googleConectadoMock.mockReturnValue(false);

    ligarCliente(selectsFeliz({ evento_google_id: "" }));
    const resultado = await sincronizarSessaoNaAgenda(formData({ sessaoId: "ses-1" }));

    expect(resultado.erro).toBe(MOTIVO_APP_NAO_CONFIGURADO);
  });

  it("UID do .ics é ESTÁVEL: duas sincronizações degradadas da MESMA sessão produzem a MESMA linha UID (mutante (j): Math.random morre aqui)", async () => {
    googleAppConfiguradoMock.mockReturnValue(true);
    googleConectadoMock.mockReturnValue(false);

    ligarCliente(selectsFeliz({ evento_google_id: "" }));
    const r1 = await sincronizarSessaoNaAgenda(formData({ sessaoId: "ses-1" }));

    ligarCliente(selectsFeliz({ evento_google_id: "" }));
    const r2 = await sincronizarSessaoNaAgenda(formData({ sessaoId: "ses-1" }));

    const uid1 = linhaUidDe(r1.ics!.conteudo);
    const uid2 = linhaUidDe(r2.ics!.conteudo);
    expect(uid1).toBeTruthy();
    expect(uid1).toBe(uid2);
  });
});

// ============================================================
// (2 do laudo) — sessão CANCELADA sem Google conectado: o .ics degradado
// precisa ser um CANCELAMENTO (STATUS:CANCELLED/METHOD:CANCEL), nunca um
// convite comum — senão quem importa reativa o compromisso.
// ============================================================

describe("caminho degradado (.ics) — sessão CANCELADA", () => {
  it("Google não conectado + sessão cancelada: .ics vem com STATUS:CANCELLED e METHOD:CANCEL, mesmo UID do convite ativo, zero chamada ao Google", async () => {
    googleAppConfiguradoMock.mockReturnValue(true);
    googleConectadoMock.mockReturnValue(false);

    ligarCliente(selectsFeliz({ status: "cancelada", evento_google_id: "evt-existente" }));

    const resultado = await sincronizarSessaoNaAgenda(formData({ sessaoId: "ses-1" }));

    expect(resultado.ok).toBe(false);
    expect(criarEventoDaSessaoMock).not.toHaveBeenCalled();
    expect(atualizarEventoDaSessaoMock).not.toHaveBeenCalled();
    expect(cancelarEventoDaSessaoMock).not.toHaveBeenCalled();

    expect(resultado.ics).toBeDefined();
    expect(resultado.ics!.conteudo).toContain("METHOD:CANCEL");
    expect(resultado.ics!.conteudo).toContain("STATUS:CANCELLED");
    expect(linhaUidDe(resultado.ics!.conteudo)).toBe("UID:sessao-ses-1@mentoros");

    const lido = analisarICS(
      resultado.ics!.conteudo,
      new Date("2026-01-01T00:00:00Z"),
      new Date("2026-12-31T00:00:00Z")
    );
    expect(lido.eventos).toHaveLength(1);
    expect(lido.eventos[0].cancelado).toBe(true);
  });

  it("app não configurado + sessão cancelada: também degrada como CANCELAMENTO, não como convite", async () => {
    googleAppConfiguradoMock.mockReturnValue(false);
    googleConectadoMock.mockReturnValue(true);

    ligarCliente(selectsFeliz({ status: "cancelada", evento_google_id: "evt-existente" }));
    const resultado = await sincronizarSessaoNaAgenda(formData({ sessaoId: "ses-1" }));

    expect(resultado.ics!.conteudo).toContain("STATUS:CANCELLED");
    expect(resultado.erro).toBe(MOTIVO_APP_NAO_CONFIGURADO);
  });

  it("UID do .ics de cancelamento é o MESMO UID do convite ativo da mesma sessão (mesma sessão -> mesmo evento no calendário de quem importar)", async () => {
    googleAppConfiguradoMock.mockReturnValue(true);
    googleConectadoMock.mockReturnValue(false);

    ligarCliente(selectsFeliz({ status: "agendada", evento_google_id: "" }));
    const ativo = await sincronizarSessaoNaAgenda(formData({ sessaoId: "ses-1" }));

    ligarCliente(selectsFeliz({ status: "cancelada", evento_google_id: "" }));
    const cancelado = await sincronizarSessaoNaAgenda(formData({ sessaoId: "ses-1" }));

    expect(linhaUidDe(ativo.ics!.conteudo)).toBe(linhaUidDe(cancelado.ics!.conteudo));
  });
});

// ============================================================
// Sessão de turma: sem UM mentorado, ainda assim sincroniza.
// ============================================================

describe("sessão de turma (sem mentorado 1:1)", () => {
  it("busca turma + programa (não matrícula/mentorado) e cria o evento sem convidados", async () => {
    googleAppConfiguradoMock.mockReturnValue(true);
    googleConectadoMock.mockReturnValue(true);
    criarEventoDaSessaoMock.mockResolvedValue({ ok: true, eventoGoogleId: "evt-turma" });

    ligarCliente({
      sessao: {
        data: linhaSessao({ matricula_id: null, turma_id: "turma-1", evento_google_id: "" }),
        error: null,
      },
      turma: {
        data: { id: "turma-1", workspace_id: "ws-1", programa_id: "prog-1", nome: "Turma A" },
        error: null,
      },
      programa: { data: linhaPrograma({ formato: "turma" }), error: null },
    });

    const resultado = await sincronizarSessaoNaAgenda(formData({ sessaoId: "ses-1" }));

    expect(resultado.ok).toBe(true);
    expect(criarEventoDaSessaoMock).toHaveBeenCalledTimes(1);
    expect(criarEventoDaSessaoMock).toHaveBeenCalledWith(expect.objectContaining({ convidados: [] }));
    // Sem UM mentorado: a ficha para revalidar é a carteira geral.
    expect(revalidatePathMock).toHaveBeenCalledWith("/mentoria");
  });
});
