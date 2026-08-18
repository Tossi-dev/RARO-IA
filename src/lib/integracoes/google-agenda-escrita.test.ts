// Testes de `google-agenda-escrita.ts` — a ESCRITA na agenda do Google
// (criar/atualizar/cancelar), companheiro de escrita do `google-agenda.ts`
// (leitura). Dois dublês, mesmo padrão da casa:
//
//   - `next/headers` (`vi.mock`, mesmo formato de `simulacao.test.ts`): o
//     cookie httpOnly não existe em teste, e o jar é um objeto de mentira.
//   - `fetch` global (`vi.stubGlobal`): NENHUMA chamada de rede de verdade.
//
// As asserções que mais importam aqui não são "devolveu ok:false" — qualquer
// implementação incompleta acerta isso por acaso. São:
//   1. sem cookie, a função não faz fetch NENHUM (nem para o endpoint de
//      refresh de token, nem para a API de eventos) — não é só "falhou",
//      é "não tentou".
//   2. o motivo do erro nunca contém o token de acesso nem o refresh token
//      — nem quando o Google devolve 401.
//   3. `cancelarEventoDaSessao` sem id é sucesso (nada a fazer), e ainda
//      assim não telefona pro Google.
//   4. o cabeçalho de `google-agenda.ts` não mente mais sobre "não
//      consegue criar" — teste de TEXTO, não de comportamento, porque é
//      exatamente o tipo de coisa que passa despercebida em code review.
//   5. (rodada 2, laudo do revisor independente) NENHUMA das três funções
//      lança — nem se a rede cair no refresh do token, nem se o JSON vier
//      torto, nem se `cookies()` explodir. E as três causas de "não deu"
//      (sem cookie / app sem credencial / conexão expirada) têm mensagens
//      DIFERENTES, porque cada uma tem uma correção diferente e por
//      pessoas diferentes.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const TOKEN_DE_ACESSO = "ya29.SEGREDO-DE-ACESSO-NUNCA-PODE-APARECER";
const REFRESH_TOKEN = "1//SEGREDO-DE-REFRESH-NUNCA-PODE-APARECER";

const mockCookies = vi.fn();
vi.mock("next/headers", () => ({ cookies: () => mockCookies() }));

/** Dublê do jar de cookies do Next: com ou sem o cookie de conexão do Google. */
function comCookieConectado(refresh: string | undefined) {
  mockCookies.mockReturnValue({
    get: (nome: string) =>
      nome === "raro_google_agenda" && refresh !== undefined ? { value: refresh } : undefined,
  });
}

const {
  criarEventoDaSessao,
  atualizarEventoDaSessao,
  cancelarEventoDaSessao,
  CHAVE_ORIGEM_EVENTO,
  VALOR_ORIGEM_EVENTO,
} = await import("./google-agenda-escrita");
type EventoParaGoogle = import("./google-agenda-escrita").EventoParaGoogle;

const EVENTO_EXEMPLO = {
  titulo: "Maria — sessão 3 — 20/08 23:00",
  descricao: "Sessão de mentoria individual (sessão 3)",
  inicioIso: "2026-08-20T23:00:00.000Z",
  fimIso: "2026-08-21T00:00:00.000Z",
  convidados: ["maria@exemplo.com"],
};

/**
 * fetch de mentira: registra toda chamada e responde de acordo com a URL.
 *
 * `refreshRede`/`escritaRede`: o `fetch` REJEITA (rede caiu/DNS/timeout) em
 * vez de resolver com uma `Response` — é o caso que o laudo do revisor
 * mediu como `TypeError: fetch failed` vazando para fora do módulo.
 * `refreshJsonInvalido`/`escritaJsonInvalido`: a resposta chega com HTTP 200
 * mas o corpo não é JSON — `Response#json()` lança nesse caso, e é outro
 * jeito de a mesma promessa ("nunca lança") quebrar.
 * `idCriado: null`: a API aceita a criação (200) mas o corpo não traz `id`
 * nenhum — é o caso do MÉDIO 4 do laudo.
 */
