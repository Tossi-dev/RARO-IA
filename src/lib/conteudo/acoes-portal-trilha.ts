"use server";

// A FRONTEIRA de Server Action da trilha no PORTAL (/portal/trilha).
//
// Mesma razão da fronteira da gestão (`acoes-gestao-trilha.ts`): um módulo
// "use server" só pode exportar função async, e `acoes-trilha.ts` exporta
// também as constantes de mensagem que os testes leem. Sem a diretiva em
// algum lugar, `<form action={marcarAula}>` não compila — e o build é o
// único que cobra isso (`npm test` e `tsc` passam felizes).
//
// ⚠ SEM OPINIÃO, como a outra: só chama a de dentro. Vale insistir aqui
// porque a tentação é maior — daria para "adiantar" a checagem de liberação
// neste arquivo. Não. Quem decide se ESTA pessoa pode marcar ESTA aula é
// `public.trilha_marcar_aula`, dentro do banco, a cada chamada (0020). Um
// `if` escrito aqui protegeria só quem passa por aqui.

import { marcarAula } from "./acoes-trilha";

/** O botão "concluir" / "reabrir" de uma aula da própria trilha. */
export async function marcarAulaDoPortal(formData: FormData): Promise<void> {
  await marcarAula(formData);
}
