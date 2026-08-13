// A jornada do cliente — a escada de estágios do CRM, de Prospect a Alumni.
// Módulo PURO: sem Next, sem banco, sem `new Date()`. Roda no Edge, no
// servidor, no teste e dentro de um Server Component sem diferença nenhuma.
//
// POR QUE ESTE ARQUIVO EXISTE
// ---------------------------
// A migração `supabase/migrations/0014_jornada_estagios.sql` deu a
// `crm_estagios` uma coluna `chave` — um identificador ESTÁVEL — justamente
// porque `nome` é texto livre que o dono renomeia na tela quando quiser.
// Este módulo é o outro lado desse combinado: aqui mora o que o CÓDIGO sabe
// sobre a escada (quais degraus existem, em que ordem, o que é transição
// legítima), e é daqui que o kanban, o pipeline comercial e o onboarding
// leem — nunca do `nome`, nunca de `crm_estagios.ordem` cru, que o dono
// também edita.
//
// A tabela continua sendo a fonte da verdade sobre QUAIS estágios aquele
// workspace tem (inclusive os que o dono criou à mão, fora da escada — ver o
// passo 3 da 0014). O que este módulo declara é a escada CANÔNICA: o
// vocabulário que o produto entende. Estágio que exista no banco e não aqui
// não é erro nem some da tela; ele só não participa das regras escritas
// abaixo.

import { STATUS_MENTORADO_VALORES, type StatusMentorado } from "@/lib/mentoria/tipos";

/** Os sete degraus da escada — os mesmos literais semeados pela 0014. */
export type EtapaJornada =
  | "prospect"
  | "lead_qualificado"
  | "proposta"
  | "cliente_novo"
  | "cliente_ativo"
  | "em_risco"
  | "alumni";

/**
 * A escada canônica, em ordem. É esta ordem — e não `crm_estagios.ordem`,
 * que o dono edita — que decide a sequência das colunas do kanban.
 *
 * `as const` + `Object.freeze`, os dois, pelo mesmo motivo de
 * `ROTAS_COMERCIAL` em `src/lib/papeis.ts`: isto é vocabulário de regra de
 * negócio compartilhado por vários módulos, não uma lista de UI. O `as const`
 * faz o `tsc` recusar um `.push()` em tempo de compilação; o `Object.freeze`
 * cobre o que a tipagem não alcança (um `as any` num módulo qualquer,
 * amanhã), fazendo a mutação estourar na hora em vez de mudar a escada em
 * produção para sempre e em silêncio.
 */
export const ESCADA_JORNADA = Object.freeze([
  "prospect",
  "lead_qualificado",
  "proposta",
  "cliente_novo",
  "cliente_ativo",
  "em_risco",
  "alumni",
] as const);

/**
 * O degrau menos privilegiado, e para onde cai tudo que não é reconhecido —
 * mesmo papel de `PAPEL_PADRAO` em `src/lib/papeis.ts`.
 *
 * `prospect` é o topo cru do funil: alguém que só existe como registro.
 * Tratar um valor corrompido como `cliente_ativo` promoveria a pessoa a
 * cliente pagante nas contas do funil sem ninguém ter decidido isso; tratar
 * como `prospect` no máximo a devolve para o começo da fila, onde ela não
 * conta como receita nem abre nada.
 */
export const ETAPA_JORNADA_PADRAO: EtapaJornada = "prospect";

/**
 * Normaliza qualquer entrada (linha de `crm_estagios`, query string, corpo
 * de formulário) num degrau válido. Fail-closed, exatamente como `papelDe`:
 * tolera caixa e espaço nas pontas — desvios inofensivos de copiar-e-colar e
 * digitação — e trata todo o resto como hostil.
 *
 * A comparação é por IGUALDADE EXATA, nunca por prefixo: `"cliente"` é
 * prefixo de `cliente_novo` E de `cliente_ativo`, e um `startsWith` aqui
 * escolheria um dos dois pela ordem do array, promovendo gente de degrau por
 * acidente de implementação.
 */
export function jornadaDe(valor: unknown): EtapaJornada {
  return degrauReconhecido(valor) ?? ETAPA_JORNADA_PADRAO;
}

/**
 * O degrau que a entrada realmente é, ou `null` quando ela não é degrau
 * nenhum. É o miolo de `jornadaDe` e de `ordemDaEtapa`, separado porque as
 * duas precisam de respostas DIFERENTES para o desconhecido: uma cai no
 * padrão, a outra tem que saber que não caiu.
 */
function degrauReconhecido(valor: unknown): EtapaJornada | null {
  if (typeof valor !== "string") return null;
  const normalizado = valor.trim().toLowerCase();
  return (ESCADA_JORNADA as readonly string[]).includes(normalizado)
    ? (normalizado as EtapaJornada)
    : null;
}

