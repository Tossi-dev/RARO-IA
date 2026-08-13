"use server";

// Server Actions do PORTAL DO MENTORADO (B3.2) — dar baixa / reabrir a
// própria tarefa. Mesma casa de `src/lib/mentoria/acoes.ts` e
// `src/lib/actions.ts`: zod valida NA BORDA antes de qualquer escrita,
// `revalidatePath` depois de gravar, e erro (de validação ou de banco)
// volta para a tela em `?erro=`, nunca como exceção não tratada.
//
// ALTO 1 da auditoria — POR QUE ISTO NÃO CHAMA `.update()` DIRETO
// -------------------------------------------------------------------
// A primeira versão deste arquivo escrevia com `.from("tarefa_mentoria")
// .update({...}).eq("id", tarefaId)`, protegida por uma política de RLS de
// LINHA inteira (`supabase/migrations/0012_portal_mentorado_conclui_tarefa.sql`).
// Um revisor, autenticado como mentorado, provou em Postgres real que RLS
// por linha não impede reescrever `titulo`/`prazo`, forjar `concluida_em`
// (backdating), ou mover a tarefa para outro `mentorado_id` — tudo isso com
// um PATCH direto no PostgREST, contornando esta Server Action inteira (a
// anon key é pública, o JWT é o do próprio usuário). A resposta
// (`supabase/migrations/0013_portal_tarefa_por_funcao.sql`) troca a
// política de UPDATE por uma função `security definer`,
// `public.portal_marcar_tarefa(p_tarefa_id, p_concluida)`, que é a ÚNICA
// escrita que este arquivo agora faz: `s.rpc("portal_marcar_tarefa", ...)`.
// A função só sabe trocar o PAR `concluida`/`concluida_em` de UMA tarefa
// que já é do chamador — nenhuma outra coluna passa perto dela.
//
// ESCREVE COM O CLIENTE AUTENTICADO (`criarSupabaseServer`), NUNCA com a
// chave `service_role`. QUEM DECIDE SE ESTA PESSOA PODE MARCAR ESTA TAREFA
// É `public.portal_marcar_tarefa` — ela confere `mentorado_id =
// mentorado_atual()`, `workspace_id = workspace_atual()` e `papel_atual() =
// 'mentorado'` DENTRO do banco, a cada chamada — NUNCA um `if` escrito
// aqui. Um `if` de tela é fácil de esquecer numa tela nova, ou de contornar
// chamando a Server Action direto com outro `tarefaId`; a função no banco
// vale para QUALQUER caminho que tente escrever, inclusive um que ainda não
// existe. Por isso este arquivo não recebe (nem precisa receber) um
// `mentoradoId`: a única identidade que importa é a da SESSÃO autenticada,
// resolvida pelo banco, nunca por um valor vindo do formulário.
//
// O "QUANDO" TAMBÉM NASCE NO BANCO — não aqui. `portal_marcar_tarefa` grava
// `now()` do lado do Postgres quando `p_concluida` é `true` (ver 0013):
// quem marca uma tarefa não escolhe quando marcou, e um timestamp vindo do
// cliente é exatamente o que permitiu o backdating provado pela auditoria.
//
// ESTE PROJETO NÃO APAGA. "Reabrir" uma tarefa não é desfazer a existência
// dela — é a mesma função `security definer` voltando `concluida` para
// `false`. Nenhuma função deste arquivo chama `.delete()` nem `.update()`
// direto na tabela.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { criarSupabaseServer } from "../supabase/server";

/** A tela para onde toda ação deste arquivo volta — só existe uma. */
const CAMINHO_PORTAL = "/portal";

