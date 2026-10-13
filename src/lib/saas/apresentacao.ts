import type { StatusSaas } from "./estado";
import { acessoSaasLiberado } from "./estado";

export const ROTULO_STATUS_SAAS: Record<StatusSaas, string> = {
  teste: "Teste ativo",
  ativo: "Plano ativo",
  bloqueado: "Acesso bloqueado",
  cancelado: "Assinatura cancelada",
};

/** A expiração é temporal: o banco não precisa esperar um webhook para mudar
 * `teste` em `bloqueado`. A visualização segue a mesma regra do middleware. */
export function statusEfetivoSaas(status: StatusSaas | null, terminaEm: string | null, agora = new Date()): StatusSaas | null {
  if (status === "teste" && !acessoSaasLiberado({ status, terminaEm: terminaEm ?? "" }, agora)) return "bloqueado";
  return status;
}

export function resumoDoPrazo(status: StatusSaas | null, terminaEm: string | null, agora = new Date()): string {
  if (!status || !terminaEm) return "Seu plano será configurado pela administração.";
  if (status === "ativo") return "Seu plano está ativo.";
  if (status === "cancelado") return "A assinatura foi cancelada; seus dados continuam preservados.";
  if (status === "bloqueado") return "Seu teste terminou. Contrate o plano para retomar o acesso; seus dados continuam preservados.";
  const fim = new Date(terminaEm);
  const dias = Math.max(0, Math.ceil((fim.getTime() - agora.getTime()) / 86_400_000));
  return dias === 0 ? "Seu teste termina hoje." : `Seu teste termina em ${dias} dia${dias === 1 ? "" : "s"}.`;
}
