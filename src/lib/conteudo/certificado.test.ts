// Testes de `gerarCodigo` e `codigoValido` — o código de verificação de um
// certificado.
//
// O QUE ESTA SUÍTE PROVA
// ----------------------
// 1) O ALFABETO NÃO TEM CARACTERE AMBÍGUO. Este código vai ser LIDO EM VOZ
//    ALTA e DIGITADO por alguém olhando para um papel ou um PDF: `0` e `O`,
//    `1` e `I` e `l` são a diferença entre "seu certificado é válido" e "não
//    encontramos esse código";
// 2) O MÓDULO NÃO SORTEIA SOZINHO. A fonte de aleatoriedade entra por
//    parâmetro — sem isso o teste não teria como fixar a saída, e o módulo
//    deixaria de ser puro;
// 3) O CÓDIGO NÃO É DERIVADO DE NADA. Não sai do `mentorado_id`, nem de
//    contador, nem da data. Código adivinhável é o mesmo buraco de um link de
//    proposta sequencial: quem tem o próprio código descobre o dos outros.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ALFABETO_CODIGO,
  TAMANHO_CODIGO,
  codigoValido,
  gerarCodigo,
  normalizarCodigo,
} from "./certificado";

/** Uma fonte determinística, para o teste poder afirmar a saída exata. */
function fonteFixa(valores: readonly number[]): () => number {
  let i = 0;
  return () => valores[i++ % valores.length];
}

describe("o alfabeto", () => {
  it.each([["0"], ["O"], ["1"], ["I"], ["l"]])("não contém %j", (char) => {
    expect(ALFABETO_CODIGO).not.toContain(char);
  });

  it("é só maiúscula e dígito, sem repetição", () => {
    expect(ALFABETO_CODIGO).toMatch(/^[A-Z2-9]+$/);
    expect(new Set(ALFABETO_CODIGO).size).toBe(ALFABETO_CODIGO.length);
  });

  it("tem tamanho suficiente para o código não ser adivinhável", () => {
    // 32 símbolos em 12 posições passam de 10^18 combinações. Um alfabeto
    // pequeno demais tornaria a força bruta viável numa página pública de
    // verificação.
    expect(ALFABETO_CODIGO.length).toBeGreaterThanOrEqual(30);
    expect(TAMANHO_CODIGO).toBe(12);
  });
});

describe("gerarCodigo", () => {
  it("tem sempre 12 caracteres, todos do alfabeto", () => {
    const codigo = gerarCodigo(fonteFixa([0.1, 0.5, 0.9, 0.33, 0.66, 0.01]));

    expect(codigo).toHaveLength(TAMANHO_CODIGO);
    for (const char of codigo) expect(ALFABETO_CODIGO).toContain(char);
    expect(codigoValido(codigo)).toBe(true);
  });

  it("fontes diferentes produzem códigos diferentes", () => {
    const a = gerarCodigo(fonteFixa([0.1]));
    const b = gerarCodigo(fonteFixa([0.9]));

    expect(a).not.toBe(b);
  });

  it("a mesma fonte produz o mesmo código — é isso que o torna testável", () => {
    expect(gerarCodigo(fonteFixa([0.42]))).toBe(gerarCodigo(fonteFixa([0.42])));
  });

  it("consome a fonte uma vez por caractere", () => {
    let chamadas = 0;
    gerarCodigo(() => {
      chamadas += 1;
      return 0.5;
    });

    expect(chamadas).toBe(TAMANHO_CODIGO);
  });

  // Uma fonte torta não pode produzir código torto: o valor cai fora da
  // faixa, o índice sai do alfabeto, e o código sairia com `undefined` no
  // meio. Melhor um código válido de uma fonte ruim que um código inválido
  // gravado num certificado.
  it.each([[Number.NaN], [-1], [1], [2], [Number.POSITIVE_INFINITY]])(
    "fonte devolvendo %p ainda produz código válido",
    (valor) => {
      const codigo = gerarCodigo(fonteFixa([valor]));

      expect(codigo).toHaveLength(TAMANHO_CODIGO);
      expect(codigoValido(codigo)).toBe(true);
    },
  );

  it("usa o alfabeto inteiro, não só o começo", () => {
    // Uma implementação que multiplicasse errado (por exemplo, pelo tamanho
    // menos um, ou por uma constante fixa) nunca alcançaria o último símbolo.
    const primeiro = gerarCodigo(fonteFixa([0]));
    const ultimo = gerarCodigo(fonteFixa([0.999999]));

    expect(primeiro).toBe(ALFABETO_CODIGO[0].repeat(TAMANHO_CODIGO));
    expect(ultimo).toBe(ALFABETO_CODIGO[ALFABETO_CODIGO.length - 1].repeat(TAMANHO_CODIGO));
  });
});

