// Testes do token de proposta.
//
// O QUE ESTA SUÍTE PROVA
// ----------------------
// 1) entrada fraca não vira token fraco EM SILÊNCIO: menos de 16 bytes,
//    bytes zerados e tipo errado lançam;
// 2) `gerarToken` é determinística — mesma entrada, mesma saída. É o que
//    torna a função testável sem sortear nada aqui dentro;
// 3) o token gerado sempre passa em `tokenValido` e sempre cabe no `check`
//    da coluna (migração 0025) — a porta e a parede combinam;
// 4) `tokenValido` recusa curto, `/`, `+`, `%`, `..`, espaço, quebra de
//    linha, vazio e null;
// 5) o módulo não usa `Math.random` nem `Date.now` — conferido no FONTE, sem
//    contar os comentários.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BYTES_MINIMOS,
  CARACTERES_MINIMOS,
  FORMATO_TOKEN,
  gerarToken,
  tokenValido,
} from "./proposta-token";

/** 16 bytes previsíveis — o ponto é justamente não sortear no teste. */
function bytes(inicio = 1, tamanho = BYTES_MINIMOS): Uint8Array {
  return Uint8Array.from({ length: tamanho }, (_, i) => (inicio + i * 7) % 256);
}

function fonteSemComentarios(arquivo: string): string {
  const src = readFileSync(join(process.cwd(), "src", "lib", "comercial", arquivo), "utf8");
  return src
    .split("\n")
    .filter((linha) => !linha.trimStart().startsWith("//") && !linha.trimStart().startsWith("*"))
    .join("\n");
}

describe("gerarToken — a entrada manda", () => {
  it("menos de 16 bytes LANÇA, em vez de gerar um token curto", () => {
    // Gerar assim mesmo seria o pior dos mundos: um link adivinhável com
    // aparência de link seguro.
    for (const tamanho of [0, 1, 8, BYTES_MINIMOS - 1]) {
      expect(() => gerarToken(new Uint8Array(tamanho).fill(9)), `esperava lançar com ${tamanho} bytes`).toThrow();
    }
  });

  it("bytes todos zerados LANÇAM — é o retrato de um buffer não inicializado", () => {
    expect(() => gerarToken(new Uint8Array(BYTES_MINIMOS))).toThrow();
    expect(() => gerarToken(new Uint8Array(32))).toThrow();
  });

  it("o que não é Uint8Array LANÇA", () => {
    for (const entrada of [null, undefined, "abc", 16, [1, 2, 3], {}]) {
      expect(() => gerarToken(entrada as unknown as Uint8Array)).toThrow();
    }
  });

  it("um Array comum do tamanho certo TAMBÉM lança — e é o caso que importa", () => {
    // Os outros lançam de qualquer jeito, por tamanho ou por não ter
    // `.every`. Este passaria por todas as checagens e geraria token: um
    // Array aceita 300, aceita 1.5 e aceita negativo, e qualquer um dos três
    // faz a conversão devolver outra coisa. Sem esta asserção, a checagem de
    // tipo era código que nenhum mutante derrubava.
    const disfarce = Array.from({ length: 16 }, (_, i) => i + 1);
    expect(() => gerarToken(disfarce as unknown as Uint8Array)).toThrow();
  });

  it("entrada exagerada também LANÇA — o token tem que caber no check da coluna", () => {
    expect(() => gerarToken(new Uint8Array(200).fill(7))).toThrow();
  });

  it("com 16 bytes, gera e o token é válido", () => {
    const token = gerarToken(bytes());
    expect(token.length).toBeGreaterThanOrEqual(CARACTERES_MINIMOS);
    expect(tokenValido(token)).toBe(true);
  });
});

describe("gerarToken — determinística e distinta", () => {
  it("os mesmos bytes dão o mesmo token, sempre", () => {
    expect(gerarToken(bytes())).toBe(gerarToken(bytes()));
  });

  it("bytes diferentes dão tokens diferentes", () => {
    const vistos = new Set<string>();
    for (let i = 1; i <= 40; i += 1) vistos.add(gerarToken(bytes(i)));
    expect(vistos.size).toBe(40);
  });

  it("um único byte diferente já muda o token", () => {
    const a = bytes();
    const b = bytes();
    b[b.length - 1] = (b[b.length - 1] + 1) % 256;
    expect(gerarToken(a)).not.toBe(gerarToken(b));
  });

  it("o preenchimento à esquerda é com o DÍGITO ZERO, e o valor é o de sempre", () => {
    // 15 bytes zerados e um 1 no fim valem o número 1. Em base62 isso é "1",
    // e o token é esse 1 com 21 zeros na frente. Fixar o texto inteiro trava
    // três coisas de uma vez: a base, a ordem do alfabeto e o caractere de
    // preenchimento — encher com qualquer outro dígito faria dois números
    // diferentes poderem virar o mesmo token.
    const quaseZero = new Uint8Array(16);
    quaseZero[15] = 1;
    expect(gerarToken(quaseZero)).toBe("0".repeat(21) + "1");

    // E o 62 é o 62: o número 62 vira "10".
    const sessentaEDois = new Uint8Array(16);
    sessentaEDois[15] = 62;
    expect(gerarToken(sessentaEDois)).toBe("0".repeat(20) + "10");
  });

  it("cada byte vale 256 vezes o seguinte — a posição é o valor", () => {
    // O byte 14 valendo 1 é o número 256, que em base62 é "48" (4*62 + 8).
    // Sem esta asserção, deslocar 4 bits em vez de 8 passaria despercebido —
    // e deslocar 4 faz o pedaço alto de um byte se misturar com o pedaço
    // baixo do anterior, ou seja, dois conjuntos de bytes diferentes podendo
    // virar o MESMO token. Foi o que um mutante mostrou.
    const duzentosECinquentaESeis = new Uint8Array(16);
    duzentosECinquentaESeis[14] = 1;
    expect(gerarToken(duzentosECinquentaESeis)).toBe("0".repeat(20) + "48");
  });

  it("byte zerado NO MEIO é normal — o que é proibido é tudo zerado", () => {
    const comZero = bytes();
    comZero[3] = 0;
    comZero[9] = 0;
    expect(() => gerarToken(comZero)).not.toThrow();
    expect(tokenValido(gerarToken(comZero))).toBe(true);
  });

  it("mais bytes, token maior — e ainda dentro do limite", () => {
    const curto = gerarToken(bytes(1, 16));
    const longo = gerarToken(bytes(1, 48));
    expect(longo.length).toBeGreaterThan(curto.length);
    expect(tokenValido(longo)).toBe(true);
  });

  it("todo token gerado é base62 puro — nada de +, / ou =", () => {
    // Base64 traria os três, e um deles dentro de uma URL vira outro
    // caractere no caminho. É por isso que o alfabeto aqui é 62.
    for (let i = 1; i <= 25; i += 1) {
      expect(gerarToken(bytes(i))).toMatch(/^[0-9A-Za-z]+$/);
    }
  });
});

