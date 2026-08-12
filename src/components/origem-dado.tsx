// Tira de origem -- a etiqueta que responde, embaixo de cada bloco do painel,
// "esse numero saiu de onde e como aquela linha vai chegar la".
//
// MODULO NEUTRO (sem "use client"): exporta valor de runtime consumido por
// Server Components. Nao pode ganhar estado nem hook.
//
// Por que isso e uma peca de produto e nao um enfeite: o dono ja perguntou, com
// razao, de onde vinham os numeros. A resposta nao pode viver so num documento
// -- ela tem que estar na tela, ao lado do numero, sempre. E quando o bloco esta
// zerado a tira vira a coisa mais util da tela: em vez de um vazio mudo, o
// usuario le qual aba enche aquele grafico e por qual caminho.

import {
  ROTULO_MODO,
  ROTULO_STATUS,
  rotaPrincipal,
  type RotaDeColeta,
  type StatusColeta,
} from "@/lib/sheets/coleta";
import { Badge, type Tom } from "./ui";

const TOM_STATUS: Record<StatusColeta, Tom> = {
  ativa: "verde",
  pendente: "ouro",
  planejada: "cinza",
};

/** A rota mais forte entre varias abas -- o bloco costuma cruzar duas ou tres. */
function rotaDominante(abas: string[]): RotaDeColeta | null {
  const rotas = abas.map((a) => rotaPrincipal(a)).filter((r): r is RotaDeColeta => r !== null);
  if (rotas.length === 0) return null;
  const peso = (r: RotaDeColeta) => (r.status === "ativa" ? 0 : r.status === "pendente" ? 1 : 2);
  return rotas.reduce((pior, r) => (peso(r) > peso(pior) ? r : pior));
}

/**
 * Tira compacta de origem. Use no rodape de um Card:
 *
 *   <OrigemDado abas={["VENDAS", "RECEBIVEIS"]} calculo="Soma de Valor no periodo" />
 *
 * `vazio` liga o modo explicativo: quando o bloco nao tem nenhuma linha, em vez
 * de so citar a aba, a tira explica o caminho inteiro de entrada.
 *
 * O link "como enche" que levava pra /coleta saiu daqui: a tela de Coleta de
 * dados foi removida na virada para mentoria, e um link morto era pior do
 * que nenhum link. O badge de modo/status continua -- essa informacao vem
 * de sheets/coleta.ts, que descreve o caminho do dado e nao depende de
 * nenhuma tela existir pra continuar verdadeira.
 */
export function OrigemDado({
  abas,
  calculo,
  vazio = false,
}: {
  abas: string[];
  calculo?: string;
  vazio?: boolean;
}) {
  const rota = rotaDominante(abas);
  return (
    <div className="mt-3 border-t border-borda-sutil pt-2.5 text-[11px] leading-relaxed text-texto-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="uppercase tracking-wider text-texto-4">Origem</span>
        {abas.map((a) => (
          <code key={a} className="rounded bg-poco px-1.5 py-0.5 font-mono text-[10px] text-texto-2">
            {a}
          </code>
        ))}
        {rota ? (
          <Badge tom={TOM_STATUS[rota.status]}>
            {ROTULO_MODO[rota.modo]} · {ROTULO_STATUS[rota.status]}
          </Badge>
        ) : null}
      </div>
      {calculo ? <p className="mt-1 text-texto-3">Conta: {calculo}</p> : null}
      {vazio && rota ? (
        <p className="mt-1 text-texto-3">
          Sem linha ainda. Entra por: {rota.gatilho.toLowerCase()}.
          {rota.bloqueio ? ` Falta: ${rota.bloqueio}` : ""}
        </p>
      ) : null}
    </div>
  );
}
