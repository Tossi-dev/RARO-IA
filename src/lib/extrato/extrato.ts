// Leitura de extrato bancário → lançamentos, em código puro (sem API de banco).
// Orquestra os três leitores de formato (OFX, CSV, texto colado) e concentra a
// regra mais sensível de toda a feature: a impressão digital.
//
// Por que a digital importa tanto: reenviar um extrato que se sobrepõe ao
// anterior é o uso NORMAL do cliente (semanal em cima de diário, mensal em
// cima de semanal). Se duplicar lançamento, o caixa fica errado e ninguém
// percebe até fechar o mês — por isso a digital tem que ser estável entre
// formatos diferentes do MESMO banco e determinística entre execuções.

import { sugerirCategoria } from "./classificar";
import { lerCsv } from "./ler-csv";
import { lerOfx } from "./ler-ofx";
import { lerTexto } from "./ler-texto";
import type { CategoriaCaixa } from "../types";

export type OrigemExtrato = "ofx" | "csv" | "texto";

export interface LinhaExtrato {
  data: string; // ISO aaaa-mm-dd
  descricao: string;
  valor: number; // positivo entra, negativo sai
  tipo: "entrada" | "saida";
  documento: string; // FITID ou doc do banco, "" quando não houver
  impressaoDigital: string;
  // Nasce aqui como SUGESTÃO (ver sugerirCategoria em ./classificar), não como
  // fato: é o único jeito de a tela de conferência ter uma categoria para
  // pré-marcar em cada linha sem duplicar a regra de palpite em dois lugares.
  // O dono confere e troca o que estiver errado antes de qualquer coisa ir
  // para o caixa — LinhaEditavel (extrato-importar.tsx) é essa mesma linha
  // depois de passar pela decisão humana.
  categoria: CategoriaCaixa;
}

export interface LeituraExtrato {
  linhas: LinhaExtrato[];
  naoEntendidas: string[];
  origem: OrigemExtrato;
  periodo: { inicio: string; fim: string } | null;
}

/**
 * Formato intermediário que cada leitor de formato (ler-ofx, ler-csv,
 * ler-texto) devolve — tudo que dá para extrair do arquivo, antes de a
 * impressão digital ser calculada aqui, num lugar só.
 */
export interface LinhaBruta {
  data: string;
  descricao: string;
  valor: number;
  tipo: "entrada" | "saida";
  documento: string;
}

/** Resultado que cada leitor de formato devolve à orquestração. */
export interface ResultadoLeitura {
  linhas: LinhaBruta[];
  naoEntendidas: string[];
}

/**
 * Minúscula, sem acento, sem pontuação, espaços colapsados — a mesma
 * descrição escrita de jeitos ligeiramente diferentes por bancos diferentes
 * (ou pelo mesmo banco em OFX vs CSV) precisa cair na mesma chave.
 */
function normalizarDescricao(txt: string): string {
  return txt
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * A digital é a chave de deduplicação entre envios de extrato sobrepostos.
 * - com documento (FITID/doc do banco): a digital usa só o documento, porque
 *   ele já é único por banco — não entra data/valor/descrição na conta, então
 *   o mesmo lançamento lido de formatos diferentes do mesmo banco (OFX e CSV,
 *   por exemplo) cai na mesma digital mesmo com pequenas diferenças de
 *   formatação entre os dois arquivos.
 * - sem documento: cai em data + valor em centavos (evita ponto flutuante) +
 *   descrição normalizada. Sem Math.random, sem Date.now, sem depender de
 *   ordem de chave — puro e estável entre execuções.
 */
export function calcularImpressaoDigital(linha: LinhaBruta): string {
  const documento = linha.documento.trim();
  if (documento) {
    return `doc:${documento.toLowerCase()}`;
  }
  const centavos = Math.round(linha.valor * 100);
  return `sd:${linha.data}:${centavos}:${normalizarDescricao(linha.descricao)}`;
}

/**
 * Auto-detecção de formato, usada quando quem chama não sabe (ou não quer
 * informar) a origem do arquivo. OFX é marcação, então basta achar a
 * assinatura; CSV precisa de pelo menos duas colunas (2+ delimitadores) na
 * primeira linha não vazia; o resto é texto colado.
 */
export function detectarOrigem(conteudo: string): OrigemExtrato {
  const inicio = conteudo.slice(0, 4000);
  if (/ofxheader|<ofx>|<stmttrn/i.test(inicio)) return "ofx";

  const primeiraLinha = conteudo.split(/\r?\n/).find((l) => l.trim().length > 0) ?? "";
  const delimitadores = primeiraLinha.match(/[;,\t]/g) ?? [];
  if (delimitadores.length >= 2) return "csv";

  return "texto";
}

function minimo(datas: string[]): string {
  return datas.reduce((a, b) => (b < a ? b : a));
}

function maximo(datas: string[]): string {
  return datas.reduce((a, b) => (b > a ? b : a));
}

/**
 * Ponto único de entrada da feature. Sem `origem`, detecta sozinha; com
 * `origem`, respeita a escolha de quem chama (útil quando o dono confirma o
 * tipo de arquivo na tela de importação).
 */
export function lerExtrato(conteudo: string, origem?: OrigemExtrato): LeituraExtrato {
  const origemFinal = origem ?? detectarOrigem(conteudo);

  const resultado: ResultadoLeitura =
    origemFinal === "ofx"
      ? lerOfx(conteudo)
      : origemFinal === "csv"
        ? lerCsv(conteudo)
        : lerTexto(conteudo);

  const linhas: LinhaExtrato[] = resultado.linhas.map((linha) => ({
    ...linha,
    impressaoDigital: calcularImpressaoDigital(linha),
    categoria: sugerirCategoria(linha.descricao, linha.tipo),
  }));

  const datas = linhas.map((l) => l.data);
  const periodo = datas.length === 0 ? null : { inicio: minimo(datas), fim: maximo(datas) };

  return { linhas, naoEntendidas: resultado.naoEntendidas, origem: origemFinal, periodo };
}

/**
 * Separa, de forma pura e determinística, quais linhas já foram gravadas
 * antes (digital presente em `digitaisConhecidas`) das que ainda são novas.
 * Duas garantias importam aqui, porque é este código que impede duplicar
 * lançamento quando o dono reenvia um extrato que se sobrepõe ao anterior:
 *
 *  1. contra o que já está no banco — `digitaisConhecidas` é o extrato já
 *     gravado antes;
 *  2. dentro do PRÓPRIO lote — se a mesma digital aparecer duas vezes no
 *     arquivo lido agora (ex.: extrato colado com uma linha repetida), só a
 *     primeira ocorrência conta como nova; a segunda entra como duplicada,
 *     porque a primeira já teria sido gravada antes dela na mesma chamada.
 *
 * Genérica em cima de `{ impressaoDigital }` de propósito: tanto
 * `LinhaExtrato` quanto a linha editável da tela (que carrega a categoria
 * escolhida pelo dono) passam por aqui sem conversão.
 */
export function separarNovasDeDuplicadas<T extends { impressaoDigital: string }>(
  linhas: T[],
  digitaisConhecidas: Iterable<string>
): { novas: T[]; duplicadas: T[] } {
  const vistas = new Set(digitaisConhecidas);
  const novas: T[] = [];
  const duplicadas: T[] = [];
  for (const linha of linhas) {
    if (vistas.has(linha.impressaoDigital)) {
      duplicadas.push(linha);
      continue;
    }
    vistas.add(linha.impressaoDigital);
    novas.push(linha);
  }
  return { novas, duplicadas };
}
