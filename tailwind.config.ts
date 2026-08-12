import type { Config } from "tailwindcss";

// ============================================================
// Design System "Premium" — Blueprint v3, Anexo A
//
// Os valores deixaram de ser hex fixo e passaram a apontar para variáveis CSS.
// O tema escuro mora no :root; o claro em [data-tema="claro"] (globals.css).
// NENHUM nome de token mudou — o app inteiro recolore sem tocar nas páginas.
//
// Por que canal RGB e não hex dentro da variável: o código usa `/opacidade`
// em 37 lugares (bg-primaria/15, border-ouro/40, bg-painel/60...). Só a forma
// `rgb(var(--x) / <alpha-value>)` preserva isso. Hex dentro da var quebraria
// TODAS essas opacidades em silêncio, com build verde.
//
// As três bordas usam a forma de FUNÇÃO porque já nascem translúcidas:
// sem opacidade pedida, devolvem o rgba próprio; com opacidade, usam o canal.
// ============================================================

/** Cor sólida guardada como canal RGB, com suporte a `/opacidade`. */
const canal = (nome: string) => `rgb(var(--${nome}) / <alpha-value>)`;

/**
 * Cor que já nasce translúcida (bordas).
 *
 * BUG QUE ISTO CORRIGE — a "cara de IA" do painel
 * -----------------------------------------------
 * A versão anterior devolvia o alpha próprio só quando `opacityValue` chegava
 * `undefined`. Acontece que o Tailwind 3.4 NUNCA manda undefined: ele sempre
 * passa a string `var(--tw-border-opacity, 1)`, mesmo quando ninguém pediu
 * opacidade. O ramo do alpha próprio, então, nunca rodava, e todo
 * `border-borda*` do app inteiro saía compilado como:
 *
 *     border-color: rgb(255 255 255 / 1)     <- branco CHAPADO no escuro
 *     border-color: rgb(23 21 31 / 1)        <- preto CHAPADO no claro
 *
 * Ou seja: cada card do produto vinha com um contorno de 1px em opacidade
 * total, em vez dos 6% pretendidos. É exatamente o que faz um painel parecer
 * "caixa desenhada" em vez de superfície — o sintoma que o cliente descreveu.
 *
 * A correção COMPÕE os dois alphas: o do token e o que a classe pedir.
 * `border-borda/60` passa a significar 60% de 9%, e não 60% de opaco.
 */
const veu =
  (nome: string, alphaBase: number) =>
  ({ opacityValue }: { opacityValue?: string }) =>
    opacityValue === undefined
      ? `var(--${nome})`
      : `rgb(var(--${nome}-canal) / calc(${alphaBase} * ${opacityValue}))`;

// O Tailwind ACEITA função como valor de cor (é assim que ele passa a opacidade
// pedida), mas o tipo `Config` de v3 só descreve string. O cast fica aqui, num
// ponto só e comentado, em vez de espalhar `as any` por 30 tokens.
const cores = {
  // superfícies / elevação
  fundo: canal("fundo"),
  "superficie-1": canal("superficie-1"),
  painel: canal("painel"),
  "painel-2": canal("painel-2"),
  eleva: canal("eleva"),
  poco: canal("poco"),

  // bordas (translúcidas por natureza)
  // Os alphas-base espelham os valores de --borda-* em globals.css. Se um
  // mudar lá, muda aqui — não há como o CSS informar o número ao build.
  "borda-sutil": veu("borda-sutil", 0.06),
  borda: veu("borda", 0.09),
  "borda-forte": veu("borda-forte", 0.16),

  // texto
  texto: canal("texto"),
  "texto-2": canal("texto-2"),
  "texto-3": canal("texto-3"),
  "texto-4": canal("texto-4"),

  // marca — violeta
  primaria: canal("primaria"),
  "primaria-2": canal("primaria-2"),
  "primaria-hover": canal("primaria-hover"),
  "primaria-press": canal("primaria-press"),

  // ouro (premium / high-ticket)
  ouro: canal("ouro"),
  "ouro-2": canal("ouro-2"),
  "ouro-3": canal("ouro-3"),

  // semânticos
  positivo: canal("positivo"),
  negativo: canal("negativo"),
  aviso: canal("aviso"),
  info: canal("info"),
} as unknown as Record<string, string>;

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: cores,
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        body: ["var(--font-body)", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
      // Raio maior, linha Apple/ennvo: a base do kit é 1rem. `lg` sobe de 10
      // para 12 e `xl` de 14 para 16 — como TODA página usa `rounded-xl` nos
      // cards, é aqui que a forma do produto inteiro muda, e não nas telas.
      borderRadius: {
        lg: "12px",
        xl: "16px",
        "2xl": "20px",
        "3xl": "24px",
      },
      fontWeight: {
        // O peso leve é metade da identidade. `font-fino` existe para o número
        // herói dos KPIs, que em fonte fina e corpo grande é o que separa
        // "premium" de "template".
        fino: "300",
      },
      boxShadow: {
        e1: "var(--sombra-e1)",
        e2: "var(--sombra-e2)",
        e3: "var(--sombra-e3)",
        e4: "var(--sombra-e4)",
      },
    },
  },
  plugins: [],
};
export default config;
