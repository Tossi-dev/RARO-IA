import { describe, expect, it } from "vitest";
import {
  codigoValido,
  lerCodigo,
  lerFila,
  lerRecusa,
  lerSegmento,
  resumirSegmento,
} from "./codigo";

describe("lerCodigo — achar a etiqueta dentro da mensagem", () => {
  const mensagem =
    "Jefson, fiz o diagnóstico no seu site.\n\n" +
    "Faturo entre R$ 3 e 10 milhões e sou dono. O que mais me trava hoje: eu ainda faço o " +
    "trabalho técnico que devia estar delegando. Nos últimos 12 meses eu perdi a conta de " +
    "quantas coisas comecei e não terminei.\n\nQuero resolver isso essa semana.\n\n[JR-B1-T5-3-K7QM]";

  it("acha o código no fim da mensagem que a landing monta", () => {
    expect(lerCodigo(mensagem)).toBe("JR-B1-T5-3-K7QM");
  });

  it("acha mesmo quando a pessoa escreveu antes ou depois", () => {
    expect(lerCodigo("oi [JR-A2-T1-0-ZZZZ] bom dia")).toBe("JR-A2-T1-0-ZZZZ");
  });

  it("aceita minúsculas — gente copia e cola de tudo quanto é lugar", () => {
    expect(lerCodigo("segue: [jr-c4-t7-1-abcd]")).toBe("JR-C4-T7-1-ABCD");
  });

  it("devolve null na mensagem comum, que é a maioria absoluta", () => {
    expect(lerCodigo("Bom dia, vi seu vídeo e queria conversar")).toBeNull();
    expect(lerCodigo("")).toBeNull();
  });

  it("não casa sem os colchetes: o texto solto pode ser qualquer coisa", () => {
    expect(lerCodigo("meu codigo é JR-B1-T5-3-K7QM")).toBeNull();
  });

  it("não casa com código de recusa dentro de mensagem", () => {
    // Quem não passou no critério nunca recebe botão de WhatsApp. Um código de
    // recusa dentro de uma mensagem só existe se alguém montou o texto à mão —
    // e casar com ele daria atendimento a quem a landing acabou de recusar.
    expect(lerCodigo("[JR-F-K7QM]")).toBeNull();
  });

  it("não quebra com entrada que não é texto", () => {
    expect(lerCodigo(undefined as unknown as string)).toBeNull();
    expect(lerCodigo(42 as unknown as string)).toBeNull();
  });
});

describe("lerSegmento — o que o código diz", () => {
  it("lê as quatro dimensões e o sufixo", () => {
    const s = lerSegmento("JR-B1-T5-3-K7QM")!;
    expect(s.faixa).toBe("B");
    expect(s.urgencia).toBe(1);
    expect(s.travaDeclarada).toBe("T5");
    expect(s.inacabados).toBe(3);
    expect(s.sufixo).toBe("K7QM");
  });

  it("recusa formato antigo, sem sufixo — ele não identifica ninguém", () => {
    expect(lerSegmento("JR-B1-T5-3")).toBeNull();
  });

  it("recusa dígito fora da faixa declarada", () => {
    expect(lerSegmento("JR-D1-T5-3-K7QM")).toBeNull(); // faixa D não existe
    expect(lerSegmento("JR-B5-T5-3-K7QM")).toBeNull(); // urgência 5 não existe
    expect(lerSegmento("JR-B1-T8-3-K7QM")).toBeNull(); // T8 não existe
    expect(lerSegmento("JR-B1-T5-4-K7QM")).toBeNull(); // inacabados vai até 3
  });

  it("recusa sufixo com caractere ambíguo — 0, O, 1 e I ficaram fora do alfabeto", () => {
    expect(lerSegmento("JR-B1-T5-3-K0QM")).toBeNull();
    expect(lerSegmento("JR-B1-T5-3-KIQM")).toBeNull();
  });
});

