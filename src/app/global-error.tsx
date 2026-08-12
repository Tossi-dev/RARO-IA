"use client";

// Fronteira de erro do LAYOUT RAIZ. Dispara só quando o próprio
// `src/app/layout.tsx` (ou algo que ele renderiza direto) quebra — um degrau
// abaixo de `error.tsx`, que cobre erro dentro de uma tela normal. Por isso
// este arquivo tem que desenhar `<html>` e `<body>` do zero: quando ele
// entra em cena, é porque o layout que normalmente desenha essas tags já
// falhou, e o Next substitui a árvore inteira por este componente.
//
// POR QUE ESTE ARQUIVO NÃO IMPORTA Card, Marca, NEM AS FONTES DO GOOGLE
// -------------------------------------------------------------------------
// Esta é a última rede de segurança do app — se ELA também quebrar (por
// exemplo, porque um import puxou algo que falha no mesmo jeito que derrubou
// o layout, ou porque a fonte não carregou por rede instável), não sobra
// mais nada abaixo. Por isso o CSS vem só de `./globals.css` (que já define
// os tokens de cor e os utilitários `.bevel`/`.trans`/`.toque`) e a fonte é a
// pilha de sistema do CSS (`ui-sans-serif, system-ui...`, nunca serifada) —
// zero dependência de rede para a tela aparecer legível.
//
// Mesmo motivo por trás da mensagem: sem `error.message` na tela — ver o
// comentário equivalente em `error.tsx`, que vale aqui palavra por palavra.

import { useEffect } from "react";
import { linhaDigest, MENSAGEM_ERRO_GLOBAL } from "./erro-texto";
import "./globals.css";

export default function ErroGlobal({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[raro.ia] erro no layout raiz — digest:", error.digest, error);
  }, [error]);

  const digest = linhaDigest(error.digest);

  return (
    <html lang="pt-BR">
      <body className="bg-fundo text-texto antialiased">
        <main className="flex min-h-screen items-center justify-center p-4">
          <div className="superficie bevel w-full max-w-sm rounded-2xl border border-borda-sutil p-5">
            <span className="font-display text-xl font-fino tracking-tight">
              raro<span className="text-primaria-2">.ia</span>
            </span>
            <h1 className="mt-5 font-display text-[20px] font-fino tracking-tight text-texto">
              O sistema travou
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-texto-2">{MENSAGEM_ERRO_GLOBAL}</p>
            {digest && <p className="mt-3 font-mono text-xs text-texto-3">{digest}</p>}
            <div className="mt-5 flex flex-col gap-2">
              <button
                type="button"
                onClick={reset}
                className="trans toque bevel inline-flex w-full items-center justify-center rounded-full bg-gradient-to-b from-primaria-2 via-primaria to-primaria-press px-4 py-2.5 text-sm font-medium text-white shadow-[0_6px_18px_-6px_rgb(var(--primaria)/0.65)] hover:brightness-110 active:translate-y-px"
              >
                Tentar de novo
              </button>
              <a
                href="/"
                className="trans toque block rounded-full border border-borda-sutil bg-transparent px-4 py-2.5 text-center text-sm font-medium text-texto-2 hover:border-borda-forte hover:bg-eleva hover:text-texto"
              >
                Ir para o início
              </a>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
