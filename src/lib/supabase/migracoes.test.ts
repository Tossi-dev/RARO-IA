// ============================================================
// Teste de forma das migrações do MentorOS (0005/0006/0007/0008).
//
// Não há Postgres nesta suíte — o teste lê os arquivos .sql do disco
// e prova, por texto, as garantias que mais importam para não vazar
// dado sensível quando um mentorado ganhar login. A prova "de verdade"
// (Postgres real, ataques executados) fica fora desta suíte — ver o
// relatório da auditoria; este arquivo é a rede de segurança que roda
// em todo `npm test`, sem precisar subir banco.
//
// Histórico: a primeira versão deste arquivo (a que acompanhou 0005/
// 0006/0007) tinha um buraco sério, encontrado por uma auditoria que
// EXECUTOU ataques contra um Postgres de verdade: a asserção de
// "tabela do portal cita 'mentorado'" procurava a palavra "mentorado"
// no BLOCO INTEIRO da política — inclusive no NOME dela. Como toda
// política do portal se chama algo como "leitura: dono, gestor e o
// proprio mentorado", a asserção passava pelo NOME e nunca chegava a
// olhar o `using`. A auditoria gerou uma 0007 que liberava o portal
// inteiro para qualquer 'mentorado' (sem checar mentorado_atual()) e
// os 28 testes antigos continuaram verdes. Esta versão corrige isso:
//
//   1) o nome da política (a string entre aspas duplas) é removido
//      ANTES de qualquer busca por palavra-chave no filtro;
//   2) tabela do portal exige os DOIS pedaços: `papel_atual() = 'mentorado'`
//      E uma chamada a `mentorado_atual()` no mesmo bloco — não basta
//      mencionar o papel, tem que ESCOPAR por ele;
//   3) toda view do schema (0001 e 0006) precisa de
//      `security_invoker = true` — sem isso RLS das tabelas de baixo
//      não é avaliado para quem chama a view (crítico 1 e crítico 2
//      do relatório: v_financeiro_mensal e matricula_progresso);
//   4) toda política de select (e, quando aplicável, insert/update/
//      delete) das tabelas multi-tenant tem que citar
//      `workspace_id = public.workspace_atual()` — sem isso o dono do
//      workspace B lê e escreve o caixa do workspace A (alto 1/2);
//   5) a lista de tabelas financeiras testadas passa de 5 para as 18
//      do grupo (inclui despesas, comissoes, matriculas, metas,
//      parametros_financeiros e afiliados — este último carrega chave
//      Pix, dado pessoal do afiliado, não só do negócio);
//   6) conteudo_liberado entra na lista de tabelas novas de 0006 cujo
//      workspace_id é verificado (faltava na lista original);
//   7) toda extração de "create policy ... ;" usa regex GLOBAL (contra
//      só a primeira ocorrência): em RLS, políticas PERMISSIVAS se
//      somam com OR — uma segunda política mais abaixo, mais aberta,
//      vaza dado mesmo que a primeira esteja correta. O teste antigo
//      só olhava o primeiro "create policy" e nunca veria uma segunda
//      política permissiva extra.
//
// Este teste foi escrito e visto falhando contra uma cópia MUTANTE de
// 0007 (portal liberado para todo mentorado, sem mentorado_atual())
// antes de ser aceito — ver script de prova no relatório da auditoria.
// ============================================================
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ESCADA_JORNADA } from "@/lib/crm/jornada";

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

function lerMigracao(arquivo: string): string {
  return readFileSync(join(MIGRATIONS_DIR, arquivo), "utf8");
}

/**
 * Só os arquivos numerados "NNNN_nome.sql" — os pares "_exec_NNNN_nome.sql"
 * (cópia usada para rodar manualmente no SQL Editor) têm texto DIFERENTE
 * (comentários/idempotência aparados) e contariam tabela/política em
 * dobro se entrassem na varredura.
 */
function arquivosDeMigracao(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d{4}_.*\.sql$/.test(f))
    .sort();
}

function existeArquivoDeMigracao(nome: string): boolean {
  return arquivosDeMigracao().includes(nome);
}

/** Concatena TODAS as migrações numeradas hoje presentes no diretório. */
function todasAsMigracoes(): string {
  return arquivosDeMigracao()
    .map((f) => lerMigracao(f))
    .join("\n");
}

const m0001 = lerMigracao("0001_schema.sql");
const m0006 = lerMigracao("0006_mentoros_mentoria.sql");
const m0007 = lerMigracao("0007_mentoros_rls.sql");
const m0008 = lerMigracao("0008_mentoros_rls_correcoes.sql");
const ARQUIVO_0009 = "0009_mentoros_tabelas_faltantes.sql";
const m0009 = existeArquivoDeMigracao(ARQUIVO_0009) ? lerMigracao(ARQUIVO_0009) : "";

// ---------- utilidades de leitura de política (texto puro, sem SQL parser) ----------

/**
 * Remove o NOME da política (o primeiro trecho entre aspas duplas) de
 * um bloco "create policy ...". Isso é o coração da correção: um nome
 * como "leitura: dono, gestor e o proprio mentorado" contém a palavra
 * "mentorado" mesmo quando o `using` não escopa nada — sem remover o
 * nome antes de procurar, a asserção passa por engano.
 */
function semNomeDePolitica(bloco: string): string {
  return bloco.replace(/"(?:[^"\\]|\\.)*"/, "");
}

type PoliticaEncontrada = {
  tabela: string;
  comando: "select" | "insert" | "update" | "delete" | "all";
  texto: string; // bloco inteiro, já SEM o nome da política
};

/**
 * Extrai toda política escrita de forma explícita e literal no SQL,
 * no formato `create policy "nome" on public.<tabela> for <cmd> ...;`
 * — regex GLOBAL (pega todas as ocorrências, não só a primeira).
 */
function politicasExplicitas(sql: string): PoliticaEncontrada[] {
  const re =
    /create policy "(?:[^"\\]|\\.)*" on public\.(\w+)\s+for\s+(select|insert|update|delete|all)\b[\s\S]*?;/gi;
  const out: PoliticaEncontrada[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql))) {
    out.push({
      tabela: m[1],
      comando: m[2].toLowerCase() as PoliticaEncontrada["comando"],
      texto: semNomeDePolitica(m[0]),
    });
  }
  return out;
}

/**
 * Extrai política criada dentro de um `do $$ ... foreach t in array
 * array[...] ... execute format('create policy ... on public.%I for
 * <cmd> ...', t); ... end $$;` — o padrão usado para as tabelas de CRM
 * (grupo 2) e para a escrita em massa dos grupos 1/3 em 0008. Como a
 * tabela real vira `%I` dentro da string, ela não aparece por nome no
 * texto — por isso a lista de tabelas do array é lida separadamente e
 * "distribuída" para cada `execute format('create policy ...')`
 * daquele bloco. Também é regex GLOBAL: mais de um bloco `do $$` no
 * arquivo, todos são varridos.
 */
function politicasEmLoop(sql: string): PoliticaEncontrada[] {
  const out: PoliticaEncontrada[] = [];
  const blocoRe = /do \$\$[\s\S]*?end \$\$;/gi;
  let bm: RegExpExecArray | null;
  while ((bm = blocoRe.exec(sql))) {
    const bloco = bm[0];
    const arrMatch = bloco.match(/array\s*\[([\s\S]*?)\]/i);
    if (!arrMatch) continue;
    const tabelas = Array.from(arrMatch[1].matchAll(/'(\w+)'/g)).map((x) => x[1]);

    const fmtRe = /execute format\(\s*'((?:[^']|'')*)'\s*(?:,\s*t\s*)?\)\s*;/gi;
    let fm: RegExpExecArray | null;
    while ((fm = fmtRe.exec(bloco))) {
      // '' dentro de uma string SQL de aspa simples é a forma de
      // escapar uma aspa simples literal — desfaz o escape para que
      // buscas por "'mentorado'" etc. funcionem no texto resultante.
      const raw = fm[1].replace(/''/g, "'");
      if (!/^create policy/i.test(raw)) continue;
      const cmdMatch = raw.match(/for\s+(select|insert|update|delete|all)\b/i);
      if (!cmdMatch) continue;
      const semNome = semNomeDePolitica(raw);
      for (const tabela of tabelas) {
        out.push({
          tabela,
          comando: cmdMatch[1].toLowerCase() as PoliticaEncontrada["comando"],
          texto: semNome,
        });
      }
    }
  }
  return out;
}

/** Todas as políticas (explícitas + em loop) de um arquivo, combinadas. */
function todasPoliticas(sql: string): PoliticaEncontrada[] {
  return [...politicasExplicitas(sql), ...politicasEmLoop(sql)];
}

/** Filtra as políticas de uma tabela+comando específicos. */
function politicasDe(
  todas: PoliticaEncontrada[],
  tabela: string,
  comando: PoliticaEncontrada["comando"],
): PoliticaEncontrada[] {
  return todas.filter((p) => p.tabela === tabela && p.comando === comando);
}

function contarOcorrencias(texto: string, sub: string): number {
  return texto.split(sub).length - 1;
}

function blocoCreateTable(sql: string, tabela: string): string {
  const re = new RegExp(
    `create table[^;]*public\\.${tabela}\\s*\\([\\s\\S]*?\\);`,
    "i",
  );
  return sql.match(re)?.[0] ?? "";
}

// ---------- listas de tabelas (mesma classificação do relatório) ----------

// Tabelas novas que 0006 precisa criar (enunciado do MentorOS).
// conteudo_liberado estava faltando aqui na versão original do teste —
// é uma tabela nova de 0006 como qualquer outra, e também multi-tenant.
const TABELAS_NOVAS_0006 = [
  "programa",
  "turma",
  "mentorado",
  "matricula",
  "sessao",
  "tarefa_mentoria",
  "marco",
  "score_evolucao",
  "conteudo_liberado",
];

// Tabelas do portal do mentorado: só essas podem ter política citando
// o papel 'mentorado' com escopo por mentorado_id (ou id, no caso da
// própria ficha, ou exists via matricula, no caso de sessao).
const TABELAS_PORTAL = [
  "mentorado",
  "matricula",
  "sessao",
  "tarefa_mentoria",
  "marco",
  "score_evolucao",
  "conteudo_liberado",
];

// Grupo 1 completo (financeiro/negócio) tal como 0007 o define: 18
// tabelas, não mais as 5 originalmente testadas. Inclui afiliados
// (carrega chave_pix — dado financeiro pessoal, não só do negócio),
// despesas, comissoes, matriculas, metas e parametros_financeiros,
// citados explicitamente no relatório da auditoria.
const TABELAS_FINANCEIRAS_SENSIVEIS = [
  "afiliados",
  "matriculas",
  "comissoes",
  "reembolsos",
  "despesas",
  "orcamentos",
  "metas_financeiras",
  "metas",
  "webhook_eventos",
  "snapshots_kpi_diario",
  "contas_bancarias",
  "movimentos_caixa",
  "recebiveis",
  "pagaveis",
  "chargebacks",
  "parametros_financeiros",
  "programa",
  "turma",
];

// Grupo 2 (CRM/pipeline comercial) — 19 tabelas, criadas via loop em
// 0007/0008 (por isso dependem de politicasEmLoop, não só de regex
// simples "on public.<tabela>").
const TABELAS_CRM = [
  "alunos",
  "produtos",
  "planos",
  "lancamentos",
  "turmas",
  "tarefas_alunos",
  "calls_resumos",
  "crm_estagios",
  "notas",
  "atividades",
  "tarefas",
  "reunioes",
  "transcricoes",
  "perfis_sociais",
  "conteudos",
  "conteudo_metricas",
  "conteudo_retencao",
  "conteudo_pilares",
  "campanhas",
];

// Views do schema (0001 e 0006) que precisam rodar sob os direitos de
// quem chama, não de quem criou — senão RLS das tabelas de baixo é
// ignorado (crítico 1 e crítico 2 do relatório).
const VIEWS_DO_SCHEMA = ["v_financeiro_mensal", "matricula_progresso"];
// A lista acima e conferida contra 0001+0006+0008. `sessao_do_portal` nasce
// em 0017 e por isso tem lista propria — mas a exigencia e a mesma.
const VIEWS_DO_SCHEMA_COM_PORTAL = [...VIEWS_DO_SCHEMA, "sessao_do_portal"];

