// NOTA DE FRONTEIRA: sem "use server". Um módulo "use server" só pode
// exportar função async, e este exporta as constantes de mensagem que os
// testes leem. A fronteira das telas nasce na tarefa 47, no molde de
// `feed/acoes-form.ts`.
//
// A escrita do funil: oportunidade e proposta.
//
// ============================================================
// PERDER EXIGE MOTIVO, E A RÉGUA ESTÁ EM DOIS LUGARES
// ============================================================
//
// A ação recusa a perda sem motivo ANTES do banco, e o
// `check perda_tem_motivo` de 0024 recusa de novo lá dentro. As duas existem,
// e não são a mesma coisa: esta aqui é conveniência (a pessoa lê "diga por
// que perdeu" em vez de um erro de constraint), e a do banco é a barreira —
// vale para qualquer caminho de escrita, inclusive um que ainda não existe.
//
// ============================================================
// GANHAR NÃO CRIA CLIENTE SOZINHO
// ============================================================
//
// `ganharOportunidade` marca a linha como ganha e para por aí. Não escreve em
// `mentorado`, não preenche `mentorado_id`, não cria ficha.
//
// Cadastro nascendo sozinho é dado que ninguém conferiu: nome errado do
// contrato, e-mail digitado às pressas, duplicata do cliente que já existia
// com outro sobrenome. A oportunidade GANHA com `mentorado_id` nulo é
// exatamente o rascunho que alguém confirma — a tela lista essas e pergunta
// "virou cliente?". É a mesma cautela que `registrarInteracoes` já trata como
// coisa auditável.
//
// ============================================================
// O ACASO ENTRA AQUI, E SÓ AQUI
// ============================================================
//
// `criarProposta` é a BORDA: é ela que chama `randomBytes` e entrega os bytes
// para `gerarToken`, que é puro. O sorteio mora na Server Action; a montagem
// do token mora no módulo testável. Nenhuma linha de `proposta-token.ts`
// precisa de `mock` por causa disso.
//
// E o token nunca sai daqui: não entra em `?erro=`, não entra em log, não
// volta para a tela pela ação. Quem mostra o link é `lerPropostas`, na tela
// de uma negociação. Uma mensagem de erro com o token dentro vira um segredo
// no histórico do navegador, no log do servidor e na captura de tela.
//
// ============================================================
// PROPOSTA NASCE RASCUNHO
// ============================================================
//
// Criar não é enviar. `criarProposta` grava `status = 'rascunho'`, e só
// `enviarProposta` muda para `enviada` — que é o único status que
// `proposta_publica` (0025) devolve. Ou seja: o link só passa a abrir quando
// alguém decidiu que ia mandar. Sem essa separação, escrever a proposta e
// deixar a aba aberta já seria publicar.

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { gerarToken, BYTES_MINIMOS } from "./proposta-token";
import { criarSupabaseServer } from "../supabase/server";

export const MOTIVO_OPORTUNIDADE_INVALIDA = "Não reconheci esse negócio. Recarregue a página e tente de novo.";
export const MOTIVO_ETAPA_INVALIDA = "Não reconheci a etapa do funil. Recarregue a página e tente de novo.";
export const MOTIVO_ALUNO_INVALIDO = "Escolha de quem é esse negócio.";
export const MOTIVO_VALOR_INVALIDO = "O valor precisa ser um número de 0 para cima.";
export const MOTIVO_PROBABILIDADE_INVALIDA = "A probabilidade é um número inteiro de 0 a 100.";
export const MOTIVO_PERDA_SEM_MOTIVO =
  "Diga por que o negócio foi perdido — sem isso, a perda não ensina nada a ninguém.";
export const MOTIVO_TITULO_VAZIO = "Escreva um título para a proposta.";
export const MOTIVO_PROPOSTA_INVALIDA = "Não reconheci a proposta. Recarregue a página e tente de novo.";
export const MOTIVO_VALIDADE_INVALIDA = "A validade precisa ser uma data no formato dia/mês/ano.";
export const MOTIVO_RESPOSTA_INVALIDA = "A resposta do cliente só pode ser aceita ou recusada.";
export const MOTIVO_ERRO_SALVAR = "Não foi possível salvar agora. Tente novamente em instantes.";

// A rota REAL da tela (src/app/(app)/comercial/). Já custou caro neste
// projeto escrever aqui um caminho que não existe: em 30, as ações de trilha
// voltavam para `/conteudo/trilhas`, e o erro só aparecia como um 404 depois
// de o usuário errar o formulário. Há teste que confere esta constante contra
// a pasta de rotas.
const CAMINHO_GESTAO = "/comercial";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;
const MAX_TITULO = 200;
const MAX_CORPO = 20_000;
const MAX_MOTIVO = 2_000;
const MAX_ORIGEM = 120;
const MAX_DETALHE_LOG = 40;

function avisar(operacao: string, detalhe: unknown): void {
  console.warn(`[comercial/acoes] ${operacao} falhou`, String(detalhe).slice(0, MAX_DETALHE_LOG));
}

