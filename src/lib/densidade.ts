// Densidade de informação — módulo NEUTRO (sem "use client", sem next/headers).
//
// POR QUE ISTO EXISTE
// -------------------
// O dono do negócio é visual e abriu o painel achando que tinha informação
// demais. Ele não estava errado: cada KPI trazia o valor, a variação, a
// memória de cálculo em três linhas, a referência e a origem do dado — e o
// dashboard empilhava oito blocos desses.
//
// A saída NÃO é apagar informação. Número sem a conta atrás vira palpite, e a
// regra da casa é que todo KPI carrega a sua composição. A saída é DOBRAR:
//
//   simples  → o cartão mostra rótulo, número e variação. A conta continua
//              inteira, a um clique, dentro do modal que o cartão já abre.
//   completo → tudo aberto na tela, como estava.
//
// Guardado em COOKIE, e não em localStorage, pela mesma razão do tema: o
// servidor precisa saber a densidade para escrever `data-densidade` no <html>
// já na primeira resposta. Com localStorage a tela abriria cheia e piscaria
// para vazia.

export type Densidade = "simples" | "completo";

/** Simples é o padrão: quem precisa de tudo pede, quem não precisa não é punido.
 *
 * Isto já resolve o pedido de "menos número por padrão no celular" sem
 * precisar de nenhuma lógica separada por aparelho: o padrão é UM só valor,
 * o mesmo para toda largura de tela, então o celular herda "simples" pela
 * mesma regra que o desktop — e o desktop não muda de comportamento, porque
 * o valor de hoje já era este. O servidor não sabe (e não deveria fingir
 * saber) se quem está pedindo a página é um iPhone ou um monitor; o que
 * distingue os dois é só a densidade da GRADE de ícones e o header que
 * encolhe, e isso é responsabilidade do CSS/cliente (springboard.tsx,
 * menu-mobile.tsx), não deste módulo. */
export const DENSIDADE_PADRAO: Densidade = "simples";

export const COOKIE_DENSIDADE = "raro_densidade";

export function densidadeValida(v: string | undefined | null): Densidade {
  return v === "simples" || v === "completo" ? v : DENSIDADE_PADRAO;
}

export const DENSIDADE_LABEL: Record<Densidade, string> = {
  simples: "Visão simples",
  completo: "Visão completa",
};

/** A densidade oposta à atual — a que o botão vai aplicar. */
export function alternarDensidade(d: Densidade): Densidade {
  return d === "simples" ? "completo" : "simples";
}
