// Leitor de CSV — cada banco tem o seu layout, então NADA aqui é fixo: as
// colunas são achadas pelo nome do cabeçalho (tolerando acento, maiúscula e
// variação de palavra) e o formato do número (ponto ou vírgula decimal) é
// decidido pelo padrão do arquivo INTEIRO, nunca linha a linha — "1.234"
// sozinho é ambíguo, mas o arquivo inteiro não é.

import type { ResultadoLeitura } from "./extrato";
import { normalizarSinais } from "./sinais";

type FormatoNumero = "BR" | "US";

/** Remove BOM e normaliza quebra de linha antes de processar. */
function limparConteudo(conteudo: string): string {
  return conteudo.replace(/^﻿/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function normalizarCabecalho(txt: string): string {
  return txt
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Divide uma linha CSV respeitando aspas (campo pode conter o delimitador entre aspas). */
function dividirLinha(linha: string, delimitador: string): string[] {
  const campos: string[] = [];
  let atual = "";
  let dentroAspas = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (c === '"') {
      if (dentroAspas && linha[i + 1] === '"') {
        atual += '"';
        i++;
      } else {
        dentroAspas = !dentroAspas;
      }
    } else if (c === delimitador && !dentroAspas) {
      campos.push(atual);
      atual = "";
    } else {
      atual += c;
    }
  }
  campos.push(atual);
  return campos.map((c) => c.trim());
}

/** Conta ocorrências de cada delimitador candidato numa linha e devolve o mais frequente. */
function detectarDelimitador(linha: string): string {
  const candidatos = [";", ",", "\t"];
  let melhor = ";";
  let maiorContagem = -1;
  for (const c of candidatos) {
    const contagem = linha.split(c).length - 1;
    if (contagem > maiorContagem) {
      maiorContagem = contagem;
      melhor = c;
    }
  }
  return melhor;
}

const PALAVRAS_CABECALHO = [
  "data",
  "dt", // "Dt. Movimento" — abreviação real usada por alguns bancos
  "valor",
  "descricao",
  "historico",
  "lancamento",
  "debito",
  "credito",
  "entrada",
  "saida",
  "documento",
  "identificador",
];

/**
 * Rodapés e cabeçalhos de relatório que o banco intercala com os lançamentos
 * de verdade (linha de "saldo do dia" no fim de cada dia, total do período no
 * fim do arquivo etc.). Não são lançamento nem lixo a reportar em
 * `naoEntendidas` — são ruído esperado do export, então são descartados em
 * silêncio, tanto faz se caem antes ou depois da linha de cabeçalho.
 */
const PALAVRAS_LINHA_IGNORAVEL = [
  "saldo anterior",
  "saldo do dia",
  "saldo atual",
  "saldo final",
  "saldo bloqueado",
  "saldo disponivel",
  "total do periodo",
  "total de creditos",
  "total de debitos",
  "extrato gerado em",
];

function ehLinhaIgnoravel(linhaOriginal: string): boolean {
  const norm = normalizarCabecalho(linhaOriginal);
  return PALAVRAS_LINHA_IGNORAVEL.some((p) => norm.includes(p));
}

/** Acha a linha de cabeçalho real, tolerando metadado antes dela (comum em export de banco). */
function acharLinhaCabecalho(linhas: string[]): number {
  const limite = Math.min(linhas.length, 15);
  let melhorIndice = 0;
  let melhorPontuacao = -1;
  for (let i = 0; i < limite; i++) {
    const norm = normalizarCabecalho(linhas[i]);
    if (!norm) continue;
    const pontuacao = PALAVRAS_CABECALHO.filter((p) => norm.includes(p)).length;
    if (pontuacao > melhorPontuacao) {
      melhorPontuacao = pontuacao;
      melhorIndice = i;
    }
  }
  return melhorPontuacao >= 2 ? melhorIndice : 0;
}

/** dd/mm/aaaa, dd/mm/aa ou aaaa-mm-dd — os três formatos de data que o cliente manda. */
function dataParaIso(bruto: string): string | null {
  const s = bruto.trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return validarData(m[1], m[2], m[3]);

  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return validarData(m[3], m[2], m[1]);

  m = s.match(/^(\d{2})\/(\d{2})\/(\d{2})$/);
  if (m) {
    // janela usual de século para ano de 2 dígitos: 00-69 → 20xx, 70-99 → 19xx.
    const aa = Number(m[3]);
    const ano = aa <= 69 ? 2000 + aa : 1900 + aa;
    return validarData(String(ano), m[2], m[1]);
  }

  return null;
}

function validarData(ano: string, mes: string, dia: string): string | null {
  const mesNum = Number(mes);
  const diaNum = Number(dia);
  if (mesNum < 1 || mesNum > 12 || diaNum < 1 || diaNum > 31) return null;
  return `${ano}-${mes}-${dia}`;
}

/**
 * Decide BR (1.234,56) ou US (1,234.56) olhando o arquivo inteiro: a primeira
 * amostra com ponto E vírgula juntos é conclusiva (o separador que aparece
 * por último é o decimal). Sem amostra conclusiva, vota pelo padrão de final
 * de string (",XX" só BR, ".XX" só US); sem nenhum sinal, o padrão é BR — o
 * cliente deste sistema é brasileiro.
 */
function detectarFormatoNumero(valores: string[]): FormatoNumero {
  for (const bruto of valores) {
    const s = bruto.trim();
    const iComma = s.lastIndexOf(",");
    const iDot = s.lastIndexOf(".");
    if (iComma !== -1 && iDot !== -1) {
      return iComma > iDot ? "BR" : "US";
    }
  }
  let votosBR = 0;
  let votosUS = 0;
  for (const bruto of valores) {
    const s = bruto.trim();
    if (/,\d{2}$/.test(s) && !s.includes(".")) votosBR++;
    else if (/\.\d{2}$/.test(s) && !s.includes(",")) votosUS++;
  }
  return votosUS > votosBR ? "US" : "BR";
}

function paraNumero(bruto: string, formato: FormatoNumero): number | null {
  // `normalizarSinais` ANTES de qualquer coisa: o Nubank escreve "−R$ 10,00"
  // com U+2212, e a limpeza logo abaixo apagaria esse sinal junto com o "R$",
  // transformando saída em entrada. Ver src/lib/extrato/sinais.ts.
  let s = normalizarSinais(bruto).trim();
  if (s === "") return 0;

  let negativo = false;
  if (/^\(.*\)$/.test(s)) {
    negativo = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[^\d,.\-+]/g, "");
  if (s.startsWith("-")) {
    negativo = true;
    s = s.slice(1);
  } else if (s.endsWith("-")) {
    negativo = true;
    s = s.slice(0, -1);
  }
  if (s.startsWith("+")) s = s.slice(1);
  // chegou aqui vazio, mas a célula original NÃO estava em branco (ex.: "abc")
  // — é lixo, não ausência de valor, então não pode virar zero silenciosamente.
  if (!s) return null;

  s = formato === "BR" ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negativo ? -n : n;
}

function achar(cabecalhos: string[], testar: (norm: string) => boolean): number {
  return cabecalhos.findIndex((c) => testar(normalizarCabecalho(c)));
}

function acharTodos(cabecalhos: string[], testar: (norm: string) => boolean): number[] {
  const fora: number[] = [];
  cabecalhos.forEach((c, i) => {
    if (testar(normalizarCabecalho(c))) fora.push(i);
  });
  return fora;
}

/**
 * Colunas cujo texto descreve o lançamento. Além das clássicas (histórico,
 * descrição), entram as que os bancos usam quando quebram a descrição em
 * pedaços: o TIPO da operação e a CONTRAPARTE.
 *
 * O que fica de fora, de propósito: "valor" (número, não texto), "data",
 * "hora", "documento" (já tem coluna própria) e "forma de pagamento" ("Com
 * saldo" repetido em toda linha só polui a leitura sem distinguir nada).
 */
const PALAVRAS_DESCRICAO = [
  "historico",
  "descricao",
  "tipo",
  "origem",
  "destino",
  "favorecido",
  "beneficiario",
  "contraparte",
  "estabelecimento",
  "detalhe",
  "observacao",
  "memo",
];

function ehColunaDescricao(n: string): boolean {
  if (n.includes("valor") || n.includes("data") || n.includes("documento")) return false;
  if (n.includes("forma") && n.includes("pagamento")) return false;
  if (n.includes("lancamento")) return true;
  return PALAVRAS_DESCRICAO.some((p) => n.includes(p));
}

export function lerCsv(conteudoBruto: string): ResultadoLeitura {
  const linhas: ResultadoLeitura["linhas"] = [];
  const naoEntendidas: string[] = [];

  const conteudo = limparConteudo(conteudoBruto);
  const todasLinhas = conteudo.split("\n").filter((l) => l.trim() !== "");
  if (todasLinhas.length === 0) return { linhas, naoEntendidas };

  const indiceCabecalho = acharLinhaCabecalho(todasLinhas);
  const delimitador = detectarDelimitador(todasLinhas[indiceCabecalho]);
  const cabecalhos = dividirLinha(todasLinhas[indiceCabecalho], delimitador);

  // "Data", "Data Lançamento" contêm "data"; "Dt. Movimento" não — daí o
  // segundo teste, com \b para não pegar "dt" solto dentro de outra palavra.
  const idxData = achar(cabecalhos, (n) => n.includes("data") || /\bdt\b/.test(n));
  // A descrição raramente vem numa coluna só. O extrato do Nubank, por
  // exemplo, não tem coluna "descrição" nenhuma: tem "tipo" ("Pix enviado") e
  // "origem / destino" (o nome da pessoa). Lidas isoladamente, nenhuma das
  // duas serve; juntas, viram "Pix enviado · FULANO DE TAL", que é
  // exatamente o que o dono lê no aplicativo do banco.
  //
  // Isso não é cosmético. A descrição alimenta (a) a sugestão de categoria e
  // (b) a impressão digital que impede o mesmo lançamento de entrar duas
  // vezes. Com descrição vazia, dois Pix do mesmo valor no mesmo dia viram a
  // MESMA digital, e o segundo é descartado como duplicata — dinheiro real
  // sumindo do caixa em silêncio.
  const idxsDescricao = acharTodos(cabecalhos, (n) => ehColunaDescricao(n));
  const idxDocumento = achar(
    cabecalhos,
    (n) => n.includes("documento") || n.includes("identificador") || /\bdoc\b/.test(n),
  );
  const idxDebito = achar(cabecalhos, (n) => n.includes("debito") || n.includes("saida"));
  const idxCredito = achar(cabecalhos, (n) => n.includes("credito") || n.includes("entrada"));
  const idxValor = achar(cabecalhos, (n) => n.includes("valor"));

  const linhasDados = todasLinhas.slice(indiceCabecalho + 1);
  const usaDuasColunas = idxDebito !== -1 && idxCredito !== -1;

  // sem coluna de data, ou sem nenhuma forma de achar o valor, o arquivo não
  // tem como ser lido linha a linha — cada linha de dado vira "não entendida".
  if (idxData === -1 || (!usaDuasColunas && idxValor === -1)) {
    for (const linha of linhasDados) naoEntendidas.push(linha.trim());
    return { linhas, naoEntendidas };
  }

  const celulasPorLinha = linhasDados.map((l) => dividirLinha(l, delimitador));

  const valoresParaDetectarFormato = usaDuasColunas
    ? celulasPorLinha
        .flatMap((c) => [c[idxDebito] ?? "", c[idxCredito] ?? ""])
        .filter((v) => v.trim() !== "")
    : celulasPorLinha.map((c) => c[idxValor] ?? "").filter((v) => v.trim() !== "");
  const formato = detectarFormatoNumero(valoresParaDetectarFormato);

  for (let i = 0; i < linhasDados.length; i++) {
    const linhaOriginal = linhasDados[i];
    const celulas = celulasPorLinha[i];

    // linha de saldo/rodapé de relatório: nem lançamento, nem erro — some em silêncio.
    if (ehLinhaIgnoravel(linhaOriginal)) continue;

    const data = dataParaIso(celulas[idxData] ?? "");
    if (!data) {
      naoEntendidas.push(linhaOriginal.trim());
      continue;
    }

    const descricao = idxsDescricao
      .map((idx) => (celulas[idx] ?? "").replace(/\s+/g, " ").trim())
      .filter((t) => t !== "")
      .join(" · ");
    const documento = idxDocumento === -1 ? "" : (celulas[idxDocumento] ?? "").trim();

    let valor: number | null;
    if (usaDuasColunas) {
      const debito = paraNumero(celulas[idxDebito] ?? "", formato);
      const credito = paraNumero(celulas[idxCredito] ?? "", formato);
      valor = debito === null || credito === null ? null : Math.abs(credito) - Math.abs(debito);
    } else {
      valor = paraNumero(celulas[idxValor] ?? "", formato);
    }

    if (valor === null) {
      naoEntendidas.push(linhaOriginal.trim());
      continue;
    }

    linhas.push({
      data,
      descricao,
      valor,
      tipo: valor < 0 ? "saida" : "entrada",
      documento,
    });
  }

  return { linhas: corrigirExtratoSemSinal(linhas), naoEntendidas };
}

/**
 * Palavras que dizem a DIREÇÃO do lançamento no texto do banco. Só as
 * inequívocas entram: "transferência" sozinha não diz se entrou ou saiu, e
 * palavra ambígua aqui vale menos que nenhuma.
 */
const PALAVRAS_SAIDA_TEXTO = [
  "enviado",
  "enviada",
  "pagamento realizado",
  "pagamento efetuado",
  "compra realizada",
  "compra no debito",
  "debito automatico",
  "saque",
  "tarifa",
  "transferencia enviada",
];
const PALAVRAS_ENTRADA_TEXTO = [
  "recebido",
  "recebida",
  "deposito",
  "estorno",
  "transferencia recebida",
  "credito em conta",
];

/**
 * Conserta o extrato que vem com TODOS os valores positivos e a direção
 * escondida no texto ("Pix enviado", "Compra realizada").
 *
 * Por que existe, e por que é tão travado: alguns bancos exportam o valor sem
 * sinal nenhum, contando que quem lê entenda pelo tipo da operação. Sem este
 * tratamento, um extrato desses entra inteiro como dinheiro recebido — o
 * mesmo estrago do bug do sinal tipográfico, por outra porta.
 *
 * As três travas, porque adivinhar direção de dinheiro é perigoso:
 *   1. Só age se NENHUMA linha do arquivo tiver valor negativo. Havendo um
 *      negativo sequer, o banco sabe usar sinal, e o sinal manda — sempre.
 *   2. Só age se a MAIORIA das linhas tiver uma palavra de direção. Um
 *      punhado de coincidências não autoriza reescrever o arquivo.
 *   3. Só mexe na linha cuja palavra é inequívoca. Linha sem palavra fica
 *      exatamente como estava, positiva.
 *
 * Um extrato de quem só recebeu dinheiro no mês passa por aqui sem nenhuma
 * alteração: as palavras dizem "recebido", a direção bate com o que já
 * estava, e nada muda.
 */
function corrigirExtratoSemSinal(
  linhas: ResultadoLeitura["linhas"]
): ResultadoLeitura["linhas"] {
  if (linhas.length === 0) return linhas;
  if (linhas.some((l) => l.valor < 0)) return linhas;

  const direcao = linhas.map((l) => {
    const d = normalizarCabecalho(l.descricao);
    if (PALAVRAS_SAIDA_TEXTO.some((p) => d.includes(p))) return "saida" as const;
    if (PALAVRAS_ENTRADA_TEXTO.some((p) => d.includes(p))) return "entrada" as const;
    return null;
  });

  const comPalavra = direcao.filter((d) => d !== null).length;
  if (comPalavra * 2 <= linhas.length) return linhas;

  return linhas.map((l, i) =>
    direcao[i] === "saida"
      ? { ...l, valor: -Math.abs(l.valor), tipo: "saida" as const }
      : l
  );
}
