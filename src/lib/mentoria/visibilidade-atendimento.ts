import type { ConsentimentosAtendimento } from "./consentimento";

export type VisibilidadeAtendimento = "privada_profissional" | "compartilhavel";

export function podeExibirParaCliente(
  visibilidade: unknown,
  consentimentos: ConsentimentosAtendimento
): boolean {
  return visibilidade === "compartilhavel" && consentimentos.portal === true;
}
