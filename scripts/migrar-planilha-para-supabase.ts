// ============================================================
// Migração: planilha Base_Financeira_Operacao -> Postgres do Supabase
// ============================================================
//
// POR QUE ESTE SCRIPT EXISTE
// ---------------------------
// `src/lib/data/index.ts` dá PRECEDÊNCIA ao Supabase sobre a planilha
// (ver `modoDados()` lá). No minuto em que as variáveis
// `NEXT_PUBLIC_SUPABASE_*` forem ligadas em produção, o app PARA de ler a
// planilha — mesmo que o Postgres esteja vazio. Sem este script rodando
// antes, o dono abriria o painel e veria faturamento zero, nenhum aluno,
// caixa vazio: a planilha continuaria intacta, mas a TELA mentiria. Este
// script é o que evita essa mentira: ele lê a planilha (fonte de hoje) e
// grava no Postgres (fonte de amanhã) ANTES da troca de chave ir para o ar.
//
// ONDE ISSO RODA
// ---------------
// Na máquina do dono: `npx tsx scripts/migrar-planilha-para-supabase.ts`.
// Este ambiente de desenvolvimento NÃO alcança nem o Google nem o
// Supabase (egress bloqueado) — por isso a suíte que prova a LÓGICA deste
// arquivo (`scripts/migrar.test.ts`) usa dublês para as duas pontas de
// rede (planilha e banco) e nunca abre uma conexão de verdade.
//
// O DESAFIO CENTRAL: IDs INCOMPATÍVEIS
// -------------------------------------
// Na planilha o id é texto gerado pelo Apps Script (ex.: "ALU-MSP1M2MZ-
// HTDE"). No Postgres a chave primária é `uuid`, gerada pelo banco no
// INSERT. Não dá para copiar o id: é preciso inserir e GUARDAR o mapa
// `id antigo (texto da planilha) -> uuid novo (Postgres)`, entidade por
// entidade, e usar esse mapa para resolver toda chave estrangeira das
// entidades que vêm depois. Inserir na ordem errada faz o Postgres
// recusar a linha por violação de FK — por isso a ordem de `ENTIDADES`
// abaixo é literalmente a ordem de dependência do schema (ver o
// comentário ao lado de cada entrada) e é validada em tempo de execução
// por `validarOrdemDeDependencia`.
//
// COMO SE LÊ E COMO SE ESCREVE
// ------------------------------
// LEITURA: reaproveita `sheetsProvider` (src/lib/data/sheets-db.ts), que
// já é testado e já devolve objetos de domínio com dinheiro, data e sinal
// (Nubank) tratados. Este script NUNCA reimplementa o parser da planilha.
//
// ESCRITA: usa `@supabase/supabase-js` direto, com a **service_role key**
// (não a anon key do app) — a RLS bloquearia inserção em massa sem
// usuário autenticado. A chave vem de `process.env.SUPABASE_SERVICE_ROLE_KEY`
// e NUNCA é impressa em lugar nenhum deste arquivo.
//
// REGRAS QUE NÃO PODEM SER VIOLADAS (ver `scripts/migrar.test.ts`)
// -------------------------------------------------------------------
// 1. IDEMPOTENTE — antes de inserir, cada entidade verifica se a MESMA
//    linha de negócio já existe no Postgres por uma CHAVE NATURAL (não o
//    id, que muda a cada leitura da planilha). Rodar o script duas vezes
//    sobre a mesma fonte insere na primeira e ZERO na segunda.
// 2. NUNCA INVENTA DADO — linha que não dá para converter sem inventar
//    valor (referência que não existe, campo obrigatório vazio sem
//    default no Postgres) NÃO entra com valor remendado: vai para a
//    lista de recusadas, com o motivo e a posição na leitura da aba, e o
//    script mostra essa lista no fim.
// 3. NÃO APAGA NADA — nem na planilha (só leitura), nem no Postgres
//    (nenhum `delete`, nenhum `truncate`, nenhum `update`). Uma linha que
//    já existe é só RECONHECIDA (entra no mapa de ids), nunca sobrescrita.
// 4. A CONFERÊNCIA FINAL É OBRIGATÓRIA — para cada entidade migrada, o
//    relatório mostra "planilha: N / Postgres: M" lado a lado. Se algum
//    par não bater, o script termina com código de saída DIFERENTE DE
//    ZERO (só em modo `--aplicar`; em `--simular` a divergência é
//    esperada porque nada foi escrito) e diz exatamente qual entidade
//    divergiu.
// 5. PADRÃO É SIMULAR — sem `--aplicar`, o script só mostra o que faria.
//    Nenhuma chamada de escrita é feita nesse modo.
//
// O QUE NÃO É MIGRADO POR AQUI
// ------------------------------
// As tabelas de mentoria do MentorOS (`programa`, `turma`, `mentorado`,
// `matricula`, `sessao`, `tarefa_mentoria`, `marco`, `score_evolucao`,
// `conteudo_liberado` — ver supabase/migrations/0006) nascem VAZIAS de
// propósito. Não existe dado de mentoria na planilha: ela é o CRM de
// VENDAS (alunos/leads), não o pós-venda de mentoria. Criar um
// `mentorado` para cada `aluno` inventaria uma matrícula de mentoria que
// ninguém fez. Essas tabelas se preenchem quando o Jefson cadastrar
// programa e sessão pelo próprio sistema.
//
// Note também que `turmas` (CRM de vendas, tabela do 0001) é uma tabela
// DIFERENTE de `turma` (mentoria, tabela do 0006) — nomes parecidos,
// conceitos e RLS diferentes. Nenhuma das duas tem aba na planilha (ver
// ENTIDADES_PULADAS abaixo para `turmas`).
// ============================================================

import { pathToFileURL } from "node:url";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { sheetsProvider } from "@/lib/data/sheets-db";
import type { RegistroImportacao } from "@/lib/data/provider";
import type {
  Afiliado,
  Agrupamento,
  Atividade,
  Aula,
  Campanha,
  Chargeback,
  Comissao,
  ContaBancaria,
  ConteudoView,
  Despesa,
  Encontro,
  Envio,
  Interacao,
  Lancamento,
  Matricula,
  Meta,
  MetaFinanceira,
  Modulo,
  MovimentoCaixa,
  Pagavel,
  ParametrosFinanceiros,
  PerfilSocial,
  Produto,
  ProgressoAula,
  Recebivel,
  Reembolso,
  Reuniao,
  Tarefa,
  Aluno,
} from "@/lib/types";

// ============================================================
// 1. Infraestrutura genérica: mapa de ids, cliente de banco, motor
// ============================================================

/** Uma linha já em snake_case, pronta para `insert` no Postgres. */
type LinhaPg = Record<string, unknown>;

/** Resultado de converter um item de domínio numa linha do Postgres. */
type Conversao = { linha: LinhaPg } | { recusa: string };

function ehRecusa(c: Conversao): c is { recusa: string } {
  return "recusa" in c;
}

/**
 * O mapa `id antigo (planilha) -> uuid novo (Postgres)`, um por entidade.
 * Vive fora do motor de migração para ser trivialmente testável com um
 * dublê: os testes plantam entradas nele e checam se o conversor de uma
 * entidade dependente as usa corretamente.
 */
export interface MapaIds {
  registrar(entidade: string, idAntigo: string, idNovo: string): void;
  resolver(entidade: string, idAntigo: string): string | undefined;
}

/**
 * O prefixo que marca um id inventado pela SIMULAÇÃO. Escolhido para ser
 * impossível de confundir com um uuid do Postgres: tem letras fora do
 * alfabeto hexadecimal, dois-pontos, e o comprimento errado. Quem ler um
 * destes num banco sabe na hora que algo deu muito errado — e é justamente
 * por isso que ele é assim, e não um uuid plausível.
 */
export const PREFIXO_ID_SIMULADO = "simulado:";

export function idSimulado(entidade: string, idOrigem: string): string {
  return `${PREFIXO_ID_SIMULADO}${entidade}:${idOrigem}`;
}

/** Os campos de uma linha que carregam um id de simulação. Vazio é o normal. */
export function valoresSimulados(linha: Record<string, unknown>): string[] {
  return Object.entries(linha)
    .filter(([, v]) => typeof v === "string" && v.startsWith(PREFIXO_ID_SIMULADO))
    .map(([k]) => k);
}

export function criarMapaIds(): MapaIds {
  const mapas = new Map<string, Map<string, string>>();
  return {
    registrar(entidade, idAntigo, idNovo) {
      // Id antigo vazio nunca é registrado: seria uma chave que "resolve"
      // para qualquer referência vazia, o que tornaria `resolver` mentiroso
      // para toda entidade cujo campo de origem também está vazio.
      if (idAntigo === "") return;
      if (!mapas.has(entidade)) mapas.set(entidade, new Map());
      mapas.get(entidade)!.set(idAntigo, idNovo);
    },
    resolver(entidade, idAntigo) {
      if (idAntigo === "") return undefined;
      return mapas.get(entidade)?.get(idAntigo);
    },
  };
}

/**
 * A porta de saída para o Postgres, abstraída atrás de três operações.
 *
 * POR QUE NÃO USAR `SupabaseClient` DIRETO NO MOTOR DE MIGRAÇÃO: a API
 * encadeada do supabase-js (`.from().select().eq().maybeSingle()`) é
 * pesada de dublar fielmente num teste sem rede. Reduzindo a necessidade
 * real a três verbos, o teste consegue substituir esta interface por uma
 * implementação em memória (`ClienteBancoFalso`, em `migrar.test.ts`) e
 * provar idempotência, ordem e recusa sem tocar em HTTP nenhum.
 */
export interface ClienteBanco {
  /** Acha o id de uma linha já existente pela CHAVE NATURAL; `null` se não achar. */
  buscarPorChaveNatural(tabela: string, filtro: LinhaPg): Promise<string | null>;
  /** Insere uma linha e devolve o id gerado. NUNCA é chamado em modo simulação. */
  inserir(tabela: string, linha: LinhaPg): Promise<string>;
  /** Conta quantas linhas existem na tabela hoje — só para a conferência final. */
  contar(tabela: string): Promise<number>;
}