describe("0006 — todas as tabelas de mentoria nascem multi-tenant", () => {
  it.each(TABELAS_NOVAS_0006)(
    "public.%s existe em 0006 e tem coluna workspace_id",
    (tabela) => {
      const bloco = blocoCreateTable(m0006, tabela);
      expect(bloco, `create table public.${tabela} não encontrado em 0006`).not.toBe("");
      expect(bloco).toMatch(/workspace_id\s+uuid/i);
    },
  );

  it("score_evolucao é histórico semanal: unique (mentorado_id, semana)", () => {
    const bloco = blocoCreateTable(m0006, "score_evolucao");
    expect(bloco).not.toBe("");
    expect(bloco).toMatch(/unique\s*\(\s*mentorado_id\s*,\s*semana\s*\)/i);
  });

  it("existe a view matricula_progresso (sessao_atual não é coluna, é count)", () => {
    expect(m0006).toMatch(/create (or replace )?view public\.matricula_progresso/i);
  });

  it("mentorado.perfil_id tem índice único parcial (evita dupla ficha para o mesmo login)", () => {
    // Sem isso, duas linhas de mentorado com o mesmo perfil_id fariam
    // mentorado_atual() devolver silenciosamente qualquer uma das
    // duas — bug de RLS sem erro nenhum. A correção (0008) tem que
    // existir em algum lugar das migrações rastreadas.
    const combinado = m0006 + "\n" + m0007 + "\n" + m0008;
    expect(combinado).toMatch(
      /create unique index[^;]*on public\.mentorado\s*\(\s*perfil_id\s*\)\s*where\s+perfil_id is not null/i,
    );
  });
});

describe("views do schema rodam com security_invoker = true (crítico 1 e crítico 2)", () => {
  // Uma view sem security_invoker roda com os direitos de quem a
  // CRIOU (dono do schema), não de quem consulta — RLS das tabelas
  // por baixo nunca é avaliado para o chamador real. O ajuste pode
  // vir tanto no CREATE VIEW (WITH (security_invoker = true)) quanto
  // num ALTER VIEW ... SET (security_invoker = true) numa migração
  // posterior — por isso a busca varre 0001+0006+0008 combinados, não
  // um arquivo isolado.
  const combinado = m0001 + "\n" + m0006 + "\n" + m0008;

  it.each(VIEWS_DO_SCHEMA)("view public.%s tem security_invoker = true", (view) => {
    const criadaComInvoker = new RegExp(
      `create (or replace )?view public\\.${view}[\\s\\S]*?with\\s*\\(\\s*security_invoker\\s*=\\s*true\\s*\\)`,
      "i",
    ).test(combinado);
    const alteradaComInvoker = new RegExp(
      `alter view public\\.${view}\\s+set\\s*\\(\\s*security_invoker\\s*=\\s*true\\s*\\)`,
      "i",
    ).test(combinado);
    expect(
      criadaComInvoker || alteradaComInvoker,
      `esperava security_invoker = true para public.${view} (via CREATE VIEW ... WITH ou ALTER VIEW ... SET) em 0001/0006/0008`,
    ).toBe(true);
  });
});

describe("0007 — RLS por papel substitui o 'using (true)' das tabelas sensíveis", () => {
  it.each(TABELAS_FINANCEIRAS_SENSIVEIS)(
    "%s: a política antiga de leitura aberta foi derrubada em 0007",
    (tabela) => {
      const dropRe = new RegExp(
        `drop policy if exists[^;]*on public\\.${tabela}`,
        "i",
      );
      expect(
        dropRe.test(m0007),
        `esperava um "drop policy ... on public.${tabela}" em 0007`,
      ).toBe(true);
    },
  );

  it.each(TABELAS_FINANCEIRAS_SENSIVEIS)(
    "%s: TODAS as políticas de leitura em 0007 (regex global) não são using (true)",
    (tabela) => {
      const politicas = politicasDe(politicasExplicitas(m0007), tabela, "select");
      expect(
        politicas.length,
        `esperava ao menos uma política de select para public.${tabela} em 0007`,
      ).toBeGreaterThan(0);
      // GLOBAL: TODAS as políticas de select encontradas precisam
      // passar, não só a primeira — políticas permissivas se somam
      // com OR, então uma segunda política aberta abaixo da primeira
      // vazaria dado mesmo com a primeira correta.
      for (const p of politicas) {
        const usingMatch = p.texto.match(/using\s*\(([\s\S]*?)\)\s*;?\s*$/i);
        const usando = (usingMatch?.[1] ?? p.texto).trim().toLowerCase();
        expect(usando).not.toBe("true");
      }
    },
  );

  it.each(TABELAS_FINANCEIRAS_SENSIVEIS)(
    "%s: nenhuma política de leitura em 0007 dá acesso irrestrito a 'comercial', e se citar 'mentorado' tem que escopar por mentorado_atual()",
    (tabela) => {
      const politicas = politicasDe(politicasExplicitas(m0007), tabela, "select");
      expect(politicas.length).toBeGreaterThan(0);
      for (const p of politicas) {
        const texto = p.texto.toLowerCase();
        expect(texto).not.toContain("'comercial'");
        if (texto.includes("'mentorado'")) {
          expect(texto).toContain("mentorado_atual()");
        }
      }
    },
  );

  it.each(TABELAS_PORTAL)(
    "tabela do portal public.%s: TODA política de select em 0007 exige papel_atual() = 'mentorado' E mentorado_atual() no using (sem contar o NOME da política)",
    (tabela) => {
      const politicas = politicasDe(politicasExplicitas(m0007), tabela, "select");
      expect(
        politicas.length,
        `esperava ao menos uma "create policy ... on public.${tabela} for select" em 0007`,
      ).toBeGreaterThan(0);

      // GLOBAL de novo: se existir uma segunda política de select para
      // essa tabela sem o escopo certo, ela vaza dado mesmo que a
      // primeira esteja perfeita (OR entre políticas permissivas).
      for (const p of politicas) {
        expect(
          p.texto,
          `política de select em public.${tabela} não pode citar 'mentorado' só no NOME — o using precisa ter papel_atual() = 'mentorado'`,
        ).toMatch(/papel_atual\(\)\s*=\s*'mentorado'/i);
        expect(
          p.texto,
          `política de select em public.${tabela} cita o papel 'mentorado' mas não escopa por mentorado_atual() — isso libera a tabela para TODO mentorado, não só o dono da linha`,
        ).toMatch(/mentorado_atual\(\)/i);
      }
    },
  );
});

describe("0008 — workspace_id em toda política de select/insert/update/delete (alto 1 e alto 2)", () => {
  const todas0008 = todasPoliticas(m0008);
  const GRUPOS_1_2_3 = [
    ...TABELAS_FINANCEIRAS_SENSIVEIS,
    ...TABELAS_CRM,
    ...TABELAS_PORTAL,
  ];

  it.each(GRUPOS_1_2_3)(
    "%s: política de select em 0008 exige workspace_id = public.workspace_atual()",
    (tabela) => {
      const politicas = politicasDe(todas0008, tabela, "select");
      expect(
        politicas.length,
        `esperava ao menos uma política de select para public.${tabela} em 0008`,
      ).toBeGreaterThan(0);
      for (const p of politicas) {
        expect(p.texto).toContain("workspace_id = public.workspace_atual()");
      }
    },
  );

  it.each(GRUPOS_1_2_3)(
    "%s: política de insert em 0008 exige workspace_id no with check",
    (tabela) => {
      const politicas = politicasDe(todas0008, tabela, "insert");
      expect(politicas.length).toBeGreaterThan(0);
      for (const p of politicas) {
        expect(p.texto).toContain("workspace_id = public.workspace_atual()");
      }
    },
  );

  it.each(GRUPOS_1_2_3)(
    "%s: política de update em 0008 exige workspace_id no using E no with check",
    (tabela) => {
      const politicas = politicasDe(todas0008, tabela, "update");
      expect(politicas.length).toBeGreaterThan(0);
      for (const p of politicas) {
        // update sempre tem using + with check — os dois precisam
        // escopar por workspace, senão dá para "pular" o filtro
        // trocando o workspace_id no meio do UPDATE.
        expect(contarOcorrencias(p.texto, "workspace_id = public.workspace_atual()")).toBeGreaterThanOrEqual(2);
      }
    },
  );

  it.each(GRUPOS_1_2_3)(
    "%s: política de delete em 0008 exige workspace_id no using",
    (tabela) => {
      const politicas = politicasDe(todas0008, tabela, "delete");
      expect(politicas.length).toBeGreaterThan(0);
      for (const p of politicas) {
        expect(p.texto).toContain("workspace_id = public.workspace_atual()");
      }
    },
  );

  it("profiles: leitura de dono/gestor é escopada por workspace_id (0008)", () => {
    const politicas = politicasDe(politicasExplicitas(m0008), "profiles", "select");
    expect(politicas.length).toBeGreaterThan(0);
    for (const p of politicas) {
      expect(p.texto).toContain("workspace_id = public.workspace_atual()");
      // e a linha do próprio usuário continua sempre visível —
      // senão o app não descobre nem o próprio papel ao logar.
      expect(p.texto).toMatch(/id\s*=\s*auth\.uid\(\)/i);
    }
  });

  it("workspace: leitura e escrita são escopadas pelo próprio id (0008)", () => {
    // workspace não tem coluna workspace_id — a própria linha É o
    // workspace, então o equivalente correto é `id = workspace_atual()`.
    const politicas = politicasExplicitas(m0008).filter((p) => p.tabela === "workspace");
    expect(politicas.length).toBeGreaterThan(0);
    for (const p of politicas) {
      expect(p.texto).toContain("id = public.workspace_atual()");
    }
  });
});

describe("crítico 3 — usuário novo nasce 'mentorado' (menor privilégio), não 'gestor'", () => {
  it("0008 muda o default de profiles.papel para 'mentorado'", () => {
    expect(m0008).toMatch(
      /alter table public\.profiles alter column papel set default 'mentorado'/i,
    );
  });

  it("0008 redefine handle_new_user() gravando papel = 'mentorado' explicitamente", () => {
    const bloco = m0008.match(
      /create (or replace )?function public\.handle_new_user\(\)[\s\S]*?\$\$;/i,
    )?.[0];
    expect(bloco, "handle_new_user() não foi redefinida em 0008").toBeTruthy();
    expect(bloco).toMatch(/insert into public\.profiles[\s\S]*?'mentorado'/i);
  });
});

describe("crítico 4 — programa e turma abrem para o mentorado matriculado (0008)", () => {
  it.each(["programa", "turma"])(
    "%s: política de select em 0008 permite o mentorado com matrícula (exists em public.matricula), mas não 'comercial'",
    (tabela) => {
      const politicas = politicasDe(politicasExplicitas(m0008), tabela, "select");
      expect(politicas.length).toBeGreaterThan(0);
      for (const p of politicas) {
        expect(p.texto).toMatch(/papel_atual\(\)\s*=\s*'mentorado'/i);
        expect(p.texto).toMatch(/mentorado_atual\(\)/i);
        expect(p.texto.toLowerCase()).toContain("exists");
        expect(p.texto.toLowerCase()).toContain("public.matricula");
        expect(p.texto.toLowerCase()).not.toContain("'comercial'");
      }
    },
  );
});

describe("médio — matricula_progresso conta sessão de turma, não só de matrícula direta", () => {
  it("0008 recria a view cobrindo s.turma_id além de s.matricula_id", () => {
    const bloco = m0008.match(
      /create (or replace )?view public\.matricula_progresso[\s\S]*?;/i,
    )?.[0];
    expect(bloco, "matricula_progresso não foi recriada em 0008").toBeTruthy();
    expect(bloco).toMatch(/s\.matricula_id\s*=\s*mt\.id/i);
    expect(bloco).toMatch(/s\.turma_id\s*=\s*mt\.turma_id/i);
  });
});

// ============================================================
// 0009 — as oito tabelas da planilha que nunca ganharam migração
// (agrupamentos, aulas, encontros, envios, importacoes, interacoes,
// modulos, progresso_aulas). Sem elas o provider Supabase quebra em
// runtime com "relation does not exist" — erro que o build não pega,
// porque o nome da tabela é string (ver src/lib/data/supabase-db.ts).
// ============================================================

