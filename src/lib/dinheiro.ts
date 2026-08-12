// Leitura de dinheiro digitado por gente — módulo NEUTRO.
//
// POR QUE ESTE ARQUIVO EXISTE
// ---------------------------
// Os formulários do sistema usavam `z.coerce.number()` direto no campo de
// valor. Isso funciona para "1234.56" e quebra para "1.234,56", que é como
// TODO brasileiro digita dinheiro — e como o próprio sistema mostra o número
// na tela ao lado do campo. O resultado era um NaN que virava erro de
// validação genérico, sem dizer à pessoa que o problema era a vírgula.
//
// A REGRA DA AMBIGUIDADE
// ----------------------
// "1.234" é mil duzentos e trinta e quatro, ou um inteiro com três casas
// decimais? Não dá para saber pelo número; dá para saber pelo COSTUME:
//
//   · tem vírgula        -> a vírgula é o decimal, todo ponto é milhar
//                           ("1.234,56" = 1234.56)
//   · só pontos, e todos
//     os grupos depois do
//     primeiro têm 3 casas -> os pontos são milhar ("1.234" = 1234)
//   · um ponto só, com
//     grupo final != 3     -> o ponto é decimal ("1234.5" = 1234.5)
//
// É a mesma tabela de decisão que já roda no Apps Script da planilha
// (scripts/planilha/raro-sync.gs) — de propósito: o mesmo texto tem que virar
// o mesmo número dos dois lados da integração, senão o valor digitado no
// sistema e o valor lido da planilha divergem sem ninguém perceber.

/**
 * Converte texto de dinheiro em número. Devolve `null` quando o texto não é
 * um número (nunca 0, que é um valor legítimo e não pode se confundir com
 * "não entendi"). Texto vazio devolve `null` também — quem decide se vazio
 * vira zero é o formulário, não este módulo.
 */
export function dinheiroDeTexto(bruto: string): number | null {
  let s = String(bruto ?? "").trim();
  if (s === "") return null;

  // "R$", espaços (inclusive o não separável que vem de copiar e colar) e o
  // sinal tipográfico saem antes de qualquer análise.
  s = s
    .replace(/^-?\s*R\$\s*/i, (m) => (m.trim().startsWith("-") ? "-" : ""))
    .replace(/[\s ]/g, "")
    .replace(/[−–—]/g, "-");

  let negativo = false;
  if (s.startsWith("-")) {
    negativo = true;
    s = s.slice(1);
  }
  if (s.startsWith("+")) s = s.slice(1);
  if (s === "" || !/^[\d.,]+$/.test(s)) return null;

  let normalizado: string;
  if (s.includes(",")) {
    if (s.indexOf(",") !== s.lastIndexOf(",")) return null; // duas vírgulas não é número
    normalizado = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(".")) {
    const grupos = s.split(".");
    const pareceMilhar =
      /^\d{1,3}$/.test(grupos[0]) && grupos.slice(1).every((g) => /^\d{3}$/.test(g));
    if (pareceMilhar) normalizado = grupos.join("");
    else if (grupos.length === 2) normalizado = s;
    else return null; // "1.2.3" não é número nenhum
  } else {
    normalizado = s;
  }

  const n = Number(normalizado);
  if (!Number.isFinite(n)) return null;
  return negativo ? -n : n;
}

/**
 * A variante que os formulários usam: texto vazio vira o padrão (em geral 0),
 * texto inválido continua devolvendo `null` para a validação reclamar.
 */
export function dinheiroDeCampo(bruto: unknown, padrao = 0): number | null {
  if (bruto === undefined || bruto === null) return padrao;
  const texto = String(bruto).trim();
  if (texto === "") return padrao;
  return dinheiroDeTexto(texto);
}
