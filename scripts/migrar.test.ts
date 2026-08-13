// ============================================================
// Testes de `migrar-planilha-para-supabase.ts` — TUDO com dublês, SEM rede.
//
// Este ambiente não alcança nem o Google (planilha) nem o Supabase (banco),
// então nenhum teste aqui usa `sheetsProvider` de verdade nem
// `criarClienteSupabase` de verdade. Em vez disso:
//
//   - a LEITURA da planilha é substituída por `DefinicaoEntidade.ler()`
//     dublê, que devolve uma lista fixa de objetos de domínio já prontos —
//     é exatamente o formato que `sheetsProvider` devolveria depois de ler
//     e converter uma aba de verdade;
//   - a ESCRITA no Postgres é substituída por `ClienteBancoFalso`, uma
//     implementação em memória de `ClienteBanco` (a mesma interface que
//     `criarClienteSupabase` implementa contra o Supabase real).
//
// O motor de migração (`migrarEntidade`, `validarOrdemDeDependencia`,
// `montarConferencia`, `decidirCodigoSaida`) não sabe a diferença entre o
// dublê e a coisa real — é esse desacoplamento que torna a lógica central
// (ordem, mapa de ids, idempotência, recusa, conferência) testável aqui.
//
// A ORDEM REAL de `ENTIDADES_MIGRAVEIS` (as 31 entidades de verdade, na
// ordem lida das migrações) também é exercitada, mas só na checagem de
// dependência (`validarOrdemDeDependencia`), que é pura array/lógica —
// nenhuma chamada a `ler()` dessas entidades acontece neste arquivo.
// ============================================================
import { pathToFileURL } from "node:url";
import { describe, expect, it, vi } from "vitest";
import {
  criarMapaIds,
  ehChamadaDireta,
  idSimulado,
  PREFIXO_ID_SIMULADO,
  valoresSimulados,
  decidirCodigoSaida,
  ENTIDADES_MIGRAVEIS,
  ENTIDADES_PULADAS,
  migrarEntidade,
  montarConferencia,
  validarOrdemDeDependencia,
  type ClienteBanco,
  type DefinicaoEntidade,
  type LinhaConferencia,
  type Recusa,
  type ResultadoEntidade,
} from "./migrar-planilha-para-supabase";

/** Nomes das dez entidades sem aba na planilha — usado nos testes de ordem
 *  para reconhecer que uma dependência "pendurada" nelas é esperada. */
const NOMES_PULADAS = new Set(ENTIDADES_PULADAS.map((p) => p.entidade));

// ------------------------------------------------------------
// Dublê de ClienteBanco: um Postgres de brinquedo, em memória.
// ------------------------------------------------------------
// Guarda as linhas por tabela e resolve `buscarPorChaveNatural` comparando
// campo a campo — o bastante para provar idempotência e recusa sem
// depender de nenhuma API de rede.
function criarClienteBancoFalso(): ClienteBanco & {
  tabelas: Map<string, { id: string; linha: Record<string, unknown> }[]>;
  chamadasDeInsercao: { tabela: string; linha: Record<string, unknown> }[];
} {
  const tabelas = new Map<string, { id: string; linha: Record<string, unknown> }[]>();
  const chamadasDeInsercao: { tabela: string; linha: Record<string, unknown> }[] = [];
  let proximoId = 1;

  function bateFiltro(linha: Record<string, unknown>, filtro: Record<string, unknown>): boolean {
    return Object.entries(filtro).every(([campo, valor]) => linha[campo] === valor);
  }

  return {
    tabelas,
    chamadasDeInsercao,
    async buscarPorChaveNatural(tabela, filtro) {
      const linhas = tabelas.get(tabela) ?? [];
      const achada = linhas.find((l) => bateFiltro(l.linha, filtro));
      return achada ? achada.id : null;
    },
    async inserir(tabela, linha) {
      chamadasDeInsercao.push({ tabela, linha });
      const id = `uuid-${proximoId++}`;
      if (!tabelas.has(tabela)) tabelas.set(tabela, []);
      tabelas.get(tabela)!.push({ id, linha });
      return id;
    },
    async contar(tabela) {
      return (tabelas.get(tabela) ?? []).length;
    },
  };
}

// ------------------------------------------------------------
// Dublês de DefinicaoEntidade: "alunos" e "matriculas" de brinquedo,
// deliberadamente parecidos com o par real (aluno_id NOT NULL em
// matriculas), para exercitar resolução de referência e id antigo/novo.
// ------------------------------------------------------------
type AlunoFalso = { id: string; nome: string };
type MatriculaFalsa = { id: string; alunoId: string; valor: number };

