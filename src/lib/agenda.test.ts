// Testes do leitor de iCalendar e da grade da agenda.
//
// O que está sendo protegido aqui é data — o tipo de erro que passa despercebido
// em revisão e aparece como "a reunião sumiu" três semanas depois.

import { describe, expect, it } from "vitest";
import {
  agruparPorDia,
  chaveDia,
  diaDaSemana,
  horaLocal,
  janelaAgenda,
  somarDias,
} from "./agenda";
import { analisarICS } from "./integracoes/ics";

/** Monta um .ics mínimo com o corpo de VEVENTs recebido. */
function ics(corpo: string, extras = ""): string {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "X-WR-CALNAME:Agenda do Jefson",
    "X-WR-TIMEZONE:America/Sao_Paulo",
    extras,
    corpo,
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");
}

const JANELA_DE = new Date("2026-08-01T00:00:00Z");
const JANELA_ATE = new Date("2026-09-30T00:00:00Z");

describe("analisarICS — o básico", () => {
  it("lê nome do calendário, título, local e descrição", () => {
    const a = analisarICS(
      ics(
        [
          "BEGIN:VEVENT",
          "UID:a@raro",
          "DTSTART;TZID=America/Sao_Paulo:20260806T090000",
          "DTEND;TZID=America/Sao_Paulo:20260806T100000",
          "SUMMARY:Mentoria com Carlos",
          "LOCATION:Sala 2",
          "DESCRIPTION:Revisar meta do mês",
          "END:VEVENT",
        ].join("\r\n")
      ),
      JANELA_DE,
      JANELA_ATE
    );
    expect(a.nome).toBe("Agenda do Jefson");
    expect(a.eventos).toHaveLength(1);
    expect(a.eventos[0].titulo).toBe("Mentoria com Carlos");
    expect(a.eventos[0].local).toBe("Sala 2");
    expect(a.eventos[0].descricao).toBe("Revisar meta do mês");
  });

  it("desdobra linha continuada (título longo não chega cortado)", () => {
    const a = analisarICS(
      ics(
        [
          "BEGIN:VEVENT",
          "UID:b@raro",
          "DTSTART;TZID=America/Sao_Paulo:20260806T090000",
          "SUMMARY:Call de alinhamento com a rede de afiliados do bra",
          " ço corpo",
          "END:VEVENT",
        ].join("\r\n")
      ),
      JANELA_DE,
      JANELA_ATE
    );
    expect(a.eventos[0].titulo).toBe("Call de alinhamento com a rede de afiliados do braço corpo");
  });

  it("desescapa vírgula, ponto-e-vírgula e quebra de linha", () => {
    const a = analisarICS(
      ics(
        [
          "BEGIN:VEVENT",
          "UID:c@raro",
          "DTSTART;TZID=America/Sao_Paulo:20260806T090000",
          "SUMMARY:Reunião\\, parte 1",
          "DESCRIPTION:linha 1\\nlinha 2\\; fim",
          "END:VEVENT",
        ].join("\r\n")
      ),
      JANELA_DE,
      JANELA_ATE
    );
    expect(a.eventos[0].titulo).toBe("Reunião, parte 1");
    expect(a.eventos[0].descricao).toBe("linha 1\nlinha 2; fim");
  });

  it("sem DTEND assume uma hora de duração", () => {
    const a = analisarICS(
      ics(
        [
          "BEGIN:VEVENT",
          "UID:d@raro",
          "DTSTART;TZID=America/Sao_Paulo:20260806T090000",
          "SUMMARY:Sem fim declarado",
          "END:VEVENT",
        ].join("\r\n")
      ),
      JANELA_DE,
      JANELA_ATE
    );
    const e = a.eventos[0];
    expect(e.fim.getTime() - e.inicio.getTime()).toBe(3600_000);
  });
});

