export const CATEGORIAS_CONSENTIMENTO = ["mapa", "reflexao", "meta", "transcricao", "portal"] as const;
export type CategoriaConsentimento = (typeof CATEGORIAS_CONSENTIMENTO)[number];
export type ConsentimentosAtendimento = Readonly<Record<CategoriaConsentimento, boolean>>;

function ehCategoria(valor: unknown): valor is CategoriaConsentimento {
  return typeof valor === "string" && (CATEGORIAS_CONSENTIMENTO as readonly string[]).includes(valor);
}

export function podeRegistrar(categoria: unknown, consentimentos: ConsentimentosAtendimento): boolean {
  return ehCategoria(categoria) && consentimentos[categoria] === true;
}

export function revogarConsentimento(
  consentimentos: ConsentimentosAtendimento,
  categoria: CategoriaConsentimento
): ConsentimentosAtendimento {
  return { ...consentimentos, [categoria]: false };
}
