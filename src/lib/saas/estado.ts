export const DIAS_DE_TESTE = 7;

export type StatusSaas = "teste" | "ativo" | "bloqueado" | "cancelado";

export interface EstadoSaas {
  status: StatusSaas;
  terminaEm: string;
}

export function fimDoTeste(inicio: Date): Date {
  return new Date(inicio.getTime() + DIAS_DE_TESTE * 24 * 60 * 60 * 1000);
}

/**
 * Um plano pago ativo não expira pelo relógio de teste. Qualquer estado
 * desconhecido ou data inválida bloqueia por segurança.
 */
export function acessoSaasLiberado(estado: EstadoSaas | null, agora = new Date()): boolean {
  if (!estado) return true; // workspaces legados não são reclassificados por esta fase.
  if (estado.status === "ativo") return true;
  if (estado.status !== "teste") return false;

  const fim = new Date(estado.terminaEm);
  return Number.isFinite(fim.getTime()) && agora.getTime() < fim.getTime();
}
