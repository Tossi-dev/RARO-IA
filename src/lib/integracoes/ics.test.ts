// Testes da ESCRITA de `ics.ts` (`montarIcs`/`dobrarLinhaIcs`/`emailAttendeeValido`) —
// Tarefa 16, corrigida após reprovação de revisor independente (ALTO 1,
// BAIXO-MÉDIO 4, MÉDIO 5/mutante (j)). A leitura (`analisarICS`) já é
// testada em `src/lib/agenda.test.ts`; aqui o alvo é o ESCRITOR, e o teste
// mais importante desta suíte é o de IDA-E-VOLTA: `montarIcs` -> `analisarICS`
// -> o mesmo texto de volta, byte a byte no que importa — é o que prova que
// os dois lados do RFC 5545 realmente concordam, e não só "parecem"
// concordar em revisão de código.
//
// O segundo grupo mais importante é INJEÇÃO: `mentorado.email` é coluna
// `text` sem CHECK no banco, e `convidadosDaSessao` (`mentoria/calendario.ts`)
// só faz `.trim()`. Um e-mail com CRLF embutido tenta injetar propriedades
// (`SUMMARY`, `LOCATION`) ou eventos (`BEGIN:VEVENT`) inteiros no arquivo que
// o dono baixa e importa na própria agenda — os testes abaixo reproduzem
// exatamente os payloads do laudo e releem com `analisarICS` (não confiam só
// em "a string não contém X").

import { describe, expect, it } from "vitest";
import {
  desescapar,
  dobrarLinhaIcs,
  emailAttendeeValido,
  escaparValorIcs,
  montarIcs,
  type EventoParaIcs,
} from "./ics";
import { analisarICS } from "./ics";

const JANELA_DE = new Date("2026-01-01T00:00:00Z");
const JANELA_ATE = new Date("2026-12-31T00:00:00Z");
const AGORA_ISO = "2026-08-17T12:00:00.000Z";

function eventoDe(parcial: Partial<EventoParaIcs> = {}): EventoParaIcs {
  return {
    titulo: "Maria — sessão 3 — 20/08 23:00",
    descricao: "Sessão de mentoria individual (sessão 3)",
    inicioIso: "2026-08-20T23:00:00.000Z",
    fimIso: "2026-08-21T00:00:00.000Z",
    convidados: [],
    ...parcial,
  };
}

// ============================================================
// Estrutura básica
// ============================================================

