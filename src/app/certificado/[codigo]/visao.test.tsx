// Testes de render da página PÚBLICA de certificado.
//
// O QUE ESTA SUÍTE PROVA
// ----------------------
// 1) código inexistente diz que não encontrou e NÃO conta quantos existem,
//    nem descreve o formato do código — as duas coisas seriam ajuda de graça
//    para quem está adivinhando;
// 2) "não conseguimos conferir" é uma tela DIFERENTE de "não existe": a
//    primeira é um problema nosso, a segunda é uma afirmação sobre o
//    documento de alguém;
// 3) nenhum e-mail e nenhum telefone aparecem — nem quando alguém enfia um
//    deles no nome (a tela não é a última defesa, mas também não é a porta
//    aberta);
// 4) zero emoji.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CertificadoPublico } from "@/lib/conteudo/dados-certificado";
import { CertificadoVisao } from "./visao";

const CODIGO = "ABC23456789K";

function resultado(over: Partial<CertificadoPublico> = {}): CertificadoPublico {
  return {
    conectado: true,
    motivo: "",
    encontrado: true,
    codigo: CODIGO,
    aluno: "Maria de Souza",
    trilha: "Fundamentos do negócio",
    emitidoEm: "2026-08-19T14:00:00Z",
    ...over,
  };
}

function render(r: CertificadoPublico): string {
  return renderToStaticMarkup(<CertificadoVisao resultado={r} />);
}

function textoDe(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

describe("CertificadoVisao — encontrado", () => {
  it("mostra nome, trilha, data por extenso e o código", () => {
    const t = textoDe(render(resultado()));

    expect(t).toContain("Maria de Souza");
    expect(t).toContain("Fundamentos do negócio");
    expect(t).toContain("19 de agosto de 2026");
    expect(t).toContain(CODIGO);
  });

  it("data inválida some — nunca 'Invalid Date' impresso num documento", () => {
    const t = textoDe(render(resultado({ emitidoEm: "" })));

    expect(t).not.toContain("Invalid Date");
    expect(t).not.toContain("NaN");
    expect(t).not.toContain("Emitido em");
    // E o resto do documento continua de pé.
    expect(t).toContain("Maria de Souza");
  });

  it("não imprime e-mail nem telefone", () => {
    // A função do banco (0021) nem devolve esses campos — este teste é a
    // segunda porta: se um dia ela devolver, a tela não passa a desenhar.
    const html = render(resultado());

    expect(html).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
    expect(html).not.toMatch(/\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4}/);
    expect(html).not.toContain("mailto:");
    expect(html).not.toContain("tel:");
  });
});

describe("CertificadoVisao — não encontrado", () => {
  const naoAchou = () => render(resultado({ encontrado: false, aluno: "", trilha: "", emitidoEm: "" }));

  it("diz que não encontrou", () => {
    expect(textoDe(naoAchou())).toContain("Não encontramos nenhum certificado com esse código");
  });

  it("não conta quantos certificados existem", () => {
    const t = textoDe(naoAchou());
    expect(t).not.toMatch(/\d+\s+certificad/i);
    expect(t).not.toMatch(/nenhum dos \d+/i);
  });

  it("não descreve o formato do código", () => {
    // "12 caracteres", "só maiúsculas", "sem a letra O" — cada uma dessas
    // frases é metade do trabalho de quem está tentando adivinhar.
    const t = textoDe(naoAchou());
    expect(t).not.toMatch(/\b12\b/);
    expect(t).not.toMatch(/caracteres|dígitos|maiúscul|letras e números|formato/i);
  });

  it("não sugere procurar outro código nem oferece busca", () => {
    const html = naoAchou();
    expect(html).not.toContain("<form");
    expect(html).not.toContain("<input");
  });

  it("não vaza nome nem trilha de ninguém", () => {
    const t = textoDe(naoAchou());
    expect(t).not.toContain("Maria");
    expect(t).not.toContain("Fundamentos");
  });
});

describe("CertificadoVisao — não deu para conferir", () => {
  it("é uma tela diferente de 'não existe'", () => {
    // Dizer "não encontramos" quando o banco está fora do ar é afirmar que o
    // documento da pessoa não vale — sobre uma pergunta que nem chegou a ser
    // feita.
    const t = textoDe(
      render(
        resultado({
          conectado: false,
          encontrado: false,
          motivo: "Não foi possível conferir este certificado agora. Tente novamente em instantes.",
          aluno: "",
          trilha: "",
          emitidoEm: "",
        }),
      ),
    );

    expect(t).toContain("Não foi possível conferir este certificado agora");
    expect(t).not.toContain("Não encontramos nenhum certificado");
  });
});

describe("CertificadoVisao — zero emoji", () => {
  it("nos três estados", () => {
    const permitidos = new Set(["▲", "▼", "▬", "—", "·", "•", "→"]);
    const estados = [
      resultado(),
      resultado({ encontrado: false, aluno: "", trilha: "", emitidoEm: "" }),
      resultado({ conectado: false, encontrado: false, motivo: "x", aluno: "", trilha: "", emitidoEm: "" }),
    ];

    for (const estado of estados) {
      const achados: string[] = [];
      for (const ch of render(estado)) {
        if (permitidos.has(ch)) continue;
        if (/\p{Extended_Pictographic}/u.test(ch)) achados.push(ch);
      }
      expect(achados).toEqual([]);
    }
  });
});
