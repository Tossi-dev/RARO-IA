import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const { lerAbasMock, contaUatMock, listEventosMock, listMatriculasMock, listProdutosMock, modoDadosMock, googleAppMock, googleConexaoMock, sheetsConfiguradoMock, sheetsEscritaConfiguradaMock, sttConfiguradoMock, iaConfiguradaMock, metaConfiguradaMock, tiktokConfiguradoMock, gatewayConfiguradoMock } = vi.hoisted(() => ({
  lerAbasMock: vi.fn(),
  contaUatMock: vi.fn(),
  listEventosMock: vi.fn(),
  listMatriculasMock: vi.fn(),
  listProdutosMock: vi.fn(),
  modoDadosMock: vi.fn(() => "supabase"),
  googleAppMock: vi.fn(),
  googleConexaoMock: vi.fn(),
  sheetsConfiguradoMock: vi.fn(),
  sheetsEscritaConfiguradaMock: vi.fn(),
  sttConfiguradoMock: vi.fn(),
  iaConfiguradaMock: vi.fn(),
  metaConfiguradaMock: vi.fn(),
  tiktokConfiguradoMock: vi.fn(),
  gatewayConfiguradoMock: vi.fn(),
}));

vi.mock("@/lib/uat/isolamento", () => ({ contaUatSinteticaAtual: contaUatMock }));
vi.mock("@/lib/sheets/ler", () => ({ lerAbas: lerAbasMock }));
vi.mock("@/lib/sheets/config", () => ({
  sheetsConfigurado: sheetsConfiguradoMock,
  sheetsEscritaConfigurada: sheetsEscritaConfiguradaMock,
  sheetsId: () => "planilha-real-que-nao-deve-ser-lida",
}));
vi.mock("@/lib/data", () => ({
  getDB: () => ({
    listEventosWebhook: listEventosMock,
    listMatriculas: listMatriculasMock,
    listProdutos: listProdutosMock,
  }),
  modoDados: modoDadosMock,
  supabaseConfigurado: () => true,
}));
vi.mock("@/lib/sheets/mapear", () => ({ avisosDeMapeamento: () => [] }));
vi.mock("@/lib/integracoes/google-agenda", () => ({ googleAppConfigurado: googleAppMock }));
vi.mock("@/lib/integracoes/google-conexao-servidor", () => ({ conexaoGoogleAtivaDaOrganizacao: googleConexaoMock }));
vi.mock("@/lib/integracoes/stt", () => ({ sttConfigurado: sttConfiguradoMock }));
vi.mock("@/lib/integracoes/ia", () => ({ iaConfigurada: iaConfiguradaMock }));
vi.mock("@/lib/integracoes/social", () => ({ metaConfigurada: metaConfiguradaMock, tiktokConfigurado: tiktokConfiguradoMock }));
vi.mock("@/lib/integracoes/conexao-assistida", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/integracoes/conexao-assistida")>()),
  gatewayConfigurado: gatewayConfiguradoMock,
}));

const { default: Integracoes } = await import("./page");

function blocoConexaoGuiada(html: string): string {
  return html.match(/<section id="conexao-google-calendar"[\s\S]*?<\/section>/)?.[0] ?? "";
}

function paginaPrincipal(html: string): string {
  const inicio = html.indexOf('data-integracoes-inventario="completo"');
  return html.slice(inicio, html.indexOf("<aside", inicio));
}

function pendenciasVisiveis(html: string): string {
  const inicio = html.indexOf('data-integracoes-pendentes="todas"');
  return html.slice(inicio, html.indexOf("</aside>", inicio));
}