function ligarFetch(opts: {
  statusRefresh?: number;
  statusEscrita?: number;
  idCriado?: string | null;
  refreshRede?: boolean;
  refreshJsonInvalido?: boolean;
  escritaRede?: boolean;
  escritaJsonInvalido?: boolean;
  /** Status do GET de conferência da marca de origem (404 = evento sumiu). */
  statusLeituraEvento?: number;
  /** Marca de origem do evento LIDO. `null` = evento sem marca (alheio). */
  marcaDoEventoLido?: string | null;
  /** O corpo do GET de conferência nem sequer é JSON. */
  leituraJsonInvalida?: boolean;
} = {}) {
  const chamadas: Array<{ url: string; init?: RequestInit }> = [];
  const statusRefresh = opts.statusRefresh ?? 200;
  const statusEscrita = opts.statusEscrita ?? 200;
  const statusLeituraEvento = opts.statusLeituraEvento ?? 200;

  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    chamadas.push({ url: String(url), init });

    if (String(url).includes("oauth2.googleapis.com/token")) {
      if (opts.refreshRede) throw new TypeError("fetch failed");
      if (opts.refreshJsonInvalido) return new Response("<html>não é json</html>", { status: 200 });
      if (statusRefresh !== 200) {
        return new Response(JSON.stringify({ error: "invalid_grant" }), { status: statusRefresh });
      }
      return new Response(JSON.stringify({ access_token: TOKEN_DE_ACESSO, expires_in: 3600 }), {
        status: 200,
      });
    }

    // GET de conferência da marca de origem (antes de todo PATCH). Separado
    // da escrita de propósito: o teste precisa poder mandar o GET dar certo e
    // o PATCH falhar (e vice-versa) para provar QUAL das duas chamadas
    // aconteceu.
    if (String(init?.method ?? "GET") === "GET") {
      if (opts.leituraJsonInvalida) return new Response("<html>não é json</html>", { status: 200 });
      if (statusLeituraEvento !== 200) {
        return new Response(JSON.stringify({ error: { message: "não achou" } }), {
          status: statusLeituraEvento,
        });
      }
      const privado =
        opts.marcaDoEventoLido === null
          ? { outra_coisa: "1" }
          : { [CHAVE_ORIGEM_EVENTO]: opts.marcaDoEventoLido ?? VALOR_ORIGEM_EVENTO };
      return new Response(
        JSON.stringify({ id: "evt-existente", extendedProperties: { private: privado } }),
        { status: 200 }
      );
    }

    // API de eventos (criar/atualizar/cancelar)
    if (opts.escritaRede) throw new TypeError("fetch failed");
    if (opts.escritaJsonInvalido) return new Response("<html>não é json</html>", { status: 200 });
    if (statusEscrita !== 200) {
      return new Response(JSON.stringify({ error: { message: "recusado" } }), {
        status: statusEscrita,
      });
    }
    const corpo = opts.idCriado === null ? {} : { id: opts.idCriado ?? "evt-novo-123" };
    return new Response(JSON.stringify(corpo), { status: 200 });
  });

  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, chamadas };
}

/** As chamadas de PATCH que de fato saíram — o espião que prova que uma
 *  recusa foi recusa mesmo, e não "recusou depois de já ter escrito". */
function patches(chamadas: Array<{ url: string; init?: RequestInit }>) {
  return chamadas.filter((c) => c.init?.method === "PATCH");
}

// `googleAppConfigurado()` (dentro de `accessTokenDoCookie`) exige as duas
// variáveis de ambiente — sem elas o token nunca é buscado, mesmo com
// cookie válido, e todo teste "com cookie" cairia no mesmo motivo de "sem
// conexão" do teste "sem cookie". `vi.stubEnv` isola isso por teste.
beforeEach(() => {
  vi.stubEnv("GOOGLE_CLIENT_ID", "id-de-teste");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "segredo-de-teste-do-app");
});

