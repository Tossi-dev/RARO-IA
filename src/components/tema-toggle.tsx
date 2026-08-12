"use client";

// Botão de tema. Um clique, sem menu: só existem dois temas, e menu para
// duas opções é ruído.
//
// O clique chama uma Server Action que grava o cookie e revalida o layout —
// então quem troca o `data-tema` do <html> é o SERVIDOR, no HTML seguinte.
// Não há classe alternada no cliente e não há piscada.
//
// "@/lib/tema" é módulo NEUTRO (não toca next/headers), por isso pode ser
// importado por valor aqui dentro. A leitura do cookie mora em
// "@/lib/tema-server", que este arquivo nunca pode importar.

import { Moon, Sun } from "lucide-react";
import { useTransition } from "react";
import { setTema } from "@/lib/actions";
import { alternar, type Tema } from "@/lib/tema";
import { cx } from "./ui";

export function TemaToggle({ tema }: { tema: Tema }) {
  const [pendente, iniciar] = useTransition();
  const proximo = alternar(tema);
  const rotulo = proximo === "claro" ? "Mudar para o modo claro" : "Mudar para o modo escuro";

  return (
    <button
      type="button"
      onClick={() => iniciar(async () => void (await setTema(proximo)))}
      title={rotulo}
      aria-label={rotulo}
      className={cx(
        "trans flex h-8 w-8 items-center justify-center rounded-lg border border-borda-sutil bg-poco text-texto-2 transition-colors hover:border-borda hover:text-texto",
        pendente && "opacity-60"
      )}
    >
      {proximo === "claro" ? (
        <Sun size={15} aria-hidden />
      ) : (
        <Moon size={15} aria-hidden />
      )}
    </button>
  );
}
