// Teste do middleware com `NextRequest` de verdade — a garantia de que a
// ligação entre `decidirAcesso` (puro, já testado em portao.test.ts) e o
// mundo real de cookie/redirect do Next não quebrou no meio do caminho.
//
// As variáveis de ambiente aqui simulam `ambienteAtual()`: o middleware lê
// `process.env` direto (não dá para injetar no Edge Runtime de produção),
// então cada teste planta o cenário e desfaz no `afterEach`.

import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { COOKIE_ACESSO, selo } from "@/lib/acesso";

// Dublê de `@supabase/ssr` — ALTO 1 do relatório do revisor: o ramo
// `modo === "supabase"` do middleware não tinha NENHUM teste (um `throw` na
// primeira linha do ramo deixava a suíte inteira verde). `vi.hoisted` porque
// `vi.mock` é iça do para o topo do arquivo pelo transform do Vitest, antes
// de qualquer `const` comum — sem isto, as funções abaixo cairiam em TDZ
// quando a fábrica do mock fosse executada. Mesmo estilo de
// `src/lib/data/sheets-db.test.ts` (o único outro `vi.mock` do repositório),
// adaptado para import estático porque aqui não há efeito colateral de
// módulo na hora do import que exija import dinâmico.
const { getUserMock, maybeSingleMock, papelDeSpy } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  maybeSingleMock: vi.fn(),
  // Espião de `papelDe` — existe só para provar que o middleware chama
  // `papelDe(perfil?.papel)` e não usa o valor cru da consulta (mutante M3:
  // `perfil?.papel as Papel` no lugar da normalização). Não troca o
  // comportamento de `papelDe`: chama a implementação real por baixo.
  papelDeSpy: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: (
    _url: string,
    _key: string,
    opts: {
      cookies: {
        get: (name: string) => string | undefined;
        set: (name: string, value: string, options: Record<string, unknown>) => void;
        remove: (name: string, options: Record<string, unknown>) => void;
      };
    }
  ) => ({
    auth: {
      // Passa `opts` para o dublê poder chamar `opts.cookies.set(...)` de
      // dentro do teste, simulando o Supabase renovando o refresh token
      // DURANTE `getUser()` — é o cenário do ALTO 2 (cookie renovado some no
      // redirecionamento).
      getUser: () => getUserMock(opts),
    },
    from: (_tabela: string) => ({
      select: (_colunas: string) => ({
        eq: (_coluna: string, _valor: string) => ({
          maybeSingle: () => maybeSingleMock(),
        }),
      }),
    }),
  }),
}));

vi.mock("@/lib/papeis", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/papeis")>();
  return {
    ...real,
    papelDe: (valor: unknown) => {
      papelDeSpy(valor);
      return real.papelDe(valor);
    },
  };
});

const { config: configDoMiddleware, middleware } = await import("./middleware");

const VARS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "RARO_SENHA",
  "RARO_ACESSO_ABERTO",
  "RARO_SHEETS_ID",
  "RARO_MODO",
] as const;

function limparAmbiente() {
  for (const v of VARS) delete process.env[v];
}

afterEach(() => {
  limparAmbiente();
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});

function req(pathname: string, cookie?: string) {
  const r = new NextRequest(new URL(pathname, "http://localhost:3000"));
  if (cookie) r.cookies.set(COOKIE_ACESSO, cookie);
  return r;
}

describe("middleware — portão de acesso", () => {
  it("rota livre passa em qualquer modo (aqui: trancado)", async () => {
    limparAmbiente();
    process.env.RARO_SHEETS_ID = "planilha-real";
    const res = await middleware(req("/acesso"));
    expect(res.headers.get("location")).toBeNull();
  });

  it("modo trancado (dado real, nenhuma proteção) manda para /acesso", async () => {
    limparAmbiente();
    process.env.RARO_SHEETS_ID = "planilha-real";
    const res = await middleware(req("/painel"));
    expect(res.headers.get("location")).toBe("http://localhost:3000/acesso");
  });

  it("modo senha sem cookie manda para /acesso?de=<rota-pedida>", async () => {
    limparAmbiente();
    process.env.RARO_SHEETS_ID = "planilha-real";
    process.env.RARO_SENHA = "raro-2026-segredo-longo";
    const res = await middleware(req("/financeiro/caixa"));
    expect(res.headers.get("location")).toBe(
      "http://localhost:3000/acesso?de=%2Ffinanceiro%2Fcaixa"
    );
  });

  it("modo senha com cookie certo passa", async () => {
    limparAmbiente();
    process.env.RARO_SHEETS_ID = "planilha-real";
    process.env.RARO_SENHA = "raro-2026-segredo-longo";
    const cookieBom = await selo("raro-2026-segredo-longo");
    const res = await middleware(req("/painel", cookieBom));
    expect(res.headers.get("location")).toBeNull();
  });

  it("cookie de outra senha não passa", async () => {
    limparAmbiente();
    process.env.RARO_SHEETS_ID = "planilha-real";
    process.env.RARO_SENHA = "raro-2026-segredo-longo";
    const cookieErrado = await selo("uma-senha-completamente-diferente");
    const res = await middleware(req("/painel", cookieErrado));
    expect(res.headers.get("location")).toBe("http://localhost:3000/acesso?de=%2Fpainel");
  });

  it("modo aberto (sem dado real configurado) passa direto", async () => {
    limparAmbiente();
    const res = await middleware(req("/painel"));
    expect(res.headers.get("location")).toBeNull();
  });
});

