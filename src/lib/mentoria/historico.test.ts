import { describe, expect, it } from "vitest";
import {
  TIPOS_FATO,
  VISIBILIDADE_POR_TIPO,
  historicoDe,
  projetarParaPortal,
  visibilidadeDoTipo,
  type CobrancaDoHistorico,
  type EntradaHistorico,
  type FatoHistorico,
  type TipoFato,
} from "./historico";
import type { ConteudoLiberado, Marco, ScoreEvolucao, Sessao, TarefaMentoria } from "./tipos";
import type { Atividade, Interacao, Nota } from "../types";
import type { Documento } from "../documentos/dados";

const AGORA = "2026-05-20T12:00:00.000Z";

// ---------- fixtures mínimas ----------
// Mesmo estilo de `saude-mentorado.test.ts`: só o campo que o histórico
// realmente lê recebe valor "de verdade"; o resto fica no valor mais neutro
// possível, para o teste deixar explícito o que NÃO influencia o resultado.

function sessaoDe(parcial: Partial<Sessao>): Sessao {
  return {
    id: "sessao-1",
    workspaceId: "ws-1",
    matriculaId: "matricula-1",
    turmaId: null,
    numero: null,
    quando: "2026-05-04T14:00:00.000Z",
    duracaoMin: 60,
    status: "realizada",
    linkGravacao: "",
    transcricao: "",
    resumo: "",
    eventoGoogleId: "",
    linkReuniao: "",
    gravacaoLiberada: false,
    transcricaoLiberada: false,
    transcritaEm: null,
    transcricaoOrigem: "",
    criadoEm: "2026-05-01T00:00:00.000Z",
    ...parcial,
  };
}

function tarefaDe(parcial: Partial<TarefaMentoria>): TarefaMentoria {
  return {
    id: "tarefa-1",
    workspaceId: "ws-1",
    mentoradoId: "mentorado-1",
    sessaoId: null,
    titulo: "Escrever a oferta",
    prazo: null,
    concluida: false,
    concluidaEm: null,
    marcadaPor: "",
    criadoEm: "2026-05-05T09:00:00.000Z",
    ...parcial,
  };
}

function marcoDe(parcial: Partial<Marco>): Marco {
  return {
    id: "marco-1",
    workspaceId: "ws-1",
    mentoradoId: "mentorado-1",
    titulo: "Primeiro cliente fechado",
    descricao: "",
    conquistadoEm: "2026-05-06T10:00:00.000Z",
    criadoEm: "2026-05-06T10:00:00.000Z",
    ...parcial,
  };
}

function conteudoDe(parcial: Partial<ConteudoLiberado>): ConteudoLiberado {
  return {
    id: "conteudo-1",
    workspaceId: "ws-1",
    mentoradoId: "mentorado-1",
    titulo: "Aula 3 — precificação",
    url: "https://exemplo.com/aula-3?token=abcdef",
    liberadoEm: "2026-05-07T08:00:00.000Z",
    criadoEm: "2026-05-07T08:00:00.000Z",
    ...parcial,
  };
}

function documentoDe(parcial: Partial<Documento>): Documento {
  return {
    id: "documento-1",
    workspaceId: "ws-1",
    mentoradoId: "mentorado-1",
    alunoId: null,
    titulo: "Material da sessão",
    caminhoStorage: "ws-1/mentorado-1/material.pdf",
    mime: "application/pdf",
    bytes: null,
    categoria: "material",
    visivelPortal: true,
    enviadoPor: null,
    criadoEm: "2026-05-08T11:00:00.000Z",
    arquivado: false,
    ...parcial,
  };
}

function notaDe(parcial: Partial<Nota>): Nota {
  return {
    id: "nota-1",
    alunoId: "aluno-1",
    autor: "Jefson",
    texto: "Cliente reclamou do preço",
    criadoEm: "2026-05-09T13:00:00.000Z",
    ...parcial,
  };
}