describe("analisarICS — fuso horário", () => {
  it("TZID de São Paulo vira o instante certo em UTC (UTC−3)", () => {
    const a = analisarICS(
      ics(
        [
          "BEGIN:VEVENT",
          "UID:e@raro",
          "DTSTART;TZID=America/Sao_Paulo:20260806T090000",
          "DTEND;TZID=America/Sao_Paulo:20260806T100000",
          "SUMMARY:Nove da manhã em Brasília",
          "END:VEVENT",
        ].join("\r\n")
      ),
      JANELA_DE,
      JANELA_ATE
    );
    expect(a.eventos[0].inicio.toISOString()).toBe("2026-08-06T12:00:00.000Z");
    expect(horaLocal(a.eventos[0].inicio)).toBe("09:00");
  });

  it("data em UTC (sufixo Z) é lida como UTC e mostrada em Brasília", () => {
    const a = analisarICS(
      ics(
        [
          "BEGIN:VEVENT",
          "UID:f@raro",
          "DTSTART:20260806T120000Z",
          "DTEND:20260806T130000Z",
          "SUMMARY:Meio-dia UTC",
          "END:VEVENT",
        ].join("\r\n")
      ),
      JANELA_DE,
      JANELA_ATE
    );
    expect(horaLocal(a.eventos[0].inicio)).toBe("09:00");
  });

  it("evento de dia inteiro é marcado como tal", () => {
    const a = analisarICS(
      ics(
        [
          "BEGIN:VEVENT",
          "UID:g@raro",
          "DTSTART;VALUE=DATE:20260806",
          "DTEND;VALUE=DATE:20260807",
          "SUMMARY:Feriado",
          "END:VEVENT",
        ].join("\r\n")
      ),
      JANELA_DE,
      JANELA_ATE
    );
    expect(a.eventos[0].diaInteiro).toBe(true);
    expect(chaveDia(a.eventos[0].inicio)).toBe("2026-08-06");
  });

  // Esta é a razão de a expansão andar na hora de parede e não somar 7×24h:
  // do outro jeito, a reunião das 9h vira 8h na semana da virada.
  it("repetição semanal atravessando horário de verão mantém a hora local", () => {
    const a = analisarICS(
      ics(
        [
          "BEGIN:VEVENT",
          "UID:dst@raro",
          "DTSTART;TZID=America/New_York:20260226T090000",
          "DTEND;TZID=America/New_York:20260226T100000",
          "RRULE:FREQ=WEEKLY;COUNT=4",
          "SUMMARY:Semanal em Nova York",
          "END:VEVENT",
        ].join("\r\n")
      ),
      new Date("2026-02-01T00:00:00Z"),
      new Date("2026-04-30T00:00:00Z")
    );
    expect(a.eventos).toHaveLength(4);
    const horasNyc = a.eventos.map((e) =>
      new Intl.DateTimeFormat("en-GB", {
        timeZone: "America/New_York",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(e.inicio)
    );
    expect(new Set(horasNyc)).toEqual(new Set(["09:00"]));
  });
});

describe("analisarICS — repetição", () => {
  it("semanal com BYDAY gera uma ocorrência por dia marcado", () => {
    const a = analisarICS(
      ics(
        [
          "BEGIN:VEVENT",
          "UID:h@raro",
          "DTSTART;TZID=America/Sao_Paulo:20260803T090000",
          "DTEND;TZID=America/Sao_Paulo:20260803T100000",
          "RRULE:FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20260815T000000Z",
          "SUMMARY:Call da rede",
          "END:VEVENT",
        ].join("\r\n")
      ),
      new Date("2026-08-01T00:00:00Z"),
      new Date("2026-08-20T00:00:00Z")
    );
    // 03 (seg), 05 (qua), 10 (seg), 12 (qua) — o UNTIL corta antes de 17
    const dias = a.eventos.map((e) => chaveDia(e.inicio));
    expect(dias).toEqual(["2026-08-03", "2026-08-05", "2026-08-10", "2026-08-12"]);
  });

  it("COUNT limita o total de ocorrências", () => {
    const a = analisarICS(
      ics(
        [
          "BEGIN:VEVENT",
          "UID:i@raro",
          "DTSTART;TZID=America/Sao_Paulo:20260803T090000",
          "RRULE:FREQ=DAILY;COUNT=3",
          "SUMMARY:Três dias",
          "END:VEVENT",
        ].join("\r\n")
      ),
      JANELA_DE,
      JANELA_ATE
    );
    expect(a.eventos.map((e) => chaveDia(e.inicio))).toEqual([
      "2026-08-03",
      "2026-08-04",
      "2026-08-05",
    ]);
  });

  it("INTERVAL pula períodos", () => {
    const a = analisarICS(
      ics(
        [
          "BEGIN:VEVENT",
          "UID:j@raro",
          "DTSTART;TZID=America/Sao_Paulo:20260803T090000",
          "RRULE:FREQ=WEEKLY;INTERVAL=2;COUNT=3",
          "SUMMARY:Quinzenal",
          "END:VEVENT",
        ].join("\r\n")
      ),
      JANELA_DE,
      JANELA_ATE
    );
    expect(a.eventos.map((e) => chaveDia(e.inicio))).toEqual([
      "2026-08-03",
      "2026-08-17",
      "2026-08-31",
    ]);
  });

  it("EXDATE remove a data cancelada da série", () => {
    const a = analisarICS(
      ics(
        [
          "BEGIN:VEVENT",
          "UID:k@raro",
          "DTSTART;TZID=America/Sao_Paulo:20260803T090000",
          "RRULE:FREQ=DAILY;COUNT=3",
          "EXDATE;TZID=America/Sao_Paulo:20260804T090000",
          "SUMMARY:Com um dia furado",
          "END:VEVENT",
        ].join("\r\n")
      ),
      JANELA_DE,
      JANELA_ATE
    );
    expect(a.eventos.map((e) => chaveDia(e.inicio))).toEqual(["2026-08-03", "2026-08-05"]);
  });

  it("a janela recorta: série antiga só devolve o que toca o período pedido", () => {
    const a = analisarICS(
      ics(
        [
          "BEGIN:VEVENT",
          "UID:l@raro",
          "DTSTART;TZID=America/Sao_Paulo:20190107T090000",
          "RRULE:FREQ=WEEKLY;BYDAY=MO",
          "SUMMARY:Semanal desde 2019",
          "END:VEVENT",
        ].join("\r\n")
      ),
      new Date("2026-08-01T00:00:00Z"),
      new Date("2026-08-31T23:59:59Z")
    );
    expect(a.eventos.length).toBeGreaterThan(3);
    expect(a.eventos.length).toBeLessThan(7);
    for (const e of a.eventos) expect(diaDaSemana(chaveDia(e.inicio))).toBe(1);
  });

  it("regra que o leitor não sabe expandir é CONTADA, não inventada", () => {
    const a = analisarICS(
      ics(
        [
          "BEGIN:VEVENT",
          "UID:m@raro",
          "DTSTART;TZID=America/Sao_Paulo:20260803T090000",
          "RRULE:FREQ=MONTHLY;BYDAY=MO;BYSETPOS=1",
          "SUMMARY:Primeira segunda do mês",
          "END:VEVENT",
        ].join("\r\n")
      ),
      JANELA_DE,
      JANELA_ATE
    );
    expect(a.naoExpandidos).toBe(1);
    expect(a.eventos).toHaveLength(1);
  });

  it("STATUS:CANCELLED marca o evento em vez de escondê-lo", () => {
    const a = analisarICS(
      ics(
        [
          "BEGIN:VEVENT",
          "UID:n@raro",
          "DTSTART;TZID=America/Sao_Paulo:20260806T090000",
          "STATUS:CANCELLED",
          "SUMMARY:Desmarcada",
          "END:VEVENT",
        ].join("\r\n")
      ),
      JANELA_DE,
      JANELA_ATE
    );
    expect(a.eventos[0].cancelado).toBe(true);
  });
});

describe("janelaAgenda", () => {
  it("dia devolve um dia só", () => {
    const j = janelaAgenda("dia", "2026-08-06");
    expect(j.dias).toEqual(["2026-08-06"]);
    expect(j.anterior).toBe("2026-08-05");
    expect(j.proximo).toBe("2026-08-07");
  });

  it("semana começa no domingo e tem sete dias", () => {
    const j = janelaAgenda("semana", "2026-08-06"); // quinta
    expect(j.dias).toHaveLength(7);
    expect(j.primeiro).toBe("2026-08-02");
    expect(j.ultimo).toBe("2026-08-08");
    expect(diaDaSemana(j.primeiro)).toBe(0);
  });

  it("mês fecha a grade em múltiplo de sete e cobre o mês inteiro", () => {
    const j = janelaAgenda("mes", "2026-08-06");
    expect(j.dias.length % 7).toBe(0);
    expect(j.dias).toContain("2026-08-01");
    expect(j.dias).toContain("2026-08-31");
    expect(diaDaSemana(j.primeiro)).toBe(0);
    expect(diaDaSemana(j.ultimo)).toBe(6);
  });

  it("janeiro volta para dezembro do ano anterior", () => {
    expect(janelaAgenda("mes", "2026-01-15").anterior).toBe("2025-12-01");
    expect(janelaAgenda("mes", "2026-12-15").proximo).toBe("2027-01-01");
  });

  it("somarDias atravessa virada de mês e de ano", () => {
    expect(somarDias("2026-08-31", 1)).toBe("2026-09-01");
    expect(somarDias("2026-01-01", -1)).toBe("2025-12-31");
  });
});

describe("agruparPorDia", () => {
  it("evento que atravessa a meia-noite aparece nos dois dias", () => {
    const a = analisarICS(
      ics(
        [
          "BEGIN:VEVENT",
          "UID:o@raro",
          "DTSTART;TZID=America/Sao_Paulo:20260806T230000",
          "DTEND;TZID=America/Sao_Paulo:20260807T010000",
          "SUMMARY:Live da virada",
          "END:VEVENT",
        ].join("\r\n")
      ),
      JANELA_DE,
      JANELA_ATE
    );
    const mapa = agruparPorDia(a.eventos, ["2026-08-06", "2026-08-07"]);
    expect(mapa["2026-08-06"]).toHaveLength(1);
    expect(mapa["2026-08-07"]).toHaveLength(1);
  });

  it("evento que termina exatamente à meia-noite não vaza para o dia seguinte", () => {
    const a = analisarICS(
      ics(
        [
          "BEGIN:VEVENT",
          "UID:p@raro",
          "DTSTART;TZID=America/Sao_Paulo:20260806T230000",
          "DTEND;TZID=America/Sao_Paulo:20260807T000000",
          "SUMMARY:Até a meia-noite",
          "END:VEVENT",
        ].join("\r\n")
      ),
      JANELA_DE,
      JANELA_ATE
    );
    const mapa = agruparPorDia(a.eventos, ["2026-08-06", "2026-08-07"]);
    expect(mapa["2026-08-06"]).toHaveLength(1);
    expect(mapa["2026-08-07"]).toHaveLength(0);
  });

  it("dia inteiro vem antes dos eventos com hora", () => {
    const a = analisarICS(
      ics(
        [
          "BEGIN:VEVENT",
          "UID:q1@raro",
          "DTSTART;TZID=America/Sao_Paulo:20260806T090000",
          "SUMMARY:Com hora",
          "END:VEVENT",
          "BEGIN:VEVENT",
          "UID:q2@raro",
          "DTSTART;VALUE=DATE:20260806",
          "DTEND;VALUE=DATE:20260807",
          "SUMMARY:Dia inteiro",
          "END:VEVENT",
        ].join("\r\n")
      ),
      JANELA_DE,
      JANELA_ATE
    );
    const mapa = agruparPorDia(a.eventos, ["2026-08-06"]);
    expect(mapa["2026-08-06"][0].titulo).toBe("Dia inteiro");
  });
});
