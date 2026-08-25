export interface Utm {
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_content: string;
  utm_term: string;
}

function primeiro(valor: unknown): string {
  const candidato = Array.isArray(valor) ? valor[0] : valor;
  if (typeof candidato !== "string") return "";
  return candidato.replace(/\p{Cc}/gu, "").replace(/\s+/g, " ").trim().toLocaleLowerCase("pt-BR").slice(0, 120);
}

/** Normaliza a entrada de URL antes de qualquer persistência; nunca devolve valor cru ou undefined. */
export function lerUtm(searchParams: Record<string, unknown>): Utm {
  return {
    utm_source: primeiro(searchParams.utm_source),
    utm_medium: primeiro(searchParams.utm_medium),
    utm_campaign: primeiro(searchParams.utm_campaign),
    utm_content: primeiro(searchParams.utm_content),
    utm_term: primeiro(searchParams.utm_term),
  };
}