function atividadeDe(parcial: Partial<Atividade>): Atividade {
  return {
    id: "atividade-1",
    alunoId: "aluno-1",
    tipo: "ligacao",
    titulo: "Liguei para confirmar",
    detalhe: "",
    data: "2026-05-10T15:00:00.000Z",
    ...parcial,
  };
}

function interacaoDe(parcial: Partial<Interacao>): Interacao {
  return {
    id: "interacao-1",
    alunoId: "aluno-1",
    canal: "whatsapp",
    direcao: "recebida",
    texto: "Bom dia, consigo remarcar?",
    quando: "2026-05-19T16:00:00.000Z",
    idExterno: "wa-1",
    tipoMidia: "",
    nomeExibicao: "Maria",
    telefone: "11988887777",
    ...parcial,
  };
}

function scoreDe(parcial: Partial<ScoreEvolucao>): ScoreEvolucao {
  return {
    id: "score-1",
    workspaceId: "ws-1",
    mentoradoId: "mentorado-1",
    semana: "2026-05-11",
    score: 72,
    motivo: "Presença em dia",
    criadoEm: "2026-05-11T00:00:00.000Z",
    ...parcial,
  };
}

function cobrancaDe(parcial: Partial<CobrancaDoHistorico>): CobrancaDoHistorico {
  return {
    competencia: "2026-05-01",
    vencimento: "2026-05-12T00:00:00.000Z",
    valor: 1500,
    status: "aberta",
    ...parcial,
  };
}

/**
 * Uma entrada que produz PELO MENOS UM fato de cada tipo declarado. É a base
 * do teste de completude: se um tipo novo nascer amanhã e ninguém souber
 * construí-lo, o teste que compara os tipos produzidos com `TIPOS_FATO`
 * quebra — que é exatamente o alarme que se quer.
 */
function entradaCompleta(): EntradaHistorico {
  return {
    sessoes: [sessaoDe({})],
    tarefas: [tarefaDe({})],
    marcos: [marcoDe({})],
    conteudos: [conteudoDe({})],
    documentos: [
      documentoDe({ id: "documento-portal", visivelPortal: true }),
      documentoDe({ id: "documento-fechado", visivelPortal: false, categoria: "contrato" }),
    ],
    notas: [notaDe({})],
    atividades: [atividadeDe({})],
    interacoes: [interacaoDe({})],
    scores: [scoreDe({})],
    cobrancas: [cobrancaDe({})],
  };
}

// Padrões escritos AQUI, de propósito, e não importados do módulo: um teste
// que reusa a mesma expressão regular da implementação passa mesmo quando a
// expressão está errada — ele estaria conferindo o código com o próprio código.
//
// `PADRAO_DINHEIRO` cobra "R$", "BRL" e valor numérico seguido de "reais" —
// e NÃO a palavra "reais" solta. Valor escrito só por extenso ("cinco mil
// reais") está fora do alcance de qualquer expressão regular honesta, e
// fingir que está dentro criaria uma falsa sensação de garantia. A garantia
// de verdade é a classificação: cobrança nasce `interno` e nunca chega ao
// portão (é o que o teste "cobrança nasce interna" verifica).
const PADRAO_EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const PADRAO_TELEFONE = /\d{4,5}[\s.-]?\d{4}/;
const PADRAO_DINHEIRO = /(R\$|\bBRL\b|\d[\d.,]*\s*(?:mil\s*)?reais\b)/i;

function tiposProduzidos(fatos: readonly FatoHistorico[]): TipoFato[] {
  return Array.from(new Set(fatos.map((f) => f.tipo))).sort();
}

