// Leitura das abas da planilha pelo endpoint publico gviz (CSV, sem login).
//
// MODULO NEUTRO (sem diretiva de cliente): estas funcoes usam fetch no servidor
// e sao consumidas por Server Components e por rotas de API.
//
// Principio que rege o arquivo inteiro: NADA AQUI LANCA. A planilha e um sistema
// de terceiro fora do nosso controle -- pode estar fora do ar, pode ter a aba
// renomeada, pode ter deixado de ser publica. Nenhuma dessas situacoes pode
// derrubar uma pagina do app com 500. O erro vira texto legivel dentro do
// resultado e a tela decide como mostrar que aquele bloco esta sem dado.

import { parseCsv, paraObjetos } from "@/lib/sheets/csv";
import { normalizar } from "@/lib/sheets/parse";
import { urlCsv } from "@/lib/sheets/config";

export type LeituraAba = {
  aba: string;
  linhas: Record<string, string>[];
  /** `null` quando deu certo. Texto pronto para a tela quando nao deu. */
  erro: string | null;
};

/**
 * Segundos de cache da resposta. Um minuto e o meio-termo: o dono lanca uma
 * venda e ve o painel mexer no minuto seguinte, e uma pagina com dez abas nao
 * dispara dez requisicoes ao Google a cada F5.
 */
const REVALIDAR_SEGUNDOS = 60;

/** A resposta veio em HTML (pagina de login/erro do Google) e nao em CSV? */
function pareceHtml(corpo: string): boolean {
  const inicio = corpo.trimStart().slice(0, 200).toLowerCase();
  return inicio.startsWith("<") || inicio.includes("<!doctype");
}

const AVISO_COMPARTILHAMENTO =
  "o Google respondeu com uma pagina em vez do CSV. Verifique se a planilha esta compartilhada como \"qualquer pessoa com o link\" e se o nome da aba esta correto.";

/**
 * Le uma aba inteira e devolve as linhas ja como objeto titulo -> valor cru.
 * NUNCA lanca: falha de rede, HTTP de erro, aba inexistente ou HTML no lugar do
 * CSV viram `{ linhas: [], erro: "..." }`.
 */
export async function lerAba(nome: string): Promise<LeituraAba> {
  try {
    const resposta = await fetch(urlCsv(nome), { next: { revalidate: REVALIDAR_SEGUNDOS } });

    if (!resposta.ok) {
      // 404 do gviz costuma significar aba inexistente; 401/403, planilha fechada.
      return {
        aba: nome,
        linhas: [],
        erro: `nao foi possivel ler a aba ${nome}: o Google respondeu ${resposta.status}. Confira se a aba existe e se a planilha esta publica.`,
      };
    }

    const corpo = await resposta.text();

    if (pareceHtml(corpo)) {
      return { aba: nome, linhas: [], erro: `nao foi possivel ler a aba ${nome}: ${AVISO_COMPARTILHAMENTO}` };
    }

    const matriz = parseCsv(corpo);
    if (matriz.length === 0) {
      return { aba: nome, linhas: [], erro: `a aba ${nome} voltou vazia (nem cabecalho).` };
    }

    return { aba: nome, linhas: paraObjetos(matriz), erro: null };
  } catch (e) {
    const detalhe = e instanceof Error ? e.message : String(e);
    return { aba: nome, linhas: [], erro: `falha de rede ao ler a aba ${nome}: ${detalhe}` };
  }
}

/**
 * Le varias abas EM PARALELO. Uma tela de fechamento precisa de VENDAS,
 * RECEBIVEIS e DESPESAS ao mesmo tempo; em serie seriam tres esperas somadas.
 * Como `lerAba` nunca lanca, o `Promise.all` tambem nunca rejeita: uma aba que
 * falhou aparece no resultado com o seu proprio erro, e as demais seguem.
 */
export async function lerAbas(nomes: string[]): Promise<Record<string, LeituraAba>> {
  const resultados = await Promise.all(nomes.map((nome) => lerAba(nome)));
  const mapa: Record<string, LeituraAba> = {};
  for (const r of resultados) mapa[r.aba] = r;
  return mapa;
}

/** Celula da coluna `c` da linha, ja sem sobra nas pontas. */
function celula(linha: string[] | undefined, c: number): string {
  return (linha?.[c] ?? "").trim();
}

