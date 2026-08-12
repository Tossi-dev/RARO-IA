// Leitor de CSV no padrao RFC 4180, escrito a mao.
//
// MODULO NEUTRO (sem diretiva de cliente): parser puro, sem dependencia de
// runtime, consumido por Server Components e por rotas de API.
//
// Por que um automato de caracteres e nao uma expressao regular: o gviz devolve
// campos entre aspas que contem virgula, aspas escapadas e ate quebra de linha
// (uma observacao digitada com Enter dentro da celula). Regex sobre isso erra em
// silencio -- desloca uma coluna e o valor da venda vira o nome do responsavel.

/**
 * Quebra o texto CSV em matriz de celulas cruas (sem trim, sem conversao).
 * Regras cobertas: campo entre aspas pode conter virgula e quebra de linha;
 * `""` dentro de campo entre aspas e uma aspa literal; aceita `\r\n` e `\n`;
 * a ultima linha conta mesmo sem quebra final.
 */
export function parseCsv(texto: string): string[][] {
  if (!texto) return [];

  const linhas: string[][] = [];
  let campos: string[] = [];
  let campo = "";
  let dentroDeAspas = false;
  // marca que a linha atual ja tem conteudo: distingue "arquivo terminou com
  // quebra de linha" (nao ha linha extra) de "ultima linha sem quebra final".
  let linhaIniciada = false;

  // o gviz costuma mandar BOM; se ele sobreviver, o primeiro titulo vira "﻿ID".
  let i = texto.charCodeAt(0) === 0xfeff ? 1 : 0;

  const fecharLinha = () => {
    campos.push(campo);
    linhas.push(campos);
    campos = [];
    campo = "";
    linhaIniciada = false;
  };

  for (; i < texto.length; i++) {
    const c = texto[i];

    if (dentroDeAspas) {
      if (c === '"') {
        // duas aspas seguidas dentro do campo = uma aspa literal
        if (texto[i + 1] === '"') {
          campo += '"';
          i++;
        } else {
          dentroDeAspas = false;
        }
      } else {
        campo += c;
      }
      continue;
    }

    if (c === '"') {
      dentroDeAspas = true;
      linhaIniciada = true;
      continue;
    }
    if (c === ",") {
      campos.push(campo);
      campo = "";
      linhaIniciada = true;
      continue;
    }
    if (c === "\r") {
      // \r\n conta como UMA quebra
      if (texto[i + 1] === "\n") i++;
      fecharLinha();
      continue;
    }
    if (c === "\n") {
      fecharLinha();
      continue;
    }

    campo += c;
    linhaIniciada = true;
  }

  if (linhaIniciada || campo !== "" || campos.length > 0) fecharLinha();

  return linhas;
}

/**
 * Primeira linha vira cabecalho; as demais viram objeto titulo -> valor.
 *
 * Duas defesas que a planilha real exige:
 *  - linha totalmente vazia e DESCARTADA. A aba tem centenas de linhas em branco
 *    depois dos dados; sem o filtro o sistema conta linha vazia como registro e
 *    o painel exibe "412 vendas" onde ha 37.
 *  - titulo repetido mantem o primeiro e sufixa os seguintes com _2, _3. Sem
 *    isso a segunda coluna homonima sobrescreve a primeira e o dado some.
 */
export function paraObjetos(linhas: string[][]): Record<string, string>[] {
  const cabecalho = linhas[0];
  if (!cabecalho) return [];

  const vistos = new Map<string, number>();
  const titulos = cabecalho.map((bruto) => {
    const titulo = bruto.trim();
    const quantas = vistos.get(titulo) ?? 0;
    vistos.set(titulo, quantas + 1);
    return quantas === 0 ? titulo : `${titulo}_${quantas + 1}`;
  });

  const objetos: Record<string, string>[] = [];
  for (let i = 1; i < linhas.length; i++) {
    const linha = linhas[i];
    if (!linha.some((celula) => celula.trim() !== "")) continue;
    const objeto: Record<string, string> = {};
    for (let c = 0; c < titulos.length; c++) objeto[titulos[c]] = linha[c] ?? "";
    objetos.push(objeto);
  }
  return objetos;
}