describe("historicoDe — classificação e visibilidade", () => {
  it("nenhum fato interno sobrevive a projetarParaPortal, varrendo TODOS os tipos declarados", () => {
    // A varredura é sobre `TIPOS_FATO`, não sobre uma amostra escolhida a
    // dedo: um tipo criado amanhã entra automaticamente neste laço.
    for (const tipo of TIPOS_FATO) {
      const fato: FatoHistorico = {
        quando: AGORA,
        tipo,
        titulo: `fato de ${tipo}`,
        detalhe: "",
        visibilidade: VISIBILIDADE_POR_TIPO[tipo],
      };
      const projetado = projetarParaPortal([fato]);
      if (VISIBILIDADE_POR_TIPO[tipo] === "interno") {
        expect(projetado, `tipo "${tipo}" é interno e vazou para o portal`).toEqual([]);
      } else {
        expect(projetado, `tipo "${tipo}" é público e sumiu do portal`).toHaveLength(1);
      }
    }

    // E de uma vez só, com todos juntos: nada de `interno` sai do outro lado.
    const todos: FatoHistorico[] = TIPOS_FATO.map((tipo) => ({
      quando: AGORA,
      tipo,
      titulo: `fato de ${tipo}`,
      detalhe: "",
      visibilidade: VISIBILIDADE_POR_TIPO[tipo],
    }));
    for (const fato of projetarParaPortal(todos)) {
      expect(fato.visibilidade).toBe("publico");
      expect(VISIBILIDADE_POR_TIPO[fato.tipo]).toBe("publico");
    }
  });

  it("a lista de tipos públicos é exatamente esta, e mudá-la exige mudar este teste", () => {
    // Trava explícita do combinado. A varredura acima confere que o portão
    // RESPEITA a classificação; ela não consegue perceber se a classificação
    // em si mudou — um `nota: "publico"` seria coerente consigo mesmo e
    // passaria por lá. Esta asserção é a que quebra nesse caso: quem quiser
    // abrir um tipo novo para o mentorado tem que vir aqui e dizer isso com
    // todas as letras, num arquivo de teste, e não de passagem numa linha
    // de tabela.
    const publicos = TIPOS_FATO.filter((t) => VISIBILIDADE_POR_TIPO[t] === "publico").sort();
    expect(publicos).toEqual(["conteudo", "documento_portal", "marco", "sessao", "tarefa"]);

    const internos = TIPOS_FATO.filter((t) => VISIBILIDADE_POR_TIPO[t] === "interno").sort();
    expect(internos).toEqual([
      "atividade",
      "cobranca",
      "documento_interno",
      "interacao",
      "nota",
      "score",
      "temperatura",
    ]);
  });

  it("todo tipo declarado tem classificação e é realmente produzido por historicoDe", () => {
    // Sem esta asserção, um tipo poderia ser declarado, classificado e nunca
    // construído — e a varredura acima passaria a testar código morto.
    expect(Object.keys(VISIBILIDADE_POR_TIPO).sort()).toEqual([...TIPOS_FATO].sort());
    expect(new Set(TIPOS_FATO).size).toBe(TIPOS_FATO.length);

    const fatos = historicoDe(entradaCompleta(), AGORA);
    expect(tiposProduzidos(fatos)).toEqual([...TIPOS_FATO].sort());
  });

  it("tipo desconhecido cai em interno (fail-closed)", () => {
    expect(visibilidadeDoTipo("tipo_que_ninguem_declarou")).toBe("interno");
    expect(visibilidadeDoTipo("")).toBe("interno");
    expect(visibilidadeDoTipo(null)).toBe("interno");
    expect(visibilidadeDoTipo(undefined)).toBe("interno");
    expect(visibilidadeDoTipo(42)).toBe("interno");
    expect(visibilidadeDoTipo({ tipo: "sessao" })).toBe("interno");
    expect(visibilidadeDoTipo("SESSAO")).toBe("interno");

    // Um fato forjado — tipo que o módulo não conhece, carimbado de público —
    // não entra no portal só porque o campo `visibilidade` afirma que sim.
    const forjadoTipo = {
      quando: AGORA,
      tipo: "tipo_que_ninguem_declarou" as TipoFato,
      titulo: "nota do mentor",
      detalhe: "",
      visibilidade: "publico" as const,
    };
    expect(projetarParaPortal([forjadoTipo])).toEqual([]);

    // E o inverso: tipo declarado como interno com o carimbo trocado para
    // público também não passa. Os dois têm que concordar.
    const forjadaVisibilidade: FatoHistorico = {
      quando: AGORA,
      tipo: "nota",
      titulo: "nota do mentor",
      detalhe: "",
      visibilidade: "publico",
    };
    expect(projetarParaPortal([forjadaVisibilidade])).toEqual([]);
  });

  it("o carimbo de visibilidade de cada fato construído bate com a classificação do tipo", () => {
    for (const fato of historicoDe(entradaCompleta(), AGORA)) {
      expect(fato.visibilidade).toBe(VISIBILIDADE_POR_TIPO[fato.tipo]);
    }
  });

  it("documento não visível no portal nasce interno; visível no portal, público", () => {
    const fatos = historicoDe(
      {
        documentos: [
          documentoDe({ id: "d-visivel", titulo: "Apostila", visivelPortal: true }),
          documentoDe({ id: "d-fechado", titulo: "Contrato assinado", visivelPortal: false }),
          // Arquivado é fail-closed: mesmo marcado como visível, não vai ao portal.
          documentoDe({ id: "d-arquivado", titulo: "Versão antiga", visivelPortal: true, arquivado: true }),
        ],
      },
      AGORA,
    );

    const publicos = projetarParaPortal(fatos);
    expect(publicos).toHaveLength(1);
    expect(publicos[0].titulo).toContain("Apostila");
    expect(fatos.filter((f) => f.visibilidade === "interno")).toHaveLength(2);
  });
});

