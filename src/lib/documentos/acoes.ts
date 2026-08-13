"use server";

// Server Actions de DOCUMENTO — anexar (arquivo + linha), arquivar e
// publicar/despublicar no portal. Mesma casa de `src/lib/mentoria/acoes.ts` e
// `src/lib/mentoria/acoes-portal.ts`: zod valida NA BORDA antes de qualquer
// escrita, `revalidatePath` depois de gravar, e erro (de validação ou de
// banco) volta para a tela em `?erro=`, nunca como exceção não tratada.
//
// ESCREVE COM O CLIENTE AUTENTICADO (`criarSupabaseServer`, o mesmo que
// `dados.ts` usa para LER), NUNCA com a chave `service_role`. Quem decide se
// esta pessoa pode anexar, arquivar ou publicar é a RLS do 0015 — e ela está
// escrita DUAS vezes, uma em `public.documento` e outra em `storage.objects`,
// porque o bucket é outro caminho de acesso e não o mesmo. Um `if` de tela
// vale só para a tela que o escreveu; a política no banco vale para qualquer
// caminho que tente escrever, inclusive um que ainda não existe.
//
// POR QUE O `workspace_id` NÃO VEM DO FORMULÁRIO
// ----------------------------------------------
// Tudo que chega em `FormData` é escolhido por quem enviou o formulário — e um
// PATCH/POST montado à mão manda o que quiser. Se `workspace_id` fosse aceito
// daqui, a linha nasceria carimbada com o inquilino que o cliente pediu. A
// coluna é preenchida pelo DEFAULT do banco (0005/0015) e a RLS de insert só
// aceita `workspace_id = workspace_atual()`, então a tentativa morreria no
// Postgres de qualquer jeito — mas ela nem chega a ser feita: o campo não é
// lido. A PASTA do objeto no Storage também precisa do workspace (é o primeiro
// segmento da chave, e é ele que toda política do bucket confere), e por isso
// ele é perguntado ao BANCO, via `workspace_atual()`, nunca ao formulário.
//
// A ORDEM É A GARANTIA CONTRA LINHA ÓRFÃ
// --------------------------------------
// Primeiro o upload, depois o insert. Invertido, um upload que falhasse (RLS
// do bucket, rede, cota) deixaria em `public.documento` uma linha apontando
// para um objeto que não existe: a tela listaria o documento, o mentorado
// clicaria e receberia erro, e ninguém saberia dizer se o arquivo sumiu ou
// nunca chegou. Na ordem certa, a falha do upload não deixa rastro nenhum na
// tabela — e o inverso (objeto no bucket sem linha que o descreva) é
// inofensivo por construção: sem linha, a política de leitura do mentorado no
// 0015 não acha o par e o objeto fica inalcançável para ele.
//
// ESTE PROJETO NÃO APAGA. Arquivar é `update arquivado = true` — a linha fica,
// e o objeto no bucket fica junto. Nenhuma função deste arquivo apaga linha de
// tabela nem objeto de Storage; 0015 nem cria política de delete para os dois
// casos, então a tentativa seria negada de qualquer forma. O teste
// `acoes.test.ts` lê este fonte e falha se um caminho de apagar aparecer.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { criarSupabaseServer } from "../supabase/server";
import {
  CATEGORIA_DOCUMENTO_VALORES,
  chaveDeStorage,
  nomeSeguro,
  tamanhoPermitido,
  tipoPermitido,
  type CategoriaDocumento,
} from "./validacao";

/** O bucket privado criado em 0015. Nome em um lugar só: errar a string aqui viraria upload para um bucket que não tem política nenhuma. */
const BUCKET = "documentos";

// ============================================================
// Códigos de erro — MÉDIO 5 da auditoria (ver o cabeçalho de
// `acoes-portal.ts`): a URL nunca carrega a MENSAGEM, só um destes códigos.
// ============================================================

