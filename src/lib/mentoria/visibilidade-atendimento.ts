import { CATEGORIAS_CONSENTIMENTO, type CategoriaConsentimento, type ConsentimentosAtendimento } from "./consentimento";

export type VisibilidadeAtendimento = "privada_profissional" | "compartilhavel";

export function podeExibirParaCliente(
  visibilidade: unknown,
  categoria: unknown,
  consentimentos: ConsentimentosAtendimento
): boolean {
  const categoriaValida =
    typeof categoria === "string" && (CATEGORIAS_CONSENTIMENTO as readonly string[]).includes(categoria);
  return (
    visibilidade === "compartilhavel" &&
    categoriaValida &&
    consentimentos[categoria as CategoriaConsentimento] === true &&
    consentimentos.portal === true
  );
}
