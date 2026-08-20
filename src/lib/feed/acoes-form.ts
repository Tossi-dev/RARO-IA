"use server";

// A FRONTEIRA de Server Action das telas de avisos — `/feed` (gestão) e o
// card do portal.
//
// Mesma razão de `conteudo/acoes-gestao-trilha.ts`: um módulo "use server" só
// pode exportar função async, e `acoes.ts` exporta também as constantes de
// mensagem que os testes leem. Sem a diretiva em algum lugar,
// `<form action={publicarPost}>` não compila — e o build é o único que cobra
// isso (`npm test` e `tsc` passam felizes; já custou uma tarefa inteira nesta
// fase).
//
// SEM OPINIÃO: cada função aqui só chama a de dentro. Não valida, não lê
// banco, não decide nada. Um invólucro que começa a validar vira uma segunda
// versão da regra, e as duas divergem no primeiro conserto feito só de um
// lado.

import {
  arquivarComentario,
  arquivarPost,
  comentar,
  marcarPostLido,
  publicarPost,
} from "./acoes";

/** Formulário "novo aviso" da tela de gestão. */
export async function publicarPostDoForm(formData: FormData): Promise<void> {
  await publicarPost(formData);
}

/** Campo de comentário, nas duas telas. */
export async function comentarDoForm(formData: FormData): Promise<void> {
  await comentar(formData);
}

/** Botão "arquivar" da gestão — nunca apaga. */
export async function arquivarPostDoForm(formData: FormData): Promise<void> {
  await arquivarPost(formData);
}

export async function arquivarComentarioDoForm(formData: FormData): Promise<void> {
  await arquivarComentario(formData);
}

/** Botão "marcar como lido" do portal. */
export async function marcarPostLidoDoForm(formData: FormData): Promise<void> {
  await marcarPostLido(formData);
}
