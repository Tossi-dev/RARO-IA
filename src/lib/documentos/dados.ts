// Camada de LEITURA dos documentos — fala com o Supabase e devolve objetos já
// prontos para tela (sem tela nenhuma aqui). Módulo SERVER-ONLY (usa
// `criarSupabaseServer`, que usa `next/headers`).
//
// Molde exato de `src/lib/mentoria/dados.ts`, e pelas mesmas três razões:
//
// 1) NUNCA INVENTAR. Sem Supabase configurado, devolve `conectado: false` e
//    lista vazia — nunca dado de demonstração, nunca zero disfarçado de dado
//    real (o incidente que originou a regra está contado em
//    `src/lib/data/index.ts`). Aqui isso pega um campo em especial:
//    `bytes` desconhecido vira `null`, NÃO `0` — ver `bytesDe` mais abaixo.
//
// 2) Erro de leitura não derruba a tela. `error` do supabase-js e exceção do
//    cliente viram `conectado: false` com um `motivo` curto e humano — sem
//    nome de tabela, coluna, id ou trecho de SQL. Nem a palavra "documento"
//    aparece no texto: é o nome da tabela, e nome de tabela é mapa do banco
//    para quem estiver do outro lado da tela. O detalhe técnico vai só para
//    `console.warn`.
//
// 3) Nada de `new Date()` aqui dentro. Este arquivo, hoje, não precisa saber
//    que horas são: a ordenação é entre as próprias linhas, não contra agora.
//
// POR QUE O FILTRO DE `arquivado` MORA EM MEMÓRIA
// -----------------------------------------------
// A GARANTIA de que um documento arquivado não chega ao mentorado está na RLS
// do 0015 (`and not arquivado` dentro do `using` da política de select) e na
// política equivalente do bucket — não neste arquivo. O filtro daqui serve a
// outra coisa: a gestão PODE ler o arquivado (a linha não sumiu, a regra da
// casa é que status muda e linha fica), então quem monta a lista precisa
// escolher. O padrão é não mostrar; `incluirArquivados` é o pedido explícito
// de quem quer ver o histórico completo. Se o filtro fosse um `.eq()` na
// consulta, o arquivado ficaria inalcançável pela gestão e "nunca apagar"
// viraria "apagar da vista de todo mundo".
//
// Escala pequena DE PROPÓSITO (docs/DESENHO-MENTOROS.md, decisão 2): uma
// consulta simples por função, sem paginação, sem cache. Para dezenas de
// linhas, o resto seria complexidade sem retorno.

import { criarSupabaseServer } from "../supabase/server";
import { supabaseConfigurado } from "../data";
import { CATEGORIA_DOCUMENTO_VALORES, type CategoriaDocumento } from "./validacao";

/* eslint-disable @typescript-eslint/no-explicit-any -- linha crua do Postgres
   via PostgREST: mesmo padrão de `Row` em `src/lib/mentoria/dados.ts`. Cada
   campo é normalizado em `linhaParaDocumento`, nunca passado adiante com
   `as Documento`. */
type Row = Record<string, any>;

// ============================================================
// Contrato
// ============================================================

/**
 * Uma linha de `public.documento` (0015), em camelCase.
 *
 * `mentoradoId` e `alunoId` são nulos quando o documento é do NEGÓCIO
 * (contrato de prestação de serviço, modelo em branco de anamnese, material da
 * turma inteira) — nulo aqui é caso normal, não erro.
 *
 * `bytes` é `number | null` e não `number`: ver `bytesDe`.
 */
export interface Documento {
  id: string;
  workspaceId: string;
  mentoradoId: string | null;
  alunoId: string | null;
  titulo: string;
  caminhoStorage: string;
  mime: string;
  /** `null` = tamanho desconhecido. Nunca `0` para dizer isso. */
  bytes: number | null;
  categoria: CategoriaDocumento;
  visivelPortal: boolean;
  enviadoPor: string | null;
  criadoEm: string;
  arquivado: boolean;
}

export interface ListaDocumentos {
  /** `false` = sem Supabase configurado, ou a leitura falhou. */
  conectado: boolean;
  /** "" quando conectado; texto curto e humano quando não. */
  motivo: string;
  /** Mais recente primeiro. Sem arquivados, salvo pedido explícito. */
  documentos: Documento[];
}

export interface OpcoesDeLeitura {
  /** Padrão `false`: o arquivado continua no banco, só não na lista do dia a dia. */
  incluirArquivados?: boolean;
}

// ============================================================
// Textos que vão para a tela — genéricos de propósito (regra 2). "arquivos
// anexados" e não "documentos" porque `documento` é o nome da tabela, e o que
// vai para a tela não pode desenhar o banco para quem está lendo.
// ============================================================