function definirAlunosFalso(itens: AlunoFalso[]): DefinicaoEntidade<AlunoFalso> {
  return {
    entidade: "alunos",
    aba: "ALUNOS",
    dependeDe: [],
    ler: async () => itens,
    idOrigem: (a) => a.id,
    converter: (a) => {
      if (a.nome === "") return { recusa: "nome vazio" };
      return { linha: { nome: a.nome } };
    },
    chaveNatural: (l) => ({ nome: l.nome }),
  };
}

function definirMatriculasFalso(itens: MatriculaFalsa[]): DefinicaoEntidade<MatriculaFalsa> {
  return {
    entidade: "matriculas",
    aba: "VENDAS",
    dependeDe: ["alunos"],
    ler: async () => itens,
    idOrigem: (m) => m.id,
    converter: (m, mapa) => {
      const alunoId = mapa.resolver("alunos", m.alunoId);
      if (!alunoId) return { recusa: `aluno "${m.alunoId}" não encontrado em alunos` };
      return { linha: { aluno_id: alunoId, valor: m.valor } };
    },
    chaveNatural: (l) => ({ aluno_id: l.aluno_id, valor: l.valor }),
  };
}

/**
 * Uma segunda entidade de brinquede, deliberadamente construída para que a
 * MESMA chave natural (nome+telefone) possa sair de `chaveNatural` com os
 * campos em ORDEM DIFERENTE dependendo da linha (`ordemInvertida`). Nenhuma
 * entidade real do script faz isso de propósito — `chaveNatural` de verdade
 * sempre escreve os campos na mesma ordem no código-fonte — mas é exatamente
 * esse tipo de variação que provaria (ou derrubaria) uma serialização que
 * NÃO ordena as chaves antes de comparar: sem ordenar, `{nome,telefone}` e
 * `{telefone,nome}` viram strings JSON diferentes e a duplicata passa batido.
 */
type PessoaFalsa = { id: string; nome: string; telefone: string; ordemInvertida?: boolean };

function definirPessoasChaveTrocadaFalso(itens: PessoaFalsa[]): DefinicaoEntidade<PessoaFalsa> {
  return {
    entidade: "pessoas_chave_trocada",
    aba: "TESTE",
    dependeDe: [],
    ler: async () => itens,
    idOrigem: (p) => p.id,
    converter: (p) => ({ linha: { nome: p.nome, telefone: p.telefone, ordem_invertida: p.ordemInvertida ?? false } }),
    chaveNatural: (l) =>
      l.ordem_invertida
        ? { telefone: l.telefone, nome: l.nome }
        : { nome: l.nome, telefone: l.telefone },
  };
}

/**
 * Um `ClienteBanco` que só sabe responder `contar()` com valores fixos por
 * tabela — usado nos testes de `montarConferencia`/`decidirCodigoSaida` que
 * não passam por `migrarEntidade` nenhuma, então não deveriam precisar de
 * `buscarPorChaveNatural`/`inserir` de verdade. Se algum desses dois for
 * chamado por engano, o teste falha alto (lançando), em vez de silenciosamente
 * devolver um valor de brinquedo que mascare o erro.
 */
function bancoComContagem(valores: Record<string, number>): ClienteBanco {
  return {
    async buscarPorChaveNatural() {
      throw new Error("montarConferencia não deveria chamar buscarPorChaveNatural — só usa banco.contar().");
    },
    async inserir() {
      throw new Error("montarConferencia não deveria chamar inserir — ela só lê, nunca escreve.");
    },
    async contar(tabela) {
      return valores[tabela] ?? 0;
    },
  };
}

/**
 * Monta um `ResultadoEntidade` de teste sem passar por `migrarEntidade` —
 * para os testes de `montarConferencia`/`decidirCodigoSaida`, que exercitam
 * só o CÁLCULO da conferência a partir de um resultado já pronto, não o
 * motor de migração inteiro. Os campos não informados vêm com o valor
 * "neutro" (zero linhas, nenhuma recusa) para o teste só precisar declarar o
 * que importa para o caso em questão.
 */
function resultadoFixo(parcial: Partial<ResultadoEntidade> & { entidade: string }): ResultadoEntidade {
  return {
    aba: "TESTE",
    lidas: 0,
    inseridas: 0,
    jaExistentes: 0,
    recusas: [],
    duplicadasNaOrigem: 0,
    ...parcial,
  };
}