describe("historicoDe — ordem", () => {
  it("ordem decrescente por quando", () => {
    const fatos = historicoDe(entradaCompleta(), AGORA);
    const instantes = fatos
      .map((f) => Date.parse(f.quando))
      .filter((t) => Number.isFinite(t));
    for (let i = 1; i < instantes.length; i += 1) {
      expect(instantes[i - 1]).toBeGreaterThanOrEqual(instantes[i]);
    }
  });

  it("dois fatos no mesmo instante saem sempre na mesma ordem entre execuções", () => {
    const mesmoInstante = "2026-05-06T10:00:00.000Z";
    const entrada: EntradaHistorico = {
      sessoes: [
        sessaoDe({ id: "s-1", quando: mesmoInstante, numero: 1 }),
        sessaoDe({ id: "s-2", quando: mesmoInstante, numero: 2 }),
      ],
      marcos: [marcoDe({ id: "m-1", conquistadoEm: mesmoInstante })],
      tarefas: [tarefaDe({ id: "t-1", concluida: true, concluidaEm: mesmoInstante })],
      notas: [notaDe({ id: "n-1", criadoEm: mesmoInstante })],
    };

    const invertida: EntradaHistorico = {
      notas: entrada.notas,
      tarefas: entrada.tarefas,
      marcos: entrada.marcos,
      sessoes: [...(entrada.sessoes ?? [])].reverse(),
    };

    const primeira = historicoDe(entrada, AGORA);
    const segunda = historicoDe(entrada, AGORA);
    const terceira = historicoDe(invertida, AGORA);

    expect(JSON.stringify(segunda)).toBe(JSON.stringify(primeira));
    // A ordem NÃO pode depender da ordem em que as listas chegaram: é isso que
    // separa um desempate declarado de uma sorte de `Array.sort`.
    expect(JSON.stringify(terceira)).toBe(JSON.stringify(primeira));

    // E o desempate é por tipo, na ordem fixa declarada em `TIPOS_FATO`.
    const ordemDoTipo = (t: TipoFato) => TIPOS_FATO.indexOf(t);
    for (let i = 1; i < primeira.length; i += 1) {
      if (primeira[i - 1].quando === primeira[i].quando) {
        expect(ordemDoTipo(primeira[i - 1].tipo)).toBeLessThanOrEqual(ordemDoTipo(primeira[i].tipo));
      }
    }
  });

  it("data inválida não lança e vai para o fim", () => {
    const entrada: EntradaHistorico = {
      sessoes: [
        sessaoDe({ id: "s-boa", quando: "2026-05-04T14:00:00.000Z" }),
        sessaoDe({ id: "s-vazia", quando: "" }),
        sessaoDe({ id: "s-lixo", quando: "ontem de manhã" }),
      ],
      marcos: [marcoDe({ id: "m-boa", conquistadoEm: "1990-01-01T00:00:00.000Z" })],
    };

    let fatos: FatoHistorico[] = [];
    expect(() => {
      fatos = historicoDe(entrada, AGORA);
    }).not.toThrow();

    expect(fatos).toHaveLength(4);
    const invalidos = fatos.filter((f) => !Number.isFinite(Date.parse(f.quando)));
    expect(invalidos).toHaveLength(2);
    // Os dois inválidos são os DOIS ÚLTIMOS — inclusive depois de um fato
    // válido de 1990, que é o mais antigo de todos.
    expect(fatos.slice(-2).every((f) => !Number.isFinite(Date.parse(f.quando)))).toBe(true);
    // E a data crua nunca é substituída por uma inventada.
    expect(fatos.map((f) => f.quando)).toContain("ontem de manhã");
  });

  it("data inválida vai para o fim mesmo depois de um fato válido ANTERIOR a 1970", () => {
    // Este teste existe porque o de cima passa por coincidência aritmética: o
    // fato válido mais antigo dele é de 1990, e 1990 é depois de 1970 — então
    // uma implementação que traduzisse data inválida para o epoch (zero) o
    // deixaria verde do mesmo jeito. Com um fato válido de 1969 as duas regras
    // se separam: "sem data" tem que ficar DEPOIS de 1969, e só fica se a
    // ausência de data for tratada como ausência, e não como 1970.
    const fatos = historicoDe(
      {
        marcos: [
          marcoDe({ id: "m-1969", titulo: "Antigo", conquistadoEm: "1969-01-01T00:00:00.000Z" }),
          marcoDe({ id: "m-sem-data", titulo: "Sem data", conquistadoEm: "ontem de manhã" }),
        ],
      },
      AGORA,
    );

    expect(fatos.map((f) => f.titulo)).toEqual(["Marco: Antigo", "Marco: Sem data"]);
    // E a data crua continua intacta, nunca substituída por uma inventada.
    expect(fatos[1].quando).toBe("ontem de manhã");
  });

  it("agoraIso inválido não lança e não inventa fato nenhum", () => {
    let fatos: FatoHistorico[] = [];
    expect(() => {
      fatos = historicoDe(entradaCompleta(), "não é data");
    }).not.toThrow();
    expect(fatos.length).toBeGreaterThan(0);
    // A leitura de temperatura depende de "agora"; sem agora confiável, ela
    // simplesmente não existe — nunca uma temperatura chutada.
    expect(fatos.some((f) => f.tipo === "temperatura")).toBe(false);
  });
});

