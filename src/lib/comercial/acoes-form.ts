"use server";

// A FRONTEIRA das telas do funil. Molde de `feed/acoes-form.ts` e
// `onboarding/acoes-form.ts`.
//
// Existe por uma regra do Next que nenhum teste e nenhum `tsc` pega: um
// módulo "use server" só pode exportar função ASSÍNCRONA. `acoes.ts` exporta
// as constantes de mensagem que os testes leem, então não pode levar a
// diretiva — e um `<form action={...}>` só aceita função de um módulo que
// leve. Este arquivo é a ponte, e só isso: nenhuma regra mora aqui.

import {
  criarOportunidade,
  criarProposta,
  enviarProposta,
  ganharOportunidade,
  moverOportunidade,
  perderOportunidade,
  registrarRespostaDaProposta,
} from "./acoes";

export async function criarOportunidadeDoForm(formData: FormData): Promise<void> {
  await criarOportunidade(formData);
}

export async function moverOportunidadeDoForm(formData: FormData): Promise<void> {
  await moverOportunidade(formData);
}

export async function ganharOportunidadeDoForm(formData: FormData): Promise<void> {
  await ganharOportunidade(formData);
}

export async function perderOportunidadeDoForm(formData: FormData): Promise<void> {
  await perderOportunidade(formData);
}

export async function criarPropostaDoForm(formData: FormData): Promise<void> {
  await criarProposta(formData);
}

export async function enviarPropostaDoForm(formData: FormData): Promise<void> {
  await enviarProposta(formData);
}

export async function registrarRespostaDaPropostaDoForm(formData: FormData): Promise<void> {
  await registrarRespostaDaProposta(formData);
}
