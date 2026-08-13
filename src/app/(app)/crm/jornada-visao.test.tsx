// Testes da Tarefa 3 da Fase 2 — "kanban do CRM na escada nova".
//
// O QUE ESTA SUÍTE PROVA
// ----------------------
// 1) as colunas do kanban saem na ordem CANÔNICA de `src/lib/crm/jornada.ts`
//    (a escada `prospect → ... → alumni`), e não em `crm_estagios.ordem`, que
//    é campo editável pelo dono;
// 2) estágio que existe no banco e não na escada (o `inativo` que a 0014
//    preserva de propósito, ou qualquer um que o dono criou à mão) CONTINUA
//    aparecendo, no fim, com o rótulo do banco — a tela não esconde dado que
//    existe só porque o código não o previu (regra da casa: nunca apagar);
// 3) `moverAlunoEstagio` recusa a transição que `transicaoPermitida` nega
//    SEM tocar no banco nem uma vez, e volta para a tela em `?erro=` — nunca
//    lançando;
// 4) zero emoji em todo texto novo.
//
// MÉTODO: `Crm` é um Server Component ASSÍNCRONO. Como já se faz em
// `src/app/(app)/portal/page.test.tsx`, o teste chama a função da página
// direto (é uma função async comum) e passa a árvore já resolvida para
// `renderToStaticMarkup` — daí em diante quem renderiza é o React de
// verdade, com os mesmos componentes de produção.
//
// POR QUE A ORDEM É LIDA DA MARCAÇÃO, E NÃO DE UMA FUNÇÃO EXPORTADA:
// `page.tsx` não pode exportar nada além do que o Next reconhece (`default`,
// `dynamic`, `metadata`...) — `next build` faz um `Diff` dos exports do
// arquivo de rota contra essa lista fechada e QUEBRA no export extra. Então
// o que esta suíte inspeciona é o produto final: a sequência de
// `aria-label="Estágio ..."` que o `KanbanCrm` desenha. É também a asserção
// mais honesta que existe aqui — ela morre se a ordenação for feita e depois
// desfeita por qualquer passo posterior da tela.

import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Aluno, Estagio } from "@/lib/types";

const { getDBMock, redirectMock, revalidatePathMock } = vi.hoisted(() => ({
  getDBMock: vi.fn(),
  redirectMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}));

vi.mock("@/lib/data", () => ({
  getDB: getDBMock,
  // `supabaseConfigurado` é importada por `src/lib/actions.ts`; o dublê
  // precisa ter tudo o que o módulo real exporta e o código sob teste usa.
  supabaseConfigurado: () => false,
}));

vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));

// `redirect()` de verdade LANÇA (é assim que o Next interrompe a Server
// Action). O dublê aqui, de propósito, NÃO lança — é o que prova que
// `moverAlunoEstagio` não depende da exceção para parar antes de escrever
// (mesmo raciocínio já documentado em `acoes-portal.test.ts`).
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

const { default: Crm } = await import("./page");
const { moverAlunoEstagio } = await import("@/lib/actions");

afterEach(() => {
  vi.resetAllMocks();
});

// ============================================================
// Fábricas — estágio e aluno com o mínimo que a tela usa.
// ============================================================

function estagio(chave: string, nome: string, ordem: number, id?: string): Estagio {
  return {
    // `id` sobrescrevível porque no banco de verdade ele é um uuid gerado
    // pelo Postgres (a 0014 não escreve id nenhum): nenhuma tela pode
    // reconhecer um estágio pelo id literal.
    id: id ?? `est-${chave || "sem-chave"}`,
    nome,
    chave,
    ordem,
    cor: "cinza",
    funil: "potencial",
  };
}

function aluno(id: string, nome: string, estagioId: string | null): Aluno {
  return {
    id,
    nome,
    telefone: "",
    email: "",
    statusFunil: "potencial",
    estagioId,
    origem: "",
    primeiroContato: "2026-01-10",
    observacoes: "",
  };
}

/** A escada inteira, na ordem canônica, com os rótulos que a 0014 semeia. */
const ESCADA_COMPLETA: Estagio[] = [
  estagio("prospect", "Prospect", 1),
  estagio("lead_qualificado", "Lead qualificado", 2),
  estagio("proposta", "Proposta", 3),
  estagio("cliente_novo", "Cliente novo", 4),
  estagio("cliente_ativo", "Cliente ativo", 5),
  estagio("em_risco", "Em risco", 6),
  estagio("alumni", "Alumni", 7),
];

const NOMES_DA_ESCADA = ESCADA_COMPLETA.map((e) => e.nome);

// ============================================================
// Dublê do banco para a TELA — os cinco métodos que `page.tsx` consulta.
// ============================================================

function bancoDaTela(estagios: Estagio[], alunos: Aluno[] = []) {
  return {
    listAlunos: vi.fn(async () => alunos),
    dataset: vi.fn(async () => ({ matriculas: [] })),
    listEstagios: vi.fn(async () => estagios),
    listAtividades: vi.fn(async () => []),
    listInteracoes: vi.fn(async () => []),
  };
}

