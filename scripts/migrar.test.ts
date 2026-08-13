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
    const conferencia: LinhaConferencia[] = [{ entidade: "alunos", planilha: 3, postgres: 3, bate: true }];
    expect(decidirCodigoSaida(conferencia, true)).toBe(0);
  });

  it("falha (código != 0) em --aplicar quando a contagem do Postgres é MENOR que a da planilha", () => {
    const conferencia: LinhaConferencia[] = [{ entidade: "alunos", planilha: 5, postgres: 3, bate: false }];
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
    const conferencia: LinhaConferencia[] = [{ entidade: "alunos", planilha: 5, postgres: 0, bate: false }];
    expect(decidirCodigoSaida(conferencia, false)).toBe(0);
  });

  it("montarConferencia compara o total do Postgres (não só o inserido nesta execução) contra o total lido da planilha", async () => {
    const banco = criarClienteBancoFalso();
    const mapa = criarMapaIds();
    const alunos = definirAlunosFalso([
      { id: "ALU-1", nome: "Fulano" },
      { id: "ALU-2", nome: "" }, // recusado — nunca vai existir no Postgres
    ]);
    const resultado = await migrarEntidade(alunos, banco, mapa, true);
    const conferencia = await montarConferencia([resultado], banco);

    expect(conferencia).toHaveLength(1);
    expect(conferencia[0]).toMatchObject({ entidade: "alunos", planilha: 2, postgres: 1, bate: false });
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