// `?erro=<texto arbitrário>` era renderizado literalmente dentro do banner
// oficial da tela antes daquela correção: qualquer um podia mandar um link com
// um texto de ataque no lugar do aviso do produto. Quem traduz código em frase
// é a TELA, com uma tabela fechada — código desconhecido cai numa frase
// genérica, nunca no texto cru da URL. São cinco códigos porque são cinco
// coisas DIFERENTES do ponto de vista de quem lê a tela: três dizem o que
// mudar no arquivo (dá para agir), duas dizem que o sistema falhou (só resta
// tentar de novo). Um código só, como no portal, esconderia de quem enviou que
// o problema era o formato do arquivo.
const CODIGO_DADOS = "dados";
const CODIGO_TIPO = "tipo";
const CODIGO_TAMANHO = "tamanho";
const CODIGO_ENVIO = "envio";
const CODIGO_REGISTRO = "registro";
const CODIGO_DOCUMENTO = "documento";

/**
 * Loga o detalhe técnico de uma falha — mesmo padrão de `avisar` em
 * `dados.ts`/`acoes.ts`. É AQUI, e só aqui, que o código/mensagem do
 * supabase-js pode aparecer; a URL de redirect nunca herda nada disto.
 */
function avisar(operacao: string, erro: unknown): void {
  if (erro && typeof erro === "object" && ("code" in erro || "message" in erro)) {
    const e = erro as { code?: string; message?: string };
    console.warn(`[documentos/acoes] ${operacao} falhou`, e.code, e.message);
  } else {
    console.warn(`[documentos/acoes] ${operacao} falhou`, erro);
  }
}

/**
 * Formato de id que PODE virar segmento de caminho: letra, número, hífen e
 * sublinhado, até 100 (o mesmo teto de `IdSchema`, pela mesma razão). É lista
 * de PERMITIDOS, como em `nomeSeguro`, e não de proibidos — bloquear por lista
 * negra exigiria acertar o conjunto inteiro (`?`, `#`, `&`, `/`, `..`, `%`,
 * espaço, `<`) na primeira tentativa.
 */
const FORMATO_ID_EM_CAMINHO = /^[A-Za-z0-9_-]{1,100}$/;

/**
 * A tela para onde toda ação volta — "" (documento do negócio) cai na
 * carteira, nunca numa URL quebrada.
 *
 * O `mentoradoId` chega do `FormData`, e tudo que chega de lá é escolhido por
 * quem enviou o formulário (mesma premissa do cabeçalho sobre `workspace_id`).
 * Sem esta conferência ele entrava CRU em duas coisas perigosas: na URL de
 * `redirect`, onde um `?erro=` próprio no meio do id vence o código curto que
 * o código anexa depois — o primeiro `?` é o que o Next entrega em
 * `searchParams.erro`, e o banner oficial da tela passaria a exibir o texto de
 * quem montou o link, que é exatamente o MÉDIO 5 que a tabela fechada de
 * códigos existe para fechar; e em `revalidatePath`, onde `../..` vira um
 * caminho de cache que ninguém escreveu.
 *
 * Fail-closed: id fora do formato volta para a carteira. Perder o retorno para
 * a ficha é incômodo e visível; a URL forjada é silenciosa.
 */
function caminhoFicha(mentoradoId: string): string {
  return FORMATO_ID_EM_CAMINHO.test(mentoradoId) ? `/mentoria/${mentoradoId}` : "/mentoria";
}

function redirecionarComErro(caminho: string, codigo: string): never {
  redirect(`${caminho}?erro=${codigo}`);
  // `redirect()` sempre lança (é assim que o Next interrompe a Server Action)
  // — mas o `return` explícito abaixo é o que garante que, mesmo num dublê de
  // teste que NÃO lança de propósito, o código destas funções nunca cai para a
  // escrita com dado inválido.
  return undefined as never;
}

/**
 * Revalida as três telas que mostram documento. `/portal` entra sempre, e não
 * só quando `visivel_portal` muda: arquivar também tira o arquivo de lá (a RLS
 * do 0015 filtra `arquivado`), e um cache velho continuaria oferecendo ao
 * mentorado um documento que a gestão já retirou de circulação.
 */
function revalidarTelas(caminho: string): void {
  revalidatePath(caminho);
  revalidatePath("/mentoria");
  revalidatePath("/portal");
}

