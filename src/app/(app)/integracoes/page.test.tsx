import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const { lerAbasMock, contaUatMock, listEventosMock, listMatriculasMock, listProdutosMock, modoDadosMock, googleAppMock, googleConexaoMock, sheetsConfiguradoMock, sheetsEscritaConfiguradaMock } = vi.hoisted(() => ({
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

const { default: Integracoes } = await import("./page");

function blocoConexaoGuiada(html: string): string {
  return html.match(/<section id="conexao-google-calendar"[\s\S]*?<\/section>/)?.[0] ?? "";
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
});
