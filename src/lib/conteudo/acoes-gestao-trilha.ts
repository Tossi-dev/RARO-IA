"use server";

// A FRONTEIRA de Server Action das telas de gestão de trilhas (/trilhas e
// /trilhas/[id]).
//
// POR QUE ELA EXISTE, E POR QUE NÃO É SÓ CERIMÔNIA
// ------------------------------------------------
// Um módulo "use server" só pode exportar função async. `acoes-trilha.ts`
// exporta também as constantes de mensagem (`MOTIVO_*`) que os testes leem,
// então ele NÃO pode carregar a diretiva — e sem a diretiva em algum lugar,
// `<form action={salvarTrilha}>` não compila.
//
// Esta é a mesma forma de `src/lib/mentoria/acoes-ficha.ts`, e a nota no topo
// de `acoes-trilha.ts` já anunciava que as telas ganhariam a sua quando
// existissem. Elas existem agora.
//
// ⚠ ESTE ARQUIVO NÃO TEM OPINIÃO. Não valida, não lê banco, não decide nada:
// cada função aqui só chama a de dentro. Um invólucro que começa a validar
// vira uma segunda versão da regra, e as duas divergem no primeiro conserto
// feito só de um lado — foi exatamente assim que o `.ics` nasceu com dobra de
// linha só na leitura.
//
// E o build é quem cobra: `npm test` e `tsc` passam com a diretiva no arquivo
// errado; só `npm run build` reclama. Já custou uma tarefa inteira nesta fase.

import {
  matricularNaTrilha,
  salvarAula,
  salvarTrilha,
} from "./acoes-trilha";

/** Formulário "nova trilha" / "editar trilha" da lista. */
export async function salvarTrilhaDaGestao(formData: FormData): Promise<void> {
  await salvarTrilha(formData);
}

/** Formulário de aula do editor — o mesmo para criar e para editar (a ação de
 *  dentro decide pelo campo `id`, que só vem preenchido na edição). */
export async function salvarAulaDaGestao(formData: FormData): Promise<void> {
  await salvarAula(formData);
}

/** Matricular um mentorado numa trilha. */
export async function matricularNaTrilhaDaGestao(formData: FormData): Promise<void> {
  await matricularNaTrilha(formData);
}