describe("montarIcs — estrutura", () => {
  it("monta VCALENDAR/VEVENT com UID, DTSTAMP, DTSTART, DTEND, SUMMARY, DESCRIPTION", () => {
    const conteudo = montarIcs({ uid: "sessao-ses-1@mentoros", evento: eventoDe(), agoraIso: AGORA_ISO });

    expect(conteudo).toContain("BEGIN:VCALENDAR");
    expect(conteudo).toContain("END:VCALENDAR");
    expect(conteudo).toContain("BEGIN:VEVENT");
    expect(conteudo).toContain("END:VEVENT");
    expect(conteudo).toContain("UID:sessao-ses-1@mentoros");
    expect(conteudo).toContain("DTSTART:20260820T230000Z");
    expect(conteudo).toContain("DTEND:20260821T000000Z");
    expect(conteudo).toContain("SUMMARY:Maria — sessão 3 — 20/08 23:00");
    expect(conteudo).toContain("DESCRIPTION:Sessão de mentoria individual (sessão 3)");
    // Convite normal: nada de marca de cancelamento.
    expect(conteudo).not.toContain("METHOD:CANCEL");
    expect(conteudo).not.toContain("STATUS:CANCELLED");
  });

  it("UID é estável: duas montagens da MESMA sessão produzem a MESMA linha UID (mutante (j): Math.random morre aqui)", () => {
    const c1 = montarIcs({ uid: "sessao-ses-1@mentoros", evento: eventoDe(), agoraIso: AGORA_ISO });
    const c2 = montarIcs({
      uid: "sessao-ses-1@mentoros",
      evento: eventoDe(),
      agoraIso: "2026-08-18T09:00:00.000Z",
    });
    const uidDe = (texto: string) => texto.match(/^UID:.*$/m)?.[0];
    expect(uidDe(c1)).toBe("UID:sessao-ses-1@mentoros");
    expect(uidDe(c1)).toBe(uidDe(c2));
  });

  it("DTSTAMP reflete o agoraIso RECEBIDO (parâmetro, nunca relógio de dentro da função)", () => {
    // Por que isto merece asserção própria: `DTSTAMP` é o carimbo que um
    // app de calendário usa para decidir se a versão que está chegando é
    // MAIS NOVA que a que ele já tem. Congelado (num relógio parado, ou em
    // 1970), o `.ics` de cancelamento chega "mais velho" que o convite e o
    // cliente ignora — o cancelamento para de cancelar, em silêncio.
    const convite = montarIcs({
      uid: "sessao-ses-11@mentoros",
      evento: eventoDe(),
      agoraIso: "2026-08-17T12:00:00.000Z",
    });
    expect(convite).toContain("DTSTAMP:20260817T120000Z");

    const cancelamento = montarIcs({
      uid: "sessao-ses-11@mentoros",
      evento: eventoDe(),
      cancelado: true,
      agoraIso: "2026-08-18T09:30:45.000Z",
    });
    expect(cancelamento).toContain("DTSTAMP:20260818T093045Z");
    // O cancelamento NÃO pode carregar o carimbo do convite anterior.
    expect(cancelamento).not.toContain("DTSTAMP:20260817T120000Z");
  });

  it("cancelado: true emite METHOD:CANCEL (nível calendário) e STATUS:CANCELLED (nível evento), MESMO UID", () => {
    const uid = "sessao-ses-9@mentoros";
    const conviteAtivo = montarIcs({ uid, evento: eventoDe(), agoraIso: AGORA_ISO });
    const conviteCancelado = montarIcs({ uid, evento: eventoDe(), cancelado: true, agoraIso: AGORA_ISO });

    expect(conviteAtivo).not.toContain("METHOD:CANCEL");
    expect(conviteAtivo).not.toContain("STATUS:CANCELLED");

    expect(conviteCancelado).toContain("METHOD:CANCEL");
    expect(conviteCancelado).toContain("STATUS:CANCELLED");
    expect(conviteCancelado).toContain(`UID:${uid}`);

    // O leitor do próprio repositório concorda: relido, o evento cancelado
    // vem com `cancelado: true`; o ativo, com `cancelado: false`.
    const lidoAtivo = analisarICS(conviteAtivo, JANELA_DE, JANELA_ATE);
    const lidoCancelado = analisarICS(conviteCancelado, JANELA_DE, JANELA_ATE);
    expect(lidoAtivo.eventos[0]?.cancelado).toBe(false);
    expect(lidoCancelado.eventos[0]?.cancelado).toBe(true);
  });
});

// ============================================================
// Ida-e-volta: montarIcs -> analisarICS -> o mesmo dado de volta.
// ============================================================