// ============================================================
// Validação de borda — zod, ANTES de qualquer chamada ao Supabase
// ============================================================

// 100 caracteres é folga generosa acima de um uuid (36) — grande o bastante
// para nunca recusar um id de verdade, pequeno o bastante para recusar de cara
// um valor absurdo sem precisar ir até o banco descobrir que a linha não
// existe. Mesmo raciocínio (e mesmo número) de `acoes-portal.ts`.
const IdSchema = z.string().trim().min(1).max(100);

/**
 * A categoria é conferida contra a MESMA lista que espelha o enum
 * `categoria_documento` do 0015 (`validacao.ts`), em vez de um `z.enum` com os
 * quatro valores repetidos aqui: duas cópias da mesma lista divergiriam na
 * primeira categoria nova, e a divergência apareceria como erro de CHECK no
 * banco — longe de quem a causou.
 */
const CategoriaSchema = z.custom<CategoriaDocumento>(
  (valor) => typeof valor === "string" && (CATEGORIA_DOCUMENTO_VALORES as readonly string[]).includes(valor)
);

const AnexarSchema = z.object({
  // Vazio é caso normal e não erro: documento do NEGÓCIO (contrato de
  // prestação de serviço, modelo em branco de anamnese) não pertence a
  // ninguém — ver o cabeçalho de `mentorado_id` no 0015.
  mentoradoId: z.string().trim().max(100).optional().default(""),
  alunoId: z.string().trim().max(100).optional().default(""),
  titulo: z.string().trim().max(200).optional().default(""),
  categoria: CategoriaSchema,
  visivelPortal: z.string().optional().default(""),
});

const DocumentoSchema = z.object({
  mentoradoId: z.string().trim().max(100).optional().default(""),
  documentoId: IdSchema,
  visivel: z.string().optional().default(""),
});

/**
 * Interruptor de formulário: marcado só quando o valor é um dos combinados.
 *
 * Fail-closed de propósito, e é a mesma escolha do default `false` de
 * `visivel_portal` no 0015: um valor estranho ("maybe", "2", vazio) significa
 * NÃO PUBLICADO. O erro barato aqui é esconder um material de aula; o caro é
 * publicar no portal uma anamnese com anotação clínica do mentor porque um
 * checkbox chegou com um valor que ninguém previu.
 */
function interruptorLigado(valor: string): boolean {
  return ["on", "1", "true", "sim"].includes(valor.trim().toLowerCase());
}

/** `""` vira `null`: id vazio na coluna viraria chave que não aponta para nada (mesma normalização de `idOuNulo` em `dados.ts`). */
function idOuNulo(valor: string): string | null {
  return valor === "" ? null : valor;
}

/**
 * O arquivo do `FormData`, conferido pela FORMA e não por `instanceof File`.
 *
 * `instanceof` compara identidade de construtor, e o `File` que o runtime do
 * Next entrega numa Server Action nem sempre é o mesmo construtor visível
 * neste módulo (undici, realms diferentes) — um `instanceof` que falhasse ali
 * recusaria todo upload legítimo em produção sem quebrar teste nenhum. O que
 * este código precisa saber é só se dá para ler nome, tipo e tamanho.
 */
function arquivoDoFormulario(bruto: FormDataEntryValue | null): File | null {
  if (bruto === null || typeof bruto === "string") return null;
  const candidato = bruto as Partial<File> & { arrayBuffer?: unknown };
  if (typeof candidato.name !== "string") return null;
  if (typeof candidato.type !== "string") return null;
  if (typeof candidato.size !== "number" || !Number.isFinite(candidato.size)) return null;
  if (typeof candidato.arrayBuffer !== "function") return null;
  return bruto;
}

/**
 * O tipo SEM os parâmetros (`text/csv; charset=utf-8` vira `text/csv`).
 *
 * É esta forma que vai para a coluna `mime` e para o `contentType` do upload,
 * porque é exatamente ela que `tipoPermitido` conferiu — guardar o texto cru
 * deixaria na linha um valor que nenhuma validação aprovou, e a tela filtraria
 * por um mime que não bate com o da lista.
 */
