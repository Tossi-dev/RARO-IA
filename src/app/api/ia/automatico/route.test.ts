import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { GET } from "./route";

describe("rota IA automática", () => {
  it.each([undefined, "0", "false", "true", " 1", "01"])("permanece desligada para IA_AUTOMATICA=%j", async (valor) => {
    vi.stubEnv("CRON_SECRET", "segredo");
    if (valor === undefined) delete process.env.IA_AUTOMATICA; else vi.stubEnv("IA_AUTOMATICA", valor);
    const resposta = await GET(new NextRequest("http://local/api/ia/automatico", { headers: { authorization: "Bearer segredo" } }));
    expect(await resposta.json()).toMatchObject({ ligado: false });
  });
  it("recusa chamada anônima", async () => {
    vi.stubEnv("CRON_SECRET", "segredo");
    const resposta = await GET(new NextRequest("http://local/api/ia/automatico"));
    expect(resposta.status).toBe(401);
  });
  it("não tem cron ativo apontando para esta rota", () => {
    const vercel = readFileSync(join(process.cwd(), "vercel.json"), "utf8");
    expect(vercel).not.toMatch(/"path"\s*:\s*"\/api\/ia\/automatico"/);
  });
});
