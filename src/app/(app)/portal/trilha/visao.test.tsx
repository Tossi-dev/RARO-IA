// Testes de render de `MinhaTrilhaVisao` — a trilha como o MENTORADO a vê.
//
// O QUE ESTA SUÍTE PROVA
// ----------------------
// 1) AULA NÃO LIBERADA NÃO APARECE, DE JEITO NENHUM. A camada de leitura já
//    entrega `urlVideo` e `texto` vazios (`dados-trilha.ts`) — e mesmo assim
//    os testes passam uma aula fechada COM conteúdo dentro, para provar que a
//    tela não o desenharia se um dia ele chegasse. Duas portas, fechadas
//    separadamente: a que não manda e a que não desenha;
// 2) a data de liberação aparece como DATA, não como "em breve". "Em breve" é
//    a frase que faz a pessoa voltar cinco vezes e desistir na sexta;
// 3) aula fechada não oferece o botão de concluir;
// 4) trilha concluída não promete um certificado que ainda não existe;
// 5) zero emoji.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { AulaDoMentorado, MinhaTrilha } from "@/lib/conteudo/dados-trilha";

vi.mock("@/lib/conteudo/acoes-portal-trilha", () => ({ marcarAulaDoPortal: vi.fn() }));

const { MinhaTrilhaVisao } = await import("./visao");

const VIDEO = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

function aula(over: Partial<AulaDoMentorado> = {}): AulaDoMentorado {
  return {
    id: "aula-1",
    workspaceId: "ws-1",
    trilhaId: "tr-1",
    ordem: 1,
    titulo: "Aula 1 — fundamentos",
    tipo: "video",
    urlVideo: VIDEO,
    texto: "O texto da aula",
    duracaoMin: 12,
    liberaEmDias: 0,
    criadoEm: "2026-08-01T10:00:00Z",
    liberada: true,
    abreNoDia: "2026-08-01",
    motivo: "",
    concluida: false,
    ...over,
  };
}

function minha(aulas: AulaDoMentorado[], over: Partial<MinhaTrilha> = {}): MinhaTrilha {
  return {
    conectado: true,
    motivo: "",
    ehMentorado: true,
    trilhas: [
      {
        trilha: {
          id: "tr-1",
          workspaceId: "ws-1",
          nome: "Fundamentos do negócio",
          descricao: "A base para quem está começando",
          programaId: null,
          ativa: true,
          criadoEm: "2026-08-01T10:00:00Z",
        },
        inicio: "2026-08-01",
        aulas,
        progresso: {
          total: aulas.length,
          concluidas: aulas.filter((a) => a.concluida).length,
          pct: aulas.length ? Math.round((aulas.filter((a) => a.concluida).length / aulas.length) * 100) : null,
        },
        temCertificado: false,
      },
    ],
    ...over,
  };
}

function render(m: MinhaTrilha, erro = ""): string {
  return renderToStaticMarkup(<MinhaTrilhaVisao minha={m} erro={erro} />);
}

