// NOTA DE FRONTEIRA: sem "use server". Um módulo "use server" só pode exportar
// função async, e este exporta as constantes de mensagem que os testes leem. A
// fronteira das telas nasce na tarefa 40, no mesmo molde de
// `feed/acoes-form.ts`.
//
// Escrita do onboarding: o modelo de etapas (gestão) e as duas formas de
// marcar.
//
// ============================================================
// DUAS FORMAS DE MARCAR, E ELAS NÃO SÃO SIMÉTRICAS
// ============================================================
//
// `marcarEtapaDoMentor` é da GESTÃO e escreve na tabela: existe política de
// insert e de update de `onboarding_progresso` para dono/gestor (0023), então
// o caminho normal do PostgREST serve.
//
// `marcarMinhaEtapa` é do MENTORADO e NÃO escreve na tabela — chama
// `rpc("onboarding_marcar")`. Não existe política de update para ele, e isso
// foi decisão: RLS decide se a LINHA aparece, nunca QUE COLUNA pode ser
// escrita. Com a política de linha inteira que 0012 tinha, um PATCH direto no
// PostgREST forjava a data de conclusão e movia a linha para outro mentorado.
//
// ============================================================
// DEFESA DUPLA NA ETAPA DO MENTOR — E QUAL DAS DUAS É A BARREIRA
// ============================================================
//
// `marcarMinhaEtapa` recusa, ANTES do banco, uma etapa cuja `responsavel` é
// `mentor`. E a função `onboarding_marcar` recusa de novo, dentro do Postgres,
// com `e.responsavel = 'mentorado'` no próprio `where`.
//
// As duas existem, e não são a mesma coisa:
//   - a checagem daqui é CONVENIÊNCIA. Serve para a pessoa receber "esta
//     etapa é do seu mentor" em vez de um erro genérico do banco. Se ela
//     fosse a única, não seria barreira nenhuma: bastaria chamar a Server
//     Action com outro id;
//   - a do banco é a BARREIRA. Vale para qualquer caminho que tente escrever,
//     inclusive um que ainda não existe.
//
// O teste cobre as duas separadamente, de propósito — uma suíte que só
// exercita a primeira daria a impressão de que a segunda não é necessária.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { lerMeuOnboarding } from "./dados";
import { responsavelDaEtapa } from "./roteiro";
import { criarSupabaseServer } from "../supabase/server";

export const MOTIVO_TITULO_VAZIO = "Escreva um título para a etapa.";
export const MOTIVO_ETAPA_INVALIDA = "Não reconheci a etapa. Recarregue a página e tente de novo.";
export const MOTIVO_MENTORADO_INVALIDO = "Não reconheci o mentorado. Recarregue a página e tente de novo.";
export const MOTIVO_ORDEM_INVALIDA =
  "A ordem precisa ser um número inteiro de 0 para cima — é a posição da etapa no roteiro.";
export const MOTIVO_RESPONSAVEL_INVALIDO =
  "Diga de quem é a etapa: do mentor ou do mentorado.";
export const MOTIVO_ERRO_SALVAR = "Não foi possível salvar agora. Tente novamente em instantes.";

/** O código que o portal traduz (`MENSAGENS_ERRO`, em portal/textos.ts). O
 *  portal nunca desenha o texto da URL — ver o MÉDIO 5 da auditoria. */
export const CODIGO_ETAPA = "etapa";

const CAMINHO_GESTAO = "/onboarding";
const CAMINHO_PORTAL = "/portal";
const MAX_ID = 100;
const MAX_TITULO = 200;
const MAX_DESCRICAO = 2000;
const MAX_DETALHE_LOG = 40;

function avisar(operacao: string, detalhe: unknown): void {
  console.warn(`[onboarding/acoes] ${operacao} falhou`, String(detalhe).slice(0, MAX_DETALHE_LOG));
}

function texto(formData: FormData, campo: string): string {
  return String(formData.get(campo) ?? "").trim();
}

function voltarComErro(caminho: string, mensagem: string): never {
  redirect(`${caminho}?erro=${encodeURIComponent(mensagem)}`);
}