describe("codigoValido", () => {
  const bom = gerarCodigo(fonteFixa([0.1, 0.4, 0.7]));

  it("aceita um código recém-gerado", () => {
    expect(codigoValido(bom)).toBe(true);
  });

  it.each([
    ["", "vazio"],
    ["   ", "só espaço"],
    ["ABC", "curto demais"],
    ["ABCDEFGHJKLMN", "longo demais"],
    ["ABCDEFGH JKL", "com espaço no meio"],
    ["ABCDEFGHJKL0", "com o zero, que não está no alfabeto"],
    ["ABCDEFGHJKLO", "com a letra O"],
    ["ABCDEFGHJKL1", "com o um"],
    ["ABCDEFGHJKLI", "com a letra I"],
    ["abcdefghjklm", "minúsculo"],
    ["ABCDEFGHJK-L", "com hífen"],
    ["ABCDEFGHJKL\n", "com quebra de linha"],
  ])("recusa %j (%s)", (texto) => {
    expect(codigoValido(texto)).toBe(false);
  });

  it.each([[null], [undefined], [42], [{}], [[]]])("recusa %p sem lançar", (valor) => {
    expect(codigoValido(valor as unknown as string)).toBe(false);
  });

  // O caso que a guarda de tipo existe para pegar, e que não é teórico:
  // `RegExp#test` COAGE o argumento para string, e um array de um elemento
  // vira o próprio elemento. Sem a guarda, `["CODIGO"]` passaria — e query
  // string com o parâmetro repetido (`?codigo=X&codigo=X`) chega como array
  // em vários frameworks.
  it("recusa um array contendo um código válido", () => {
    expect(codigoValido([bom] as unknown as string)).toBe(false);
    expect(codigoValido([bom, bom] as unknown as string)).toBe(false);
  });
});

describe("o módulo não sorteia sozinho", () => {
  it("o fonte não contém Math.random nem crypto", () => {
    const fonte = readFileSync(join(process.cwd(), "src/lib/conteudo/certificado.ts"), "utf8");
    // Sem os comentários: eles EXPLICAM por que `Math.random` não está aqui,
    // e a busca ingênua acharia a menção e passaria por acidente — o defeito
    // que já custou uma rodada nesta fase.
    const codigo = fonte
      .split("\n")
      .filter((l) => !l.trim().startsWith("*") && !l.trim().startsWith("//") && !l.trim().startsWith("/*"))
      .join("\n");

    expect(codigo).not.toContain("Math.random");
    expect(codigo).not.toContain("crypto");
    expect(codigo).not.toContain("Date.now");
    expect(codigo).not.toContain("new Date");
  });

  it("o código não é derivado de identificador nenhum", () => {
    // `gerarCodigo.length` era a asserção original daqui, e ela NÃO mordia:
    // um parâmetro com valor padrão não conta em `Function.length`, então um
    // segundo argumento derivado de contador passava batido.
    //
    // O que realmente prova a ausência de derivação são duas coisas juntas:
    // (1) a mesma fonte produz o mesmo código, sempre — um contador, um
    // relógio ou um id fariam a segunda chamada divergir (testado acima); e
    // (2) o módulo não guarda estado entre chamadas, que é do que um contador
    // precisaria. Esta asserção cobre a segunda.
    const fonte = readFileSync(join(process.cwd(), "src/lib/conteudo/certificado.ts"), "utf8");
    const linhasDeCodigo = fonte
      .split("\n")
      .filter((l) => !l.trim().startsWith("*") && !l.trim().startsWith("//") && !l.trim().startsWith("/*"));

    const estadoMutavelDeModulo = linhasDeCodigo.filter((l) => /^(let|var)\s/.test(l));
    expect(estadoMutavelDeModulo).toEqual([]);
  });
});

// Tarefa 31 — o que a página pública precisa para imprimir.
describe("normalizarCodigo", () => {
  it("arruma caixa e espaço, os dois desvios de quem copia de um papel", () => {
    expect(normalizarCodigo("  abc23456789k  ")).toBe("ABC23456789K");
    expect(normalizarCodigo("ABC23456789K")).toBe("ABC23456789K");
  });

  it("não conserta código torto — só normaliza ruído", () => {
    // Continua inválido depois de normalizado: quem decide é `codigoValido`.
    expect(codigoValido(normalizarCodigo("abc-234-567"))).toBe(false);
    expect(codigoValido(normalizarCodigo("0011223344ii"))).toBe(false);
    // E o que era válido continua válido.
    expect(codigoValido(normalizarCodigo("  abc23456789k "))).toBe(true);
  });

  it("qualquer coisa que não seja string vira vazio, sem lançar", () => {
    expect(normalizarCodigo(null)).toBe("");
    expect(normalizarCodigo(undefined)).toBe("");
    expect(normalizarCodigo(42)).toBe("");
    expect(normalizarCodigo(["ABC23456789K"])).toBe("");
  });
});