const TABELAS_0009 = [
  "agrupamentos",
  "aulas",
  "encontros",
  "envios",
  "importacoes",
  "interacoes",
  "modulos",
  "progresso_aulas",
];

// Classificação de RLS pedida na tarefa.
const TABELAS_0009_FINANCEIRO = ["importacoes"];
const TABELAS_0009_CRM = [
  "interacoes",
  "envios",
  "modulos",
  "aulas",
  "encontros",
  "agrupamentos",
];
const TABELAS_0009_FECHADO = ["progresso_aulas"];

describe("0009 — as oito tabelas faltantes nascem multi-tenant", () => {
  it.each(TABELAS_0009)("public.%s existe em 0009 e tem coluna workspace_id", (tabela) => {
    const bloco = blocoCreateTable(m0009, tabela);
    expect(bloco, `create table public.${tabela} não encontrado em 0009`).not.toBe("");
    expect(bloco).toMatch(/workspace_id\s+uuid/i);
  });
});

describe("0009 — nenhuma política nova usa using (true)", () => {
  const todas0009 = todasPoliticas(m0009);

  it("existe ao menos uma política criada em 0009 para cada uma das oito tabelas", () => {
    for (const tabela of TABELAS_0009) {
      const politicas = todas0009.filter((p) => p.tabela === tabela);
      expect(politicas.length, `nenhuma política encontrada para public.${tabela} em 0009`).toBeGreaterThan(0);
    }
  });

  it.each(TABELAS_0009)("%s: nenhuma política de 0009 (select/insert/update/delete) é using (true) puro", (tabela) => {
    const politicas = todas0009.filter((p) => p.tabela === tabela);
    for (const p of politicas) {
      const usingMatch = p.texto.match(/using\s*\(([\s\S]*?)\)\s*(?:with check|;)/i);
      if (usingMatch) {
        expect(usingMatch[1].trim().toLowerCase()).not.toBe("true");
      }
      // "using (true)" também não pode aparecer solto em nenhum lugar do bloco.
      expect(p.texto.toLowerCase().replace(/\s+/g, " ")).not.toContain("using (true)");
    }
  });
});

describe("0009 — toda política filtra por workspace_atual()", () => {
  const todas0009 = todasPoliticas(m0009);

  it.each(TABELAS_0009)("%s: TODA política criada em 0009 cita workspace_id = public.workspace_atual()", (tabela) => {
    const politicas = todas0009.filter((p) => p.tabela === tabela);
    expect(politicas.length, `esperava ao menos uma política para public.${tabela} em 0009`).toBeGreaterThan(0);
    for (const p of politicas) {
      expect(
        p.texto,
        `política "${p.comando}" de public.${tabela} não cita workspace_id = public.workspace_atual()`,
      ).toContain("workspace_id = public.workspace_atual()");
    }
  });
});

describe("0009 — classificação de RLS por grupo", () => {
  const todas0009 = todasPoliticas(m0009);

  it.each(TABELAS_0009_FINANCEIRO)(
    "%s (financeiro): política de select só permite dono/gestor, nunca comercial nem mentorado",
    (tabela) => {
      const politicas = politicasDe(todas0009, tabela, "select");
      expect(politicas.length).toBeGreaterThan(0);
      for (const p of politicas) {
        const texto = p.texto.toLowerCase();
        expect(texto).toContain("'dono'");
        expect(texto).toContain("'gestor'");
        expect(texto).not.toContain("'comercial'");
        expect(texto).not.toContain("'mentorado'");
      }
    },
  );

  it.each(TABELAS_0009_CRM)(
    "%s (crm/pipeline): política de select permite dono, gestor e comercial",
    (tabela) => {
      const politicas = politicasDe(todas0009, tabela, "select");
      expect(politicas.length).toBeGreaterThan(0);
      for (const p of politicas) {
        const texto = p.texto.toLowerCase();
        expect(texto).toContain("'dono'");
        expect(texto).toContain("'gestor'");
        expect(texto).toContain("'comercial'");
      }
    },
  );

  it.each(TABELAS_0009_FECHADO)(
    "%s (fechado): NENHUMA política de 0009 cita 'mentorado' — decisão travada até existir Portal do Mentorado",
    (tabela) => {
      const politicas = todas0009.filter((p) => p.tabela === tabela);
      expect(politicas.length).toBeGreaterThan(0);
      for (const p of politicas) {
        expect(p.texto.toLowerCase()).not.toContain("mentorado");
      }
    },
  );
});

describe("0009 — interacoes.id_externo é único (dedupe de reenvio do agente local)", () => {
  it("existe unique index ou unique constraint sobre id_externo", () => {
    const bloco = blocoCreateTable(m0009, "interacoes");
    const constraintInline = /id_externo\s+text[^,]*\bunique\b/i.test(bloco);
    const uniqueIndex = /create\s+unique\s+index[^;]*on\s+public\.interacoes\s*\(\s*id_externo\s*\)/i.test(m0009);
    expect(
      constraintInline || uniqueIndex,
      "esperava unique (inline ou índice) em interacoes.id_externo — sem isso o agente local reenviando o histórico duplica interação",
    ).toBe(true);
  });
});

describe("0009 — sem ALTER TYPE ... ADD VALUE (não pode rodar dentro de uma migração com uso na mesma transação)", () => {
  it("0009 não contém 'alter type ... add value'", () => {
    expect(m0009.toLowerCase()).not.toMatch(/alter type[\s\S]*?add value/i);
  });
});

describe("0009 — fecha o buraco de origem: nenhuma tabela consultada pelo provider Supabase fica sem schema", () => {
  function tabelasConsultadasPeloProvider(): string[] {
    const caminho = join(process.cwd(), "src", "lib", "data", "supabase-db.ts");
    const src = readFileSync(caminho, "utf8");
    const re = /\.from\(\s*"([a-z_]+)"\s*\)/g;
    const out = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) out.add(m[1]);
    return [...out].sort();
  }

  function tabelasCriadasEmTodasAsMigracoes(): Set<string> {
    const sql = todasAsMigracoes();
    const re = /create table(?:\s+if not exists)?\s+public\.(\w+)/gi;
    const out = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = re.exec(sql))) out.add(m[1]);
    return out;
  }

  it("toda tabela em .from(\"...\") de supabase-db.ts existe em alguma migração", () => {
    const consultadas = tabelasConsultadasPeloProvider();
    const criadas = tabelasCriadasEmTodasAsMigracoes();
    const faltando = consultadas.filter((t) => !criadas.has(t));
    expect(
      faltando,
      `tabelas consultadas pelo provider mas nunca criadas em migração nenhuma: ${faltando.join(", ")}`,
    ).toEqual([]);
  });
});

describe("0010 — colunas que o app usava e o schema nao tinha", () => {
  const m0010 = lerMigracao("0010_mentoros_colunas_faltantes.sql");

  it("produtos ganha braco e categoria", () => {
    // O provider ja lia r.braco e r.categoria em mapProduto; sem estas duas
    // colunas o cadastro de produto estourava em runtime com "column does not
    // exist", e nem tsc nem build pegavam, porque o nome da coluna e string.
    expect(m0010).toMatch(/alter table public\.produtos[\s\S]*?add column if not exists braco/i);
    expect(m0010).toMatch(/alter table public\.produtos[\s\S]*?add column if not exists categoria/i);
  });

  it("nao usa alter type add value, que nao roda na mesma transacao", () => {
    expect(m0010).not.toMatch(/alter type[\s\S]*?add value/i);
  });

  it("o enum de categoria e criado de forma idempotente", () => {
    expect(m0010).toMatch(/create type categoria_produto as enum/i);
    expect(m0010).toMatch(/exception when duplicate_object then null/i);
  });
});

// ============================================================
// 0014 — a escada de estágios Prospect → Alumni.
//
// Duas garantias específicas desta migração, e o motivo de cada uma:
//
//   1) NUNCA APAGAR. `alunos.estagio_id` referencia `crm_estagios`; uma
//      escada refeita por remoção e reinserção ou por limpeza da tabela
//      inteira ou quebraria a chave estrangeira, ou (pior) mataria em
//      silêncio o estágio de todo aluno já classificado. Os seis
//      estágios semeados em 0002 têm que ser REMAPEADOS por update, com
//      o mesmo id de sempre — por isso o teste procura, por texto, a
//      ausência das duas formas de apagar.
//   2) RODAR DUAS VEZES NÃO PODE DUPLICAR. A migração é colada à mão no
//      SQL Editor do Supabase (é para isso que existe o par `_exec_`), e
//      colar duas vezes é acidente comum. Cada `insert` precisa dizer o
//      que fazer quando a linha já existe; sem isso o dono acorda com
//      dois "Prospect" no kanban e nenhum erro na tela.
//
// As demais asserções repetem, para 0014, o que 0009 já provava para si:
// política nenhuma nasce aberta (`using (true)`), toda política filtra
// por `workspace_atual()`, e nada de `alter type ... add value` (que não
// pode ser usado na mesma transação que o cria — a armadilha registrada
// no cabeçalho de 0009).
//
// SEGUNDA RODADA (revisão por mutação). Uma revisão aplicou nove mutantes
// contra este bloco e SEIS sobreviveram à suíte inteira. Cada asserção
// abaixo nasceu de um mutante vivo, e é por isso que elas são mais
// literais do que parece necessário:
//
//   * apagar o `insert` de Alumni inteiro passava, porque a busca pelas
//     sete chaves rodava sobre o arquivo CRU e casava com a palavra
//     'alumni' escrita na PROSA do cabeçalho. Daí `semComentarios()`:
//     toda busca de garantia roda sobre o que o Postgres executa.
//   * apagar o `set not null` passava, porque ninguém o conferia — e sem
//     ele o índice único não protege nada (no Postgres dois NULL são
//     distintos, então dois estágios sem chave convivem).
//   * um `delete from crm_estagios` (sem o `public.`) passava reto pela
//     guarda do "nunca apagar", que estava presa ao prefixo do schema.
//   * trocar um caractere no nome procurado ('Aluno ativo' → 'Aluno
//     Ativo') passava, e é o defeito mais caro: o remap não encontra a
//     linha, ela cai no fallback de chave derivada e o degrau some da
//     escada sem erro nenhum.
//   * tirar o laço anticolisão passava, e em banco real derruba a
//     migração no índice único.
//   * esvaziar o par `_exec_` passava: nenhum teste lia o arquivo que é
//     de fato colado no SQL Editor, ou seja, o que roda em produção.
// ============================================================

const ARQUIVO_0014 = "0014_jornada_estagios.sql";
const ARQUIVO_EXEC_0014 = "_exec_0014_jornada_estagios.sql";
const m0014 = existeArquivoDeMigracao(ARQUIVO_0014) ? lerMigracao(ARQUIVO_0014) : "";

/**
 * Devolve o SQL sem comentário nenhum — só o que o Postgres executa.
 *
 * POR QUE: procurar garantia no arquivo cru confunde promessa com
 * entrega. O cabeçalho de 0014 explica, em português, o que os `insert`
 * fazem — e cita 'prospect' e 'alumni' entre aspas simples. Uma revisão
 * apagou o `insert` de Alumni e a asserção "a chave 'alumni' aparece em
 * 0014" continuou verde, casando com o comentário que descrevia o insert
 * que não existia mais. String entre aspas simples é preservada: `--`
 * dentro dela é dado, não comentário.
 */
function semComentarios(sql: string): string {
  let saida = "";
  let i = 0;
  let dentroDeAspas = false;
  while (i < sql.length) {
    const atual = sql[i];
    const seguinte = sql[i + 1];
    if (dentroDeAspas) {
      saida += atual;
      if (atual === "'") dentroDeAspas = false;
      i += 1;
      continue;
    }
    if (atual === "'") {
      dentroDeAspas = true;
      saida += atual;
      i += 1;
      continue;
    }
    if (atual === "-" && seguinte === "-") {
      while (i < sql.length && sql[i] !== "\n") i += 1;
      continue;
    }
    if (atual === "/" && seguinte === "*") {
      i += 2;
      while (i < sql.length && !(sql[i] === "*" && sql[i + 1] === "/")) i += 1;
      i += 2;
      saida += " ";
      continue;
    }
    saida += atual;
    i += 1;
  }
  return saida;
}

