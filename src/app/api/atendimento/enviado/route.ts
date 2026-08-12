// POST /api/atendimento/enviado — a baixa da fila de saída.
//
// O agente local tenta enviar e devolve `ResultadoEnvio[]`: deu certo (com o id
// que o WhatsApp deu à mensagem) ou não deu (com o erro). Só depois desta
// chamada a linha sai da fila.
//
// POR QUE A BAIXA VEM DEPOIS, E NÃO JUNTO COM A ENTREGA DA FILA
// -------------------------------------------------------------
// Se `GET /fila` já marcasse como enviado, uma queda de rede entre a leitura e
// o envio faria a mensagem sumir sem nunca ter saído — e ninguém descobriria,
// porque o sistema estaria convencido de que enviou. Entregar e baixar em
// chamadas separadas assume o risco oposto (a mesma mensagem ser entregue duas
// vezes ao agente se a baixa se perder), que é o risco visível e recuperável.

import { NextResponse } from "next/server";
import type { ResultadoEnvio } from "@/lib/atendimento/contrato";
import { getDB } from "@/lib/data";
import { conferirAgente, corpoJson } from "../porta";

export const dynamic = "force-dynamic";

/**
 * Aceita tanto o array cru quanto `{ resultados: [...] }`. Não é frouxidão: o
 * agente é outro programa, escrito em paralelo, e recusar o lote inteiro por
 * causa do invólucro perderia envios que o dono já autorizou.
 */
function lerResultados(bruto: unknown): ResultadoEnvio[] {
  const lista = Array.isArray(bruto)
    ? bruto
    : Array.isArray((bruto as { resultados?: unknown })?.resultados)
      ? ((bruto as { resultados: unknown[] }).resultados as unknown[])
      : [];

  const saida: ResultadoEnvio[] = [];
  for (const item of lista) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const id = typeof r.id === "string" ? r.id.trim() : "";
    if (id === "") continue; // sem id não há linha para baixar
    saida.push({
      // `enviado` só é verdadeiro quando vem verdadeiro. Qualquer outra coisa
      // (ausente, "sim", null) é tratada como falha — dar por enviada uma
      // mensagem que talvez não saiu é o erro caro deste endpoint.
      enviado: r.enviado === true,
      id,
      erro: typeof r.erro === "string" ? r.erro.slice(0, 500) : undefined,
      idExterno: typeof r.idExterno === "string" ? r.idExterno : undefined,
    });
  }
  return saida;
}

export async function POST(req: Request) {
  const recusa = conferirAgente(req);
  if (recusa) return recusa;

  const bruto = await corpoJson(req);
  if (bruto === null) {
    return NextResponse.json({ erro: "Corpo não é JSON válido." }, { status: 400 });
  }

  const resultados = lerResultados(bruto);

  try {
    const baixadas = await getDB().registrarResultadoEnvio(resultados);
    return NextResponse.json({
      baixadas,
      // O que veio e não baixou: id desconhecido ou linha que já tinha saído da
      // fila. Número exposto para o agente conseguir perceber que está falando
      // de envios que este servidor não conhece.
      ignorados: resultados.length - baixadas,
    });
  } catch (erro) {
    return NextResponse.json(
      { erro: erro instanceof Error ? erro.message : "Falha ao baixar a fila de envio." },
      { status: 500 }
    );
  }
}
