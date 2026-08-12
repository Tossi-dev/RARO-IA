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
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

function lerMigracao(arquivo: string): string {
  return readFileSync(join(MIGRATIONS_DIR, arquivo), "utf8");
}

const m0001 = lerMigracao("0001_schema.sql");
const m0006 = lerMigracao("0006_mentoros_mentoria.sql");
const m0007 = lerMigracao("0007_mentoros_rls.sql");
const m0008 = lerMigracao("0008_mentoros_rls_correcoes.sql");

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