/** Só o SQL que roda: é sobre ele que toda garantia de 0014 é medida. */
const exec0014 = semComentarios(m0014);

/** Comandos completos de um tipo, já sem comentário, para inspeção isolada. */
function comandosSobreEstagios(verbo: "insert into" | "update"): string[] {
  const re = new RegExp(`${verbo}\\s+public\\.crm_estagios[\\s\\S]*?;`, "gi");
  return exec0014.match(re) ?? [];
}

// A escada canônica, na ordem, LIDA do módulo puro da jornada — não
// copiada para cá.
//
// POR QUE IMPORTAR EM VEZ DE REPETIR A LISTA: enquanto esta era uma
// segunda cópia literal, renomear um degrau em `src/lib/crm/jornada.ts` e
// "consertar" o teste do módulo junto (que é exatamente o que se faz ao
// renomear uma chave) deixava a suíte inteira verde com o banco ainda
// gravando a chave antiga. A partir daí toda linha real de `crm_estagios`
// entrava no fail-closed de `jornadaDe` e saía `prospect` — cliente em
// risco virando lead novo, em silêncio. Importando, o TypeScript não
// consegue mais divergir do SQL sem os dois `it.each` abaixo ficarem
// vermelhos.
const ESCADA_0014: readonly string[] = ESCADA_JORNADA;

/**
 * Os seis nomes semeados em 0002 e a chave que cada um recebe. O remap
 * casa por texto exato; um caractere trocado aqui (ou lá) é o defeito que
 * some sem erro, então a lista existe para travar os dois lados.
 */
const REMAP_POR_NOME_0002: ReadonlyArray<readonly [string, string]> = [
  ["Lead", "lead_qualificado"],
  ["Em conversa", "proposta"],
  ["Aluno novo", "cliente_novo"],
  ["Aluno ativo", "cliente_ativo"],
  ["Em risco", "em_risco"],
  ["Inativo", "inativo"],
];

/**
 * A pegada de cada linha semeada em 0002: (ordem, cor, funil) → chave.
 * POR QUE existe: `nome` é a única coluna que o dono edita na tela, e o
 * cabeçalho de 0014 diz isso com todas as letras. Um remap que só casa
 * por nome falha em silêncio no workspace que renomeou "Aluno ativo"
 * para "Ativo" — a linha cai no fallback de chave derivada e a escada
 * perde justamente o degrau onde mora todo cliente pagante. Estes são os
 * valores literais de `0002_expansao.sql` (insert de crm_estagios).
 */
const PEGADA_0002: ReadonlyArray<readonly [number, string, string, string]> = [
  [1, "cinza", "potencial", "lead_qualificado"],
  [2, "azul", "potencial", "proposta"],
  [3, "violeta", "novo", "cliente_novo"],
  [4, "verde", "recorrente", "cliente_ativo"],
  [5, "ouro", "recorrente", "em_risco"],
  [6, "vermelho", "inativo", "inativo"],
];

describe("0014 — escada de estágios Prospect → Alumni", () => {
  it("a migração 0014 existe no diretório", () => {
    expect(
      existeArquivoDeMigracao(ARQUIVO_0014),
      `esperava supabase/migrations/${ARQUIVO_0014}`,
    ).toBe(true);
  });

  it("não apaga estágio nenhum: sem remoção de linha e sem limpeza da tabela", () => {
    // Sem exigir o prefixo `public.`: `delete from crm_estagios` é SQL
    // igualmente válido (resolve pelo search_path) e apaga do mesmo jeito.
    // A guarda antiga, presa ao schema, deixava passar essa forma.
    const sql = exec0014.toLowerCase();
    expect(sql).not.toMatch(/delete\s+from\s+(public\.)?crm_estagios/);
    expect(sql).not.toMatch(/truncate/);
  });

  it("a coluna chave é obrigatória: alter column chave set not null", () => {
    // Sem `not null` o índice único não protege: no Postgres dois NULL são
    // distintos, então dois estágios sem chave convivem no mesmo workspace.
    expect(exec0014).toMatch(
      /alter\s+table\s+public\.crm_estagios\s+alter\s+column\s+chave\s+set\s+not\s+null/i,
    );
  });

  it("chave é única por workspace: unique (workspace_id, chave)", () => {
    const indiceUnico =
      /create\s+unique\s+index[^;]*on\s+public\.crm_estagios\s*\(\s*workspace_id\s*,\s*chave\s*\)/i.test(
        m0014,
      );
    const constraintUnica = /unique\s*\(\s*workspace_id\s*,\s*chave\s*\)/i.test(m0014);
    expect(
      indiceUnico || constraintUnica,
      "esperava unique (índice ou constraint) sobre (workspace_id, chave) em crm_estagios",
    ).toBe(true);
  });

  it.each(ESCADA_0014)(
    "a chave '%s' da escada aparece em SQL executável de 0014, não em comentário",
    (chave) => {
      expect(exec0014).toContain(`'${chave}'`);
    },
  );

  it.each(ESCADA_0014)(
    "o degrau '%s' é garantido por insert, sem depender do nome que o dono deu",
    (chave) => {
      // A escada completa não pode depender de o dono NÃO ter renomeado
      // nada: quem já mexeu no kanban antes da migração não casa no remap
      // por nome. Todo degrau entra por insert (que o índice único
      // descarta quando a linha já existe), então a escada fecha os sete
      // degraus em qualquer workspace que já tenha estágio.
      const inserts = comandosSobreEstagios("insert into");
      expect(
        inserts.some((ins) => ins.includes(`'${chave}'`)),
        `esperava um insert em public.crm_estagios que garanta o degrau '${chave}'`,
      ).toBe(true);
    },
  );

  it.each(REMAP_POR_NOME_0002)(
    "o estágio '%s' de 0002 é remapeado por update para a chave '%s'",
    (nome, chave) => {
      const updates = comandosSobreEstagios("update");
      expect(
        updates.some((upd) => upd.includes(`'${nome}'`) && upd.includes(`'${chave}'`)),
        `esperava um update casando o nome '${nome}' de 0002 com a chave '${chave}'`,
      ).toBe(true);
    },
  );

  it.each(PEGADA_0002)(
    "estágio renomeado pelo dono ainda é reconhecido: (ordem %s, cor '%s', funil '%s') vira '%s'",
    (ordem, cor, funil, chave) => {
      const pegada = new RegExp(
        `\\(\\s*${ordem}\\s*,\\s*'${cor}'\\s*,\\s*'${funil}'\\s*,\\s*'${chave}'`,
        "i",
      );
      expect(
        pegada.test(exec0014),
        `esperava o par (ordem ${ordem}, '${cor}', '${funil}') → '${chave}' no remap de 0014: ` +
          "sem ele, quem renomeou o estágio na tela perde o degrau da escada em silêncio",
      ).toBe(true);
    },
  );

  it("a chave derivada de nome livre confere colisão no mesmo workspace antes de gravar", () => {
    // Dois estágios criados à mão com o mesmo nome derivam a mesma chave;
    // sem o laço que soma sufixo até achar chave livre, o índice único do
    // passo seguinte DERRUBA a migração em produção. A suíte é textual e
    // não vê falha de execução, então confere o laço por texto.
    const blocos = exec0014.match(/do \$\$[\s\S]*?\$\$;/gi) ?? [];
    const temLacoAnticolisao = blocos.some(
      (b) => /while\s+exists/i.test(b) && /workspace_id/i.test(b) && /chave\s*=/i.test(b),
    );
    expect(
      temLacoAnticolisao,
      "esperava, no bloco de chave derivada, um laço que procure a chave candidata " +
        "no mesmo workspace antes de gravá-la",
    ).toBe(true);
  });

  it("nenhuma política criada em 0014 usa using (true)", () => {
    for (const p of todasPoliticas(m0014)) {
      expect(p.texto.toLowerCase().replace(/\s+/g, " ")).not.toContain("using (true)");
    }
  });

  it("toda política criada em 0014 cita workspace_atual()", () => {
    for (const p of todasPoliticas(m0014)) {
      expect(
        p.texto,
        `política "${p.comando}" de public.${p.tabela} em 0014 não cita workspace_atual()`,
      ).toContain("workspace_id = public.workspace_atual()");
    }
  });

  it("0014 não cria política nenhuma sobre crm_estagios: a coluna nova não abre porta", () => {
    // As políticas de crm_estagios (grupo CRM) já existem em 0008 e valem
    // para a linha inteira — coluna nova não muda quem lê nem quem escreve.
    // Uma política nova aqui só poderia AFROUXAR o que já está certo.
    const sobreEstagios = todasPoliticas(m0014).filter((p) => p.tabela === "crm_estagios");
    expect(sobreEstagios.map((p) => p.comando)).toEqual([]);
  });

  it("não usa alter type ... add value, que não roda na mesma transação", () => {
    expect(m0014).not.toMatch(/alter type[\s\S]*?add value/i);
  });

  it("rodar duas vezes não duplica estágio: todo insert é idempotente", () => {
    const inserts = m0014.match(/insert\s+into\s+public\.\w+[\s\S]*?;/gi) ?? [];
    expect(inserts.length, "esperava ao menos um insert em 0014 (prospect e alumni)").toBeGreaterThan(0);
    for (const ins of inserts) {
      const idempotente =
        /on conflict[\s\S]*?do nothing/i.test(ins) || /if not exists/i.test(ins);
      expect(
        idempotente,
        `insert sem proteção contra segunda execução:\n${ins}`,
      ).toBe(true);
    }
  });

  it("o par _exec_0014 executa exatamente os mesmos comandos de 0014", () => {
    // O `_exec_` é o arquivo que alguém cola no SQL Editor do Supabase —
    // ou seja, é ELE que roda em produção. Nada o lia: a suíte seguia
    // verde com o par vazio ou divergente, provando garantias sobre um
    // arquivo que o banco nunca vê. A comparação ignora comentários (o
    // par nasce sem os de topo, por desenho) e espaço em branco.
    expect(
      readdirSync(MIGRATIONS_DIR).includes(ARQUIVO_EXEC_0014),
      `esperava supabase/migrations/${ARQUIVO_EXEC_0014}`,
    ).toBe(true);
    const semRuido = (sql: string) => semComentarios(sql).replace(/\s+/g, " ").trim();
    expect(semRuido(lerMigracao(ARQUIVO_EXEC_0014))).toBe(semRuido(m0014));
  });
});