const MOTIVO_SEM_CONEXAO =
  "Nenhuma conexão com o banco de dados configurada. Os arquivos anexados não podem ser listados agora.";

const MOTIVO_ERRO_LEITURA =
  "Não foi possível carregar os arquivos anexados agora. Tente novamente em instantes.";

function listaDesconectada(motivo: string): ListaDocumentos {
  return { conectado: false, motivo, documentos: [] };
}

/**
 * Loga o detalhe técnico de uma falha (código/mensagem do supabase-js, ou a
 * exceção crua) — é AQUI, e só aqui, que ele pode aparecer. `motivo` (o que vai
 * para a tela) nunca herda nada deste log.
 */
function avisar(operacao: string, erro: unknown): void {
  if (erro && typeof erro === "object" && ("code" in erro || "message" in erro)) {
    const e = erro as { code?: string; message?: string };
    console.warn(`[documentos/dados] ${operacao} falhou`, e.code, e.message);
  } else {
    console.warn(`[documentos/dados] ${operacao} falhou`, erro);
  }
}

// ============================================================
// Normalização
// ============================================================

/** Texto do banco, ou `""`. Nunca `undefined`: quem renderiza não sabe distinguir "não veio" de "veio vazio". */
function textoDe(bruto: unknown): string {
  return typeof bruto === "string" ? bruto : "";
}

/** Id opcional: `""` e espaço em branco contam como ausência, para não virar chave que não aponta para nada. */
function idOuNulo(bruto: unknown): string | null {
  if (typeof bruto !== "string") return null;
  const limpo = bruto.trim();
  return limpo === "" ? null : limpo;
}

/**
 * Tamanho do arquivo, ou `null` quando não dá para afirmar qual é.
 *
 * `Number(r.bytes) || 0` seria a linha óbvia aqui e é exatamente o que a casa
 * não aceita: um `null` do banco viraria `0`, a tela somaria "12 arquivos,
 * 0 KB" e ninguém saberia que o número foi fabricado na leitura. A coluna do
 * 0015 tem `check (bytes > 0)` justamente para que zero nunca seja um tamanho
 * legítimo — então zero, negativo ou lixo aqui significa "não sei", e é isso
 * que a tela precisa poder dizer.
 *
 * `bigint` do Postgres às vezes chega como TEXTO no JSON do PostgREST (é o
 * jeito de não perder precisão acima de 2^53), por isso a string numérica é
 * aceita — mas SÓ dígitos. `Number()` sozinho não serve de peneira: ele aceita
 * `"0x10"` como 16, `"1e3"` como 1000, `""` e `null` como 0. Cada um desses
 * seria um tamanho fabricado dentro da leitura, que é a regra 1 sendo quebrada
 * no lugar mais silencioso possível — a tela mostraria "16 bytes" com a mesma
 * cara de quem mediu.
 *
 * Duas recusas a mais, pelo mesmo motivo: fração (não existe meio byte, e um
 * `1.5` só pode vir de dado sujo) e valor acima de `MAX_SAFE_INTEGER` — ali o
 * `Number` do JS ARREDONDA, e "9007199254740993" viraria ...992, um byte a
 * menos, apresentado como exato. Dizer "não sei" é honesto; dizer um número
 * quase certo não é.
 */
function bytesDe(bruto: unknown): number | null {
  if (typeof bruto === "number") {
    return Number.isSafeInteger(bruto) && bruto > 0 ? bruto : null;
  }
  if (typeof bruto !== "string") return null;
  const limpo = bruto.trim();
  if (!/^\d+$/.test(limpo)) return null;
  const numero = Number(limpo);
  return Number.isSafeInteger(numero) && numero > 0 ? numero : null;
}

/**
 * Categoria fail-closed, no mesmo espírito dos normalizadores de
 * `src/lib/mentoria/tipos.ts`: valor fora do enum — inclusive um valor NOVO
 * que uma migração futura acrescente — cai em `"outro"` em vez de vazar um
 * literal desconhecido para a tela ou lançar. A lista válida vem de
 * `validacao.ts`, que já espelha o `create type categoria_documento` do 0015:
 * duas cópias da mesma lista divergiriam na primeira categoria nova.
 */
function categoriaDe(bruto: unknown): CategoriaDocumento {
  if (typeof bruto !== "string") return "outro";
  const normalizado = bruto.trim().toLowerCase();
  return (CATEGORIA_DOCUMENTO_VALORES as readonly string[]).includes(normalizado)
    ? (normalizado as CategoriaDocumento)
    : "outro";
}

