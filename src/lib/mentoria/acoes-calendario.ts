// NOTA DE FRONTEIRA (Tarefa 18): este arquivo NAO carrega mais "use server".
// Um modulo "use server" so pode EXPORTAR funcao async -- e este exporta
// tambem as constantes de mensagem, que os testes e a tela leem. Enquanto
// ninguem importava este arquivo, o Next nunca chegou a aplicar a regra; a
// ficha passou a importar, e o build quebrou na hora. A saida NAO foi
// esconder as constantes: foi reconhecer que a fronteira de Server Action
// e `acoes-ficha.ts`, o unico modulo que os formularios chamam. Daqui para
// baixo e biblioteca de servidor comum, chamada por aquela fronteira e
// pelas rotas -- e por isso pode exportar o que quiser.

// Server Action que amarra uma sessão de mentoria ao evento correspondente
// na agenda do Google — Tarefa 16 do plano. Mesma casa de `acoes.ts`
// (validação na borda, `revalidatePath` depois de escrever), mas o formato
// de retorno é diferente de propósito: `agendarSessao`/`darBaixaNaSessao`
// terminam com `redirect()` porque nascem de um `<form action={...}>`
// simples; esta ação devolve um OBJETO (mesmo padrão de
// `aprovarEnvioWhatsapp` em `src/lib/actions.ts`), porque quem chama
// precisa do `.ics` de volta no caminho degradado — um `redirect()` não
// carrega um arquivo para download junto.
//
// ORDEM OBRIGATÓRIA — GOOGLE PRIMEIRO, BANCO DEPOIS. Só gravamos
// `sessao.evento_google_id` depois de `criarEventoDaSessao` devolver
// `ok: true`. O contrário — gravar o id otimisticamente e só then tentar
// criar — deixaria o banco afirmando uma sincronização que não aconteceu; e
// pior: a PRÓXIMA sincronização veria `evento_google_id` preenchido e
// chamaria `atualizarEventoDaSessao` num id que nunca existiu no Google,
// errando para sempre até alguém limpar a coluna na mão.
//
// SE O GOOGLE CRIAR O EVENTO E O BANCO FALHAR AO GRAVAR O ID (revisão
// independente, MÉDIO 3): a primeira versão desta ação só avisava "sincronize
// de novo" — e sincronizar de novo, com `evento_google_id` ainda vazio no
// banco, cai direto no ramo de CRIAR outra vez, duplicando exatamente o
// evento que a mensagem dizia evitar. A correção é uma AÇÃO COMPENSATÓRIA:
// `cancelarEventoDaSessao` no evento recém-criado, desfazendo no Google o que
// não coube gravar no banco. Só quando a PRÓPRIA compensação falha (Google
// fora do ar bem naquela janela) é que a mensagem muda para avisar que existe
// um evento solto — porque, nesse ponto, é verdade.
//
// A SESSÃO VEM DO BANCO, NUNCA DO FORMULÁRIO. O único campo que este
// arquivo lê de `formData` é `sessaoId` — mentorado, programa, matrícula,
// turma e QUALQUER `workspace_id` que o formulário tente mandar são
// ignorados: quem decide se esta sessão pertence a este workspace é a
// política de RLS de `public.sessao` (mesma disciplina do cabeçalho de
// `acoes.ts`), aplicada no `.eq("id", sessaoId)` abaixo. Sessão inexistente
// e sessão de outro workspace chegam ao mesmo resultado — `maybeSingle()`
// devolve `null` dos dois jeitos — e é assim que deve ser: dizer "existe,
// mas não é sua" vazaria a existência de uma linha de outro workspace.
//
// O CAMINHO DEGRADADO (.ics) NUNCA FINGE QUE SINCRONIZOU. Sem conexão com o
// Google (cookie ausente) ou sem o app configurado (credenciais do
// servidor), esta ação NÃO tenta nenhuma chamada à API — só monta um
// convite `.ics` (`montarIcs`, `src/lib/integracoes/ics.ts`) a partir do
// MESMO `EventoDeCalendario` que iria para o Google (nunca um texto escrito
// à parte) e devolve `ok: false` com o motivo certo para a causa certa (ver
// `MOTIVO_SEM_CONEXAO_GOOGLE` vs. `MOTIVO_APP_NAO_CONFIGURADO`) — a tela
// nunca pode ler `ok: true` para uma sincronização que não aconteceu.
//
// O `.ics` DEGRADADO SABE SE A SESSÃO ESTÁ CANCELADA (revisão independente,
// MÉDIO-ALTO 2): a primeira versão degradava sem olhar `sessao.status`, e
// por isso uma sessão CANCELADA sem Google conectado virava um `.ics` de
// CONVITE comum — sem `STATUS:CANCELLED`, sem `METHOD:CANCEL`, com o mesmo
// UID estável de sempre. Quem importasse esse arquivo reativaria, na própria
// agenda, um compromisso que a pessoa cancelou dentro do produto.
//
// A correção NÃO foi mover a checagem de conectividade para dentro dos
// ramos: `googleAppConfigurado()`/`googleConectado()` continuam sendo
// avaliadas UMA vez só, numa passagem única, logo antes do `if (cancelando)`
// — o que mudou é que `cancelando` (= `sessao.status === "cancelada"`) é
// calculado ANTES dessas duas checagens e ENTREGUE a `resultadoDegradado`,
// que repassa a `montarIcs`. Uma passagem, uma decisão de conectividade, e o
// arquivo degradado nascendo com `cancelado: true` quando é o caso.
//
// CANCELAMENTO NUNCA APAGA A LINHA — mesma regra do cabeçalho de
// `acoes.ts`. E, além disso, `evento_google_id` é MANTIDO depois de um
// cancelamento bem-sucedido (decisão travada em teste, ver
// "mantém evento_google_id depois de cancelar"): este produto não tem uma
// ação que devolva uma sessão de "cancelada" para "agendada"
// (`STATUS_BAIXA_VALORES` em `validacao.ts` nem aceita "agendada" como
// destino de baixa) — remarcar é sempre uma sessão NOVA, com o próprio
// `evento_google_id` vazio, então o id antigo nunca seria reaproveitado por
// engano. O que ESTE sistema permite é a CORREÇÃO cancelada → realizada/
// faltou (a pessoa marcou cancelada por engano e corrige depois pela mesma
// tela de baixa) — nesse caminho, manter o id faz a sincronização seguinte
// chamar `atualizarEventoDaSessao` no MESMO evento em vez de criar um
// segundo, duplicado, na agenda do mentor. O preço aceito, e não resolvido
// aqui (fora do escopo desta tarefa — é comportamento de
// `google-agenda-escrita.ts`, Tarefa 15): `atualizarEventoDaSessao` não
// reafirma o campo `status` do evento, então ele pode continuar aparecendo
// "cancelado" no Google até alguém tocar nisso numa tarefa futura. Limpar o
// id trocaria esse problema por um pior — um evento cancelado órfão
// convivendo com um evento novo duplicado — por isso a escolha foi manter.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { criarSupabaseServer } from "../supabase/server";
import { eventoDaSessao, type EventoDeCalendario } from "./calendario";
import { linhaParaMentorado, linhaParaPrograma, linhaParaSessao } from "./dados";
import { STATUS_MENTORADO_PADRAO, type Mentorado, type Programa } from "./tipos";
import {
  atualizarEventoDaSessao,
  cancelarEventoDaSessao,
  criarEventoDaSessao,
} from "../integracoes/google-agenda-escrita";
import { googleAppConfigurado, googleConectado } from "../integracoes/google-agenda";
import { montarIcs } from "../integracoes/ics";

