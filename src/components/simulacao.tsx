"use client";

// Simulação: o botão que liga e a faixa que confessa.
//
// Este par de componentes existe para resolver uma tensão real deste projeto.
// De um lado, a planilha do cliente ainda está zerada e uma tela vazia não
// ensina nada — ele precisa VER o painel funcionando para entender o que vai
// ganhar. Do outro lado, o pior erro já cometido aqui foi exatamente mostrar
// número inventado como se fosse a operação dele.
//
// A conciliação: dado fictício pode entrar, mas nunca em silêncio.
//   · desligado por padrão (nenhuma variável de ambiente liga isso);
//   · liga só por clique, e só naquele navegador (cookie de 12h);
//   · enquanto está ligado, a faixa fica no topo de TODAS as telas;
//   · sai em um clique, do lado do aviso.
//
// A faixa não é um "toast" que some. Ela ocupa espaço na página de propósito:
// aviso que desaparece é aviso que não estava lá quando a decisão foi tomada.

import { FlaskConical, X } from "lucide-react";
import { useTransition } from "react";
import { setSimulacao } from "@/lib/actions";
import { cx } from "./ui";

/** Botão da topbar. Só aparece quando a simulação está DESLIGADA. */
export function BotaoSimulacao({ compacto = false }: { compacto?: boolean }) {
  const [pendente, iniciar] = useTransition();

  return (
    <button
      type="button"
      onClick={() => iniciar(async () => void (await setSimulacao(true)))}
      title="Preencher o painel com um negócio fictício, só para ver como ele funciona"
      aria-label="Ligar modo simulação"
      className={cx(
        "trans flex items-center gap-1.5 rounded-lg border border-ouro/40 bg-ouro/10 px-2.5 py-1.5 text-xs font-medium text-ouro transition-colors hover:bg-ouro/20",
        pendente && "opacity-60"
      )}
    >
      <FlaskConical size={13} aria-hidden />
      <span className={compacto ? "hidden lg:inline" : undefined}>Simulação</span>
    </button>
  );
}

/** Pílula da barra, quando a simulação está LIGADA. Sair sem rolar até o topo. */
export function BotaoSairSimulacao({ compacto = false }: { compacto?: boolean }) {
  const [pendente, iniciar] = useTransition();

  return (
    <button
      type="button"
      onClick={() => iniciar(async () => void (await setSimulacao(false)))}
      title="Voltar aos dados reais"
      aria-label="Sair do modo simulação"
      className={cx(
        "trans flex items-center gap-1.5 rounded-lg border border-ouro/50 bg-ouro/15 px-2.5 py-1.5 text-xs font-medium text-ouro transition-colors hover:bg-ouro/25",
        pendente && "opacity-60"
      )}
    >
      <X size={13} aria-hidden />
      <span className={compacto ? "hidden lg:inline" : undefined}>Sair da simulação</span>
    </button>
  );
}

/** Faixa fixa no topo. Só aparece quando a simulação está LIGADA. */
export function FaixaSimulacao() {
  const [pendente, iniciar] = useTransition();

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-ouro/40 bg-ouro/10 px-4 py-2 text-center text-xs text-ouro"
    >
      <span className="flex items-center gap-1.5">
        <FlaskConical size={13} aria-hidden />
        <strong className="font-semibold">Modo simulação</strong>
      </span>
      <span className="text-ouro-3">
        Todos os números desta tela são fictícios, só para demonstrar como o painel funciona. Nada
        aqui vem da planilha, e nada que você digitar agora chega nela.
      </span>
      <button
        type="button"
        onClick={() => iniciar(async () => void (await setSimulacao(false)))}
        className={cx(
          "trans flex items-center gap-1 rounded-md border border-ouro/50 px-2 py-0.5 font-medium transition-colors hover:bg-ouro/20",
          pendente && "opacity-60"
        )}
      >
        <X size={12} aria-hidden />
        Sair da simulação
      </button>
    </div>
  );
}