describe("tokenValido — a forma antes do banco", () => {
  const bom = gerarToken(bytes());

  it("aceita um token gerado aqui", () => {
    expect(tokenValido(bom)).toBe(true);
  });

  it("recusa o que não é texto", () => {
    for (const valor of [null, undefined, 12345, {}, [], true]) {
      expect(tokenValido(valor), `esperava recusar ${JSON.stringify(valor)}`).toBe(false);
    }
  });

  it("não converte nada para texto — objeto com toString bonito continua recusado", () => {
    // Sem a checagem de tipo, `FORMATO_TOKEN.test(valor)` converteria o
    // objeto para texto e aceitaria. O token tem que CHEGAR como texto.
    const disfarce = { toString: () => "a".repeat(CARACTERES_MINIMOS) };
    expect(tokenValido(disfarce)).toBe(false);
  });

  it("recusa vazio e curto", () => {
    expect(tokenValido("")).toBe(false);
    expect(tokenValido(" ")).toBe(false);
    expect(tokenValido("a".repeat(CARACTERES_MINIMOS - 1))).toBe(false);
    // E aceita exatamente no limite: a régua não pode ser mais rígida que a
    // do banco, ou um token legítimo bateria na porta e voltaria.
    expect(tokenValido("a".repeat(CARACTERES_MINIMOS))).toBe(true);
  });

  it("recusa caractere que não é base62", () => {
    const base = "a".repeat(CARACTERES_MINIMOS);
    for (const sujeira of ["/", "+", "%", "..", " ", "\n", "\t", "-", "_", "=", "?", "#", "'", '"', ";"]) {
      expect(tokenValido(base + sujeira), `esperava recusar com ${JSON.stringify(sujeira)}`).toBe(false);
      expect(tokenValido(sujeira + base), `esperava recusar com ${JSON.stringify(sujeira)} na frente`).toBe(false);
    }
  });

  it("recusa quebra de linha no FIM — o clássico que `$` deixa passar em outras linguagens", () => {
    expect(tokenValido("a".repeat(CARACTERES_MINIMOS) + "\n")).toBe(false);
  });

  it("recusa token longo demais", () => {
    expect(tokenValido("a".repeat(128))).toBe(true);
    expect(tokenValido("a".repeat(129))).toBe(false);
  });
});

describe("a porta e a parede combinam", () => {
  it("o formato daqui é o MESMO check que está na coluna (0025)", () => {
    // Se as duas réguas divergirem, ou o banco recusa token que a tela
    // aceitou (erro cru na cara do vendedor), ou a tela deixa passar o que o
    // banco recusa. A asserção lê a migração de verdade.
    const migracao = readFileSync(
      join(process.cwd(), "supabase", "migrations", "0025_comercial_proposta.sql"),
      "utf8",
    );
    const naColuna = /check \(token ~ '(\^\[0-9A-Za-z\]\{\d+,\d+\}\$)'\)/.exec(migracao);
    expect(naColuna, "esperava o check de formato do token em 0025").not.toBeNull();
    expect(FORMATO_TOKEN.source).toBe(naColuna![1]);
  });

  it("o mínimo daqui é o mínimo de lá", () => {
    expect(FORMATO_TOKEN.source).toContain(`{${CARACTERES_MINIMOS},`);
  });
});

describe("o módulo não sorteia e não olha o relógio", () => {
  it("não há Math.random nem Date.now no fonte", () => {
    // Conferido sem os comentários: o cabeçalho FALA de `Math.random` para
    // explicar por que ele não está aqui, e uma busca ingênua acharia
    // justamente a frase que promete o contrário.
    const fonte = fonteSemComentarios("proposta-token.ts");
    expect(fonte).not.toContain("Math.random");
    expect(fonte).not.toContain("Date.now");
    expect(fonte).not.toContain("new Date");
    expect(fonte).not.toContain("crypto");
  });

  it("o token não deriva de id, e-mail, nome nem data — a função só recebe bytes", () => {
    // Aridade 1, e o parâmetro é o acaso. Não há por onde entrar um dado do
    // cliente: link de proposta adivinhável é o pipeline inteiro na mão de
    // quem chutar.
    expect(gerarToken.length).toBe(1);
  });
});