/**
 * Le a aba CONFIG, que NAO tem cabecalho na primeira linha (ela traz um titulo
 * em A1), por isso a leitura pede `comCabecalho = false` -- deixar o gviz tratar
 * a linha 1 como cabecalho descartaria uma linha de dado e nomearia as colunas
 * com o titulo.
 *
 * Como as listas sao encontradas: procura-se a linha que contem a celula
 * `Status_Venda`. Essa e a linha de cabecalhos das listas de validacao -- ancorar
 * numa celula CONHECIDA aguenta o dono inserir linhas acima sem quebrar nada,
 * o que um indice fixo nao aguentaria. Cada coluna dessa linha vira uma lista
 * com os valores nao vazios abaixo dela.
 *
 * Os PARAMETROS ficam num bloco de duas colunas (rotulo, valor) sob o cabecalho
 * `PARAMETROS`, na mesma linha de ancora. Hoje sao `Aliquota de imposto` = 6,0%,
 * `Caixa atual (R$)` = R$ 0,00 e `Meses do periodo` = 1. Os valores voltam como
 * TEXTO CRU: quem consome decide se converte com `lerPercentual` ou `lerNumero`.
 */
export async function lerConfig(): Promise<{
  listas: Record<string, string[]>;
  parametros: Record<string, string>;
  erro: string | null;
}> {
  const vazio = { listas: {} as Record<string, string[]>, parametros: {} as Record<string, string> };

  let matriz: string[][];
  try {
    const resposta = await fetch(urlCsv("CONFIG", false), { next: { revalidate: REVALIDAR_SEGUNDOS } });
    if (!resposta.ok) {
      return { ...vazio, erro: `nao foi possivel ler a aba CONFIG: o Google respondeu ${resposta.status}.` };
    }
    const corpo = await resposta.text();
    if (pareceHtml(corpo)) {
      return { ...vazio, erro: `nao foi possivel ler a aba CONFIG: ${AVISO_COMPARTILHAMENTO}` };
    }
    matriz = parseCsv(corpo);
  } catch (e) {
    const detalhe = e instanceof Error ? e.message : String(e);
    return { ...vazio, erro: `falha de rede ao ler a aba CONFIG: ${detalhe}` };
  }

  const linhaCabecalho = matriz.findIndex((linha) =>
    linha.some((c) => normalizar(c) === "status_venda")
  );
  if (linhaCabecalho < 0) {
    return {
      ...vazio,
      erro: "a aba CONFIG nao tem a celula Status_Venda, que e a ancora dos cabecalhos das listas. O layout da aba mudou.",
    };
  }

  const cabecalhos = matriz[linhaCabecalho];

  // coluna do bloco de parametros; -1 quando o bloco nao existe na aba.
  const colParametros = cabecalhos.findIndex((c) => normalizar(c) === "parametros");

  // as colunas ocupadas pelo bloco de parametros nao viram lista de validacao:
  // o par rotulo/valor nao e um dominio de valores.
  const colunasDoBloco = new Set<number>();
  if (colParametros >= 0) {
    colunasDoBloco.add(colParametros);
    colunasDoBloco.add(colParametros + 1);
    colunasDoBloco.add(colParametros + 2);
  }

  const listas: Record<string, string[]> = {};
  for (let c = 0; c < cabecalhos.length; c++) {
    const titulo = celula(cabecalhos, c);
    if (titulo === "" || colunasDoBloco.has(c)) continue;
    const valores: string[] = [];
    for (let l = linhaCabecalho + 1; l < matriz.length; l++) {
      const valor = celula(matriz[l], c);
      if (valor !== "") valores.push(valor);
    }
    listas[titulo] = valores;
  }

  const parametros: Record<string, string> = {};
  if (colParametros >= 0) {
    for (let l = linhaCabecalho + 1; l < matriz.length; l++) {
      // o bloco e tolerante quanto a coluna exata: o rotulo pode estar sob o
      // proprio cabecalho PARAMETROS ou na coluna seguinte (o dono mescla a
      // celula do titulo). Vale o par de celulas preenchidas dentro da janela.
      const janela = [
        celula(matriz[l], colParametros),
        celula(matriz[l], colParametros + 1),
        celula(matriz[l], colParametros + 2),
      ].filter((v) => v !== "");
      if (janela.length !== 2) continue;
      parametros[janela[0]] = janela[1];
    }
  }

  return { listas, parametros, erro: null };
}
