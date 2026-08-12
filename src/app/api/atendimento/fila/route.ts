// GET /api/atendimento/fila — o que o agente local tem permissão de enviar.
//
// A REGRA QUE ESTA ROTA EXISTE PARA GARANTIR
// ------------------------------------------
// Envio de mensagem NUNCA é automático. O agente local é um braço mecânico: ele
// manda o que estiver aqui, sem julgar. Então a decisão de que alguma coisa
// pode ser mandada acontece ANTES, quando uma pessoa aprova — e o que sai por
// esta rota é só `EnvioPendente`, que carrega `autorizadoPor` e `autorizadoEm`
// justamente para que nenhum envio seja anônimo.
//
// Fila vazia é a resposta correta e comum. Nada aqui inventa sugestão de
// mensagem para "ajudar": texto gerado que sai no WhatsApp do dono sem ele ter
// lido é o erro que ele não consegue desfazer.

import { NextResponse } from "next/server";
import { getDB } from "@/lib/data";
import { conferirAgente } from "../porta";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const recusa = conferirAgente(req);
  if (recusa) return recusa;

  try {
    const envios = await getDB().listEnviosPendentes();
    return NextResponse.json({ envios });
  } catch (erro) {
    return NextResponse.json(
      { erro: erro instanceof Error ? erro.message : "Falha ao ler a fila de envio." },
      { status: 500 }
    );
  }
}
