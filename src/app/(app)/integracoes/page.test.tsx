import { beforeEach, describe, expect, it, vi } from "vitest";

const { lerAbasMock, contaUatMock, listEventosMock, listMatriculasMock, listProdutosMock, modoDadosMock } = vi.hoisted(() => ({
  lerAbasMock: vi.fn(),
  contaUatMock: vi.fn(),
  listEventosMock: vi.fn(),
  listMatriculasMock: vi.fn(),
  listProdutosMock: vi.fn(),
  modoDadosMock: vi.fn(() => "supabase"),
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

const { default: Integracoes } = await import("./page");

beforeEach(() => {
  vi.clearAllMocks();
  contaUatMock.mockResolvedValue(true);
  lerAbasMock.mockResolvedValue({});
  listEventosMock.mockResolvedValue([]);
  listMatriculasMock.mockResolvedValue([]);
  listProdutosMock.mockResolvedValue([]);
  modoDadosMock.mockReturnValue("supabase");
});

describe("Integrações em UAT sintético", () => {
  it("não lê a planilha real quando a sessão é audit.invalid", async () => {
    await Integracoes();
    expect(contaUatMock).toHaveBeenCalledOnce();
    expect(lerAbasMock).not.toHaveBeenCalled();
  });

  it("não passa pelo provider Google Sheets indireto quando o modo é planilha", async () => {
    modoDadosMock.mockReturnValue("planilha");
    await Integracoes();
    expect(listEventosMock).not.toHaveBeenCalled();
    expect(listMatriculasMock).not.toHaveBeenCalled();
    expect(listProdutosMock).not.toHaveBeenCalled();
    expect(lerAbasMock).not.toHaveBeenCalled();
  });
});
