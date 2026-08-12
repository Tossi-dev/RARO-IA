// A fila do dia — módulo puro.
//
// POR QUE ESTA FILA EXISTE
// ------------------------
// O CRM automático resolve o "quem falou com quem". Sobra a pergunta que o dono
// realmente faz de manhã: com quem eu falo AGORA? Sem uma ordem, a resposta vira
// rolar uma lista de trezentos nomes e escolher pelo que lembrou — e quem
// aparece é quem mandou mensagem por último, não quem está esperando há uma
// semana.
//
// A ordem NÃO é inventada aqui: ela é `pesoDeAtencao` (temperatura.ts), que já
// carrega a regra de negócio de quem fura a fila. Este arquivo só monta a
// leitura de cada pessoa e ordena. Duplicar o critério de prioridade aqui seria
// criar um segundo lugar para ele divergir do primeiro.

import { lerTemperatura, pesoDeAtencao, type FatoObservado, type LeituraDoLead } from "./temperatura";

/** Uma pessoa e os fatos observados dela, do jeito que a camada de dados entrega. */
export interface AlunoParaFila {
  id: string;
  nome: string;
  telefone: string;
  fatos: FatoObservado[];
}

export interface ItemDaFila {
  alunoId: string;
  nome: string;
  telefone: string;
  /** A leitura completa, com o `porque` — a tela mostra o motivo, não uma bolinha. */
  leitura: LeituraDoLead;
  /** O peso que produziu a posição, exposto para a tela poder explicar a ordem. */
  peso: number;
}

/**
 * Monta a fila do dia.
 *
 * QUEM FICA DE FORA, E POR QUE
 * ----------------------------
 * Pessoa sem nenhum fato observado não entra. Não é omissão: `lerTemperatura`
 * devolve temperatura `null` para ela justamente porque não há base para dizer
 * nada, e uma fila de "o que fazer hoje" que começa com duzentos nomes sobre os
 * quais o sistema não sabe nada deixa de ser fila e vira a lista de alunos de
 * novo. Quem quiser prospectar quem nunca foi abordado tem a lista de alunos
 * inteira — que é outra tela, com outra pergunta.
 *
 * `agora` entra por parâmetro (e não `new Date()` aqui dentro) pelo mesmo
 * motivo de `lerTemperatura`: a mesma base tem que produzir a mesma fila no
 * teste e em produção.
 */
export function montarFilaDoDia(alunos: AlunoParaFila[], agora: Date): ItemDaFila[] {
  const itens: ItemDaFila[] = [];

  for (const a of alunos ?? []) {
    const leitura = lerTemperatura(a.fatos ?? [], agora);
    if (leitura.temperatura === null) continue;
    itens.push({
      alunoId: a.id,
      nome: a.nome,
      telefone: a.telefone,
      leitura,
      peso: pesoDeAtencao(leitura),
    });
  }

  // Desempate pelo nome, e não pela ordem de chegada da lista: duas pessoas com
  // o mesmo peso precisam sair sempre na mesma posição, senão a fila embaralha
  // sozinha a cada recarga e o dono perde o lugar onde estava.
  return itens.sort((x, y) => (y.peso - x.peso) || x.nome.localeCompare(y.nome, "pt-BR"));
}