// ============================================================
// 1. Ordem de dependência
// ============================================================
describe("validarOrdemDeDependencia", () => {
  it("aceita a ordem REAL das 31 entidades migráveis (lidas das migrações) sem lançar", () => {
    // `turmas` é a única dependência real do schema que aponta para uma
    // entidade PULADA (ver `encontros` em ENTIDADES_MIGRAVEIS e `turmas` em
    // ENTIDADES_PULADAS) — passá-la explicitamente é o mesmo que
    // `rodarMigracao` faz antes de migrar de verdade.
    expect(() => validarOrdemDeDependencia(ENTIDADES_MIGRAVEIS, NOMES_PULADAS)).not.toThrow();
  });

  it("SEM a lista de puladas, a dependência de 'encontros' em 'turmas' é tratada como erro de ordenação (prova que o relaxamento é explícito, não um buraco silencioso)", () => {
    expect(() => validarOrdemDeDependencia(ENTIDADES_MIGRAVEIS)).toThrow(/depende de "turmas"/);
  });

  it("aceita uma ordem de brinquede em que a dependente vem DEPOIS da dependida", () => {
    const alunos = definirAlunosFalso([]);
    const matriculas = definirMatriculasFalso([]);
    expect(() => validarOrdemDeDependencia([alunos, matriculas])).not.toThrow();
  });

  it("RECUSA uma ordem em que a dependente vem ANTES da dependida (nenhuma entidade pode ser inserida antes daquela de quem ela depende)", () => {
    const alunos = definirAlunosFalso([]);
    const matriculas = definirMatriculasFalso([]);
    // ordem invertida de propósito: matriculas antes de alunos
    expect(() => validarOrdemDeDependencia([matriculas, alunos])).toThrow(/depende de "alunos"/);
  });

  it("cada entidade da lista real só depende de entidades que aparecem ANTES dela na mesma lista", () => {
    // Prova redundante, mais explícita: percorre a lista e some
    // "não deveria falhar" se a ordem real algum dia regredir.
    const vistas = new Set<string>();
    for (const def of ENTIDADES_MIGRAVEIS) {
      for (const dep of def.dependeDe) {
        // Dependência para uma entidade PULADA (sem aba na planilha) é um
        // limite de dado conhecido, não uma violação de ordem — ver
        // ENTIDADES_PULADAS e o comentário de `encontros`.
        if (NOMES_PULADAS.has(dep)) continue;
        expect(vistas.has(dep), `"${def.entidade}" depende de "${dep}", que ainda não apareceu antes dela`).toBe(true);
      }
      vistas.add(def.entidade);
    }
  });
});

// ============================================================
// 2. Mapa de ids aplicado nas chaves estrangeiras
// ============================================================
describe("mapa de ids: uuid novo propaga para quem depende", () => {
  it("uma matrícula cujo alunoId era 'ALU-1' sai com o uuid que o insert do aluno devolveu", async () => {
    const banco = criarClienteBancoFalso();
    const mapa = criarMapaIds();

    const alunos = definirAlunosFalso([{ id: "ALU-1", nome: "Fulano" }]);
    const matriculas = definirMatriculasFalso([{ id: "VEN-1", alunoId: "ALU-1", valor: 100 }]);

    const resultadoAlunos = await migrarEntidade(alunos, banco, mapa, true);
    expect(resultadoAlunos.inseridas).toBe(1);

    const uuidDoAluno = mapa.resolver("alunos", "ALU-1");
    expect(uuidDoAluno).toBeDefined();
    expect(uuidDoAluno).toMatch(/^uuid-/);

    const resultadoMatriculas = await migrarEntidade(matriculas, banco, mapa, true);
    expect(resultadoMatriculas.inseridas).toBe(1);
    expect(resultadoMatriculas.recusas).toEqual([]);

    const linhaGravada = banco.chamadasDeInsercao.find((c) => c.tabela === "matriculas")!.linha;
    expect(linhaGravada.aluno_id).toBe(uuidDoAluno);
    // e não o id antigo da planilha, que não existe no Postgres:
    expect(linhaGravada.aluno_id).not.toBe("ALU-1");
  });

  it("uma matrícula que referencia um aluno nunca migrado é recusada, não recebe um id chutado", async () => {
    const banco = criarClienteBancoFalso();
    const mapa = criarMapaIds();
    // "alunos" nunca roda aqui — simula um aluno cuja migração falhou antes.
    const matriculas = definirMatriculasFalso([{ id: "VEN-9", alunoId: "ALU-FANTASMA", valor: 50 }]);

    const resultado = await migrarEntidade(matriculas, banco, mapa, true);
    expect(resultado.inseridas).toBe(0);
    expect(resultado.recusas).toHaveLength(1);
    expect(resultado.recusas[0].motivo).toMatch(/ALU-FANTASMA/);
    expect(banco.chamadasDeInsercao).toEqual([]);
  });
});

