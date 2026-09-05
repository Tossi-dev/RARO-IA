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

describe("Agenda conectada — contrato visual aprovado", () => {
  it("organiza calendário semanal e preparação do próximo atendimento", async () => {
    contaUatMock.mockResolvedValue(false);
    lerAgendaGoogleMock.mockResolvedValue({
      erro: null,
      eventos: [
        { uid: "cedo", titulo: "Sessão cedo", inicio: new Date("2026-09-07T10:30:00Z"), fim: new Date("2026-09-07T11:30:00Z"), diaInteiro: false, local: "", descricao: "", repetido: false, cancelado: false },
        { uid: "sobreposto", titulo: "Sessão simultânea", inicio: new Date("2026-09-07T10:45:00Z"), fim: new Date("2026-09-07T12:00:00Z"), diaInteiro: false, local: "", descricao: "", repetido: false, cancelado: false },
        { uid: "tarde", titulo: "Sessão após 18h", inicio: new Date("2026-09-08T22:00:00Z"), fim: new Date("2026-09-08T23:30:00Z"), diaInteiro: false, local: "", descricao: "", repetido: false, cancelado: false },
        { uid: "virada", titulo: "Sessão na virada", inicio: new Date("2026-09-09T02:30:00Z"), fim: new Date("2026-09-09T03:30:00Z"), diaInteiro: false, local: "", descricao: "", repetido: false, cancelado: false },
        { uid: "fim-semana", titulo: "Encontro sábado", inicio: new Date("2026-09-12T13:00:00Z"), fim: new Date("2026-09-12T14:00:00Z"), diaInteiro: false, local: "", descricao: "", repetido: false, cancelado: false },
      ],
    });
    const html = renderToStaticMarkup(await AgendaPage({ searchParams: { v: "semana", d: "2026-09-07" } }));

    expect(html).toContain('data-agenda-visual="referencia-aprovada"');
    expect(html).toContain("Agenda de atendimentos");
    expect(html).toContain("Próximo atendimento");
    expect(html).toContain("Preparação rápida");
    expect(html).toContain("Nova sessão");
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('role="grid"');
    expect(html).toContain("Sessão cedo");
    expect(html).toContain("Sessão simultânea");
    expect(html).toContain("Sessão após 18h");
    expect(html).toContain("Sessão na virada");
    expect(html).toContain("Encontro sábado");
    expect(html).toContain("Horários e durações proporcionais");
    expect(html).toContain('data-grade-inicio="7"');
    expect(html).toContain('data-grade-fim="24"');
    expect(html).toContain("height:986px");
    expect(html).toContain("continua no dia seguinte");
    expect(html).not.toContain("Preparar</span>");
    expect(html).not.toContain("Concluída</span>");
    expect(html).toMatch(/width:calc\(50% - 8px\)/);
  });
});