/** O portal recebe CÓDIGO, a gestão recebe frase — ver `feed/acoes.ts`. */
function voltarComCodigo(codigo: string): never {
  redirect(`${CAMINHO_PORTAL}?erro=${encodeURIComponent(codigo)}`);
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

// ============================================================
// O modelo de etapas — gestão
// ============================================================

/**
 * Cria ou atualiza uma etapa do roteiro.
 *
 * `workspace_id` NUNCA é lido do formulário — nem é mencionado. Tem `default`
 * no schema, e a política de insert de 0023 exige
 * `workspace_id = workspace_atual()`: quem decide de quem é a linha é o banco.
 *
 * `responsavel` NÃO passa por `responsavelDaEtapa` aqui, e a diferença é
 * deliberada: aquela função existe para LER um valor que já está gravado, e
 * cai em "mentor" no que não reconhece. Na ESCRITA, um valor desconhecido é
 * erro de formulário e volta como erro — gravar "mentor" no lugar de um valor
 * torto seria decidir por quem preencheu, calado.
 */
export async function salvarEtapa(formData: FormData): Promise<void> {
  const caminho = CAMINHO_GESTAO;

  const titulo = texto(formData, "titulo");
  if (!titulo || titulo.length > MAX_TITULO) voltarComErro(caminho, MOTIVO_TITULO_VAZIO);

  const responsavel = texto(formData, "responsavel");
  if (responsavel !== "mentor" && responsavel !== "mentorado") {
    voltarComErro(caminho, MOTIVO_RESPONSAVEL_INVALIDO);
  }

  const ordemCru = texto(formData, "ordem");
  const ordem = ordemCru === "" ? 0 : Number(ordemCru);
  // Recusado AQUI, antes do banco. O `check (ordem >= 0)` de 0023 também
  // barra, e é ele a garantia — esta checagem existe para a mensagem ser
  // humana em vez de um erro de constraint.
  if (!Number.isInteger(ordem) || ordem < 0) voltarComErro(caminho, MOTIVO_ORDEM_INVALIDA);

  const id = texto(formData, "id");
  const valores = {
    titulo,
    descricao: texto(formData, "descricao").slice(0, MAX_DESCRICAO),
    responsavel,
    ordem,
    obrigatoria: texto(formData, "obrigatoria") === "1",
    // Etapa nasce ativa; desativar é o botão de arquivar, não um campo escondido.
    ativa: true,
  };

  try {
    const s = criarSupabaseServer();
    const { error } = id
      ? await s.from("onboarding_etapa").update(valores).eq("id", id)
      : await s.from("onboarding_etapa").insert(valores);

    if (error) {
      avisar("salvarEtapa", (error as { code?: string }).code ?? "sem-codigo");
      voltarComErro(caminho, MOTIVO_ERRO_SALVAR);
    }
  } catch (excecao) {
    if (ehControleDeFluxoDoNext(excecao)) throw excecao;
    avisar("salvarEtapa", excecao instanceof Error ? excecao.name : "excecao");
    voltarComErro(caminho, MOTIVO_ERRO_SALVAR);
  }

  revalidatePath(caminho);
  revalidatePath(CAMINHO_PORTAL);
}

/**
 * Move uma etapa no roteiro — só troca `ordem`.
 *
 * NÃO apaga e não recria: reordenar recriando destruiria o progresso de todo
 * mundo que já cumpriu a etapa (`on delete cascade` em
 * `onboarding_progresso`). O que muda é um número.
 */
export async function reordenarEtapa(formData: FormData): Promise<void> {
  const caminho = CAMINHO_GESTAO;

  const id = texto(formData, "id");
  if (!id || id.length > MAX_ID) voltarComErro(caminho, MOTIVO_ETAPA_INVALIDA);

  const ordemCru = texto(formData, "ordem");
  const ordem = Number(ordemCru);
  if (ordemCru === "" || !Number.isInteger(ordem) || ordem < 0) {
    voltarComErro(caminho, MOTIVO_ORDEM_INVALIDA);
  }

  try {
    const s = criarSupabaseServer();
    const { error } = await s.from("onboarding_etapa").update({ ordem }).eq("id", id);

    if (error) {
      avisar("reordenarEtapa", (error as { code?: string }).code ?? "sem-codigo");
      voltarComErro(caminho, MOTIVO_ERRO_SALVAR);
    }
  } catch (excecao) {
    if (ehControleDeFluxoDoNext(excecao)) throw excecao;
    avisar("reordenarEtapa", excecao instanceof Error ? excecao.name : "excecao");
    voltarComErro(caminho, MOTIVO_ERRO_SALVAR);
  }

  revalidatePath(caminho);
  revalidatePath(CAMINHO_PORTAL);
}

/**
 * Tira uma etapa do roteiro — `ativa = false`, nunca `delete`.
 *
 * Apagar levaria junto, em cascata, o progresso de todo mundo que já a
 * cumpriu: o histórico diria que aquelas pessoas nunca assinaram o contrato.
 * Desativada, a etapa some do roteiro de quem entra amanhã e continua
 * existindo para quem já passou por ela.
 */
export async function arquivarEtapa(formData: FormData): Promise<void> {
  const caminho = CAMINHO_GESTAO;

  const id = texto(formData, "id");
  if (!id || id.length > MAX_ID) voltarComErro(caminho, MOTIVO_ETAPA_INVALIDA);

  try {
    const s = criarSupabaseServer();
    const { error } = await s.from("onboarding_etapa").update({ ativa: false }).eq("id", id);

    if (error) {
      avisar("arquivarEtapa", (error as { code?: string }).code ?? "sem-codigo");
      voltarComErro(caminho, MOTIVO_ERRO_SALVAR);
    }
  } catch (excecao) {
    if (ehControleDeFluxoDoNext(excecao)) throw excecao;
    avisar("arquivarEtapa", excecao instanceof Error ? excecao.name : "excecao");
    voltarComErro(caminho, MOTIVO_ERRO_SALVAR);
  }

  revalidatePath(caminho);
  revalidatePath(CAMINHO_PORTAL);
}

// ============================================================
// Marcar — as duas formas
// ============================================================

/**
 * A gestão dá baixa numa etapa (de qualquer responsável) de um mentorado.
 *
 * `upsert` com `onConflict` no par que 0023 fez único: o segundo clique
 * ATUALIZA a linha, não cria outra. `concluida_em` sai daqui, do servidor —
 * não do formulário.
 */
export async function marcarEtapaDoMentor(formData: FormData): Promise<void> {
  const caminho = CAMINHO_GESTAO;

  const etapaId = texto(formData, "etapaId");
  if (!etapaId || etapaId.length > MAX_ID) voltarComErro(caminho, MOTIVO_ETAPA_INVALIDA);

  const mentoradoId = texto(formData, "mentoradoId");
  if (!mentoradoId || mentoradoId.length > MAX_ID) voltarComErro(caminho, MOTIVO_MENTORADO_INVALIDO);

  // Só o literal "1" marca. Qualquer outra coisa DESMARCA — o lado seguro: o
  // erro possível é precisar clicar de novo, nunca uma etapa constar como
  // feita sem ninguém ter dito isso.
  const concluida = texto(formData, "concluida") === "1";

  try {
    const s = criarSupabaseServer();
    const { error } = await s.from("onboarding_progresso").upsert(
      {
        mentorado_id: mentoradoId,
        etapa_id: etapaId,
        concluida,
        concluida_em: concluida ? new Date().toISOString() : null,
      },
      { onConflict: "mentorado_id,etapa_id" },
    );

    if (error) {
      avisar("marcarEtapaDoMentor", (error as { code?: string }).code ?? "sem-codigo");
      voltarComErro(caminho, MOTIVO_ERRO_SALVAR);
    }
  } catch (excecao) {
    if (ehControleDeFluxoDoNext(excecao)) throw excecao;
    avisar("marcarEtapaDoMentor", excecao instanceof Error ? excecao.name : "excecao");
    voltarComErro(caminho, MOTIVO_ERRO_SALVAR);
  }

  revalidatePath(caminho);
  revalidatePath(CAMINHO_PORTAL);
}

/**
 * O mentorado marca uma etapa PRÓPRIA — pela função do banco.
 *
 * Nenhum id de mentorado e nenhuma data atravessam: `onboarding_marcar` não
 * os aceita, porque os deduz lá dentro. Ver o cabeçalho sobre a defesa dupla
 * e sobre qual das duas é a barreira.
 */
export async function marcarMinhaEtapa(formData: FormData): Promise<void> {
  const etapaId = texto(formData, "etapaId");
  if (!etapaId || etapaId.length > MAX_ID) voltarComCodigo(CODIGO_ETAPA);

  const concluida = texto(formData, "concluida") === "1";

  try {
    // Conveniência, não segurança — ver o cabeçalho. Serve para a mensagem
    // ser específica em vez de um erro genérico do banco.
    const meu = await lerMeuOnboarding();
    const etapa = meu.etapas.find((e) => e.id === etapaId);
    if (!etapa || responsavelDaEtapa(etapa.responsavel) !== "mentorado") voltarComCodigo(CODIGO_ETAPA);

    const s = criarSupabaseServer();
    const { error } = await s.rpc("onboarding_marcar", {
      p_etapa_id: etapaId,
      p_concluida: concluida,
    });

    if (error) {
      // A função LEVANTA exceção quando zero linhas são afetadas (0023), e o
      // supabase-js devolve isso como `error`. Sem este `if`, a ação fingiria
      // sucesso silencioso e o botão não faria nada sem avisar ninguém.
      avisar("marcarMinhaEtapa", (error as { code?: string }).code ?? "sem-codigo");
      voltarComCodigo(CODIGO_ETAPA);
    }
  } catch (excecao) {
    if (ehControleDeFluxoDoNext(excecao)) throw excecao;
    avisar("marcarMinhaEtapa", excecao instanceof Error ? excecao.name : "excecao");
    voltarComCodigo(CODIGO_ETAPA);
  }

  revalidatePath(CAMINHO_PORTAL);
}
