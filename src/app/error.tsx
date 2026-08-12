"use client";

// Fronteira de erro do app (dentro do layout raiz — cobre qualquer tela sob
// `(app)`, `/acesso`, `/login`, `/privacidade`...). Sem este arquivo, uma
// exceção não tratada em produção derruba a tela inteira para a página
// branca padrão do Next, e ninguém do time fica sabendo — não existe uma
// pessoa olhando o console do servidor em tempo real, só o log da Vercel
// depois que alguém reclamar.
//
// POR QUE A TELA NUNCA MOSTRA `error.message`
// ----------------------------------------------
// A mensagem crua de uma exceção do Node costuma vir com caminho de
// arquivo, nome de variável e, às vezes, um pedaço do dado que estava sendo
// processado — e este sistema processa nome, telefone, e-mail e pagamento
// de aluno. Botar isso na tela para qualquer visitante é abrir uma segunda
// porta de vazamento de dado, bem ao lado da que o resto do sistema tenta
// fechar. O `digest` é o substituto seguro: um código curto e opaco que não
// carrega nada sensível, mas que liga esta tela ao registro real — é ele que
// vai para o log (abaixo) e é ele que quem for investigar procura na Vercel
// (Deployments → a build → Functions → busca pelo código).

import { useEffect } from "react";
import Link from "next/link";
import { Marca } from "@/components/sidebar";
import { Card } from "@/components/ui";
import { linhaDigest, MENSAGEM_ERRO_APP } from "./erro-texto";

export default function ErroApp({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // `console.error` no servidor Next vira log de função na Vercel — é ali
    // que alguém vai procurar depois, não no console do navegador de quem
    // clicou. O objeto `error` completo (com stack) fica só aqui, nunca na
    // tela: quem lê o log é o time, quem lê a tela é qualquer visitante.
    console.error("[raro.ia] erro de tela — digest:", error.digest, error);
  }, [error]);

  const digest = linhaDigest(error.digest);

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <Marca />
        </div>
        <Card>
          <h1 className="font-display text-[20px] font-fino tracking-tight text-texto">
            Algo não abriu certo
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-texto-2">{MENSAGEM_ERRO_APP}</p>
          {digest && <p className="mt-3 font-mono text-xs text-texto-3">{digest}</p>}
          <div className="mt-5 flex flex-col gap-2">
            <button
              type="button"
              onClick={reset}
              className="trans toque bevel inline-flex w-full items-center justify-center rounded-full bg-gradient-to-b from-primaria-2 via-primaria to-primaria-press px-4 py-2.5 text-sm font-medium text-white shadow-[0_6px_18px_-6px_rgb(var(--primaria)/0.65)] hover:brightness-110 active:translate-y-px"
            >
              Tentar de novo
            </button>
            <Link
              href="/"
              className="trans toque block rounded-full border border-borda-sutil bg-transparent px-4 py-2.5 text-center text-sm font-medium text-texto-2 hover:border-borda-forte hover:bg-eleva hover:text-texto"
            >
              Ir para o início
            </Link>
          </div>
        </Card>
      </div>
    </main>
  );
}
