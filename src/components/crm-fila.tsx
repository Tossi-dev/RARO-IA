"use client";

// A fila do dia — a tela que responde "com quem eu falo agora, e por quê".
//
// POR QUE ELA EXISTE, E POR QUE NÃO É "MAIS UM RANKING"
// ----------------------------------------------------
// Um CRM comum mostra a lista de clientes e deixa a decisão inteira com o
// dono. Aqui a ordem já é a decisão: quem está esperando resposta vem primeiro,
// depois quente, morno, frio. E cada linha traz o MOTIVO datado do lugar em
// que está — se o dono discordar, ele discute com um fato, não com uma
// bolinha colorida.
//
// A leitura nunca é gravada em lugar nenhum: ela é recalculada a cada abertura
// da tela, a partir das interações. É de propósito. Lead marcado como "quente"
// há três meses é a mentira mais comum de CRM, e ela só existe porque alguém
// deixou marcar na mão.

import { Flame, MessageCircle, Snowflake, ThermometerSun, Moon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { ItemDaFila } from "@/lib/atendimento/fila";
import type { Temperatura } from "@/lib/atendimento/temperatura";
import { TEMPERATURA_ROTULO } from "@/lib/atendimento/temperatura";
import { formatarTelefone } from "@/lib/atendimento/telefone";
import { Badge, Card, Vazio, cx, type Tom } from "./ui";

const TOM: Record<Temperatura, Tom> = {
  quente: "vermelho",
  morno: "ouro",
  frio: "azul",
  dormindo: "cinza",
};

const ICONE: Record<Temperatura, typeof Flame> = {
  quente: Flame,
  morno: ThermometerSun,
  frio: Snowflake,
  dormindo: Moon,
};

/**
 * Quantos cabem antes de a fila deixar de ser fila.
 *
 * Uma lista de sessenta nomes "para falar hoje" é a lista de clientes com
 * outro nome, e ninguém age em cima dela. O corte é explícito e o que ficou de
 * fora é ANUNCIADO no rodapé — corte silencioso é pior que corte nenhum,
 * porque o dono passa a achar que viu tudo.
 */
const TETO_DA_FILA = 12;

export function CrmFila({ itens }: { itens: ItemDaFila[] }) {
  const [aberto, setAberto] = useState<string | null>(null);
  const [verTodos, setVerTodos] = useState(false);

  if (itens.length === 0) {
    return (
      <Card titulo="Com quem falar hoje">
        <Vazio>
          A fila é montada a partir de conversas registradas. Sem nenhuma mensagem trocada, não há
          base para dizer com quem falar — e chutar seria pior que não dizer nada.
        </Vazio>
      </Card>
    );
  }

  const esperando = itens.filter((i) => i.leitura.esperandoResposta).length;
  const mostrados = verTodos ? itens : itens.slice(0, TETO_DA_FILA);
  const escondidos = itens.length - mostrados.length;

  return (
    <Card
      titulo="Com quem falar hoje"
      acao={
        esperando > 0 ? (
          <Badge tom="vermelho">{esperando} esperando resposta</Badge>
        ) : (
          <Badge tom="verde">ninguém esperando</Badge>
        )
      }
    >
      <ul className="space-y-1.5">
        {mostrados.map((i) => {
          const t = i.leitura.temperatura;
          if (t === null) return null; // a fila nunca traz "sem sinal", mas o tipo permite
          const Icone = ICONE[t];
          const abertoAgora = aberto === i.alunoId;
          return (
            <li
              key={i.alunoId}
              className={cx(
                "trans rounded-2xl border px-3.5 py-3 transition-colors",
                i.leitura.esperandoResposta
                  ? "border-negativo/40 bg-negativo/5"
                  : "border-borda-sutil bg-painel-2"
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                <Icone size={15} aria-hidden strokeWidth={1.5} className="shrink-0 text-texto-2" />
                <Link href={`/crm/${i.alunoId}`} className="min-w-0 flex-1 truncate text-sm hover:text-primaria-2">
                  {i.nome}
                </Link>
                <Badge tom={TOM[t]}>{TEMPERATURA_ROTULO[t]}</Badge>
                {i.leitura.esperandoResposta ? <Badge tom="vermelho">esperando</Badge> : null}
                <span className="shrink-0 text-[11px] tabular-nums text-texto-3">
                  confiança {i.leitura.confianca}/100 · {i.leitura.rotuloConfianca}
                </span>
              </div>

              <p className="mt-1.5 text-xs leading-snug text-texto-2">{i.leitura.sugestao}</p>

              <div className="mt-1.5 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setAberto(abertoAgora ? null : i.alunoId)}
                  className="toque text-[11px] text-texto-3 underline-offset-2 hover:text-texto-2 hover:underline"
                >
                  {abertoAgora ? "esconder o porquê" : "por quê?"}
                </button>
                {i.telefone ? (
                  <span className="text-[11px] tabular-nums text-texto-3">
                    {formatarTelefone(i.telefone)}
                  </span>
                ) : null}
              </div>

              {/* O porquê: os fatos datados que produziram a leitura. É o que
                  transforma "confie no sistema" em "confira você mesmo". */}
              {abertoAgora ? (
                <ul className="mt-2 space-y-1 border-t border-borda-sutil pt-2">
                  {i.leitura.porque.map((p, idx) => (
                    <li key={idx} className="flex gap-2 text-[11px] leading-snug text-texto-3">
                      <MessageCircle size={11} aria-hidden className="mt-0.5 shrink-0" />
                      {p}
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>

      {escondidos > 0 || verTodos ? (
        <button
          type="button"
          onClick={() => setVerTodos(!verTodos)}
          className="toque mt-3 w-full rounded-xl border border-borda-sutil py-2 text-xs text-texto-3 transition-colors hover:border-borda hover:text-texto-2"
        >
          {verTodos
            ? `mostrar só os ${TETO_DA_FILA} primeiros`
            : `mais ${escondidos} pessoa(s) com sinal, ordenadas atrás destas`}
        </button>
      ) : null}
    </Card>
  );
}
