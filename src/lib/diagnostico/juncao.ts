// O plano de junção: quais mensagens de um lote carregam um diagnóstico —
// módulo puro, sem I/O, no mesmo desenho de `atendimento/recepcao.ts`.
//
// POR QUE UM PLANO, E NÃO O `update` DIRETO DENTRO DA ROTA
// -------------------------------------------------------
// A decisão de "esta mensagem junta com aquele diagnóstico" tem quatro regras
// que ninguém lembra de aplicar todas ao escrever um `update` na pressa:
// mensagem que nós enviamos não junta, conversa de grupo não junta, código
// inválido não junta, e o mesmo código repetido no lote é UMA junção. Aqui
// elas ficam num lugar só, cobertas por teste, e a rota só executa o plano.
//
// O AGENTE REENVIA O HISTÓRICO — SEMPRE
// -------------------------------------
// Quando o notebook do dono reconecta, o agente manda de novo o que ficou para
// trás, e a mesma mensagem com o mesmo código chega várias vezes. Por isso a
// junção é idempotente dos dois lados: o plano deduplica dentro do lote, e a
// escrita só grava quando a linha ainda não tem dono (`aluno_id is null`).
// Sem as duas, um lead reprocessado teria `casado_em` reescrito toda vez que o
// notebook do Jefson fosse aberto — e a data que diz "quando ele te procurou"
// viraria a data da última reconexão.

import type { MensagemRecebida } from "@/lib/atendimento/contrato";
import { chaveTelefone, telefoneDoJid } from "@/lib/atendimento/telefone";
import { lerCodigo, lerSegmento, type Segmento } from "./codigo";

export interface JuncaoPlanejada {
  codigo: string;
  segmento: Segmento;
  /** Telefone normalizado — é por ele que se acha ou nasce a ficha. */
  telefone: string;
  /** `chaveTelefone` do número, para casar com a ficha existente. */
  chave: string;
  /** ISO do momento em que a mensagem existiu no WhatsApp. */
  quando: string;
  /** Nome da agenda do WhatsApp, quando houver. */
  nomeExibicao: string;
}

/**
 * Monta o plano de junção de um lote.
 *
 * Devolve no máximo uma junção por código, com a mensagem MAIS ANTIGA que o
 * carregava. A mais antiga, e não a mais recente, porque a pergunta que o
 * `casado_em` responde é *quando ele te procurou* — e quem mandou o
 * diagnóstico às 6h e insistiu às 11h te procurou às 6h.
 */
export function planejarJuncao(mensagens: MensagemRecebida[]): JuncaoPlanejada[] {
  const porCodigo = new Map<string, JuncaoPlanejada>();

  for (const m of mensagens ?? []) {
    // Mensagem que NÓS enviamos pode conter o código — basta o Jefson repetir
    // o texto do lead para confirmar. Juntar por ela criaria uma ficha a
    // partir da nossa própria fala.
    if (m.direcao !== "recebida") continue;

    const codigo = lerCodigo(m.texto ?? "");
    if (!codigo) continue;

    const segmento = lerSegmento(codigo);
    if (!segmento) continue;

    // `telefoneDoJid` devolve "" para "@g.us": conversa de grupo não pertence
    // a um cliente e não pode virar ficha de ninguém — nem do participante que
    // por acaso também é cliente.
    const telefone = telefoneDoJid(m.telefone ?? "");
    const chave = chaveTelefone(telefone);
    if (chave === "") continue;

    const anterior = porCodigo.get(codigo);
    if (anterior && anterior.quando <= (m.quando ?? "")) continue;

    porCodigo.set(codigo, {
      codigo,
      segmento,
      telefone,
      chave,
      quando: m.quando ?? "",
      nomeExibicao: (m.nomeExibicao ?? "").trim(),
    });
  }

  return [...porCodigo.values()];
}