// ============================================================
// 3. Idempotência
// ============================================================
describe("idempotência", () => {
  it("rodar duas vezes sobre a mesma fonte insere na primeira e ZERO na segunda", async () => {
    const banco = criarClienteBancoFalso();
    const mapa = criarMapaIds();
    const alunos = definirAlunosFalso([
      { id: "ALU-1", nome: "Fulano" },
      { id: "ALU-2", nome: "Beltrano" },
    ]);

    const primeira = await migrarEntidade(alunos, banco, mapa, true);
    expect(primeira.inseridas).toBe(2);
    expect(primeira.jaExistentes).toBe(0);

    // segunda execução: MESMA fonte, mesmo banco (persistiu da primeira vez),
    // mas um MAPA DE IDS NOVO — simula rodar o script de novo do zero, sem
    // nenhuma memória da execução anterior além do que já está no Postgres.
    const mapaSegundaExecucao = criarMapaIds();
    const segunda = await migrarEntidade(alunos, banco, mapaSegundaExecucao, true);
    expect(segunda.inseridas).toBe(0);
    expect(segunda.jaExistentes).toBe(2);

    // e o total no "Postgres" continua sendo 2, não 4:
    expect(await banco.contar("alunos")).toBe(2);
    // o mapa de ids da segunda execução ainda reconhece o aluno (por chave
    // natural), mesmo sem tê-lo inserido de novo — é isso que permite quem
    // depende dele (matriculas) funcionar também na segunda execução.
    expect(mapaSegundaExecucao.resolver("alunos", "ALU-1")).toBeDefined();
  });
});

// ============================================================
// 3.5 Duplicatas NA ORIGEM — chave natural repetida DENTRO da mesma leitura
// ============================================================
//
// Este é o defeito real do incidente: a CONFERÊNCIA gritava "DIVERGE" quando
// a planilha tinha, por exemplo, 10 linhas de ALUNOS para 6 pessoas reais
// (lead duplicado + linhas de teste com o mesmo telefone). A deduplicação
// por chave natural é o comportamento CORRETO — o Postgres deve guardar uma
// linha por pessoa, não uma por linha da planilha. O que faltava era o
// script SABER e CONTAR que descartou duplicatas, em vez de deixar a
// conferência comparar "linhas lidas" com "linhas gravadas" como se fossem
// sempre a mesma coisa.
//
// Note a diferença para "idempotência" (seção 3, acima): lá o Postgres já
// tinha a linha de uma execução ANTERIOR (`jaExistentes`); aqui a repetição
// está DENTRO da mesma leitura da planilha, na mesma execução
// (`duplicadasNaOrigem`) — os dois contadores são independentes.
describe("duplicatas na origem (mesma chave natural repetida na mesma leitura)", () => {
  it("duas linhas com a mesma chave natural: lidas 2, inseridas 1, duplicadasNaOrigem 1, banco.inserir chamado UMA vez", async () => {
    const banco = criarClienteBancoFalso();
    const espiaoInserir = vi.spyOn(banco, "inserir");
    const mapa = criarMapaIds();
    const alunos = definirAlunosFalso([
      { id: "ALU-1", nome: "Fulano" },
      { id: "ALU-2", nome: "Fulano" }, // mesma chave natural (nome) — duplicata na planilha
    ]);

    const resultado = await migrarEntidade(alunos, banco, mapa, true);

    expect(resultado.lidas).toBe(2);
    expect(resultado.inseridas).toBe(1);
    expect(resultado.duplicadasNaOrigem).toBe(1);
    expect(espiaoInserir).toHaveBeenCalledTimes(1);

    // a linha duplicada AINDA registra id no mapa — quem depende dela (uma
    // FK apontando para ALU-2) precisa resolver a referência mesmo que
    // ALU-2 nunca tenha sido inserida de novo:
    expect(mapa.resolver("alunos", "ALU-2")).toBeDefined();
    expect(mapa.resolver("alunos", "ALU-2")).toBe(mapa.resolver("alunos", "ALU-1"));
  });

  it("o mesmo caso em modo SIMULAÇÃO: duplicadasNaOrigem 1, ZERO chamadas de escrita", async () => {
    const banco = criarClienteBancoFalso();
    const espiaoInserir = vi.spyOn(banco, "inserir");
    const mapa = criarMapaIds();
    const alunos = definirAlunosFalso([
      { id: "ALU-1", nome: "Fulano" },
      { id: "ALU-2", nome: "Fulano" },
    ]);

    const resultado = await migrarEntidade(alunos, banco, mapa, false);

    expect(resultado.duplicadasNaOrigem).toBe(1);
    expect(resultado.inseridas).toBe(1); // "seria inserida" — uma cópia só, a repetida não conta de novo
    expect(espiaoInserir).not.toHaveBeenCalled();
    expect(mapa.resolver("alunos", "ALU-2")).toBe(mapa.resolver("alunos", "ALU-1"));
  });

  it("a chave natural com campos em ordem trocada ({nome,telefone} contra {telefone,nome}) conta como a MESMA chave", async () => {
    const banco = criarClienteBancoFalso();
    const mapa = criarMapaIds();
    const pessoas = definirPessoasChaveTrocadaFalso([
      { id: "P-1", nome: "Ana", telefone: "11999990000" },
      // mesmíssima pessoa, mas `chaveNatural` devolve os campos na ordem
      // TROCADA — sem ordenar por nome de campo antes de serializar, isto
      // pareceria uma chave DIFERENTE e a duplicata escaparia:
      { id: "P-2", nome: "Ana", telefone: "11999990000", ordemInvertida: true },
    ]);

    const resultado = await migrarEntidade(pessoas, banco, mapa, true);

    expect(resultado.duplicadasNaOrigem).toBe(1);
    expect(resultado.inseridas).toBe(1);
    expect(banco.chamadasDeInsercao).toHaveLength(1);
  });
});

