// Leitor de OFX/OFC — o formato mais confiável porque todo banco brasileiro
// exporta, a marcação é simples e previsível (STMTTRN, DTPOSTED, TRNAMT,
// MEMO, FITID) e traz identificador único por transação (FITID), o melhor
// insumo possível para a impressão digital. Parser tolerante e sem
// dependência nova: muitos exports de OFX (SGML) não fecham as tags internas
// (<DTPOSTED> sem </DTPOSTED>), então extraímos campo a campo por posição em
// vez de depender de um parser de XML estrito.

import type { ResultadoLeitura } from "./extrato";
import { normalizarSinais } from "./sinais";

/** Valor de uma tag OFX até a próxima tag ou quebra de linha — tolera SGML sem fechamento. */
function campo(bloco: string, tag: string): string | null {
  const m = bloco.match(new RegExp(`<${tag}>\\s*([^<\r\n]*)`, "i"));
  return m ? m[1].trim() : null;
}

/** DTPOSTED vem como aaaammdd[hhmmss][[tz:TZ]] — só os 8 primeiros dígitos interessam. */
function dataParaIso(bruto: string): string | null {
  const m = bruto.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!m) return null;
  const [, ano, mes, dia] = m;
  const mesNum = Number(mes);
  const diaNum = Number(dia);
  if (mesNum < 1 || mesNum > 12 || diaNum < 1 || diaNum > 31) return null;
  return `${ano}-${mes}-${dia}`;
}

/** TRNAMT é padronizado com ponto decimal; alguns bancos fogem do padrão e usam vírgula. */
function valorParaNumero(bruto: string): number | null {
  // Mesmo cuidado do CSV: exportador que formata número com tipografia usa
  // U+2212 no lugar do hífen — ver src/lib/extrato/sinais.ts.
  let s = normalizarSinais(bruto).replace(/\s/g, "");
  if (s.includes(",") && !s.includes(".")) s = s.replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Alguns bancos (Itaú, Bradesco) declaram `CHARSET:1252` ou `<CHARSET>ISO-8859-1`
 * no cabeçalho do OFX. Isso não muda como este parser LÊ o texto (quem decide
 * o encoding dos bytes é a camada que carregou o arquivo, fora daqui) — mas
 * serve de sinal para acionar a correção de mojibake abaixo, porque é
 * exatamente esse tipo de arquivo que costuma chegar com acento corrompido
 * quando alguém no caminho decodificou os bytes como UTF-8 por engano.
 */
function acharCharsetDoCabecalho(conteudo: string): string | null {
  const inicio = conteudo.slice(0, 2000);
  const sgml = inicio.match(/^CHARSET:\s*(\S+)/im);
  if (sgml) return sgml[1].toUpperCase();
  const xml = inicio.match(/<CHARSET>\s*([^<\s]+)/i);
  return xml ? xml[1].toUpperCase() : null;
}

function ehCharsetLatin1(charset: string | null): boolean {
  return charset === "1252" || charset === "8859-1" || charset === "ISO-8859-1";
}

/**
 * Repara o caso clássico de mojibake: texto UTF-8 (ex.: "PROMOÇÃO") que foi
 * decodificado como Latin-1/CP1252 byte a byte, virando "PROMOÃ‡ÃƒO". A
 * correção é reinterpretar cada char code (0–255) como um BYTE latin-1 e
 * decodificar de novo como UTF-8. Isso só "acerta" (não lança) quando o texto
 * realmente era mojibake — texto já correto (com acento legítimo, ex. "João")
 * não forma uma sequência UTF-8 válida quando reinterpretado assim, então o
 * `TextDecoder` com `fatal: true` rejeita e devolvemos o texto original sem
 * mexer. Não usa `Buffer` de propósito: este código roda no navegador (o
 * componente de importação é client-side), onde `Buffer` não existe sem
 * polyfill; `TextDecoder`/`Uint8Array` são padrão em ambos os ambientes.
 */
function corrigirMojibake(txt: string): string {
  if (!txt) return txt;
  const codes = Array.from(txt, (c) => c.codePointAt(0) ?? 0);
  if (codes.some((c) => c > 255)) return txt; // já tem caractere fora de Latin-1: não é o padrão de mojibake que tratamos
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(codes));
  } catch {
    return txt; // não decodifica como UTF-8 válido → não era mojibake, mantém como veio
  }
}

export function lerOfx(conteudo: string): ResultadoLeitura {
  const linhas: ResultadoLeitura["linhas"] = [];
  const naoEntendidas: string[] = [];

  // Só tenta reparar mojibake quando o próprio arquivo se declara Latin-1 —
  // rodar a correção sem esse sinal arriscaria "corrigir" um texto que já
  // estava certo (mesmo o guard de UTF-8 válido do corrigirMojibake sendo
  // seguro, preferimos só acionar a heurística quando há motivo concreto).
  const usaLatin1 = ehCharsetLatin1(acharCharsetDoCabecalho(conteudo));

  // Divide pelo início de cada transação; cada pedaço vai até o </STMTTRN>
  // seguinte (quando existir) — cobre tanto SGML fechado quanto o tolerante,
  // e também XML (OFX 2.0) com tags fechadas, já que `campo()` só lê até a
  // próxima tag ou quebra de linha de qualquer forma.
  const partes = conteudo.split(/<STMTTRN>/i).slice(1);

  for (const parte of partes) {
    const fim = parte.search(/<\/STMTTRN>/i);
    const bloco = fim === -1 ? parte : parte.slice(0, fim);

    const dtPosted = campo(bloco, "DTPOSTED");
    const trnAmt = campo(bloco, "TRNAMT");
    const data = dtPosted ? dataParaIso(dtPosted) : null;
    const valor = trnAmt ? valorParaNumero(trnAmt) : null;

    if (!data || valor === null) {
      naoEntendidas.push(`<STMTTRN>${bloco}`.trim());
      continue;
    }

    // MEMO vazio ("<MEMO></MEMO>" ou "<MEMO>" seguido de nada) cai para NAME
    // — alguns bancos preenchem só um dos dois, nunca os dois em branco.
    const memo = campo(bloco, "MEMO");
    const nome = campo(bloco, "NAME");
    const fitId = campo(bloco, "FITID");
    const descricaoBruta = memo || nome || "";
    const descricao = usaLatin1 ? corrigirMojibake(descricaoBruta) : descricaoBruta;

    linhas.push({
      data,
      descricao,
      valor,
      // sem sinal (valor zero), trata como entrada — mesma convenção do CSV e do texto colado.
      tipo: valor < 0 ? "saida" : "entrada",
      documento: fitId ?? "",
    });
  }

  return { linhas, naoEntendidas };
}