describe("historicoDe — ausência de dado", () => {
  it("lista vazia devolve [] e não null", () => {
    expect(historicoDe({}, AGORA)).toEqual([]);
    expect(historicoDe({}, AGORA)).not.toBeNull();
    expect(
      historicoDe(
        { sessoes: [], tarefas: [], marcos: [], notas: [], interacoes: [], cobrancas: [] },
        AGORA,
      ),
    ).toEqual([]);
    expect(projetarParaPortal([])).toEqual([]);
  });

  it("sem interação nenhuma não existe fato de temperatura", () => {
    const fatos = historicoDe({ sessoes: [sessaoDe({})] }, AGORA);
    expect(fatos.some((f) => f.tipo === "temperatura")).toBe(false);
  });

  it("interações existem, mas nenhuma com data válida: nenhuma temperatura chutada", () => {
    // `lerTemperatura` devolve `temperatura: null` sempre que NENHUMA
    // interação tem data parseável — não só quando a lista está vazia. Sem
    // este teste, trocar a guarda por `?? "frio"` continuaria verde e a tela
    // diria "Frio" com o próprio "porquê" respondendo "nenhuma conversa
    // registrada" na linha de baixo: veredito sobre zero base, que é
    // exatamente o D2 do plano.
    const fatos = historicoDe(
      {
        interacoes: [
          interacaoDe({ id: "i-sem-data", quando: "ontem" }),
          interacaoDe({ id: "i-vazia", quando: "" }),
        ],
      },
      AGORA,
    );

    // As duas interações viram fato (a casa não apaga); a temperatura é que
    // não nasce.
    expect(fatos).toHaveLength(2);
    expect(fatos.some((f) => f.tipo === "temperatura")).toBe(false);
    expect(JSON.stringify(fatos)).not.toContain("Temperatura");
  });

  it("não muta as listas recebidas", () => {
    const sessoes = Object.freeze([
      sessaoDe({ id: "s-1", quando: "2026-05-01T00:00:00.000Z" }),
      sessaoDe({ id: "s-2", quando: "2026-05-09T00:00:00.000Z" }),
    ]);
    expect(() => historicoDe({ sessoes }, AGORA)).not.toThrow();
    expect(sessoes[0].id).toBe("s-1");
  });
});