function texto(formData: FormData, campo: string): string {
  return String(formData.get(campo) ?? "").trim();
}

function voltarComErro(caminho: string, mensagem: string): never {
  redirect(`${caminho}?erro=${encodeURIComponent(mensagem)}`);
}

/** A tela de UMA negociação — ou a lista, quando o id não é um uuid. */
function caminhoDaOportunidade(id: string): string {
  return UUID.test(id) ? `${CAMINHO_GESTAO}/${id}` : CAMINHO_GESTAO;
}

function ehControleDeFluxoDoNext(excecao: unknown): boolean {
  if (typeof excecao !== "object" || excecao === null) return false;
  const digest = (excecao as { digest?: unknown }).digest;
  if (typeof digest !== "string") return false;
  return (
    digest.startsWith("NEXT_REDIRECT") ||
    digest.startsWith("NEXT_NOT_FOUND") ||
    digest.startsWith("DYNAMIC_SERVER_USAGE")
  );
}

/** O relógio mora na borda: `fechado_em` é decidido aqui, não pelo formulário. */
function agora(): string {
  return new Date().toISOString();
}

// ============================================================
// Oportunidade
// ============================================================

/**
 * Abre uma negociação.
 *
 * `workspace_id` não é lido nem mencionado: tem `default` no schema, e a
 * política de insert de 0024 exige `workspace_id = workspace_atual()`. Quem
 * decide de quem é a linha é o banco.
 *
 * `fechado_em` também não entra: negócio novo não nasce fechado, e aceitar a
 * data de fora seria aceitar um histórico inventado.
 */
export async function criarOportunidade(formData: FormData): Promise<void> {
  const alunoId = texto(formData, "alunoId");
  if (!UUID.test(alunoId)) voltarComErro(CAMINHO_GESTAO, MOTIVO_ALUNO_INVALIDO);

  const etapaId = texto(formData, "etapaId");
  if (!UUID.test(etapaId)) voltarComErro(CAMINHO_GESTAO, MOTIVO_ETAPA_INVALIDA);

  const valorCru = texto(formData, "valor");
  const valor = valorCru === "" ? 0 : Number(valorCru);
  if (!Number.isFinite(valor) || valor < 0) voltarComErro(CAMINHO_GESTAO, MOTIVO_VALOR_INVALIDO);

  const probabilidadeCru = texto(formData, "probabilidade");
  const probabilidade = probabilidadeCru === "" ? 0 : Number(probabilidadeCru);
  // Inteiro, e dentro da faixa: o `check` de 0024 barra o resto, mas quem
  // digitou merece ler o que fez de errado.
  if (!Number.isInteger(probabilidade) || probabilidade < 0 || probabilidade > 100) {
    voltarComErro(CAMINHO_GESTAO, MOTIVO_PROBABILIDADE_INVALIDA);
  }

  await escrever("criarOportunidade", CAMINHO_GESTAO, (s) =>
    s.from("oportunidade").insert({
      aluno_id: alunoId,
      etapa_id: etapaId,
      valor,
      probabilidade,
      origem: texto(formData, "origem").slice(0, MAX_ORIGEM),
      status: "aberta",
    }),
  );
}

/** Move de etapa. Muda UM campo: nem status, nem valor, nem data. */
export async function moverOportunidade(formData: FormData): Promise<void> {
  const id = texto(formData, "id");
  const caminho = caminhoDaOportunidade(id);
  if (!UUID.test(id)) voltarComErro(CAMINHO_GESTAO, MOTIVO_OPORTUNIDADE_INVALIDA);

  const etapaId = texto(formData, "etapaId");
  if (!UUID.test(etapaId)) voltarComErro(caminho, MOTIVO_ETAPA_INVALIDA);

  await escrever("moverOportunidade", caminho, (s) =>
    s.from("oportunidade").update({ etapa_id: etapaId }).eq("id", id),
  );
}

/**
 * Marca a negociação como ganha — e só isso. Ver o cabeçalho: cliente não
 * nasce de um clique.
 */
export async function ganharOportunidade(formData: FormData): Promise<void> {
  const id = texto(formData, "id");
  const caminho = caminhoDaOportunidade(id);
  if (!UUID.test(id)) voltarComErro(CAMINHO_GESTAO, MOTIVO_OPORTUNIDADE_INVALIDA);

  await escrever("ganharOportunidade", caminho, (s) =>
    s.from("oportunidade").update({ status: "ganha", fechado_em: agora() }).eq("id", id),
  );
}

/** Marca como perdida. O motivo é obrigatório — ver o cabeçalho. */
export async function perderOportunidade(formData: FormData): Promise<void> {
  const id = texto(formData, "id");
  const caminho = caminhoDaOportunidade(id);
  if (!UUID.test(id)) voltarComErro(CAMINHO_GESTAO, MOTIVO_OPORTUNIDADE_INVALIDA);

  const motivo = texto(formData, "motivo").slice(0, MAX_MOTIVO);
  if (motivo === "") voltarComErro(caminho, MOTIVO_PERDA_SEM_MOTIVO);

  await escrever("perderOportunidade", caminho, (s) =>
    s
      .from("oportunidade")
      .update({ status: "perdida", motivo_perda: motivo, fechado_em: agora() })
      .eq("id", id),
  );
}