describe("montarIcs -> analisarICS — ida e volta", () => {
  it("título e descrição com ';', ',', quebra de linha e acento sobrevivem intactos", () => {
    const titulo = 'Sessão; "especial", revisão — São Paulo';
    const descricao = "Linha um\nLinha dois com vírgula, e ponto-e-vírgula; aqui";
    const conteudo = montarIcs({
      uid: "sessao-ses-2@mentoros",
      evento: eventoDe({ titulo, descricao }),
      agoraIso: AGORA_ISO,
    });

    const lido = analisarICS(conteudo, JANELA_DE, JANELA_ATE);
    expect(lido.eventos).toHaveLength(1);
    expect(lido.eventos[0].titulo).toBe(titulo);
    expect(lido.eventos[0].descricao).toBe(descricao);
  });

  it("nome de 200 caracteres (dobra várias linhas) sobrevive intacto", () => {
    const titulo = "Mentorado-" + "x".repeat(200);
    const conteudo = montarIcs({
      uid: "sessao-ses-3@mentoros",
      evento: eventoDe({ titulo }),
      agoraIso: AGORA_ISO,
    });

    // Prova que a dobra de fato aconteceu: a linha SUMMARY não pode
    // aparecer inteira, sem quebra, no texto bruto.
    expect(conteudo).not.toContain(`SUMMARY:${titulo}`);

    const lido = analisarICS(conteudo, JANELA_DE, JANELA_ATE);
    expect(lido.eventos[0].titulo).toBe(titulo);
  });

  it("nome longo E acentuado (multibyte) sobrevive intacto — a dobra nunca corta um caractere ao meio", () => {
    const titulo = "Sessão com acentuação: " + "ção áéíóú ".repeat(20) + "\u{1F389} final";
    const conteudo = montarIcs({
      uid: "sessao-ses-4@mentoros",
      evento: eventoDe({ titulo }),
      agoraIso: AGORA_ISO,
    });

    // Nenhuma linha física pode passar de 75 octetos.
    for (const linha of conteudo.split("\r\n")) {
      expect(new TextEncoder().encode(linha).length).toBeLessThanOrEqual(75);
    }

    const lido = analisarICS(conteudo, JANELA_DE, JANELA_ATE);
    expect(lido.eventos[0].titulo).toBe(titulo);
  });

  it("emoji no nome do mentorado (dado do cliente, não filtrado por este escritor) sobrevive intacto", () => {
    const titulo = "João \u{1F680}\u{1F389} — sessão 5";
    const conteudo = montarIcs({
      uid: "sessao-ses-5@mentoros",
      evento: eventoDe({ titulo }),
      agoraIso: AGORA_ISO,
    });
    const lido = analisarICS(conteudo, JANELA_DE, JANELA_ATE);
    expect(lido.eventos[0].titulo).toBe(titulo);
  });

  it("DTSTART/DTEND batem no milissegundo (via instante, não string) depois do ida-e-volta", () => {
    const conteudo = montarIcs({
      uid: "sessao-ses-6@mentoros",
      evento: eventoDe({ inicioIso: "2026-03-14T09:05:07.000Z", fimIso: "2026-03-14T10:05:07.000Z" }),
      agoraIso: AGORA_ISO,
    });
    const lido = analisarICS(conteudo, JANELA_DE, JANELA_ATE);
    expect(lido.eventos[0].inicio.toISOString()).toBe("2026-03-14T09:05:07.000Z");
    expect(lido.eventos[0].fim.toISOString()).toBe("2026-03-14T10:05:07.000Z");
  });
});

// ============================================================
// emailAttendeeValido — fail-closed.
// ============================================================

