// Leitura server-only do filtro global (usa next/headers → nunca no client).
import { cookies } from "next/headers";
import { RANGES, type FiltroGlobal } from "./filtros";

// Não dá pra validar `fonte` contra a lista de produtos aqui: essa lista vem
// do banco e este módulo não tem acesso a ele (é lido antes da consulta, nas
// páginas). Qualquer string vale — página/componente que resolve a fonte
// contra o cadastro real decide se ela ainda existe; se não existir mais,
// tratam como "todos" na hora de filtrar.
export function getFiltroGlobal(): FiltroGlobal {
  const jar = cookies();
  const fonteRaw = jar.get("raro_fonte")?.value ?? "todos";
  const rangeRaw = Number(jar.get("raro_range")?.value ?? "365");
  return {
    fonte: fonteRaw || "todos",
    rangeDias: RANGES.some((r) => r.dias === rangeRaw) ? rangeRaw : 365,
  };
}
