import { afterEach, describe, expect, it } from "vitest";

import { POST } from "./route";

const segredoOriginal = process.env.WEBHOOK_SECRET;

afterEach(() => {
  if (segredoOriginal === undefined) delete process.env.WEBHOOK_SECRET;
  else process.env.WEBHOOK_SECRET = segredoOriginal;
});

describe("Webhook de pagamento — barreiras locais", () => {
  it("recusa ativação sem segredo configurado", async () => {
    delete process.env.WEBHOOK_SECRET;

    const resposta = await POST(new Request("http://localhost/api/webhooks/pagamento", { method: "POST" }));

    expect(resposta.status).toBe(501);
    await expect(resposta.json()).resolves.toMatchObject({ erro: expect.stringContaining("ainda não configurado") });
  });

  it("recusa assinatura inválida antes de ler o payload", async () => {
    process.env.WEBHOOK_SECRET = "segredo-sintetico-local";

    const resposta = await POST(new Request("http://localhost/api/webhooks/pagamento", {
      method: "POST",
      headers: { "x-webhook-secret": "incorreto", "content-type": "application/json" },
      body: JSON.stringify({ evento: "teste" }),
    }));

    expect(resposta.status).toBe(401);
    await expect(resposta.json()).resolves.toEqual({ erro: "Assinatura inválida." });
  });
});
