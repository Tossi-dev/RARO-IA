// Leitura server-only do tema (usa next/headers → nunca no client).
// Mesmo padrão de ./filtros-server.

import { cookies } from "next/headers";
import { COOKIE_TEMA, temaValido, type Tema } from "./tema";

export function getTema(): Tema {
  return temaValido(cookies().get(COOKIE_TEMA)?.value);
}
