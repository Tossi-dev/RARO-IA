// Leitura server-only da densidade (usa next/headers → nunca no client).
// Mesmo padrão de ./tema-server e ./filtros-server.

import { cookies } from "next/headers";
import { COOKIE_DENSIDADE, densidadeValida, type Densidade } from "./densidade";

export function getDensidade(): Densidade {
  return densidadeValida(cookies().get(COOKIE_DENSIDADE)?.value);
}