afterEach(() => {
  mockCookies.mockReset();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("sem cookie de conexão", () => {
  it("criarEventoDaSessao devolve ok:false com motivo humano e não faz fetch nenhum", async () => {
    comCookieConectado(undefined);
    const { fetchMock } = ligarFetch();

    const r = await criarEventoDaSessao(EVENTO_EXEMPLO);

    expect(r.ok).toBe(false);
    expect(r.erro).toBeTruthy();
    expect(typeof r.erro).toBe("string");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("atualizarEventoDaSessao devolve ok:false com motivo humano e não faz fetch nenhum", async () => {
    comCookieConectado(undefined);
    const { fetchMock } = ligarFetch();

    const r = await atualizarEventoDaSessao("evt-existente", EVENTO_EXEMPLO);

    expect(r.ok).toBe(false);
    expect(r.erro).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("cancelarEventoDaSessao (com id) devolve ok:false com motivo humano e não faz fetch nenhum", async () => {
    comCookieConectado(undefined);
    const { fetchMock } = ligarFetch();

    const r = await cancelarEventoDaSessao("evt-existente");

    expect(r.ok).toBe(false);
    expect(r.erro).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("resposta 401 do Google", () => {
  it("criarEventoDaSessao devolve ok:false e o motivo NÃO contém o token de acesso nem o refresh token", async () => {
    comCookieConectado(REFRESH_TOKEN);
    ligarFetch({ statusEscrita: 401 });

    const r = await criarEventoDaSessao(EVENTO_EXEMPLO);

    expect(r.ok).toBe(false);
    expect(r.erro).toBeTruthy();
    expect(r.erro).not.toContain(TOKEN_DE_ACESSO);
    expect(r.erro).not.toContain(REFRESH_TOKEN);
  });

  it("atualizarEventoDaSessao com 403 (conta conectada antes do novo escopo) devolve motivo específico de reconexão", async () => {
    comCookieConectado(REFRESH_TOKEN);
    ligarFetch({ statusEscrita: 403 });

    const r = await atualizarEventoDaSessao("evt-existente", EVENTO_EXEMPLO);

    expect(r.ok).toBe(false);
    // Asserção específica o bastante para matar o mutante que troca a
    // mensagem por um "erro genérico (HTTP 403)": precisa nomear a causa
    // (permissão pedida depois da conexão) E a ação (entrar de novo).
    expect(r.erro).toMatch(/conectada antes de.*permiss/i);
    expect(r.erro).toMatch(/entre de novo/i);
    expect(r.erro).not.toContain(TOKEN_DE_ACESSO);
    expect(r.erro).not.toContain(REFRESH_TOKEN);
  });
});

describe("cancelarEventoDaSessao sem evento_google_id", () => {
  it("devolve ok:true (nada a fazer não é erro) e não chama a API", async () => {
    comCookieConectado(REFRESH_TOKEN);
    const { fetchMock } = ligarFetch();

    const r1 = await cancelarEventoDaSessao(undefined);
    const r2 = await cancelarEventoDaSessao(null);
    const r3 = await cancelarEventoDaSessao("");
    const r4 = await cancelarEventoDaSessao("   ");

    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    expect(r3.ok).toBe(true);
    expect(r4.ok).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// BAIXO 5 do laudo: o caminho de "id vazio" do UPDATE não tinha teste
// nenhum — só um comentário de seis linhas. Diferente do cancelar (onde "id
// vazio" é sucesso, nada a fazer), atualizar com id vazio é USO ERRADO da
// função (a sessão nunca foi criada no Google) e por isso é ERRO, não
// sucesso silencioso.
describe("atualizarEventoDaSessao com id vazio", () => {
  it("devolve ok:false com motivo humano e não chama a API", async () => {
    comCookieConectado(REFRESH_TOKEN);
    const { fetchMock } = ligarFetch();

    const r1 = await atualizarEventoDaSessao("", EVENTO_EXEMPLO);
    const r2 = await atualizarEventoDaSessao("   ", EVENTO_EXEMPLO);

    expect(r1.ok).toBe(false);
    expect(r1.erro).toBeTruthy();
    expect(r2.ok).toBe(false);
    expect(r2.erro).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// MÉDIO 4 do laudo: 200 sem `id` no corpo não pode virar sucesso com
// `eventoGoogleId: undefined` — quem chama persistiria `undefined`, e o
// cancelamento futuro (`cancelarEventoDaSessao(undefined)`) cairia no
// caminho "nada a fazer", deixando o evento órfão na agenda do convidado
// para sempre, sem erro em lugar nenhum.
describe("criarEventoDaSessao — resposta 200 sem id no corpo", () => {
  it("devolve ok:false com motivo humano, nunca eventoGoogleId undefined disfarçado de sucesso", async () => {
    comCookieConectado(REFRESH_TOKEN);
    ligarFetch({ idCriado: null });

    const r = await criarEventoDaSessao(EVENTO_EXEMPLO);

    expect(r.ok).toBe(false);
    expect(r.erro).toBeTruthy();
    expect(r.eventoGoogleId).toBeUndefined();
  });
});

// ALTO 1 do laudo: as três funções não podem lançar em NENHUMA
// circunstância — nem se a chamada de refresh do token cair de rede, nem
// se o corpo dela vier corrompido, nem se `cookies()` explodir (bailout do
// Next, ambiente sem contexto de requisição, etc.).
describe("nunca lança — falhas de rede/JSON no refresh do token e em cookies()", () => {
  const casos: Array<{
    nome: string;
    preparar: () => void;
  }> = [
    {
      nome: "refresh do token responde HTTP de erro",
      preparar: () => {
        comCookieConectado(REFRESH_TOKEN);
        ligarFetch({ statusRefresh: 400 });
      },
    },
    {
      nome: "refresh do token: fetch rejeita (rede caiu)",
      preparar: () => {
        comCookieConectado(REFRESH_TOKEN);
        ligarFetch({ refreshRede: true });
      },
    },
    {
      nome: "refresh do token: HTTP 200 com corpo que não é JSON",
      preparar: () => {
        comCookieConectado(REFRESH_TOKEN);
        ligarFetch({ refreshJsonInvalido: true });
      },
    },
    {
      nome: "cookies() lança (fora de contexto de requisição)",
      preparar: () => {
        ligarFetch();
        mockCookies.mockImplementation(() => {
          throw new Error("cookies() fora de contexto de requisição");
        });
      },
    },
    {
      nome: "escrita: fetch rejeita (rede caiu) depois do refresh dar certo",
      preparar: () => {
        comCookieConectado(REFRESH_TOKEN);
        ligarFetch({ escritaRede: true });
      },
    },
    {
      nome: "escrita: HTTP 200 com corpo que não é JSON",
      preparar: () => {
        comCookieConectado(REFRESH_TOKEN);
        ligarFetch({ escritaJsonInvalido: true });
      },
    },
  ];

  for (const caso of casos) {
    it(`criarEventoDaSessao — ${caso.nome} — não lança, devolve ok:false`, async () => {
      caso.preparar();
      const r = await criarEventoDaSessao(EVENTO_EXEMPLO);
      expect(r.ok).toBe(false);
      expect(r.erro).toBeTruthy();
    });

    it(`atualizarEventoDaSessao — ${caso.nome} — não lança, devolve ok:false`, async () => {
      caso.preparar();
      const r = await atualizarEventoDaSessao("evt-existente", EVENTO_EXEMPLO);
      expect(r.ok).toBe(false);
      expect(r.erro).toBeTruthy();
    });

    it(`cancelarEventoDaSessao — ${caso.nome} — não lança, devolve ok:false`, async () => {
      caso.preparar();
      const r = await cancelarEventoDaSessao("evt-existente");
      expect(r.ok).toBe(false);
      expect(r.erro).toBeTruthy();
    });
  }
});

// BAIXO 6 do laudo: "sem token" tinha UMA mensagem só, mas tem DUAS causas
// bem diferentes — falta configurar o app (problema de quem publica) e
// conta não conectada/token revogado (problema de quem usa, resolve
// clicando em "Entrar"). Confundir as duas manda a pessoa errada tentar
// consertar o problema errado.
describe("motivo do erro — três causas diferentes, três mensagens diferentes", () => {
  it("sem cookie: menciona conectar a conta, NUNCA menciona credencial de app", async () => {
    comCookieConectado(undefined);
    ligarFetch();

    const r = await criarEventoDaSessao(EVENTO_EXEMPLO);

    expect(r.erro).toMatch(/conta.*google/i);
    expect(r.erro).not.toMatch(/GOOGLE_CLIENT|credencia/i);
  });

  it("cookie presente mas app sem credenciais configuradas: menciona a credencial, não manda 'entrar' de novo", async () => {
    comCookieConectado(REFRESH_TOKEN);
    vi.stubEnv("GOOGLE_CLIENT_ID", "");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "");
    const { fetchMock } = ligarFetch();

    const r = await criarEventoDaSessao(EVENTO_EXEMPLO);

    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/GOOGLE_CLIENT|credencia|configurad/i);
    // Sem credencial, `accessTokenDoCookie` nem tenta o refresh — mesma
    // disciplina de "não faz fetch nenhum" quando não há como ter sucesso.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("cookie presente, app configurado, mas o Google recusa o refresh: pede para reconectar (conexão expirada)", async () => {
    comCookieConectado(REFRESH_TOKEN);
    ligarFetch({ statusRefresh: 400 });

    const r = await criarEventoDaSessao(EVENTO_EXEMPLO);

    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/expirou|revogad|entre de novo/i);
  });
});

describe("caminho de sucesso", () => {
  it("criarEventoDaSessao chama a API com o corpo e o fuso certos, e devolve o id criado", async () => {
    comCookieConectado(REFRESH_TOKEN);
    const { chamadas } = ligarFetch({ idCriado: "evt-abc" });

    const r = await criarEventoDaSessao(EVENTO_EXEMPLO);

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.eventoGoogleId).toBe("evt-abc");

    const chamadaEscrita = chamadas.find((c) => c.url.includes("/calendar/v3/calendars/"));
    expect(chamadaEscrita).toBeTruthy();
    expect(chamadaEscrita!.init?.method).toBe("POST");

    const corpo = JSON.parse(String(chamadaEscrita!.init?.body)) as Record<string, unknown>;
    expect(corpo.summary).toBe(EVENTO_EXEMPLO.titulo);
    expect(corpo.description).toBe(EVENTO_EXEMPLO.descricao);
    // D-fuso: `dateTime` chega em UTC (a saída de `eventoDaSessao`); o Google
    // exige `timeZone` junto, senão interpreta no fuso padrão do calendário
    // (que pode não ser São Paulo). Os dois precisam viajar juntos.
    expect((corpo.start as Record<string, string>).dateTime).toBe(EVENTO_EXEMPLO.inicioIso);
    expect((corpo.start as Record<string, string>).timeZone).toBe("America/Sao_Paulo");
    expect((corpo.end as Record<string, string>).dateTime).toBe(EVENTO_EXEMPLO.fimIso);
    expect((corpo.end as Record<string, string>).timeZone).toBe("America/Sao_Paulo");
    expect(corpo.attendees).toEqual([{ email: "maria@exemplo.com" }]);

    // O Authorization vai no cabeçalho — nunca na query string (o incidente
    // que este projeto já teve).
    const headers = chamadaEscrita!.init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${TOKEN_DE_ACESSO}`);
    expect(chamadaEscrita!.url).not.toContain(TOKEN_DE_ACESSO);
  });

  it("cancelarEventoDaSessao com id manda status:cancelled, não DELETE", async () => {
    comCookieConectado(REFRESH_TOKEN);
    const { chamadas } = ligarFetch();

    const r = await cancelarEventoDaSessao("evt-existente");

    expect(r.ok).toBe(true);
    // A ESCRITA, não a conferência: desde a rodada 3 o cancelamento também
    // faz um GET no mesmo id antes de escrever (marca de origem), e esse GET
    // não tem corpo nenhum para inspecionar.
    const chamadaEscrita = chamadas.find(
      (c) => c.url.includes("evt-existente") && c.init?.method === "PATCH"
    );
    expect(chamadaEscrita).toBeTruthy();
    // DECISÃO: não é DELETE. Um DELETE some da agenda de quem foi convidado
    // sem avisar ninguém; `status: cancelled` deixa o evento visível como
    // cancelado. Ver mesmo comentário em `google-agenda-escrita.ts`.
    expect(chamadaEscrita!.init?.method).not.toBe("DELETE");
    const corpo = JSON.parse(String(chamadaEscrita!.init?.body)) as Record<string, unknown>;
    expect(corpo.status).toBe("cancelled");
  });
});

// MÉDIO 4 (rodada 3): a política de privacidade promete, por escrito e em
// página pública, que "nenhum outro evento da agenda é tocado". Antes desta
// rodada isso era só uma frase: `atualizar`/`cancelar` faziam PATCH em
// qualquer id recebido, sem marca e sem conferência — um `evento_google_id`
// errado ou obsoleto no banco sobrescrevia título, horário e convidados de um
// compromisso PESSOAL do mentor. Estes testes são o que transforma a frase em
// invariante: com marca escreve, sem marca recusa SEM escrever, e o 404 tem
// desfecho diferente em cancelar (nada a fazer) e em atualizar (sumiu).
describe("marca de origem — só escreve em evento criado por este sistema", () => {
  it("criarEventoDaSessao grava a marca em extendedProperties.private", async () => {
    comCookieConectado(REFRESH_TOKEN);
    const { chamadas } = ligarFetch({ idCriado: "evt-abc" });

    const r = await criarEventoDaSessao(EVENTO_EXEMPLO);

    expect(r.ok).toBe(true);
    // Filtra pela URL também: o refresh do token é POST igualmente, e pegar
    // o corpo dele aqui seria ler `client_id=...` achando que é o evento.
    const post = chamadas.find(
      (c) => c.init?.method === "POST" && c.url.includes("/calendar/v3/")
    );
    const corpo = JSON.parse(String(post!.init?.body)) as {
      extendedProperties?: { private?: Record<string, string> };
    };
    // Sem esta marca, nenhuma atualização/cancelamento futuro é possível: a
    // conferência abaixo recusaria o próprio evento do sistema.
    expect(corpo.extendedProperties?.private?.[CHAVE_ORIGEM_EVENTO]).toBe(VALOR_ORIGEM_EVENTO);
  });

  it("atualizarEventoDaSessao confere ANTES: com a marca, lê e depois escreve", async () => {
    comCookieConectado(REFRESH_TOKEN);
    const { chamadas } = ligarFetch();

    const r = await atualizarEventoDaSessao("evt-existente", EVENTO_EXEMPLO);

    expect(r.ok).toBe(true);
    const leituras = chamadas.filter(
      (c) => c.url.includes("/calendar/v3/") && String(c.init?.method ?? "GET") === "GET"
    );
    expect(leituras).toHaveLength(1);
    expect(leituras[0].url).toContain("evt-existente");
    expect(patches(chamadas)).toHaveLength(1);
  });

  it("atualizarEventoDaSessao recusa evento SEM a marca e não faz o PATCH", async () => {
    comCookieConectado(REFRESH_TOKEN);
    const { chamadas } = ligarFetch({ marcaDoEventoLido: null });

    const r = await atualizarEventoDaSessao("evt-do-mentor", EVENTO_EXEMPLO);

    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/não foi criado por|não é meu|não vou sobrescrever/i);
    // O espião que importa: recusar depois de já ter sobrescrito o
    // compromisso pessoal de alguém não seria recusa nenhuma.
    expect(patches(chamadas)).toHaveLength(0);
  });

  it("cancelarEventoDaSessao recusa evento SEM a marca e não faz o PATCH", async () => {
    comCookieConectado(REFRESH_TOKEN);
    const { chamadas } = ligarFetch({ marcaDoEventoLido: null });

    const r = await cancelarEventoDaSessao("evt-do-mentor");

    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/não foi criado por|não é meu|não vou sobrescrever/i);
    expect(patches(chamadas)).toHaveLength(0);
  });

  it("marca com valor diferente (outro sistema) também é recusada", async () => {
    comCookieConectado(REFRESH_TOKEN);
    const { chamadas } = ligarFetch({ marcaDoEventoLido: "outro-sistema-qualquer" });

    const r = await atualizarEventoDaSessao("evt-existente", EVENTO_EXEMPLO);

    expect(r.ok).toBe(false);
    expect(patches(chamadas)).toHaveLength(0);
  });

  it("cancelarEventoDaSessao com evento já inexistente (404) é ok:true — nada a fazer não é erro", async () => {
    comCookieConectado(REFRESH_TOKEN);
    const { chamadas } = ligarFetch({ statusLeituraEvento: 404 });

    const r = await cancelarEventoDaSessao("evt-que-sumiu");

    expect(r.ok).toBe(true);
    expect(r.erro).toBeUndefined();
    expect(patches(chamadas)).toHaveLength(0);
  });

  it("atualizarEventoDaSessao com evento sumido (404) é ok:false pedindo nova sincronização", async () => {
    comCookieConectado(REFRESH_TOKEN);
    const { chamadas } = ligarFetch({ statusLeituraEvento: 404 });

    const r = await atualizarEventoDaSessao("evt-que-sumiu", EVENTO_EXEMPLO);

    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/não existe mais|sumiu|não está mais/i);
    expect(r.erro).toMatch(/sincroniz/i);
    // Recriar o evento por conta própria seria inventar decisão: quem chama
    // é que sabe se a sessão ainda vale. Aqui só não se escreve.
    expect(patches(chamadas)).toHaveLength(0);
  });

  it("conferência recusada com 403 (escopo antigo) devolve o motivo de reconexão, sem PATCH", async () => {
    comCookieConectado(REFRESH_TOKEN);
    const { chamadas } = ligarFetch({ statusLeituraEvento: 403 });

    const r = await cancelarEventoDaSessao("evt-existente");

    expect(r.ok).toBe(false);
    expect(r.erro).toMatch(/conectada antes de.*permiss/i);
    expect(patches(chamadas)).toHaveLength(0);
  });

  it("conferência com corpo que não é JSON não lança — devolve ok:false e não escreve", async () => {
    comCookieConectado(REFRESH_TOKEN);
    const { chamadas } = ligarFetch({ leituraJsonInvalida: true });

    const r = await atualizarEventoDaSessao("evt-existente", EVENTO_EXEMPLO);

    expect(r.ok).toBe(false);
    expect(r.erro).toBeTruthy();
    expect(patches(chamadas)).toHaveLength(0);
  });
});

// MÉDIO 3 (rodada 3): o cabeçalho do módulo promete que "o texto da exceção
// original nunca é exposto", mas nada testava isso — trocar `catch {}` por
// `catch (e) { ...[${String(e)}] }` deixava a suíte inteira verde. O risco é
// concreto: uma `TypeError` de fetch pode carregar cabeçalho ou corpo da
// requisição na mensagem, e é exatamente ali que moram `Authorization: Bearer
// ya29...`, `refresh_token=...` e `client_secret=...`.
describe("exceção com segredo na mensagem — o segredo nunca chega ao texto do erro", () => {
  const CLIENT_SECRET = "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ARECER";
  const VENENO = `fetch failed — request: Authorization: Bearer ${TOKEN_DE_ACESSO} | body: refresh_token=${REFRESH_TOKEN}&client_secret=${CLIENT_SECRET}`;

  /** Um fetch que explode com o pior texto possível na mensagem. */
  function ligarFetchVenenoso() {
    const fetchMock = vi.fn(async () => {
      throw new TypeError(VENENO);
    });
    vi.stubGlobal("fetch", fetchMock);
  }

  function conferir(erro: string | undefined) {
    expect(erro).toBeTruthy();
    expect(erro).not.toContain(TOKEN_DE_ACESSO);
    expect(erro).not.toContain(REFRESH_TOKEN);
    expect(erro).not.toContain(CLIENT_SECRET);
    // Rede de segurança contra vazamento por outro caminho que não os três
    // literais acima (um `String(e)` inteiro traria isto junto).
    expect(erro).not.toMatch(/Bearer|refresh_token|client_secret|ya29\.|GOCSPX/i);
  }

  it("criarEventoDaSessao não ecoa o texto da exceção", async () => {
    comCookieConectado(REFRESH_TOKEN);
    ligarFetchVenenoso();
    conferir((await criarEventoDaSessao(EVENTO_EXEMPLO)).erro);
  });

  it("atualizarEventoDaSessao não ecoa o texto da exceção", async () => {
    comCookieConectado(REFRESH_TOKEN);
    ligarFetchVenenoso();
    conferir((await atualizarEventoDaSessao("evt-existente", EVENTO_EXEMPLO)).erro);
  });

  it("cancelarEventoDaSessao não ecoa o texto da exceção", async () => {
    comCookieConectado(REFRESH_TOKEN);
    ligarFetchVenenoso();
    conferir((await cancelarEventoDaSessao("evt-existente")).erro);
  });

  it("nem quando quem explode é o cookies() (a mensagem também passa pelo mesmo catch)", async () => {
    ligarFetchVenenoso();
    mockCookies.mockImplementation(() => {
      throw new Error(VENENO);
    });
    conferir((await criarEventoDaSessao(EVENTO_EXEMPLO)).erro);
  });
});

// OBSERVAÇÃO 7 (rodada 3): `src/lib/data/simulacao.ts` já resolveu isto na
// casa — o `catch` de `cookies()` RELANÇA quando o `digest` começa com
// `DYNAMIC_SERVER_USAGE`, porque esse erro não é falha: é o Next avisando que
// a página precisa sair do cache e renderizar dinamicamente. Engolir esse
// erro faria a página ser cacheada com o resultado errado, em silêncio.
describe("bailout dinâmico do Next — relançado, não engolido", () => {
  function cookiesComBailout() {
    mockCookies.mockImplementation(() => {
      const erro = new Error("Dynamic server usage: cookies");
      (erro as Error & { digest?: string }).digest =
        "DYNAMIC_SERVER_USAGE:cookies";
      throw erro;
    });
  }

  it("criarEventoDaSessao relança o DynamicServerError", async () => {
    cookiesComBailout();
    ligarFetch();
    await expect(criarEventoDaSessao(EVENTO_EXEMPLO)).rejects.toThrow(/Dynamic server usage/i);
  });

  it("atualizarEventoDaSessao relança o DynamicServerError", async () => {
    cookiesComBailout();
    ligarFetch();
    await expect(atualizarEventoDaSessao("evt-existente", EVENTO_EXEMPLO)).rejects.toThrow(
      /Dynamic server usage/i
    );
  });

  it("cancelarEventoDaSessao relança o DynamicServerError", async () => {
    cookiesComBailout();
    ligarFetch();
    await expect(cancelarEventoDaSessao("evt-existente")).rejects.toThrow(/Dynamic server usage/i);
  });

  it("qualquer OUTRA exceção continua virando ok:false (só o bailout sobe)", async () => {
    mockCookies.mockImplementation(() => {
      throw new Error("cookies() fora de contexto de requisição");
    });
    ligarFetch();
    const r = await criarEventoDaSessao(EVENTO_EXEMPLO);
    expect(r.ok).toBe(false);
    expect(r.erro).toBeTruthy();
  });
});

// BAIXO 5 (rodada 3): `EventoParaGoogle` é uma cópia estrutural do formato de
// `eventoDaSessao`, e quem monta esse objeto a partir de uma linha do banco
// costuma usar `as` — um `convidados` ausente passa pelo compilador e explode
// em `evento.convidados.length`. Montar o corpo FORA do `try` transformava
// isso em exceção crua, quebrando a promessa de `{ok, erro}` sempre.
describe("evento malformado (convidados ausente, típico de linha de banco com `as`)", () => {
  const SEM_CONVIDADOS = {
    titulo: "Maria — sessão 3",
    descricao: "Sessão de mentoria individual",
    inicioIso: "2026-08-20T23:00:00.000Z",
    fimIso: "2026-08-21T00:00:00.000Z",
  } as EventoParaGoogle;

  it("criarEventoDaSessao não lança — devolve ok:false com motivo humano", async () => {
    comCookieConectado(REFRESH_TOKEN);
    ligarFetch();
    const r = await criarEventoDaSessao(SEM_CONVIDADOS);
    expect(r.ok).toBe(false);
    expect(r.erro).toBeTruthy();
  });

  it("atualizarEventoDaSessao não lança — devolve ok:false com motivo humano", async () => {
    comCookieConectado(REFRESH_TOKEN);
    ligarFetch();
    const r = await atualizarEventoDaSessao("evt-existente", SEM_CONVIDADOS);
    expect(r.ok).toBe(false);
    expect(r.erro).toBeTruthy();
  });
});

describe("google-agenda.ts não mente mais sobre a permissão", () => {
  it("o cabeçalho não contém mais a frase 'não consegue criar'", () => {
    const caminho = path.join(__dirname, "google-agenda.ts");
    const texto = readFileSync(caminho, "utf-8");
    expect(texto).not.toContain("não consegue criar");
  });
});
