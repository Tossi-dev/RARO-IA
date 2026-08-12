// Teste do middleware com `NextRequest` de verdade — a garantia de que a
// ligação entre `decidirAcesso` (puro, já testado em portao.test.ts) e o
// mundo real de cookie/redirect do Next não quebrou no meio do caminho.
//
// As variáveis de ambiente aqui simulam `ambienteAtual()`: o middleware lê
// `process.env` direto (não dá para injetar no Edge Runtime de produção),
// então cada teste planta o cenário e desfaz no `afterEach`.

import { NextRequest } from "next/server";
import { afterEach, describe, expect, it } from "vitest";
import { COOKIE_ACESSO, selo } from "@/lib/acesso";
import { middleware } from "./middleware";

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

afterEach(limparAmbiente);

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
