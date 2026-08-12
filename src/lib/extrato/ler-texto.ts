// Leitor de texto colado — o dono copia o extrato do app do banco e cola.
// Extração linha a linha por expressão regular: data, descrição, valor.
// Decisão de escopo: como o texto vem colado do app do PRÓPRIO banco (UI em
// pt-BR), o número é sempre tratado como formato brasileiro (vírgula
// decimal) — diferente do CSV, aqui não há arquivo inteiro para detectar
// padrão, então não há ambiguidade a resolver, só uma convenção fixa.
//
// Linha que não casa NÃO É ERRO: ela volta em `naoEntendidas` para a tela
// mostrar ao usuário, e a leitura das outras linhas continua normalmente.

import type { ResultadoLeitura } from "./extrato";
import { normalizarSinais } from "./sinais";

// aaaa-mm-dd, dd/mm/aaaa, dd/mm/aa ou só dd/mm (telas de internet banking que
// mostram o extrato do mês corrente sem repetir o ano em cada linha) no
// início da linha. A ordem importa: os formatos com mais dígitos vêm antes
// do "dd/mm" puro, porque a alternação do regex usa a primeira opção que
// permite o resto do padrão casar — se "dd/mm" viesse primeiro, ele "roubaria"
// só os quatro primeiros dígitos de uma data completa e quebraria o resto.
const RE_DATA =
  "(\\d{4}-\\d{2}-\\d{2}|\\d{2}\\/\\d{2}\\/\\d{4}|\\d{2}\\/\\d{2}\\/\\d{2}|\\d{2}\\/\\d{2})";
// número em formato brasileiro, com sinal opcional antes ou depois ("-150,00"
// ou "150,00-"), OU sufixo C/D no lugar do sinal — algumas telas de extrato
// mostram "1.234,56 C" (crédito) / "89,90 D" (débito) em vez de +/-.
const RE_VALOR = "(-?\\s*(?:R\\$\\s*)?\\d+(?:\\.\\d{3})*(?:,\\d{2})?\\s*-?\\s*[CD]?)";
const RE_LINHA = new RegExp(`^\\s*${RE_DATA}\\s+(.+?)\\s+${RE_VALOR}\\s*$`, "i");

function dataParaIso(bruto: string): string | null {
  let m = bruto.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return validarData(m[1], m[2], m[3]);

  m = bruto.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return validarData(m[3], m[2], m[1]);

  m = bruto.match(/^(\d{2})\/(\d{2})\/(\d{2})$/);
  if (m) {
    const aa = Number(m[3]);
    const ano = aa <= 69 ? 2000 + aa : 1900 + aa;
    return validarData(String(ano), m[2], m[1]);
  }

  // dd/mm sem ano: telas de internet banking que mostram só o dia e o mês do
  // lançamento (o ano fica implícito por estar tudo no extrato do mês
  // corrente). Sem o ano no texto colado não tem como adivinhar com certeza
  // — a melhor aproximação, e a única sem inventar dado, é o ano corrente no
  // momento da importação (limitação conhecida: extrato de dezembro colado
  // já em janeiro do ano seguinte sairia com o ano errado).
  m = bruto.match(/^(\d{2})\/(\d{2})$/);
  if (m) {
    const anoAtual = new Date().getFullYear();
    return validarData(String(anoAtual), m[2], m[1]);
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
 * Sinal pode vir antes ou depois do número ("-150,00" ou "150,00-"), ou ser
 * substituído por um sufixo C (crédito → entra positivo) / D (débito → sai
 * negativo) — convenção comum de tela de extrato ("1.234,56 C", "89,90 D").
 * Resto é sempre BR (ver decisão de escopo no topo do arquivo).
 */
function valorParaNumero(bruto: string): number | null {
  // Texto colado da tela do banco vem com o menos tipográfico (U+2212) na
  // mesma frequência do CSV — ver src/lib/extrato/sinais.ts.
  let s = normalizarSinais(bruto).trim();
  let negativo = false;

  const sufixoCD = s.match(/([CD])$/i);
  if (sufixoCD) {
    if (/^d$/i.test(sufixoCD[1])) negativo = true;
    s = s.slice(0, -1).trim();
  }
  if (s.startsWith("-")) {
    negativo = true;
    s = s.slice(1).trim();
  }
  if (s.endsWith("-")) {
    negativo = true;
    s = s.slice(0, -1).trim();
  }
  s = s
    .replace(/^R\$\s*/, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negativo ? -n : n;
}

export function lerTexto(conteudo: string): ResultadoLeitura {
  const linhas: ResultadoLeitura["linhas"] = [];
  const naoEntendidas: string[] = [];

  // `normalizarSinais` no conteúdo INTEIRO, e não só no valor: aqui quem
  // decide se a linha é um lançamento é um regex que exige o sinal em ASCII.
  // Normalizar depois, dentro de valorParaNumero, seria tarde — a linha com
  // "−1.234,56" nem chegaria lá, cairia em "não entendidas". Ver sinais.ts.
  const linhasBrutas = normalizarSinais(conteudo)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n");

  for (const linhaBruta of linhasBrutas) {
    // linha em branco é só espaçamento do texto colado, não é ruído a reportar.
    if (linhaBruta.trim() === "") continue;

    const m = linhaBruta.match(RE_LINHA);
    if (!m) {
      naoEntendidas.push(linhaBruta.trim());
      continue;
    }

    const data = dataParaIso(m[1]);
    const valor = valorParaNumero(m[3]);
    if (!data || valor === null) {
      naoEntendidas.push(linhaBruta.trim());
      continue;
    }

    linhas.push({
      data,
      descricao: m[2].replace(/\s+/g, " ").trim(),
      valor,
      tipo: valor < 0 ? "saida" : "entrada",
      documento: "",
    });
  }

  return { linhas, naoEntendidas };
}