describe("projetarParaPortal — o que chega ao mentorado", () => {
  it("nenhum campo de detalhe carrega telefone, e-mail ou valor em reais quando a visibilidade é publico", () => {
    const veneno = "Falar com 11 98888-7777 ou jefson@exemplo.com.br, cobrar R$ 5.000,00 (5 mil reais)";
    const entrada: EntradaHistorico = {
      sessoes: [sessaoDe({ resumo: veneno, transcricao: veneno, linkGravacao: "https://x/y" })],
      tarefas: [tarefaDe({ titulo: veneno, concluida: true, concluidaEm: "2026-05-05T10:00:00.000Z" })],
      marcos: [marcoDe({ titulo: veneno, descricao: veneno })],
      conteudos: [conteudoDe({ titulo: veneno })],
      documentos: [documentoDe({ titulo: veneno, visivelPortal: true })],
      // Fatos internos entram na entrada de propósito: eles são o vazamento
      // que a projeção existe para impedir.
      cobrancas: [cobrancaDe({ valor: 5000 })],
      notas: [notaDe({ texto: veneno })],
      interacoes: [interacaoDe({ texto: veneno })],
    };

    const publicos = projetarParaPortal(historicoDe(entrada, AGORA));
    expect(publicos.length).toBeGreaterThan(0);
    for (const fato of publicos) {
      expect(fato.detalhe, `detalhe de "${fato.tipo}" tem e-mail`).not.toMatch(PADRAO_EMAIL);
      expect(fato.detalhe, `detalhe de "${fato.tipo}" tem telefone`).not.toMatch(PADRAO_TELEFONE);
      expect(fato.detalhe, `detalhe de "${fato.tipo}" tem valor em reais`).not.toMatch(PADRAO_DINHEIRO);
      expect(fato.titulo, `titulo de "${fato.tipo}" tem e-mail`).not.toMatch(PADRAO_EMAIL);
      expect(fato.titulo, `titulo de "${fato.tipo}" tem telefone`).not.toMatch(PADRAO_TELEFONE);
      expect(fato.titulo, `titulo de "${fato.tipo}" tem valor em reais`).not.toMatch(PADRAO_DINHEIRO);
    }
  });

  // As duas asserções abaixo separam as DUAS camadas de higiene. O teste
  // acima passa pelas duas de uma vez (`historicoDe` e depois
  // `projetarParaPortal`), e por isso não percebe se uma delas for embora:
  // cada uma sozinha limpa o suficiente para o teste do fim da linha ficar
  // verde. Cada camada precisa ser provada sem a outra.

  it("historicoDe já entrega título e detalhe públicos limpos, ANTES de qualquer projeção", () => {
    // A saída crua de `historicoDe` é o que a tarefa 10 devolve a quem chama;
    // nem todo consumidor passa por `projetarParaPortal`.
    const veneno = "Fechou com o 11 98888-7777, jefson@exemplo.com.br, R$ 5.000,00";
    const fatos = historicoDe(
      {
        marcos: [marcoDe({ titulo: veneno, descricao: veneno })],
        sessoes: [sessaoDe({ resumo: veneno })],
        tarefas: [tarefaDe({ titulo: veneno })],
        conteudos: [conteudoDe({ titulo: veneno })],
        documentos: [documentoDe({ titulo: veneno, visivelPortal: true })],
      },
      AGORA,
    );

    const publicos = fatos.filter((f) => f.visibilidade === "publico");
    expect(publicos).toHaveLength(5);
    for (const fato of publicos) {
      expect(fato.titulo, `titulo de "${fato.tipo}" tem telefone`).not.toMatch(PADRAO_TELEFONE);
      expect(fato.titulo, `titulo de "${fato.tipo}" tem e-mail`).not.toMatch(PADRAO_EMAIL);
      expect(fato.titulo, `titulo de "${fato.tipo}" tem valor em reais`).not.toMatch(PADRAO_DINHEIRO);
      expect(fato.detalhe, `detalhe de "${fato.tipo}" tem telefone`).not.toMatch(PADRAO_TELEFONE);
      expect(fato.detalhe, `detalhe de "${fato.tipo}" tem e-mail`).not.toMatch(PADRAO_EMAIL);
      expect(fato.detalhe, `detalhe de "${fato.tipo}" tem valor em reais`).not.toMatch(PADRAO_DINHEIRO);
    }
    // O que saiu vira marca legível, não some em silêncio.
    const marco = publicos.find((f) => f.tipo === "marco");
    expect(marco?.titulo).toContain("[telefone removido]");
    expect(marco?.detalhe).toContain("[e-mail removido]");
  });

  it("projetarParaPortal higieniza por conta própria um fato montado fora de historicoDe", () => {
    // O portão é a última coisa que roda antes de o fato virar tela do
    // mentorado, e ele também recebe fato montado à mão por outra camada —
    // aí não houve construtor nenhum para limpar antes.
    const sujo: FatoHistorico = {
      quando: AGORA,
      tipo: "sessao",
      titulo: "Sessão realizada — combinado de R$ 5.000,00",
      detalhe: "me liga no 11 98888-7777 ou jefson@exemplo.com.br",
      visibilidade: "publico",
    };

    const [saida] = projetarParaPortal([sujo]);
    expect(saida.titulo).not.toMatch(PADRAO_DINHEIRO);
    expect(saida.detalhe).not.toMatch(PADRAO_TELEFONE);
    expect(saida.detalhe).not.toMatch(PADRAO_EMAIL);
    expect(saida.detalhe).toContain("[telefone removido]");
    expect(saida.detalhe).toContain("[e-mail removido]");
    expect(saida.titulo).toContain("[valor removido]");
  });

  it("a URL do conteúdo liberado não viaja no fato", () => {
    // A URL pode carregar token assinado; quem precisa dela é a tela do
    // portal, que a busca na própria linha de `conteudo_liberado`.
    const fatos = historicoDe({ conteudos: [conteudoDe({})] }, AGORA);
    for (const fato of fatos) {
      expect(fato.detalhe).not.toContain("token=");
      expect(fato.detalhe).not.toContain("https://");
      expect(fato.titulo).not.toContain("https://");
    }
  });

  it("a transcrição da sessão não viaja no fato", () => {
    const fatos = historicoDe(
      { sessoes: [sessaoDe({ transcricao: "palavra-secreta-da-transcricao", resumo: "" })] },
      AGORA,
    );
    expect(JSON.stringify(fatos)).not.toContain("palavra-secreta-da-transcricao");
  });

  it("preserva a ordem e não devolve o mesmo array recebido", () => {
    const fatos = historicoDe(entradaCompleta(), AGORA);
    const publicos = projetarParaPortal(fatos);
    expect(publicos).not.toBe(fatos);
    expect(fatos.some((f) => f.visibilidade === "interno")).toBe(true);
    const posicoes = publicos.map((p) => fatos.findIndex((f) => f.tipo === p.tipo && f.quando === p.quando));
    for (let i = 1; i < posicoes.length; i += 1) {
      expect(posicoes[i - 1]).toBeLessThan(posicoes[i]);
    }
  });
});