// C4.2 acrescentou um ramo inteiro (`modo === "supabase"`) que decide por
// PAPEL, não só por sessão — mas só é alcançado quando as duas variáveis
// `NEXT_PUBLIC_SUPABASE_*` estão configuradas. Este bloco prova que, sem
// elas, nada mudou: os cinco testes acima (trancado/senha/aberto) já
// exercitam exatamente essa condição — `limparAmbiente()` remove as
// variáveis do Supabase antes de cada um — e continuam verdes depois da
// mudança. Este teste deixa essa garantia explícita, em vez de implícita.
describe("middleware — C4.2 não muda o comportamento dos modos sem Supabase", () => {
  it("nenhuma variável do Supabase presente: modo trancado continua mandando para /acesso, não para /login nem /sem-acesso", async () => {
    limparAmbiente();
    process.env.RARO_SHEETS_ID = "planilha-real";
    expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBeUndefined();
    expect(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY).toBeUndefined();
    const res = await middleware(req("/financeiro"));
    expect(res.headers.get("location")).toBe("http://localhost:3000/acesso");
  });
});

// ALTO 1 — o ramo `modo === "supabase"` do middleware, de verdade: sessão +
// consulta de papel + decisão + resposta. `decidirAcessoSupabase` em si já
// está coberta, pura, em portao.test.ts — o que falta provar aqui é o
// FIAPO DE CÓDIGO que monta a entrada dela a partir do Supabase (papel
// normalizado por `papelDe`, não usado cru; consulta só acontece quando há
// usuário; erro tratado como mentorado; cookie renovado não se perde) e
// traduz a decisão de volta em `NextResponse`.
describe("middleware — ramo supabase (sessão + papel)", () => {
  function ligarSupabase() {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://exemplo-teste.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "chave-anonima-de-teste");
  }

  function usuarioLogado() {
    return { id: "11111111-1111-1111-1111-111111111111", email: "teste@exemplo.com" };
  }

  function semSessao() {
    getUserMock.mockResolvedValue({ data: { user: null } });
  }

  function comSessao() {
    getUserMock.mockResolvedValue({ data: { user: usuarioLogado() } });
  }

  /** Simula o Supabase rotacionando o refresh token durante `getUser()` —
   *  é o `set` do cookie chamado de dentro do SDK, antes de a função
   *  devolver o usuário. */
  function comSessaoERenovacaoDeCookie() {
    getUserMock.mockImplementation(async (opts: { cookies: { set: (...a: unknown[]) => void } }) => {
      opts.cookies.set("sb-refresh-token", "token-renovado", { path: "/", maxAge: 3600 });
      return { data: { user: usuarioLogado() } };
    });
  }

  function papelDevolvido(papel: string) {
    maybeSingleMock.mockResolvedValue({ data: { papel }, error: null });
  }

  it("usuário com papel 'dono' em /financeiro/dre: passa (não redireciona) — mata M12 (papel inicial 'gestor') e M10 parcialmente", async () => {
    ligarSupabase();
    comSessao();
    papelDevolvido("dono");
    const res = await middleware(req("/financeiro/dre"));
    expect(res.headers.get("location")).toBeNull();
  });

  it("usuário com papel 'mentorado' em /financeiro: redireciona para /sem-acesso — mata M12", async () => {
    ligarSupabase();
    comSessao();
    papelDevolvido("mentorado");
    const res = await middleware(req("/financeiro"));
    expect(res.headers.get("location")).toBe("http://localhost:3000/sem-acesso");
  });

  it("sem usuário (getUser devolve user: null) em /financeiro: redireciona para /login, e a consulta a profiles NUNCA acontece — mata M10", async () => {
    ligarSupabase();
    semSessao();
    const res = await middleware(req("/financeiro"));
    expect(res.headers.get("location")).toBe("http://localhost:3000/login");
    expect(maybeSingleMock).not.toHaveBeenCalled();
  });

  it("consulta devolve papel fora do enum ('chefe-supremo'): tratado como mentorado, /financeiro redireciona para /sem-acesso — mata M3", async () => {
    ligarSupabase();
    comSessao();
    papelDevolvido("chefe-supremo");
    const res = await middleware(req("/financeiro"));
    expect(res.headers.get("location")).toBe("http://localhost:3000/sem-acesso");
    // A prova direta de M3 (perfil?.papel as Papel no lugar de papelDe(...)):
    // o middleware tem que chamar papelDe com o valor CRU vindo da consulta.
    // rotaPermitida() também chama papelDe internamente (defesa em
    // profundidade — papeis.ts normaliza de novo por não confiar em quem
    // chama), então o RESULTADO da decisão sozinho não distingue o mutante:
    // ele acaba negando /financeiro dos dois jeitos. O que só existe no
    // código correto é ESTA chamada, feita pelo middleware, com o valor cru.
    expect(papelDeSpy).toHaveBeenCalledWith("chefe-supremo");
  });

  it("consulta LANÇA: tratado como mentorado, /financeiro redireciona para /sem-acesso — mata M4", async () => {
    ligarSupabase();
    comSessao();
    maybeSingleMock.mockRejectedValue(new Error("rede caiu"));
    const res = await middleware(req("/financeiro"));
    expect(res.headers.get("location")).toBe("http://localhost:3000/sem-acesso");
  });

  it("caso 'passa': o cookie escrito pelo dublê durante getUser() aparece na resposta — mata M5 (NextResponse.next() cru no lugar de res)", async () => {
    ligarSupabase();
    comSessaoERenovacaoDeCookie();
    papelDevolvido("dono");
    const res = await middleware(req("/financeiro/dre"));
    expect(res.headers.get("location")).toBeNull();
    expect(res.cookies.get("sb-refresh-token")?.value).toBe("token-renovado");
  });

  // ALTO 2 — o cookie renovado não pode sumir quando a decisão É um
  // redirecionamento. Antes do conserto, `NextResponse.redirect(...)` saía
  // sem os cookies que os callbacks `set`/`remove` escreveram em `res`
  // durante `getUser()` — deslogamento intermitente, e com detecção de
  // reuso de refresh token a família inteira podia ser revogada.
  describe("ALTO 2 — cookie renovado sobrevive ao redirecionamento", () => {
    it("mentorado redirecionado para /sem-acesso ainda recebe o cookie renovado", async () => {
      ligarSupabase();
      comSessaoERenovacaoDeCookie();
      papelDevolvido("mentorado");
      const res = await middleware(req("/financeiro"));
      expect(res.headers.get("location")).toBe("http://localhost:3000/sem-acesso");
      expect(res.cookies.get("sb-refresh-token")?.value).toBe("token-renovado");
    });

    it("usuário logado batendo em /login, redirecionado para a primeira rota do papel, ainda recebe o cookie renovado", async () => {
      ligarSupabase();
      comSessaoERenovacaoDeCookie();
      papelDevolvido("dono");
      const res = await middleware(req("/login"));
      expect(res.headers.get("location")).toBe("http://localhost:3000/");
      expect(res.cookies.get("sb-refresh-token")?.value).toBe("token-renovado");
    });
  });

  // MÉDIO 2 — o `error` de `maybeSingle()` era descartado sem log e o
  // try/catch nunca disparava nesse caminho (RLS/rede erram devolvendo
  // `{data:null,error:{...}}`, não lançando) — um dono legítimo cuja
  // consulta falhasse virava mentorado, barrado do próprio financeiro, sem
  // nenhum rastro para diagnosticar.
  describe("MÉDIO 2 — erro da consulta de papel é logado, nunca o id do usuário", () => {
    it("erro de RLS/rede: console.warn com error.code e error.message, e o acesso ainda cai para mentorado (/financeiro -> /sem-acesso)", async () => {
      ligarSupabase();
      comSessao();
      maybeSingleMock.mockResolvedValue({
        data: null,
        error: { code: "PGRST301", message: "linha inacessível por RLS" },
      });
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const res = await middleware(req("/financeiro"));

      expect(res.headers.get("location")).toBe("http://localhost:3000/sem-acesso");
      expect(warnSpy).toHaveBeenCalledTimes(1);
      const mensagem = warnSpy.mock.calls[0].join(" ");
      expect(mensagem).toContain("PGRST301");
      expect(mensagem).toContain("linha inacessível por RLS");
      expect(mensagem).not.toContain(usuarioLogado().id);

      warnSpy.mockRestore();
    });
  });
});

