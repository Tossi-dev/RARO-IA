// POST /api/atendimento/receber — a boca por onde o WhatsApp entra no CRM.
//
// O agente local (no Mac do dono) manda lotes de mensagens: as que chegaram
// agora e, quando reconecta, o que ficou para trás enquanto o notebook estava
// fechado. Reenvio é o comportamento NORMAL deste desenho, não erro — e é por
// isso que a resposta separa `gravadas` de `ignoradas`: sem essa distinção, o
// agente não teria como saber se o silêncio foi sucesso ou desperdício.
//
// A rota é fina de propósito. Ela não decide de quem é a mensagem, não cria
// lead e não mexe em estágio: normaliza (contrato.ts), entrega à camada de
// dados e traduz o balanço. Regra de negócio dentro de route.ts é regra que
// não tem teste e não roda em nenhum outro caminho.

import { NextResponse } from "next/server";
import { normalizarLote } from "@/lib/atendimento/contrato";
import { planejarJuncao } from "@/lib/diagnostico/juncao";
import { casarJuncoes } from "@/lib/diagnostico/registro";
import { getDB } from "@/lib/data";
import { conferirAgente, corpoJson } from "../porta";

// A rota lê e escreve base a cada chamada: cache aqui devolveria ao agente o
// balanço do lote anterior, e ele apagaria do histórico local mensagens que
// nunca foram gravadas.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const recusa = conferirAgente(req);
  if (recusa) return recusa;

  const bruto = await corpoJson(req);
  if (bruto === null) {
    return NextResponse.json({ erro: "Corpo não é JSON válido." }, { status: 400 });
  }

  const { mensagens, descartadas: malformadas } = normalizarLote(bruto);

  try {
    const r = await getDB().registrarInteracoes(mensagens);

    // A JUNÇÃO DO DIAGNÓSTICO ENTRA AQUI, DEPOIS E SEPARADA
    // -----------------------------------------------------
    // Algumas mensagens carregam no texto o código do diagnóstico da landing
    // (`[JR-B1-T5-3-K7QM]`). Quando carregam, elas juntam as cinco respostas
    // já gravadas com a pessoa que acabou de escrever — e é isso que faz a
    // ficha abrir com a abordagem pronta em vez de "oi, tudo bem?".
    //
    // POR QUE DEPOIS DA GRAVAÇÃO, E DENTRO DE UM `try` PRÓPRIO: a gravação do
    // lote é o compromisso desta rota com o agente; a junção é enriquecimento.
    // Se a junção falhar, o agente NÃO pode achar que o lote se perdeu e
    // reenviar tudo — perderíamos mensagem de conversa por causa de um lead.
    // Falha aqui é silenciosa por desenho: o código continua legível dentro da
    // própria mensagem, que é a rota de degradação do funil inteiro.
    let diagnosticos = { casados: 0, fichasCriadas: 0, reconstruidos: 0 };
    try {
      diagnosticos = await casarJuncoes(planejarJuncao(mensagens));
    } catch {
      /* ver comentário acima */
    }

    return NextResponse.json({
      gravadas: r.gravadas,
      ignoradas: r.ignoradas,
      // As duas espécies de descarte somadas: mensagem que nem virou
      // `MensagemRecebida` (sem id, sem data) e mensagem que virou mas não
      // pertence à ficha de ninguém (grupo, telefone irreconhecível). Para o
      // agente as duas significam a mesma coisa — "não insista com esta".
      descartadas: malformadas + r.descartadas,
      leadsCriados: r.leadsCriados,
      // Aditivo: agente antigo ignora o campo, agente novo consegue mostrar
      // "3 diagnósticos casados" no log local em vez de silêncio.
      diagnosticos,
    });
  } catch (erro) {
    // O agente precisa distinguir "recebi e descartei" de "não consegui
    // gravar": no segundo caso ele tem que SEGURAR o lote e tentar de novo,
    // senão o histórico se perde com o notebook fechado.
    return NextResponse.json(
      { erro: erro instanceof Error ? erro.message : "Falha ao registrar as mensagens." },
      { status: 500 }
    );
  }
}
