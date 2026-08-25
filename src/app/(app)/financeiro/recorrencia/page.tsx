import { Card, PageHeader, Stat, Vazio } from "@/components/ui";
import { fmtBRL } from "@/lib/format";
import { lerIndicadoresRecorrencia } from "@/lib/financeiro/dados-cobranca";

export const dynamic = "force-dynamic";

export default async function Recorrencia() {
  const dados = await lerIndicadoresRecorrencia(new Date().toISOString());
  return <><PageHeader titulo="Recorrência" sub="Qual receita recorrente foi recebida e o que ainda não tem base" /><Card>{!dados.conectado ? <p className="text-sm text-texto-2">{dados.motivo}</p> : <><div className="grid gap-3 sm:grid-cols-2"><Stat label="MRR" valor={dados.mrr === null ? "sem base" : fmtBRL(dados.mrr)} hint={dados.mrr === null ? "Ainda não há parcelas pagas suficientes" : "receita mensal recorrente"} /><Stat label="ARR" valor={dados.arr === null ? "sem base" : fmtBRL(dados.arr)} hint={dados.arr === null ? "Ainda não há série mensal válida" : "receita anual recorrente"} /></div>{dados.cobrancas.length === 0 ? <Vazio>Nenhuma parcela registrada para formar recorrência.</Vazio> : null}</>}</Card></>;
}