// ============================================================
// 0015 — a tabela `documento` (contrato, anamnese, material).
//
// Esta é a primeira tabela do banco cuja leitura pelo mentorado depende
// de DUAS condições ao mesmo tempo, e é daí que vem quase toda asserção
// abaixo: ser dono da linha (`mentorado_id = mentorado_atual()`) NÃO
// basta — o documento também precisa ter sido liberado para o portal
// (`visivel_portal = true`). Contrato assinado, anamnese e rascunho de
// proposta vivem na mesma tabela do material de aula; uma política que
// só confira o dono entrega o contrato do próprio mentorado a ele no
// dia em que o mentor ainda estava editando.
//
// Por que cada asserção existe:
//
//   * "no MESMO bloco" — a armadilha já documentada no cabeçalho deste
//     arquivo (o nome da política é removido ANTES da busca) vale aqui
//     em dobro: uma política chamada "leitura ... so o visivel no
//     portal" contém a palavra `visivel_portal` no NOME mesmo quando o
//     `using` esqueceu dela. Os três pedaços têm que estar no filtro.
//   * default de `visivel_portal` — se o padrão fosse `true`, todo
//     documento anexado nasceria publicado no portal e a decisão de
//     liberar viraria a decisão de ESCONDER, que é o inverso do
//     combinado. O padrão é NÃO visível; publicar é ato explícito.
//   * sem update/delete para o mentorado — ele lê, e só. Uma política
//     de escrita aqui deixaria o mentorado marcar o próprio contrato
//     como visível, ou (pior) apagá-lo.
//   * sem política de delete NENHUMA, nem na tabela nem no bucket —
//     regra da casa: status muda, linha fica. Arquivar é `update` de
//     `arquivado`; o arquivo no Storage nunca é removido.
//   * o bucket `documentos` — a linha da tabela é metadado; o arquivo
//     em si mora no Storage, e RLS de tabela não protege objeto de
//     bucket. Sem política equivalente em `storage.objects`, quem tem
//     a anon key baixa o PDF do contrato direto pela URL do Storage
//     sem nunca tocar em `public.documento`.
//
// Segunda rodada de revisão — o que mudou e por quê:
//
//   * TODA extração deste bloco (tabela, políticas e Storage) passou a
//     ler `exec0015`, o SQL SEM COMENTÁRIO, e não o arquivo cru. Ler o
//     cru confunde promessa com entrega nas duas direções: uma política
//     COMENTADA continuava contando como existente, e uma frase de
//     cabeçalho que cite `create policy ... using (true)` para explicar
//     o que NÃO se faz virava uma política de verdade aos olhos da
//     suíte. A lição é a de 0014: a garantia se mede no que o Postgres
//     executa.
//   * as asserções do portal deixaram de medir PRESENÇA de palavra e
//     passaram a medir SENTIDO: `mentorado_id = mentorado_atual()` (a
//     igualdade, não a existência de um mentorado logado) e
//     `visivel_portal` AFIRMADO (não `not visivel_portal`, que inverte
//     a regra e mostra justamente o que não foi liberado).
//   * a QUANTIDADE de políticas de select virou asserção. Políticas
//     permissivas se somam com OR: uma segunda política de leitura,
//     mais aberta, vaza tudo mesmo com a primeira correta — e ela
//     escapava de todo laço que só inspecionava quem citasse
//     'mentorado'. Pelo mesmo motivo cada ramo de OR precisa pagar o
//     seu `papel_atual()`.
//   * a leitura passou a ser cobrada por papel (nada de 'comercial',
//     'afiliado' ou 'aluno') — antes só a escrita era, e é a leitura
//     que vaza contrato e anamnese.
//   * o Storage ganhou as asserções gêmeas das da tabela: pasta do
//     workspace conferida ANTES de separar papéis, `not d.arquivado` e
//     o escopo do `exists` pelo workspace atual. `todasPoliticas()` só
//     enxerga `on public.<tabela>`, então tudo que é do bucket precisa
//     passar por `politicasDeStorage()`, ou não é medido por ninguém.
//   * `caminho_storage` ganhou teste de índice ÚNICO e de check de
//     prefixo: os dois invariantes estavam escritos em prosa na
//     migração e garantidos por zero asserções, e os dois terminam em
//     leitura cruzada entre inquilinos.
// ============================================================

const ARQUIVO_0015 = "0015_documento.sql";
const ARQUIVO_EXEC_0015 = "_exec_0015_documento.sql";
const m0015 = existeArquivoDeMigracao(ARQUIVO_0015) ? lerMigracao(ARQUIVO_0015) : "";

/**
 * Só o SQL que roda: é sobre ele que toda garantia de 0015 é medida —
 * política, coluna, índice e bucket. `m0015` (o arquivo cru) sobrou para
 * uma coisa só: comparar com o par `_exec_`.
 */
const exec0015 = semComentarios(m0015);

// A tabela nova de 0015, na mesma forma das listas TABELAS_NOVAS_* dos
// blocos anteriores (0006/0009) — é assim que a garantia de "toda tabela
// nova nasce multi-tenant" continua valendo para as próximas migrações.
const TABELAS_NOVAS_0015 = ["documento"];

// Os quatro valores do enum `categoria_documento`. Ficam travados aqui
// porque a categoria é o que decide a pasta no Storage e o que a tela
// filtra; um valor renomeado em silêncio deixa documento antigo órfão
// de categoria.
const CATEGORIAS_DOCUMENTO = ["contrato", "anamnese", "material", "outro"];

const BUCKET_DOCUMENTOS = "documentos";

// A condição que amarra o objeto do bucket ao workspace de quem lê ou
// escreve: `storage.objects` não tem coluna `workspace_id`, então o
// escopo multi-tenant do Storage mora na PRIMEIRA PASTA do caminho.
const PASTA_DO_WORKSPACE =
  /\(\s*storage\.foldername\(\s*name\s*\)\s*\)\s*\[\s*1\s*\]\s*=\s*public\.workspace_atual\(\)::text/i;

// A IGUALDADE, não a existência: `mentorado_atual() is not null` cita a
// mesma função e diz outra coisa — "existe mentorado logado" no lugar de
// "esta linha é dele". Aceita o prefixo `d.` porque a política do Storage
// escreve a mesma comparação dentro do `exists` sobre public.documento.
const DONO_DA_LINHA = /\b(?:d\.)?mentorado_id\s*=\s*public\.mentorado_atual\(\)/i;

// Papéis que não podem aparecer em política de leitura de documento:
// contrato e anamnese são dado do jurídico e do pós-venda, e quem vende,
// indica ou estuda não tem nada a ver com eles.
const PAPEIS_FORA_DO_DOCUMENTO = ["'comercial'", "'afiliado'", "'aluno'"];

function contarRegex(texto: string, re: RegExp): number {
  return (texto.match(re) ?? []).length;
}

/**
 * Políticas escritas sobre `storage.objects`.
 *
 * POR QUE UM EXTRATOR SEPARADO: `politicasExplicitas` casa só
 * `on public.<tabela>` — o bucket vive em outro schema, então as
 * políticas do Storage passariam invisíveis por toda a varredura deste
 * arquivo. Invisível para o teste é exatamente onde o vazamento mora.
 */
function politicasDeStorage(sql: string): PoliticaEncontrada[] {
  const re =
    /create policy "(?:[^"\\]|\\.)*" on storage\.objects\s+for\s+(select|insert|update|delete|all)\b[\s\S]*?;/gi;
  const out: PoliticaEncontrada[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql))) {
    out.push({
      tabela: "storage.objects",
      comando: m[1].toLowerCase() as PoliticaEncontrada["comando"],
      texto: semNomeDePolitica(m[0]),
    });
  }
  return out;
}

