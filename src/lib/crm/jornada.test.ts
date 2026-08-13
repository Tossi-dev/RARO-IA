import { describe, expect, it } from "vitest";
import { STATUS_MENTORADO_VALORES } from "@/lib/mentoria/tipos";
import {
  ehEtapaJornada,
  ESCADA_JORNADA,
  ETAPA_JORNADA_PADRAO,
  jornadaDe,
  ORDEM_FORA_DA_ESCADA,
  ordemDaEtapa,
  statusIncoerentesDoMapa,
  statusMentoradoDaEtapa,
  transicaoPermitida,
} from "./jornada";

describe("ESCADA_JORNADA", () => {
  it("tem os sete degraus da migração 0014, na ordem canônica", () => {
    expect([...ESCADA_JORNADA]).toEqual([
      "prospect",
      "lead_qualificado",
      "proposta",
      "cliente_novo",
      "cliente_ativo",
      "em_risco",
      "alumni",
    ]);
  });

  it("é readonly: um push não compila, e nem em runtime passa", () => {
    // O `@ts-expect-error` abaixo é METADE da asserção, e é a metade que roda
    // no `npx tsc --noEmit`: se um dia `ESCADA_JORNADA` deixar de ser readonly,
    // a linha passa a compilar, o `@ts-expect-error` fica sem erro para
    // suprimir e o próprio tsc acusa o comentário como inútil. A outra metade
    // é o `toThrow`: lista de permissão congelada de verdade, não só na tipagem
    // — mesmo espírito do `readonly` de `ROTAS_COMERCIAL` em `src/lib/papeis.ts`.
    expect(() => {
      // @ts-expect-error — escada é readonly: `push` não existe no tipo.
      ESCADA_JORNADA.push("xpto");
    }).toThrow();

    expect(Object.isFrozen(ESCADA_JORNADA)).toBe(true);
    expect([...ESCADA_JORNADA]).toHaveLength(7);
  });

  it("ETAPA_JORNADA_PADRAO é prospect, o degrau menos privilegiado", () => {
    expect(ETAPA_JORNADA_PADRAO).toBe("prospect");
  });
});

describe("jornadaDe", () => {
  it("cada uma das sete chaves normaliza para si mesma", () => {
    for (const chave of ESCADA_JORNADA) {
      expect(jornadaDe(chave)).toBe(chave);
    }
  });

  it("normaliza caixa e espaço nas pontas, igual a papelDe", () => {
    expect(jornadaDe("PROSPECT")).toBe("prospect");
    expect(jornadaDe(" alumni ")).toBe("alumni");
    expect(jornadaDe("Cliente_Ativo")).toBe("cliente_ativo");
  });

  it("fail-closed: qualquer entrada desconhecida cai em prospect", () => {
    expect(jornadaDe(null)).toBe("prospect");
    expect(jornadaDe(undefined)).toBe("prospect");
    expect(jornadaDe(42)).toBe("prospect");
    expect(jornadaDe({})).toBe("prospect");
    expect(jornadaDe("")).toBe("prospect");
    // "cliente" é PREFIXO de duas chaves da escada (cliente_novo e
    // cliente_ativo): quem normalizasse por `startsWith` acertaria uma das
    // duas por sorteio e promoveria um prospect a cliente sem ninguém decidir.
    expect(jornadaDe("cliente")).toBe("prospect");
  });

  it("array não é string: o `?estagio=a&estagio=b` do Next cai em prospect", () => {
    // `searchParams` do Next entrega `string | string[] | undefined`, e a
    // tela do CRM lê estágio da query string. Repetir o parâmetro na URL é
    // o vetor hostil mais barato que existe contra este módulo, e um
    // `String(valor)` no lugar da guarda de tipo transformaria `["alumni"]`
    // em "alumni" — promoção de degrau por formato de entrada.
    expect(jornadaDe(["alumni"])).toBe("prospect");
    expect(jornadaDe(["cliente_ativo"])).toBe("prospect");
    expect(jornadaDe(["alumni", "xpto"])).toBe("prospect");
    expect(jornadaDe([])).toBe("prospect");
  });

  it("só caixa e espaço nas PONTAS: variante quase-igual da chave é hostil", () => {
    // O comentário de `jornadaDe` promete tolerar caixa e espaço nas pontas
    // "e tratar todo o resto como hostil". Estas são as variantes que uma
    // normalização generosa demais (trocar espaço/hífen por sublinhado)
    // passaria a aceitar — e aceitar significa deixar o vocabulário do
    // produto virar palpite sobre o que o remetente quis dizer.
    expect(jornadaDe("cliente ativo")).toBe("prospect");
    expect(jornadaDe("CLIENTE-ATIVO")).toBe("prospect");
    expect(jornadaDe("cliente__ativo")).toBe("prospect");
    expect(jornadaDe("em risco")).toBe("prospect");
    expect(jornadaDe("em-risco")).toBe("prospect");
    expect(jornadaDe("lead qualificado")).toBe("prospect");
  });

  it("estágio que existe no banco mas não na escada não é confundido com degrau", () => {
    expect(jornadaDe("inativo")).toBe("prospect");
    expect(jornadaDe("xpto")).toBe("prospect");
  });
});