// ============================================================
// 4. Linha inconvertível vai para a lista de recusadas, nunca com valor remendado
// ============================================================
describe("linha inconvertível", () => {
  it("vai para a lista de recusadas com o motivo e a posição, e NÃO é inserida com valor remendado", async () => {
    const banco = criarClienteBancoFalso();
    const mapa = criarMapaIds();
    const alunos = definirAlunosFalso([
      { id: "ALU-1", nome: "Fulano" },
      { id: "ALU-2", nome: "" }, // inconvertível: sem nome
      { id: "ALU-3", nome: "Ciclano" },
    ]);

    const resultado = await migrarEntidade(alunos, banco, mapa, true);

    expect(resultado.lidas).toBe(3);
    expect(resultado.inseridas).toBe(2); // ALU-1 e ALU-3, não os 3
    expect(resultado.recusas).toHaveLength(1);
    expect(resultado.recusas[0]).toMatchObject({ entidade: "alunos", posicao: 2, idOrigem: "ALU-2" });
    expect(resultado.recusas[0].motivo).toMatch(/nome vazio/);

    // nenhuma linha gravada tem nome vazio ou qualquer "remendo" no lugar:
    const nomesGravados = banco.chamadasDeInsercao.map((c) => c.linha.nome);
    expect(nomesGravados).toEqual(["Fulano", "Ciclano"]);
    expect(nomesGravados).not.toContain("");
    expect(mapa.resolver("alunos", "ALU-2")).toBeUndefined();
  });
});