// ============================================================
// Proposta
// ============================================================

/**
 * Escreve a proposta e sorteia o token — ver o cabeçalho sobre a borda.
 *
 * Nasce `rascunho`: enviar é outro clique, e é ele que faz o link abrir.
 */
export async function criarProposta(formData: FormData): Promise<void> {
  const oportunidadeId = texto(formData, "oportunidadeId");
  const caminho = caminhoDaOportunidade(oportunidadeId);
  if (!UUID.test(oportunidadeId)) voltarComErro(CAMINHO_GESTAO, MOTIVO_OPORTUNIDADE_INVALIDA);

  const titulo = texto(formData, "titulo");
  if (!titulo || titulo.length > MAX_TITULO) voltarComErro(caminho, MOTIVO_TITULO_VAZIO);

  const valorCru = texto(formData, "valor");
  const valor = valorCru === "" ? 0 : Number(valorCru);
  if (!Number.isFinite(valor) || valor < 0) voltarComErro(caminho, MOTIVO_VALOR_INVALIDO);

  const validadeCru = texto(formData, "validade");
  if (validadeCru !== "" && !DATA_ISO.test(validadeCru)) voltarComErro(caminho, MOTIVO_VALIDADE_INVALIDA);

  await escrever("criarProposta", caminho, (s) =>
    s.from("proposta").insert({
      oportunidade_id: oportunidadeId,
      token: gerarToken(randomBytes(BYTES_MINIMOS)),
      titulo,
      corpo: texto(formData, "corpo").slice(0, MAX_CORPO),
      valor,
      validade: validadeCru === "" ? null : validadeCru,
      status: "rascunho",
    }),
  );
}

/** Publica o link: `enviada` é o único status que a função pública devolve. */
export async function enviarProposta(formData: FormData): Promise<void> {
  const caminho = caminhoDaOportunidade(texto(formData, "oportunidadeId"));

  const id = texto(formData, "id");
  if (!UUID.test(id)) voltarComErro(caminho, MOTIVO_PROPOSTA_INVALIDA);

  await escrever("enviarProposta", caminho, (s) =>
    s.from("proposta").update({ status: "enviada" }).eq("id", id),
  );
}

/**
 * Registra o que o cliente respondeu.
 *
 * Só `aceita` e `recusada` entram. Os outros três valores do enum têm dono:
 * `rascunho` e `enviada` são do time, e `expirada` é consequência da data —
 * deixar a tela escrever qualquer um deles por aqui seria dar a um clique o
 * poder de reabrir (ou aposentar) uma proposta pelas costas do fluxo.
 */
export async function registrarRespostaDaProposta(formData: FormData): Promise<void> {
  const caminho = caminhoDaOportunidade(texto(formData, "oportunidadeId"));

  const id = texto(formData, "id");
  if (!UUID.test(id)) voltarComErro(caminho, MOTIVO_PROPOSTA_INVALIDA);

  const resposta = texto(formData, "resposta");
  if (resposta !== "aceita" && resposta !== "recusada") voltarComErro(caminho, MOTIVO_RESPOSTA_INVALIDA);

  await escrever("registrarRespostaDaProposta", caminho, (s) =>
    s.from("proposta").update({ status: resposta }).eq("id", id),
  );
}

// ============================================================
// O caminho comum de escrita
// ============================================================

/* eslint-disable @typescript-eslint/no-explicit-any -- o cliente do Supabase
   é montado por fábrica; o tipo dele não atravessa esta função. */
type Cliente = any;

/**
 * Escreve, trata o erro e revalida — o mesmo tratamento em todas as ações.
 *
 * O detalhe que vai para o log é SÓ o código do Postgres. A mensagem do
 * PostgREST ecoa o corpo da requisição, e aqui isso significaria valor
 * negociado, motivo de perda e, na criação de proposta, o token.
 */
async function escrever(
  operacao: string,
  caminho: string,
  consulta: (s: Cliente) => Promise<{ error: { code?: string } | null }>,
): Promise<void> {
  try {
    const { error } = await consulta(criarSupabaseServer());
    if (error) {
      avisar(operacao, error.code ?? "sem-codigo");
      voltarComErro(caminho, MOTIVO_ERRO_SALVAR);
    }
  } catch (excecao) {
    if (ehControleDeFluxoDoNext(excecao)) throw excecao;
    avisar(operacao, excecao instanceof Error ? excecao.name : "excecao");
    voltarComErro(caminho, MOTIVO_ERRO_SALVAR);
  }

  revalidatePath(caminho);
  revalidatePath(CAMINHO_GESTAO);
}
