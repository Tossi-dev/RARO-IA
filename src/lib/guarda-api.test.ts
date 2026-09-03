// Teste com `Request` de verdade — a mesma exigência do enunciado que valeu
// para o portão de páginas (`middleware.test.ts`): provar que a ligação
// entre `modoAcesso()`/`seloConfere()` (já testados em acesso.test.ts) e o
// mundo real de headers HTTP não quebra no meio do caminho.
//
// IPs distintos por teste de propósito: o freio de uso (`chamadasPorIp`) é
// um mapa em memória de MÓDULO, compartilhado por todos os testes deste
// arquivo — usar o mesmo IP em dois testes faria um "vazar" contagem para o
// outro e o teste do freio (chamada 21) ficaria dependente da ordem de
// execução dos demais.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COOKIE_ACESSO, selo } from "@/lib/acesso";

const { getUserMock } = vi.hoisted(() => ({ getUserMock: vi.fn() }));

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { getUser: getUserMock } }),
}));

import { guardarApi } from "./guarda-api";

const VARS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "RARO_SENHA",
  "RARO_ACESSO_ABERTO",
  "RARO_SHEETS_ID",
  "RARO_MODO",
  "ANTHROPIC_API_KEY",
  "GROQ_API_KEY",
] as const;

function limparAmbiente() {
  for (const v of VARS) delete process.env[v];
}

afterEach(limparAmbiente);
beforeEach(() => getUserMock.mockReset());

function req(opts: { cookie?: string; ip?: string } = {}): Request {
  const headers = new Headers();
  if (opts.cookie) headers.set("cookie", `${COOKIE_ACESSO}=${opts.cookie}`);
  headers.set("x-forwarded-for", opts.ip ?? "203.0.113.1");
  return new Request("http://localhost:3000/api/ia", { method: "POST", headers });
}

async function corpo(r: Response) {
  return (await r.json()) as unknown;
}

describe("guardarApi — modo senha", () => {
  it("cookie certo passa (devolve null)", async () => {
    limparAmbiente();
    process.env.RARO_SENHA = "raro-2026-segredo-longo";
    const cookieBom = await selo("raro-2026-segredo-longo");
    const r = await guardarApi(req({ cookie: cookieBom, ip: "203.0.113.10" }));
    expect(r).toBeNull();
  });

  it("cookie de outra senha recusa com 401, sem detalhe no corpo", async () => {
    limparAmbiente();
    process.env.RARO_SENHA = "raro-2026-segredo-longo";
    const cookieErrado = await selo("uma-senha-completamente-diferente");
    const r = await guardarApi(req({ cookie: cookieErrado, ip: "203.0.113.11" }));
    expect(r).not.toBeNull();
    expect(r!.status).toBe(401);
    expect(await corpo(r!)).toEqual({ erro: "não autorizado" });
  });

  it("sem cookie nenhum recusa com 401", async () => {
    limparAmbiente();
    process.env.RARO_SENHA = "raro-2026-segredo-longo";
    const r = await guardarApi(req({ ip: "203.0.113.12" }));
    expect(r).not.toBeNull();
    expect(r!.status).toBe(401);
  });
});

describe("guardarApi — modo trancado", () => {
  it("dado real e nenhuma proteção configurada recusa", async () => {
    limparAmbiente();
    process.env.RARO_SHEETS_ID = "planilha-real";
    const r = await guardarApi(req({ ip: "203.0.113.13" }));
    expect(r).not.toBeNull();
    expect(r!.status).toBe(401);
  });
});

describe("guardarApi — isolamento UAT", () => {
  it("recusa crédito externo para sessão audit.invalid", async () => {
    limparAmbiente();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://projeto.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-teste";
    getUserMock.mockResolvedValue({ data: { user: { email: "gestor@audit.invalid" } } });

    const r = await guardarApi(req({ ip: "203.0.113.17" }));

    expect(r?.status).toBe(403);
    expect(await corpo(r!)).toEqual({ erro: "não autorizado" });
  });

  it("mantém a API disponível para sessão autenticada não sintética", async () => {
    limparAmbiente();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://projeto.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-teste";
    getUserMock.mockResolvedValue({ data: { user: { email: "gestor@empresa.com" } } });

    await expect(guardarApi(req({ ip: "203.0.113.18" }))).resolves.toBeNull();
  });
});

describe("guardarApi — modo aberto e a chave de IA", () => {
  it("sem chave nenhuma configurada, aberto passa (não há crédito em jogo)", async () => {
    limparAmbiente();
    const r = await guardarApi(req({ ip: "203.0.113.14" }));
    expect(r).toBeNull();
  });

  it("com ANTHROPIC_API_KEY configurada, aberto deixa de passar", async () => {
    limparAmbiente();
    process.env.ANTHROPIC_API_KEY = "sk-ant-teste";
    const r = await guardarApi(req({ ip: "203.0.113.15" }));
    expect(r).not.toBeNull();
    expect(r!.status).toBe(401);
  });

  it("com GROQ_API_KEY configurada, aberto também deixa de passar", async () => {
    limparAmbiente();
    process.env.GROQ_API_KEY = "gsk-teste";
    const r = await guardarApi(req({ ip: "203.0.113.16" }));
    expect(r).not.toBeNull();
    expect(r!.status).toBe(401);
  });
});

describe("guardarApi — freio de uso", () => {
  it("libera até 20 chamadas em 5 minutos e recusa a 21ª com 429", async () => {
    limparAmbiente();
    process.env.RARO_SENHA = "raro-2026-segredo-longo";
    const cookieBom = await selo("raro-2026-segredo-longo");
    const ip = "198.51.100.1"; // IP exclusivo deste teste — ver nota no topo do arquivo

    for (let i = 0; i < 20; i++) {
      const r = await guardarApi(req({ cookie: cookieBom, ip }));
      expect(r).toBeNull();
    }
    const r21 = await guardarApi(req({ cookie: cookieBom, ip }));
    expect(r21).not.toBeNull();
    expect(r21!.status).toBe(429);
  });
});