describe("historicoDe — conteúdo dos fatos", () => {
  it("cobrança nasce interna e é lá que o valor em reais aparece", () => {
    const fatos = historicoDe({ cobrancas: [cobrancaDe({ valor: 1500, status: "aberta" })] }, AGORA);
    expect(fatos).toHaveLength(1);
    expect(fatos[0].tipo).toBe("cobranca");
    expect(fatos[0].visibilidade).toBe("interno");
    expect(`${fatos[0].titulo} ${fatos[0].detalhe}`).toMatch(PADRAO_DINHEIRO);
  });

  it("tarefa concluída é datada pela conclusão; tarefa aberta, pela criação", () => {
    const fatos = historicoDe(
      {
        tarefas: [
          tarefaDe({
            id: "t-feita",
            titulo: "Feita",
            concluida: true,
            concluidaEm: "2026-05-15T10:00:00.000Z",
            criadoEm: "2026-05-01T10:00:00.000Z",
          }),
          tarefaDe({ id: "t-aberta", titulo: "Aberta", criadoEm: "2026-05-02T10:00:00.000Z" }),
        ],
      },
      AGORA,
    );
    const feita = fatos.find((f) => f.titulo.includes("Feita"));
    const aberta = fatos.find((f) => f.titulo.includes("Aberta"));
    expect(feita?.quando).toBe("2026-05-15T10:00:00.000Z");
    expect(aberta?.quando).toBe("2026-05-02T10:00:00.000Z");
  });

  it("temperatura do lead nasce interna e sai da mesma conta do CRM", () => {
    const fatos = historicoDe(
      { interacoes: [interacaoDe({ quando: "2026-05-19T16:00:00.000Z" })] },
      AGORA,
    );
    const temperatura = fatos.find((f) => f.tipo === "temperatura");
    expect(temperatura).toBeDefined();
    expect(temperatura?.visibilidade).toBe("interno");
    expect(projetarParaPortal(fatos)).toEqual([]);
  });

  it("sessão sem resumo não inventa detalhe", () => {
    const fatos = historicoDe({ sessoes: [sessaoDe({ resumo: "", numero: 8 })] }, AGORA);
    expect(fatos[0].detalhe).toBe("");
    expect(fatos[0].titulo).toContain("8");
  });
});