// ============================================================
// 5. Conferência final falha (código de saída != 0) quando destino < origem
// ============================================================
describe("conferência final e código de saída", () => {
  it("bate quando a contagem do Postgres é igual à da planilha", () => {
    const conferencia: LinhaConferencia[] = [{ entidade: "alunos", planilha: 3, postgres: 3, duplicadas: 0, bate: true }];
    expect(decidirCodigoSaida(conferencia, true)).toBe(0);
  });

  it("falha (código != 0) em --aplicar quando a contagem do Postgres é MENOR que a da planilha", () => {
    const conferencia: LinhaConferencia[] = [{ entidade: "alunos", planilha: 5, postgres: 3, duplicadas: 0, bate: false }];
    const consoleErro = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(decidirCodigoSaida(conferencia, true)).not.toBe(0);
      // a mensagem diz EXATAMENTE qual entidade divergiu:
      const impresso = consoleErro.mock.calls.flat().join("\n");
      expect(impresso).toContain("alunos");
      expect(impresso).toContain("planilha=5");
      expect(impresso).toContain("postgres=3");
    } finally {
      consoleErro.mockRestore();
    }
  });

  it("em modo simulação (--aplicar ausente) NUNCA falha por divergência, mesmo com contagens diferentes — a divergência é esperada porque nada foi escrito", () => {
    const conferencia: LinhaConferencia[] = [{ entidade: "alunos", planilha: 5, postgres: 0, duplicadas: 0, bate: false }];
    expect(decidirCodigoSaida(conferencia, false)).toBe(0);
  });

  it("montarConferencia compara o total do Postgres (não só o inserido nesta execução) contra o total lido da planilha, descontando a recusa", async () => {
    // ATUALIZADO: a fórmula antiga de `bate` era `lidas === postgres`, que
    // tratava toda diferença — inclusive uma linha corretamente RECUSADA —
    // como falha de migração. Uma linha recusada nunca foi escrita (regra
    // 2: nunca inventa dado), então não escrever ela também não é
    // divergência nenhuma: é o script fazendo exatamente o que devia. Por
    // isso, com 2 lidas e 1 recusada, o Postgres tendo 1 linha agora BATE
    // (2 lidas - 0 duplicadas - 1 recusada = 1 = postgres) — o teste antigo
    // esperava `bate: false` aqui, o que hoje seria o próprio defeito que
    // este arquivo existe para corrigir.
    const banco = criarClienteBancoFalso();
    const mapa = criarMapaIds();
    const alunos = definirAlunosFalso([
      { id: "ALU-1", nome: "Fulano" },
      { id: "ALU-2", nome: "" }, // recusado — nunca vai existir no Postgres, e está certo que não exista
    ]);
    const resultado = await migrarEntidade(alunos, banco, mapa, true);
    const conferencia = await montarConferencia([resultado], banco);

    expect(conferencia).toHaveLength(1);
    expect(conferencia[0]).toMatchObject({ entidade: "alunos", planilha: 2, postgres: 1, duplicadas: 0, bate: true });
  });

  // ----------------------------------------------------------
  // O CASO REAL: duplicata na origem some da conta, recusa também — e só
  // sobra "DIVERGE" quando nem uma nem outra explicam a diferença.
  // ----------------------------------------------------------
  it("montarConferencia: bate=true quando lidas - duplicadas - recusas === postgres (sem recusa, só duplicata)", async () => {
    const banco = bancoComContagem({ alunos: 6 });
    const resultado = resultadoFixo({ entidade: "alunos", lidas: 10, duplicadasNaOrigem: 4, recusas: [] });

    const conferencia = await montarConferencia([resultado], banco);

    expect(conferencia[0]).toMatchObject({ entidade: "alunos", planilha: 10, postgres: 6, duplicadas: 4, bate: true });
  });

  it("montarConferencia: bate=false quando a diferença NÃO é explicada por duplicata nenhuma — aí sim é problema de verdade", async () => {
    const banco = bancoComContagem({ alunos: 6 });
    const resultado = resultadoFixo({ entidade: "alunos", lidas: 10, duplicadasNaOrigem: 0, recusas: [] });

    const conferencia = await montarConferencia([resultado], banco);

    expect(conferencia[0]).toMatchObject({ entidade: "alunos", planilha: 10, postgres: 6, duplicadas: 0, bate: false });
  });

  it("montarConferencia: bate=true quando duplicata + recusa JUNTAS explicam toda a diferença", async () => {
    const banco = bancoComContagem({ alunos: 6 });
    const recusas: Recusa[] = [
      { entidade: "alunos", posicao: 1, idOrigem: "ALU-X", motivo: "nome vazio" },
      { entidade: "alunos", posicao: 2, idOrigem: "ALU-Y", motivo: "nome vazio" },
    ];
    // 10 lidas - 2 duplicadas - 2 recusadas = 6 = postgres:
    const resultado = resultadoFixo({ entidade: "alunos", lidas: 10, duplicadasNaOrigem: 2, recusas });

    const conferencia = await montarConferencia([resultado], banco);

    expect(conferencia[0]).toMatchObject({ entidade: "alunos", planilha: 10, postgres: 6, duplicadas: 2, bate: true });
  });

  it("decidirCodigoSaida devolve 0 quando toda divergência é explicada por duplicata (bate=true apesar de planilha != postgres)", () => {
    const conferencia: LinhaConferencia[] = [{ entidade: "alunos", planilha: 10, postgres: 6, duplicadas: 4, bate: true }];
    expect(decidirCodigoSaida(conferencia, true)).toBe(0);
  });

  it("decidirCodigoSaida devolve 1 quando a divergência NÃO é explicada por duplicata nenhuma (bate=false)", () => {
    const conferencia: LinhaConferencia[] = [{ entidade: "alunos", planilha: 10, postgres: 6, duplicadas: 0, bate: false }];
    const consoleErro = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(decidirCodigoSaida(conferencia, true)).toBe(1);
    } finally {
      consoleErro.mockRestore();
    }
  });

  // ----------------------------------------------------------
  // O INCIDENTE DE VERDADE: exatamente os números que a conferência real
  // acusou como "DIVERGE" no relatório da migração do dono — alunos (10
  // lidas, 4 duplicadas, 6 no Postgres) e interações (21 lidas, 2
  // duplicadas, 19 no Postgres). A migração tinha terminado perfeitamente;
  // o relatório antigo é quem mentia. Com a fórmula corrigida, as duas
  // batem e o script sai com código 0.
  // ----------------------------------------------------------
  it("CASO REAL: alunos 10 lidas/4 duplicadas/6 no Postgres + interacoes 21 lidas/2 duplicadas/19 no Postgres -> código de saída 0", async () => {
    const banco = bancoComContagem({ alunos: 6, interacoes: 19 });
    const resultados = [
      resultadoFixo({ entidade: "alunos", lidas: 10, duplicadasNaOrigem: 4, recusas: [] }),
      resultadoFixo({ entidade: "interacoes", lidas: 21, duplicadasNaOrigem: 2, recusas: [] }),
    ];

    const conferencia = await montarConferencia(resultados, banco);

    expect(conferencia.every((c) => c.bate)).toBe(true);
    expect(decidirCodigoSaida(conferencia, true)).toBe(0);
  });
});