/** Linha crua do PostgREST — cada campo é lido explicitamente abaixo, nunca repassado com `as Tipo`. */
type Row = Record<string, unknown>;

function comoRow(v: unknown): Row | null {
  return v !== null && typeof v === "object" ? (v as Row) : null;
}

function textoDe(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export interface ResultadoSincronizacao {
  ok: boolean;
  /** Motivo em português, para humano. Presente quando `ok` é falso. Nunca é token nem detalhe de banco. */
  erro?: string;
  /**
   * Só presente no caminho degradado (Google não conectado, ou app não
   * configurado): o convite pronto para a pessoa baixar e importar na mão.
   */
  ics?: { nomeArquivo: string; conteudo: string };
}

// ============================================================
// Mensagens — genéricas de propósito (mesma regra 2 de `dados.ts`: nunca
// tabela, coluna, id ou SQL na tela; o detalhe técnico vai só para
// `avisar`/`console.warn`).
// ============================================================

const MOTIVO_SESSAO_INVALIDA = "Informe a sessão que deseja sincronizar.";
const MOTIVO_SESSAO_NAO_ENCONTRADA = "Sessão não encontrada.";
const MOTIVO_ERRO_LEITURA = "Não foi possível carregar os dados da sessão agora. Tente novamente em instantes.";
const MOTIVO_DATA_INVALIDA = "A data desta sessão está inválida; corrija-a antes de sincronizar com a agenda.";
const MOTIVO_ERRO_INESPERADO = "Não foi possível sincronizar esta sessão agora. Tente novamente em instantes.";

// MÉDIO 3 do laudo independente — as DUAS mensagens do desfecho de "Google
// criou, banco não gravou" (ver o parágrafo no cabeçalho do arquivo). Elas
// só podem ser diferentes se a ação compensatória (`cancelarEventoDaSessao`
// no evento recém-criado) tiver, ela mesma, sucesso ou falha — nunca a
// mesma frase para os dois desfechos, porque só um deles ainda deixa um
// evento solto na agenda de alguém.
const MOTIVO_ERRO_GRAVAR_ID_DESFEITO =
  "Não foi possível salvar o vínculo desta sessão com o evento no Google; a criação foi desfeita para não duplicar. Sincronize de novo.";
const MOTIVO_EVENTO_SOLTO =
  "Não foi possível salvar o vínculo desta sessão nem desfazer o evento criado no Google. Apague manualmente o evento duplicado na agenda antes de sincronizar de novo.";

// As DUAS causas de "não deu para falar com o Google" que este arquivo
// resolve com `.ics` — mensagens diferentes porque cada uma tem um
// responsável diferente (mesmo raciocínio do "BAIXO 6" documentado em
// `google-agenda-escrita.ts`; os textos aqui não são os mesmos daquele
// arquivo porque `MOTIVO_SEM_COOKIE`/`MOTIVO_APP_NAO_CONFIGURADO` de lá não
// são exportados — são internos à chamada de escrita em si, não a esta
// decisão de degradar ANTES de tentar).
//
// EXPORTADAS: o teste precisa afirmar o CONTEÚDO exato de cada uma — só
// provar que elas "são diferentes" deixa passar um mutante que TROCA as
// duas entre si (mesmo raciocínio de `CHAVE_ORIGEM_EVENTO` em
// `google-agenda-escrita.ts`).
export const MOTIVO_SEM_CONEXAO_GOOGLE =
  "A agenda do Google não está conectada. Baixe o convite abaixo e importe-o manualmente, ou entre com o Google (Integrações → Agenda) para sincronizar de verdade.";
export const MOTIVO_APP_NAO_CONFIGURADO =
  "Este ambiente ainda não está configurado para falar com o Google. Baixe o convite abaixo e importe-o manualmente.";

function avisar(operacao: string, erro: { code?: string; message?: string }): void {
  console.warn(`[mentoria/acoes-calendario] ${operacao} falhou`, erro.code, erro.message);
}

/** A ficha para onde a tela volta — "" cai na carteira (sessão de turma não tem UM mentorado). */
function caminhoFicha(mentoradoId: string): string {
  return mentoradoId ? `/mentoria/${mentoradoId}` : "/mentoria";
}

/** UID estável por sessão — nunca aleatório (RFC 5545 §3.8.4.7: mesmo UID = mesma reimportação substitui, não duplica). */
function uidDaSessao(sessaoId: string): string {
  return `sessao-${sessaoId}@mentoros`;
}

// ============================================================
// Contexto da sessão — mentorado (ou o "sem mentorado" de turma) + programa,
// buscados do banco a partir da PRÓPRIA sessão, nunca do formulário.
// ============================================================

/**
 * Sessão de TURMA (aula em grupo) não tem UM mentorado — `eventoDaSessao`
 * exige um `Mentorado` só porque o mesmo tipo serve para sessão 1:1, mas
 * `convidadosDaSessao` (`calendario.ts`) já ignora e-mail de mentorado
 * sempre que `turmaId` está preenchido, e `tituloDaSessao` cai no rótulo
 * genérico "Mentoria" quando o nome vem vazio. Por isso este objeto não
 * INVENTA um nome (nem usa `turma.nome`, que é texto livre sem CHECK, o
 * mesmo motivo pelo qual `programa.nome` foi banido da descrição em
 * `calendario.ts`) — ele é, deliberadamente, todo vazio.
 */
const MENTORADO_STUB_TURMA: Mentorado = {
  id: "",
  workspaceId: "",
  alunoId: null,
  perfilId: null,
  nome: "",
  telefone: "",
  email: "",
  origem: "",
  status: STATUS_MENTORADO_PADRAO,
  criadoEm: "",
};

type ResultadoContexto =
  | { ok: true; mentorado: Mentorado; programa: Programa }
  | { ok: false; erro: string };

async function buscarContexto(
  s: ReturnType<typeof criarSupabaseServer>,
  sessaoRow: Row
): Promise<ResultadoContexto> {
  const matriculaId = textoDe(sessaoRow.matricula_id);
  const turmaId = textoDe(sessaoRow.turma_id);

  if (matriculaId !== "") {
    const { data: matriculaData, error: erroMatricula } = await s
      .from("matricula")
      .select("*")
      .eq("id", matriculaId)
      .maybeSingle();
    if (erroMatricula) {
      avisar("contexto/matricula", erroMatricula);
      return { ok: false, erro: MOTIVO_ERRO_LEITURA };
    }
    const matriculaRow = comoRow(matriculaData);
    if (!matriculaRow) return { ok: false, erro: MOTIVO_ERRO_LEITURA };

    const [mentoradoRes, programaRes] = await Promise.all([
      s.from("mentorado").select("*").eq("id", textoDe(matriculaRow.mentorado_id)).maybeSingle(),
      s.from("programa").select("*").eq("id", textoDe(matriculaRow.programa_id)).maybeSingle(),
    ]);
    if (mentoradoRes.error) {
      avisar("contexto/mentorado", mentoradoRes.error);
      return { ok: false, erro: MOTIVO_ERRO_LEITURA };
    }
    if (programaRes.error) {
      avisar("contexto/programa", programaRes.error);
      return { ok: false, erro: MOTIVO_ERRO_LEITURA };
    }
    const mentoradoRow = comoRow(mentoradoRes.data);
    const programaRow = comoRow(programaRes.data);
    if (!mentoradoRow || !programaRow) return { ok: false, erro: MOTIVO_ERRO_LEITURA };

    return {
      ok: true,
      mentorado: linhaParaMentorado(mentoradoRow),
      programa: linhaParaPrograma(programaRow),
    };
  }

  if (turmaId !== "") {
    const { data: turmaData, error: erroTurma } = await s
      .from("turma")
      .select("*")
      .eq("id", turmaId)
      .maybeSingle();
    if (erroTurma) {
      avisar("contexto/turma", erroTurma);
      return { ok: false, erro: MOTIVO_ERRO_LEITURA };
    }
    const turmaRow = comoRow(turmaData);
    if (!turmaRow) return { ok: false, erro: MOTIVO_ERRO_LEITURA };

    const { data: programaData, error: erroPrograma } = await s
      .from("programa")
      .select("*")
      .eq("id", textoDe(turmaRow.programa_id))
      .maybeSingle();
    if (erroPrograma) {
      avisar("contexto/programa", erroPrograma);
      return { ok: false, erro: MOTIVO_ERRO_LEITURA };
    }
    const programaRow = comoRow(programaData);
    if (!programaRow) return { ok: false, erro: MOTIVO_ERRO_LEITURA };

    return { ok: true, mentorado: MENTORADO_STUB_TURMA, programa: linhaParaPrograma(programaRow) };
  }

  // `sessao_vinculo_unico` (0006) garante matrícula OU turma no banco; uma
  // linha que burlou essa CHECK por outro caminho não tem contexto
  // suficiente para virar evento — falha honesta, não invenção de vínculo.
  return { ok: false, erro: MOTIVO_ERRO_LEITURA };
}

// ============================================================
// .ics do caminho degradado — `montarIcs` (`src/lib/integracoes/ics.ts`)
// recebe SÓ os campos que `eventoDaSessao` já produziu (decisão 5 do plano:
// nunca um texto escrito à parte).
// ============================================================

function resultadoDegradado(
  sessaoId: string,
  evento: EventoDeCalendario,
  motivo: string,
  cancelado: boolean
): ResultadoSincronizacao {
  return {
    ok: false,
    erro: motivo,
    ics: {
      nomeArquivo: `sessao-${sessaoId}.ics`,
      conteudo: montarIcs({
        uid: uidDaSessao(sessaoId),
        evento,
        cancelado,
        agoraIso: new Date().toISOString(),
      }),
    },
  };
}

// ============================================================
// sincronizarSessaoNaAgenda
// ============================================================

const SincronizarSchema = z.object({
  // 100 caracteres: folga generosa acima de um uuid (36), pequena o
  // bastante para recusar um payload absurdo sem ir até o banco (mesmo
  // raciocínio de `TarefaIdSchema` em `acoes-portal.ts`).
  sessaoId: z.string().trim().min(1, MOTIVO_SESSAO_INVALIDA).max(100, MOTIVO_SESSAO_NAO_ENCONTRADA),
});

/**
 * O convite `.ics` de uma sessão, SEM tocar no Google.
 *
 * Existe para a rota de download da ficha (o botão que aparece quando a agenda
 * não está conectada). É deliberadamente uma função separada de
 * `sincronizarSessaoNaAgenda`, e não um parâmetro dela: a sincronização
 * ESCREVE na agenda de quem estiver conectado, e um GET nunca pode escrever.
 * Um navegador pré-carregando um link, um antivírus abrindo a URL, um
 * `<link rel="prefetch">` — qualquer um deles dispararia a escrita.
 *
 * Devolve o mesmo `{ ok, erro, ics }` para a tela não precisar aprender um
 * segundo formato, mas aqui `ok` nunca é `true`: não há o que dar certo, só o
 * arquivo pronto ou um motivo humano.
 */
export async function conviteDaSessao(sessaoIdCru: string): Promise<ResultadoSincronizacao> {
  const validacao = SincronizarSchema.safeParse({ sessaoId: String(sessaoIdCru ?? "") });
  if (!validacao.success) {
    return { ok: false, erro: validacao.error.issues[0]?.message ?? MOTIVO_SESSAO_INVALIDA };
  }
  const { sessaoId } = validacao.data;

  try {
    const s = criarSupabaseServer();
    const { data: sessaoData, error: erroSessao } = await s
      .from("sessao")
      .select("*")
      .eq("id", sessaoId)
      .maybeSingle();
    if (erroSessao) {
      avisar("convite/sessao", erroSessao);
      return { ok: false, erro: MOTIVO_ERRO_LEITURA };
    }
    const sessaoRow = comoRow(sessaoData);
    if (!sessaoRow) return { ok: false, erro: MOTIVO_SESSAO_NAO_ENCONTRADA };

    const sessao = linhaParaSessao(sessaoRow);
    const contexto = await buscarContexto(s, sessaoRow);
    if (!contexto.ok) return { ok: false, erro: contexto.erro };

    const evento = eventoDaSessao(sessao, contexto.mentorado, contexto.programa);
    if (!evento) return { ok: false, erro: MOTIVO_DATA_INVALIDA };

    // Sessão cancelada produz arquivo de CANCELAMENTO, não convite — mesma
    // regra do caminho degradado da sincronização.
    return resultadoDegradado(sessaoId, evento, MOTIVO_SEM_CONEXAO_GOOGLE, sessao.status === "cancelada");
  } catch (excecao) {
    // Só o NOME da exceção vai para o log: a mensagem de um erro de rede ou de
    // driver pode ecoar o corpo da requisição, e a linha lida aqui carrega a
    // coluna `transcricao`.
    avisar("conviteDaSessao", { code: excecao instanceof Error ? excecao.name : "excecao" });
    return { ok: false, erro: MOTIVO_ERRO_INESPERADO };
  }
}

export async function sincronizarSessaoNaAgenda(formData: FormData): Promise<ResultadoSincronizacao> {
  // ÚNICO campo lido do formulário. Qualquer `workspaceId`, `mentoradoId`
  // ou outro campo de identidade que o formulário tente mandar junto é
  // ignorado — nem é lido aqui, quanto mais usado numa consulta. Ver o
  // cabeçalho deste arquivo.
  const resultadoValidacao = SincronizarSchema.safeParse({
    sessaoId: String(formData.get("sessaoId") ?? ""),
  });
  if (!resultadoValidacao.success) {
    return { ok: false, erro: resultadoValidacao.error.issues[0]?.message ?? MOTIVO_SESSAO_INVALIDA };
  }
  const { sessaoId } = resultadoValidacao.data;

  try {
    const s = criarSupabaseServer();

    const { data: sessaoData, error: erroSessao } = await s
      .from("sessao")
      .select("*")
      .eq("id", sessaoId)
      .maybeSingle();
    if (erroSessao) {
      avisar("sessao", erroSessao);
      return { ok: false, erro: MOTIVO_ERRO_LEITURA };
    }
    const sessaoRow = comoRow(sessaoData);
    // RLS: sessão inexistente OU de outro workspace chegam ao mesmo `null`
    // — ver o cabeçalho deste arquivo sobre por que essa ambiguidade é
    // proposital. Nenhuma chamada ao Google acontece a partir daqui.
    if (!sessaoRow) return { ok: false, erro: MOTIVO_SESSAO_NAO_ENCONTRADA };

    const sessao = linhaParaSessao(sessaoRow);
    const eventoGoogleIdAtual = textoDe(sessaoRow.evento_google_id);

    const contexto = await buscarContexto(s, sessaoRow);
    if (!contexto.ok) return { ok: false, erro: contexto.erro };

    const evento = eventoDaSessao(sessao, contexto.mentorado, contexto.programa);
    if (!evento) return { ok: false, erro: MOTIVO_DATA_INVALIDA };

    const caminho = caminhoFicha(contexto.mentorado.id);
    const cancelando = sessao.status === "cancelada";

    // Conectividade: checada aqui, uma vez, para os dois ramos. O que faz o
    // `.ics` degradado de uma sessão cancelada sair com `cancelado: true`
    // (STATUS:CANCELLED/METHOD:CANCEL) em vez de virar convite comum é o
    // `cancelando` calculado acima e passado adiante — ver o parágrafo
    // "O `.ics` DEGRADADO SABE SE A SESSÃO ESTÁ CANCELADA" no cabeçalho.
    if (!googleAppConfigurado()) {
      return resultadoDegradado(sessaoId, evento, MOTIVO_APP_NAO_CONFIGURADO, cancelando);
    }
    if (!googleConectado()) {
      return resultadoDegradado(sessaoId, evento, MOTIVO_SEM_CONEXAO_GOOGLE, cancelando);
    }

    if (cancelando) {
      const r = await cancelarEventoDaSessao(eventoGoogleIdAtual || null);
      if (!r.ok) return { ok: false, erro: r.erro ?? MOTIVO_ERRO_INESPERADO };
      // `evento_google_id` é MANTIDO — ver o parágrafo "CANCELAMENTO" no
      // cabeçalho. Nenhuma escrita em `sessao` acontece neste ramo.
      revalidatePath(caminho);
      revalidatePath("/mentoria");
      return { ok: true };
    }

    if (eventoGoogleIdAtual !== "") {
      const r = await atualizarEventoDaSessao(eventoGoogleIdAtual, evento);
      if (!r.ok) return { ok: false, erro: r.erro ?? MOTIVO_ERRO_INESPERADO };
      revalidatePath(caminho);
      revalidatePath("/mentoria");
      return { ok: true };
    }

    // Cria — só grava `evento_google_id` DEPOIS de o Google confirmar
    // (ordem obrigatória, ver cabeçalho). `r.eventoGoogleId` vazio com
    // `r.ok: true` não deveria acontecer (contrato de `criarEventoDaSessao`
    // já recusa isso como erro), mas a checagem abaixo garante que este
    // arquivo nunca grava uma string vazia como se fosse um id de verdade.
    const r = await criarEventoDaSessao(evento);
    if (!r.ok || !r.eventoGoogleId) {
      return { ok: false, erro: r.ok ? MOTIVO_ERRO_INESPERADO : (r.erro ?? MOTIVO_ERRO_INESPERADO) };
    }

    const { error: erroGravar } = await s
      .from("sessao")
      .update({ evento_google_id: r.eventoGoogleId })
      .eq("id", sessaoId);
    if (erroGravar) {
      avisar("gravar evento_google_id", erroGravar);
      // AÇÃO COMPENSATÓRIA (MÉDIO 3 do laudo) — ver o cabeçalho do
      // arquivo: o Google já tem o evento, o banco não sabe. Desfazer no
      // Google é o que evita que a PRÓXIMA sincronização crie um segundo.
      const compensacao = await cancelarEventoDaSessao(r.eventoGoogleId);
      if (compensacao.ok) {
        return { ok: false, erro: MOTIVO_ERRO_GRAVAR_ID_DESFEITO };
      }
      avisar("desfazer criação após falha ao gravar", { message: compensacao.erro });
      return { ok: false, erro: MOTIVO_EVENTO_SOLTO };
    }

    revalidatePath(caminho);
    revalidatePath("/mentoria");
    return { ok: true };
  } catch (excecao) {
    avisar("sincronizarSessaoNaAgenda", excecao instanceof Error ? { message: excecao.message } : {});
    return { ok: false, erro: MOTIVO_ERRO_INESPERADO };
  }
}
