"use client";

import { useMemo, useState } from "react";
import { Card, Botao, TextArea } from "@/components/ui";
import { perguntasPara } from "@/lib/mentoria/perguntas";
import type { AtendimentoLido, AtendimentoPasso, AtendimentoReflexao } from "@/lib/mentoria/dados-atendimento";

export type PerguntaRoteiro = Readonly<{ id: string; pergunta: string; dimensao: string }>;

type EntradaFicha = Pick<AtendimentoLido, "mapa" | "metas">;

export function roteiroDaFicha({ mapa, metas }: EntradaFicha): PerguntaRoteiro[] {
  if (mapa.length === 0 && metas.length === 0) return [];
  const mapaBase = mapa[0];
  const dimensao = mapaBase?.dimensao ?? "profissional";
  const contexto = mapaBase ? { dor: mapaBase.dor ?? undefined, medo: mapaBase.medo ?? undefined, objetivo: mapaBase.objetivo ?? undefined } : {};
  const perguntas = perguntasPara(dimensao, contexto);
  const meta = metas[0]?.titulo?.trim();
  const resultado = perguntas.map((pergunta, index) => ({ id: `pergunta-${index}`, pergunta, dimensao }));
  if (meta && resultado.length === 0) return [{ id: "pergunta-meta", pergunta: `O que você gostaria de observar sobre a meta “${meta}”?`, dimensao }];
  return resultado;
}

export function editarPergunta(roteiro: readonly PerguntaRoteiro[], id: string, pergunta: string): PerguntaRoteiro[] {
  const texto = pergunta.replace(/\s+/g, " ").trim();
  return roteiro.map((item) => item.id === id ? { ...item, pergunta: texto } : item);
}

export function registrarReflexaoLocal(reflexoes: readonly AtendimentoReflexao[], texto: string): AtendimentoReflexao[] {
  const limpo = texto.replace(/\s+/g, " ").trim();
  if (!limpo) return [...reflexoes];
  return [...reflexoes, { id: `reflexao-local-${reflexoes.length + 1}`, texto: limpo, origem: "profissional", visibilidade: "privada_profissional" }];
}

export function converterPerguntaEmPasso(passos: readonly AtendimentoPasso[], roteiro: readonly PerguntaRoteiro[], id: string): AtendimentoPasso[] {
  const pergunta = roteiro.find((item) => item.id === id);
  if (!pergunta) return [...passos];
  return [...passos, { id: `passo-local-${passos.length + 1}`, descricao: pergunta.pergunta, responsavel: "profissional", status: "pendente", ordem: passos.length + 1, meta_id: null }];
}

export function RoteiroSessao({ atendimento }: { atendimento: AtendimentoLido }) {
  const inicial = useMemo(() => roteiroDaFicha(atendimento), [atendimento]);
  const [roteiro, setRoteiro] = useState<PerguntaRoteiro[]>(inicial);
  const reflexaoAutorizada = atendimento.consentimentos.some((item) => item.categoria === "reflexao" && item.consentido === true);
  const [reflexoes, setReflexoes] = useState<AtendimentoReflexao[]>(reflexaoAutorizada ? atendimento.reflexoes : []);
  const [passos, setPassos] = useState<AtendimentoPasso[]>(atendimento.passos);
  const [reflexao, setReflexao] = useState("");

  return <Card titulo="Roteiro da sessão">
    <p className="mb-4 text-xs text-texto-2">Perguntas são sugestões para o profissional conduzir a conversa; não são respostas nem prescrições.</p>
    {roteiro.length ? <div className="space-y-3">
      {roteiro.map((item) => <article key={item.id} className="rounded-xl border border-borda-sutil bg-poco p-3">
        <label className="block text-xs text-texto-2">Pergunta sugerida
          <input aria-label={`Pergunta ${item.id}`} value={item.pergunta} onChange={(event) => setRoteiro((atual) => editarPergunta(atual, item.id, event.target.value))} className="mt-1 w-full rounded-xl border border-borda-sutil bg-poco px-3 py-2 text-sm text-texto" />
        </label>
        <button type="button" className="trans mt-2 inline-flex items-center justify-center rounded-full border border-borda px-4 py-2 text-sm text-texto-2 hover:border-borda-forte hover:bg-eleva" onClick={() => setPassos((atual) => converterPerguntaEmPasso(atual, roteiro, item.id))}>Converter em passo</button>
      </article>)}
    </div> : <p className="rounded-xl border border-dashed border-borda px-4 py-6 text-sm text-texto-3">Ainda não há perguntas no roteiro desta sessão.</p>}
    {passos.length ? <p className="mt-3 text-xs text-texto-2">{passos.length} passo(s) local(is) no roteiro.</p> : null}
    {reflexaoAutorizada ? <form className="mt-5" onSubmit={(event) => { event.preventDefault(); setReflexoes((atual) => registrarReflexaoLocal(atual, reflexao)); setReflexao(""); }}>
      <label className="block text-xs text-texto-2">Reflexão livre do profissional
        <TextArea value={reflexao} onChange={(event) => setReflexao(event.target.value)} placeholder="O que você percebeu e quer retomar?" />
      </label>
      <Botao tipo="fantasma" className="mt-2">Registrar reflexão</Botao>
    </form> : <p className="mt-5 text-xs text-texto-3">A reflexão livre não está disponível porque o consentimento está ausente.</p>}
    {reflexoes.length ? <ul className="mt-3 space-y-1 text-sm">{reflexoes.map((item, index) => <li key={item.id ?? `reflexao-${index}`}>{item.texto}</li>)}</ul> : null}
  </Card>;
}
