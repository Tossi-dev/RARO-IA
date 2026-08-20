// A parte PURA da página pública de proposta. Recebe o `PropostaPublica` já
// resolvido e só desenha.
//
// ============================================================
// A PÁGINA MOSTRA CINCO CAMPOS, E NÃO EXISTE UM SEXTO
// ============================================================
//
// Título, corpo, valor, validade e situação. Não há id de oportunidade, nome
// de responsável interno, nome de outro cliente, telefone, e-mail nem etapa
// do funil — e isso não é uma escolha de layout que alguém possa reverter
// mexendo aqui: `proposta_publica` (0025) devolve essas cinco colunas e mais
// nada. O tipo que chega nesta função já é o limite.
//
// ============================================================
// O "NÃO" É UM SÓ
// ============================================================
//
// Token torto, token inexistente, proposta em rascunho e proposta vencida
// produzem a MESMA tela, byte a byte — há teste que compara as saídas. Ver o
// cabeçalho de `dados-proposta.ts`: qualquer diferença vira pista para quem
// estiver tentando adivinhar token.

import { dataPorExtensoBr } from "@/app/certificado/[codigo]/textos";
import { Badge, Card, PageHeader } from "@/components/ui";
import type { PropostaPublica } from "@/lib/comercial/dados-proposta";
import { fmtBRL } from "@/lib/format";

export function PropostaVisao({ proposta }: { proposta: PropostaPublica }) {
  if (!proposta.encontrada) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-12">
        <PageHeader titulo="Proposta" sub="" />
        <Card>
          <p className="text-sm text-texto-2">{proposta.motivo}</p>
        </Card>
      </main>
    );
  }

  const validade = dataPorExtensoBr(proposta.validade);

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <PageHeader titulo={proposta.titulo} sub="Proposta comercial" />

      <Card>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-2xl font-semibold tabular-nums">{fmtBRL(proposta.valor)}</span>
          <Badge tom="verde">Enviada</Badge>
        </div>

        {/* `whitespace-pre-line`: o corpo é escrito à mão por quem vende, e as
            quebras de linha dele são parte do texto. */}
        <p className="mt-4 whitespace-pre-line text-sm text-texto-2">{proposta.corpo}</p>

        {validade ? (
          <p className="mt-4 border-t border-borda-sutil pt-3 text-xs text-texto-2">
            Válida até {validade}.
          </p>
        ) : null}
      </Card>

      <p className="mt-4 text-center text-xs text-texto-3">
        Para aceitar ou tirar dúvidas, responda a quem enviou este link.
      </p>
    </main>
  );
}