export function linhaParaDocumento(r: Row): Documento {
  return {
    id: textoDe(r.id),
    workspaceId: textoDe(r.workspace_id),
    mentoradoId: idOuNulo(r.mentorado_id),
    alunoId: idOuNulo(r.aluno_id),
    titulo: textoDe(r.titulo),
    caminhoStorage: textoDe(r.caminho_storage),
    mime: textoDe(r.mime),
    bytes: bytesDe(r.bytes),
    categoria: categoriaDe(r.categoria),
    // `Boolean(...)` e não `?? true`: as duas flags são fail-closed. Um
    // `visivel_portal` que não veio significa "não publicado", nunca
    // "publicado" — o padrão do 0015 é NÃO visível, e a leitura repete essa
    // escolha em vez de suavizá-la.
    visivelPortal: Boolean(r.visivel_portal),
    enviadoPor: idOuNulo(r.enviado_por),
    criadoEm: textoDe(r.criado_em),
    arquivado: Boolean(r.arquivado),
  };
}

// ============================================================
// Ordenação
// ============================================================

/**
 * `Date.parse` defensivo — mesmo motivo de `quandoOuLimite` em
 * `src/lib/mentoria/dados.ts`: uma data inválida não pode quebrar a comparação
 * nem lançar; ela só perde a disputa por uma posição "correta" e vai para o
 * fim da lista.
 */
function instanteOuLimite(iso: string): number {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : -Infinity;
}

/** Mais recente primeiro: documento anexado agora é o que se está procurando. */
function daListaCrua(linhas: readonly Row[], opcoes: OpcoesDeLeitura): Documento[] {
  const incluirArquivados = opcoes.incluirArquivados === true;
  return linhas
    .map(linhaParaDocumento)
    .filter((documento) => incluirArquivados || !documento.arquivado)
    .sort((a, b) => instanteOuLimite(b.criadoEm) - instanteOuLimite(a.criadoEm));
}

// ============================================================
// Leitura
// ============================================================

/**
 * Documentos de UM mentorado. A RLS do 0015 é quem decide o que este `select`
 * enxerga: a gestão recebe tudo do workspace, e o próprio mentorado recebe só
 * o que é dele, publicado e não arquivado. O `.eq` daqui é recorte de tela, não
 * é a trava — a trava está no banco.
 */
export async function lerDocumentosDoMentorado(
  mentoradoId: string,
  opcoes: OpcoesDeLeitura = {}
): Promise<ListaDocumentos> {
  if (!supabaseConfigurado()) {
    // Regra 1: sem Supabase configurado, nenhuma consulta é sequer tentada —
    // a tela decide o que mostrar a partir de `conectado`.
    return listaDesconectada(MOTIVO_SEM_CONEXAO);
  }

  try {
    const s = criarSupabaseServer();
    const { data, error } = await s.from("documento").select("*").eq("mentorado_id", mentoradoId);

    if (error) {
      avisar("lerDocumentosDoMentorado", error);
      return listaDesconectada(MOTIVO_ERRO_LEITURA);
    }

    // `data` nulo sem erro: conectou e não achou nada. É `conectado: true` de
    // propósito — "não tem documento" é uma resposta, "não consegui perguntar"
    // é outra, e a tela precisa poder dizer coisas diferentes para cada uma.
    return { conectado: true, motivo: "", documentos: daListaCrua((data ?? []) as Row[], opcoes) };
  } catch (excecao) {
    avisar("lerDocumentosDoMentorado", excecao);
    return listaDesconectada(MOTIVO_ERRO_LEITURA);
  }
}

/**
 * Documentos do NEGÓCIO: os que não pertencem a nenhum mentorado
 * (`mentorado_id is null`) — contrato de prestação de serviço, modelo em
 * branco de anamnese, material que vale para a turma inteira. `is null` e não
 * `eq`: em SQL, `mentorado_id = null` não é falso, é NULO, e não devolveria
 * linha nenhuma.
 */
export async function lerDocumentosDoNegocio(opcoes: OpcoesDeLeitura = {}): Promise<ListaDocumentos> {
  if (!supabaseConfigurado()) {
    return listaDesconectada(MOTIVO_SEM_CONEXAO);
  }

  try {
    const s = criarSupabaseServer();
    const { data, error } = await s.from("documento").select("*").is("mentorado_id", null);

    if (error) {
      avisar("lerDocumentosDoNegocio", error);
      return listaDesconectada(MOTIVO_ERRO_LEITURA);
    }

    return { conectado: true, motivo: "", documentos: daListaCrua((data ?? []) as Row[], opcoes) };
  } catch (excecao) {
    avisar("lerDocumentosDoNegocio", excecao);
    return listaDesconectada(MOTIVO_ERRO_LEITURA);
  }
}
