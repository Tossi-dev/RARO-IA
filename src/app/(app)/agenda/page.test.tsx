import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const { lerAgendaGoogleMock, lerAgendaIcsMock, contaUatMock } = vi.hoisted(() => ({
  lerAgendaGoogleMock: vi.fn(),
  lerAgendaIcsMock: vi.fn(),
  contaUatMock: vi.fn(),
}));

vi.mock("@/lib/uat/isolamento", () => ({ contaUatSinteticaAtual: contaUatMock }));
vi.mock("@/lib/integracoes/google-agenda", () => ({
  googleAppConfigurado: () => true,
  googleConectado: () => true,
  lerAgendaGoogle: lerAgendaGoogleMock,
}));
vi.mock("@/lib/integracoes/calendar", () => ({
  agendaConfigurada: () => true,
  lerAgenda: lerAgendaIcsMock,
}));
vi.mock("@/lib/actions", () => ({ desconectarGoogleAgenda: vi.fn() }));

const { default: AgendaPage } = await import("./page");

beforeEach(() => {
  vi.clearAllMocks();
  contaUatMock.mockResolvedValue(true);
});

describe("Agenda em UAT sintético", () => {
  it("não lê Google Calendar nem iCal externo", async () => {
    await AgendaPage({ searchParams: {} });
    expect(contaUatMock).toHaveBeenCalledOnce();
    expect(lerAgendaGoogleMock).not.toHaveBeenCalled();
    expect(lerAgendaIcsMock).not.toHaveBeenCalled();
  });

  it("não oferece conexão Google ou iCal à conta sintética", async () => {
    const html = renderToStaticMarkup(await AgendaPage({ searchParams: {} }));

    expect(html).toContain("Agenda isolada na homologação");
    expect(html).not.toContain("Conectar com o Google");
    expect(html).not.toContain("Endereço secreto no formato iCal");
  });
});