describe("0015 — tabela documento: metadado no Postgres, arquivo no Storage", () => {
  it("a migração 0015 existe no diretório", () => {
    expect(
      existeArquivoDeMigracao(ARQUIVO_0015),
      `esperava supabase/migrations/${ARQUIVO_0015}`,
    ).toBe(true);
  });

  it("política só conta se o Postgres a executa: comentário não vira política", () => {
    // Este é o contrato de que todo o resto do bloco depende. O extrator
    // é texto puro e não sabe distinguir comando de prosa — quem sabe é
    // `semComentarios()`. Se alguém voltar a medir 0015 pelo arquivo cru,
    // uma política comentada continua "existindo" para a suíte e uma
    // frase de cabeçalho vira política de verdade.
    const prosa =
      '-- create policy "leitura do workspace" on public.documento for select to authenticated using (true);\n';
    expect(
      politicasExplicitas(prosa).length,
      "o extrator, sozinho, não distingue comentário de comando — é por isso que se mede o executável",
    ).toBe(1);
    expect(politicasExplicitas(semComentarios(prosa)).length).toBe(0);
  });

  it.each(TABELAS_NOVAS_0015)(
    "public.%s existe em 0015 e tem coluna workspace_id",
    (tabela) => {
      const bloco = blocoCreateTable(exec0015, tabela);
      expect(bloco, `create table public.${tabela} não encontrado em 0015`).not.toBe("");
      expect(bloco).toMatch(/workspace_id\s+uuid/i);
    },
  );

  it("workspace_id nasce com o default do workspace padrão (o formulário nunca manda esse campo)", () => {
    const bloco = blocoCreateTable(exec0015, "documento");
    expect(bloco).toMatch(
      /workspace_id[\s\S]*?default\s+'00000000-0000-0000-0000-000000000001'/i,
    );
  });

  it("a ficha guarda as colunas combinadas, e mentorado_id/aluno_id aceitam nulo (documento pode ser do negócio)", () => {
    const bloco = blocoCreateTable(exec0015, "documento");
    for (const coluna of [
      "mentorado_id",
      "aluno_id",
      "titulo",
      "caminho_storage",
      "mime",
      "bytes",
      "categoria",
      "visivel_portal",
      "enviado_por",
      "criado_em",
      "arquivado",
    ]) {
      expect(bloco, `coluna ${coluna} não encontrada em public.documento`).toMatch(
        new RegExp(`\\b${coluna}\\b`, "i"),
      );
    }
    // Um `not null` em mentorado_id obrigaria a inventar um dono para o
    // contrato do próprio negócio — documento sem mentorado é caso
    // normal, não erro.
    expect(bloco).not.toMatch(/mentorado_id[^,]*not null/i);
    expect(bloco).not.toMatch(/aluno_id[^,]*not null/i);
  });

  it("visivel_portal é boolean not null com default FALSE — publicar é ato explícito", () => {
    const bloco = blocoCreateTable(exec0015, "documento");
    expect(bloco).toMatch(/visivel_portal\s+boolean\s+not null\s+default\s+false/i);
    expect(
      /visivel_portal\s+boolean[^,]*default\s+true/i.test(bloco),
      "visivel_portal com default true publicaria no portal todo documento anexado, " +
        "inclusive contrato em rascunho — o padrão tem que ser NÃO visível",
    ).toBe(false);
  });

  it("arquivado é boolean not null com default FALSE (a coluna que substitui o delete)", () => {
    const bloco = blocoCreateTable(exec0015, "documento");
    expect(bloco).toMatch(/arquivado\s+boolean\s+not null\s+default\s+false/i);
  });

  it.each(CATEGORIAS_DOCUMENTO)(
    "o enum categoria_documento tem o valor '%s' em SQL executável",
    (categoria) => {
      expect(exec0015).toMatch(/create type categoria_documento as enum/i);
      expect(exec0015).toContain(`'${categoria}'`);
    },
  );

  it("o enum é criado de forma idempotente (sem alter type ... add value)", () => {
    expect(exec0015).toMatch(/exception when duplicate_object then null/i);
    // A armadilha registrada no cabeçalho de 0009: ALTER TYPE ... ADD
    // VALUE não pode ser usado na mesma transação que o cria.
    //
    // Medido sobre o SQL SEM COMENTÁRIO pelo mesmo motivo já aprendido em
    // 0014: o cabeçalho de 0015 CITA `alter type ... add value` para
    // explicar por que não o usa, e uma busca no arquivo cru confundiria
    // essa explicação com o comando. O que interessa é o que o Postgres
    // executa.
    expect(exec0015).not.toMatch(/alter type[\s\S]*?add value/i);
  });

  it("RLS é ligada na tabela", () => {
    expect(exec0015).toMatch(
      /alter table public\.documento enable row level security/i,
    );
  });

  it("nenhuma política criada em 0015 usa using (true)", () => {
    for (const p of [...todasPoliticas(exec0015), ...politicasDeStorage(exec0015)]) {
      expect(p.texto.toLowerCase().replace(/\s+/g, " ")).not.toContain("using (true)");
    }
  });

  it("toda política de public.documento cita workspace_id = public.workspace_atual()", () => {
    const politicas = todasPoliticas(exec0015).filter((p) => p.tabela === "documento");
    expect(politicas.length, "esperava políticas para public.documento em 0015").toBeGreaterThan(0);
    for (const p of politicas) {
      expect(
        p.texto,
        `política "${p.comando}" de public.documento não cita workspace_id = public.workspace_atual()`,
      ).toContain("workspace_id = public.workspace_atual()");
    }
  });

  it("a leitura do mentorado exige, NO MESMO BLOCO, papel_atual() = 'mentorado', mentorado_atual() E visivel_portal", () => {
    const politicas = politicasDe(todasPoliticas(exec0015), "documento", "select");
    expect(
      politicas.length,
      "esperava ao menos uma política de select para public.documento em 0015",
    ).toBeGreaterThan(0);

    let comRegraDoPortal = 0;
    for (const p of politicas) {
      if (!/'mentorado'/i.test(p.texto)) continue;
      comRegraDoPortal += 1;
      expect(
        p.texto,
        "a política cita o papel 'mentorado' mas não escopa por mentorado_atual() — isso libera a tabela para TODO mentorado",
      ).toMatch(/papel_atual\(\)\s*=\s*'mentorado'/i);
      expect(p.texto).toMatch(/mentorado_atual\(\)/i);
      expect(
        p.texto,
        "ser dono da linha não basta: sem visivel_portal no filtro, o mentorado lê o contrato que o mentor ainda não liberou",
      ).toMatch(/visivel_portal/i);
    }
    expect(
      comRegraDoPortal,
      "nenhuma política de select de public.documento trata o papel 'mentorado' — o portal nunca leria documento nenhum",
    ).toBeGreaterThan(0);
  });

  it("documento arquivado sai do portal pela RLS, não por um if na tela", () => {
    // Regra da casa: a garantia é o banco. Arquivar é a forma de retirar
    // um documento de circulação (nada é apagado); se a RLS não olhasse
    // `arquivado`, o mentorado continuaria baixando pelo PostgREST o
    // contrato que a tela deixou de mostrar.
    const politicas = politicasDe(todasPoliticas(exec0015), "documento", "select");
    for (const p of politicas) {
      if (!/'mentorado'/i.test(p.texto)) continue;
      expect(p.texto).toMatch(/not\s+arquivado|arquivado\s+is\s+false|arquivado\s*=\s*false/i);
    }
  });

  it("não existe política de insert/update/delete de public.documento citando 'mentorado' — ele lê, e só", () => {
    const escrita = todasPoliticas(exec0015).filter(
      (p) =>
        p.tabela === "documento" &&
        (p.comando === "insert" || p.comando === "update" || p.comando === "delete" || p.comando === "all"),
    );
    for (const p of escrita) {
      expect(
        p.texto.toLowerCase(),
        `política "${p.comando}" de public.documento não pode dar escrita ao mentorado`,
      ).not.toContain("mentorado");
    }
  });

  it("a escrita de public.documento é de dono e gestor, nunca de comercial", () => {
    const escrita = todasPoliticas(exec0015).filter(
      (p) => p.tabela === "documento" && (p.comando === "insert" || p.comando === "update"),
    );
    expect(
      escrita.length,
      "esperava políticas de insert e update para public.documento em 0015",
    ).toBeGreaterThan(0);
    for (const p of escrita) {
      const texto = p.texto.toLowerCase();
      expect(texto).toContain("'dono'");
      expect(texto).toContain("'gestor'");
      expect(texto).not.toContain("'comercial'");
    }
  });

  it("nenhuma política de delete é criada: status muda, linha fica", () => {
    const deletes = [...todasPoliticas(exec0015), ...politicasDeStorage(exec0015)].filter(
      (p) => p.comando === "delete" || p.comando === "all",
    );
    expect(
      deletes.map((p) => `${p.tabela}:${p.comando}`),
      "arquivar é update de `arquivado` — uma política de delete abriria a porta que a regra da casa fecha",
    ).toEqual([]);
  });

  it("cria o bucket privado 'documentos' no Storage", () => {
    expect(exec0015).toMatch(/insert\s+into\s+storage\.buckets/i);
    expect(exec0015).toContain(`'${BUCKET_DOCUMENTOS}'`);
    const insercao = exec0015.match(/insert\s+into\s+storage\.buckets[\s\S]*?;/i)?.[0] ?? "";
    expect(
      /\bfalse\b/i.test(insercao),
      "o bucket precisa nascer privado (public = false): num bucket público a URL do arquivo dispensa login",
    ).toBe(true);
    expect(/\btrue\b/i.test(insercao)).toBe(false);
  });

  it("rodar duas vezes não duplica nada: todo insert de 0015 é idempotente", () => {
    const inserts = exec0015.match(/insert\s+into\s+[\w.]+[\s\S]*?;/gi) ?? [];
    expect(inserts.length, "esperava ao menos um insert em 0015 (o bucket)").toBeGreaterThan(0);
    for (const ins of inserts) {
      const idempotente =
        /on conflict[\s\S]*?do nothing/i.test(ins) || /if not exists/i.test(ins);
      expect(idempotente, `insert sem proteção contra segunda execução:\n${ins}`).toBe(true);
    }
  });

  it("toda política do Storage é escopada ao bucket 'documentos'", () => {
    const politicas = politicasDeStorage(exec0015);
    expect(
      politicas.length,
      "esperava políticas em storage.objects — sem elas o arquivo do contrato é baixável direto pelo Storage",
    ).toBeGreaterThan(0);
    for (const p of politicas) {
      expect(
        p.texto,
        `política "${p.comando}" de storage.objects não limita bucket_id — vale para TODOS os buckets do projeto`,
      ).toMatch(/bucket_id\s*=\s*'documentos'/i);
    }
  });

  it("a leitura do arquivo pelo mentorado repete a regra da tabela: própria ficha E visivel_portal", () => {
    const leituras = politicasDeStorage(exec0015).filter((p) => p.comando === "select");
    expect(leituras.length).toBeGreaterThan(0);
    let comRegraDoPortal = 0;
    for (const p of leituras) {
      if (!/'mentorado'/i.test(p.texto)) continue;
      comRegraDoPortal += 1;
      expect(p.texto).toMatch(/mentorado_atual\(\)/i);
      expect(
        p.texto,
        "sem visivel_portal aqui, a RLS da tabela protege o metadado e o Storage entrega o arquivo assim mesmo",
      ).toMatch(/visivel_portal/i);
    }
    expect(
      comRegraDoPortal,
      "nenhuma política de select do Storage trata o papel 'mentorado' — o portal nunca abriria um documento",
    ).toBeGreaterThan(0);
  });

  it("a escrita no bucket é de dono e gestor, escopada pelo workspace da pasta", () => {
    const escrita = politicasDeStorage(exec0015).filter(
      (p) => p.comando === "insert" || p.comando === "update",
    );
    expect(escrita.length, "esperava políticas de insert e update em storage.objects").toBeGreaterThan(0);
    for (const p of escrita) {
      const texto = p.texto.toLowerCase();
      expect(texto).toContain("'dono'");
      expect(texto).toContain("'gestor'");
      expect(texto).not.toContain("'comercial'");
      expect(
        p.texto,
        "sem o workspace na primeira pasta do caminho, o gestor do workspace A escreve na pasta do workspace B",
      ).toMatch(/workspace_atual\(\)/i);
    }
  });

  it("o portal compara mentorado_id com mentorado_atual(): ser mentorado não basta, tem que ser O dono da linha", () => {
    // A asserção anterior só exigia que a string `mentorado_atual()`
    // aparecesse no bloco. Trocar `mentorado_id = public.mentorado_atual()`
    // por `public.mentorado_atual() is not null` mantinha a string, mantinha
    // a suíte verde e, em banco real, entregava a QUALQUER mentorado
    // autenticado todo documento publicado do workspace — contrato,
    // anamnese e proposta dos outros — por um GET no PostgREST. É o mesmo
    // erro que o cabeçalho deste arquivo conta ter fechado em 0007: medir a
    // presença da função em vez da comparação que ela serve.
    const daTabela = politicasDe(todasPoliticas(exec0015), "documento", "select");
    const doStorage = politicasDeStorage(exec0015).filter((p) => p.comando === "select");
    const comMentorado = [...daTabela, ...doStorage].filter((p) => /'mentorado'/i.test(p.texto));
    expect(
      comMentorado.length,
      "esperava a regra do portal na tabela E no Storage — são dois caminhos de acesso",
    ).toBe(2);
    for (const p of comMentorado) {
      expect(
        p.texto,
        `política "${p.comando}" de ${p.tabela} cita mentorado_atual() sem comparar com mentorado_id: ` +
          "isso troca 'é dele' por 'existe mentorado logado' e libera o documento dos outros",
      ).toMatch(DONO_DA_LINHA);
    }
  });

  it("public.documento tem UMA política de select: políticas permissivas se somam com OR", () => {
    // Nada media a QUANTIDADE. Uma segunda política de select
    // `using (workspace_id = public.workspace_atual())` acrescentada mais
    // abaixo não cita 'mentorado', escapava do laço que confere o portal,
    // e somava com OR: comercial, afiliado e aluno passariam a ler todo
    // contrato do workspace, e o mentorado leria também o que não foi
    // publicado e o que foi arquivado — as três garantias que esta
    // migração inteira existe para dar.
    const leituras = politicasDe(todasPoliticas(exec0015), "documento", "select");
    expect(
      leituras.length,
      "mais de uma política de select em public.documento: a mais permissiva é a que vale",
    ).toBe(1);
    const doStorage = politicasDeStorage(exec0015).filter((p) => p.comando === "select");
    expect(
      doStorage.length,
      "mais de uma política de select em storage.objects: a mais permissiva é a que vale",
    ).toBe(1);
    // Dentro da política que sobrou, cada ramo do OR precisa pagar o seu
    // `papel_atual()` — um ramo a mais sem papel abre a tabela do mesmo
    // jeito que uma política a mais.
    for (const p of [...leituras, ...doStorage]) {
      const ramos = contarRegex(p.texto, /\bor\b/gi) + 1;
      expect(
        contarRegex(p.texto, /public\.papel_atual\(\)/gi),
        `a leitura de ${p.tabela} tem ${ramos} ramos de OR e menos chamadas a papel_atual(): ` +
          "algum ramo lê sem conferir quem está lendo",
      ).toBeGreaterThanOrEqual(ramos);
    }
  });

  it.each(PAPEIS_FORA_DO_DOCUMENTO)(
    "a leitura de documento não é liberada para %s",
    (papel) => {
      // A decisão está escrita na migração ("'comercial' fica de fora de
      // propósito — contrato e anamnese são dado do pós-venda e do
      // jurídico") e só era cobrada no caminho de ESCRITA. Acrescentar
      // 'comercial' à lista de papéis do select não quebrava nada — e é a
      // leitura que vaza dado.
      const leituras = [
        ...politicasDe(todasPoliticas(exec0015), "documento", "select"),
        ...politicasDeStorage(exec0015).filter((p) => p.comando === "select"),
      ];
      expect(leituras.length, "esperava políticas de leitura em 0015").toBeGreaterThan(0);
      for (const p of leituras) {
        expect(
          p.texto.toLowerCase(),
          `a política de leitura de ${p.tabela} entrega contrato e anamnese para ${papel}`,
        ).not.toContain(papel);
      }
    },
  );

  it("visivel_portal entra AFIRMADO no filtro do portal, nunca negado", () => {
    // `and visivel_portal` virando `and not visivel_portal` mantém a
    // palavra no bloco (era só isso que o teste media) e inverte o sentido:
    // o mentorado passa a ver exatamente o que o mentor ainda não liberou —
    // contrato em rascunho, anamnese com anotação clínica — e deixa de ver
    // o que foi publicado.
    const leituras = [
      ...politicasDe(todasPoliticas(exec0015), "documento", "select"),
      ...politicasDeStorage(exec0015).filter((p) => p.comando === "select"),
    ];
    const comMentorado = leituras.filter((p) => /'mentorado'/i.test(p.texto));
    expect(comMentorado.length, "esperava a regra do portal na tabela e no Storage").toBe(2);
    for (const p of comMentorado) {
      expect(
        /\bnot\s+(?:d\.)?visivel_portal\b/i.test(p.texto),
        `a política de ${p.tabela} está com o portal INVERTIDO: mostra o que não foi publicado`,
      ).toBe(false);
      expect(p.texto).toMatch(/\band\s+(?:d\.)?visivel_portal\b/i);
    }
  });

  it("o documento arquivado também some do Storage, não só da tabela", () => {
    // O laço que confere `arquivado` roda sobre `todasPoliticas()`, que
    // extrai só `on public.<tabela>` — a política do bucket ficava de fora
    // dele, e sem `not d.arquivado` o documento arquivado desaparece da
    // tela e do PostgREST e continua baixável pela URL do Storage.
    const leituras = politicasDeStorage(exec0015).filter((p) => p.comando === "select");
    const comMentorado = leituras.filter((p) => /'mentorado'/i.test(p.texto));
    expect(comMentorado.length).toBeGreaterThan(0);
    for (const p of comMentorado) {
      expect(
        p.texto,
        "o ramo do mentorado no Storage não exclui o arquivado — o arquivo retirado de circulação continua baixável",
      ).toMatch(/\bnot\s+d\.arquivado\b/i);
    }
  });

  it("o ramo do mentorado no Storage casa a linha pelo workspace atual", () => {
    const leituras = politicasDeStorage(exec0015).filter((p) => p.comando === "select");
    const comMentorado = leituras.filter((p) => /'mentorado'/i.test(p.texto));
    expect(comMentorado.length).toBeGreaterThan(0);
    for (const p of comMentorado) {
      expect(p.texto).toMatch(/d\.workspace_id\s*=\s*public\.workspace_atual\(\)/i);
    }
  });

  it("caminho_storage é ÚNICO: duas linhas para o mesmo objeto fariam valer a mais permissiva", () => {
    // O dano está escrito na própria migração e não tinha asserção
    // nenhuma: a política do Storage procura QUALQUER linha casando o
    // caminho, então duas linhas apontando para o mesmo objeto com
    // `visivel_portal` diferente fazem valer a publicada. Basta uma linha
    // publicada apontando para o caminho de um contrato privado e o
    // mentorado baixa o contrato — sem erro nenhum na tela.
    expect(
      exec0015,
      "esperava create UNIQUE index sobre public.documento (caminho_storage)",
    ).toMatch(
      /create unique index(?:\s+if not exists)?\s+\w+\s+on public\.documento\s*\(\s*caminho_storage\s*\)/i,
    );
  });

  it("caminho_storage é obrigado a começar pela pasta do próprio workspace", () => {
    // Sem esta trava, `caminho_storage` é texto livre e a leitura do
    // mentorado vira escalonamento entre inquilinos: a gestão do
    // workspace A grava uma linha DE A (o `with check` do insert só olha
    // `workspace_id`) apontando para `<workspace-B>/contrato/acordo.pdf`
    // e marca `visivel_portal`; o mentorado de A pede o objeto e a
    // política do Storage encontra a linha, que é dele, publicada e não
    // arquivada. O arquivo entregue mora na pasta do workspace B — e nem
    // o gestor de A conseguiria lê-lo sozinho.
    const bloco = blocoCreateTable(exec0015, "documento");
    expect(
      bloco,
      "esperava check amarrando caminho_storage ao workspace_id da própria linha",
    ).toMatch(/check\s*\(\s*caminho_storage\s+like\s+workspace_id::text\s*\|\|\s*'\/%'\s*\)/i);
  });

  it("a pasta do workspace é conferida na leitura do Storage ANTES de separar os papéis", () => {
    // Dentro do ramo da gestão, a conferência de pasta não vale para o
    // mentorado — e é justamente pelo ramo do mentorado que o caminho
    // apontado para outro workspace seria entregue. Uma vez só, no topo
    // do `using`, a regra vale para todo papel.
    const leituras = politicasDeStorage(exec0015).filter((p) => p.comando === "select");
    expect(leituras.length, "esperava política de select em storage.objects").toBeGreaterThan(0);
    for (const p of leituras) {
      const casaPasta = p.texto.match(PASTA_DO_WORKSPACE);
      expect(
        casaPasta,
        "sem a pasta do workspace no using, o objeto de outro inquilino é baixável",
      ).not.toBeNull();
      const posicaoDaPasta = casaPasta ? p.texto.indexOf(casaPasta[0]) : -1;
      const posicaoDoPrimeiroPapel = p.texto.search(/public\.papel_atual\(\)/i);
      expect(
        posicaoDoPrimeiroPapel,
        "esperava papel_atual() na política de leitura do Storage",
      ).toBeGreaterThan(-1);
      expect(
        posicaoDaPasta < posicaoDoPrimeiroPapel,
        "a pasta do workspace está dentro de um ramo de papel: no ramo do mentorado ela não é " +
          "conferida, e um caminho_storage apontando para outro workspace vira leitura cruzada",
      ).toBe(true);
    }
  });

  it("bytes não nasce zero nem aceita zero: tamanho é medido, nunca inventado", () => {
    // `default 0` FABRICA o número que a validação de arquivo (tarefa 5)
    // é obrigada a recusar, e um `insert` que esqueça a coluna produz
    // linha válida de "0 KB" que ninguém mediu. Sem default, quem grava
    // é obrigado a dizer o tamanho; com o check, zero e negativo são
    // recusados pelo banco, não pela borda.
    const bloco = blocoCreateTable(exec0015, "documento");
    expect(
      /bytes\s+bigint[^,]*default/i.test(bloco),
      "bytes com default fabrica tamanho para linha que ninguém mediu",
    ).toBe(false);
    expect(
      bloco,
      "esperava check (bytes > 0): 0 byte é arquivo que não existe",
    ).toMatch(/bytes\s+bigint\s+not null\s+check\s*\(\s*bytes\s*>\s*0\s*\)/i);
  });

  it("o par _exec_0015 executa exatamente os mesmos comandos de 0015", () => {
    // O `_exec_` é o arquivo que alguém cola no SQL Editor do Supabase —
    // ou seja, é ELE que roda em produção. A comparação ignora comentário
    // (o par nasce sem os de topo, por desenho) e espaço em branco.
    expect(
      readdirSync(MIGRATIONS_DIR).includes(ARQUIVO_EXEC_0015),
      `esperava supabase/migrations/${ARQUIVO_EXEC_0015}`,
    ).toBe(true);
    const semRuido = (sql: string) => semComentarios(sql).replace(/\s+/g, " ").trim();
    expect(semRuido(lerMigracao(ARQUIVO_EXEC_0015))).toBe(semRuido(m0015));
  });
});