describe("emailAttendeeValido", () => {
  it("aceita um e-mail normal", () => {
    expect(emailAttendeeValido("maria@exemplo.com")).toBe(true);
    expect(emailAttendeeValido("  maria@exemplo.com  ")).toBe(true);
  });

  it("recusa string vazia, sem @, ou sem domínio com ponto", () => {
    expect(emailAttendeeValido("")).toBe(false);
    expect(emailAttendeeValido("nao-e-email")).toBe(false);
    expect(emailAttendeeValido("maria@exemplo")).toBe(false);
  });

  it("recusa (fail-closed) qualquer valor com CR, LF, ';' ou ':' embutido — payload exato do laudo", () => {
    const payload = "a@b.com\r\nSUMMARY:INJETADO PELO ATACANTE\r\nLOCATION:https://evil.example";
    expect(emailAttendeeValido(payload)).toBe(false);
  });

  it("recusa payload que tenta abrir/fechar um VEVENT novo", () => {
    const payload =
      "a@b.com\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:evil@atacante\r\nSUMMARY:Evento forjado\r\nEND:VEVENT";
    expect(emailAttendeeValido(payload)).toBe(false);
  });

  // Os dois testes abaixo existem porque os payloads acima têm CRLF: o `\s`
  // do guarda sozinho já os reprova, então eles NÃO provam nada sobre `;` e
  // `:` — três mutantes (tirar `:`, tirar `;`, tirar os dois) sobreviviam à
  // suíte inteira. Aqui cada caractere é afirmado SOZINHO, sem CR nem LF.
  //
  // O domínio tem ponto de propósito ("b.com", não "b"): sem o ponto, o
  // formato do e-mail já reprovaria o valor por outro motivo, e o teste
  // continuaria passando mesmo com a regra de `;`/`:` removida. Com o ponto,
  // a ÚNICA coisa que reprova o valor é a regra que este teste diz testar.
  it("recusa ':' embutido, sem CR nem LF — ':' abre o valor da propriedade (mutante (s))", () => {
    expect(emailAttendeeValido("a@b.com:80")).toBe(false);
    // `mailto:` extra: o que um atacante escreveria para virar dois valores.
    expect(emailAttendeeValido("a@b.com:mailto:evil@x.com")).toBe(false);
  });

  it("recusa ';' embutido, sem CR nem LF — ';' abre um parâmetro da propriedade (mutante (s2))", () => {
    expect(emailAttendeeValido("a@b.com;CN=X")).toBe(false);
    expect(emailAttendeeValido("a@b.com;ROLE=CHAIR")).toBe(false);
  });
});

// ============================================================
// Injeção via ATTENDEE — reprodução completa do ALTO 1 do laudo, com
// releitura pelo `analisarICS` do próprio repositório (não confia só em
// "a string não contém X": prova que o PARSER não vê nada sequestrado).
// ============================================================

describe("montarIcs — e-mail hostil nunca vira ATTENDEE, título e local não são sequestrados", () => {
  it("SUMMARY/LOCATION injetados pelo e-mail do mentorado não sobrevivem à releitura", () => {
    const payload = "a@b.com\r\nSUMMARY:INJETADO PELO ATACANTE\r\nLOCATION:https://evil.example";
    const conteudo = montarIcs({
      uid: "sessao-ses-7@mentoros",
      evento: eventoDe({ convidados: [payload] }),
      agoraIso: AGORA_ISO,
    });

    expect(conteudo).not.toContain("ATTENDEE");
    expect(conteudo).not.toContain("INJETADO");
    expect(conteudo).not.toContain("evil.example");

    const lido = analisarICS(conteudo, JANELA_DE, JANELA_ATE);
    expect(lido.eventos).toHaveLength(1);
    expect(lido.eventos[0].titulo).toBe(eventoDe().titulo);
    expect(lido.eventos[0].local).toBe("");
  });

  it("BEGIN:VEVENT/END:VEVENT injetados pelo e-mail não criam um segundo evento na releitura", () => {
    const payload =
      "a@b.com\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:evil@atacante\r\nSUMMARY:Evento forjado\r\nDTSTART:20260101T000000Z\r\nEND:VEVENT";
    const conteudo = montarIcs({
      uid: "sessao-ses-8@mentoros",
      evento: eventoDe({ convidados: [payload] }),
      agoraIso: AGORA_ISO,
    });

    const lido = analisarICS(conteudo, JANELA_DE, JANELA_ATE);
    expect(lido.eventos).toHaveLength(1);
    expect(lido.eventos.some((e) => e.titulo === "Evento forjado")).toBe(false);
    expect(lido.eventos.some((e) => e.uid === "evil@atacante")).toBe(false);
  });

  it("e-mail com ';' ou ':' (sem CR/LF) também é descartado: nada de parâmetro nem valor extra na linha ATTENDEE", () => {
    const conteudo = montarIcs({
      uid: "sessao-ses-16@mentoros",
      evento: eventoDe({
        convidados: ["a@b.com;CN=Injetado", "a@b.com:mailto:evil@x.com", "maria@exemplo.com"],
      }),
      agoraIso: AGORA_ISO,
    });

    const linhasAttendee = conteudo.split("\r\n").filter((l) => l.startsWith("ATTENDEE"));
    expect(linhasAttendee).toEqual(["ATTENDEE;RSVP=TRUE:mailto:maria@exemplo.com"]);
    expect(conteudo).not.toContain("CN=Injetado");
    expect(conteudo).not.toContain("evil@x.com");
  });

  it("convidados mistos: só o e-mail válido vira ATTENDEE, o hostil é descartado (não escapado)", () => {
    const conteudo = montarIcs({
      uid: "sessao-ses-10@mentoros",
      evento: eventoDe({
        convidados: ["maria@exemplo.com", "a@b.com\r\nSUMMARY:X", "joao@exemplo.com"],
      }),
      agoraIso: AGORA_ISO,
    });

    const linhasAttendee = conteudo.split("\r\n").filter((l) => l.startsWith("ATTENDEE"));
    expect(linhasAttendee).toHaveLength(2);
    expect(conteudo).toContain("mailto:maria@exemplo.com");
    expect(conteudo).toContain("mailto:joao@exemplo.com");
    expect(conteudo).not.toContain("SUMMARY:X");
  });
});