describe("ordemDaEtapa", () => {
  it("segue a posição na escada canônica", () => {
    expect(ordemDaEtapa("prospect")).toBe(0);
    expect(ordemDaEtapa("alumni")).toBe(6);
    for (let i = 0; i < ESCADA_JORNADA.length; i += 1) {
      expect(ordemDaEtapa(ESCADA_JORNADA[i])).toBe(i);
    }
  });

  it("estágio fora da escada vai para o FIM da fila, não empata com prospect", () => {
    // `inativo` não é hipótese: a 0014 cria e preserva essa chave de
    // propósito, fora da escada. Se o desconhecido recebesse a mesma ordem
    // de `prospect`, a coluna do dono apareceria no COMEÇO do kanban,
    // misturada ao topo do funil, e quem monta a tela teria que refazer a
    // distinção fora deste módulo — que é justamente o que ele existe para
    // evitar.
    expect(ordemDaEtapa("inativo")).toBe(ORDEM_FORA_DA_ESCADA);
    expect(ordemDaEtapa("xpto")).toBe(ORDEM_FORA_DA_ESCADA);
    expect(ordemDaEtapa(null)).toBe(ORDEM_FORA_DA_ESCADA);
    expect(ordemDaEtapa(["alumni"])).toBe(ORDEM_FORA_DA_ESCADA);
    expect(ordemDaEtapa("")).toBe(ORDEM_FORA_DA_ESCADA);
    expect(ORDEM_FORA_DA_ESCADA).toBeGreaterThan(ordemDaEtapa("alumni"));
  });

  it("a tolerância de caixa e espaço vale também para a ordem", () => {
    expect(ordemDaEtapa(" ALUMNI ")).toBe(6);
    expect(ordemDaEtapa("Prospect")).toBe(0);
  });

  it("ordena o kanban: entrada embaralhada sai canônica, desconhecido no fim", () => {
    const embaralhado = [
      "alumni",
      "inativo",
      "proposta",
      "prospect",
      "xpto",
      "em_risco",
      "cliente_novo",
      "lead_qualificado",
      "cliente_ativo",
    ];
    const ordenado = [...embaralhado].sort((a, b) => ordemDaEtapa(a) - ordemDaEtapa(b));

    expect(ordenado).toEqual([
      "prospect",
      "lead_qualificado",
      "proposta",
      "cliente_novo",
      "cliente_ativo",
      "em_risco",
      "alumni",
      // Os dois de fora da escada ficam no fim, na ordem em que chegaram —
      // e continuam na lista: a tela não descarta dado que existe só porque
      // o código não o previu.
      "inativo",
      "xpto",
    ]);
  });
});