describe("historicoDe — tamanho da entrada", () => {
  it(
    "resumo com um bloco enorme de dígitos não trava a higiene",
    () => {
      // Node é uma thread só: uma expressão regular com custo quadrático no
      // texto de UM mentorado para o servidor inteiro enquanto roda. Um
      // extrato colado no resumo da sessão (ou, a partir da tarefa 62, um
      // resumo gerado de transcrição) chega neste tamanho sem nenhuma
      // má-intenção. O limite é generoso de propósito — não é um teste de
      // velocidade da máquina, é um alarme de explosão de custo: a versão
      // com backtracking levava ~7 s neste mesmo caso.
      const bloco = "1".repeat(40000);
      const entrada: EntradaHistorico = {
        sessoes: [sessaoDe({ resumo: `Extrato colado pelo mentorado: ${bloco} fim do extrato` })],
      };

      const comeco = Date.now();
      const fatos = historicoDe(entrada, AGORA);
      const gasto = Date.now() - comeco;

      expect(fatos).toHaveLength(1);
      expect(gasto, `higienizar 40 mil dígitos levou ${gasto}ms`).toBeLessThan(1000);
    },
    // Timeout folgado de propósito: sem ele o caso quadrático estoura o
    // limite padrão e o relatório diria "demorou demais" em vez de dizer
    // QUANTO demorou.
    30000,
  );
});