/**
 * Este valor é, literalmente, um dos sete degraus?
 *
 * Existe para quem tem uma `chave` crua de `crm_estagios` na mão e precisa
 * DECIDIR, em vez de ser decidido pelo fail-closed: mapear o estágio que o
 * dono criou à mão para o degrau padrão é certo quando o assunto é ordenar
 * uma coluna, e errado quando o assunto é gravar `mentorado.status`.
 *
 * A comparação aqui é EXATA, sem `trim`/`toLowerCase`, e é de propósito: a
 * função promete ao `tsc` que o valor JÁ é uma `EtapaJornada`, e `" alumni "`
 * não é — seria uma promessa falsa, do tipo que só aparece quando alguém
 * concatena a string em outro lugar. Entrada suja passa por `jornadaDe`, que
 * é a porta tolerante; a chave gravada pela 0014 já vem exata.
 */
export function ehEtapaJornada(valor: unknown): valor is EtapaJornada {
  return typeof valor === "string" && (ESCADA_JORNADA as readonly string[]).includes(valor);
}

/**
 * A ordem que todo estágio de FORA da escada recebe: uma casa depois do
 * último degrau. Não é sentinela de erro (`-1`) nem número mágico — é a
 * posição real da coluna na tela.
 *
 * POR QUE não pode ser a ordem de `prospect`: `inativo` é chave real, criada
 * e preservada pela 0014, e o dono pode criar outras. Se o desconhecido
 * empatasse com `prospect` em 0, a coluna dele apareceria no COMEÇO do
 * kanban, colada no topo do funil, dando a entender que aquela gente é
 * contato novo. Empurrar para o fim mantém o dado visível (nunca apagar) sem
 * afirmar nada sobre onde ele está na escada.
 */
export const ORDEM_FORA_DA_ESCADA: number = ESCADA_JORNADA.length;

/**
 * A posição do degrau na escada (0 para `prospect`, 6 para `alumni`), e
 * `ORDEM_FORA_DA_ESCADA` para o que não é degrau. É a chave de ordenação das
 * colunas do kanban.
 *
 * Recebe `unknown` e normaliza por dentro em vez de exigir `EtapaJornada`:
 * quem chama está quase sempre com uma string crua vinda do banco, e uma
 * função de ordenação que lança no meio de um `sort` derrubaria a tela
 * inteira por causa de um estágio esquisito.
 */
export function ordemDaEtapa(valor: unknown): number {
  const degrau = degrauReconhecido(valor);
  return degrau === null ? ORDEM_FORA_DA_ESCADA : ESCADA_JORNADA.indexOf(degrau);
}

/**
 * Esta mudança de estágio é legítima?
 *
 * O que é PERMITIDO, e por quê:
 *   - retroceder (`cliente_ativo` → `proposta`): negócio real volta atrás.
 *     Cliente que pediu para pausar a negociação, proposta que voltou para
 *     revisão. Uma escada que só sobe obriga a mentir sobre onde a pessoa
 *     está;
 *   - pular degrau (`prospect` → `cliente_ativo`): indicação que chega
 *     fechada existe, e forçar a passagem por três degraus fictícios só
 *     sujaria as métricas de conversão com etapas que nunca aconteceram.
 *
 * O que NÃO é permitido: sair de `alumni` para qualquer coisa que não seja
 * `cliente_ativo`. Alumni é quem TERMINOU o programa — é um fato consumado,
 * não uma etapa de funil. A única saída legítima é a recompra, e recompra é
 * cliente ativo de novo. Deixar alumni escorregar de volta para `prospect`
 * ou `em_risco` (por um arrastar de mouse errado no kanban, que é como isso
 * acontece de verdade) apagaria da base a informação de que aquela pessoa
 * já concluiu — e "nunca apagar" vale também para o que já aconteceu.
 * Continuar em `alumni` não é sair de `alumni`: é permitido.
 *
 * As duas pontas passam por `jornadaDe`. A consequência disso está no
 * comentário de `ETAPA_JORNADA_PADRAO` e vale explicitar aqui: um destino
 * irreconhecível a partir de `alumni` vira `prospect` e é RECUSADO — que é o
 * lado seguro. Uma origem irreconhecível (o estágio fora da escada que o
 * dono criou à mão) também vira `prospect`, e sair dela é permitido — está
 * certo: aquele estágio não é `alumni`, e a trava acima é sobre alumni, não
 * sobre "tudo que o código não conhece".
 */
export function transicaoPermitida(de: unknown, para: unknown): boolean {
  const origem = jornadaDe(de);
  const destino = jornadaDe(para);

  if (origem !== "alumni") return true;
  return destino === "alumni" || destino === "cliente_ativo";
}

