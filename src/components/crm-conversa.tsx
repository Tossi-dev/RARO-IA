"use client";

// A conversa do cliente dentro da ficha dele: o que foi trocado, a leitura de
// temperatura com o porquê, e o rascunho de resposta.
//
// A REGRA QUE MANDA NESTE ARQUIVO
// -------------------------------
// Escrever aqui NÃO envia. O botão chama "Aprovar e pôr na fila", e é isso que
// ele faz: grava uma linha na fila de saída com o nome de quem aprovou e a
// hora. Quem envia de verdade é o agente no Mac do dono, quando ele estiver
// aberto, respeitando o limite de ritmo.
//
// Essa distância entre escrever e sair é de propósito, e é o desenho inteiro:
// mensagem saindo no nome do dono sem alguém ter lido é o único erro deste
// sistema que o CLIENTE FINAL percebe — e o que ele percebe não dá para
// desfazer com um deploy.

import { ArrowDownLeft, ArrowUpRight, Circle, Send } from "lucide-react";
import { useState, useTransition } from "react";
import { formatarTelefone } from "@/lib/atendimento/telefone";
import { TEMPERATURA_ROTULO, type LeituraDoLead } from "@/lib/atendimento/temperatura";
import type { Interacao } from "@/lib/types";
import { Badge, Card, TextArea, Vazio, cx, type Tom } from "./ui";

const TOM_TEMPERATURA: Record<string, Tom> = {
  quente: "vermelho",
  morno: "ouro",
  frio: "azul",
  dormindo: "cinza",
};

function horaBR(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

export function CrmConversa({
  interacoes,
  leitura,
  telefone,
  agenteLigado,
  aprovar,
}: {
  interacoes: Interacao[];
  leitura: LeituraDoLead;
  telefone: string;
  /** O WhatsApp do dono está de pé agora? A tela não pode fingir que sim. */
  agenteLigado: boolean;
  aprovar: (texto: string) => Promise<{ ok: boolean; erro?: string }>;
}) {
  const [texto, setTexto] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  const emOrdem = [...interacoes].sort((a, b) => Date.parse(a.quando) - Date.parse(b.quando));
  const t = leitura.temperatura;

  function aoAprovar() {
    const limpo = texto.trim();
    if (limpo === "" || pendente) return;
    setAviso(null);
    iniciar(async () => {
      const r = await aprovar(limpo);
      if (r.ok) {
        setTexto("");
        setAviso(
          agenteLigado
            ? "Na fila. Vai sair pelo WhatsApp em instantes."
            : "Na fila. Vai sair assim que o notebook com o WhatsApp estiver aberto."
        );
      } else {
        setAviso(r.erro ?? "Não consegui pôr na fila.");
      }
    });
  }

  return (
    <div className="space-y-4">
      <Card
        titulo="Leitura desta pessoa"
        acao={
          t ? (
            <span className="flex items-center gap-2">
              <Badge tom={TOM_TEMPERATURA[t] ?? "cinza"}>{TEMPERATURA_ROTULO[t]}</Badge>
              <span className="text-[11px] tabular-nums text-texto-3">
                confiança {leitura.confianca}/100 · {leitura.rotuloConfianca}
              </span>
            </span>
          ) : (
            <Badge tom="cinza">sem sinal</Badge>
          )
        }
      >
        <p className="text-sm">{leitura.sugestao}</p>
        {/* Os fatos ficam SEMPRE visíveis aqui (diferente da fila, onde são um
            clique): esta é a tela em que a pessoa vai decidir o que escrever, e
            decidir sem ver em cima de quê é o que produz mensagem sem noção. */}
        <ul className="mt-3 space-y-1 border-t border-borda-sutil pt-3">
          {leitura.porque.map((p, i) => (
            <li key={i} className="flex gap-2 text-xs leading-snug text-texto-3">
              <Circle size={6} aria-hidden className="mt-1.5 shrink-0 fill-current" />
              {p}
            </li>
          ))}
        </ul>
      </Card>

      <Card
        titulo="Conversa"
        acao={
          <span className="text-[11px] tabular-nums text-texto-3">
            {telefone ? formatarTelefone(telefone) : "sem telefone"}
          </span>
        }
      >
        {emOrdem.length === 0 ? (
          <Vazio>
            Nenhuma mensagem registrada. As conversas aparecem aqui sozinhas quando o WhatsApp do
            dono estiver conectado — o histórico não é digitado por ninguém.
          </Vazio>
        ) : (
          <ul className="space-y-2">
            {emOrdem.map((m) => {
              const dele = m.direcao === "recebida";
              return (
                <li
                  key={m.id}
                  className={cx(
                    "max-w-[86%] rounded-2xl border px-3.5 py-2.5",
                    dele
                      ? "border-borda-sutil bg-painel-2"
                      : "ml-auto border-primaria/30 bg-primaria/10"
                  )}
                >
                  <p className="mb-1 flex items-center gap-1.5 text-[11px] text-texto-3">
                    {dele ? (
                      <ArrowDownLeft size={11} aria-hidden />
                    ) : (
                      <ArrowUpRight size={11} aria-hidden />
                    )}
                    {dele ? "ele" : "nós"} · {horaBR(m.quando)}
                    {m.tipoMidia ? ` · ${m.tipoMidia}` : ""}
                  </p>
                  <p className="whitespace-pre-wrap text-sm leading-snug">
                    {m.texto || <span className="text-texto-3">(sem texto)</span>}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card titulo="Responder">
        <p className="mb-2 text-xs leading-snug text-texto-2">
          Escrever aqui <strong>não envia</strong>. O texto entra numa fila com o seu nome e a hora,
          e sai pelo WhatsApp do dono quando o notebook dele estiver aberto.
        </p>
        {!agenteLigado ? (
          <p className="mb-3 rounded-xl border border-aviso/40 bg-aviso/10 px-3 py-2 text-xs text-aviso">
            O WhatsApp está desconectado agora. Você pode deixar a mensagem na fila mesmo assim —
            ela sai sozinha no próximo login.
          </p>
        ) : null}
        <TextArea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={3}
          placeholder="Escreva a resposta…"
        />
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={aoAprovar}
            disabled={texto.trim() === "" || pendente}
            className="trans bevel inline-flex items-center gap-1.5 rounded-full bg-gradient-to-b from-primaria-2 via-primaria to-primaria-press px-4 py-2 text-sm font-medium text-white transition-all hover:brightness-110 disabled:pointer-events-none disabled:opacity-40"
          >
            <Send size={14} aria-hidden strokeWidth={1.75} />
            {pendente ? "Pondo na fila…" : "Aprovar e pôr na fila"}
          </button>
          {aviso ? <span className="text-xs text-texto-2">{aviso}</span> : null}
        </div>
      </Card>
    </div>
  );
}
