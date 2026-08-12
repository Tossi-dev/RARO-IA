// Tema visual — módulo NEUTRO (sem "use client", sem next/headers).
// Client (botão da topbar) e server (layout) leem daqui os mesmos nomes.
//
// Escuro é o padrão e continua sendo o visual atual do painel. O claro é uma
// escolha do usuário, guardada em COOKIE e não em localStorage: o servidor
// precisa saber o tema para escrever data-tema no <html> já na primeira
// resposta. Com localStorage o painel abriria escuro e piscaria para claro.

export type Tema = "escuro" | "claro";

export const TEMA_PADRAO: Tema = "escuro";

export const COOKIE_TEMA = "raro_tema";

export function temaValido(v: string | undefined | null): Tema {
  return v === "claro" || v === "escuro" ? v : TEMA_PADRAO;
}

export const TEMA_LABEL: Record<Tema, string> = {
  escuro: "Modo escuro",
  claro: "Modo claro",
};

/** O tema oposto ao atual — o que o botão vai aplicar. */
export function alternar(t: Tema): Tema {
  return t === "escuro" ? "claro" : "escuro";
}