// A decisão de PAPEL em si (mentorado barrado de /financeiro, laço evitado
// pela ordem das regras, etc.) já está totalmente coberta, de forma pura e
// sem dublê nenhum, em `src/lib/portao.test.ts` (`decidirAcessoSupabase`).
// O que só o middleware de verdade pode garantir — e é o que este bloco e o
// bloco "ramo supabase" acima cobrem — é a LIGAÇÃO com o mundo real: (a) os
// modos sem Supabase continuam intocados, (b) o matcher continua excluindo
// /api/, e (c) o fiapo de código que MONTA a entrada de `decidirAcessoSupabase`
// a partir de `getUser()`/`profiles` — papel normalizado, cookie renovado
// preservado no redirect, erro de consulta com rastro — que `portao.test.ts`
// não tem como alcançar porque não fala com o Supabase.
describe("middleware — matcher continua excluindo /api/", () => {
  const padrao = new RegExp(`^${configDoMiddleware.matcher[0]}$`);

  it("não intercepta rotas de api", () => {
    expect(padrao.test("/api/manutencao/keepalive")).toBe(false);
    expect(padrao.test("/api/ia")).toBe(false);
  });

  it("continua interceptando o resto do sistema, inclusive as rotas novas de papel", () => {
    expect(padrao.test("/financeiro")).toBe(true);
    expect(padrao.test("/sem-acesso")).toBe(true);
    expect(padrao.test("/login")).toBe(true);
  });
});