type ParametrosDaTela = { q?: string; estagio?: string; visao?: string; erro?: string };

async function renderizarCrm(
  estagios: Estagio[],
  opcoes: { alunos?: Aluno[]; searchParams?: ParametrosDaTela } = {},
): Promise<string> {
  getDBMock.mockReturnValue(bancoDaTela(estagios, opcoes.alunos ?? []));
  const arvore = await Crm({ searchParams: opcoes.searchParams ?? {} });
  return renderToStaticMarkup(arvore as ReactElement);
}

/**
 * Os rótulos das colunas do kanban, na ordem em que a pessoa os vê.
 * `KanbanCrm` marca cada coluna com `aria-label="Estágio <nome>"` — o mesmo
 * atributo que o leitor de tela usa, então esta leitura é literalmente a
 * ordem percebida por quem abre a página.
 */
function colunasDoKanban(html: string): string[] {
  return [...html.matchAll(/aria-label="Estágio ([^"]+)"/g)].map((m) => m[1]);
}

/**
 * O que o cartão de KPI de rótulo `rotulo` mostra: o número grande e a linha
 * da conta (a memória de cálculo que o `Stat` desenha em `kpi-conta`).
 *
 * A leitura é da marcação renderizada, pelo mesmo motivo do `colunasDoKanban`
 * logo acima: é o que a pessoa vê, e morre se algum passo posterior da tela
 * desfizer o número.
 */
function kpi(html: string, rotulo: string): { valor: string; conta: string } {
  const inicio = html.indexOf(`>${rotulo}<`);
  expect(inicio, `KPI "${rotulo}" não está na tela`).toBeGreaterThan(-1);
  const bloco = html.slice(inicio);
  const valor = /class="kpi-valor[^"]*">([^<]*)</.exec(bloco);
  const conta = /class="kpi-conta[^"]*">([^<]*)</.exec(bloco);
  return { valor: valor?.[1] ?? "", conta: conta?.[1] ?? "" };
}

/** Os rótulos das opções do `<select>` de filtro por estágio, em ordem. */
function opcoesDoFiltro(html: string): string[] {
  const form = html.slice(html.indexOf('<select name="estagio"'));
  return [...form.slice(0, form.indexOf("</select>")).matchAll(/<option[^>]*>([^<]*)</g)]
    .map((m) => m[1])
    .filter((rotulo) => rotulo !== "Todos");
}

/**
 * Os nomes das pessoas na visão em LISTA, na ordem em que aparecem na tabela.
 * O corte começa no título do card ("Pessoas (n)") para não capturar os links
 * da fila do dia, que fica acima na mesma página.
 */