/** Implementação real, contra um projeto Supabase de verdade (service role). */
export function criarClienteSupabase(url: string, chaveServico: string): ClienteBanco {
  const sb: SupabaseClient = createClient(url, chaveServico, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return {
    async buscarPorChaveNatural(tabela, filtro) {
      let consulta = sb.from(tabela).select("id").limit(1);
      for (const [coluna, valor] of Object.entries(filtro)) {
        consulta = valor === null ? consulta.is(coluna, null) : consulta.eq(coluna, valor as never);
      }
      const { data, error } = await consulta.maybeSingle();
      if (error) {
        throw new Error(`Supabase recusou a consulta de idempotência em "${tabela}": ${error.message}`);
      }
      return data ? String((data as { id: unknown }).id) : null;
    },

    async inserir(tabela, linha) {
      // Rede de segurança contra o id de simulação: ele é criado só quando
      // `aplicar` é falso, e neste caminho `aplicar` é verdadeiro — as duas
      // coisas não podem coexistir. Se um dia coexistirem por um erro de
      // refatoração, o certo é parar aqui, alto e claro, e não gravar uma
      // chave estrangeira apontando para um id que nunca existiu.
      const suspeitas = valoresSimulados(linha);
      if (suspeitas.length > 0) {
        throw new Error(
          `Recusando gravar em "${tabela}": a linha carrega ${suspeitas.length} valor(es) de SIMULAÇÃO ` +
            `(campo(s): ${suspeitas.join(", ")}). Isto é um defeito do script, não da planilha.`
        );
      }
      const { data, error } = await sb.from(tabela).insert(linha).select("id").single();
      if (error) {
        throw new Error(`Supabase recusou a inserção em "${tabela}": ${error.message}`);
      }
      return String((data as { id: unknown }).id);
    },

    async contar(tabela) {
      const { count, error } = await sb.from(tabela).select("id", { count: "exact", head: true });
      if (error) {
        throw new Error(`Supabase recusou a contagem em "${tabela}": ${error.message}`);
      }
      return count ?? 0;
    },
  };
}

/** Uma linha recusada — planilha corrige, dono roda de novo. */
export interface Recusa {
  entidade: string;
  /** Posição do item na leitura da aba (1-based) — não é literalmente o número
   *  da linha física no Google Sheets (o provider já filtra linhas sem ID
   *  antes de chegar aqui), mas basta para o dono achar a linha certa. */
  posicao: number;
  idOrigem: string;
  motivo: string;
}

export interface DefinicaoEntidade<T = unknown> {
  /** Nome da tabela no Postgres — também a chave usada no mapa de ids. */
  entidade: string;
  /** Nome da aba de origem na planilha (só para o relatório). */
  aba: string;
  /** Nomes de outras entidades cujo mapa de ids este passo pode consumir. */
  dependeDe: string[];
  ler(): Promise<T[]>;
  /** O id do item NA PLANILHA — chave do mapa de ids e identificador na recusa. */
  idOrigem(item: T): string;
  /**
   * Converte um item de domínio na linha do Postgres (snake_case), resolvendo
   * toda referência estrangeira pelo `MapaIds` já construído pelas entidades
   * anteriores. Devolve `{ recusa }` em vez de inventar um valor quando a
   * conversão não é possível sem isso.
   */
  converter(item: T, mapa: MapaIds): Conversao;
  /**
   * A CHAVE NATURAL desta entidade: os campos (já em snake_case, extraídos da
   * linha já convertida) que identificam a MESMA linha de negócio entre uma
   * execução e outra. É o que torna o script idempotente — ver o comentário
   * ao lado de cada `chaveNatural` no array `ENTIDADES_MIGRAVEIS` para o
   * porquê da escolha em cada entidade.
   */
  chaveNatural: (linha: LinhaPg) => LinhaPg;
}

/** Uma entidade pedida pela tarefa que a planilha não tem como alimentar. */
export interface EntidadePulada {
  entidade: string;
  motivo: string;
}

export interface ResultadoEntidade {
  entidade: string;
  aba: string;
  /** Quantas linhas a planilha tinha (convertíveis + recusadas). */
  lidas: number;
  inseridas: number;
  jaExistentes: number;
  recusas: Recusa[];
  /**
   * Linhas da planilha cuja CHAVE NATURAL já tinha aparecido nesta mesma
   * execução — ou seja, duplicatas dentro da própria fonte (ex.: um lead
   * duplicado, uma linha de teste relançada com o mesmo telefone).
   *
   * Isto é DIFERENTE de `jaExistentes`: `jaExistentes` fala de uma linha que
   * já tinha sido gravada numa execução ANTERIOR do script; este campo fala
   * de uma linha repetida DENTRO da leitura de agora, antes mesmo de
   * consultar o Postgres. As duas contagens são independentes e uma linha
   * nunca soma nos dois contadores ao mesmo tempo.
   */
  duplicadasNaOrigem: number;
}

/**
 * Garante que nenhuma entidade em `ordem` depende de algo que só aparece
 * DEPOIS dela mesma. É o guarda-corpo de tempo de execução para a regra
 * central deste script: "a ordem de inserção respeita as dependências".
 * Roda antes de qualquer leitura ou escrita — um erro aqui é um bug no
 * PRÓPRIO SCRIPT, não um problema de dado do dono.
 */
export function validarOrdemDeDependencia(
  ordem: DefinicaoEntidade[],
  puladasConhecidas: ReadonlySet<string> = new Set()
): void {
  const jaProcessadas = new Set<string>();
  for (const def of ordem) {
    for (const dep of def.dependeDe) {
      // Uma dependência para uma entidade PULADA (sem aba na planilha, ver
      // ENTIDADES_PULADAS) é uma dependência real do SCHEMA que nunca vai
      // ser satisfeita por este script — e está tudo bem: o `converter` da
      // entidade dependente (ex.: `encontros`) recusa toda linha por causa
      // disso, de propósito. Isso não é um erro de ORDENAÇÃO, é um limite
      // de dado conhecido — só falha aqui quando a dependência não está em
      // NENHUMA das duas listas (aí sim é bug de configuração do script).
      if (puladasConhecidas.has(dep)) continue;
      if (!jaProcessadas.has(dep)) {
        throw new Error(
          `erro interno de ordenação: "${def.entidade}" depende de "${dep}", mas "${dep}" ` +
            `ainda não foi processada nesta ordem. Corrija a posição das duas em ENTIDADES_MIGRAVEIS.`
        );
      }
    }
    jaProcessadas.add(def.entidade);
  }
}

/**
 * Serializa uma chave natural (já em snake_case) para comparar duas linhas
 * como "mesma chave" independentemente da ORDEM em que os campos aparecem no
 * objeto — `Object.entries` preserva ordem de inserção, e cada
 * `chaveNatural` de `ENTIDADES_MIGRAVEIS` escreve os campos numa ordem fixa
 * no código, mas nada IMPEDE duas ordens diferentes de descrever a mesma
 * chave (`{nome,telefone}` e `{telefone,nome}` são a MESMA pessoa). Sem
 * ordenar por nome de campo antes de `JSON.stringify`, essas duas virariam
 * strings diferentes e a contagem de duplicatas erraria por baixo — a
 * própria detecção de duplicata é o que este script usa para dizer "está
 * tudo bem, é a planilha repetindo", então ela precisa estar certa.
 */
function serializarChaveNatural(chave: LinhaPg): string {
  return JSON.stringify(Object.entries(chave).sort(([a], [b]) => a.localeCompare(b)));
}

/**
 * Migra uma entidade: lê a planilha, converte item a item, verifica a chave
 * natural no Postgres (idempotência), insere o que falta (só em `aplicar`) e
 * devolve o balanço. Nunca lança por causa de UMA linha ruim — cada falha de
 * conversão vira uma recusa e o laço continua para a próxima linha.
 */
export async function migrarEntidade<T>(
  def: DefinicaoEntidade<T>,
  banco: ClienteBanco,
  mapa: MapaIds,
  aplicar: boolean
): Promise<ResultadoEntidade> {
  const itens = await def.ler();
  const recusas: Recusa[] = [];
  let inseridas = 0;
  let jaExistentes = 0;
  let duplicadasNaOrigem = 0;

  // As duas linhas abaixo existem só para RECONHECER duplicata dentro desta
  // execução — nunca para decidir idempotência entre execuções (isso
  // continua sendo `banco.buscarPorChaveNatural`, que fala com o Postgres).
  // `chavesVistas` guarda toda chave natural já processada nesta leitura;
  // `idPorChave` guarda o id (real ou simulado) que a PRIMEIRA ocorrência de
  // cada chave recebeu, para a(s) ocorrência(s) seguinte(s) — a duplicata —
  // poder registrar a MESMA referência no mapa de ids sem inserir de novo.
  const chavesVistas = new Set<string>();
  const idPorChave = new Map<string, string>();

  for (let i = 0; i < itens.length; i++) {
    const item = itens[i];
    const idOrigem = def.idOrigem(item);
    const conversao = def.converter(item, mapa);

    if (ehRecusa(conversao)) {
      recusas.push({
        entidade: def.entidade,
        posicao: i + 1,
        idOrigem: idOrigem || "(sem id)",
        motivo: conversao.recusa,
      });
      continue;
    }

    const chave = def.chaveNatural(conversao.linha);
    const chaveSerializada = serializarChaveNatural(chave);

    if (chavesVistas.has(chaveSerializada)) {
      // DUPLICATA NA ORIGEM: esta MESMA chave natural já apareceu antes
      // nesta leitura (ex.: lead duplicado, linha de teste relançada com o
      // mesmo telefone). O Postgres já vai guardar (ou já guardou, algumas
      // linhas atrás neste mesmo laço) UMA cópia dela — aqui só repetimos,
      // no mapa de ids, o id que a primeira ocorrência recebeu, para que
      // quem depende desta linha (uma FK apontando para ESTE id de origem
      // específico) resolva do mesmo jeito. Nunca consultamos o banco nem
      // inserimos de novo por causa desta linha: ela não é nova informação,
      // é a planilha repetindo a mesma linha de negócio duas vezes.
      duplicadasNaOrigem++;
      const idJaResolvido = idPorChave.get(chaveSerializada);
      if (idJaResolvido) mapa.registrar(def.entidade, idOrigem, idJaResolvido);
      continue;
    }
    chavesVistas.add(chaveSerializada);

    const idExistente = await banco.buscarPorChaveNatural(def.entidade, chave);
    if (idExistente) {
      // JÁ MIGRADA numa execução anterior: registra o id no mapa mesmo assim
      // (quem depende desta linha precisa do uuid para resolver a própria
      // referência), mas NÃO insere de novo — é isto que torna o script
      // idempotente (regra 1).
      jaExistentes++;
      mapa.registrar(def.entidade, idOrigem, idExistente);
      idPorChave.set(chaveSerializada, idExistente);
      continue;
    }

    if (!aplicar) {
      // Modo simulação: nenhuma escrita é chamada (regra 5).
      //
      // POR QUE REGISTRAMOS UM ID MARCADO NO MAPA
      // ------------------------------------------
      // A versão anterior deste bloco fazia só `continue`, argumentando que
      // não existe id "de mentira" que faça sentido numa FK de verdade. O
      // argumento está certo para a ESCRITA e errado para o RELATÓRIO: sem
      // nada no mapa, toda entidade que depende de outra é recusada por
      // "referência não encontrada", e a simulação vira inútil exatamente
      // onde ela mais importa. Na primeira execução real na máquina do dono
      // isso produziu 47 linhas recusadas — 21 interações, 13 movimentos e
      // 13 importações — todas por um vínculo que existe e está correto na
      // planilha. Quarenta e sete números falsos num relatório cujo trabalho
      // inteiro é dizer a verdade sobre o que viria.
      //
      // O id de simulação é PREFIXADO e reconhecível (`simulado:`), nunca
      // tem forma de uuid, e nunca pode chegar ao banco: `inserir()` só é
      // chamada quando `aplicar` é verdadeiro, e `criarClienteSupabase`
      // ainda checa o prefixo antes de escrever, como rede de segurança.
      const idFalso = idSimulado(def.entidade, idOrigem);
      mapa.registrar(def.entidade, idOrigem, idFalso);
      idPorChave.set(chaveSerializada, idFalso);
      inseridas++;
      continue;
    }

    const idNovo = await banco.inserir(def.entidade, conversao.linha);
    mapa.registrar(def.entidade, idOrigem, idNovo);
    idPorChave.set(chaveSerializada, idNovo);
    inseridas++;
  }

  return { entidade: def.entidade, aba: def.aba, lidas: itens.length, inseridas, jaExistentes, recusas, duplicadasNaOrigem };
}

// ============================================================
// 2. Ajudantes de conversão — resolução de referência sem inventar dado
// ============================================================

/**
 * Resolve uma referência OBRIGATÓRIA (coluna `not null` no Postgres).
 * `idAntigo` vazio OU não encontrado no mapa vira recusa — nunca um uuid
 * chutado, nunca a linha inteira "adaptada" para caber.
 */
function refObrigatoria(
  mapa: MapaIds,
  entidadeAlvo: string,
  idAntigo: string,
  contexto: string
): { ok: true; id: string } | { ok: false; motivo: string } {
  if (idAntigo === "") {
    return { ok: false, motivo: `${contexto}: a planilha não amarra este vínculo (referência vazia).` };
  }
  const id = mapa.resolver(entidadeAlvo, idAntigo);
  if (!id) {
    return {
      ok: false,
      motivo: `${contexto}: referência "${idAntigo}" não foi encontrada em "${entidadeAlvo}" (não migrada ou recusada).`,
    };
  }
  return { ok: true, id };
}

/**
 * Resolve uma referência OPCIONAL (coluna nullable no Postgres).
 *
 * Ausência na origem (`idAntigo` vazio) é uma resposta legítima e vira
 * `null` sem drama. Presença na origem sem correspondência no mapa NÃO vira
 * `null` em silêncio — isso trocaria "existe um vínculo que ainda não foi
 * migrado" por "nunca existiu vínculo nenhum", que é inventar uma versão
 * diferente da realidade. Por isso ainda assim recusa a linha inteira.
 */
function refOpcional(
  mapa: MapaIds,
  entidadeAlvo: string,
  idAntigo: string | null | undefined,
  contexto: string
): { ok: true; id: string | null } | { ok: false; motivo: string } {
  if (!idAntigo) return { ok: true, id: null };
  const id = mapa.resolver(entidadeAlvo, idAntigo);
  if (!id) {
    return {
      ok: false,
      motivo:
        `${contexto}: referência opcional "${idAntigo}" existe na planilha mas não foi encontrada em ` +
        `"${entidadeAlvo}" (não migrada ou recusada) — a linha fica de fora em vez de perder o vínculo em silêncio.`,
    };
  }
  return { ok: true, id };
}

/** Data/hora ISO vazia vira "ausente da linha" (deixa o Postgres aplicar o
 *  próprio `default`) — só use em colunas que TÊM default; nas que não têm,
 *  quem chama precisa checar o valor vazio e recusar antes de chegar aqui. */
function seDefinida(valor: string | null | undefined): string | undefined {
  return valor ? valor : undefined;
}

// ============================================================
// 3. As entidades PULADAS — sem aba correspondente (ou sem leitura real)
// ============================================================
//
// Regra do enunciado: "se alguma dessas não tiver aba correspondente na
// planilha, PULE e diga no relatório — não invente tabela vazia como se
// tivesse migrado." As dez abaixo caem nesse caso. Nenhuma delas tem uma
// aba própria em `src/lib/sheets/abas.ts` E/OU o próprio `sheetsProvider`
// já documenta (em `src/lib/data/sheets-db.ts`) que não tem como lê-las
// da planilha — os dois pontos foram conferidos, não só um.

export const ENTIDADES_PULADAS: EntidadePulada[] = [
  {
    entidade: "crm_estagios",
    motivo:
      "não tem aba: os estágios do CRM na planilha (ESTAGIOS_PLANILHA, em sheets/mapear.ts) são uma " +
      "lista FIXA no código do Apps Script, não dado editável numa aba — e os nomes nem batem com os " +
      "que supabase/migrations/0002_expansao.sql já semeia em crm_estagios (Lead/Em conversa/Aluno " +
      "novo/... contra Novo/Qualificado/Negociação/Ganho/Perdido). A tabela já nasce populada pela " +
      "própria migração; migrar aqui duplicaria ou inventaria uma correspondência que não existe.",
  },
  {
    entidade: "turmas",
    motivo:
      "não tem aba TURMAS na planilha, e o próprio DataProvider (src/lib/data/provider.ts) não expõe " +
      "nenhum `listTurmas()` — sheetsProvider.getLancamento() sempre devolve `turmas: []` com o " +
      "comentário explícito \"Turmas... não tem aba\". Sem leitura nenhuma, não há o que migrar.",
  },
  {
    entidade: "planos",
    motivo:
      "não tem aba PLANOS na planilha nem método de leitura no DataProvider — o conceito de \"plano\" " +
      "(recorrência dentro de um produto) nunca existiu no arquivo do dono.",
  },
  {
    entidade: "tarefas_alunos",
    motivo:
      "a planilha tem uma aba TAREFAS, mas ela alimenta a entidade genérica `tarefas` (tarefa do time, " +
      "opcionalmente ligada a aluno/lançamento) — não `tarefas_alunos` (tarefa POR TURMA). " +
      "sheetsProvider.toggleTarefa() lança \"não representável\" citando exatamente isso: \"não existe " +
      "aba de turmas nem de tarefas por aluno\".",
  },
  {
    entidade: "notas",
    motivo:
      "sheetsProvider.listNotas() sempre devolve lista vazia — não existe aba de notas na planilha; o " +
      "registro equivalente já migrado é a atividade do tipo `nota` dentro de ATIVIDADES.",
  },
  {
    entidade: "transcricoes",
    motivo:
      "sheetsProvider.listTranscricoes() sempre devolve lista vazia — não existe aba de transcrições " +
      "(o texto integral de uma call não cabe em célula de planilha).",
  },
  {
    entidade: "orcamentos",
    motivo:
      "sheetsProvider.listOrcamentos() sempre devolve lista vazia — a aba METAS guarda meta de " +
      "resultado (faturamento/lucro/vendas), não teto de gasto por categoria.",
  },
  {
    entidade: "conteudo_retencao",
    motivo:
      "sheetsProvider.getConteudo() sempre devolve `retencao: []` — a aba CONTEUDOS guarda o RESULTADO " +
      "agregado do conteúdo (retenção média), não a curva ponto a ponto.",
  },
  {
    entidade: "conteudo_pilares",
    motivo:
      "sheetsProvider.setPilar() lança \"não representável\" — a aba CONTEUDOS não tem colunas para " +
      "gancho/desenvolvimento/CTA; essa análise só existe depois de o conteúdo já estar no sistema.",
  },
  {
    entidade: "webhook_eventos",
    motivo:
      "sheetsProvider.listEventosWebhook() sempre devolve lista vazia — webhook é evento de gateway de " +
      "pagamento, e a planilha nunca recebeu webhook nenhum.",
  },
];

// ============================================================
// 4. As entidades MIGRÁVEIS, EM ORDEM DE DEPENDÊNCIA
// ============================================================
//
// A ordem abaixo foi montada lendo supabase/migrations/0001 a 0009 e
// listando toda `references` de cada `create table`. Ela é organizada em
// "camadas": uma entidade só pode aparecer depois de TODAS as entidades
// que ela referencia via `dependeDe`. `validarOrdemDeDependencia` (acima)
// checa isso em tempo de execução — se algum dia alguém reordenar o
// array errado, o script para na hora, antes de tocar em qualquer rede.
//
// Camada 0 — sem dependência de nenhuma outra entidade desta lista:
//   agrupamentos, produtos, afiliados, alunos, contas_bancarias, metas,
//   metas_financeiras, parametros_financeiros, despesas, perfis_sociais
//
// Camada 1 — depende só da camada 0:
//   lancamentos (produtos) · modulos (produtos) · movimentos_caixa
//   (contas_bancarias) · recebiveis (contas_bancarias) · pagaveis
//   (contas_bancarias) · conteudos (perfis_sociais) · atividades (alunos)
//   interacoes (alunos) · envios (alunos)
//
// Camada 2 — depende de itens da camada 0/1:
//   aulas (modulos + produtos) · tarefas (alunos + lancamentos) ·
//   reunioes (alunos + lancamentos) · matriculas (alunos + produtos +
//   lancamentos + afiliados) · importacoes (contas_bancarias +
//   movimentos_caixa) · conteudo_metricas (conteudos) · campanhas
//   (conteudos)
//
// Camada 3 — depende de itens da camada 2:
//   progresso_aulas (alunos + aulas + produtos) · comissoes (matriculas +
//   afiliados) · reembolsos (matriculas) · chargebacks (matriculas) ·
//   encontros (turmas — NÃO migrada, ver ENTIDADES_PULADAS; toda linha
//   desta entidade é recusada até `turmas` ganhar uma aba um dia)
// ============================================================

const ENTIDADES_MIGRAVEIS: DefinicaoEntidade[] = [
  // ---------------- camada 0 ----------------

  {
    entidade: "agrupamentos",
    aba: "AGRUPAMENTOS",
    dependeDe: [],
    ler: () => sheetsProvider.listAgrupamentos(),
    idOrigem: (a: Agrupamento) => a.id,
    // Chave natural: NOME. É cadastro do usuário (cor/ordem mudam sem trocar
    // de identidade), então o nome é o único campo estável entre execuções.
    converter: (a: Agrupamento): Conversao => {
      if (a.nome === "") return { recusa: "AGRUPAMENTOS: nome vazio — não dá para reconhecer o agrupamento sem nome." };
      return { linha: { nome: a.nome, cor: a.cor, ordem: a.ordem, ativo: a.ativo } };
    },
    chaveNatural: (l) => ({ nome: l.nome }),
  },

  {
    entidade: "produtos",
    aba: "PRODUTOS",
    dependeDe: [],
    ler: () => sheetsProvider.listProdutos(),
    idOrigem: (p: Produto) => p.id,
    // Chave natural: NOME. Não há SKU nem outro identificador de negócio na
    // planilha; nome de produto repetido seria um problema de cadastro do
    // dono, não algo que este script deva inventar critério para resolver.
    //
    // NOTA: `Produto.braco` e `Produto.categoria` existem no tipo de domínio
    // e supabase-db.ts até tenta gravá-los (`addProduto`), mas NENHUMA
    // migração (0001 a 0009) cria essas colunas em `public.produtos` — é uma
    // divergência já existente entre app e schema, fora do escopo deste
    // script ("não mexa... no app"). Incluir esses campos aqui faria TODO
    // insert de produto falhar com "column does not exist" — por isso ficam
    // de fora, migrando só o que o schema de verdade tem.
    converter: (p: Produto): Conversao => {
      if (p.nome === "") return { recusa: "PRODUTOS: nome vazio — não dá para reconhecer o produto sem nome." };
      return { linha: { nome: p.nome, tipo: p.tipo, preco_base: p.precoBase, ativo: p.ativo } };
    },
    chaveNatural: (l) => ({ nome: l.nome }),
  },

  {
    entidade: "afiliados",
    aba: "RESPONSAVEIS",
    dependeDe: [],
    ler: () => sheetsProvider.listAfiliados(),
    idOrigem: (a: Afiliado) => a.id,
    // Chave natural: NOME. Time comercial pequeno, um responsável por nome;
    // é o único campo de negócio estável no cadastro (comissão/meta mudam).
    converter: (a: Afiliado): Conversao => {
      if (a.nome === "") return { recusa: "RESPONSAVEIS: nome vazio — não dá para reconhecer o responsável sem nome." };
      return {
        linha: {
          nome: a.nome,
          braco: a.braco,
          pct_padrao: a.pctPadrao,
          ativo: a.ativo,
          meta_mensal: a.metaMensal ?? null,
          whatsapp: a.whatsapp ?? "",
          chave_pix: a.chavePix ?? "",
        },
      };
    },
    chaveNatural: (l) => ({ nome: l.nome }),
  },

  {
    entidade: "alunos",
    aba: "ALUNOS",
    dependeDe: [],
    ler: () => sheetsProvider.listAlunos(),
    idOrigem: (a: Aluno) => a.id,
    // Chave natural: NOME + TELEFONE (pedida explicitamente pelo enunciado).
    // Nome sozinho tem colisão real (dois "João Silva" diferentes);
    // telefone sozinho falha para quem cadastrou sem telefone. Juntos
    // identificam a MESMA pessoa entre execuções sem depender do id da
    // planilha, que muda a cada migração.
    //
    // `estagio_id` fica de propósito FORA da linha: o id do estágio na
    // planilha (ESTAGIOS_PLANILHA: "etapa-novo", "etapa-qualificado"...) não
    // corresponde a nenhuma linha real de `crm_estagios` no Postgres (ver
    // ENTIDADES_PULADAS acima) — gravar esse texto ali quebraria a FK, e
    // adivinhar uma correspondência por nome inventaria um vínculo que a
    // planilha não garante. `status_funil`, que É um enum e não uma FK,
    // continua migrando normalmente.
    converter: (a: Aluno): Conversao => {
      if (a.nome === "") return { recusa: "ALUNOS: nome vazio — não dá para reconhecer o aluno sem nome." };
      return {
        linha: {
          nome: a.nome,
          telefone: a.telefone,
          email: a.email,
          status_funil: a.statusFunil,
          origem: a.origem,
          observacoes: a.observacoes,
          ...(seDefinida(a.primeiroContato) ? { primeiro_contato: a.primeiroContato } : {}),
        },
      };
    },
    chaveNatural: (l) => ({ nome: l.nome, telefone: l.telefone }),
  },

  {
    entidade: "contas_bancarias",
    aba: "CONTAS",
    dependeDe: [],
    ler: () => sheetsProvider.listContasBancarias(),
    idOrigem: (c: ContaBancaria) => c.id,
    // Chave natural: NOME. "Itaú PJ", "Saldo Hotmart" — o dono não vai ter
    // duas contas com o mesmo nome de propósito.
    converter: (c: ContaBancaria): Conversao => {
      if (c.nome === "") return { recusa: "CONTAS: nome vazio — não dá para reconhecer a conta sem nome." };
      return {
        linha: {
          nome: c.nome,
          tipo: c.tipo,
          saldo_inicial: c.saldoInicial,
          ativa: c.ativa,
          braco: c.braco ?? null,
          ...(seDefinida(c.dataSaldoInicial) ? { data_saldo_inicial: c.dataSaldoInicial } : {}),
        },
      };
    },
    chaveNatural: (l) => ({ nome: l.nome }),
  },

  {
    entidade: "metas",
    aba: "METAS",
    dependeDe: [],
    ler: () => sheetsProvider.listMetas(),
    idOrigem: (m: Meta) => m.id,
    // Chave natural: (indicador, escopo, escopo_ref, período) — é EXATAMENTE
    // o índice único que supabase/migrations/0004_p1_caixa.sql já define
    // (`uq_metas_chave`), tratando escopo_ref nulo como "": reaproveitar a
    // mesma regra de unicidade do schema evita a chave natural do script
    // divergir silenciosamente da que o Postgres reconhece.
    converter: (m: Meta): Conversao => ({
      linha: {
        indicador: m.indicador,
        escopo: m.escopo,
        escopo_ref: m.escopoRef,
        periodo: m.periodo,
        valor: m.valor,
      },
    }),
    chaveNatural: (l) => ({
      indicador: l.indicador,
      escopo: l.escopo,
      escopo_ref: l.escopo_ref ?? "",
      periodo: l.periodo,
    }),
  },

  {
    entidade: "metas_financeiras",
    aba: "METAS",
    dependeDe: [],
    // Mesma aba de `metas`, mas é uma tabela DIFERENTE no Postgres
    // (supabase/migrations/0002_expansao.sql): subconjunto monetário
    // (só faturamento/lucro) que a própria sheetsProvider já filtra em
    // `listMetasFinanceiras()`. Migrar as duas não duplica nada: cada uma
    // escreve na sua tabela, do mesmo jeito que o app já faz em runtime
    // (`setMeta` grava em `metas`, `setMetaFinanceira` grava em
    // `metas_financeiras`, os dois a partir da mesma aba METAS).
    ler: () => sheetsProvider.listMetasFinanceiras(),
    idOrigem: (m: MetaFinanceira) => m.id,
    // Chave natural: (tipo, período) — o índice único de
    // supabase/migrations/0002_expansao.sql.
    converter: (m: MetaFinanceira): Conversao => ({
      linha: { tipo: m.tipo, periodo: m.periodo, alvo: m.alvo },
    }),
    chaveNatural: (l) => ({ tipo: l.tipo, periodo: l.periodo }),
  },

  {
    entidade: "parametros_financeiros",
    aba: "CONFIG",
    dependeDe: [],
    // `getParametrosFinanceiros()` sempre devolve UM objeto (célula vazia
    // vira 0/'', nunca ausência) — por isso a "leitura" aqui é uma lista de
    // um item só, para caber no mesmo motor genérico das demais entidades.
    ler: async () => [await sheetsProvider.getParametrosFinanceiros()],
    idOrigem: () => "config-planilha",
    // Chave natural: `singleton = true` — é LITERALMENTE a única linha que
    // a tabela pode ter (uq_parametros_financeiros_singleton, no 0004).
    converter: (p: ParametrosFinanceiros): Conversao => ({
      linha: {
        singleton: true,
        aliquota_imposto: p.aliquotaImposto,
        regime_tributario: p.regimeTributario,
        saldo_inicial_caixa: p.saldoInicialCaixa,
        custo_fixo_mensal: p.custoFixoMensal,
        reserva_minima_caixa: p.reservaMinimaCaixa,
        ...(seDefinida(p.dataSaldoInicial) ? { data_saldo_inicial: p.dataSaldoInicial } : {}),
      },
    }),
    chaveNatural: () => ({ singleton: true }),
  },

  {
    entidade: "despesas",
    aba: "DESPESAS + INVESTIMENTO",
    dependeDe: [],
    ler: () => sheetsProvider.listDespesas(),
    idOrigem: (d: Despesa) => d.id,
    // Chave natural: (data, descrição, valor, categoria) — a mesma despesa
    // relançada duas vezes na planilha (mesmo dia, mesmo valor, mesma
    // descrição) é ambígua mesmo para o dono; o script não tenta desempatar
    // além disso, só evita duplicar a MESMA execução de leitura.
    converter: (d: Despesa): Conversao => {
      if (d.descricao === "" || d.valor === 0) {
        return { recusa: `DESPESAS: descrição vazia ou valor zero (descrição="${d.descricao}", valor=${d.valor}).` };
      }
      return {
        linha: {
          descricao: d.descricao,
          categoria: d.categoria,
          tipo: d.tipo,
          valor: d.valor,
          ...(seDefinida(d.data) ? { data: d.data } : {}),
        },
      };
    },
    chaveNatural: (l) => ({ data: l.data, descricao: l.descricao, valor: l.valor, categoria: l.categoria }),
  },

  {
    entidade: "perfis_sociais",
    aba: "CONTEUDOS",
    dependeDe: [],
    // Não existe aba de perfis: sheetsProvider.listPerfisSociais() DEDUZ o
    // cadastro a partir de quem publicou algo em CONTEUDOS (ver
    // `perfisDeConteudos`, em sheets-db.ts). `PerfilSocial.id` já é o HANDLE
    // (não um id de planilha de verdade) — e é esse mesmo handle que
    // `Conteudo.perfilId` carrega, então os dois lados batem sem trabalho
    // extra no mapa de ids.
    ler: () => sheetsProvider.listPerfisSociais(),
    idOrigem: (p: PerfilSocial) => p.id,
    // Chave natural: (plataforma, handle) — mesma dedução usada internamente
    // por `perfisDeConteudos` para não duplicar o mesmo perfil.
    converter: (p: PerfilSocial): Conversao => {
      if (p.handle === "") return { recusa: "CONTEUDOS: perfil sem handle — não dá para cadastrar um perfil social sem identificador." };
      return { linha: { plataforma: p.plataforma, handle: p.handle, seguidores: p.seguidores, conectado: p.conectado } };
    },
    chaveNatural: (l) => ({ plataforma: l.plataforma, handle: l.handle }),
  },

  // ---------------- camada 1 ----------------

  {
    entidade: "lancamentos",
    aba: "LANCAMENTOS",
    dependeDe: ["produtos"],
    ler: () => sheetsProvider.listLancamentos(),
    idOrigem: (l: Lancamento) => l.id,
    // Chave natural: NOME. "Lançamento de outubro" não se repete de
    // propósito; é o rótulo que o dono usa para identificar a janela.
    converter: (l: Lancamento, mapa: MapaIds): Conversao => {
      if (l.nome === "") return { recusa: "LANCAMENTOS: nome vazio — não dá para reconhecer o lançamento sem nome." };
      if (l.inicio === "") {
        return { recusa: "LANCAMENTOS: sem data de início — 'inicio' é obrigatório no Postgres (sem default)." };
      }
      const produto = refObrigatoria(mapa, "produtos", l.produtoId, "LANCAMENTOS");
      if (!produto.ok) return { recusa: produto.motivo };
      return {
        linha: {
          nome: l.nome,
          produto_id: produto.id,
          inicio: l.inicio,
          fim: l.fim || null,
          status: l.status,
          meta_faturamento: l.metaFaturamento,
          descricao: l.descricao,
        },
      };
    },
    chaveNatural: (l) => ({ nome: l.nome }),
  },

  {
    entidade: "modulos",
    aba: "MODULOS",
    dependeDe: ["produtos"],
    ler: () => sheetsProvider.listModulos(),
    idOrigem: (m: Modulo) => m.id,
    // Chave natural: (produto, ordem). Módulo é a trilha de um produto; a
    // posição dentro dessa trilha não se repete para o mesmo produto — nome
    // sozinho falharia para módulos sem título preenchido.
    converter: (m: Modulo, mapa: MapaIds): Conversao => {
      const produto = refObrigatoria(mapa, "produtos", m.produtoId, "MODULOS");
      if (!produto.ok) return { recusa: produto.motivo };
      return { linha: { produto_id: produto.id, nome: m.nome, ordem: m.ordem, descricao: m.descricao } };
    },
    chaveNatural: (l) => ({ produto_id: l.produto_id, ordem: l.ordem }),
  },

  {
    entidade: "movimentos_caixa",
    aba: "MOVIMENTOS + INVESTIMENTO",
    dependeDe: ["contas_bancarias"],
    ler: () => sheetsProvider.listMovimentosCaixa(),
    idOrigem: (m: MovimentoCaixa) => m.id,
    // Chave natural: (descrição, data de caixa, valor, direção, categoria) —
    // não há um identificador de negócio melhor num extrato; esta combinação
    // já é o que `importarExtrato` usa como proxy de "mesmo lançamento" em
    // outros pontos do sistema (a impressão digital de verdade só existe
    // para linhas que passaram por IMPORTACOES).
    converter: (m: MovimentoCaixa, mapa: MapaIds): Conversao => {
      if (m.dataCompetencia === "" || m.dataCaixa === "") {
        return { recusa: "MOVIMENTOS: data de competência ou data de caixa vazia — as duas são obrigatórias e sem default." };
      }
      const conta = refOpcional(mapa, "contas_bancarias", m.contaId, "MOVIMENTOS");
      if (!conta.ok) return { recusa: conta.motivo };
      return {
        linha: {
          direcao: m.direcao,
          categoria: m.categoria,
          conta_id: conta.id,
          descricao: m.descricao,
          valor: m.valor,
          data_competencia: m.dataCompetencia,
          data_caixa: m.dataCaixa,
          status: m.status,
          braco: m.braco ?? null,
          origem: m.origem ?? "manual",
          // Texto de referência solto (não é FK — ver 0004_p1_caixa.sql),
          // então mantém o id ORIGINAL da planilha como estava: converter
          // para um uuid inventaria uma correspondência que pode nem existir
          // (a entidade de origem pode nunca ter sido migrada).
          origem_id: m.origemId ?? null,
        },
      };
    },
    chaveNatural: (l) => ({ descricao: l.descricao, data_caixa: l.data_caixa, valor: l.valor, direcao: l.direcao, categoria: l.categoria }),
  },

  {
    entidade: "recebiveis",
    aba: "RECEBIVEIS",
    dependeDe: ["contas_bancarias"],
    ler: () => sheetsProvider.listRecebiveis(),
    idOrigem: (r: Recebivel) => r.id,
    // Chave natural: (descrição, vencimento, valor, parcela, total de
    // parcelas) — identifica a MESMA parcela de uma venda entre execuções.
    converter: (r: Recebivel): Conversao => {
      if (r.vencimento === "") return { recusa: "RECEBIVEIS: vencimento vazio — é obrigatório e sem default no Postgres." };
      // `contaId` sempre vem `null` do provider de planilha (ver comentário
      // em `linhaParaRecebivel`, sheets/mapear.ts: "só existe se houver o
      // movimento correspondente em MOVIMENTOS"), então não há referência
      // para resolver aqui — a coluna é opcional e fica null.
      return {
        linha: {
          origem: r.origem,
          origem_id: r.origemId, // texto solto, não FK — mesma razão do movimento
          descricao: r.descricao,
          valor: r.valor,
          vencimento: r.vencimento,
          data_recebimento: r.dataRecebimento,
          status: r.status,
          gateway: r.gateway,
          dias_liberacao: r.diasLiberacao,
          parcela: r.parcela,
          total_parcelas: r.totalParcelas,
          braco: r.braco ?? null,
          conta_id: null,
        },
      };
    },
    chaveNatural: (l) => ({ descricao: l.descricao, vencimento: l.vencimento, valor: l.valor, parcela: l.parcela, total_parcelas: l.total_parcelas }),
  },

  {
    entidade: "pagaveis",
    aba: "DESPESAS",
    dependeDe: ["contas_bancarias"],
    // MESMA aba de `despesas` (a DESPESAS aba lida por outra lente — ver
    // `sheetsProvider.listPagaveis()`, que usa `linhaParaPagavel` em vez de
    // `linhaParaDespesa`), mas é uma tabela DIFERENTE no Postgres
    // (supabase/migrations/0004_p1_caixa.sql): `despesas` é o DRE por
    // competência, `pagaveis` é a conta a pagar por caixa (status,
    // vencimento, fornecedor). Não é duplicação: as duas tabelas existem
    // porque o produto separa os dois conceitos.
    ler: () => sheetsProvider.listPagaveis(),
    idOrigem: (p: Pagavel) => p.id,
    // Chave natural: (descrição, vencimento, valor, fornecedor).
    converter: (p: Pagavel): Conversao => {
      if (p.vencimento === "") return { recusa: "DESPESAS (pagáveis): vencimento vazio — é obrigatório e sem default no Postgres." };
      // `contaId` também sempre vem `null` daqui (mesmo motivo de recebíveis:
      // "Forma de pagamento" só sugere a conta, não a define).
      return {
        linha: {
          categoria: p.categoria,
          fornecedor: p.fornecedor,
          descricao: p.descricao,
          valor: p.valor,
          vencimento: p.vencimento,
          data_pagamento: p.dataPagamento,
          status: p.status,
          tipo: p.tipo,
          braco: p.braco ?? null,
          origem: p.origem ?? "despesa",
          origem_id: p.origemId ?? null,
          conta_id: null,
        },
      };
    },
    chaveNatural: (l) => ({ descricao: l.descricao, vencimento: l.vencimento, valor: l.valor, fornecedor: l.fornecedor }),
  },

  {
    entidade: "conteudos",
    aba: "CONTEUDOS",
    dependeDe: ["perfis_sociais"],
    ler: () => sheetsProvider.listConteudos(),
    idOrigem: (c: ConteudoView) => c.id,
    // Chave natural: (perfil, título, data de publicação) — não há url em
    // toda linha, então o combo abaixo é o que resta como identificador.
    converter: (c: ConteudoView, mapa: MapaIds): Conversao => {
      const perfil = refObrigatoria(mapa, "perfis_sociais", c.perfilId, "CONTEUDOS");
      if (!perfil.ok) return { recusa: perfil.motivo };
      if (c.titulo === "") return { recusa: "CONTEUDOS: título vazio — não dá para reconhecer o conteúdo sem título." };
      return {
        linha: {
          perfil_id: perfil.id,
          tipo: c.tipo,
          titulo: c.titulo,
          url: c.url,
          duracao_seg: c.duracaoSeg,
          roteiro: c.roteiro,
          ...(seDefinida(c.publicadoEm) ? { publicado_em: c.publicadoEm } : {}),
        },
      };
    },
    chaveNatural: (l) => ({ perfil_id: l.perfil_id, titulo: l.titulo, publicado_em: l.publicado_em }),
  },

  {
    entidade: "atividades",
    aba: "ATIVIDADES",
    dependeDe: ["alunos"],
    ler: () => sheetsProvider.listAtividades(),
    idOrigem: (a: Atividade) => a.id,
    // Chave natural: (aluno, tipo, título, data) — a mesma anotação relançada
    // duas vezes na planilha (mesmo aluno/tipo/título/instante) é ambígua
    // mesmo para o dono; o script só evita duplicar a MESMA leitura.
    converter: (a: Atividade, mapa: MapaIds): Conversao => {
      const aluno = refObrigatoria(mapa, "alunos", a.alunoId, "ATIVIDADES");
      if (!aluno.ok) return { recusa: aluno.motivo };
      return {
        linha: {
          aluno_id: aluno.id,
          tipo: a.tipo,
          titulo: a.titulo,
          detalhe: a.detalhe,
          ...(seDefinida(a.data) ? { data: a.data } : {}),
        },
      };
    },
    chaveNatural: (l) => ({ aluno_id: l.aluno_id, tipo: l.tipo, titulo: l.titulo, data: l.data }),
  },

  {
    entidade: "interacoes",
    aba: "INTERACOES",
    dependeDe: ["alunos"],
    ler: () => sheetsProvider.listInteracoes(),
    idOrigem: (i: Interacao) => i.id,
    // Chave natural: ID_EXTERNO — pedida explicitamente pelo enunciado, e é
    // literalmente o índice único parcial que supabase/migrations/
    // 0009_mentoros_tabelas_faltantes.sql já cria em `interacoes` (o mesmo
    // WhatsApp que gerou este id é quem impede duplicar a mensagem quando o
    // agente local reconecta e reenvia o histórico).
    converter: (i: Interacao, mapa: MapaIds): Conversao => {
      if (i.idExterno === "") {
        return { recusa: "INTERACOES: id_externo vazio — sem ele não dá para garantir que esta mensagem não é um reenvio já gravado." };
      }
      const aluno = refObrigatoria(mapa, "alunos", i.alunoId, "INTERACOES");
      if (!aluno.ok) return { recusa: aluno.motivo };
      if (i.quando === "") return { recusa: "INTERACOES: 'quando' vazio — é obrigatório e sem default no Postgres." };
      return {
        linha: {
          aluno_id: aluno.id,
          canal: i.canal,
          direcao: i.direcao,
          texto: i.texto,
          quando: i.quando,
          id_externo: i.idExterno,
          tipo_midia: i.tipoMidia,
          nome_exibicao: i.nomeExibicao,
          telefone: i.telefone,
        },
      };
    },
    chaveNatural: (l) => ({ id_externo: l.id_externo }),
  },

  {
    entidade: "envios",
    aba: "ENVIOS",
    dependeDe: ["alunos"],
    ler: () => sheetsProvider.listEnvios(),
    idOrigem: (e: Envio) => e.id,
    // Chave natural: (aluno, texto, autorizado em). `id_externo` NÃO serve
    // aqui (ao contrário de interações): a fila normal tem várias linhas com
    // `id_externo = ""` simultâneas (mensagem aprovada mas ainda não
    // enviada) — ver comentário de `envios` em
    // supabase/migrations/0009_mentoros_tabelas_faltantes.sql. O instante de
    // aprovação é o campo mais estável que resta para identificar o MESMO
    // envio entre execuções.
    converter: (e: Envio, mapa: MapaIds): Conversao => {
      const aluno = refObrigatoria(mapa, "alunos", e.alunoId, "ENVIOS");
      if (!aluno.ok) return { recusa: aluno.motivo };
      return {
        linha: {
          aluno_id: aluno.id,
          telefone: e.telefone,
          texto: e.texto,
          autorizado_por: e.autorizadoPor,
          status: e.status,
          enviado_em: e.enviadoEm || null,
          id_externo: e.idExterno,
          erro: e.erro,
          ...(seDefinida(e.autorizadoEm) ? { autorizado_em: e.autorizadoEm } : {}),
        },
      };
    },
    chaveNatural: (l) => ({ aluno_id: l.aluno_id, texto: l.texto, autorizado_em: l.autorizado_em }),
  },

  // ---------------- camada 2 ----------------

  {
    entidade: "aulas",
    aba: "AULAS",
    dependeDe: ["modulos", "produtos"],
    ler: () => sheetsProvider.listAulas(),
    idOrigem: (a: Aula) => a.id,
    // Chave natural: (módulo, ordem) — mesma lógica de `modulos`: a posição
    // dentro da trilha de um módulo não se repete.
    converter: (a: Aula, mapa: MapaIds): Conversao => {
      const modulo = refObrigatoria(mapa, "modulos", a.moduloId, "AULAS");
      if (!modulo.ok) return { recusa: modulo.motivo };
      const produto = refObrigatoria(mapa, "produtos", a.produtoId, "AULAS");
      if (!produto.ok) return { recusa: produto.motivo };
      return {
        linha: {
          modulo_id: modulo.id,
          produto_id: produto.id,
          titulo: a.titulo,
          ordem: a.ordem,
          duracao_min: a.duracaoMin,
          tipo: a.tipo,
        },
      };
    },
    chaveNatural: (l) => ({ modulo_id: l.modulo_id, ordem: l.ordem }),
  },

  {
    entidade: "tarefas",
    aba: "TAREFAS",
    dependeDe: ["alunos", "lancamentos"],
    ler: () => sheetsProvider.listTarefas(),
    idOrigem: (t: Tarefa) => t.id,
    // Chave natural: (título, prazo, responsável) — aluno/lançamento são
    // opcionais na tarefa; título+prazo+responsável já é o que a tela usa
    // para o dono reconhecer "essa tarefa já existe".
    converter: (t: Tarefa, mapa: MapaIds): Conversao => {
      if (t.titulo === "") return { recusa: "TAREFAS: título vazio — não dá para reconhecer a tarefa sem título." };
      const aluno = refOpcional(mapa, "alunos", t.alunoId, "TAREFAS");
      if (!aluno.ok) return { recusa: aluno.motivo };
      const lancamento = refOpcional(mapa, "lancamentos", t.lancamentoId, "TAREFAS");
      if (!lancamento.ok) return { recusa: lancamento.motivo };
      return {
        linha: {
          titulo: t.titulo,
          detalhe: t.detalhe,
          aluno_id: aluno.id,
          lancamento_id: lancamento.id,
          responsavel: t.responsavel,
          prazo: t.prazo,
          prioridade: t.prioridade,
          status: t.status,
        },
      };
    },
    chaveNatural: (l) => ({ titulo: l.titulo, prazo: l.prazo, responsavel: l.responsavel }),
  },

  {
    entidade: "reunioes",
    aba: "REUNIOES",
    dependeDe: ["alunos", "lancamentos"],
    ler: () => sheetsProvider.listReunioes(),
    idOrigem: (r: Reuniao) => r.id,
    // Chave natural: (título, início) — o instante de início não se repete
    // para reuniões diferentes na prática.
    converter: (r: Reuniao, mapa: MapaIds): Conversao => {
      if (r.titulo === "") return { recusa: "REUNIOES: título vazio — não dá para reconhecer a reunião sem título." };
      if (r.inicio === "") return { recusa: "REUNIOES: 'inicio' vazio — é obrigatório e sem default no Postgres." };
      const aluno = refOpcional(mapa, "alunos", r.alunoId, "REUNIOES");
      if (!aluno.ok) return { recusa: aluno.motivo };
      const lancamento = refOpcional(mapa, "lancamentos", r.lancamentoId, "REUNIOES");
      if (!lancamento.ok) return { recusa: lancamento.motivo };
      // `turmaId` sempre vem `null` da leitura da planilha (REUNIOES não tem
      // coluna de turma — ver `linhaParaReuniao`, sheets/mapear.ts), então
      // não há referência para resolver: fica null direto, sem chamada a
      // `refOpcional`.
      return {
        linha: {
          titulo: r.titulo,
          inicio: r.inicio,
          fim: r.fim,
          com_quem: r.comQuem,
          aluno_id: aluno.id,
          lancamento_id: lancamento.id,
          turma_id: null,
          status: r.status,
          link: r.link,
          google_event_id: r.googleEventId,
        },
      };
    },
    chaveNatural: (l) => ({ titulo: l.titulo, inicio: l.inicio }),
  },

  {
    entidade: "matriculas",
    aba: "VENDAS",
    dependeDe: ["alunos", "produtos", "lancamentos", "afiliados"],
    ler: () => sheetsProvider.listMatriculas(),
    idOrigem: (m: Matricula) => m.id,
    // Chave natural: (aluno, produto, data, valor) — a combinação que
    // identifica "esta venda" sem depender do id da planilha.
    //
    // ATUALIZADO (2026-08): VENDAS ganhou a coluna ID_Aluno — sheets-db.ts
    // resolve `Matricula.alunoId` direto da linha agora. A recusa por
    // referência obrigatória vazia deixou de ser universal: só é recusada a
    // linha cujo ID_Aluno está de fato vazio na planilha (venda antiga,
    // lançada antes da coluna existir, ou nunca vinculada a um cadastro) ou
    // que aponta para um id que não foi migrado/recusado em "alunos" — os
    // dois casos que `refObrigatoria` já distingue no motivo da recusa. Isso
    // não é falha do script: é a conferência final (regra 4) mostrando, linha
    // a linha, exatamente qual venda ainda não tem dono — não mais "nenhuma
    // matrícula migra".
    converter: (m: Matricula, mapa: MapaIds): Conversao => {
      const aluno = refObrigatoria(mapa, "alunos", m.alunoId, "VENDAS");
      if (!aluno.ok) return { recusa: aluno.motivo };
      const produto = refObrigatoria(mapa, "produtos", m.produtoId, "VENDAS");
      if (!produto.ok) return { recusa: produto.motivo };
      const lancamento = refOpcional(mapa, "lancamentos", m.lancamentoId, "VENDAS");
      if (!lancamento.ok) return { recusa: lancamento.motivo };
      const afiliado = refOpcional(mapa, "afiliados", m.afiliadoId, "VENDAS");
      if (!afiliado.ok) return { recusa: afiliado.motivo };
      if (m.data === "") return { recusa: "VENDAS: data vazia — é obrigatória e sem default no Postgres." };
      return {
        linha: {
          aluno_id: aluno.id,
          produto_id: produto.id,
          lancamento_id: lancamento.id,
          afiliado_id: afiliado.id,
          valor: m.valor,
          forma_pgto: m.formaPgto,
          valor_liquido: m.valorLiquido,
          data: m.data,
          status_pagamento: m.statusPagamento,
          origem: m.origem,
          is_upsell: m.isUpsell,
          braco: m.braco ?? null,
          gateway: m.gateway ?? "manual",
          valor_bruto: m.valorBruto ?? m.valor,
          taxa_gateway: m.taxaGateway ?? 0,
          data_liberacao: m.dataLiberacao ?? null,
          utm_source: m.utmSource ?? "",
          utm_campaign: m.utmCampaign ?? "",
        },
      };
    },
    chaveNatural: (l) => ({ aluno_id: l.aluno_id, produto_id: l.produto_id, data: l.data, valor: l.valor }),
  },

  {
    entidade: "importacoes",
    aba: "IMPORTACOES",
    dependeDe: ["contas_bancarias", "movimentos_caixa"],
    ler: () => sheetsProvider.listImportacoes(),
    idOrigem: (r: RegistroImportacao) => r.id,
    // Chave natural: IMPRESSAO_DIGITAL — pedida explicitamente pelo
    // enunciado, e é o índice único (`uq_importacoes_impressao_digital`) que
    // supabase/migrations/0009_mentoros_tabelas_faltantes.sql já cria: é
    // literalmente o campo desenhado para impedir reimportar o mesmo
    // lançamento de extrato duas vezes.
    converter: (r: RegistroImportacao, mapa: MapaIds): Conversao => {
      if (r.impressaoDigital === "") {
        return { recusa: "IMPORTACOES: impressão digital vazia — sem ela não dá para garantir que este lançamento não é uma reimportação." };
      }
      if (r.data === "") return { recusa: "IMPORTACOES: data vazia — é obrigatória e sem default no Postgres." };
      const conta = refOpcional(mapa, "contas_bancarias", r.contaId, "IMPORTACOES");
      if (!conta.ok) return { recusa: conta.motivo };
      const movimento = refOpcional(mapa, "movimentos_caixa", r.movimentoId, "IMPORTACOES");
      if (!movimento.ok) return { recusa: movimento.motivo };
      return {
        linha: {
          impressao_digital: r.impressaoDigital,
          data: r.data,
          descricao: r.descricao,
          valor: r.valor,
          tipo: r.tipo,
          documento: r.documento,
          origem: r.origem,
          conta_id: conta.id,
          movimento_id: movimento.id,
          ...(seDefinida(r.importadoEm) ? { importado_em: r.importadoEm } : {}),
        },
      };
    },
    chaveNatural: (l) => ({ impressao_digital: l.impressao_digital }),
  },

  {
    entidade: "conteudo_metricas",
    aba: "CONTEUDOS",
    dependeDe: ["conteudos"],
    // A planilha guarda UMA foto atual por conteúdo (não uma série
    // histórica) — `sheetsProvider.listConteudos()` já embute essa foto em
    // `.metrica`. Por isso `ler()` reaproveita a mesma leitura de
    // `conteudos` em vez de uma aba própria (não existe aba própria).
    ler: () => sheetsProvider.listConteudos(),
    idOrigem: (c: ConteudoView) => c.id,
    converter: (c: ConteudoView, mapa: MapaIds): Conversao => {
      const conteudo = refObrigatoria(mapa, "conteudos", c.id, "CONTEUDOS (métrica)");
      if (!conteudo.ok) return { recusa: conteudo.motivo };
      if (!c.metrica) {
        return { recusa: "CONTEUDOS: sem bloco de métricas para este conteúdo." };
      }
      return {
        linha: {
          conteudo_id: conteudo.id,
          views: c.metrica.views,
          likes: c.metrica.likes,
          comentarios: c.metrica.comentarios,
          compartilhamentos: c.metrica.compartilhamentos,
          salvamentos: c.metrica.salvamentos,
          alcance: c.metrica.alcance,
          tempo_medio_seg: c.metrica.tempoMedioSeg,
          retencao_media: c.metrica.retencaoMedia,
          ...(seDefinida(c.metrica.coletadoEm) ? { coletado_em: c.metrica.coletadoEm } : {}),
        },
      };
    },
    // Chave natural: só CONTEUDO_ID. A planilha não tem uma "data de coleta"
    // de verdade (é sempre a foto de agora); por isso a regra de idempotência
    // aqui é "já existe UMA métrica para este conteúdo?", não uma comparação
    // por instante — rodar duas vezes não empilha fotos repetidas.
    chaveNatural: (l) => ({ conteudo_id: l.conteudo_id }),
  },

  {
    entidade: "campanhas",
    aba: "CAMPANHAS",
    dependeDe: ["conteudos"],
    ler: () => sheetsProvider.listCampanhas(),
    idOrigem: (c: Campanha) => c.id,
    // Chave natural: (nome, início) — campanha com o mesmo nome relançada no
    // mesmo dia é o caso raro que o dono precisaria desambiguar manualmente.
    converter: (c: Campanha, mapa: MapaIds): Conversao => {
      if (c.nome === "") return { recusa: "CAMPANHAS: nome vazio — não dá para reconhecer a campanha sem nome." };
      const conteudo = refOpcional(mapa, "conteudos", c.conteudoId, "CAMPANHAS");
      if (!conteudo.ok) return { recusa: conteudo.motivo };
      return {
        linha: {
          nome: c.nome,
          tipo: c.tipo,
          canal: c.canal,
          objetivo: c.objetivo,
          orcamento: c.orcamento,
          fim: c.fim,
          conteudo_id: conteudo.id,
          ...(seDefinida(c.inicio) ? { inicio: c.inicio } : {}),
        },
      };
    },
    chaveNatural: (l) => ({ nome: l.nome, inicio: l.inicio }),
  },

  // ---------------- camada 3 ----------------

  {
    entidade: "progresso_aulas",
    aba: "PROGRESSO",
    dependeDe: ["alunos", "aulas", "produtos"],
    ler: () => sheetsProvider.listProgresso(),
    idOrigem: (p: ProgressoAula) => p.id,
    // Chave natural: (aluno, aula) — é LITERALMENTE o `unique (aluno_id,
    // aula_id)` que supabase/migrations/0009_mentoros_tabelas_faltantes.sql
    // já declara ("uma linha por aluno por aula").
    converter: (p: ProgressoAula, mapa: MapaIds): Conversao => {
      const aluno = refObrigatoria(mapa, "alunos", p.alunoId, "PROGRESSO");
      if (!aluno.ok) return { recusa: aluno.motivo };
      const aula = refObrigatoria(mapa, "aulas", p.aulaId, "PROGRESSO");
      if (!aula.ok) return { recusa: aula.motivo };
      const produto = refObrigatoria(mapa, "produtos", p.produtoId, "PROGRESSO");
      if (!produto.ok) return { recusa: produto.motivo };
      return {
        linha: {
          aluno_id: aluno.id,
          aula_id: aula.id,
          produto_id: produto.id,
          concluida: p.concluida,
          concluida_em: p.concluidaEm,
          minutos_assistidos: p.minutosAssistidos,
        },
      };
    },
    chaveNatural: (l) => ({ aluno_id: l.aluno_id, aula_id: l.aula_id }),
  },

  {
    entidade: "comissoes",
    aba: "VENDAS (coluna Comissao)",
    dependeDe: ["matriculas", "afiliados"],
    // Não existe aba própria: a comissão vive na coluna "Comissao" de
    // VENDAS. `dataset()` já monta a lista com o afiliado resolvido pelo
    // nome (`montarComissoes`, em sheets-db.ts).
    ler: async () => (await sheetsProvider.dataset()).comissoes,
    idOrigem: (c: Comissao) => c.id,
    // Chave natural: (matrícula, afiliado, data, valor).
    //
    // Em cascata com `matriculas` (ver comentário acima): comissão de uma
    // venda cujo ID_Aluno está vazio ou não resolve em ALUNOS é recusada
    // aqui porque a matrícula dela também foi — `refObrigatoria` devolve o
    // motivo herdado, não um problema novo desta entidade.
    converter: (c: Comissao, mapa: MapaIds): Conversao => {
      const matricula = refObrigatoria(mapa, "matriculas", c.matriculaId, "VENDAS (comissão)");
      if (!matricula.ok) return { recusa: matricula.motivo };
      const afiliado = refObrigatoria(mapa, "afiliados", c.afiliadoId, "VENDAS (comissão)");
      if (!afiliado.ok) return { recusa: afiliado.motivo };
      return {
        linha: { matricula_id: matricula.id, afiliado_id: afiliado.id, pct: c.pct, valor: c.valor, data: c.data },
      };
    },
    chaveNatural: (l) => ({ matricula_id: l.matricula_id, afiliado_id: l.afiliado_id, data: l.data, valor: l.valor }),
  },

  {
    entidade: "reembolsos",
    aba: "VENDAS (Status = reembolsada)",
    dependeDe: ["matriculas"],
    // Não existe aba própria: o reembolso é RECONSTRUÍDO a partir do
    // `Status` da venda (`montarReembolsos`, em sheets-db.ts) — a mesma
    // limitação documentada lá (perde motivo e data exata do estorno).
    ler: async () => (await sheetsProvider.dataset()).reembolsos,
    idOrigem: (r: Reembolso) => r.id,
    // Chave natural: (matrícula, data, valor). Em cascata com `matriculas`
    // pelo mesmo motivo de `comissoes`.
    converter: (r: Reembolso, mapa: MapaIds): Conversao => {
      const matricula = refObrigatoria(mapa, "matriculas", r.matriculaId, "VENDAS (reembolso)");
      if (!matricula.ok) return { recusa: matricula.motivo };
      return { linha: { matricula_id: matricula.id, valor: r.valor, data: r.data, motivo: r.motivo } };
    },
    chaveNatural: (l) => ({ matricula_id: l.matricula_id, data: l.data, valor: l.valor }),
  },

  {
    entidade: "chargebacks",
    aba: "CHARGEBACKS",
    dependeDe: ["matriculas"],
    ler: () => sheetsProvider.listChargebacks(),
    idOrigem: (c: Chargeback) => c.id,
    // Chave natural: (matrícula, data, valor). Também em cascata com
    // `matriculas` pelo mesmo motivo de `comissoes`/`reembolsos` — o
    // `matricula_id` de CHARGEBACKS vem do `ID_Venda` da planilha (ver
    // `linhaParaChargeback`, sheets/mapear.ts).
    converter: (c: Chargeback, mapa: MapaIds): Conversao => {
      const matricula = refObrigatoria(mapa, "matriculas", c.matriculaId, "CHARGEBACKS");
      if (!matricula.ok) return { recusa: matricula.motivo };
      if (c.data === "") return { recusa: "CHARGEBACKS: data vazia — é obrigatória e sem default no Postgres." };
      return {
        linha: {
          matricula_id: matricula.id,
          valor: c.valor,
          data: c.data,
          data_resolucao: c.dataResolucao,
          motivo: c.motivo,
          status: c.status,
          gateway: c.gateway,
          detalhe: c.detalhe,
          braco: c.braco ?? null,
        },
      };
    },
    chaveNatural: (l) => ({ matricula_id: l.matricula_id, data: l.data, valor: l.valor }),
  },

  {
    entidade: "encontros",
    aba: "ENCONTROS",
    dependeDe: ["turmas"], // "turmas" NÃO está em ENTIDADES_MIGRAVEIS (ver ENTIDADES_PULADAS):
    // toda tentativa de resolver `turma_id` falha, então toda linha desta
    // entidade é recusada, sempre, até `turmas` ganhar uma aba na planilha.
    // O nome continua listado em `dependeDe` porque a dependência É REAL no
    // schema (encontros.turma_id not null) — só não tem como ser satisfeita
    // hoje. `validarOrdemDeDependencia` não quebra por causa disso: ela
    // checa a ORDEM entre entidades DA LISTA MIGRÁVEL, e "turmas" pulada não
    // entra nessa lista para começo de conversa (ver `principal()`, que
    // valida só `ENTIDADES_MIGRAVEIS`).
    ler: () => sheetsProvider.listEncontros(),
    idOrigem: (e: Encontro) => e.id,
    // Chave natural: (turma, título, data).
    converter: (e: Encontro, mapa: MapaIds): Conversao => {
      const turma = refObrigatoria(mapa, "turmas", e.turmaId, "ENCONTROS");
      if (!turma.ok) {
        return {
          recusa: `${turma.motivo} "turmas" está na lista de entidades PULADAS (sem aba na planilha) — ` +
            "nenhum encontro consegue ser migrado enquanto isso não mudar.",
        };
      }
      if (e.data === "") return { recusa: "ENCONTROS: data vazia — é obrigatória e sem default no Postgres." };
      return { linha: { turma_id: turma.id, titulo: e.titulo, data: e.data, presentes: e.presentes } };
    },
    chaveNatural: (l) => ({ turma_id: l.turma_id, titulo: l.titulo, data: l.data }),
  },
];

export { ENTIDADES_MIGRAVEIS };

// ============================================================
// 5. Conferência final — o coração do script (regra 4)
// ============================================================

export interface LinhaConferencia {
  entidade: string;
  planilha: number;
  postgres: number;
  /** Quantas das `planilha` linhas eram duplicata na origem — ver
   *  `ResultadoEntidade.duplicadasNaOrigem`. Descontada de `bate` porque o
   *  Postgres corretamente guardou uma só cópia de cada. */
  duplicadas: number;
  bate: boolean;
}

/**
 * Monta a tabela de conferência: para cada entidade migrada (não pulada),
 * "quantas linhas a planilha tinha" contra "quantas existem hoje no
 * Postgres". `postgres` vem de `banco.contar`, então reflete o TOTAL da
 * tabela — não só o que este script inseriu agora — o que é o correto:
 * numa segunda execução idempotente, `inseridas = 0` mas o total já bate
 * desde a primeira vez.
 *
 * A FÓRMULA DE `bate` E POR QUE ELA DESCONTA DUAS COISAS
 * ---------------------------------------------------------
 * `bate = lidas - duplicadasNaOrigem - recusas.length === postgres`.
 *
 * As duas subtrações existem porque nem toda "linha da planilha que não virou
 * linha no Postgres" é uma falha:
 *   - `duplicadasNaOrigem` é a mesma linha de negócio repetida na fonte (lead
 *     duplicado, linha de teste); o Postgres guarda UMA cópia de propósito
 *     (regra 1, idempotência) — contar as duas planilha-linhas contra uma
 *     postgres-linha faria um relatório correto gritar "DIVERGE".
 *   - `recusas.length` é linha que o script se RECUSOU a escrever, na cara
 *     dura, porque escrevê-la exigiria inventar dado (regra 2) — ela nunca
 *     tentou virar linha no Postgres, então não escrever ela não é migração
 *     incompleta, é a regra funcionando.
 * Sobrando diferença depois de descontar as duas, sim, é problema de
 * verdade: alguma linha que DEVERIA ter sido gravada (nem duplicata, nem
 * recusada) não está lá — aí `bate` é `false` e é isso que deve acender o
 * alarme.
 */
export async function montarConferencia(
  resultados: ResultadoEntidade[],
  banco: ClienteBanco
): Promise<LinhaConferencia[]> {
  const linhas: LinhaConferencia[] = [];
  for (const r of resultados) {
    const postgres = await banco.contar(r.entidade);
    const bate = r.lidas - r.duplicadasNaOrigem - r.recusas.length === postgres;
    linhas.push({ entidade: r.entidade, planilha: r.lidas, postgres, duplicadas: r.duplicadasNaOrigem, bate });
  }
  return linhas;
}

// ============================================================
// 6. CLI: variáveis de ambiente, execução, relatório
// ============================================================

const VAR_CHAVE_SERVICO = "SUPABASE_SERVICE_ROLE_KEY";
const VAR_URL = "NEXT_PUBLIC_SUPABASE_URL";

function linha(char = "-", tam = 70): string {
  return char.repeat(tam);
}

/**
 * Roda a migração inteira (todas as entidades migráveis, na ordem definida)
 * e devolve o relatório completo — separado de `principal()` para ser
 * chamado por dublês em teste sem precisar simular `process.argv`/`exit`.
 */
export async function rodarMigracao(
  banco: ClienteBanco,
  aplicar: boolean
): Promise<{ resultados: ResultadoEntidade[]; conferencia: LinhaConferencia[] }> {
  validarOrdemDeDependencia(
    ENTIDADES_MIGRAVEIS,
    new Set(ENTIDADES_PULADAS.map((p) => p.entidade))
  );

  const mapa = criarMapaIds();
  const resultados: ResultadoEntidade[] = [];
  for (const def of ENTIDADES_MIGRAVEIS) {
    resultados.push(await migrarEntidade(def, banco, mapa, aplicar));
  }

  const conferencia = await montarConferencia(resultados, banco);
  return { resultados, conferencia };
}

/**
 * A chave natural de cada entidade, em português claro, para o bloco de
 * duplicatas do relatório (`imprimirRelatorio`) — o dono não conhece nome de
 * coluna em snake_case, mas reconhece "nome+telefone" ou "id_externo" na
 * hora. Mantido separado de `chaveNatural` (que devolve VALORES) porque este
 * dicionário descreve os CAMPOS em prosa, e só é usado para exibição.
 */
const DESCRICAO_CHAVE_NATURAL: Record<string, string> = {
  agrupamentos: "um nome",
  produtos: "um nome",
  afiliados: "um nome",
  alunos: "uma combinação de nome+telefone",
  contas_bancarias: "um nome",
  metas: "uma combinação de indicador+escopo+período",
  metas_financeiras: "uma combinação de tipo+período",
  parametros_financeiros: "a linha única de configuração",
  despesas: "uma combinação de data+descrição+valor+categoria",
  perfis_sociais: "uma combinação de plataforma+identificador (handle)",
  lancamentos: "um nome",
  modulos: "uma combinação de produto+ordem",
  movimentos_caixa: "uma combinação de descrição+data de caixa+valor+direção+categoria",
  recebiveis: "uma combinação de descrição+vencimento+valor+parcela",
  pagaveis: "uma combinação de descrição+vencimento+valor+fornecedor",
  conteudos: "uma combinação de perfil+título+data de publicação",
  atividades: "uma combinação de aluno+tipo+título+data",
  interacoes: "um id_externo",
  envios: "uma combinação de aluno+texto+instante de autorização",
  aulas: "uma combinação de módulo+ordem",
  tarefas: "uma combinação de título+prazo+responsável",
  reunioes: "uma combinação de título+início",
  matriculas: "uma combinação de aluno+produto+data+valor",
  importacoes: "uma impressão digital",
  conteudo_metricas: "um conteúdo (uma métrica por conteúdo)",
  campanhas: "uma combinação de nome+início",
  progresso_aulas: "uma combinação de aluno+aula",
  comissoes: "uma combinação de matrícula+afiliado+data+valor",
  reembolsos: "uma combinação de matrícula+data+valor",
  chargebacks: "uma combinação de matrícula+data+valor",
  encontros: "uma combinação de turma+título+data",
};

/**
 * O texto da coluna "situação" da tabela de conferência — três estados, não
 * dois (ver comentário de `montarConferencia` para a fórmula de `bate`):
 *   - "OK": bate exatamente, nada para explicar.
 *   - "OK (N duplicadas...)" / "OK (..., N recusadas)": bate DEPOIS de
 *     descontar duplicata e/ou recusa — não é erro, é o script fazendo o que
 *     devia (deduplicar, não inventar dado).
 *   - "DIVERGE": sobrou diferença que nem duplicata nem recusa explicam —
 *     este é o único estado que é problema de verdade.
 */
function situacaoTexto(c: LinhaConferencia, quantidadeRecusas: number): string {
  if (!c.bate) return "DIVERGE";
  if (c.duplicadas === 0 && quantidadeRecusas === 0) return "OK";

  const partes: string[] = [];
  if (c.duplicadas > 0) {
    partes.push(`${c.duplicadas} duplicada${c.duplicadas === 1 ? "" : "s"} na planilha`);
  }
  if (quantidadeRecusas > 0) {
    partes.push(`${quantidadeRecusas} recusada${quantidadeRecusas === 1 ? "" : "s"}`);
  }
  return `OK (${partes.join(", ")})`;
}

function imprimirRelatorio(
  resultados: ResultadoEntidade[],
  conferencia: LinhaConferencia[],
  aplicar: boolean
): void {
  console.log(linha("="));
  console.log(aplicar ? "MIGRAÇÃO APLICADA — planilha -> Supabase" : "SIMULAÇÃO — nada foi escrito no Supabase");
  console.log(linha("="));

  for (const r of resultados) {
    console.log(`\n${r.entidade}  (aba: ${r.aba})`);
    console.log(
      `  lidas da planilha: ${r.lidas} | ${aplicar ? "inseridas agora" : "seriam inseridas"}: ${r.inseridas} | já existiam: ${r.jaExistentes} | recusadas: ${r.recusas.length}`
    );
  }

  const todasRecusas = resultados.flatMap((r) => r.recusas);
  if (todasRecusas.length > 0) {
    console.log(`\n${linha("-")}`);
    console.log(`LINHAS RECUSADAS (${todasRecusas.length}) — corrija na planilha e rode de novo:`);
    console.log(linha("-"));
    for (const r of todasRecusas) {
      console.log(`  [${r.entidade}] posição ${r.posicao} (id ${r.idOrigem}): ${r.motivo}`);
    }
  }

  console.log(`\n${linha("=")}`);
  // ATUALIZADO: a frase antiga ("o número que não bate é migração que não
  // terminou") virou mentira no dia em que a migração terminou perfeitamente
  // e a planilha tinha 10 linhas de ALUNOS para 6 pessoas reais (lead
  // duplicado + linhas de teste). "Não bater" agora tem duas causas bem
  // diferentes — e só uma delas é problema.
  console.log("CONFERÊNCIA — planilha x Postgres (OK = bate; OK com duplicata/recusada = bateu descontando");
  console.log("linha repetida na planilha ou corretamente recusada, não é erro; DIVERGE = sobrou diferença");
  console.log("que nem duplicata nem recusa explicam — aí sim é migração que não terminou)");
  console.log(linha("="));
  console.log("entidade".padEnd(24) + "planilha".padStart(10) + "postgres".padStart(10) + "  situação");
  const recusasPorEntidade = new Map(resultados.map((r) => [r.entidade, r.recusas.length]));
  for (const c of conferencia) {
    const situacao = situacaoTexto(c, recusasPorEntidade.get(c.entidade) ?? 0);
    console.log(c.entidade.padEnd(24) + String(c.planilha).padStart(10) + String(c.postgres).padStart(10) + `  ${situacao}`);
  }

  const comDuplicatas = resultados.filter((r) => r.duplicadasNaOrigem > 0);
  if (comDuplicatas.length > 0) {
    const totalDuplicadas = comDuplicatas.reduce((soma, r) => soma + r.duplicadasNaOrigem, 0);
    console.log(`\n${linha("-")}`);
    console.log(`LINHAS QUE A PLANILHA REPETE (${totalDuplicadas}) — o banco guardou uma vez cada:`);
    console.log(linha("-"));
    for (const r of comDuplicatas) {
      const descricaoChave = DESCRICAO_CHAVE_NATURAL[r.entidade] ?? "a mesma chave natural";
      const plural = r.duplicadasNaOrigem === 1 ? { linha: "linha", verbo: "repete" } : { linha: "linhas", verbo: "repetem" };
      console.log(`  [${r.entidade}] ${r.duplicadasNaOrigem} ${plural.linha} ${plural.verbo} ${descricaoChave} que já tinha vindo antes.`);
    }
  }

  if (ENTIDADES_PULADAS.length > 0) {
    console.log(`\n${linha("-")}`);
    console.log(`ENTIDADES PULADAS (${ENTIDADES_PULADAS.length}) — sem aba correspondente na planilha, nada foi migrado:`);
    console.log(linha("-"));
    for (const p of ENTIDADES_PULADAS) {
      console.log(`  [${p.entidade}] ${p.motivo}`);
    }
  }
  console.log("");
}

/**
 * Ponto de entrada de linha de comando. Devolve o código de saída — quem
 * chama (`ehExecucaoDireta`, no fim do arquivo) é quem decide chamar
 * `process.exit`, para este corpo continuar testável sem matar o processo
 * de teste.
 */
export async function principal(argv: string[] = process.argv.slice(2)): Promise<number> {
  const aplicar = argv.includes("--aplicar");

  // Regra do enunciado: sem a service role key, o script para NA PRIMEIRA
  // LINHA, com mensagem clara — nunca com stack trace, e nunca imprimindo o
  // valor da chave (aqui ela nem chega a ser lida por completo: só
  // checamos `typeof`/vazio).
  const chaveServico = process.env[VAR_CHAVE_SERVICO];
  if (!chaveServico || chaveServico.trim() === "") {
    console.error(linha("="));
    console.error("Este script não pode continuar: falta a variável de ambiente");
    console.error(`  ${VAR_CHAVE_SERVICO}`);
    console.error("");
    console.error("Ela é a chave de SERVIÇO do Supabase (Project Settings > API > service_role),");
    console.error("diferente da chave pública que o app usa no navegador. Sem ela, a leitura de");
    console.error("segurança (RLS) do banco bloqueia a inserção em massa que este script precisa fazer.");
    console.error("");
    console.error("Defina a variável e rode de novo, por exemplo:");
    console.error(`  ${VAR_CHAVE_SERVICO}=coloque-a-chave-aqui npx tsx scripts/migrar-planilha-para-supabase.ts --aplicar`);
    console.error(linha("="));
    return 1;
  }

  const url = process.env[VAR_URL];
  if (!url || url.trim() === "") {
    console.error(linha("="));
    console.error(`Este script não pode continuar: falta a variável de ambiente ${VAR_URL}`);
    console.error("É a URL do projeto Supabase (Project Settings > API > Project URL).");
    console.error(linha("="));
    return 1;
  }

  console.log(
    aplicar
      ? "Modo: --aplicar (vai escrever no Supabase de verdade)."
      : "Modo: simulação (padrão). Nada será escrito. Rode com --aplicar para gravar de verdade."
  );

  const banco = criarClienteSupabase(url, chaveServico);
  const { resultados, conferencia } = await rodarMigracao(banco, aplicar);
  imprimirRelatorio(resultados, conferencia, aplicar);

  return decidirCodigoSaida(conferencia, aplicar);
}

/**
 * Regra 4, isolada como função pura para ser testável sem CLI/env/rede:
 * em `--aplicar`, qualquer entidade cujo `bate` deu `false` faz o script
 * terminar com código diferente de zero. Como `bate` (ver
 * `montarConferencia`) já desconta duplicata na origem e recusa antes de
 * comparar, chegar aqui como divergente significa que NENHUMA das duas
 * explica a diferença — só então é "migração não terminou" de verdade. Uma
 * entidade que só bateu depois de descontar duplicata/recusa (`bate: true`)
 * NUNCA cai neste filtro, mesmo que `planilha !== postgres` — não é falha.
 * Em simulação a divergência é sempre esperada (nada foi escrito), então
 * nunca é falha.
 */
export function decidirCodigoSaida(conferencia: LinhaConferencia[], aplicar: boolean): number {
  if (!aplicar) return 0;
  const divergentes = conferencia.filter((c) => !c.bate);
  if (divergentes.length === 0) return 0;

  console.error(linha("="));
  console.error("MIGRAÇÃO NÃO TERMINOU — as entidades abaixo divergem entre planilha e Postgres");
  console.error("(diferença que NÃO é explicada por duplicata na origem nem por recusa):");
  for (const d of divergentes) {
    console.error(`  ${d.entidade}: planilha=${d.planilha}  postgres=${d.postgres}  duplicadas=${d.duplicadas}`);
  }
  console.error("Veja a lista de recusadas acima para entender o motivo de cada uma.");
  console.error(linha("="));
  return 1;
}

// ============================================================
// 7. Guarda de execução direta
// ============================================================
//
// Este bloco só roda quando o arquivo é chamado diretamente (`npx tsx
// scripts/migrar-planilha-para-supabase.ts`). Quando `scripts/migrar.test.ts`
// importa as funções deste módulo, `import.meta.url` não bate com
// `process.argv[1]` (é o processo do vitest), então nada aqui dispara rede
// nem `process.exit` — é assim que o teste consegue exercitar a lógica com
// dublês sem qualquer efeito colateral no runner.
//
// POR QUE NÃO DÁ PARA COMPARAR `file://${process.argv[1]}` NA MÃO
// -----------------------------------------------------------------
// Essa era a versão anterior desta linha, e ela funcionava em Linux e Mac e
// FALHAVA EM SILÊNCIO no Windows — que é justamente a máquina do dono, a
// única onde este script tem rede para rodar. No Windows `process.argv[1]` é
// `C:\dev\Repositorios\RARO IA\scripts\migrar...ts`, enquanto
// `import.meta.url` é `file:///C:/dev/Repositorios/RARO%20IA/scripts/...`:
// barra invertida virou barra, a unidade ganhou uma terceira barra antes, e
// o espaço do nome da pasta virou %20. Os dois nunca são iguais, então a
// condição dava falso, `principal()` nunca era chamada e o processo saía com
// código 0 sem imprimir uma linha — o pior tipo de falha, a que se parece
// com sucesso. `pathToFileURL` faz exatamente essa conversão pelas regras do
// sistema operacional em que está rodando, e é o único jeito correto de
// comparar as duas coisas.
export function ehChamadaDireta(argv1: string | undefined, metaUrl: string): boolean {
  if (argv1 === undefined || argv1 === "") return false;
  try {
    return pathToFileURL(argv1).href === metaUrl;
  } catch {
    return false;
  }
}

const ehExecucaoDireta = ehChamadaDireta(process.argv[1], import.meta.url);
if (ehExecucaoDireta) {
  principal()
    .then((codigo) => process.exit(codigo))
    .catch((erro) => {
      // Última rede de segurança: um erro verdadeiramente inesperado (falha
      // de rede no meio da migração, por exemplo) ainda vira uma mensagem
      // legível para o dono, não um despejo de stack trace de Node.
      console.error(linha("="));
      console.error("A migração parou por um erro inesperado:");
      console.error(erro instanceof Error ? erro.message : String(erro));
      console.error(linha("="));
      process.exit(1);
    });
}