// ============================================================
// dobrarLinhaIcs — unidade, além do round-trip acima.
// ============================================================

describe("dobrarLinhaIcs", () => {
  it("linha curta (<=75 octetos) não é tocada", () => {
    const linha = "SUMMARY:Maria — sessão 3";
    expect(dobrarLinhaIcs(linha)).toBe(linha);
  });

  it("linha longa vira múltiplas linhas físicas, cada uma com no máximo 75 octetos, e reconstrói exatamente o original", () => {
    const linha = "SUMMARY:" + "a".repeat(200);
    const dobrada = dobrarLinhaIcs(linha);
    const partes = dobrada.split("\r\n");
    expect(partes.length).toBeGreaterThan(1);
    for (const p of partes) {
      expect(new TextEncoder().encode(p).length).toBeLessThanOrEqual(75);
    }
    expect(partes.slice(1).every((p) => p.startsWith(" "))).toBe(true);
    const reconstruido = partes.map((p, i) => (i === 0 ? p : p.slice(1))).join("");
    expect(reconstruido).toBe(linha);
  });

  it("nunca corta um caractere multibyte no meio (a linha dobrada continua sendo UTF-8 válido)", () => {
    const linha = "SUMMARY:" + "é".repeat(60) + "\u{1F389}".repeat(15);
    const dobrada = dobrarLinhaIcs(linha);
    for (const parte of dobrada.split("\r\n")) {
      const semEspacoDeContinuacao = parte.startsWith(" ") ? parte.slice(1) : parte;
      const bytes = new TextEncoder().encode(semEspacoDeContinuacao);
      expect(() => new TextDecoder("utf-8", { fatal: true }).decode(bytes)).not.toThrow();
    }
    const reconstruido = dobrada
      .split("\r\n")
      .map((p, i) => (i === 0 ? p : p.slice(1)))
      .join("");
    expect(reconstruido).toBe(linha);
  });
});

// ============================================================
// escaparValorIcs — direção escrever, simétrica ao `desescapar` da leitura.
// ============================================================

