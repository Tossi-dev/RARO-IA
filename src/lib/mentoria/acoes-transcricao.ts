// NOTA DE FRONTEIRA (Tarefa 18): este arquivo NAO carrega mais "use server".
// Um modulo "use server" so pode EXPORTAR funcao async -- e este exporta
// tambem as constantes de mensagem, que os testes e a tela leem. Enquanto
// ninguem importava este arquivo, o Next nunca chegou a aplicar a regra; a
// ficha passou a importar, e o build quebrou na hora. A saida NAO foi
// esconder as constantes: foi reconhecer que a fronteira de Server Action
// e `acoes-ficha.ts`, o unico modulo que os formularios chamam. Daqui para
// baixo e biblioteca de servidor comum, chamada por aquela fronteira e
// pelas rotas -- e por isso pode exportar o que quiser.

// Server Action que transcreve o áudio de uma sessão de mentoria —
// Tarefa 17 do plano. Mesma casa de `acoes-calendario.ts` (validação na
// borda, `revalidatePath` depois de escrever, sessão vem do BANCO, nunca do
// formulário), mas com uma disciplina a mais: o conteúdo transcrito é a
// conversa inteira do cliente, então este arquivo trata tudo que passa por
// aqui como sensível — nunca no log, nunca no retorno além de um indicador
// de tamanho.
//
// REVISADO após reprovação de revisor independente (laudo completo na
// sessão de correção). Sete defeitos corrigidos:
//   D1 (ALTO)         — o catch GERAL do fim da função repassava
//                        `excecao.message` cru para `console.warn`; se o
//                        `.update()` da transcrição lançasse uma exceção
//                        que ecoasse o corpo da requisição (a transcrição
//                        inteira), ela ia parar no log. Agora `avisar`
//                        NUNCA recebe `.message` de nada — só um código
//                        curto do Postgrest ou o `.name` de uma exceção JS.
//   D2 (teste)        — suíte ganhou espião de `console.warn` provando, com
//                        um marcador único plantado no texto transcrito,
//                        que ele nunca aparece em nenhuma chamada de log.
//   D3 (teste)        — suíte passa a assertar `.eq("id", sessaoId)` na
//                        leitura da sessão via `eqChamadas`.
//   D4                — `revalidatePath` saiu do caminho que pode virar
//                        `ok:false`: se a gravação já confirmou, a resposta
//                        é sucesso mesmo que a revalidação de cache falhe
//                        (ver `tentarRevalidar` abaixo).
//   D5                — texto vazio (ou só espaço/quebra de linha) devolvido
//                        pelo motor NÃO é sucesso: recusa, nada é gravado,
//                        mensagem explica que pode ser áudio mudo.
//   D6 (teste)        — suíte passa a assertar, com os textos EXATOS, que
//                        "erro ao ler do banco" e "sessão não encontrada"
//                        são mensagens diferentes (as duas já eram
//                        tratadas em branches distintos; o que faltava era
//                        a prova).
//   D7                — política do tipo de arquivo invertida: de "lista de
//                        PROIBIDOS" (que rejeitava só o obviamente errado e
//                        deixava passar qualquer coisa desconhecida, INCLUSIVE
//                        `video/mp4` — o formato real de gravação do
//                        Meet/Zoom) para uma lista de PERMITIDOS. Lista de
//                        proibidos falha por OMISSÃO — foi assim que as
//                        Tarefas 15 e 16 sangraram (link_gravacao e
//                        `workspace_id` de formulário) — e aqui repetiria o
//                        erro na direção oposta: recusando o caso real e
//                        aceitando o desconhecido.
//
// REVISADO DE NOVO (segunda rodada de laudo). Cinco defeitos a mais:
//   D8                — a correção do D4 tinha ficado pela metade: o
//                        `await caminhoFichaDaSessao(...)` — uma SEGUNDA ida
//                        ao Postgres — continuava dentro do `try` geral,
//                        DEPOIS do UPDATE já confirmado. Se ele rejeitasse,
//                        o catch geral devolvia `ok:false` sobre uma
//                        transcrição JÁ SALVA, e a retentativa queimava uma
//                        segunda chamada paga da Groq. Agora tem try/catch
//                        próprio (`caminhoDaFichaSemDerrubarOSucesso`).
//   D9                — o bailout dinâmico do Next (`digest` começando com
//                        `DYNAMIC_SERVER_USAGE`) era ENGOLIDO aqui, contra
//                        o padrão explícito da casa em
//                        `src/lib/data/simulacao.ts:42` e
//                        `src/lib/integracoes/google-agenda-escrita.ts:249`.
//                        Todos os catches deste arquivo passam a relançá-lo.
//   D10               — `nomeDaExcecao` e `codigoDe` prometiam `string` na
//                        assinatura e confiavam no runtime: `.name` vindo de
//                        getter e `error.code` como objeto/array chegavam
//                        crus ao `console.warn`. Agora `String(x).slice(0,
//                        40)` nos dois.
//   D11               — `.trim()` não pega caractere de LARGURA ZERO
//                        (U+200B/200C/200D/FEFF no meio): um texto feito só
//                        deles passava e era gravado. `pareceVazio` fecha —
//                        só para DECIDIR se é vazio; o texto real continua
//                        gravado cru.
//   D12 (teste)       — o marcador único só era plantado em cenários de
//                        FALHA. Ganhou espião dos CINCO canais de `console`
//                        no caminho FELIZ (onde o texto existe) e no de erro
//                        da Groq (onde a exceção pode ecoar o corpo).
//
// QUEM DISPARA É UMA PESSOA, SEMPRE (decisão 1.3 do desenho). Não há cron,
// não há gatilho de banco, nada dispara esta função sozinho — o único jeito
// de `transcreverSessao` rodar é um `<form action={transcreverSessao}>`
// (ou chamada equivalente) vindo de um clique humano. Se um dia alguém
// sentir vontade de agendar isto (ex.: transcrever toda sessão realizada
// automaticamente), a resposta é NÃO fazer aqui — é decisão de desenho
// registrada, não esquecimento.
//
// A SESSÃO VEM DO BANCO, NUNCA DO FORMULÁRIO. Esta ação lê do `formData`
// somente `sessaoId` e `substituir` (a flag de sobrescrita). O áudio vem da
// referência privada já vinculada à sessão. Qualquer `workspaceId`, `mentoradoId` ou outro campo de
// identidade que o formulário tente mandar junto é ignorado — quem decide
// se esta sessão pertence a este workspace é a política de RLS de
// `public.sessao` (mesma disciplina do cabeçalho de `acoes.ts` e
// `acoes-calendario.ts`), aplicada no `.eq("id", sessaoId)` abaixo. Sessão
// inexistente e sessão de outro workspace chegam ao mesmo resultado —
// `maybeSingle()` devolve `null` dos dois jeitos.
//
// ORDEM OBRIGATÓRIA DAS CHECAGENS (nenhuma delas gasta uma chamada cara
// sem precisar):
//   1. `sessaoId` válido (zod) — sem isso nem o cliente Supabase nasce.
//   2. Limites do ARQUIVO — 0 byte, tamanho máximo (25 MB, o teto da
//      própria Groq), tipo que claramente não é áudio/vídeo de reunião.
//      TUDO isso é checado ANTES de qualquer chamada externa: não faz
//      sentido esperar um upload de 200 MB só para a Groq devolver 413 do
//      outro lado, e não faz sentido gastar a chamada para descobrir que o
//      arquivo era uma foto.
//   3. Sessão existe no banco (senão nenhuma chamada de rede a mais).
//   4. Sessão já tem transcrição e não veio `substituir=1` → recusa AQUI,
//      antes de chamar a Groq — chamar e jogar fora o resultado seria
//      gastar o crédito à toa por uma escrita que já sabemos que vamos
//      recusar.
//   5. SÓ ENTÃO `transcreverAudio` é chamada (a "chamada externa" da regra
//      "chamada externa primeiro, banco depois, e só grava se a externa deu
//      certo" — aqui a ordem é: validações locais primeiro, DEPOIS a
//      chamada externa, DEPOIS o banco, e o banco só é tocado se a externa
//      confirmou sucesso E devolveu texto de verdade — ver D5).
//
// PROVIDER "DEMO" NUNCA CHEGA AO BANCO. Sem `GROQ_API_KEY`,
// `transcreverAudio` (`src/lib/integracoes/stt.ts`) devolve um texto fixo
// de demonstração com `provider: "demo"` — e esta ação RECUSA gravar
// quando vê esse provider. Gravar seria dar de "informação real da sessão
// de um cliente" a um texto de exemplo; um mês depois, ninguém saberia que
// aquela frase na ficha nunca veio de um áudio de verdade. É a mesma regra
// de "nunca inventar dado" que rege o resto do produto (ver `dados.ts`).
//
// TEXTO VAZIO TAMBÉM NÃO CHEGA AO BANCO (D5). Um áudio mudo, um trecho sem
// fala reconhecível ou uma falha silenciosa do motor podem voltar com
// `texto: ""` (ou só espaço/quebra de linha) e `provider: "groq"` — ou
// seja, sem ser "demo", mas também sem nada de útil. Gravar isso marcaria a
// sessão como "já transcrita" (`transcricao_origem` preenchido,
// `transcrita_em` preenchido) sem uma palavra dentro, e a ÚNICA forma de
// tentar de novo passaria a ser a flag de substituição — um áudio mudo
// travaria a sessão nesse estado até alguém perceber e mandar substituir.
// Por isso o texto passa por `pareceVazio` ANTES da escrita — que ignora
// espaço, quebra de linha E caractere de largura zero (D11): vazio nunca é
// sucesso, e nada é gravado. Essa limpeza serve SÓ para decidir; o texto
// gravado continua cru, sem `trim` (editar a fala do cliente não é papel
// desta ação).
//
// `transcricao_origem` GRAVA O PROVIDER DE FATO DEVOLVIDO — nunca um
// literal `"groq"` chumbado no código. Hoje o único provider que passa por
// todas as checagens acima é o da Groq, mas gravar a STRING FIXA em vez do
// `resultado.provider` que voltou da chamada é uma mentira silenciosa
// esperando para acontecer: no dia em que houver um segundo motor, o valor
// chumbado continuaria dizendo "groq" mesmo quando não foi a Groq que
// transcreveu.
//
// `transcricao` E `transcrita_em` SÃO GRAVADOS NA MESMA ESCRITA — um único
// `.update()`, nunca dois. Uma transcrição sem data de origem é um texto
// órfão (ninguém sabe quando foi gerada, nem se é recente o bastante para
// confiar); uma data sem texto é pior — mente sobre a sessão ter sido
// transcrita quando não tem nada lá.
//
// SOBRESCREVER EXIGE A FLAG. Sem `substituir=1` no formulário, uma sessão
// que já tem `transcricao` (ou `transcrita_em`) preenchida é recusada com
// uma mensagem que diz que já existe e como substituir. A alternativa
// considerada — preservar a transcrição anterior num campo de histórico —
// exigiria uma coluna nova, e esta tarefa NÃO TEM migração; por isso a
// decisão foi recusar por padrão, não inventar uma coluna por fora do
// schema versionado.
//
// `transcricao_liberada` NUNCA É TOCADA POR ESTA AÇÃO. Ligar a visibilidade
// da transcrição para o mentorado é um ato humano separado (mesmo
// raciocínio de `gravacao_liberada`/`transcricao_liberada` em
// `0017_sessao_agenda_gravacao.sql`: começar como "gravou" já implicaria em
// "publicou", e as duas coisas não podem depender de uma pessoa lembrar de
// desmarcar). O `.update()` desta ação nunca inclui essa coluna — nem para
// ligar, nem para desligar.
//
// CONTEÚDO SENSÍVEL NÃO SAI DAQUI ALÉM DO NECESSÁRIO (D1 + decisão 8). O
// retorno desta função nunca carrega o texto transcrito inteiro, nenhum
// `console.warn` daqui carrega mensagem crua de exceção ou de erro do
// banco, e nenhum erro devolvido à tela carrega um trecho da conversa —
// quem quiser ler o texto abre a ficha da sessão (que já respeita a mesma
// RLS de sempre). O único indicador que sai é `caracteres` (tamanho), só no
// caminho de sucesso.
//
// GRAVAÇÃO CONFIRMADA → RESPOSTA É SUCESSO, PONTO (D4 + D8). Depois que o
// `.update()` volta sem erro, nada que aconteça a seguir pode transformar
// essa resposta em `ok:false`. São DOIS passos depois da escrita, e cada um
// tem o seu próprio try/catch: a busca do caminho da ficha
// (`caminhoDaFichaSemDerrubarOSucesso` — uma SEGUNDA ida ao Postgres, que
// pode rejeitar) e as duas chamadas de `revalidatePath` (`tentarRevalidar`,
// uma por caminho, para que a falha de uma não impeça a outra). Se qualquer
// um deles pudesse derrubar a resposta, a pessoa veria "não foi possível
// transcrever", tentaria de novo, e a retentativa chamaria a Groq PELA
// SEGUNDA VEZ pelo mesmo áudio — queimando outra chamada paga da cota
// gratuita por um problema que, na verdade, já tinha sido resolvido (a
// transcrição já estava salva). Uma tela desatualizada até o próximo
// carregamento é um problema menor do que isso.
//
// A ÚNICA exceção é o bailout dinâmico do Next (D9), que SOBE em vez de
// virar resposta — e subir não é `ok:false`: é devolver ao framework uma
// sinalização que só ele sabe tratar. Ver `relancarSeForBailoutDoNext`.

