"use server";

// Adaptadores de formulário para a conversa privada. A regra de identidade
// continua em `acoes-mensagem.ts`; este arquivo só traduz resultado em
// atualização de tela e usa rotas fixas para nunca refletir entrada do form.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { enviarMensagemDaGestao, enviarMensagemDoMentorado } from "./acoes-mensagem";

const CAMINHO_PORTAL = "/portal";
const CODIGO_ERRO_MENSAGEM = "mensagem";

export async function enviarMensagemDoPortal(formData: FormData): Promise<void> {
  const resultado = await enviarMensagemDoMentorado(formData);
  if (!resultado.ok) {
    // A tela traduz apenas este código por uma tabela fechada. Nunca propagar
    // `resultado.erro`, que pode mudar quando a camada de dados evoluir.
    redirect(`${CAMINHO_PORTAL}?erro=${CODIGO_ERRO_MENSAGEM}`);
    return;
  }
  revalidatePath(CAMINHO_PORTAL);
}

export async function enviarMensagemDaFicha(formData: FormData): Promise<void> {
  const resultado = await enviarMensagemDaGestao(formData);
  if (!resultado.ok) return;
  // Não revalida caminho construído do id do formulário: a ação de domínio
  // determina o destinatário pela linha acessível; a rota continua fixa.
  revalidatePath("/mentoria");
}
