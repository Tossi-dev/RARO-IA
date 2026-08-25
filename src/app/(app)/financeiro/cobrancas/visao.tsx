"use client";

import { useState } from "react";
import { Badge, Card, PageHeader, Stat, Tabela, Td, Th, Vazio } from "@/components/ui";
import { fmtBRL } from "@/lib/format";
import type { IndicadoresRecorrencia } from "@/lib/financeiro/dados-cobranca";

function vencida(vencimento: string): boolean {
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  return /^\d{4}-\d{2}-\d{2}$/.test(vencimento) && vencimento < hoje;
}

export function enfileirarParaAprovacao(fila: readonly string[], lembreteId: string): string[] {
  return fila.includes(lembreteId) ? [...fila] : [...fila, lembreteId];
}

export function CobrancasVisao({ dados }: { dados: IndicadoresRecorrencia }) {
  const [fila, setFila] = useState<string[]>([]);
  return <><PageHeader titulo="Cobranças" sub="O que venceu, o que entrou e qual lembrete precisa de aprovação" />
    {!dados.conectado ? <Card><p className="text-sm text-texto-2">{dados.motivo}</p></Card> : <>
      {dados.parcial ? <p className="mb-4 rounded-xl border border-atencao/40 bg-atencao/10 px-4 py-3 text-sm text-texto-2">{dados.motivo}</p> : null}
      <div className="grid gap-3 sm:grid-cols-2"><Stat label="MRR" valor={dados.mrr === null ? "sem base" : fmtBRL(dados.mrr)} hint="parcelas pagas na competência" /><Stat label="ARR" valor={dados.arr === null ? "sem base" : fmtBRL(dados.arr)} hint="MRR anualizado" /></div>
      {dados.mrr === null ? <p className="mt-2 text-sm text-texto-2">MRR ainda sem base para calcular.</p> : null}
      <Card titulo="Régua sugerida" className="mt-4">{dados.regua === null || dados.regua.lembretes.length === 0 ? <Vazio>Nenhum lembrete aguardando aprovação.</Vazio> : <ul className="space-y-2">{dados.regua.lembretes.map((lembrete) => { const id = `${lembrete.cobrancaId}:${lembrete.degrau}`; const naFila = fila.includes(id); return <li key={id} className="flex flex-wrap items-center justify-between gap-2 text-sm"><span>{lembrete.texto}</span><button type="button" data-fila={naFila ? id : undefined} disabled={naFila} onClick={() => setFila((atual) => enfileirarParaAprovacao(atual, id))} className="rounded border border-borda px-3 py-1.5 text-sm disabled:opacity-60">{naFila ? "Na fila de aprovação" : "Colocar na fila de aprovação"}</button></li>; })}</ul>}</Card>
      <Card titulo="Cobranças" className="mt-4">{dados.cobrancas.length === 0 ? <Vazio>Nenhuma cobrança registrada.</Vazio> : <Tabela><thead><tr><Th>Competência</Th><Th>Vencimento</Th><Th num>Valor</Th><Th>Status</Th></tr></thead><tbody>{dados.cobrancas.map((cobranca) => <tr key={cobranca.id} data-atrasada={vencida(cobranca.vencimento) ? cobranca.id : undefined}><Td>{cobranca.competencia || "Sem competência"}</Td><Td>{cobranca.vencimento || "Sem vencimento"}</Td><Td num>{fmtBRL(cobranca.valor)}</Td><Td><Badge tom={vencida(cobranca.vencimento) ? "vermelho" : "cinza"}>{vencida(cobranca.vencimento) ? "Atrasada" : cobranca.status || "Sem status"}</Badge></Td></tr>)}</tbody></Tabela>}</Card>
    </>}</>;
}
