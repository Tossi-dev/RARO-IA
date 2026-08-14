// Testes da BORDA de `/mentoria/[id]` — o que `page.tsx` decide antes de
// entregar tudo pronto a `FichaVisao` (o desenho tem suíte própria, em
// `visao.test.tsx`).
//
// O QUE ESTA SUÍTE PROVA
// ----------------------
// 1) UM SÓ INSTANTE. `lerFicha` e `lerHistorico` recebem o MESMO `agoraIso`,
//    porque as duas datam a mesma abertura de tela. Dois `new Date()` fariam
//    a saúde do mentorado e a linha do tempo responderem a relógios
//    diferentes — e a diferença aparece em número: "dias em silêncio" e o
//    corte de "sessão passada" mudam de lado na virada do dia, e ninguém
//    conseguiria reproduzir depois qual dos dois instantes valeu;
// 2) as duas leituras perguntam pelo MESMO id — o da URL;
// 3) o `?erro=` das Server Actions chega à tela para ser mostrado.
//
// MÉTODO: a página é uma função `async` comum que devolve um elemento; o
// teste a chama direto e lê os argumentos que os dois leitores receberam,
// sem renderizar nada. O relógio é substituído por um que ANDA a cada
// leitura: com um `new Date().toISOString()` só, os dois argumentos são
// idênticos; com dois, eles divergem — que é exatamente a diferença que
// precisa ser detectável (em tempo real os dois cairiam no mesmo
// milissegundo quase sempre, e o teste não provaria nada).

import { afterEach, describe, expect, it, vi } from "vitest";
import type { ListaDocumentos } from "@/lib/documentos/dados";
import type { Ficha } from "@/lib/mentoria/dados";
import type { HistoricoDaFicha } from "@/lib/mentoria/dados-historico";

const { lerFichaMock, lerHistoricoMock, lerDocumentosMock } = vi.hoisted(() => ({
  lerFichaMock: vi.fn(),
  lerHistoricoMock: vi.fn(),
  lerDocumentosMock: vi.fn(),
}));

vi.mock("@/lib/mentoria/dados", () => ({ lerFicha: lerFichaMock }));
vi.mock("@/lib/mentoria/dados-historico", () => ({ lerHistorico: lerHistoricoMock }));
vi.mock("@/lib/documentos/dados", () => ({ lerDocumentosDoMentorado: lerDocumentosMock }));

// `visao.tsx` referencia as Server Actions como `action={...}`; o módulo real
// importa `next/cache`/`next/navigation`, que não resolvem fora do Next.
vi.mock("@/lib/mentoria/acoes", () => ({
  agendarSessao: vi.fn(),
  darBaixaNaSessao: vi.fn(),
}));

// Idem para o bloco de documentos que `visao.tsx` monta (Tarefa 12).
vi.mock("@/lib/documentos/acoes", () => ({
  anexarDocumento: vi.fn(),
  arquivarDocumento: vi.fn(),
  alternarVisivelPortal: vi.fn(),
}));

const { default: FichaMentorado } = await import("./page");

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
});

const FICHA = { conectado: true, motivo: "", mentorado: null, matriculas: [], sessoes: [], tarefas: [], marcos: [], scores: [] } as unknown as Ficha;
const HISTORICO = { conectado: true, motivo: "", parcial: false, fatos: [], saude: null } as unknown as HistoricoDaFicha;
const DOCUMENTOS: ListaDocumentos = { conectado: true, motivo: "", documentos: [] };

/** Um relógio que anda a cada leitura, e a conta de quantas vezes foi lido. */
function relogioQueAnda(): { leituras: () => number } {
  let lidas = 0;
  vi.spyOn(Date.prototype, "toISOString").mockImplementation(() => {
    lidas += 1;
    return `2026-08-13T10:00:0${lidas}.000Z`;
  });
  return { leituras: () => lidas };
}

describe("/mentoria/[id] — a borda", () => {
  it("lê o relógio UMA vez e entrega o mesmo instante às duas leituras", async () => {
    lerFichaMock.mockResolvedValue(FICHA);
    lerHistoricoMock.mockResolvedValue(HISTORICO);
    lerDocumentosMock.mockResolvedValue(DOCUMENTOS);
    const relogio = relogioQueAnda();

    await FichaMentorado({ params: { id: "ment-1" }, searchParams: {} });

    expect(relogio.leituras(), "o relógio foi lido mais de uma vez").toBe(1);
    expect(lerFichaMock).toHaveBeenCalledWith("ment-1", "2026-08-13T10:00:01.000Z");
    expect(lerHistoricoMock).toHaveBeenCalledWith("ment-1", "2026-08-13T10:00:01.000Z");
  });

  it("repassa o `?erro=` para a tela, já que é ele que vira o banner", async () => {
    lerFichaMock.mockResolvedValue(FICHA);
    lerHistoricoMock.mockResolvedValue(HISTORICO);
    lerDocumentosMock.mockResolvedValue(DOCUMENTOS);

    const elemento = await FichaMentorado({
      params: { id: "ment-1" },
      searchParams: { erro: "Data da sessão inválida." },
    });

    const props = (elemento as { props: { erro?: string; ficha: Ficha; historico: HistoricoDaFicha } }).props;
    expect(props.erro).toBe("Data da sessão inválida.");
    // E as duas leituras chegam inteiras à tela, sem passar por nenhuma
    // transformação nesta camada.
    expect(props.ficha).toBe(FICHA);
    expect(props.historico).toBe(HISTORICO);
  });

  // Tarefa 12: os arquivos da ficha entram na MESMA leva de leitura, pelo
  // mesmo id da URL. O `agoraIso` não vai junto de propósito — a lista de
  // documentos não é datada contra agora (ver o cabeçalho de
  // `documentos/dados.ts`, regra 3).
  it("lê os documentos do MESMO mentorado e entrega a lista inteira à tela", async () => {
    lerFichaMock.mockResolvedValue(FICHA);
    lerHistoricoMock.mockResolvedValue(HISTORICO);
    lerDocumentosMock.mockResolvedValue(DOCUMENTOS);

    const elemento = await FichaMentorado({ params: { id: "ment-1" }, searchParams: {} });

    expect(lerDocumentosMock).toHaveBeenCalledWith("ment-1");
    const props = (elemento as { props: { documentos: ListaDocumentos } }).props;
    expect(props.documentos).toBe(DOCUMENTOS);
  });
});