describe("ehEtapaJornada", () => {
  it("reconhece as sete chaves da escada", () => {
    for (const chave of ESCADA_JORNADA) {
      expect(ehEtapaJornada(chave)).toBe(true);
    }
  });

  it("recusa o que não é degrau — inclusive o que jornadaDe converteria", () => {
    expect(ehEtapaJornada("inativo")).toBe(false);
    expect(ehEtapaJornada("xpto")).toBe(false);
    expect(ehEtapaJornada(null)).toBe(false);
    expect(ehEtapaJornada(undefined)).toBe(false);
    expect(ehEtapaJornada(42)).toBe(false);
    expect(ehEtapaJornada(["alumni"])).toBe(false);
    // A GUARDA É EXATA de propósito: ela promete ao tsc que o valor JÁ é
    // uma `EtapaJornada`, e " alumni " não é — quem tem entrada suja passa
    // por `jornadaDe`, que é a porta tolerante.
    expect(ehEtapaJornada(" alumni ")).toBe(false);
    expect(ehEtapaJornada("ALUMNI")).toBe(false);
  });
});

describe("transicaoPermitida", () => {
  it("retroceder é permitido — negócio real volta atrás", () => {
    expect(transicaoPermitida("cliente_ativo", "proposta")).toBe(true);
    expect(transicaoPermitida("em_risco", "prospect")).toBe(true);
    expect(transicaoPermitida("proposta", "lead_qualificado")).toBe(true);
  });

  it("pular etapa é permitido", () => {
    expect(transicaoPermitida("prospect", "cliente_ativo")).toBe(true);
    expect(transicaoPermitida("lead_qualificado", "alumni")).toBe(true);
  });

  it("de alumni só se sai para cliente_ativo (recompra explícita)", () => {
    expect(transicaoPermitida("alumni", "prospect")).toBe(false);
    expect(transicaoPermitida("alumni", "lead_qualificado")).toBe(false);
    expect(transicaoPermitida("alumni", "proposta")).toBe(false);
    expect(transicaoPermitida("alumni", "cliente_novo")).toBe(false);
    expect(transicaoPermitida("alumni", "em_risco")).toBe(false);
    expect(transicaoPermitida("alumni", "cliente_ativo")).toBe(true);
  });

  it("alumni para alumni não é saída, e é permitido", () => {
    expect(transicaoPermitida("alumni", "alumni")).toBe(true);
  });

  it("destino desconhecido a partir de alumni é recusado (fail-closed)", () => {
    expect(transicaoPermitida("alumni", "xpto")).toBe(false);
    expect(transicaoPermitida("alumni", null)).toBe(false);
    expect(transicaoPermitida("alumni", "")).toBe(false);
  });

  it("normaliza as DUAS pontas: caixa e espaço não furam a trava de alumni", () => {
    // A trava de alumni é a única regra do módulo; se a origem entrasse
    // crua, qualquer `"ALUMNI"` vindo de um formulário ou de um workspace
    // que gravou a chave com espaço passaria por ela sem tocar em nada.
    expect(transicaoPermitida(" ALUMNI ", "prospect")).toBe(false);
    expect(transicaoPermitida("Alumni", "PROSPECT")).toBe(false);
    expect(transicaoPermitida("alumni ", "em_risco")).toBe(false);

    // E o destino também normaliza: a recompra continua valendo escrita
    // com caixa diferente.
    expect(transicaoPermitida(" alumni ", " Cliente_Ativo ")).toBe(true);
    expect(transicaoPermitida("ALUMNI", "cliente_ativo")).toBe(true);
  });

  it("ponta em formato de array é hostil, e a partir de alumni é recusada", () => {
    expect(transicaoPermitida("alumni", ["cliente_ativo"])).toBe(false);
  });

  it("qualquer par entre os seis degraus que não sejam alumni é permitido", () => {
    const semAlumni = ESCADA_JORNADA.filter((chave) => chave !== "alumni");
    for (const de of semAlumni) {
      for (const para of ESCADA_JORNADA) {
        expect(transicaoPermitida(de, para)).toBe(true);
      }
    }
  });
});