function mimeBase(tipo: string): string {
  return tipo.split(";")[0].trim().toLowerCase();
}

// ============================================================
// anexarDocumento
// ============================================================

export async function anexarDocumento(formData: FormData): Promise<void> {
  const caminho = caminhoFicha(String(formData.get("mentoradoId") ?? "").trim());

  const resultado = AnexarSchema.safeParse(Object.fromEntries(formData));
  if (!resultado.success) {
    redirecionarComErro(caminho, CODIGO_DADOS);
    return;
  }
  const dados = resultado.data;

  const arquivo = arquivoDoFormulario(formData.get("arquivo"));
  if (arquivo === null) {
    redirecionarComErro(caminho, CODIGO_DADOS);
    return;
  }

  // As duas guardas puras de `validacao.ts`, nesta ordem: o formato primeiro
  // (ele também cobre nome vazio e travessia de caminho, porque a extensão sai
  // do nome já saneado), o tamanho depois. Nenhuma delas precisa de rede — e é
  // por isso que o arquivo recusado nem chega a ser transferido.
  if (!tipoPermitido(arquivo.type, arquivo.name)) {
    redirecionarComErro(caminho, CODIGO_TIPO);
    return;
  }
  if (!tamanhoPermitido(arquivo.size)) {
    redirecionarComErro(caminho, CODIGO_TAMANHO);
    return;
  }

  const s = criarSupabaseServer();

  const workspaceId = await lerWorkspaceAtual(s);
  if (workspaceId === "") {
    redirecionarComErro(caminho, CODIGO_ENVIO);
    return;
  }

  // O id nasce AQUI, antes do upload, porque ele é parte da chave do objeto e
  // também a chave primária da linha: é assim que dois `anamnese.pdf` de
  // mentorados diferentes deixam de disputar o mesmo caminho (ver
  // `chaveDeStorage` em `validacao.ts`).
  const id = randomUUID();
  const chave = chaveDeStorage(workspaceId, dados.categoria, arquivo.name, id);
  if (chave === "") {
    // Fail-closed: com workspace, categoria e nome já conferidos, chegar aqui
    // significa que uma das guardas de `chaveDeStorage` viu algo que as
    // anteriores deixaram passar. Um caminho parcial não seria RECUSADO pelo
    // Storage, seria aceito apontando para outro lugar.
    avisar("anexarDocumento", "chave de storage vazia");
    redirecionarComErro(caminho, CODIGO_ENVIO);
    return;
  }

  const mime = mimeBase(arquivo.type);

  // `upsert: false` de propósito: sobrescrever um objeto existente é o único
  // jeito de este código destruir arquivo de alguém, e a chave já é única por
  // construção — se houver colisão, ela é sintoma de defeito e tem que virar
  // erro, não substituição silenciosa.
  const { error: erroUpload } = await s.storage
    .from(BUCKET)
    .upload(chave, arquivo, { contentType: mime, upsert: false });

  if (erroUpload) {
    avisar("anexarDocumento/upload", erroUpload);
    redirecionarComErro(caminho, CODIGO_ENVIO);
    return;
  }

  const { error } = await s.from("documento").insert({
    id,
    mentorado_id: idOuNulo(dados.mentoradoId),
    aluno_id: idOuNulo(dados.alunoId),
    // Título em branco cai no nome saneado do arquivo — que é um FATO sobre o
    // que foi enviado, não um rótulo inventado. A alternativa (gravar "") faria
    // a lista mostrar uma linha sem nome nenhum.
    titulo: dados.titulo === "" ? nomeSeguro(arquivo.name) : dados.titulo,
    caminho_storage: chave,
    mime,
    // Medido no arquivo, nunca lido do formulário: `bytes` é o número que a
    // tela soma, e número que a tela mostra não pode vir de quem enviou.
    bytes: arquivo.size,
    categoria: dados.categoria,
    visivel_portal: interruptorLigado(dados.visivelPortal),
    enviado_por: await idDeQuemEnviou(s),
    // `workspace_id` e `arquivado` ficam FORA de propósito: o primeiro vem do
    // default do banco (ver o cabeçalho), o segundo nasce `false` e só muda por
    // `arquivarDocumento`.
  });

  if (error) {
    avisar("anexarDocumento/insert", error);
    redirecionarComErro(caminho, CODIGO_REGISTRO);
    return;
  }

  revalidarTelas(caminho);
}