// ============================================================
// Varredura global das políticas de bucket (storage.objects).
//
// POR QUE FORA DO BLOCO DE 0015: `politicasDeStorage()` nasceu para
// medir o bucket `documentos` e ficou presa àquele `describe`. Toda a
// varredura global deste arquivo casa `on public.<tabela>` — ou seja, a
// próxima migração que criar política em `storage.objects` entra sem
// passar por asserção nenhuma, e invisível para o teste é exatamente
// onde o vazamento mora. Duas garantias valem para qualquer bucket:
// dizer de QUAL bucket a política fala (sem `bucket_id`, ela vale para
// todos os buckets do projeto, inclusive os que ainda não existem) e
// escopar por workspace (`storage.objects` não tem coluna
// `workspace_id`, então o escopo mora na primeira pasta do caminho ou
// na linha da tabela que descreve o objeto).
// ============================================================
describe("storage.objects — toda política de bucket, em qualquer migração", () => {
  const politicasDeBucket = arquivosDeMigracao().flatMap((arquivo) =>
    politicasDeStorage(semComentarios(lerMigracao(arquivo))).map((p) => ({ ...p, arquivo })),
  );

  it("há política de bucket para varrer (hoje, as de 0015)", () => {
    expect(
      politicasDeBucket.length,
      "nenhuma política de storage.objects encontrada — o extrator parou de enxergá-las",
    ).toBeGreaterThan(0);
  });

  it("toda política de bucket diz de qual bucket fala", () => {
    for (const p of politicasDeBucket) {
      expect(
        p.texto,
        `política "${p.comando}" em ${p.arquivo} não limita bucket_id: vale para TODOS os buckets do projeto`,
      ).toMatch(/bucket_id\s*=\s*'\w+'/i);
    }
  });

  it("toda política de bucket escopa pelo workspace", () => {
    for (const p of politicasDeBucket) {
      expect(
        p.texto,
        `política "${p.comando}" em ${p.arquivo} não cita workspace_atual(): o arquivo de um inquilino fica ao alcance do outro`,
      ).toMatch(/public\.workspace_atual\(\)/i);
    }
  });
});

// ============================================================
// 0016 — `diagnostico_lead`: as cinco respostas da landing do Jefson.
//
// O QUE ESTE BLOCO PROTEGE, E POR QUE MERECE TESTE DE FORMA
// ---------------------------------------------------------
// Esta é a primeira tabela do projeto escrita por MÁQUINA e nunca por
// alguém logado: a landing (rota pública) e a junção no recebimento do
// WhatsApp, as duas com a chave de serviço, que ignora RLS. A ausência
// de política de insert/update/delete não é esquecimento — é a regra.
// Sem um teste que exija essa ausência, a primeira pessoa que abrir uma
// tela de edição vai "consertar" o que parece faltar e abrir escrita de
// lead para qualquer usuário autenticado do workspace.
//
// A outra garantia é a inversa: a LEITURA precisa existir e precisa ser
// escopada. Lead carrega faturamento declarado e a trava emocional que
// a pessoa admitiu — é o dado mais sensível que este banco guarda sobre
// alguém que ainda nem é cliente.
// ============================================================

const ARQUIVO_0016 = "0016_diagnostico_lead.sql";
const ARQUIVO_EXEC_0016 = "_exec_0016_diagnostico_lead.sql";
const m0016 = existeArquivoDeMigracao(ARQUIVO_0016) ? lerMigracao(ARQUIVO_0016) : "";
const exec0016 = semComentarios(m0016);

