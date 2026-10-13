export type ConfiguracaoAsaas =
  | { pronta: true; apiKey: string; webhookToken: string; valorCentavos: number; baseUrl: string }
  | { pronta: false; motivo: string };

/** Lê somente configuração privada. Sem preço e chaves completas, não existe
 * checkout: redirecionar alguém sem isso nunca pode liberar o workspace. */
export function configuracaoAsaas(env: NodeJS.ProcessEnv = process.env): ConfiguracaoAsaas {
  const apiKey = env.ASAAS_API_KEY?.trim() ?? "";
  const webhookToken = env.ASAAS_WEBHOOK_TOKEN?.trim() ?? "";
  const valorCentavos = Number(env.ASAAS_PLANO_MENSAL_CENTAVOS);
  const baseUrl = env.ASAAS_BASE_URL?.trim() || "https://api.asaas.com/v3";
  if (!apiKey) return { pronta: false, motivo: "Integração de pagamento ainda não configurada." };
  if (webhookToken.length < 32 || /\s/.test(webhookToken)) return { pronta: false, motivo: "Webhook de pagamento ainda não configurado com segurança." };
  if (!Number.isInteger(valorCentavos) || valorCentavos <= 0) return { pronta: false, motivo: "O preço mensal ainda não foi definido." };
  return { pronta: true, apiKey, webhookToken, valorCentavos, baseUrl };
}

export type EventoAsaas = { id: string; event: string; payment?: { externalReference?: string | null }; subscription?: { externalReference?: string | null } };

export function workspaceDoEventoAsaas(evento: EventoAsaas): string | null {
  const valor = evento.payment?.externalReference ?? evento.subscription?.externalReference;
  return typeof valor === "string" && /^[0-9a-f-]{36}$/i.test(valor) ? valor : null;
}

export function statusPorEventoAsaas(evento: string): "ativo" | "bloqueado" | "cancelado" | null {
  if (["PAYMENT_CONFIRMED", "PAYMENT_RECEIVED"].includes(evento)) return "ativo";
  if (["PAYMENT_OVERDUE", "PAYMENT_REFUNDED", "PAYMENT_DELETED"].includes(evento)) return "bloqueado";
  if (["SUBSCRIPTION_DELETED", "SUBSCRIPTION_INACTIVATED"].includes(evento)) return "cancelado";
  return null;
}

export function tokenWebhookConfere(recebido: string | null, esperado: string): boolean {
  if (!recebido || recebido.length !== esperado.length) return false;
  let diferente = 0;
  for (let i = 0; i < esperado.length; i += 1) diferente |= recebido.charCodeAt(i) ^ esperado.charCodeAt(i);
  return diferente === 0;
}
