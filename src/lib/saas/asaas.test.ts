import { describe, expect, it } from "vitest";
import { configuracaoAsaas, statusPorEventoAsaas, tokenWebhookConfere, workspaceDoEventoAsaas } from "./asaas";

describe("configuração Asaas", () => {
  it("falha fechada sem preço, chave ou token seguro", () => {
    expect(configuracaoAsaas({})).toMatchObject({ pronta: false });
    expect(configuracaoAsaas({ ASAAS_API_KEY: "x", ASAAS_WEBHOOK_TOKEN: "x".repeat(32) })).toMatchObject({ pronta: false, motivo: "O preço mensal ainda não foi definido." });
  });
  it("aceita somente configuração privada completa", () => {
    expect(configuracaoAsaas({ ASAAS_API_KEY: "chave", ASAAS_WEBHOOK_TOKEN: "t".repeat(32), ASAAS_PLANO_MENSAL_CENTAVOS: "9900" })).toMatchObject({ pronta: true, valorCentavos: 9900 });
  });
});

describe("webhook Asaas", () => {
  it("mapeia só eventos financeiros que mudam acesso", () => {
    expect(statusPorEventoAsaas("PAYMENT_CONFIRMED")).toBe("ativo");
    expect(statusPorEventoAsaas("PAYMENT_OVERDUE")).toBe("bloqueado");
    expect(statusPorEventoAsaas("SUBSCRIPTION_DELETED")).toBe("cancelado");
    expect(statusPorEventoAsaas("PAYMENT_CREATED")).toBeNull();
  });
  it("exige token e referência de workspace válidos", () => {
    const id = "00000000-0000-0000-0000-000000000123";
    expect(tokenWebhookConfere("segredo", "segredo")).toBe(true);
    expect(tokenWebhookConfere("outro", "segredo")).toBe(false);
    expect(workspaceDoEventoAsaas({ id: "evt", event: "PAYMENT_CONFIRMED", payment: { externalReference: id } })).toBe(id);
    expect(workspaceDoEventoAsaas({ id: "evt", event: "PAYMENT_CONFIRMED" })).toBeNull();
  });
});