describe("0016 — diagnostico_lead nasce fechado para escrita de usuário", () => {
  it("a migração 0016 existe, e a versão _exec_ também", () => {
    expect(existeArquivoDeMigracao(ARQUIVO_0016), `esperava supabase/migrations/${ARQUIVO_0016}`).toBe(true);
    // `arquivosDeMigracao()` lista só os numerados; o par `_exec_` fica de fora
    // de propósito (texto diferente contaria política em dobro). Aqui a
    // pergunta é outra — o arquivo para colar no SQL Editor foi escrito? — e
    // por isso a checagem vai direto no diretório.
    expect(
      readdirSync(MIGRATIONS_DIR).includes(ARQUIVO_EXEC_0016),
      `esperava supabase/migrations/${ARQUIVO_EXEC_0016}`,
    ).toBe(true);
  });

  it("a tabela existe e é multi-tenant, com o default do workspace padrão", () => {
    const bloco = blocoCreateTable(exec0016, "diagnostico_lead");
    expect(bloco, "create table public.diagnostico_lead não encontrado").not.toBe("");
    expect(bloco).toMatch(/workspace_id\s+uuid\s+not null/i);
    expect(bloco).toMatch(/workspace_id[\s\S]*?default\s+'00000000-0000-0000-0000-000000000001'/i);
  });

  it("o código é a chave primária — é ele que viaja na mensagem", () => {
    const bloco = blocoCreateTable(exec0016, "diagnostico_lead");
    expect(bloco).toMatch(/codigo\s+text\s+primary key/i);
  });

  it("as quatro respostas do meio aceitam nulo: quem é recusado na 1 nunca chega na 3", () => {
    const bloco = blocoCreateTable(exec0016, "diagnostico_lead");
    for (const coluna of ["papel", "trava", "inacabados", "urgencia"]) {
      expect(bloco, `coluna ${coluna} não encontrada`).toMatch(new RegExp(`\\b${coluna}\\b`, "i"));
      // Um `not null` aqui obrigaria a gravar zero para pergunta que ninguém
      // respondeu — e esse zero entraria depois numa média como se fosse dado.
      // Mede a LINHA de definição da coluna, não o bloco inteiro: a restrição
      // `check` mais abaixo cita `papel = 'D' and trava is not null`, e uma
      // busca no bloco todo casaria com ela e reprovaria por engano.
      const definicao = bloco
        .split("\n")
        .find((l) => new RegExp(`^\\s*${coluna}\\s+\\w`, "i").test(l)) ?? "";
      expect(definicao, `linha de definição de ${coluna} não encontrada`).not.toBe("");
      expect(
        /not null/i.test(definicao),
        `${coluna} não pode ser not null: quem para na pergunta 1 não responde as outras`,
      ).toBe(false);
    }
  });

  it("lead qualificado tem as cinco respostas — a restrição impede ficha vazia no meio da venda", () => {
    const bloco = blocoCreateTable(exec0016, "diagnostico_lead");
    expect(bloco).toMatch(/check\s*\(\s*not qualificado/i);
    expect(bloco).toMatch(/papel\s*=\s*'D'/i);
  });

  it("junção pela metade é impossível: dono sem data, ou data sem dono", () => {
    const bloco = blocoCreateTable(exec0016, "diagnostico_lead");
    expect(bloco).toMatch(/aluno_id is null and casado_em is null/i);
  });

  it("NÃO existe coluna de trava de trabalho: a regra da porta e do quarto mora no TypeScript", () => {
    // Guardada aqui, ela existiria em dois lugares — e a versão SQL
    // envelheceria calada no dia em que a de TypeScript mudasse. Mesmo motivo
    // pelo qual a temperatura do lead é derivada na abertura da ficha.
    const bloco = blocoCreateTable(exec0016, "diagnostico_lead");
    expect(/trava_trabalho|trava_de_trabalho/i.test(bloco)).toBe(false);
  });

  it("existe leitura, e ela é de dono/gestor/comercial escopada por workspace", () => {
    const selects = politicasDe(todasPoliticas(exec0016), "diagnostico_lead", "select");
    expect(selects.length, "sem política de select ninguém lê o próprio lead").toBeGreaterThan(0);
    for (const p of selects) {
      expect(p.texto).toMatch(/papel_atual\(\)/i);
      expect(p.texto).toMatch(/'comercial'/i);
      expect(p.texto, "leitura sem escopo de workspace vaza lead entre inquilinos").toMatch(
        /workspace_id\s*=\s*public\.workspace_atual\(\)/i,
      );
    }
  });

  it("NENHUMA política de insert, update ou delete — escrever aqui é papel de máquina", () => {
    const todas = todasPoliticas(exec0016);
    for (const comando of ["insert", "update", "delete", "all"] as const) {
      const achadas = politicasDe(todas, "diagnostico_lead", comando);
      expect(
        achadas.length,
        `política de ${comando} em diagnostico_lead: a escrita é da chave de serviço (landing e junção), ` +
          "e abrir isso para authenticated deixa qualquer usuário do workspace forjar lead",
      ).toBe(0);
    }
  });

  it("RLS está ligado — sem isso as políticas acima não valem nada", () => {
    expect(exec0016).toMatch(/alter table public\.diagnostico_lead enable row level security/i);
  });

  it("nenhum 'using (true)' nesta migração", () => {
    expect(/using\s*\(\s*true\s*\)/i.test(exec0016)).toBe(false);
  });

  it("não usa alter type add value, que não roda na mesma transação", () => {
    expect(/alter\s+type[\s\S]*?add\s+value/i.test(exec0016)).toBe(false);
  });

  it("os três enums nascem de forma idempotente", () => {
    for (const tipo of ["trava_lead", "faixa_lead", "papel_lead"]) {
      expect(exec0016, `enum ${tipo} não encontrado`).toMatch(new RegExp(`create type ${tipo} as enum`, "i"));
    }
    expect(contarOcorrencias(exec0016.toLowerCase(), "exception when duplicate_object")).toBeGreaterThanOrEqual(3);
  });

  it("existe índice para achar quem preencheu e não mandou mensagem", () => {
    // Essa lista é o ativo que quase todo funil joga fora. Sem índice parcial
    // ela vira varredura de tabela, e ninguém abre o que demora.
    expect(exec0016).toMatch(/create index[\s\S]*?diagnostico_lead[\s\S]*?where\s+aluno_id is null/i);
  });
});

// ============================================================
// 0017 — a sessão ganha agenda, gravação e transcrição
// ============================================================
//
// O bloco existe por causa de uma lição cara: RLS decide se a LINHA
// aparece, e quando aparece, aparece INTEIRA. O mentorado já enxerga as
// próprias sessões — então, no instante em que `transcricao` virou coluna
// de `sessao`, um GET direto no PostgREST com a anon key (que é pública)
// passou a alcançá-la. Esconder na tela seria repetir o erro de 0012, onde
// a Server Action "protegia" um campo que um PATCH direto alcançava assim
// mesmo. Por isso o portal lê uma VIEW que zera as colunas na origem, e por
// isso os testes abaixo travam o `case`, o `security_invoker` e o default
// `false` das duas flags.
const ARQUIVO_0017 = "0017_sessao_agenda_gravacao.sql";
const ARQUIVO_EXEC_0017 = "_exec_0017_sessao_agenda_gravacao.sql";
const m0017 = existeArquivoDeMigracao(ARQUIVO_0017) ? lerMigracao(ARQUIVO_0017) : "";
const exec0017 = semComentarios(m0017);

const COLUNAS_NOVAS_0017 = [
  "evento_google_id",
  "link_reuniao",
  "gravacao_liberada",
  "transcricao_liberada",
  "transcrita_em",
  "transcricao_origem",
];

describe("0017 — sessão com agenda, gravação e transcrição", () => {
  it("a migração 0017 existe, e a versão _exec_ também", () => {
    expect(
      existeArquivoDeMigracao(ARQUIVO_0017),
      `esperava supabase/migrations/${ARQUIVO_0017}`,
    ).toBe(true);
    // `existeArquivoDeMigracao` so enxerga os numerados NNNN_*.sql, de
    // proposito (o par _exec_ tem texto aparado e contaria tabela em
    // dobro na varredura). Para o gemeo, a checagem e direta no disco.
    expect(
      readdirSync(MIGRATIONS_DIR).includes(ARQUIVO_EXEC_0017),
      `esperava supabase/migrations/${ARQUIVO_EXEC_0017}`,
    ).toBe(true);
  });

  it("não usa o número 0016, que já pertence a outra migração", () => {
    // Duas migrações com o mesmo número não dão erro: elas rodam em ordem
    // alfabética e uma some do radar de quem for conferir o estado do
    // banco depois. O teste existe para o dia em que alguém renumerar sem
    // olhar o diretório.
    expect(existeArquivoDeMigracao("0016_diagnostico_lead.sql")).toBe(true);
    expect(existeArquivoDeMigracao("0016_sessao_agenda_gravacao.sql")).toBe(false);
  });

  it.each(COLUNAS_NOVAS_0017)("sessao ganha a coluna %s", (coluna) => {
    expect(exec0017).toMatch(
      new RegExp(`alter table public\\.sessao\\s+add column if not exists ${coluna}\\b`, "i"),
    );
  });

  it.each(["gravacao_liberada", "transcricao_liberada"])(
    "%s nasce FALSA — publicar é ato explícito, esconder não pode depender de memória",
    (flag) => {
      const linha = new RegExp(
        `add column if not exists ${flag}\\s+boolean\\s+not null\\s+default\\s+(\\w+)`,
        "i",
      ).exec(exec0017);
      expect(linha, `não achei a coluna ${flag}`).not.toBeNull();
      expect(linha![1].toLowerCase()).toBe("false");
    },
  );

  it("a view sessao_do_portal existe e roda com security_invoker = true", () => {
    // Sem isto a view roda com os direitos de quem a criou e devolve a
    // sessão de TODOS os mentorados para qualquer um — o crítico 1 e o
    // crítico 2 da auditoria de 0008, repetidos.
    expect(exec0017).toMatch(/create (or replace )?view public\.sessao_do_portal/i);
    expect(exec0017).toMatch(
      /create (or replace )?view public\.sessao_do_portal[\s\S]*?with\s*\(\s*security_invoker\s*=\s*true\s*\)/i,
    );
  });

  it.each([
    ["link_gravacao", "gravacao_liberada"],
    ["transcricao", "transcricao_liberada"],
  ])("a view zera %s enquanto %s for falsa", (coluna, flag) => {
    expect(exec0017).toMatch(
      new RegExp(`case when s\\.${flag} then s\\.${coluna} else ''\\s*end as ${coluna}`, "i"),
    );
  });

  it("a view NÃO expõe colunas que o portal não precisa ver", () => {
    // `transcricao_origem` diz de qual motor veio o texto: é dado de
    // operação, não do cliente. Manter a view enxuta é o que impede que
    // uma coluna sensível futura entre nela por descuido de copiar e colar.
    const corpo = /create (or replace )?view public\.sessao_do_portal[\s\S]*?;/i.exec(exec0017);
    expect(corpo).not.toBeNull();
    expect(corpo![0]).not.toMatch(/transcricao_origem/i);
  });

  it("0017 não contém alter type ... add value (não pode dividir transação)", () => {
    expect(exec0017).not.toMatch(/alter\s+type[\s\S]*?add\s+value/i);
  });

  it("a view entra na lista das que precisam de security_invoker", () => {
    expect(VIEWS_DO_SCHEMA_COM_PORTAL).toContain("sessao_do_portal");
  });
});

// ============================================================
// 0018 — revogar conteúdo liberado sem apagar a linha
// ============================================================
//
// Duas coisas que este bloco trava, e as duas nasceram de lição paga:
//
// 1) REVOGAR NÃO É DELETE. A linha fica, com a data e o título originais.
//    Conteúdo liberado é uma promessa feita a um cliente, e apagar a linha
//    apagaria a prova de que a promessa existiu.
// 2) REVOGAR PRECISA REVOGAR DE VERDADE. Filtrar `arquivado = false` na
//    consulta do portal resolveria a tela e não resolveria o PostgREST: a
//    anon key é pública, e um GET direto continuaria devolvendo a linha
//    revogada para o próprio mentorado. Por isso a condição entra na
//    POLÍTICA, no ramo do mentorado — e a gestão continua vendo tudo.

const ARQUIVO_0018 = "0018_conteudo_liberado_arquivado.sql";
const ARQUIVO_EXEC_0018 = "_exec_0018_conteudo_liberado_arquivado.sql";
const m0018 = existeArquivoDeMigracao(ARQUIVO_0018) ? lerMigracao(ARQUIVO_0018) : "";
const exec0018 = semComentarios(m0018);

describe("0018 — conteudo_liberado ganha arquivado", () => {
  it("a migração 0018 existe, e a versão _exec_ também", () => {
    expect(existeArquivoDeMigracao(ARQUIVO_0018), `esperava supabase/migrations/${ARQUIVO_0018}`).toBe(true);
    expect(
      readdirSync(MIGRATIONS_DIR).includes(ARQUIVO_EXEC_0018),
      `esperava supabase/migrations/${ARQUIVO_EXEC_0018}`,
    ).toBe(true);
  });

  it("a coluna nasce com default FALSE — nada é revogado por acidente de migração", () => {
    expect(exec0018).toMatch(
      /add column if not exists\s+arquivado\s+boolean\s+not null\s+default\s+false/i,
    );
    // `default true` revogaria, na hora em que a migração rodasse, todo
    // conteúdo já liberado de todo mentorado. O teste falha se alguém
    // trocar.
    expect(exec0018).not.toMatch(/arquivado\s+boolean[^;]*default\s+true/i);
  });

  it("a migração não apaga nada: nenhum delete, nenhum drop de tabela ou coluna", () => {
    expect(exec0018).not.toMatch(/\bdelete\s+from\b/i);
    expect(exec0018).not.toMatch(/\bdrop\s+table\b/i);
    expect(exec0018).not.toMatch(/\bdrop\s+column\b/i);
    // O único `drop policy` aceitável é o da própria política que ela
    // recria em seguida — e ele vem com `if exists`, no par com o `create`.
    const dropsDePolitica = exec0018.match(/drop policy/gi) ?? [];
    const createsDePolitica = exec0018.match(/create policy/gi) ?? [];
    expect(dropsDePolitica.length).toBe(createsDePolitica.length);
  });

  it("a política de select do MENTORADO exige arquivado = false", () => {
    const politica = exec0018.slice(exec0018.indexOf("create policy"));
    expect(politica).toContain("papel_atual() = 'mentorado'");
    expect(politica).toMatch(/arquivado\s*=\s*false/i);
    // E a condição precisa estar DENTRO do ramo do mentorado, não solta no
    // topo: solta no topo, ela esconderia o revogado também da gestão — que
    // é justamente quem precisa conferir o que foi liberado um dia.
    const posMentorado = politica.indexOf("papel_atual() = 'mentorado'");
    const posArquivado = politica.search(/arquivado\s*=\s*false/i);
    expect(posArquivado).toBeGreaterThan(posMentorado);
  });

  it("a política recriada mantém o filtro de workspace e o ramo da gestão", () => {
    const politica = exec0018.slice(exec0018.indexOf("create policy"));
    expect(politica).toContain("workspace_id = public.workspace_atual()");
    expect(politica).toContain("papel_atual() in ('dono', 'gestor')");
    expect(politica).toContain("mentorado_id = public.mentorado_atual()");
    expect(politica).not.toMatch(/using\s*\(\s*true\s*\)/i);
  });

  it("não cria enum novo nem mexe em tipo existente", () => {
    expect(exec0018).not.toMatch(/alter type .* add value/i);
    expect(exec0018).not.toMatch(/create type/i);
  });
});