// MÉDIO 5 da auditoria — a URL nunca carrega a MENSAGEM, só este CÓDIGO
// curto. `?erro=<texto arbitrário>` era renderizado literalmente dentro do
// banner oficial da tela (`(app)/portal/page.tsx`) antes desta correção:
// qualquer um podia mandar um link com um texto de ataque no lugar do
// aviso do produto. Quem traduz o código em frase é a TELA
// (`(app)/portal/textos.ts`, `mensagemDeErro`), com uma tabela fechada de
// códigos conhecidos — código desconhecido cai numa frase genérica, nunca
// no texto cru da URL. Um código só, "tarefa", cobre as duas falhas
// possíveis deste arquivo (id mal formado, ou a função do banco recusando
// a escrita): do ponto de vista de quem lê a tela, as duas são a mesma
// coisa — "não consegui atualizar esta tarefa agora".
const CODIGO_ERRO_TAREFA = "tarefa";

/**
 * Loga o detalhe técnico de uma falha do Supabase — mesmo padrão de
 * `avisar` em `acoes.ts`/`dados.ts`/`portal.ts`. É AQUI, e só aqui, que o
 * código/mensagem do supabase-js (ou o `raise exception` de
 * `portal_marcar_tarefa`) pode aparecer; a URL de redirect nunca herda
 * nada disto — só o código curto acima.
 */
function avisar(operacao: string, erro: { code?: string; message?: string }): void {
  console.warn(`[mentoria/acoes-portal] ${operacao} falhou`, erro.code, erro.message);
}

function redirecionarComErro(): never {
  redirect(`${CAMINHO_PORTAL}?erro=${CODIGO_ERRO_TAREFA}`);
  // `redirect()` sempre lança (é assim que o Next interrompe a Server
  // Action) — mas o `return` explícito abaixo garante que, mesmo num dublê
  // de teste que NÃO lança de propósito, o código desta função nunca cai
  // para a escrita no banco com um id que não passou na validação.
  return undefined as never;
}

// ============================================================
// Validação do id — zod, na borda, ANTES de qualquer chamada ao banco.
// ============================================================

// 100 caracteres é folga generosa acima de um uuid (36 caracteres) — grande
// o bastante para nunca recusar um id de verdade, pequeno o bastante para
// recusar de cara um valor absurdo (payload malformado, tentativa de abuso)
// sem precisar ir até o banco para descobrir que a linha não existe.
const TarefaIdSchema = z.object({
  tarefaId: z
    .string()
    .trim()
    .min(1, "Tarefa inválida.")
    .max(100, "Tarefa inválida."),
});

// ============================================================
// A ação compartilhada — concluir e reabrir são a MESMA chamada de rpc, só
// o valor de `p_concluida` muda (o "quando" — `concluida_em` — a função do
// banco decide sozinha, ver 0013).
// ============================================================

async function darBaixaEmTarefa(formData: FormData, concluida: boolean, operacao: string): Promise<void> {
  const resultado = TarefaIdSchema.safeParse(Object.fromEntries(formData));
  if (!resultado.success) {
    redirecionarComErro();
    return;
  }

  const { tarefaId } = resultado.data;
  const s = criarSupabaseServer();

  // ÚNICA escrita deste arquivo: a função `security definer` de 0013. Ela
  // decide, dentro do banco, se ESTA pessoa pode marcar ESTA tarefa — este
  // arquivo só valida o FORMATO do id e repassa a intenção (concluir ou
  // reabrir) adiante.
  const { error } = await s.rpc("portal_marcar_tarefa", {
    p_tarefa_id: tarefaId,
    p_concluida: concluida,
  });

  if (error) {
    // MÉDIO 4 — antes, RLS negando devolvia sucesso com zero linhas
    // afetadas (o botão não fazia nada, e ninguém era avisado).
    // `portal_marcar_tarefa` (0013) agora LEVANTA uma exceção quando zero
    // linhas são afetadas — o supabase-js devolve isso como `error`, este
    // `if` trata (console.warn + redirect com código de erro), e a Server
    // Action nunca finge sucesso silencioso.
    avisar(operacao, error);
    redirecionarComErro();
    return;
  }

  revalidatePath(CAMINHO_PORTAL);
}

export async function concluirTarefa(formData: FormData): Promise<void> {
  return darBaixaEmTarefa(formData, true, "concluirTarefa");
}

export async function reabrirTarefa(formData: FormData): Promise<void> {
  return darBaixaEmTarefa(formData, false, "reabrirTarefa");
}
