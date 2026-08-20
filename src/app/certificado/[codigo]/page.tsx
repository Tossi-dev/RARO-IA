// /certificado/[codigo] — a verificação PÚBLICA de um certificado.
//
// Fica FORA do grupo `(app)` pelo mesmo motivo de `/privacidade`: aquele
// layout monta menu e KPI a partir de dado do banco, e esta página tem que
// abrir para quem nunca fez login — e abrir mesmo com o resto do sistema
// fora do ar.
//
// A rota já estava liberada no portão desde a tarefa 29 (`ROTAS_LIVRES`, em
// src/lib/acesso.ts), e o comentário de lá deixou escrito o que a liberação
// NÃO autorizava: consultar a tabela com a chave anônima. Quem faz a ponte é
// `verificar_certificado` (migração 0021), função `security definer` de
// retorno fechado — ver o cabeçalho de `dados-certificado.ts`.
//
// `robots: index false` continua valendo (o `robots.ts` da raiz já manda
// `disallow: /`), e aqui é repetido de propósito: a página carrega o NOME de
// uma pessoa, e um certificado indexado vira resultado de busca pelo nome
// dela para sempre.

import type { Metadata } from "next";
import { verificarCertificado } from "@/lib/conteudo/dados-certificado";
import { CertificadoVisao } from "./visao";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Verificação de certificado — MentorOS",
  robots: { index: false, follow: false },
};

export default async function VerificacaoDeCertificado({ params }: { params: { codigo: string } }) {
  const resultado = await verificarCertificado(params.codigo);
  return <CertificadoVisao resultado={resultado} />;
}
