// NOTA DE FRONTEIRA: este arquivo NÃO carrega "use server". Um módulo
// "use server" só pode EXPORTAR função async, e este exporta também as
// constantes de mensagem que os testes leem. A fronteira de Server Action do
// sistema é `acoes-ficha.ts` — daqui para baixo é biblioteca de servidor
// comum. (A regra só é aplicada pelo Next quando algum código de produção
// importa o arquivo; foi assim que ela apareceu, de surpresa, na Tarefa 18.)
//
// Liberar e revogar conteúdo para UM mentorado.
//
// O BURACO QUE ESTE ARQUIVO FECHA
// -------------------------------
// `conteudo_liberado` existe desde a migração 0006, o portal desenha a lista
// desde que o portal existe, e até aqui NADA no sistema escrevia nela. A tela
// do cliente mostrava, com toda a honestidade, uma lista que ninguém tinha
// como preencher. É o `parcial` mais constrangedor do inventário da Fase 2.
//
// REVOGAR NÃO É APAGAR
// --------------------
// Revogar liga `arquivado` (migração 0018). A linha fica, com a data e o
// título originais. Conteúdo liberado é uma PROMESSA feita a um cliente:
// apagar a linha apagaria a prova de que a promessa existiu, e a primeira
// pergunta de quem reclamar ("você tinha me liberado aquilo") ficaria sem
// resposta verificável de nenhum dos dois lados.
//
// E quem faz a revogação valer não é este arquivo: é a política de select do
// 0018, que passou a exigir `arquivado = false` no ramo do mentorado. Sem
// isso, revogar esconderia o item da tela e deixaria a linha ao alcance de um
// GET direto no PostgREST com a anon key, que é pública.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { criarSupabaseServer } from "../supabase/server";
import { linkGravacaoValido } from "./validacao";

export const MOTIVO_TITULO_VAZIO =
  "Escreva um título para o conteúdo — é por ele que o mentorado vai reconhecer o material.";
export const MOTIVO_TITULO_LONGO = "O título ficou longo demais. Use até 200 caracteres.";
export const MOTIVO_URL_VAZIA =
  "Informe o endereço do conteúdo. Sem link, não há o que liberar.";
export const MOTIVO_URL_INVALIDA =
  "O endereço precisa começar com http:// ou https://. Endereços de outro tipo não são abertos por segurança.";
export const MOTIVO_MENTORADO_INVALIDO =
  "Não reconheci o mentorado. Recarregue a ficha e tente de novo.";
export const MOTIVO_MENTORADO_NAO_ENCONTRADO =
  "Este mentorado não foi encontrado. Recarregue a carteira e tente de novo.";
export const MOTIVO_CONTEUDO_INVALIDO =
  "Não reconheci o conteúdo. Recarregue a ficha e tente de novo.";
export const MOTIVO_ERRO_LIBERAR =
  "Não foi possível liberar o conteúdo agora. Tente novamente em instantes.";
export const MOTIVO_ERRO_REVOGAR =
  "Não foi possível revogar o conteúdo agora. Tente novamente em instantes.";

const MAX_TITULO = 200;
const MAX_ID = 100;
const MAX_DETALHE_LOG = 40;

function avisar(operacao: string, detalhe: unknown): void {
  // Só um código curto. Mensagem de terceiro pode ecoar o corpo da
  // requisição, e o corpo aqui viaja ao lado de dados de um cliente.
  console.warn(
    `[mentoria/acoes-conteudo-liberado] ${operacao} falhou`,
    String(detalhe).slice(0, MAX_DETALHE_LOG),
  );
}

function caminhoFicha(mentoradoId: string): string {
  return mentoradoId ? `/mentoria/${mentoradoId}` : "/mentoria";
}

function redirecionarComErro(caminho: string, mensagem: string): never {
  redirect(`${caminho}?erro=${encodeURIComponent(mensagem)}`);
}

/**
 * `redirect()` do Next sinaliza por exceção. Engoli-la no `catch` mataria o
 * redirecionamento de erro — mesmo cuidado de `acoes-liberacao.ts`.
 */
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

function textoDoFormulario(formData: FormData, campo: string): string {
  return String(formData.get(campo) ?? "").trim();
}

/**
 * Libera um título + endereço para UM mentorado.
 *
 * O `workspace_id` NUNCA vem do formulário — nem é lido. Ele tem `default` no
 * schema e a política de insert de 0008 exige `workspace_id =
 * workspace_atual()`: quem decide de quem é a linha é o banco, a partir de
 * quem está autenticado. Um campo de formulário chamado `workspace_id` é
 * simplesmente ignorado aqui, e há teste provando que é ignorado.
 */
