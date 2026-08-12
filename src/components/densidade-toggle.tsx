"use client";

// Chave "Visão simples / Visão completa".
//
// Um clique, sem menu — só existem dois estados. O clique chama uma Server
// Action que grava o cookie e revalida o layout: quem troca o
// `data-densidade` do <html> é o SERVIDOR, no HTML seguinte. Não há classe
// alternada no cliente e não há piscada.
//
// "@/lib/densidade" é módulo NEUTRO (não toca next/headers), por isso pode ser
// importado por valor aqui dentro. A leitura do cookie mora em
// "@/lib/densidade-server", que este arquivo nunca pode importar.

import { Maximize2, Minimize2 } from "lucide-react";
import { useTransition } from "react";
import { setDensidade } from "@/lib/actions";
import { alternarDensidade, type Densidade } from "@/lib/densidade";
import { cx } from "./ui";

export function DensidadeToggle({
  densidade,
  compacto = true,
}: {
  densidade: Densidade;
  compacto?: boolean;
}) {
  const [pendente, iniciar] = useTransition();
  const proxima = alternarDensidade(densidade);
  const rotulo =
    proxima === "completo"
      ? "Mostrar tudo: contas, origem do dado e blocos avançados"
      : "Simplificar: só o número e a variação em cada cartão";

  const Icone = proxima === "completo" ? Maximize2 : Minimize2;

  if (!compacto) {
    return (
      <button
        type="button"
        onClick={() => iniciar(async () => void (await setDensidade(proxima)))}
        className={cx(
          "toque trans flex w-full items-center gap-2 rounded-xl border border-borda-sutil bg-poco px-3 py-2 text-sm text-texto-2 transition-colors hover:border-borda hover:text-texto",
          pendente && "opacity-60"
        )}
      >
        <Icone size={15} aria-hidden strokeWidth={1.5} />
        {proxima === "completo" ? "Ver tudo na tela" : "Simplificar a tela"}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => iniciar(async () => void (await setDensidade(proxima)))}
      title={rotulo}
      aria-label={rotulo}
      className={cx(
        "trans flex h-8 w-8 items-center justify-center rounded-full border border-borda-sutil bg-poco text-texto-2 transition-colors hover:border-borda hover:text-texto",
        pendente && "opacity-60"
      )}
    >
      <Icone size={15} aria-hidden strokeWidth={1.5} />
    </button>
  );
}