describe("escaparValorIcs", () => {
  it("escapa backslash, ponto-e-vírgula, vírgula e nova linha", () => {
    expect(escaparValorIcs("a\\b;c,d\ne")).toBe("a\\\\b\\;c\\,d\\ne");
  });

  // O CR era o buraco: `escaparValorIcs` só tratava `\n`, e `desdobrar` (a
  // leitura, no topo de `ics.ts`) converte CR em quebra de linha — ou seja,
  // um CR cru no meio de um SUMMARY VIRA uma linha nova de verdade quando o
  // arquivo é relido. Mesma classe do payload de ATTENDEE, na porta ao lado.
  it("escapa CR sozinho e CRLF exatamente como o LF — nenhum octeto CR sobrevive à escrita", () => {
    expect(escaparValorIcs("a\rb")).toBe("a\\nb");
    expect(escaparValorIcs("a\r\nb")).toBe("a\\nb");
    expect(escaparValorIcs("a\nb")).toBe("a\\nb");
    expect(escaparValorIcs("a\rb")).not.toContain("\r");
    expect(escaparValorIcs("a\r\nb")).not.toContain("\r");
  });

  // A SIMETRIA, provada em tabela em vez de afirmada em comentário: escrever
  // e ler de volta com o par do próprio arquivo (`escaparValorIcs` ->
  // `desescapar`) devolve o texto idêntico — com UMA normalização declarada:
  // CR e CRLF voltam como LF. Não é descuido, é o RFC 5545 §3.3.11: o único
  // escape de quebra de linha em valor TEXT é `\n`; não existe escape para um
  // CR isolado, e a leitura (`desdobrar`) já normaliza CR/CRLF para LF de
  // qualquer jeito. Guardar o CR seria inventar sintaxe fora do padrão.
  it("ida-e-volta escaparValorIcs -> desescapar devolve o texto idêntico (CR/CRLF normalizados para LF)", () => {
    const tabela: Array<{ entrada: string; esperado: string; porque: string }> = [
      { entrada: "texto simples", esperado: "texto simples", porque: "nada a escapar" },
      { entrada: "a;b", esperado: "a;b", porque: "ponto-e-vírgula" },
      { entrada: "a,b", esperado: "a,b", porque: "vírgula" },
      { entrada: "a\\b", esperado: "a\\b", porque: "backslash" },
      { entrada: "\\", esperado: "\\", porque: "backslash sozinho" },
      { entrada: "a\nb", esperado: "a\nb", porque: "LF" },
      { entrada: "a\rb", esperado: "a\nb", porque: "CR normaliza para LF" },
      { entrada: "a\r\nb", esperado: "a\nb", porque: "CRLF normaliza para um LF só" },
      { entrada: "Sessão à noite — ação", esperado: "Sessão à noite — ação", porque: "acento e travessão" },
      {
        // A armadilha de qualquer `desescapar` feito em várias passadas: o
        // backslash literal seguido da letra "n" vira `\\n` na escrita, e uma
        // passada que procure `\n` antes de `\\` lê isso como quebra de linha.
        entrada: "a\\nb",
        esperado: "a\\nb",
        porque: "backslash seguido da letra n (não é quebra de linha)",
      },
      {
        entrada: 'Sessão; "x", c:\\temp\nlinha 2\rlinha 3\r\nlinha 4',
        esperado: 'Sessão; "x", c:\\temp\nlinha 2\nlinha 3\nlinha 4',
        porque: "as três juntas: ; , \\ e as três formas de quebra",
      },
    ];

    for (const { entrada, esperado, porque } of tabela) {
      const escapado = escaparValorIcs(entrada);
      expect(escapado, `escrita de: ${porque}`).not.toMatch(/\r/);
      expect(desescapar(escapado), `ida-e-volta de: ${porque}`).toBe(esperado);
      // Ponto fixo: reescrever o que voltou dá exatamente o mesmo texto
      // escapado — é o que garante que a normalização acontece UMA vez, e
      // que o segundo round-trip não muda mais nada.
      expect(escaparValorIcs(esperado), `ponto fixo de: ${porque}`).toBe(escapado);
    }
  });
});

