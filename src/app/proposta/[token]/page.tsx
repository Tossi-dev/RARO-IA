// /proposta/[token] — a proposta como o PROSPECT a vê, sem login.
//
// Fica FORA do grupo `(app)` pelo mesmo motivo de `/certificado`: aquele
// layout monta menu e KPI a partir de dado do banco, e esta página tem que
// abrir para quem nunca fez login.
//
// `robots: index false` é obrigatório aqui, e por um motivo mais duro que o
// do certificado: a fechadura desta página é o próprio endereço. Um link
// indexado é o valor negociado de um cliente virando resultado de busca — e,
// pior, é a lista de tokens válidos ficando disponível para quem procurar.
//
// O IP e o agente saem dos cabeçalhos aqui, na borda, e viram hash ANTES de
// qualquer coisa (ver `dados-proposta.ts`). O valor cru não desce.

import type { Metadata } from "next";
import { headers } from "next/headers";
import { lerPropostaPublica } from "@/lib/comercial/dados-proposta";
import { PropostaVisao } from "./visao";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Proposta — MentorOS",
  robots: { index: false, follow: false },
};

export default async function PropostaPublicaPagina({ params }: { params: { token: string } }) {
  const cabecalhos = headers();
  const proposta = await lerPropostaPublica(
    params.token,
    cabecalhos.get("x-forwarded-for") ?? "",
    cabecalhos.get("user-agent") ?? "",
  );

  return <PropostaVisao proposta={proposta} />;
}