beforeEach(() => {
  vi.clearAllMocks();
  contaUatMock.mockResolvedValue(true);
  lerAbasMock.mockResolvedValue({});
  listEventosMock.mockResolvedValue([]);
  listMatriculasMock.mockResolvedValue([]);
  listProdutosMock.mockResolvedValue([]);
  modoDadosMock.mockReturnValue("supabase");
  googleAppMock.mockReturnValue(false);
  googleConexaoMock.mockResolvedValue({ ok: false, motivo: "nao_conectado" });
  sheetsConfiguradoMock.mockReturnValue(true);
  sheetsEscritaConfiguradaMock.mockReturnValue(true);
  sttConfiguradoMock.mockReturnValue(false);
  iaConfiguradaMock.mockReturnValue(false);
  metaConfiguradaMock.mockReturnValue(false);
  tiktokConfiguradoMock.mockReturnValue(false);
  gatewayConfiguradoMock.mockReturnValue(false);
});

describe("Integrações em UAT sintético", () => {
  it("não lê a planilha real quando a sessão é audit.invalid", async () => {
    await Integracoes({});
    expect(contaUatMock).toHaveBeenCalledOnce();
    expect(lerAbasMock).not.toHaveBeenCalled();
  });

  it("não passa pelo provider Google Sheets indireto quando o modo é planilha", async () => {
    modoDadosMock.mockReturnValue("planilha");
    await Integracoes({});
    expect(listEventosMock).not.toHaveBeenCalled();
    expect(listMatriculasMock).not.toHaveBeenCalled();
    expect(listProdutosMock).not.toHaveBeenCalled();
    expect(lerAbasMock).not.toHaveBeenCalled();
  });

  it("não finge sincronização nem revela metadado da planilha no UAT", async () => {
    const html = renderToStaticMarkup(await Integracoes({}));

    expect(html).toContain("Diagnóstico da planilha isolado no UAT");
    expect(html).not.toContain("Abas de entrada sincronizadas");
    expect(html).not.toContain("planil…lida");
    expect(html).not.toContain("Leitura ao vivo da planilha");
  });

  it("abre o inventário completo apenas pela intenção local na URL", async () => {
    const html = renderToStaticMarkup(await Integracoes({ searchParams: { todas: "1" } }));

    expect(html).toMatch(/<details[^>]*id="diagnosticos-completos"[^>]*open/);
    expect(lerAbasMock).not.toHaveBeenCalled();
  });

  it("mantém a conexão guiada ausente no UAT, sem revelar preparo do OAuth", async () => {
    googleAppMock.mockReturnValue(true);
    const html = renderToStaticMarkup(await Integracoes({}));

    expect(html).not.toContain('data-conexao-autonoma="google-calendar"');
    expect(html).not.toContain('href="/api/agenda/google/entrar"');
    expect(googleConexaoMock).not.toHaveBeenCalled();
  });

  it("oferece o início OAuth ao cliente só quando o aplicativo Google está preparado", async () => {
    contaUatMock.mockResolvedValue(false);
    googleAppMock.mockReturnValue(true);

    const html = renderToStaticMarkup(await Integracoes({}));

    expect(html).toContain('data-conexao-autonoma="google-calendar"');
    expect(html).toContain("Conecte sua agenda com o Google");
    expect(html).toContain('href="/api/agenda/google/entrar"');
    expect(html).toContain("Somente a tela oficial do Google recebe sua senha.");
  });

  it("reconhece o OAuth da organização e não conta iCal como outra conexão Google", async () => {
    contaUatMock.mockResolvedValue(false);
    googleConexaoMock.mockResolvedValue({ ok: true });

    const html = renderToStaticMarkup(await Integracoes({}));

    expect(googleConexaoMock).toHaveBeenCalledOnce();
    expect(html).toContain("Google conectado");
    expect(html).toContain('href="/agenda"');
    expect(html).not.toContain('href="/api/agenda/google/entrar"');
    expect(html).toMatch(/Próxima integração:<\/span>\s*Confirmação automática de Pix — Aguardando definição\./);
    expect(html).toContain("3/8");
    expect(html).toContain("Google Calendar</span>");
    expect(html).toContain("Próxima integração");
    expect(html).not.toContain("GOOGLE_REFRESH_TOKEN");
    expect(html).not.toContain("Agenda do Google (leitura)");
  });

  it("mantém a escrita da planilha como próxima pendência quando só a leitura está ativa", async () => {
    contaUatMock.mockResolvedValue(false);
    googleConexaoMock.mockResolvedValue({ ok: true });
    sheetsEscritaConfiguradaMock.mockReturnValue(false);

    const html = renderToStaticMarkup(await Integracoes({}));

    expect(html).toMatch(/Próxima integração:<\/span>\s*Planilha do Google — Em preparação\./);
    const guia = blocoConexaoGuiada(html);
    expect(guia).toContain("A leitura já está ativa; a escrita ainda precisa ser preparada pela plataforma. Você não precisa fornecer chaves.");
    expect(guia).not.toContain("RARO_SHEETS_WEBAPP_URL");
    expect(guia).not.toContain("RARO_SHEETS_SEGREDO");
    expect(html).not.toMatch(/Próxima integração:<\/span>\s*Confirmação automática de Pix/);
    expect(html).toContain("3/8");
  });

  it("fecha o status do Google em falha sem anunciar uma conexão", async () => {
    contaUatMock.mockResolvedValue(false);
    googleAppMock.mockReturnValue(true);
    googleConexaoMock.mockResolvedValue({ ok: false, motivo: "conexao_revogada" });

    const html = renderToStaticMarkup(await Integracoes({}));

    expect(html).toContain("foi revogada");
    expect(html).not.toContain("Google conectado");
  });

  it("fecha a interface quando a consulta autenticada do Google rejeita", async () => {
    contaUatMock.mockResolvedValue(false);
    googleConexaoMock.mockRejectedValue(new Error("falha interna que não pode ir para a tela"));

    const html = renderToStaticMarkup(await Integracoes({}));

    expect(html).toContain("Não foi possível confirmar a conexão Google desta organização agora.");
    expect(html).not.toContain("falha interna que não pode ir para a tela");
    expect(html).not.toContain("Google conectado");
  });

  it("não oferece botão falso quando o aplicativo Google ainda não foi preparado", async () => {
    contaUatMock.mockResolvedValue(false);
    googleAppMock.mockReturnValue(false);

    const html = renderToStaticMarkup(await Integracoes({}));

    expect(html).toContain('data-conexao-autonoma="google-calendar"');
    expect(html).toContain("A conexão segura do Google está sendo preparada pela plataforma.");
    expect(html).not.toContain('href="/api/agenda/google/entrar"');
  });

  it("mantém o inventário inteiro e todas as pendências visíveis antes do diagnóstico", async () => {
    const html = renderToStaticMarkup(await Integracoes({}));
    const principal = paginaPrincipal(html);
    const pendencias = pendenciasVisiveis(html);
    const nomes = [
      "Supabase (banco de dados)",
      "Planilha do Google (Base_Financeira_Operacao)",
      "Confirmação automática de Pix",
      "Google Calendar",
      "Transcrição de áudio (Groq Whisper)",
      "IA de resumo e copy (Anthropic)",
      "Instagram / Facebook (Meta)",
      "TikTok",
    ];

    for (const nome of nomes) {
      expect(principal).toContain(nome);
    }
    expect((principal.match(/<li(?: |>)/g) ?? [])).toHaveLength(8);
    expect(principal).not.toContain('data-integracoes-pendentes="todas"');
    for (const nome of nomes.slice(1)) expect(pendencias).toContain(nome);
    expect(pendencias).not.toContain("Supabase (banco de dados)");
    expect(pendencias).toContain("Todas as integrações pendentes");
    expect(pendencias).toContain("Todas as integrações pendentes (7)");
    expect(html).toContain('href="#todas-integracoes-pendentes"');
    expect(html).toContain('id="todas-integracoes-pendentes"');
    expect(pendencias).not.toContain("RARO_SHEETS_");
    expect(pendencias).toContain("Quem resolve");
    expect(pendencias).toContain("Próximo passo seguro");
  });

  it("inclui uma conexão parcial e exclui Google conectado das pendências visíveis", async () => {
    contaUatMock.mockResolvedValue(false);
    googleConexaoMock.mockResolvedValue({ ok: true });
    sheetsEscritaConfiguradaMock.mockReturnValue(false);

    const pendencias = pendenciasVisiveis(renderToStaticMarkup(await Integracoes({})));

    expect(pendencias).toContain("Planilha do Google (Base_Financeira_Operacao)");
    expect(pendencias).toContain("A leitura está ativa, mas a escrita ainda não está pronta.");
    expect(pendencias).not.toContain("Google Calendar</span>");
  });

  it("mantém o inventário e as pendências explicitamente isolados no UAT", async () => {
    const html = renderToStaticMarkup(await Integracoes({}));
    const inventario = paginaPrincipal(html);
    const pendencias = pendenciasVisiveis(html);

    expect((inventario.match(/<li(?: |>)/g) ?? [])).toHaveLength(8);
    expect(inventario).toContain("Bloqueada neste login de homologação");
    expect(pendencias).toContain("Esta integração está isolada neste login de homologação.");
    expect(pendencias).toContain("Ambiente de homologação");
    expect(pendencias).not.toContain("Conectar Google Calendar");
    expect(pendencias).not.toContain("testar com dados de teste");
  });

  it("não contradiz o Supabase permitido no inventário do UAT", async () => {
    const inventario = paginaPrincipal(renderToStaticMarkup(await Integracoes({})));
    const inicioSupabase = inventario.indexOf("Supabase (banco de dados)");
    const linhaSupabase = inventario.slice(inicioSupabase, inventario.indexOf("Planilha do Google", inicioSupabase));

    expect(linhaSupabase).toContain("Configuração local detectada; homologação com o fornecedor não confirmada.");
    expect(linhaSupabase).not.toContain("Bloqueada neste login de homologação");
  });

  it.each([
    ["conexao_revogada", "A conexão Google desta organização foi revogada."],
    ["erro_de_armazenamento", "Não foi possível confirmar o estado da conexão Google desta organização."],
    ["nao_autorizado", "Não foi possível confirmar o estado da conexão Google desta organização."],
  ] as const)("fecha o motivo da pendência Google em %s", async (motivo, esperado) => {
    contaUatMock.mockResolvedValue(false);
    googleConexaoMock.mockResolvedValue({ ok: false, motivo });

    const pendencias = pendenciasVisiveis(renderToStaticMarkup(await Integracoes({})));

    expect(pendencias).toContain(esperado);
    expect(pendencias).not.toContain("Esta organização ainda não autorizou o Google Calendar.");
    expect(pendencias).not.toContain("Google conectado");
  });

  it("não confunde flags globais com vínculo ou homologação da organização", async () => {
    contaUatMock.mockResolvedValue(false);
    googleConexaoMock.mockResolvedValue({ ok: true });
    gatewayConfiguradoMock.mockReturnValue(true);
    sttConfiguradoMock.mockReturnValue(true);
    iaConfiguradaMock.mockReturnValue(true);
    metaConfiguradaMock.mockReturnValue(true);
    tiktokConfiguradoMock.mockReturnValue(true);

    const inventario = paginaPrincipal(renderToStaticMarkup(await Integracoes({})));

    expect(inventario).toContain("Vínculo autenticado da organização confirmado.");
    expect(inventario).toContain("Configuração local detectada; homologação com o fornecedor não confirmada.");
    expect(inventario).not.toContain("Conexão ativa para esta organização.");
  });

  it("mostra o estado vazio honesto quando as oito integrações estão completas", async () => {
    contaUatMock.mockResolvedValue(false);
    googleConexaoMock.mockResolvedValue({ ok: true });
    gatewayConfiguradoMock.mockReturnValue(true);
    sttConfiguradoMock.mockReturnValue(true);
    iaConfiguradaMock.mockReturnValue(true);
    metaConfiguradaMock.mockReturnValue(true);
    tiktokConfiguradoMock.mockReturnValue(true);

    const principal = pendenciasVisiveis(renderToStaticMarkup(await Integracoes({})));

    expect(principal).toContain("Todas as integrações pendentes (0)");
    expect(principal).toContain("Nenhuma integração pendente neste momento.");
  });
});
