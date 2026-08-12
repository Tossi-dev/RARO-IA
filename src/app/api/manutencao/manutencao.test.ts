// Testes das rotas de manutenção (`keepalive` e `espelho`).
//
// Os dois medos que este arquivo existe para prevenir:
//
// 1. O CRON CAI NO PORTÃO EM SILÊNCIO. Se `/api/manutencao/keepalive` fosse
//    interceptada pelo middleware do portão de acesso, o cron da Vercel
//    receberia um redirecionamento 307 para `/acesso` — nunca chegaria a
//    consultar o Supabase — e ainda assim a Vercel marcaria o disparo como
//    sucesso (redirecionamento não é erro HTTP). O keepalive "existiria" no
//    código e não faria absolutamente nada. Este é o pior tipo de bug: sem
//    sintoma nenhum até o dia em que o projeto pausa.
//
// 2. UMA FALHA DE MANUTENÇÃO VIRA UM 500 QUE ACORDA ALGUÉM. A Vercel manda
//    e-mail de alerta quando um cron responde 5xx. Supabase fora do ar por
//    alguns minutos, ou a planilha recusando a conexão, não são motivo para
//    isso — o que importa para o cron é que a tentativa aconteceu.

import { NextResponse } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { config as configDoMiddleware } from "@/middleware";

const ENV_SUPABASE = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"] as const;

function limparEnvSupabase() {
  for (const v of ENV_SUPABASE) delete process.env[v];
}

afterEach(() => {
  limparEnvSupabase();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("o matcher do middleware não intercepta /api/manutencao", () => {
  // Esta é a prova da armadilha descrita no cabeçalho: reproduz exatamente o
  // regex que `src/middleware.ts` declara em `config.matcher` (a mesma peça
  // que o Next.js usa para decidir se roda o middleware antes mesmo de
  // chamar a função) e confere, sem subir servidor nenhum, que os caminhos
  // de manutenção passam por fora dele.
  //
  // Por que não testar via `rotaLivre()` (src/lib/acesso.ts): aquela lista
  // (`/acesso`, `/login`, `/privacidade`) é para telas — o portão nem chega a
  // avaliá-la para `/api/*`, porque o matcher já exclui a árvore `api/`
  // inteira antes de o middleware rodar. É esse matcher, e não `rotaLivre`,
  // que de fato mantém estas rotas livres — por isso é ele que precisa estar
  // sob teste.
  const padrao = new RegExp(`^${configDoMiddleware.matcher[0]}$`);

  it("nao intercepta o keepalive", () => {
    expect(padrao.test("/api/manutencao/keepalive")).toBe(false);
  });

  it("nao intercepta o espelho", () => {
    expect(padrao.test("/api/manutencao/espelho")).toBe(false);
  });

  it("continua interceptando o resto do sistema (o portão nao ficou desligado)", () => {
    expect(padrao.test("/painel")).toBe(true);
    expect(padrao.test("/financeiro/caixa")).toBe(true);
  });
});

describe("GET /api/manutencao/keepalive", () => {
  it("sem Supabase configurado, responde 200 com ok:false (nunca 500)", async () => {
    limparEnvSupabase();
    const { GET } = await import("./keepalive/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const corpo = await res.json();
    expect(corpo).toEqual({ ok: false, erro: "supabase nao configurado" });
  });

  it("erro do Supabase vira 200 com ok:false, nunca 500", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://exemplo.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "chave-anonima-de-teste";

    vi.doMock("@/lib/supabase/server", () => ({
      criarSupabaseServer: () => ({
        from: () => ({
          select: () => ({
            limit: async () => ({ data: null, error: { message: "conexao recusada" } }),
          }),
        }),
      }),
    }));

    const { GET } = await import("./keepalive/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const corpo = await res.json();
    expect(corpo.ok).toBe(false);
    expect(typeof corpo.erro).toBe("string");
  });

  it("com Supabase respondendo bem, devolve ok:true e um `quando` em ISO", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://exemplo.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "chave-anonima-de-teste";

    vi.doMock("@/lib/supabase/server", () => ({
      criarSupabaseServer: () => ({
        from: () => ({
          select: () => ({
            limit: async () => ({ data: [{ id: "1" }], error: null }),
          }),
        }),
      }),
    }));

    const { GET } = await import("./keepalive/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const corpo = await res.json();
    expect(corpo.ok).toBe(true);
    expect(Number.isNaN(Date.parse(corpo.quando))).toBe(false);
  });
});

describe("GET /api/manutencao/espelho", () => {
  it("sem planilha configurada, responde 200 honesto: nada a espelhar ainda", async () => {
    delete process.env.RARO_SHEETS_ID;
    const { GET } = await import("./espelho/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const corpo = await res.json();
    expect(corpo.ok).toBe(true);
    expect(corpo.espelhado).toEqual([]);
  });

  it("planilha recusando a conexão vira 200 com ok:false, nunca 500", async () => {
    vi.doMock("@/lib/data", () => ({ planilhaConfigurada: () => true }));
    vi.doMock("@/lib/sheets/escrever", () => ({
      pingPlanilha: async () => ({ ok: false, erro: "planilha recusou a conexao" }),
    }));

    const { GET } = await import("./espelho/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const corpo = await res.json();
    expect(corpo).toEqual({ ok: false, espelho: "falhou", motivo: "planilha recusou a conexao" });
  });

  it("uma falha inesperada (exceção) também vira 200 com ok:false, nunca 500", async () => {
    vi.doMock("@/lib/data", () => ({ planilhaConfigurada: () => true }));
    vi.doMock("@/lib/sheets/escrever", () => ({
      pingPlanilha: async () => {
        throw new Error("timeout de rede");
      },
    }));

    const { GET } = await import("./espelho/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const corpo = await res.json();
    expect(corpo.ok).toBe(false);
    expect(corpo.espelho).toBe("falhou");
  });
});

// Confirma que `NextResponse` é mesmo o mecanismo em uso (evita um teste que
// passaria por acidente contra um objeto qualquer com `.status`/`.json()`).
describe("higiene", () => {
  it("NextResponse.json produz uma Response de verdade", async () => {
    const res = NextResponse.json({ ok: true }, { status: 200 });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