export async function liberarConteudo(formData: FormData): Promise<void> {
  const mentoradoId = textoDoFormulario(formData, "mentoradoId");
  const caminho = caminhoFicha(mentoradoId);

  if (!mentoradoId || mentoradoId.length > MAX_ID) {
    redirecionarComErro("/mentoria", MOTIVO_MENTORADO_INVALIDO);
  }

  const titulo = textoDoFormulario(formData, "titulo");
  if (!titulo) redirecionarComErro(caminho, MOTIVO_TITULO_VAZIO);
  if (titulo.length > MAX_TITULO) redirecionarComErro(caminho, MOTIVO_TITULO_LONGO);

  const url = textoDoFormulario(formData, "url");
  // Vazio e inválido são erros DIFERENTES, com mensagens diferentes: um é
  // esquecimento, o outro é o endereço errado colado. Uma mensagem só para os
  // dois manda a pessoa procurar o problema errado.
  if (!url) redirecionarComErro(caminho, MOTIVO_URL_VAZIA);
  // `linkGravacaoValido` é a MESMA checagem que o portal usa para decidir se
  // vira `<a href>` (e que a baixa de sessão usa para o link de gravação).
  // Reaproveitar em vez de reescrever é o que impede a escrita de aceitar o
  // que a leitura depois recusa a desenhar — o item ficaria liberado e
  // inclicável, sem ninguém entender por quê. Atenção: aquela função trata
  // vazio como VÁLIDO (gravação é opcional), e por isso o vazio é barrado
  // acima, antes de chegar aqui.
  if (!linkGravacaoValido(url)) redirecionarComErro(caminho, MOTIVO_URL_INVALIDA);

  try {
    const s = criarSupabaseServer();

    // Confere que o mentorado existe ANTES de inserir. A garantia real contra
    // linha órfã é a foreign key (`mentorado_id references mentorado`), e ela
    // continua lá — esta consulta existe para a mensagem: um erro 23503 cru
    // não diz nada a quem está na tela.
    const { data: mentorado, error: erroMentorado } = await s
      .from("mentorado")
      .select("id")
      .eq("id", mentoradoId)
      .maybeSingle();
    if (erroMentorado) {
      avisar("mentorado", erroMentorado.code ?? "sem-codigo");
      redirecionarComErro(caminho, MOTIVO_ERRO_LIBERAR);
    }
    // RLS: mentorado de outro workspace e mentorado inexistente chegam ao
    // mesmo `null`, de propósito. Separar os dois contaria a quem perguntou
    // que aquele id existe em algum lugar.
    if (!mentorado) redirecionarComErro(caminho, MOTIVO_MENTORADO_NAO_ENCONTRADO);

    const { error } = await s.from("conteudo_liberado").insert({
      mentorado_id: mentoradoId,
      titulo,
      url,
    });
    if (error) {
      avisar("liberarConteudo", error.code ?? "sem-codigo");
      redirecionarComErro(caminho, MOTIVO_ERRO_LIBERAR);
    }
  } catch (excecao) {
    if (ehControleDeFluxoDoNext(excecao)) throw excecao;
    avisar("liberarConteudo", excecao instanceof Error ? excecao.name : "excecao");
    redirecionarComErro(caminho, MOTIVO_ERRO_LIBERAR);
  }

  revalidatePath(caminho);
  // A outra ponta: sem revalidar o portal, o mentorado continuaria vendo a
  // lista em cache — liberado no banco e invisível na tela dele.
  revalidatePath("/portal");
}

/**
 * Revoga: liga `arquivado`. NUNCA apaga.
 *
 * `revogar` também é o caminho de desfazer um engano (liberou para a pessoa
 * errada), e é por isso que ele precisa ser instantâneo e sem confirmação
 * dupla — a pressa aqui trabalha a favor de quem se arrependeu.
 */
export async function revogarConteudo(formData: FormData): Promise<void> {
  const mentoradoId = textoDoFormulario(formData, "mentoradoId");
  const caminho = caminhoFicha(mentoradoId);

  const conteudoId = textoDoFormulario(formData, "conteudoId");
  if (!conteudoId || conteudoId.length > MAX_ID) {
    redirecionarComErro(caminho, MOTIVO_CONTEUDO_INVALIDO);
  }

  try {
    const s = criarSupabaseServer();
    // UPDATE, nunca DELETE. Uma chave só no objeto: nem título, nem url, nem
    // data — revogar não reescreve o que foi prometido, só para de oferecer.
    const { error } = await s
      .from("conteudo_liberado")
      .update({ arquivado: true })
      .eq("id", conteudoId);
    if (error) {
      avisar("revogarConteudo", error.code ?? "sem-codigo");
      redirecionarComErro(caminho, MOTIVO_ERRO_REVOGAR);
    }
  } catch (excecao) {
    if (ehControleDeFluxoDoNext(excecao)) throw excecao;
    avisar("revogarConteudo", excecao instanceof Error ? excecao.name : "excecao");
    redirecionarComErro(caminho, MOTIVO_ERRO_REVOGAR);
  }

  revalidatePath(caminho);
  revalidatePath("/portal");
}
