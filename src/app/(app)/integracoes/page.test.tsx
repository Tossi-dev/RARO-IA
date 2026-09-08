import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const { lerAbasMock, contaUatMock, listEventosMock, listMatriculasMock, listProdutosMock, modoDadosMock, googleAppMock } = vi.hoisted(() => ({
  lerAbasMock: vi.fn(),
  contaUatMock: vi.fn(),
  listEventosMock: vi.fn(),
  listMatriculasMock: vi.fn(),
  listProdutosMock: vi.fn(),
  modoDadosMock: vi.fn(() => "supabase"),
  googleAppMock: vi.fn(),
}));

vi.mock("@/lib/uat/isolamento", () => ({ contaUatSinteticaAtual: contaUatMock }));
vi.mock("@/lib/sheets/ler", () => ({ lerAbas: lerAbasMock }));
vi.mock("@/lib/sheets/config", () => ({
  sheetsConfigurado: () => true,
  sheetsEscritaConfigurada: () => true,
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

const { default: Integracoes } = await import("./page");

beforeEach(() => {
  vi.clearAllMocks();
  contaUatMock.mockResolvedValue(true);
  lerAbasMock.mockResolvedValue({});
  listEventosMock.mockResolvedValue([]);
  listMatriculasMock.mockResolvedValue([]);
  listProdutosMock.mockResolvedValue([]);
  modoDadosMock.mockReturnValue("supabase");
  googleAppMock.mockReturnValue(false);
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

  it("não oferece botão falso quando o aplicativo Google ainda não foi preparado", async () => {
    contaUatMock.mockResolvedValue(false);
    googleAppMock.mockReturnValue(false);

    const html = renderToStaticMarkup(await Integracoes({}));

    expect(html).toContain('data-conexao-autonoma="google-calendar"');
    expect(html).toContain("A conexão segura do Google está sendo preparada pela plataforma.");
    expect(html).not.toContain('href="/api/agenda/google/entrar"');
  });
});
