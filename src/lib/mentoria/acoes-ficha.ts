"use server";

// Os invólucros que a FICHA usa nos seus formulários.
//
// POR QUE ELES EXISTEM
// --------------------
// `sincronizarSessaoNaAgenda` e `transcreverSessao` devolvem um objeto
// (`{ ok, erro, ... }`) porque quem as chama precisa saber o que aconteceu.
// Mas `<form action={...}>` exige uma função que não devolve nada. Em vez de
// mudar o contrato das duas ações — e perder a informação para quem as chama
// de outro lugar —, a ficha usa estes dois invólucros, que traduzem o objeto
// para o único vocabulário que um formulário entende: seguir em frente, ou
// voltar com `?erro=`. É o mesmo padrão de `acoes.ts`.
//
// O QUE ELES DELIBERADAMENTE NÃO FAZEM
// -------------------------------------
// Não validam nada, não leem banco, não decidem nada. Toda a regra continua na
// ação de dentro. Um invólucro que começa a ter opinião vira uma segunda
// versão da regra, e as duas divergem no primeiro conserto feito só de um
// lado — foi assim que o `.ics` nasceu com dobra de linha só na leitura.

import { redirect } from "next/navigation";
import { sincronizarSessaoNaAgenda } from "./acoes-calendario";
import { liberarConteudo, revogarConteudo } from "./acoes-conteudo-liberado";
import { liberarNoPortal } from "./acoes-liberacao";
import { transcreverSessao } from "./acoes-transcricao";
import { registrarTranscricaoManual } from "./acoes-transcricao-manual";

const MOTIVO_TRANSCRICAO_ENTRADA_AUSENTE = "Informe uma transcrição manual ou selecione o áudio da sessão.";

/** A ficha para onde voltar. Vazio cai na carteira — nunca numa URL quebrada. */
function caminhoFicha(formData: FormData): string {
  const mentoradoId = String(formData.get("mentoradoId") ?? "").trim();
  return mentoradoId ? `/mentoria/${mentoradoId}` : "/mentoria";
}

function voltarComErro(caminho: string, mensagem: string): never {
  redirect(`${caminho}?erro=${encodeURIComponent(mensagem)}`);
}

/**
 * Botão "Sincronizar com a agenda" da ficha.
 *
 * O caminho degradado (Google não conectado) chega aqui como `ok: false` com
 * um `ics` junto. O invólucro **não** entrega o arquivo — quem entrega é a
 * rota `GET /api/agenda/sessao/[sessaoId]`, e é por isso que a ficha mostra um
 * link de download nesse estado em vez deste botão. Aqui a mensagem do motivo
 * é o que volta para a tela, e ela já explica que o convite pode ser baixado.
 */
export async function sincronizarSessaoDaFicha(formData: FormData): Promise<void> {
  const resultado = await sincronizarSessaoNaAgenda(formData);
  if (!resultado.ok) voltarComErro(caminhoFicha(formData), resultado.erro ?? "Não foi possível sincronizar.");
}

/**
 * Botão "Transcrever" da ficha.
 *
 * Sucesso não redireciona: a ação de dentro já revalidou a ficha, e um
 * redirecionamento a mais faria a página recarregar duas vezes. Falha volta com
 * o motivo — inclusive o "já existe uma transcrição", que é o caso mais comum e
 * o que explica ao dono por que nada mudou na tela.
 */
export async function transcreverSessaoDaFicha(formData: FormData): Promise<void> {
  // Portão 2 autorizou o fluxo externo, mas a escolha de caminho continua
  // explícita: texto é local; arquivo só chega à ação que deriva
  // consentimento no servidor antes de falar com o fornecedor.
  const resultado = formData.has("texto")
    ? await registrarTranscricaoManual(formData)
    : formData.has("arquivo")
      ? await transcreverSessao(formData)
      : { ok: false, erro: MOTIVO_TRANSCRICAO_ENTRADA_AUSENTE };
  if (!resultado.ok) voltarComErro(caminhoFicha(formData), resultado.erro ?? "Não foi possível transcrever.");
}

/**
 * Os dois interruptores de liberação da ficha.
 *
 * `liberarNoPortal` já é void e já redireciona com `?erro=` — este invólucro
 * não traduz nada, só existe para a ação atravessar a fronteira de Server
 * Action por este arquivo, que é o único que os formulários da ficha chamam.
 * Concentrar a fronteira num módulo só é o que permite aos outros três serem
 * biblioteca comum, livres para exportar constantes e tipos.
 */
export async function liberarNoPortalDaFicha(formData: FormData): Promise<void> {
  await liberarNoPortal(formData);
}

/**
 * Liberar e revogar conteúdo, a partir da ficha.
 *
 * Como os dois de cima: as funções de dentro já são void e já redirecionam com
 * `?erro=`. Estes invólucros existem só para a ação atravessar a fronteira de
 * Server Action por este arquivo — o único que os formulários chamam.
 */
export async function liberarConteudoDaFicha(formData: FormData): Promise<void> {
  await liberarConteudo(formData);
}

export async function revogarConteudoDaFicha(formData: FormData): Promise<void> {
  await revogarConteudo(formData);
}