/**
 * O workspace de quem está logado, perguntado ao BANCO (`workspace_atual()`,
 * `security definer`, 0005) — nunca ao formulário. `""` quando não dá para
 * afirmar qual é, e aí nada é enviado: uma pasta errada aqui é arquivo de um
 * inquilino nascendo dentro de outro.
 */
async function lerWorkspaceAtual(s: ReturnType<typeof criarSupabaseServer>): Promise<string> {
  try {
    const { data, error } = await s.rpc("workspace_atual");
    if (error) {
      avisar("lerWorkspaceAtual", error);
      return "";
    }
    return typeof data === "string" ? data.trim() : "";
  } catch (excecao) {
    avisar("lerWorkspaceAtual", excecao);
    return "";
  }
}

/**
 * Quem enviou é a SESSÃO autenticada, resolvida pelo cliente do Supabase —
 * nunca um campo do formulário. `null` quando a sessão não responde: a coluna
 * aceita nulo (0015) e "não sei quem enviou" é honesto; carimbar o id que veio
 * no `FormData` seria assinar o upload com o nome de outra pessoa.
 */
async function idDeQuemEnviou(s: ReturnType<typeof criarSupabaseServer>): Promise<string | null> {
  try {
    const { data, error } = await s.auth.getUser();
    if (error) return null;
    const id = data?.user?.id;
    return typeof id === "string" && id !== "" ? id : null;
  } catch (excecao) {
    avisar("idDeQuemEnviou", excecao);
    return null;
  }
}

// ============================================================
// arquivarDocumento — UPDATE, nunca apagar
// ============================================================

export async function arquivarDocumento(formData: FormData): Promise<void> {
  const caminho = caminhoFicha(String(formData.get("mentoradoId") ?? "").trim());

  const resultado = DocumentoSchema.safeParse(Object.fromEntries(formData));
  if (!resultado.success) {
    redirecionarComErro(caminho, CODIGO_DOCUMENTO);
    return;
  }

  const s = criarSupabaseServer();
  // Uma coluna só. Arquivar não mexe em `visivel_portal` porque não precisa: a
  // RLS do 0015 já tira o arquivado do portal, e desligar as duas juntas
  // apagaria a informação de que aquele documento CHEGOU a ser publicado — que
  // é justamente o que se quer saber depois.
  const { error } = await s
    .from("documento")
    .update({ arquivado: true })
    .eq("id", resultado.data.documentoId);

  if (error) {
    avisar("arquivarDocumento", error);
    redirecionarComErro(caminho, CODIGO_DOCUMENTO);
    return;
  }

  revalidarTelas(caminho);
}

// ============================================================
// alternarVisivelPortal — troca a flag e só ela
// ============================================================

export async function alternarVisivelPortal(formData: FormData): Promise<void> {
  const caminho = caminhoFicha(String(formData.get("mentoradoId") ?? "").trim());

  const resultado = DocumentoSchema.safeParse(Object.fromEntries(formData));
  if (!resultado.success) {
    redirecionarComErro(caminho, CODIGO_DOCUMENTO);
    return;
  }

  const dados = resultado.data;
  const s = criarSupabaseServer();
  // O valor DESEJADO vem do formulário, e não de um "leia e inverta": ler o
  // estado atual para negá-lo abriria uma janela entre a leitura e a escrita em
  // que dois cliques (ou dois separadores abertos na mesma ficha) se cancelam,
  // e o arquivo termina publicado sem ninguém ter pedido isso.
  const { error } = await s
    .from("documento")
    .update({ visivel_portal: interruptorLigado(dados.visivel) })
    .eq("id", dados.documentoId);

  if (error) {
    avisar("alternarVisivelPortal", error);
    redirecionarComErro(caminho, CODIGO_DOCUMENTO);
    return;
  }

  revalidarTelas(caminho);
}
