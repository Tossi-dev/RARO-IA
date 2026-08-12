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
    return NextResponse.json({
      gravadas: r.gravadas,
      ignoradas: r.ignoradas,
      // As duas espécies de descarte somadas: mensagem que nem virou
      // `MensagemRecebida` (sem id, sem data) e mensagem que virou mas não
      // pertence à ficha de ninguém (grupo, telefone irreconhecível). Para o
      // agente as duas significam a mesma coisa — "não insista com esta".
      descartadas: malformadas + r.descartadas,
      leadsCriados: r.leadsCriados,
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