// ============================================================
// 6. Modo simulação: nenhuma escrita é chamada
// ============================================================
describe("modo simulação", () => {
  it("não chama banco.inserir nenhuma vez, mesmo havendo linhas novas e convertíveis", async () => {
    const banco = criarClienteBancoFalso();
    const espiaoInserir = vi.spyOn(banco, "inserir");
    const mapa = criarMapaIds();
    const alunos = definirAlunosFalso([
      { id: "ALU-1", nome: "Fulano" },
      { id: "ALU-2", nome: "Beltrano" },
    ]);

    const resultado = await migrarEntidade(alunos, banco, mapa, false);

    // O que NÃO pode acontecer: escrita. Esta é a garantia da simulação, e
    // ela continua valendo.
    expect(espiaoInserir).not.toHaveBeenCalled();
    expect(banco.tabelas.get("alunos") ?? []).toEqual([]);

    // O que TEM que acontecer: contar as duas linhas como "seriam
    // inseridas". A versão anterior deste teste exigia zero aqui, o que
    // parecia coerente ("nada foi escrito, então nada foi inserido") e
    // travava a simulação num relatório inútil: com o contador em zero e o
    // mapa de ids vazio, toda entidade dependente era recusada por
    // referência ausente. `inseridas` no modo simulação significa "seriam
    // inseridas", e é isso que o relatório imprime.
    expect(resultado.inseridas).toBe(2);
    expect(resultado.recusas).toEqual([]);

    // E o mapa passa a resolver, para que quem depende de alunos possa ser
    // avaliado de verdade — com um id marcado, nunca com forma de uuid.
    expect(mapa.resolver("alunos", "ALU-1")).toBe(idSimulado("alunos", "ALU-1"));
  });

  it("ainda assim identifica corretamente o que já existe (buscarPorChaveNatural continua sendo uma LEITURA, não uma escrita)", async () => {
    const banco = criarClienteBancoFalso();
    const mapa1 = criarMapaIds();
    const alunos = definirAlunosFalso([{ id: "ALU-1", nome: "Fulano" }]);

    // primeiro insere de verdade...
    await migrarEntidade(alunos, banco, mapa1, true);

    // ...depois simula de novo: o aluno já existe, então não deveria contar
    // como "seria inserido" — mesmo em simulação, reconhecer o que já existe
    // é uma leitura permitida.
    const mapa2 = criarMapaIds();
    const espiaoInserir = vi.spyOn(banco, "inserir");
    const resultadoSimulado = await migrarEntidade(alunos, banco, mapa2, false);

    expect(espiaoInserir).not.toHaveBeenCalled();
    expect(resultadoSimulado.jaExistentes).toBe(1);
    expect(resultadoSimulado.inseridas).toBe(0);
  });
});

// ============================================================
// 7. Entidades puladas: documentadas, nunca fingidas como migradas
// ============================================================
describe("entidades puladas", () => {
  it("nenhuma das dez entidades sem aba aparece na lista de migráveis", () => {
    const nomesMigraveis = new Set(ENTIDADES_MIGRAVEIS.map((e) => e.entidade));
    for (const pulada of ENTIDADES_PULADAS) {
      expect(nomesMigraveis.has(pulada.entidade)).toBe(false);
      expect(pulada.motivo.length).toBeGreaterThan(10);
    }
  });
});