function linhasDaLista(html: string): string[] {
  const tabela = html.slice(html.indexOf("Pessoas ("));
  return [...tabela.matchAll(/hover:text-primaria-2" href="\/crm\/[^"]+">([^<]+)</g)].map(
    (m) => m[1],
  );
}

/**
 * Os rótulos da coluna "Estágio" da visão em lista, na ordem das linhas.
 * Cada linha da tabela tem exatamente um `Badge`, e é ele.
 */
function estagiosDaLista(html: string): string[] {
  const tabela = html.slice(html.indexOf("Pessoas ("));
  return [...tabela.matchAll(/rounded-full border px-2 py-0\.5 text-xs font-medium[^"]*">([^<]*)</g)]
    .map((m) => m[1]);
}

/** Os nomes dos cartões dentro da coluna `nomeDaColuna` do kanban. */
function cartoesDaColuna(html: string, nomeDaColuna: string): string[] {
  const inicio = html.indexOf(`aria-label="Estágio ${nomeDaColuna}"`);
  expect(inicio, `coluna "${nomeDaColuna}" não está no quadro`).toBeGreaterThan(-1);
  const resto = html.slice(inicio + 1);
  const proxima = resto.indexOf('aria-label="Estágio ');
  const coluna = proxima === -1 ? resto : resto.slice(0, proxima);
  return [...coluna.matchAll(/hover:text-primaria-2" href="\/crm\/[^"]+">([^<]+)</g)].map(
    (m) => m[1],
  );
}

/** Embaralhamento FIXO (nunca aleatório: teste tem que falhar sempre igual). */
function embaralhada(estagios: Estagio[]): Estagio[] {
  const ordem = [5, 0, 6, 2, 4, 1, 3];
  return ordem.map((i) => estagios[i]);
}

// ============================================================
// Emoji — mesmos helpers de `src/app/(app)/portal/page.test.tsx`, pelo mesmo
// motivo: `\p{Extended_Pictographic}` é a propriedade Unicode que define
// "isto é emoji", e travessão/acento do português não caem nela.
// ============================================================

const GLIFOS_PERMITIDOS = new Set(["▲", "▼", "▬"]);

function semEmoji(html: string): boolean {
  for (const char of html) {
    if (GLIFOS_PERMITIDOS.has(char)) continue;
    if (/\p{Extended_Pictographic}/u.test(char)) return false;
  }
  return true;
}

// ============================================================
// 1. A ordem das colunas é a da escada, não a do banco.
// ============================================================

describe("kanban — a ordem das colunas é a da escada canônica", () => {
  it("com os sete estágios embaralhados na entrada, a saída é a ordem canônica", async () => {
    const html = await renderizarCrm(embaralhada(ESCADA_COMPLETA));

    expect(colunasDoKanban(html)).toEqual(NOMES_DA_ESCADA);
  });

  it("a ordem NÃO é a de `crm_estagios.ordem`: o dono pode ter editado a coluna e a escada continua valendo", async () => {
    // Mesmos sete degraus, com `ordem` invertida no banco (é campo editável).
    // Se a tela ainda ordenasse por `ordem`, a saída viria de trás para a
    // frente — este é o mutante que a asserção acima sozinha não mataria,
    // porque lá a `ordem` do banco por acaso concorda com a escada.
    const invertida = ESCADA_COMPLETA.map((e, i) => ({ ...e, ordem: ESCADA_COMPLETA.length - i }));

    const html = await renderizarCrm(embaralhada(invertida));

    expect(colunasDoKanban(html)).toEqual(NOMES_DA_ESCADA);
  });

  it("o rótulo mostrado é o do BANCO, não o literal da escada", async () => {
    // O dono renomeou 'Cliente ativo' para 'Turma ativa' na tela; a chave é
    // do código, o rótulo é dele (o combinado do cabeçalho da 0014).
    const renomeada = ESCADA_COMPLETA.map((e) =>
      e.chave === "cliente_ativo" ? { ...e, nome: "Turma ativa" } : e,
    );

    const html = await renderizarCrm(renomeada);

    expect(colunasDoKanban(html)).toEqual([
      "Prospect",
      "Lead qualificado",
      "Proposta",
      "Cliente novo",
      "Turma ativa",
      "Em risco",
      "Alumni",
    ]);
  });
});

// ============================================================
// 2. O que existe no banco e não na escada continua na tela.
// ============================================================

describe("kanban — estágio fora da escada não é descartado", () => {
  it("um estágio desconhecido (chave 'xpto') aparece por último e não some", async () => {
    const comXpto = [estagio("xpto", "Reativação", 2), ...ESCADA_COMPLETA];

    const colunas = colunasDoKanban(await renderizarCrm(comXpto));

    expect(colunas).toHaveLength(8);
    expect(colunas).toContain("Reativação");
    expect(colunas[colunas.length - 1]).toBe("Reativação");
    expect(colunas.slice(0, 7)).toEqual(NOMES_DA_ESCADA);
  });

  it("dois estágios fora da escada mantêm entre si a ordem em que vieram do banco", async () => {
    // `inativo` é chave REAL, preservada de propósito pela 0014 (ela não
    // reclassifica ninguém); 'xpto' é o estágio que o dono criou à mão. A
    // ordenação da tela não pode embaralhar os dois entre si — desempate
    // estável, nunca "a ordem que o `sort` der".
    const comDoisForaDaEscada = [
      ...ESCADA_COMPLETA,
      estagio("inativo", "Inativo", 8),
      estagio("xpto", "Reativação", 9),
    ];

    const colunas = colunasDoKanban(await renderizarCrm(comDoisForaDaEscada));

    expect(colunas).toEqual([...NOMES_DA_ESCADA, "Inativo", "Reativação"]);

    // E a ordem inversa na entrada sai invertida na saída — prova que o que
    // decide o desempate é a entrada, e não o nome nem o acaso.
    const invertidos = [
      ...ESCADA_COMPLETA,
      estagio("xpto", "Reativação", 9),
      estagio("inativo", "Inativo", 8),
    ];

    expect(colunasDoKanban(await renderizarCrm(invertidos))).toEqual([
      ...NOMES_DA_ESCADA,
      "Reativação",
      "Inativo",
    ]);
  });

  it("estágio com chave vazia (banco anterior à 0014) continua desenhado, no fim", async () => {
    const colunas = colunasDoKanban(
      await renderizarCrm([estagio("", "Etapa antiga", 1), ...ESCADA_COMPLETA]),
    );

    expect(colunas).toEqual([...NOMES_DA_ESCADA, "Etapa antiga"]);
  });

  it("banco sem estágio nenhum não quebra a tela nem inventa coluna", async () => {
    const html = await renderizarCrm([]);

    expect(colunasDoKanban(html)).toEqual([]);
  });
});

// ============================================================
// 2b. O KPI "Em risco / inativos" conta a coluna de verdade.
//
// A coluna do pipeline é achada pela CHAVE da escada — `crm_estagios.id` é
// uuid gerado pelo Postgres (a 0014 não escreve id nenhum), então qualquer
// tela que reconheça um estágio pelo id literal mostra zero em produção e
// apresenta esse zero como fato.
// ============================================================

/** A escada com ids de uuid, como o banco de verdade devolve. */
const ESCADA_COM_UUID: Estagio[] = [
  estagio("prospect", "Prospect", 1, "0f1c2f0e-1111-4a00-9000-000000000001"),
  estagio("lead_qualificado", "Lead qualificado", 2, "0f1c2f0e-1111-4a00-9000-000000000002"),
  estagio("proposta", "Proposta", 3, "0f1c2f0e-1111-4a00-9000-000000000003"),
  estagio("cliente_novo", "Cliente novo", 4, "0f1c2f0e-1111-4a00-9000-000000000004"),
  estagio("cliente_ativo", "Cliente ativo", 5, "0f1c2f0e-1111-4a00-9000-000000000005"),
  estagio("em_risco", "Em risco", 6, "0f1c2f0e-1111-4a00-9000-000000000006"),
  estagio("alumni", "Alumni", 7, "0f1c2f0e-1111-4a00-9000-000000000007"),
];

const ID_EM_RISCO = ESCADA_COM_UUID[5].id;

describe("KPI 'Em risco / inativos' — o número é a coluna, não um id chutado", () => {
  it("com três pessoas na coluna de risco, o KPI mostra três (ids uuid, como no banco)", async () => {
    const html = await renderizarCrm(ESCADA_COM_UUID, {
      alunos: [
        aluno("al-1", "Ana Souza", ID_EM_RISCO),
        aluno("al-2", "Bruno Lima", ID_EM_RISCO),
        aluno("al-3", "Carla Dias", ID_EM_RISCO),
      ],
    });

    const cartao = kpi(html, "Em risco / inativos");

    expect(cartao.valor).toBe("3");
    expect(cartao.conta).toContain("No estágio Em risco do pipeline 3");
  });

  it("o rótulo da parcela é o NOME do banco: quem renomeou a coluna lê o nome dela", async () => {
    const renomeada = ESCADA_COM_UUID.map((e) =>
      e.chave === "em_risco" ? { ...e, nome: "Risco de churn" } : e,
    );

    const cartao = kpi(
      await renderizarCrm(renomeada, { alunos: [aluno("al-1", "Ana Souza", ID_EM_RISCO)] }),
      "Em risco / inativos",
    );

    expect(cartao.valor).toBe("1");
    expect(cartao.conta).toContain("No estágio Risco de churn do pipeline 1");
  });

  it("o filtro de estágio da tela também vale para o número (a nota do cartão promete isso)", async () => {
    const html = await renderizarCrm(ESCADA_COM_UUID, {
      alunos: [aluno("al-1", "Ana Souza", ID_EM_RISCO), aluno("al-2", "Bruno Lima", ID_EM_RISCO)],
      searchParams: { q: "ana" },
    });

    expect(kpi(html, "Em risco / inativos").valor).toBe("1");
  });

  it("workspace sem coluna de risco DIZ que não tem, em vez de mostrar zero como se fosse contagem", async () => {
    // Regra da casa: sem dado, a tela diz que não tem. Um "0" com a linha
    // "No estágio Em risco do pipeline 0" afirma que existe a coluna e que
    // ela está vazia — duas coisas diferentes.
    const semRisco = ESCADA_COM_UUID.filter((e) => e.chave !== "em_risco");

    const cartao = kpi(await renderizarCrm(semRisco), "Em risco / inativos");

    expect(cartao.conta).not.toContain("No estágio");
    expect(cartao.conta.toLowerCase()).toContain("não tem");
  });
});

// ============================================================
// 3. A tela DECLARA de onde o cartão sai — é o que torna a recusa possível
//    sem ir ao banco.
// ============================================================

describe("kanban — o formulário de mover declara a etapa de origem e a de destino", () => {
  it("cada botão 'Mover para' carrega a chave de onde o cartão está e a de para onde vai", async () => {
    const html = await renderizarCrm(ESCADA_COMPLETA, {
      alunos: [aluno("al-1", "Fulano de Tal", "est-alumni")],
    });

    // O cartão está na coluna `alumni`: todo formulário daquele cartão
    // declara `alumni` como origem.
    expect(html).toContain('name="chaveAtual" value="alumni"');
    // E o destino de cada botão é a chave daquela coluna — inclusive a única
    // saída legítima de alumni.
    expect(html).toContain('name="chaveDestino" value="cliente_ativo"');
    expect(html).toContain('name="chaveDestino" value="prospect"');
  });
});

// ============================================================
// 4. `moverAlunoEstagio` — a recusa não toca no banco e volta em `?erro=`.
// ============================================================

/**
 * Dublê de banco para a AÇÃO. Qualquer método aqui chamado é registrado.
 *
 * `estagioIdDoAluno` é o estágio REAL da linha do aluno — o que a ação tem de
 * consultar em vez de acreditar no que o formulário declarou como origem. O
 * padrão é `est-alumni` porque alumni é a origem da única transição que a
 * escada proíbe, e é dela que quase todo caso desta suíte fala.
 */
function bancoDaAcao(
  opcoes: {
    estagios?: Estagio[];
    estagioIdDoAluno?: string | null;
    semAluno?: boolean;
    erroDeLeitura?: boolean;
  } = {},
) {
  const estagios = opcoes.estagios ?? ESCADA_COMPLETA;
  // `in` e não `??`: `estagioIdDoAluno: null` é um caso de teste de verdade
  // (aluno sem estágio nenhum), e não "não informado".
  const estagioIdDoAluno =
    "estagioIdDoAluno" in opcoes ? (opcoes.estagioIdDoAluno ?? null) : "est-alumni";
  const ficha = opcoes.semAluno
    ? null
    : { aluno: aluno("al-1", "Fulano de Tal", estagioIdDoAluno), matriculas: [] };
  const db = {
    listEstagios: vi.fn(async () => {
      if (opcoes.erroDeLeitura) throw new Error("banco fora do ar");
      return estagios;
    }),
    getAluno: vi.fn(async (_id: string) => ficha),
    // Os parâmetros estão declarados (mesmo sem uso) para que o `tsc` conheça
    // a forma das chamadas registradas — é `mock.calls[0][0]` que prova que
    // foi ESTE aluno que mudou de estágio, e não qualquer um.
    setEstagioAluno: vi.fn(async (_alunoId: string, _estagio: Estagio) => {}),
    addAtividade: vi.fn(async (_atividade: { alunoId: string; titulo: string }) => {}),
  };
  getDBMock.mockReturnValue(db);
  return db;
}

function formulario(campos: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [chave, valor] of Object.entries(campos)) fd.set(chave, valor);
  return fd;
}

function urlDoRedirect(): string {
  expect(redirectMock).toHaveBeenCalledTimes(1);
  return String(redirectMock.mock.calls[0][0]);
}

describe("moverAlunoEstagio — transição negada", () => {
  it("alumni → prospect não chama o banco NEM UMA VEZ e redireciona com ?erro=", async () => {
    const db = bancoDaAcao();

    await moverAlunoEstagio(
      formulario({
        alunoId: "al-1",
        estagioId: "est-prospect",
        chaveAtual: "alumni",
        chaveDestino: "prospect",
      }),
    );

    // "nem uma vez" é literal: nem `getDB()` foi chamado — a decisão é toda
    // do módulo puro, antes de qualquer ida ao banco.
    expect(getDBMock).not.toHaveBeenCalled();
    expect(db.listEstagios).not.toHaveBeenCalled();
    expect(db.setEstagioAluno).not.toHaveBeenCalled();
    expect(db.addAtividade).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
    expect(urlDoRedirect()).toContain("?erro=");
  });

  it("a URL de erro carrega só um código curto — nunca uma frase", async () => {
    bancoDaAcao();

    await moverAlunoEstagio(
      formulario({
        alunoId: "al-1",
        estagioId: "est-em_risco",
        chaveAtual: "alumni",
        chaveDestino: "em_risco",
      }),
    );

    // MÉDIO 5 (ver `acoes-portal.ts`): `?erro=` é um código de tabela
    // fechada, traduzido pela TELA. Frase na URL vira "aviso oficial do
    // produto" na mão de quem manda o link.
    expect(urlDoRedirect()).toMatch(/^\/crm\?erro=[a-z-]+$/);
  });

  it("a ação NÃO lança: o dublê de `redirect` não lança e mesmo assim nada é escrito", async () => {
    const db = bancoDaAcao();

    await expect(
      moverAlunoEstagio(
        formulario({
          alunoId: "al-1",
          estagioId: "est-prospect",
          chaveAtual: "alumni",
          chaveDestino: "prospect",
        }),
      ),
    ).resolves.toBeUndefined();

    expect(db.setEstagioAluno).not.toHaveBeenCalled();
  });

  it("o formulário que MENTE sobre o destino é pego pelo estágio real do banco", async () => {
    // Alguém posta `chaveDestino: "cliente_ativo"` (a única saída legítima de
    // alumni) apontando para o id do estágio `prospect`. O primeiro portão
    // deixa passar — ele só sabe o que o formulário disse —, e o segundo,
    // que compara com a chave REAL da linha do banco, recusa.
    const db = bancoDaAcao();

    await moverAlunoEstagio(
      formulario({
        alunoId: "al-1",
        estagioId: "est-prospect",
        chaveAtual: "alumni",
        chaveDestino: "cliente_ativo",
      }),
    );

    expect(db.listEstagios).toHaveBeenCalledTimes(1);
    expect(db.setEstagioAluno).not.toHaveBeenCalled();
    expect(db.addAtividade).not.toHaveBeenCalled();
    expect(urlDoRedirect()).toContain("?erro=");
  });

  it("formulário sem `chaveDestino` (a ficha do cliente) ainda é barrado pelo destino real do banco", async () => {
    // A ficha (`/crm/[id]`) manda a origem, mas o destino sai de um `select`
    // de ids — a chave de destino só existe depois de ler o banco. Uma ida
    // ao banco é o preço, e a recusa continua acontecendo.
    const db = bancoDaAcao();

    await moverAlunoEstagio(
      formulario({ alunoId: "al-1", estagioId: "est-em_risco", chaveAtual: "alumni" }),
    );

    expect(db.setEstagioAluno).not.toHaveBeenCalled();
    expect(urlDoRedirect()).toContain("?erro=");
  });

  // ------------------------------------------------------------
  // A ORIGEM é lida da linha do aluno, nunca do que o formulário diz.
  //
  // POR QUE ISTO É O CORAÇÃO DA REGRA: `chaveAtual` é campo escondido de um
  // formulário — quem posta escolhe o valor, e a tela que o escreveu pode
  // estar aberta desde antes de a pessoa virar alumni em outra aba. Um
  // portão que só consulta o formulário não protege fato nenhum: basta o
  // campo faltar, ou mentir, para a trava sumir.
  // ------------------------------------------------------------
  it("sem `chaveAtual` nenhuma, quem é alumni NO BANCO continua barrado", async () => {
    const db = bancoDaAcao({ estagioIdDoAluno: "est-alumni" });

    await moverAlunoEstagio(formulario({ alunoId: "al-1", estagioId: "est-prospect" }));

    expect(db.getAluno).toHaveBeenCalledWith("al-1");
    expect(db.setEstagioAluno).not.toHaveBeenCalled();
    expect(db.addAtividade).not.toHaveBeenCalled();
    expect(urlDoRedirect()).toBe("/crm?erro=transicao");
  });

  it("formulário que MENTE sobre a origem (diz prospect para quem é alumni) é barrado pela linha real", async () => {
    // A tela velha aberta em outra aba: alguém marcou a pessoa como alumni
    // enquanto isso, e o formulário antigo ainda declara a origem de ontem.
    const db = bancoDaAcao({ estagioIdDoAluno: "est-alumni" });

    await moverAlunoEstagio(
      formulario({
        alunoId: "al-1",
        estagioId: "est-prospect",
        chaveAtual: "prospect",
        chaveDestino: "prospect",
      }),
    );

    expect(db.setEstagioAluno).not.toHaveBeenCalled();
    expect(urlDoRedirect()).toBe("/crm?erro=transicao");
  });

  it("o contrário também vale: formulário que MENTE dizendo alumni não trava quem não é alumni no banco", async () => {
    // Nunca apagar vale nos dois sentidos — a trava é sobre o fato gravado,
    // não sobre o que o campo escondido diz. Aqui o portão 1 nem entra em
    // cena (sem `chaveDestino`), e o portão 2 decide pela linha real.
    const db = bancoDaAcao({ estagioIdDoAluno: "est-proposta" });

    await moverAlunoEstagio(
      formulario({ alunoId: "al-1", estagioId: "est-cliente_novo", chaveAtual: "alumni" }),
    );

    expect(db.setEstagioAluno).toHaveBeenCalledTimes(1);
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("aluno sem estágio nenhum no banco pode ser movido (o começo do funil não trava nada)", async () => {
    const db = bancoDaAcao({ estagioIdDoAluno: null });

    await moverAlunoEstagio(
      formulario({ alunoId: "al-1", estagioId: "est-proposta", chaveDestino: "proposta" }),
    );

    expect(db.setEstagioAluno).toHaveBeenCalledTimes(1);
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("aluno que a leitura não encontra (apagado, ou fora do alcance da RLS) não é escrito", async () => {
    // Sem conseguir ler a linha, a ação não sabe de onde a pessoa sai — e
    // decidir sem saber é exatamente o que esta tarefa veio impedir.
    const db = bancoDaAcao({ semAluno: true });

    await moverAlunoEstagio(
      formulario({ alunoId: "al-1", estagioId: "est-proposta", chaveDestino: "proposta" }),
    );

    expect(db.setEstagioAluno).not.toHaveBeenCalled();
    expect(db.addAtividade).not.toHaveBeenCalled();
    expect(urlDoRedirect()).toBe("/crm?erro=aluno");
  });

  it("banco que estoura na LEITURA volta em ?erro= em vez de derrubar a tela", async () => {
    // "nunca lançando" é o combinado da tarefa. Antes da escrita nada mudou,
    // então a frase "não foi possível mover" é verdade.
    const db = bancoDaAcao({ erroDeLeitura: true });

    await expect(
      moverAlunoEstagio(
        formulario({ alunoId: "al-1", estagioId: "est-proposta", chaveDestino: "proposta" }),
      ),
    ).resolves.toBeUndefined();

    expect(db.setEstagioAluno).not.toHaveBeenCalled();
    expect(urlDoRedirect()).toMatch(/^\/crm\?erro=[a-z-]+$/);
  });

  it("estágio inexistente volta em ?erro= em vez de lançar", async () => {
    const db = bancoDaAcao();

    await moverAlunoEstagio(
      formulario({ alunoId: "al-1", estagioId: "est-que-nao-existe", chaveAtual: "prospect" }),
    );

    expect(db.setEstagioAluno).not.toHaveBeenCalled();
    expect(urlDoRedirect()).toMatch(/^\/crm\?erro=[a-z-]+$/);
  });

  it("formulário sem alunoId não chega ao banco", async () => {
    const db = bancoDaAcao();

    await moverAlunoEstagio(formulario({ alunoId: "", estagioId: "est-prospect" }));

    expect(getDBMock).not.toHaveBeenCalled();
    expect(db.setEstagioAluno).not.toHaveBeenCalled();
    expect(urlDoRedirect()).toMatch(/^\/crm\?erro=[a-z-]+$/);
  });
});

describe("moverAlunoEstagio — transição permitida", () => {
  it("alumni → cliente_ativo (a recompra) grava e não redireciona", async () => {
    const db = bancoDaAcao();

    await moverAlunoEstagio(
      formulario({
        alunoId: "al-1",
        estagioId: "est-cliente_ativo",
        chaveAtual: "alumni",
        chaveDestino: "cliente_ativo",
      }),
    );

    expect(db.setEstagioAluno).toHaveBeenCalledTimes(1);
    expect(db.setEstagioAluno.mock.calls[0][0]).toBe("al-1");
    expect(db.addAtividade).toHaveBeenCalledTimes(1);
    expect(redirectMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).toHaveBeenCalled();
  });

  it("retroceder (cliente_ativo → proposta) é permitido: negócio real volta atrás", async () => {
    const db = bancoDaAcao({ estagioIdDoAluno: "est-cliente_ativo" });

    await moverAlunoEstagio(
      formulario({
        alunoId: "al-1",
        estagioId: "est-proposta",
        chaveAtual: "cliente_ativo",
        chaveDestino: "proposta",
      }),
    );

    expect(db.setEstagioAluno).toHaveBeenCalledTimes(1);
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("mover para um estágio FORA da escada continua possível (nunca apagar vale também aqui)", async () => {
    const db = bancoDaAcao({
      estagios: [...ESCADA_COMPLETA, estagio("inativo", "Inativo", 8)],
      estagioIdDoAluno: "est-em_risco",
    });

    await moverAlunoEstagio(
      formulario({
        alunoId: "al-1",
        estagioId: "est-inativo",
        chaveAtual: "em_risco",
        chaveDestino: "inativo",
      }),
    );

    expect(db.setEstagioAluno).toHaveBeenCalledTimes(1);
    expect(redirectMock).not.toHaveBeenCalled();
  });
});

// ============================================================
// 4b. Os OUTROS dois consumidores da mesma escada: o filtro de estágio e a
//     visão em lista. Uma escada só por tela — se cada pedaço da página
//     ordenar do seu jeito, a Fase 2 não desfez confusão nenhuma.
// ============================================================

describe("filtro de estágio — as opções saem na ordem da escada", () => {
  it("com os sete estágios embaralhados, o `select` lista na ordem canônica", async () => {
    const html = await renderizarCrm(embaralhada(ESCADA_COMPLETA));

    expect(opcoesDoFiltro(html)).toEqual(NOMES_DA_ESCADA);
  });

  it("estágio fora da escada continua no filtro, no fim (dá para filtrar por ele)", async () => {
    const html = await renderizarCrm([estagio("xpto", "Reativação", 2), ...ESCADA_COMPLETA]);

    expect(opcoesDoFiltro(html)).toEqual([...NOMES_DA_ESCADA, "Reativação"]);
  });
});

describe("visão em lista — a mesma escada do quadro", () => {
  it("as pessoas saem na ordem da escada, não na de `crm_estagios.ordem`", async () => {
    // `ordem` invertida no banco (é campo editável pelo dono): se a lista
    // ainda ordenasse por ela, a saída viria de trás para a frente.
    const invertida = ESCADA_COMPLETA.map((e, i) => ({
      ...e,
      ordem: ESCADA_COMPLETA.length - i,
    }));

    const html = await renderizarCrm(embaralhada(invertida), {
      alunos: [
        aluno("al-1", "Zulmira Alves", "est-alumni"),
        aluno("al-2", "Ana Prado", "est-prospect"),
        aluno("al-3", "Bento Rocha", "est-proposta"),
      ],
      searchParams: { visao: "lista" },
    });

    expect(linhasDaLista(html)).toEqual(["Ana Prado", "Bento Rocha", "Zulmira Alves"]);
  });

  it("quem está em estágio fora da escada vai para o fim da lista, com o rótulo do banco", async () => {
    const html = await renderizarCrm([...ESCADA_COMPLETA, estagio("xpto", "Reativação", 9)], {
      alunos: [
        aluno("al-1", "Ana Prado", "est-xpto"),
        aluno("al-2", "Bento Rocha", "est-cliente_ativo"),
      ],
      searchParams: { visao: "lista" },
    });

    expect(linhasDaLista(html)).toEqual(["Bento Rocha", "Ana Prado"]);
    expect(estagiosDaLista(html)).toEqual(["Cliente ativo", "Reativação"]);
  });
});

// ============================================================
// 4c. Pessoa com estágio órfão (id que não existe mais, ou nenhum) — as duas
//     visões têm de colocá-la no MESMO ponto da escada, e nenhuma das duas
//     pode sumir com ela.
// ============================================================

describe("pessoa sem estágio legível — nunca some, e o quadro e a lista concordam", () => {
  it("cartão com `estagioId` órfão aparece na primeira coluna da escada, não no limbo", async () => {
    const html = await renderizarCrm(ESCADA_COMPLETA, {
      alunos: [aluno("al-1", "Ana Prado", "est-que-nao-existe-mais")],
    });

    expect(cartoesDaColuna(html, "Prospect")).toEqual(["Ana Prado"]);
  });

  it("cartão sem estágio nenhum (`null`) também aparece na primeira coluna", async () => {
    const html = await renderizarCrm(ESCADA_COMPLETA, {
      alunos: [aluno("al-1", "Ana Prado", null)],
    });

    expect(cartoesDaColuna(html, "Prospect")).toEqual(["Ana Prado"]);
  });

  it("na lista, a órfã ocupa o mesmo lugar da escada que o quadro lhe dá — e o estágio continua '—'", async () => {
    // O quadro põe a órfã na primeira coluna; a lista tem de pôr no mesmo
    // degrau, senão a mesma pessoa está em dois pontos do funil na mesma
    // tela. O rótulo continua "—" porque o banco não diz o estágio dela:
    // posicionar não é afirmar.
    const alunos = [
      aluno("al-1", "Ana Prado", "est-prospect"),
      aluno("al-2", "Bento Rocha", "est-que-nao-existe-mais"),
      aluno("al-3", "Carla Dias", "est-alumni"),
    ];

    const kanban = await renderizarCrm(ESCADA_COMPLETA, { alunos });
    const lista = await renderizarCrm(ESCADA_COMPLETA, {
      alunos,
      searchParams: { visao: "lista" },
    });

    expect(cartoesDaColuna(kanban, "Prospect")).toEqual(["Ana Prado", "Bento Rocha"]);
    expect(linhasDaLista(lista)).toEqual(["Ana Prado", "Bento Rocha", "Carla Dias"]);
    expect(estagiosDaLista(lista)).toEqual(["Prospect", "—", "Alumni"]);
  });
});

// ============================================================
// 5. O aviso na tela — tabela fechada, e zero emoji.
// ============================================================

describe("a tela mostra o motivo da recusa sem ecoar a URL", () => {
  it("com ?erro=transicao a tela explica a recusa em português", async () => {
    const html = await renderizarCrm(ESCADA_COMPLETA, { searchParams: { erro: "transicao" } });

    // A frase inteira, e não só a palavra "alumni": a coluna "Alumni" do
    // quadro está desenhada ao lado, e um `toContain("alumni")` passaria
    // mesmo com o banner vazio.
    expect(html).toContain(
      "Quem já é alumni só volta para o funil como cliente ativo (recompra). O movimento foi recusado e ninguém mudou de estágio.",
    );
  });

  it("com ?erro=aluno a tela diz que não deu para confirmar o estágio, sem culpar a pessoa", async () => {
    const html = await renderizarCrm(ESCADA_COMPLETA, { searchParams: { erro: "aluno" } });

    expect(html.toLowerCase()).toContain("não foi possível confirmar");
    expect(html.toLowerCase()).toContain("nada foi alterado");
  });

  it("código desconhecido cai numa frase genérica e NUNCA ecoa o texto da URL", async () => {
    const ataque = "Sua conta foi suspensa, ligue para 0800-000-0000";

    const html = await renderizarCrm(ESCADA_COMPLETA, { searchParams: { erro: ataque } });

    expect(html).not.toContain("0800-000-0000");
    expect(html).not.toContain("suspensa");
    expect(html).toContain("Não foi possível");
  });

  it("`?erro=toString` (herança de Object) cai na frase genérica, não numa função", async () => {
    const html = await renderizarCrm(ESCADA_COMPLETA, { searchParams: { erro: "toString" } });

    expect(html).toContain("Não foi possível concluir a ação agora");
    expect(html).not.toContain("native code");
  });

  it("sem ?erro= não existe banner nenhum", async () => {
    const html = await renderizarCrm(ESCADA_COMPLETA);

    expect(html).not.toContain("Não foi possível");
  });

  it("zero emoji na tela, com e sem aviso de erro", async () => {
    const comErro = await renderizarCrm(ESCADA_COMPLETA, {
      alunos: [aluno("al-1", "Fulano de Tal", "est-alumni")],
      searchParams: { erro: "transicao" },
    });
    const semErro = await renderizarCrm(ESCADA_COMPLETA);

    expect(semEmoji(comErro)).toBe(true);
    expect(semEmoji(semErro)).toBe(true);
  });
});