/**
 * O `status_mentorado` (enum de `0006_mentoros_mentoria.sql`, tipado em
 * `src/lib/mentoria/tipos.ts`) que corresponde ao degrau da escada.
 *
 * As duas colunas existem e continuam separadas de propósito: `crm_estagios`
 * é o funil COMERCIAL (onde a conversa está) e `mentorado.status` é o ciclo
 * de vida da ENTREGA (o que a pessoa recebe hoje). Este mapa é a ponte entre
 * os dois vocabulários, num lugar só, para que ninguém escreva a
 * correspondência de novo — e diferente — em cada tela.
 *
 * NÃO é uma trava de segurança: nenhuma política de RLS do repositório
 * consulta `mentorado.status` (as do portal, em 0012/0013, fecham por
 * `mentorado_atual()`; as do grupo, em 0006, por papel e `workspace_atual()`).
 * Mexer neste mapa muda o que as telas operacionais MOSTRAM sobre a entrega,
 * não quem tem permissão de ler o quê.
 *
 * As escolhas:
 *   - os três degraus de funil (`prospect`, `lead_qualificado`, `proposta`)
 *     viram `lead`: ninguém ali comprou nada ainda;
 *   - `cliente_novo` e `cliente_ativo` viram `ativo`, o óbvio;
 *   - `em_risco` também vira `ativo`, e NÃO `pausado`: em risco é quem ainda
 *     está no programa e pode voltar a engajar — rebaixar para `pausado`
 *     tiraria a pessoa das telas operacionais bem no momento em que ela é a
 *     que mais precisa de atenção;
 *   - `alumni` vira `alumni`.
 *
 * `pausado` não é destino de degrau nenhum, e isso é decisão: pausa é um ato
 * explícito do mentor ("o cliente pediu para parar dois meses"), não algo
 * que se deduza da coluna do kanban em que alguém arrastou um card.
 */
const STATUS_POR_ETAPA: Readonly<Record<EtapaJornada, StatusMentorado>> = Object.freeze({
  prospect: "lead",
  lead_qualificado: "lead",
  proposta: "lead",
  cliente_novo: "ativo",
  cliente_ativo: "ativo",
  em_risco: "ativo",
  alumni: "alumni",
});

/**
 * Exige `EtapaJornada`, e não `unknown`, de propósito — é a única função do
 * módulo que não pode ser fail-closed.
 *
 * As outras normalizam para `prospect` porque o pior caso delas é mostrar
 * alguém no começo da fila. Esta decide o `mentorado.status`, ou seja,
 * REESCREVE estado de negócio: engolindo `unknown`, um cliente pagante
 * parado num estágio que o dono criou à mão (a 0014 garante que esses
 * existam, `inativo` inclusive) seria rebaixado a `lead` em silêncio — e
 * apagar o fato de que a pessoa é cliente é pior do que não ter resposta.
 *
 * Quem tem chave crua do banco decide antes, com `ehEtapaJornada`, e o `tsc`
 * cobra essa decisão no lugar certo: a chamada.
 */
export function statusMentoradoDaEtapa(chave: EtapaJornada): StatusMentorado {
  return STATUS_POR_ETAPA[chave];
}

/**
 * Os destinos de `mapa` que não existem em `valoresDoEnum` — vazio quando
 * está tudo coerente.
 *
 * O que ela guarda: todo destino de `STATUS_POR_ETAPA` precisa ser um valor
 * que o enum do Postgres realmente aceita. O `Record<EtapaJornada,
 * StatusMentorado>` já garante isso em tempo de compilação; esta função cobre
 * o caso em que `STATUS_MENTORADO_VALORES` e o tipo `StatusMentorado` saírem
 * de sincronia entre si (o enum do banco mudou, o tipo foi atualizado e a
 * lista de valores não), que é justamente quando o `tsc` para de ajudar.
 *
 * POR QUE É UMA FUNÇÃO, E NÃO UM `if` NO TOPO DO MÓDULO: a versão anterior
 * lançava durante o import. Num arquivo anunciado como PURO isso é efeito
 * colateral de carregamento — se disparasse em produção não devolveria erro
 * tratável, derrubaria no import toda rota que tocasse o kanban, o pipeline
 * ou o onboarding. E, por não ser chamada por ninguém, era código morto:
 * dava para invertê-la inteira sem nenhum teste piscar. Os parâmetros têm
 * padrão para que o teste consiga exercitar o caso incoerente de verdade,
 * em vez de só reexecutar o caminho que sempre passa.
 */
export function statusIncoerentesDoMapa(
  mapa: Readonly<Record<string, string>> = STATUS_POR_ETAPA,
  valoresDoEnum: readonly string[] = STATUS_MENTORADO_VALORES,
): string[] {
  return [...new Set(Object.values(mapa))].filter((status) => !valoresDoEnum.includes(status));
}