// ============================================================
// CR no texto do evento — o mesmo ataque do ATTENDEE, pela porta do SUMMARY
// e do DESCRIPTION. Hoje nenhum dos dois campos chega hostil pela Server
// Action (o nome é cortado no primeiro `\s`, a descrição é vocabulário
// fechado), mas `montarIcs` é API pública deste arquivo: o próximo chamador
// não pode herdar um escritor injetável.
// ============================================================

describe("montarIcs — CR no texto não quebra a estrutura do arquivo", () => {
  it("CR sozinho no título não sequestra SUMMARY nem inventa um LOCATION", () => {
    const titulo = "Maria\rSUMMARY:INJETADO\rLOCATION:https://evil.example";
    const conteudo = montarIcs({
      uid: "sessao-ses-12@mentoros",
      evento: eventoDe({ titulo }),
      agoraIso: AGORA_ISO,
    });

    const lido = analisarICS(conteudo, JANELA_DE, JANELA_ATE);
    expect(lido.eventos).toHaveLength(1);
    // O texto inteiro sobrevive como TÍTULO (com as quebras normalizadas),
    // e não como propriedades novas do arquivo.
    expect(lido.eventos[0].titulo).toBe("Maria\nSUMMARY:INJETADO\nLOCATION:https://evil.example");
    expect(lido.eventos[0].local).toBe("");
  });

  it("CR no DESCRIPTION não injeta LOCATION", () => {
    const descricao = "Sessão de mentoria\rLOCATION:https://evil.example";
    const conteudo = montarIcs({
      uid: "sessao-ses-13@mentoros",
      evento: eventoDe({ descricao }),
      agoraIso: AGORA_ISO,
    });

    const lido = analisarICS(conteudo, JANELA_DE, JANELA_ATE);
    expect(lido.eventos).toHaveLength(1);
    expect(lido.eventos[0].local).toBe("");
    expect(lido.eventos[0].descricao).toBe("Sessão de mentoria\nLOCATION:https://evil.example");
  });

  it("CRLF no título não trunca o texto nem cria um segundo VEVENT", () => {
    const titulo = "Maria\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:evil@atacante\r\nSUMMARY:Evento forjado";
    const conteudo = montarIcs({
      uid: "sessao-ses-14@mentoros",
      evento: eventoDe({ titulo }),
      agoraIso: AGORA_ISO,
    });

    const lido = analisarICS(conteudo, JANELA_DE, JANELA_ATE);
    // Contagem de VEVENTs: um só, no arquivo bruto e na releitura. Conta
    // LINHA FÍSICA igual a "BEGIN:VEVENT", não substring — o texto do
    // título contém essas mesmas letras de propósito, e como TEXTO elas são
    // inofensivas; o que não pode existir é uma linha começando com elas.
    const linhasBegin = conteudo.split("\r\n").filter((l) => l === "BEGIN:VEVENT");
    expect(linhasBegin).toHaveLength(1);
    expect(lido.eventos).toHaveLength(1);
    expect(lido.eventos.some((e) => e.uid === "evil@atacante")).toBe(false);
    // E o título NÃO some depois do primeiro CRLF (a perda silenciosa que o
    // revisor viu: relido = "Maria", o resto virava estrutura do arquivo).
    expect(lido.eventos[0].titulo).toBe(
      "Maria\nEND:VEVENT\nBEGIN:VEVENT\nUID:evil@atacante\nSUMMARY:Evento forjado"
    );
  });

  it("LF (o caso que já funcionava) continua funcionando — controle da tabela acima", () => {
    const titulo = "Maria\nSUMMARY:INJETADO";
    const conteudo = montarIcs({
      uid: "sessao-ses-15@mentoros",
      evento: eventoDe({ titulo }),
      agoraIso: AGORA_ISO,
    });
    const lido = analisarICS(conteudo, JANELA_DE, JANELA_ATE);
    expect(lido.eventos).toHaveLength(1);
    expect(lido.eventos[0].titulo).toBe(titulo);
  });
});
