// O plano de recepção de um lote de mensagens — módulo puro, sem I/O.
//
// POR QUE UM "PLANO" EM VEZ DE CADA PROVIDER RESOLVER O SEU
// ---------------------------------------------------------
// Quatro providers precisam fazer exatamente a mesma coisa antes de gravar:
// descartar mensagem que não pertence a ninguém, descartar mensagem que já
// entrou antes, casar telefone com cliente, e decidir quem vira lead novo.
// Escrever isso quatro vezes é escrever quatro regras que começam iguais e
// divergem na primeira correção — e a divergência apareceria como "no modo
// planilha duplica, no demo não", que é o tipo de bug que ninguém reproduz.
//
// Aqui a decisão inteira acontece SEM tocar em banco: entra o lote, a lista de
// clientes já carregada e os `idExterno` já gravados; sai a lista do que
// escrever. Cada provider fica responsável só pela escrita, que é a parte que
// de fato muda entre planilha, Postgres e memória.

import type { MensagemRecebida } from "./contrato";
import { acharPorTelefone, chaveTelefone, formatarTelefone, telefoneDoJid } from "./telefone";

/** O mínimo que o plano precisa saber de um cliente já cadastrado. */
export interface ClienteConhecido {
  id: string;
  telefone: string;
}

/** Um lead que ainda não existe e precisa nascer para a mensagem ter dono. */
export interface LeadANascer {
  /** `chaveTelefone` do número — é ela que liga o lead às interações do plano. */
  chave: string;
  /** Nome de exibição do WhatsApp quando houver; senão o telefone formatado. */
  nome: string;
  /** O número como veio, normalizado — o que serve para discar, não a chave. */
  telefone: string;
}

/** Uma interação pronta para gravar, faltando só o id que a base vai gerar. */
export interface InteracaoPlanejada {
  /** Id do cliente existente; `""` quando o dono desta mensagem ainda vai nascer. */
  alunoId: string;
  /** Chave do lead a nascer; `""` quando `alunoId` já está preenchido. */
  chaveLead: string;
  canal: MensagemRecebida["canal"];
  direcao: MensagemRecebida["direcao"];
  texto: string;
  quando: string;
  idExterno: string;
  tipoMidia: string;
  nomeExibicao: string;
  /** O numero da outra ponta, ja normalizado. Viaja ate a linha gravada para a
   *  conversa poder ser lida sem abrir a ficha do aluno. */
  telefone: string;
}

export interface PlanoRecepcao {
  leads: LeadANascer[];
  interacoes: InteracaoPlanejada[];
  /** Já tinham sido gravadas antes (reenvio na reconexão do agente). */
  ignoradas: number;
  idsExternosIgnorados: string[];
  /** Não podiam pertencer à ficha de ninguém: grupo, telefone irreconhecível. */
  descartadas: number;
}

/**
 * Monta o plano.
 *
 * DUAS DEDUPLICAÇÕES, NÃO UMA
 * ---------------------------
 * Contra o que já está gravado (`idsJaGravados`) e DENTRO do próprio lote. A
 * segunda não é preciosismo: o agente monta o lote a partir do histórico local
 * do WhatsApp, e histórico relido depois de uma reconexão traz a mesma mensagem
 * repetida no mesmo POST. Sem a segunda checagem, uma única chamada gravaria a
 * duplicata que a primeira checagem existe para impedir.
 *
 * `telefoneDoJid` e não `normalizarTelefone` na entrada: ele aceita tanto
 * "5514991234567@c.us" quanto o número solto, e devolve "" para "@g.us" —
 * conversa de grupo não pertence a um cliente e não pode entrar na ficha de
 * ninguém, nem do participante que por acaso também é cliente.
 */
export function planejarRecepcao(
  mensagens: MensagemRecebida[],
  clientes: ClienteConhecido[],
  idsJaGravados: ReadonlySet<string>
): PlanoRecepcao {
  const plano: PlanoRecepcao = {
    leads: [],
    interacoes: [],
    ignoradas: 0,
    idsExternosIgnorados: [],
    descartadas: 0,
  };

  const vistosNoLote = new Set<string>();
  const leadsPorChave = new Map<string, LeadANascer>();

  for (const m of mensagens ?? []) {
    if (idsJaGravados.has(m.idExterno) || vistosNoLote.has(m.idExterno)) {
      plano.ignoradas++;
      plano.idsExternosIgnorados.push(m.idExterno);
      continue;
    }

    const telefone = telefoneDoJid(m.telefone);
    const chave = chaveTelefone(telefone);
    if (chave === "") {
      plano.descartadas++;
      continue;
    }

    // Marcado só depois dos descartes: uma mensagem que nunca vai ser gravada
    // não pode "reservar" o id contra ela mesma.
    vistosNoLote.add(m.idExterno);

    const cliente = acharPorTelefone(clientes, telefone);
    if (!cliente) {
      // Duas mensagens do mesmo número desconhecido no mesmo lote são UM lead,
      // não dois. Sem este mapa, o primeiro contato de alguém que mandou três
      // mensagens seguidas viraria três fichas da mesma pessoa.
      if (!leadsPorChave.has(chave)) {
        leadsPorChave.set(chave, {
          chave,
          // Nome de exibição é o que o dono reconhece na agenda dele. Sem ele,
          // o telefone formatado — nunca um "Contato sem nome", que obrigaria
          // o dono a abrir a ficha para saber de quem se trata.
          nome: m.nomeExibicao.trim() !== "" ? m.nomeExibicao.trim() : formatarTelefone(telefone),
          telefone,
        });
      }
    }

    plano.interacoes.push({
      alunoId: cliente?.id ?? "",
      chaveLead: cliente ? "" : chave,
      canal: m.canal,
      direcao: m.direcao,
      texto: m.texto,
      quando: m.quando,
      idExterno: m.idExterno,
      tipoMidia: m.tipoMidia,
      nomeExibicao: m.nomeExibicao,
      // O normalizado, nao o que veio no campo: e este que casa com o cadastro.
      telefone,
    });
  }

  plano.leads = [...leadsPorChave.values()];
  return plano;
}