import { revalidatePath } from "next/cache";
import { createHash } from "node:crypto";
import { z } from "zod";
import { criarSupabaseServer } from "../supabase/server";
import { transcreverAudio } from "../integracoes/stt";

/** Linha crua do PostgREST — cada campo é lido explicitamente abaixo, nunca repassado com `as Tipo`. */
type Row = Record<string, unknown>;

function comoRow(v: unknown): Row | null {
  return v !== null && typeof v === "object" ? (v as Row) : null;
}

function textoDe(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export interface ResultadoTranscricao {
  ok: boolean;
  /** Motivo em português, para humano. Presente quando `ok` é falso. Nunca contém o texto transcrito nem detalhe de banco/Groq. */
  erro?: string;
  /** Só presente no caminho feliz — indicador de tamanho, NUNCA o texto em si (ver cabeçalho do arquivo). */
  caracteres?: number;
}

// ============================================================
// Mensagens — genéricas de propósito (mesma regra de `acoes-calendario.ts`:
// nunca tabela, coluna, id, SQL ou o texto sensível da sessão na tela; o
// detalhe técnico vai só para `avisar`/`console.warn`, e mesmo lá sem
// mensagem crua — ver D1).
//
// EXPORTADAS `MOTIVO_ERRO_LEITURA` e `MOTIVO_SESSAO_NAO_ENCONTRADA` (D6): o
// teste precisa provar que "erro ao falar com o banco" e "sessão não
// existe" são DUAS mensagens diferentes, com o texto exato de cada uma —
// não só "os dois retornam ok:false".
// ============================================================

export const MOTIVO_SESSAO_INVALIDA = "Informe a sessão que deseja transcrever.";
export const MOTIVO_SESSAO_NAO_ENCONTRADA = "Sessão não encontrada.";
export const MOTIVO_ERRO_LEITURA = "Não foi possível carregar os dados da sessão agora. Tente novamente em instantes.";
export const MOTIVO_SEM_CONSENTIMENTO_TRANSCRICAO =
  "A transcrição automática exige consentimento explícito antes do envio.";
const MOTIVO_ERRO_GRAVAR = "A transcrição foi gerada, mas não foi possível salvá-la agora. Tente novamente em instantes.";
const MOTIVO_ERRO_INESPERADO = "Não foi possível transcrever esta sessão agora. Tente novamente em instantes.";
const MOTIVO_ERRO_TRANSCREVER = "Não foi possível transcrever este áudio agora. Tente novamente em instantes.";
const MOTIVO_AUDIO_NAO_VINCULADO = "Vincule primeiro um áudio privado a esta sessão.";
const MOTIVO_AUDIO_ALTERADO = "O áudio privado não passou na verificação de integridade. Vincule-o novamente antes de transcrever.";

const MOTIVO_ARQUIVO_AUSENTE = "Selecione um arquivo de áudio para transcrever.";
export const MOTIVO_ARQUIVO_VAZIO = "O arquivo de áudio está vazio.";
export const MOTIVO_ARQUIVO_NAO_AUDIO =
  "O arquivo selecionado não parece ser um áudio nem uma gravação de chamada (Meet/Zoom) reconhecida.";

// 25 MB — o teto que a própria Groq aplica (mesmo limite documentado em
// `src/app/api/transcrever/route.ts`, `MAX_BYTES`). Checar aqui, ANTES de
// enviar, poupa a pessoa de esperar um upload que ia morrer do outro lado.
const LIMITE_MB = 25;
const LIMITE_BYTES = LIMITE_MB * 1024 * 1024;
export const MOTIVO_ARQUIVO_GRANDE = `O arquivo passa de ${LIMITE_MB} MB (limite da Groq); corte ou comprima o áudio antes de enviar.`;

export const MOTIVO_DEMO_NAO_CONFIGURADO =
  "A transcrição automática não está configurada neste ambiente (falta a chave da Groq). Configure-a antes de transcrever sessões reais — nenhum texto de demonstração é salvo.";

export const MOTIVO_JA_TRANSCRITA =
  "Esta sessão já tem uma transcrição. Para substituir, marque a opção de substituir e envie de novo.";

export const MOTIVO_TRANSCRICAO_VAZIA =
  "A transcrição voltou vazia — o áudio pode estar mudo, sem fala reconhecível, ou o motor falhou silenciosamente. Nada foi salvo; tente novamente com outro arquivo.";

/**
 * Loga só o PONTO do código e um detalhe curto e SEGURO — nunca a mensagem
 * crua de uma exceção, nunca `.message` de um erro do Postgrest, e nunca o
 * texto transcrito (D1). `detalhe` só pode ser um código curto de erro do
 * banco (`error.code`, algo como "PGRST301" — nunca `error.message`) ou o
 * `.name` de uma exceção JS (algo como "TypeError" — nunca `.message`), e
 * em ambos os casos já passado por `String(...).slice(0, 40)` (D10), porque
 * a assinatura dizer `string` não impede o runtime de entregar outra coisa.
 *
 * A FALHA QUE ISTO CORRIGE: antes desta revisão, o catch GERAL no fim de
 * `transcreverSessao` repassava `excecao.message` cru para `console.warn`.
 * O catch da chamada à Groq, alguns parágrafos acima, já tinha sido escrito
 * com essa disciplina — mas o catch de fora, que também envolve o
 * `.update()` que grava a transcrição, não. Se esse `.update()` lançasse
 * (em vez de devolver `{ error }`, que é o caminho normal do supabase-js) e
 * a exceção ecoasse o corpo da requisição, a transcrição inteira — a
 * conversa do cliente — ia parar no log. Blindar uma porta e deixar a do
 * lado aberta é exatamente o defeito que as Tarefas 15 e 16 já pagaram.
 */
function avisar(operacao: string, detalhe?: string): void {
  console.warn(`[mentoria/acoes-transcricao] ${operacao} falhou`, detalhe ?? "");
}

/**
 * O bailout dinâmico do Next SOBE; o resto, não (D9).
 *
 * Cópia deliberada do `catch` de `simulacaoLigada`
 * (`src/lib/data/simulacao.ts:42`) e de `relancarSeForBailoutDoNext`
 * (`src/lib/integracoes/google-agenda-escrita.ts:249`) — mesmo `digest`,
 * mesma decisão. Um `DynamicServerError` não é falha desta ação: é o PRÓPRIO
 * Next sinalizando que a renderização precisa desistir do cache. Engolir
 * esse erro faria a página ser cacheada com o resultado errado, sem nenhum
 * sintoma visível. Note que isto NÃO contradiz "gravação confirmada →
 * resposta é sucesso": um bailout não vira `ok:false`, ele nem chega a
 * virar resposta — sobe para o framework, que é quem sabe o que fazer com
 * ele. O que a regra proíbe é uma falha DESTA ação virar `ok:false` depois
 * do UPDATE, e isso continua valendo.
 */
function relancarSeForBailoutDoNext(erro: unknown): void {
  const digest = (erro as { digest?: unknown } | null)?.digest;
  if (typeof digest === "string" && digest.startsWith("DYNAMIC_SERVER_USAGE")) throw erro;
}

/**
 * Teto de tamanho do detalhe que vai para o log (D10).
 *
 * As duas funções abaixo prometem `string` na assinatura, mas o runtime não
 * garante nada: `.name` pode vir de um getter e `error.code` pode chegar
 * como objeto ou array de uma biblioteca de terceiro. Se qualquer um deles
 * carregar o corpo da requisição, ele vai cru para o `console.warn` — e o
 * corpo, aqui, é a conversa do cliente. `String(x)` normaliza o que não é
 * string; o corte em 40 garante que nada com tamanho de fala passa. Código
 * de Postgrest ("PGRST301") e nome de exceção ("TypeError") cabem folgados.
 */
const MAX_DETALHE_LOG = 40;

/** `error.code` do supabase-js — nunca `error.message` (ver `avisar`). */
function codigoDe(erro: { code?: string } | null | undefined): string {
  return String(erro?.code ?? "sem-codigo").slice(0, MAX_DETALHE_LOG);
}

/** `.name` de uma exceção JS — nunca `.message` (ver `avisar`). */
function nomeDaExcecao(excecao: unknown): string {
  return String(excecao instanceof Error ? excecao.name : "excecao-nao-error").slice(0, MAX_DETALHE_LOG);
}

/** A ficha para onde a tela volta — "" cai na carteira (sessão de turma não tem UM mentorado). */
function caminhoFicha(mentoradoId: string): string {
  return mentoradoId ? `/mentoria/${mentoradoId}` : "/mentoria";
}

// ============================================================
// Validação do arquivo — TUDO antes de qualquer chamada externa (decisão 2
// do plano). Cada limite tem o seu próprio motivo de recusa, testado em
// isolado.
//
// D7 — LISTA DE PERMITIDOS, NÃO DE PROIBIDOS. A versão anterior recusava só
// o que começava com um tipo claramente não-áudio e ACEITAVA qualquer outra
// coisa (inclusive vazio, inclusive `video/mp4`) — uma lista de proibidos
// falha por OMISSÃO: todo tipo que ninguém pensou em proibir passa. Isso
// tanto deixa passar lixo (um `application/x-alguma-coisa` qualquer) quanto
// — pior, o defeito real achado na revisão — RECUSA o caso mais comum:
// gravação de call do Meet/Zoom, que sai em `video/mp4` ou `video/webm`, e
// que é justamente o arquivo que o mentor tem na mão para transcrever. A
// correção inverte a política: só o que está na lista abaixo passa. Sem
// `type` (o navegador às vezes omite), a decisão cai para a EXTENSÃO do
// nome do arquivo, com a MESMA lista de permitidos — nunca "sem tipo, então
// deixa passar".
// ============================================================

/** MIME de áudio "puro" — qualquer subtipo depois de `audio/` é aceito. */
const PREFIXO_AUDIO = "audio/";

/**
 * Contêineres de VÍDEO que carregam áudio de reunião e que a Groq aceita —
 * é o formato real de gravação do Google Meet (`video/webm`) e do Zoom
 * (`video/mp4`), então recusá-los recusaria o caso de uso que esta tarefa
 * existe para atender.
 */
const TIPOS_VIDEO_PERMITIDOS = new Set(["video/mp4", "video/webm", "video/mpeg", "video/quicktime"]);

/** Extensões aceitas pela API de transcrição da Groq, mais os contêineres de vídeo do parágrafo acima. */
const EXTENSOES_PERMITIDAS = new Set([
  "mp3",
  "mpga",
  "mpeg",
  "m4a",
  "wav",
  "flac",
  "ogg",
  "oga",
  "webm",
  "mp4",
  "mov",
]);

function extensaoDe(nomeArquivo: string): string {
  const partes = nomeArquivo.split(".");
  if (partes.length < 2) return "";
  return (partes[partes.length - 1] ?? "").trim().toLowerCase();
}

/**
 * Decide SÓ por permitidos: `type` (quando presente) precisa começar com
 * `audio/` ou estar na lista de vídeo de reunião; `type` ausente cai para a
 * extensão do nome, contra a MESMA lista. Sem `type` e sem extensão
 * reconhecida, recusa — a ausência de informação nunca é tratada como sinal
 * de "deve ser válido".
 */
function arquivoTemTipoPermitido(tipo: string, nomeArquivo: string): boolean {
  const tipoNormalizado = tipo.trim().toLowerCase();
  if (tipoNormalizado !== "") {
    return tipoNormalizado.startsWith(PREFIXO_AUDIO) || TIPOS_VIDEO_PERMITIDOS.has(tipoNormalizado);
  }
  const extensao = extensaoDe(nomeArquivo);
  return extensao !== "" && EXTENSOES_PERMITIDAS.has(extensao);
}

/**
 * Caracteres de LARGURA ZERO, que o `.trim()` da linguagem não remove
 * (U+FEFF ele remove nas pontas, mas não no meio) e que fala nenhuma
 * precisa: zero-width space, non-joiner, joiner e BOM. Um texto feito só
 * deles é tão vazio quanto `""` — mas ocuparia espaço, marcaria a sessão
 * como "já transcrita" e travaria a retentativa atrás da flag de
 * substituição. Uma transcrição vazia que ocupa espaço é pior do que uma
 * vazia declarada.
 */
const LARGURA_ZERO = /[\u200B\u200C\u200D\uFEFF]/g;

/**
 * SÓ DECIDE SE O TEXTO É VAZIO — nunca produz o texto que vai ser gravado.
 * O texto real é gravado CRU, sem `trim` e sem remoção de nada: editar a
 * fala do cliente não é papel desta ação (`"  fala  "` grava 8 caracteres,
 * de propósito).
 */
function pareceVazio(texto: string): boolean {
  return texto.replace(LARGURA_ZERO, "").trim() === "";
}

export type ArquivoValidado = { ok: true; blob: Blob; nome: string } | { ok: false; erro: string };

export function validarArquivo(bruto: FormDataEntryValue | null): ArquivoValidado {
  if (!(bruto instanceof Blob)) return { ok: false, erro: MOTIVO_ARQUIVO_AUSENTE };
  if (bruto.size === 0) return { ok: false, erro: MOTIVO_ARQUIVO_VAZIO };
  if (bruto.size > LIMITE_BYTES) return { ok: false, erro: MOTIVO_ARQUIVO_GRANDE };
  const nome = bruto instanceof File ? bruto.name : "";
  if (!arquivoTemTipoPermitido(bruto.type, nome)) return { ok: false, erro: MOTIVO_ARQUIVO_NAO_AUDIO };
  return { ok: true, blob: bruto, nome: nome || "audio.mp3" };
}

// ============================================================
// caminhoFichaDaSessao — mesma ideia de `buscarContexto` em
// `acoes-calendario.ts`, mas enxuta: só o suficiente para saber para qual
// ficha revalidar depois de gravar. Sessão de turma (sem matrícula) cai na
// carteira geral, igual ao resto do produto.
// ============================================================

async function caminhoFichaDaSessao(
  s: ReturnType<typeof criarSupabaseServer>,
  sessaoRow: Row
): Promise<string> {
  const matriculaId = textoDe(sessaoRow.matricula_id);
  if (matriculaId === "") return caminhoFicha("");

  const { data: matriculaData, error: erroMatricula } = await s
    .from("matricula")
    .select("*")
    .eq("id", matriculaId)
    .maybeSingle();
  if (erroMatricula) {
    avisar("caminhoFicha/matricula", codigoDe(erroMatricula));
    return caminhoFicha("");
  }
  const matriculaRow = comoRow(matriculaData);
  return caminhoFicha(textoDe(matriculaRow?.mentorado_id));
}

/**
 * A busca do caminho da ficha SEM poder virar `ok:false` (D8).
 *
 * `caminhoFichaDaSessao` é uma SEGUNDA ida ao Postgres, e ela acontece
 * DEPOIS do `.update()` já confirmado. Ela trata o `{ error }` do
 * supabase-js, mas não trata a REJEIÇÃO da promise (rede caiu, cliente
 * lançou) — e, sem este try/catch próprio, essa rejeição subia para o catch
 * geral da ação e devolvia `ok:false` sobre uma transcrição JÁ SALVA: a
 * pessoa via "não foi possível transcrever", tentava de novo, e a
 * retentativa queimava uma SEGUNDA chamada paga da cota gratuita da Groq
 * pelo mesmo áudio. `null` aqui significa "não sei a ficha" — a carteira
 * ainda é revalidada, e a resposta continua sendo sucesso.
 */
async function caminhoDaFichaSemDerrubarOSucesso(
  s: ReturnType<typeof criarSupabaseServer>,
  sessaoRow: Row
): Promise<string | null> {
  try {
    return await caminhoFichaDaSessao(s, sessaoRow);
  } catch (excecao) {
    relancarSeForBailoutDoNext(excecao);
    avisar("caminhoFicha", nomeDaExcecao(excecao));
    return null;
  }
}

/**
 * `revalidatePath` NUNCA pode transformar uma gravação bem-sucedida em
 * `ok:false` (D4, ver cabeçalho do arquivo) — cada chamada tem o próprio
 * try/catch, para que a falha de uma não impeça a tentativa da outra.
 */
function tentarRevalidar(caminho: string, ponto: string): void {
  try {
    revalidatePath(caminho);
  } catch (excecao) {
    relancarSeForBailoutDoNext(excecao);
    avisar(`revalidatePath/${ponto}`, nomeDaExcecao(excecao));
  }
}

// ============================================================
// transcreverSessao
// ============================================================

const TranscreverSchema = z.object({
  // Mesma folga de `SincronizarSchema` em `acoes-calendario.ts`: acima de
  // um uuid (36), pequena o bastante para recusar um payload absurdo sem
  // ir até o banco.
  sessaoId: z.string().trim().min(1, MOTIVO_SESSAO_INVALIDA).max(100, MOTIVO_SESSAO_NAO_ENCONTRADA),
});

function caminhoPertenceASessao(caminho: string, workspaceId: unknown, sessaoId: string): boolean {
  const workspace = typeof workspaceId === "string" ? workspaceId.trim() : "";
  return workspace !== "" && caminho.startsWith(`${workspace}/sessao/${sessaoId}/`);
}

async function hashDoBlob(arquivo: Blob): Promise<string> {
  return createHash("sha256").update(Buffer.from(await arquivo.arrayBuffer())).digest("hex");
}

export async function transcreverSessao(formData: FormData): Promise<ResultadoTranscricao> {
  // Campos de controle lidos do formulário — ver cabeçalho deste arquivo.
  // Qualquer `workspaceId`, `mentoradoId` ou outro campo de identidade é
  // ignorado: nem é lido aqui, quanto mais usado numa consulta.
  const resultadoValidacao = TranscreverSchema.safeParse({
    sessaoId: String(formData.get("sessaoId") ?? ""),
  });
  if (!resultadoValidacao.success) {
    return { ok: false, erro: resultadoValidacao.error.issues[0]?.message ?? MOTIVO_SESSAO_INVALIDA };
  }
  const { sessaoId } = resultadoValidacao.data;
  // O ÚNICO caminho de sobrescrita é este campo com valor exatamente "1" —
  // "true", "sim", "on" ou qualquer outra coisa NÃO conta (decisão 5 do
  // plano: um único caminho, sem ambiguidade de formato).
  const substituir = String(formData.get("substituir") ?? "") === "1";

  try {
    const s = criarSupabaseServer();

    const { data: sessaoData, error: erroSessao } = await s
      .from("sessao")
      .select("*")
      .eq("id", sessaoId)
      .maybeSingle();
    if (erroSessao) {
      avisar("sessao", codigoDe(erroSessao));
      return { ok: false, erro: MOTIVO_ERRO_LEITURA };
    }
    const sessaoRow = comoRow(sessaoData);
    // RLS: sessão inexistente OU de outro workspace chegam ao mesmo `null`
    // — mesma disciplina de `acoes-calendario.ts`. Nenhuma chamada à Groq
    // acontece a partir daqui se a sessão não existir. Mensagem DIFERENTE
    // da de erro de leitura acima (D6) — uma diz "não deu para checar",
    // a outra diz "checamos, não existe/não é sua".
    if (!sessaoRow) return { ok: false, erro: MOTIVO_SESSAO_NAO_ENCONTRADA };

    // Portão 2: a autorização é por SESSÃO, jamais pelo consentimento geral
    // do mentorado. A RLS entrega apenas a linha da sessão acessível ao ator;
    // o formulário não escolhe nem substitui esta evidência.
    const { data: consentimentoData, error: erroConsentimento } = await s
      .from("sessao_transcricao_consentimento")
      .select("sessao_id, consentido")
      .eq("sessao_id", sessaoId)
      .maybeSingle();
    if (erroConsentimento) {
      avisar("consentimento/transcricao", codigoDe(erroConsentimento));
      return { ok: false, erro: MOTIVO_ERRO_LEITURA };
    }
    const consentimento = comoRow(consentimentoData);
    if (consentimento?.sessao_id !== sessaoId || consentimento.consentido !== true) {
      return { ok: false, erro: MOTIVO_SEM_CONSENTIMENTO_TRANSCRICAO };
    }

    // O navegador não fornece o Blob à transcrição. O único áudio elegível é
    // a referência privada criada pela ação de vínculo, no mesmo `sessaoId`.
    const { data: referenciaData, error: erroReferencia } = await s
      .from("sessao_transcricao_arquivo")
      .select("sessao_id, caminho_storage, sha256, arquivado")
      .eq("sessao_id", sessaoId)
      .maybeSingle();
    if (erroReferencia) {
      avisar("referencia/transcricao", codigoDe(erroReferencia));
      return { ok: false, erro: MOTIVO_ERRO_LEITURA };
    }
    const referencia = comoRow(referenciaData);
    const caminhoStorage = typeof referencia?.caminho_storage === "string" ? referencia.caminho_storage.trim() : "";
    const hashEsperado = typeof referencia?.sha256 === "string" ? referencia.sha256.trim().toLowerCase() : "";
    if (
      referencia?.sessao_id !== sessaoId ||
      referencia.arquivado === true ||
      !caminhoPertenceASessao(caminhoStorage, sessaoRow.workspace_id, sessaoId) ||
      !/^[a-f0-9]{64}$/.test(hashEsperado)
    ) {
      return { ok: false, erro: MOTIVO_AUDIO_NAO_VINCULADO };
    }
    const { data: audioPrivado, error: erroDownload } = await s.storage.from("transcricoes").download(caminhoStorage);
    if (erroDownload || !(audioPrivado instanceof Blob)) {
      avisar("referencia/download", erroDownload ? "storage" : "blob ausente");
      return { ok: false, erro: MOTIVO_ERRO_LEITURA };
    }
    if ((await hashDoBlob(audioPrivado)) !== hashEsperado) {
      return { ok: false, erro: MOTIVO_AUDIO_ALTERADO };
    }

    // Sessão já transcrita + sem `substituir=1` → recusa AQUI, antes de
    // gastar a chamada à Groq com um resultado que já sabemos que vamos
    // jogar fora (decisão 4 do plano).
    const jaTemTranscricao = textoDe(sessaoRow.transcricao) !== "" || textoDe(sessaoRow.transcrita_em) !== "";
    if (jaTemTranscricao && !substituir) {
      return { ok: false, erro: MOTIVO_JA_TRANSCRITA };
    }

    // A CHAMADA EXTERNA. Só a partir daqui o áudio de fato viaja para a
    // Groq (ou cai no ramo demo, sem rede nenhuma, dentro de
    // `transcreverAudio`). `transcreverAudio` LANÇA em erro HTTP (ver
    // `src/lib/integracoes/stt.ts`) — captura local, nunca deixa subir como
    // exceção não tratada, e sobretudo: nada do banco é tocado neste ramo.
    let resultado: { texto: string; provider: "groq" | "demo" };
    try {
      resultado = await transcreverAudio(audioPrivado, caminhoStorage.split("/").at(-1) || "audio");
    } catch (excecaoGroq) {
      relancarSeForBailoutDoNext(excecaoGroq);
      // Nunca o corpo da resposta da Groq aqui — só que a chamada falhou.
      avisar("transcreverAudio", nomeDaExcecao(excecaoGroq));
      return { ok: false, erro: MOTIVO_ERRO_TRANSCREVER };
    }

    // PROVIDER "DEMO" NUNCA CHEGA AO BANCO — ver cabeçalho do arquivo.
    if (resultado.provider === "demo") {
      return { ok: false, erro: MOTIVO_DEMO_NAO_CONFIGURADO };
    }

    // TEXTO VAZIO TAMBÉM NÃO CHEGA AO BANCO (D5) — ver cabeçalho do
    // arquivo. `pareceVazio` pega `""`, "só espaço", "só quebra de linha" e
    // também "só caractere de largura zero" (D11): nenhum deles é uma
    // transcrição de verdade. O texto GRAVADO abaixo continua cru.
    if (pareceVazio(resultado.texto)) {
      return { ok: false, erro: MOTIVO_TRANSCRICAO_VAZIA };
    }

    // `transcricao` e `transcrita_em` na MESMA escrita, e `transcricao_origem`
    // é o `resultado.provider` DE FATO devolvido — nunca um literal
    // chumbado (decisão 3 do plano). `transcricao_liberada` não aparece
    // aqui: esta ação nunca a toca, nem para ligar nem para desligar.
    const { error: erroGravar } = await s
      .from("sessao")
      .update({
        transcricao: resultado.texto,
        transcrita_em: new Date().toISOString(),
        transcricao_origem: resultado.provider,
      })
      .eq("id", sessaoId);
    if (erroGravar) {
      avisar("gravar transcricao", codigoDe(erroGravar));
      return { ok: false, erro: MOTIVO_ERRO_GRAVAR };
    }

    // GRAVAÇÃO CONFIRMADA — a partir daqui a resposta É sucesso, mesmo que
    // a revalidação de cache falhe (D4, ver `tentarRevalidar` e o
    // cabeçalho do arquivo). Cada chamada tem seu próprio try/catch: a
    // falha de uma não impede a tentativa da outra.
    // `null` = a busca da ficha falhou; a carteira ainda é revalidada e a
    // resposta continua sendo sucesso (ver `caminhoDaFichaSemDerrubarOSucesso`).
    const caminho = await caminhoDaFichaSemDerrubarOSucesso(s, sessaoRow);
    if (caminho !== null) tentarRevalidar(caminho, "ficha");
    tentarRevalidar("/mentoria", "carteira");

    // Só o indicador de tamanho sai daqui — nunca o texto (decisão 8).
    return { ok: true, caracteres: resultado.texto.length };
  } catch (excecao) {
    relancarSeForBailoutDoNext(excecao);
    // Nunca `excecao.message` aqui (D1) — só o `.name`, que não carrega
    // corpo de requisição nenhum.
    avisar("transcreverSessao", nomeDaExcecao(excecao));
    return { ok: false, erro: MOTIVO_ERRO_INESPERADO };
  }
}
