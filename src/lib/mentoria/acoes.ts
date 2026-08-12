"use server";

// Server Actions da B2.4 — agendar sessão, dar baixa (colar link da
// gravação, resumo). Mesma casa de `src/lib/actions.ts`: zod valida NA
// BORDA antes de qualquer escrita, `revalidatePath` depois de gravar, e
// erro (de validação ou de banco) volta para a tela em `?erro=`, nunca
// como exceção não tratada.
//
// ESCREVE COM O CLIENTE AUTENTICADO (`criarSupabaseServer`, o mesmo que
// `src/lib/mentoria/dados.ts` usa para LER), NUNCA com a chave
// `service_role`. Quem decide se esta pessoa pode gravar uma sessão é a
// política de RLS de `public.sessao` (0006 liga RLS; 0008 escopa por
// workspace — "escrita da gestao": só dono/gestor, dentro do próprio
// workspace) — não um `if` de tela. Um `if` de tela é fácil de esquecer
// numa tela nova ou contornar chamando a Server Action direto; a política
// no banco vale para QUALQUER caminho que tente escrever, inclusive um que
// ainda não existe.
//
// ESTE PROJETO NÃO APAGA. Cancelar uma sessão é dar baixa com
// `status: "cancelada"` — um UPDATE — nunca um DELETE. Nenhuma Server
// Action deste arquivo (nem de `src/lib/actions.ts`) chama `.delete()`:
// apagar destruiria exatamente o histórico que a ficha do mentorado existe
// para mostrar (quantas sessões aconteceram, quantas faltaram, quando foi
// cancelado o quê).

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { criarSupabaseServer } from "../supabase/server";
import { AgendarSchema, BaixaSchema } from "./validacao";

/** Mensagem genérica para a tela — o detalhe técnico vai só para `console.warn` (ver `avisar`). */
const MOTIVO_ERRO_AGENDAR = "Não foi possível agendar a sessão agora. Tente novamente em instantes.";
const MOTIVO_ERRO_BAIXA = "Não foi possível registrar a sessão agora. Tente novamente em instantes.";

/**
 * Loga o detalhe técnico de uma falha do Supabase — mesmo padrão de
 * `avisar` em `dados.ts`. É AQUI, e só aqui, que o código/mensagem do
 * supabase-js pode aparecer; a URL de redirect nunca herda nada disto.
 */
function avisar(operacao: string, erro: { code?: string; message?: string }): void {
  console.warn(`[mentoria/acoes] ${operacao} falhou`, erro.code, erro.message);
}

/** Primeira mensagem de validação de um `safeParse` que falhou — já em português, pronta para `?erro=`. */
function primeiroErroDeValidacao(issues: readonly { message: string }[]): string {
  return issues[0]?.message ?? "Dados inválidos.";
}

/** A ficha para onde toda ação desta tela volta — "" cai na carteira, nunca numa URL quebrada. */
function caminhoFicha(mentoradoId: string): string {
  return mentoradoId ? `/mentoria/${mentoradoId}` : "/mentoria";
}

function redirecionarComErro(caminho: string, mensagem: string): never {
  redirect(`${caminho}?erro=${encodeURIComponent(mensagem)}`);
  // `redirect()` sempre lança (é assim que o Next interrompe a Server
  // Action) — mas o `return` explícito abaixo é o que garante que, mesmo
  // num dublê de teste que NÃO lança de propósito, o código desta função
  // nunca cai para a escrita no banco com dado inválido.
  return undefined as never;
}

// ============================================================
// agendarSessao
// ============================================================

export async function agendarSessao(formData: FormData): Promise<void> {
  const mentoradoId = String(formData.get("mentoradoId") ?? "").trim();
  const caminho = caminhoFicha(mentoradoId);

  const resultado = AgendarSchema.safeParse(Object.fromEntries(formData));
  if (!resultado.success) {
    redirecionarComErro(caminho, primeiroErroDeValidacao(resultado.error.issues));
    return;
  }

  const dados = resultado.data;
  const s = criarSupabaseServer();
  const { error } = await s.from("sessao").insert({
    matricula_id: dados.matriculaId ?? null,
    turma_id: dados.turmaId ?? null,
    quando: dados.quando,
    duracao_min: dados.duracaoMin,
    numero: dados.numero,
  });

  if (error) {
    avisar("agendarSessao", error);
    redirecionarComErro(caminho, MOTIVO_ERRO_AGENDAR);
    return;
  }

  revalidatePath(caminho);
  revalidatePath("/mentoria");
}

// ============================================================
// darBaixaNaSessao
// ============================================================

export async function darBaixaNaSessao(formData: FormData): Promise<void> {
  const mentoradoId = String(formData.get("mentoradoId") ?? "").trim();
  const caminho = caminhoFicha(mentoradoId);

  const resultado = BaixaSchema.safeParse(Object.fromEntries(formData));
  if (!resultado.success) {
    redirecionarComErro(caminho, primeiroErroDeValidacao(resultado.error.issues));
    return;
  }

  const dados = resultado.data;
  const s = criarSupabaseServer();
  // UPDATE, nunca DELETE — ver o comentário no topo do arquivo.
  const { error } = await s
    .from("sessao")
    .update({ status: dados.status, link_gravacao: dados.linkGravacao, resumo: dados.resumo })
    .eq("id", dados.sessaoId);

  if (error) {
    avisar("darBaixaNaSessao", error);
    redirecionarComErro(caminho, MOTIVO_ERRO_BAIXA);
    return;
  }

  revalidatePath(caminho);
  revalidatePath("/mentoria");
}