function textoDe(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

describe("MinhaTrilhaVisao — os estados", () => {
  it("sem conexão, mostra o motivo e nenhuma aula", () => {
    const html = render({ conectado: false, motivo: "Não foi possível carregar as trilhas agora.", ehMentorado: false, trilhas: [] });

    expect(textoDe(html)).toContain("Não foi possível carregar as trilhas agora");
    expect(html).not.toContain("<iframe");
  });

  it("conectado mas sem ficha de mentorado: diz que não há nada, sem nome de papel", () => {
    const html = render({ conectado: true, motivo: "", ehMentorado: false, trilhas: [] });
    const t = textoDe(html);

    expect(t).toContain("Ainda não há nada por aqui");
    // Nome de papel do banco na cara do usuário conta o desenho interno.
    expect(t).not.toMatch(/mentorado|gestor|comercial|afiliado/i);
  });

  it("mentorado sem trilha matriculada: frase honesta, não uma lista vazia", () => {
    const html = render({ conectado: true, motivo: "", ehMentorado: true, trilhas: [] });
    expect(textoDe(html)).toContain("Você ainda não está em nenhuma trilha");
  });

  it("erro vindo de ?erro= aparece", () => {
    const html = render(minha([aula()]), "Esta aula ainda não foi liberada.");
    expect(textoDe(html)).toContain("Esta aula ainda não foi liberada");
  });
});

describe("MinhaTrilhaVisao — aula LIBERADA", () => {
  it("mostra o vídeo, o texto e o botão de concluir", () => {
    const html = render(minha([aula()]));

    expect(html).toContain("<iframe");
    expect(html).toContain("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(textoDe(html)).toContain("O texto da aula");
    expect(html).toContain('name="aulaId"');
    expect(html).toContain('value="aula-1"');
  });

  it("o botão manda concluir quando está aberta, e reabrir quando está concluída", () => {
    const aberta = render(minha([aula({ concluida: false })]));
    const feita = render(minha([aula({ concluida: true })]));

    expect(aberta).toContain('name="concluida" value="1"');
    // Só o literal "1" marca (ver `marcarAula`): desmarcar manda outra coisa.
    expect(feita).toContain('name="concluida" value="0"');
  });

  it("o progresso aparece como número, não como sensação", () => {
    const html = render(minha([aula({ id: "a", concluida: true }), aula({ id: "b", ordem: 2 })]));
    expect(textoDe(html)).toContain("1 de 2");
  });
});

describe("MinhaTrilhaVisao — aula NÃO liberada", () => {
  // A leitura já apaga o conteúdo; aqui ele vai cheio de propósito, para
  // provar que a TELA também não o desenharia.
  const fechada = () =>
    minha([
      aula({
        id: "fechada",
        titulo: "Aula 2 — o próximo passo",
        liberada: false,
        abreNoDia: "2026-09-15",
        motivo: "Esta aula ainda não abriu.",
        urlVideo: VIDEO,
        texto: "SEGREDO QUE NAO PODE APARECER",
      }),
    ]);

  it("não vira iframe, e a URL não aparece nem como texto", () => {
    const html = render(fechada());

    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("dQw4w9WgXcQ");
    expect(html).not.toContain("youtube");
    expect(html).not.toContain("SEGREDO QUE NAO PODE APARECER");
  });

  it("o título continua visível — a pessoa precisa saber o que vem pela frente", () => {
    expect(textoDe(render(fechada()))).toContain("Aula 2 — o próximo passo");
  });

  it("a data de abertura aparece como DATA, não como 'em breve'", () => {
    const t = textoDe(render(fechada()));

    expect(t).toContain("15/09/2026");
    expect(t).not.toMatch(/em breve|logo mais|aguarde/i);
  });

  it("sem data conhecida, não inventa uma nem promete prazo", () => {
    const semData = minha([aula({ liberada: false, abreNoDia: null, motivo: "Ainda não abriu." })]);
    const t = textoDe(render(semData));

    expect(t).not.toContain("Invalid Date");
    expect(t).not.toContain("NaN");
    expect(t).not.toMatch(/em breve/i);
  });

  it("não oferece o botão de concluir", () => {
    // Marcar uma aula fechada é recusado no banco de qualquer jeito (a função
    // `trilha_marcar_aula`), mas oferecer o botão seria convidar para um erro.
    const html = render(fechada());
    expect(html).not.toContain('name="aulaId"');
  });
});

describe("MinhaTrilhaVisao — trilha concluída", () => {
  it("comemora sem prometer um certificado que ainda não existe", () => {
    const m = minha([aula({ concluida: true })]);
    m.trilhas[0].temCertificado = true;
    const html = render(m);
    const t = textoDe(html);

    expect(t).toContain("Você concluiu esta trilha");
    // A EMISSÃO do certificado é tarefa própria, ainda não escrita. Nem
    // botão, nem link, nem "seu certificado está pronto".
    expect(html).not.toContain("/certificado/");
    expect(t).not.toMatch(/baixar|emitir certificado|seu certificado está/i);
  });
});

describe("MinhaTrilhaVisao — zero emoji", () => {
  it("com aula aberta, aula fechada e trilha concluída", () => {
    const permitidos = new Set(["▲", "▼", "▬", "—", "·", "•", "→"]);
    const m = minha([aula(), aula({ id: "f", ordem: 2, liberada: false, abreNoDia: "2026-09-15", urlVideo: "", texto: "" })]);
    m.trilhas[0].temCertificado = true;

    const achados: string[] = [];
    for (const ch of render(m)) {
      if (permitidos.has(ch)) continue;
      if (/\p{Extended_Pictographic}/u.test(ch)) achados.push(ch);
    }
    expect(achados).toEqual([]);
  });
});