describe("a regra da porta e do quarto", () => {
  it("três ou mais coisas pela metade: abre por onde ele apontou, entrega na T3", () => {
    const s = lerSegmento("JR-B1-T1-3-K7QM")!;
    expect(s.travaDeclarada).toBe("T1"); // a porta — é por aqui que a conversa começa
    expect(s.travaDeTrabalho).toBe("T3"); // o quarto — é isto que a mentoria resolve
    expect(s.atravessar).toBe(true);
  });

  it("o limite é 2, não 3: 'umas três ou quatro' já conta", () => {
    expect(lerSegmento("JR-B1-T1-2-K7QM")!.travaDeTrabalho).toBe("T3");
    expect(lerSegmento("JR-B1-T1-1-K7QM")!.travaDeTrabalho).toBe("T1");
    expect(lerSegmento("JR-B1-T1-1-K7QM")!.atravessar).toBe(false);
  });

  it("quem já declarou T3 não atravessa: a porta e o quarto são o mesmo cômodo", () => {
    const s = lerSegmento("JR-B1-T3-3-K7QM")!;
    expect(s.travaDeclarada).toBe("T3");
    expect(s.travaDeTrabalho).toBe("T3");
    expect(s.atravessar).toBe(false);
  });

  it("a regra vale para as seis travas que não são a T3", () => {
    for (const t of ["T1", "T2", "T4", "T5", "T6", "T7"]) {
      const s = lerSegmento(`JR-B1-${t}-3-K7QM`)!;
      expect(s.travaDeTrabalho).toBe("T3");
      expect(s.travaDeclarada).toBe(t);
    }
  });

  it("é determinística: o mesmo código dá o mesmo resultado sempre", () => {
    const a = lerSegmento("JR-C2-T6-2-WXYZ");
    const b = lerSegmento("JR-C2-T6-2-WXYZ");
    expect(a).toEqual(b);
  });
});

describe("lerRecusa — quem não passou no critério", () => {
  it("lê os três motivos", () => {
    expect(lerRecusa("JR-F-K7QM")!.motivo).toBe("F");
    expect(lerRecusa("JR-G-K7QM")!.motivo).toBe("G");
    expect(lerRecusa("JR-N-K7QM")!.motivo).toBe("N");
  });

  it("código qualificado não é recusa, e vice-versa", () => {
    expect(lerRecusa("JR-B1-T5-3-K7QM")).toBeNull();
    expect(lerSegmento("JR-F-K7QM")).toBeNull();
  });

  it("codigoValido aceita os dois formatos e recusa o resto", () => {
    expect(codigoValido("JR-B1-T5-3-K7QM")).toBe(true);
    expect(codigoValido("JR-F-K7QM")).toBe(true);
    expect(codigoValido("JR-B1-T5-3")).toBe(false);
    expect(codigoValido("qualquer coisa")).toBe(false);
  });
});

describe("lerFila — a ordem de resposta", () => {
  it("quem disse 'já passou da hora' tem prazo em horas", () => {
    const f = lerFila(1);
    expect(f.prioridade).toBe(1);
    expect(f.prazo).toContain("2 horas");
    expect(f.abordarAgora).toBe(true);
  });

  it("quem está pesquisando entra na lista, sem abordagem comercial", () => {
    const f = lerFila(4);
    expect(f.temperatura).toBe("frio");
    expect(f.abordarAgora).toBe(false);
  });

  it("a prioridade é estritamente crescente com a urgência", () => {
    const p = ([1, 2, 3, 4] as const).map((u) => lerFila(u).prioridade);
    expect(p).toEqual([1, 2, 3, 4]);
  });

  it("a faixa não entra na fila — dois segmentos com a mesma urgência esperam igual", () => {
    // A regra: faixa muda preço e formato no fechamento, nunca a velocidade do
    // atendimento. O teste existe para que ninguém "otimize" isso depois.
    const rico = lerSegmento("JR-C1-T5-3-AAAA")!;
    const menor = lerSegmento("JR-A1-T5-3-BBBB")!;
    expect(lerFila(rico.urgencia)).toEqual(lerFila(menor.urgencia));
  });
});

describe("resumirSegmento — a linha que o Jefson lê", () => {
  it("mostra as duas travas quando elas são diferentes", () => {
    const s = lerSegmento("JR-B1-T5-3-K7QM")!;
    const linha = resumirSegmento(s);
    expect(linha).toContain("R$ 3 a 10 milhões/ano");
    expect(linha).toContain("T5 pela porta, T3 no quarto");
    expect(linha).toContain("essa semana");
  });

  it("mostra uma trava só quando a porta e o quarto coincidem", () => {
    const linha = resumirSegmento(lerSegmento("JR-A3-T3-0-ZZZZ")!);
    expect(linha).toContain("· T3 ·");
    expect(linha).not.toContain("porta");
  });
});
