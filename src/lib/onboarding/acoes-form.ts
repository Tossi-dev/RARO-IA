"use server";

// A FRONTEIRA de Server Action das telas de onboarding — `/onboarding`
// (gestão) e o card "Seus primeiros passos" do portal.
//
// Mesma razão de `feed/acoes-form.ts`: um módulo "use server" só pode exportar
// função async, e `acoes.ts` exporta também as constantes de mensagem que os
// testes leem. Sem a diretiva em algum lugar, `<form action={salvarEtapa}>`
// não compila — e só `npm run build` cobra isso.
//
// SEM OPINIÃO: cada função aqui só chama a de dentro.

import {
  arquivarEtapa,
  marcarEtapaDoMentor,
  marcarMinhaEtapa,
  reordenarEtapa,
  salvarEtapa,
} from "./acoes";

/** Formulário "nova etapa" / "editar etapa" da tela de gestão. */
export async function salvarEtapaDoForm(formData: FormData): Promise<void> {
  await salvarEtapa(formData);
}

/** Botão "mover" — só troca a posição. */
export async function reordenarEtapaDoForm(formData: FormData): Promise<void> {
  await reordenarEtapa(formData);
}

/** Botão "tirar do roteiro" — desliga `ativa`, nunca apaga. */
export async function arquivarEtapaDoForm(formData: FormData): Promise<void> {
  await arquivarEtapa(formData);
}

/** A baixa que a gestão dá numa etapa de um mentorado. */
export async function marcarEtapaDoMentorDoForm(formData: FormData): Promise<void> {
  await marcarEtapaDoMentor(formData);
}

/** O botão do portal, na etapa que é do próprio mentorado. */
export async function marcarMinhaEtapaDoForm(formData: FormData): Promise<void> {
  await marcarMinhaEtapa(formData);
}
