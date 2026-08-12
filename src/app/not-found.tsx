// Tela de rota inexistente. Sem este arquivo, um link quebrado ou um
// endereço digitado errado cai na página 404 genérica do Next — fora do
// tom do resto do produto, e sem caminho de volta óbvio.
//
// Não é fronteira de ERRO (não recebe `error`/`reset`, não é "use client"):
// é rota normal, resolvida no servidor, então entra como Server Component
// como qualquer outra tela do app.

import Link from "next/link";
import { Marca } from "@/components/sidebar";
import { Card } from "@/components/ui";
import { MENSAGEM_NAO_ENCONTRADO } from "./erro-texto";

export default function NaoEncontrado() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <Marca />
        </div>
        <Card>
          <h1 className="font-display text-[20px] font-fino tracking-tight text-texto">
            Página não encontrada
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-texto-2">{MENSAGEM_NAO_ENCONTRADO}</p>
          <Link
            href="/"
            className="trans toque mt-5 block rounded-full bg-gradient-to-b from-primaria-2 via-primaria to-primaria-press px-4 py-2.5 text-center text-sm font-medium text-white shadow-[0_6px_18px_-6px_rgb(var(--primaria)/0.65)] hover:brightness-110"
          >
            Ir para o início
          </Link>
        </Card>
      </div>
    </main>
  );
}