// ============================================================
// A guarda de execução direta — o defeito que só aparecia no Windows
// ============================================================
//
// Este describe existe por um incidente concreto: a simulação rodou na
// máquina do dono, saiu com código 0 e NÃO IMPRIMIU NADA. A guarda comparava
// `import.meta.url` com `file://${process.argv[1]}` montado à mão, o que só
// coincide em sistemas de caminho POSIX. No Windows a comparação dava falso,
// `principal()` nunca era chamada, e o script terminava "com sucesso" sem
// fazer coisa alguma — a falha mais cara de todas, a que parece sucesso.
describe("ehChamadaDireta", () => {
  it("reconhece o caminho POSIX de uma chamada direta", () => {
    const arquivo = "/home/alguem/projeto/scripts/migrar.ts";
    expect(ehChamadaDireta(arquivo, pathToFileURL(arquivo).href)).toBe(true);
  });

  it("reconhece o caminho do WINDOWS, inclusive com espaco no nome da pasta", () => {
    // É o caminho real da máquina do dono: unidade C:, barra invertida e um
    // espaço em "RARO IA" que vira %20 na URL.
    const arquivo = process.platform === "win32"
      ? "C:\\dev\\Repositorios\\RARO IA\\scripts\\migrar.ts"
      : "/dev/Repositorios/RARO IA/scripts/migrar.ts";
    const url = pathToFileURL(arquivo).href;
    expect(url).toContain("%20");
    expect(ehChamadaDireta(arquivo, url)).toBe(true);
  });

  it("NAO reconhece a montagem manual de file:// com caminho do Windows", () => {
    // A versão antiga da guarda. O teste guarda o defeito para que ninguém
    // volte a escrever a comparação na mão.
    const arquivo = "C:\\dev\\Repositorios\\RARO IA\\scripts\\migrar.ts";
    const montadoNaMao = `file://${arquivo}`;
    expect(ehChamadaDireta(arquivo, montadoNaMao)).toBe(false);
  });

  it("e falso quando o modulo e importado por outro processo (o vitest)", () => {
    const arquivo = "/home/alguem/projeto/scripts/migrar.ts";
    const outro = pathToFileURL("/home/alguem/projeto/node_modules/vitest/dist/cli.js").href;
    expect(ehChamadaDireta(arquivo, outro)).toBe(false);
  });

  it("e falso para argv ausente ou vazio, sem lancar", () => {
    expect(ehChamadaDireta(undefined, "file:///x")).toBe(false);
    expect(ehChamadaDireta("", "file:///x")).toBe(false);
  });
});

// ============================================================
// O id de simulação — o que fez o primeiro relatório mentir
// ============================================================
//
// Na primeira execução real, a simulação recusou 47 linhas (21 interações,
// 13 movimentos, 13 importações) por "referência não encontrada" — todas por
// um vínculo que existe e está certo na planilha. A causa não era o dado: em
// simulação nada era registrado no mapa de ids, então toda entidade que
// depende de outra caía. Um relatório cujo trabalho inteiro é dizer a
// verdade sobre o que viria estava produzindo quarenta e sete números
// falsos.
describe("id de simulacao", () => {
  it("e reconhecivel a olho nu e nao se parece com uuid", () => {
    const id = idSimulado("alunos", "ALU-MSP1M2MZ-HTDE");
    expect(id.startsWith(PREFIXO_ID_SIMULADO)).toBe(true);
    // Um uuid tem 36 caracteres e so hexadecimal e hifen. Este nao passa.
    expect(id).not.toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(id).toContain("alunos");
    expect(id).toContain("ALU-MSP1M2MZ-HTDE");
  });

  it("valoresSimulados acha o campo contaminado e ignora o resto", () => {
    expect(valoresSimulados({ nome: "Ana", valor: 10, conta_id: null })).toEqual([]);
    expect(
      valoresSimulados({ nome: "Ana", aluno_id: idSimulado("alunos", "ALU-1"), conta_id: "ok" })
    ).toEqual(["aluno_id"]);
  });

  it("a simulacao resolve a referencia da entidade dependente", async () => {
    // O caso concreto: interacoes depende de alunos. Com o mapa vazio, a
    // linha era recusada; com o id de simulacao registrado, ela e contada
    // como "seria inserida", que e a resposta verdadeira.
    const mapa = criarMapaIds();
    mapa.registrar("alunos", "ALU-1", idSimulado("alunos", "ALU-1"));
    expect(mapa.resolver("alunos", "ALU-1")).toBe(idSimulado("alunos", "ALU-1"));
  });
});