describe("statusMentoradoDaEtapa", () => {
  it("devolve um valor do enum status_mentorado para TODAS as sete chaves", () => {
    for (const chave of ESCADA_JORNADA) {
      expect(STATUS_MENTORADO_VALORES).toContain(statusMentoradoDaEtapa(chave));
    }
  });

  it("o topo do funil ainda é lead, e alumni é alumni", () => {
    expect(statusMentoradoDaEtapa("prospect")).toBe("lead");
    expect(statusMentoradoDaEtapa("lead_qualificado")).toBe("lead");
    expect(statusMentoradoDaEtapa("proposta")).toBe("lead");
    expect(statusMentoradoDaEtapa("cliente_novo")).toBe("ativo");
    expect(statusMentoradoDaEtapa("cliente_ativo")).toBe("ativo");
    expect(statusMentoradoDaEtapa("em_risco")).toBe("ativo");
    expect(statusMentoradoDaEtapa("alumni")).toBe("alumni");
  });

  it("não engole valor de fora da escada: a assinatura é EtapaJornada", () => {
    // Os `@ts-expect-error` abaixo são a asserção INTEIRA desta prova, e ela
    // roda no `npx tsc --noEmit`: se a assinatura voltar a ser `unknown`,
    // as linhas compilam, os comentários ficam sem erro para suprimir e o
    // próprio tsc acusa.
    //
    // POR QUE isto tem que ser erro de compilação: esta função não autoriza
    // nada — ela decide o `mentorado.status`, ou seja, REESCREVE estado de
    // negócio. Aceitando `unknown`, um cliente pagante parado num estágio
    // que o dono criou à mão (`inativo`, e a 0014 garante que esses existam)
    // seria rebaixado a `lead` em silêncio pelo fail-closed. Quem tem chave
    // crua do banco decide antes, com `ehEtapaJornada`.

    // @ts-expect-error — 'inativo' é chave real do banco, mas não é degrau.
    statusMentoradoDaEtapa("inativo");
    // @ts-expect-error — sem etapa não há status a deduzir.
    statusMentoradoDaEtapa(undefined);
    // @ts-expect-error — string crua não é degrau até alguém provar que é.
    statusMentoradoDaEtapa(chaveCrua());
  });

  it("o caminho para dado cru é explícito: guarda antes, mapa depois", () => {
    const crua = chaveCrua();
    // Este é o uso que a tela faz: só mapeia quem é degrau; o resto mantém
    // o status que já tinha, em vez de ser rebaixado.
    const status = ehEtapaJornada(crua) ? statusMentoradoDaEtapa(crua) : null;
    expect(status).toBeNull();
  });
});

/** Devolve `string` (e não o literal) — imita a chave que vem do banco. */
function chaveCrua(): string {
  return "inativo";
}

describe("statusIncoerentesDoMapa", () => {
  it("o mapa real do módulo está coerente com o enum do Postgres", () => {
    expect(statusIncoerentesDoMapa()).toEqual([]);
  });

  it("acusa o status que o enum não conhece, mesmo com o resto certo", () => {
    // A guarda existe para o dia em que o enum do banco mudar, o tipo
    // `StatusMentorado` for atualizado e `STATUS_MENTORADO_VALORES` ficar
    // para trás — o dia em que o tsc para de ajudar. Só um dos destinos
    // fora do enum já tem que acusar; exigir que TODOS estejam errados
    // (o buraco que existia enquanto isso era um `throw` de topo de módulo,
    // que nenhum teste chamava) deixaria passar exatamente o caso real.
    expect(
      statusIncoerentesDoMapa({ prospect: "lead", alumni: "fantasma" }, ["lead", "ativo", "alumni"]),
    ).toEqual(["fantasma"]);
  });

  it("acusa todos quando o enum inteiro trocou de vocabulário", () => {
    expect(statusIncoerentesDoMapa({ a: "lead", b: "ativo" }, ["novo"])).toEqual(["lead", "ativo"]);
  });

  it("importar o módulo não lança: a coerência é conferida aqui, não no import", async () => {
    // Um `throw` em tempo de import derrubaria no carregamento toda rota
    // que tocasse o kanban, o pipeline ou o onboarding — sem erro tratável
    // e sem tela. Um módulo anunciado como PURO não tem efeito colateral de
    // import; a garantia mora neste teste.
    await expect(import("./jornada")).resolves.toBeTruthy();
  });
});
