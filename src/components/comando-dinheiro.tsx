// "O caminho do dinheiro" — a seção que explica, em desenho, por que o que foi
// vendido não é o que sobrou.
//
// É a resposta a uma confusão real e comum: o dono vê "R$ 152.262 vendidos" e
// "R$ 77.453 de resultado" na mesma tela e não sabe o que aconteceu no meio.
// Aqui o meio fica escrito EM CIMA DA SETA: taxa do gateway, comissão da rede,
// despesa, reembolso. Cada caixa carrega uma frase dizendo o que aquele número
// é — não a fórmula, o significado.
//
// Server component: só recebe o cálculo pronto de metrics-comando.ts.

import { Fluxo, Glossario, SecaoVisual } from "@/components/explicador";
import { fmtBRL, fmtBRLExato, fmtPct } from "@/lib/format";
import type { NorteDoComando, PulsoCaixa } from "@/lib/metrics-comando";

export function ComandoDinheiro({
  norte,
  pulso,
}: {
  norte: NorteDoComando;
  pulso: PulsoCaixa;
}) {
  const { resumo, janela } = norte;
  // A taxa retida pelo gateway é a distância entre o que foi faturado e o que
  // de fato entrou como receita — os dois lados vêm de `resumoPeriodo`.
  const taxaGateway = +(resumo.faturamento - resumo.liquido).toFixed(2);
  const custos = +(resumo.comissoes + resumo.despesasFixas + resumo.despesasVariaveis).toFixed(2);

  const semVenda = resumo.qtdVendas === 0;

  // "De cada R$ 100 sobraram R$ X" é a forma mais direta de explicar margem
  // para quem não é da área: mesma conta, sem a palavra "margem".
  // fmtBRLExato (e não fmtBRL): abaixo de mil o fmtBRL já traria centavos,
  // mas o exato garante "R$ 50,90" e nunca "R$ 51" se a margem passar de 1000.
  const sobraPorCem = fmtBRLExato(resumo.margem).replace("R$\u00a0", "").replace("R$ ", "");
  const resposta = semVenda
    ? `Nenhuma venda registrada em ${janela.rotulo} — sem venda não há caminho para desenhar.`
    : `De cada R$ 100 vendidos, sobraram R$ ${sobraPorCem} depois de pagar tudo.`;

  return (
    <SecaoVisual
      pergunta="O que foi vendido virou quanto de dinheiro no bolso?"
      resposta={resposta}
      tom={semVenda ? "neutro" : resumo.margem >= 20 ? "bom" : resumo.margem > 0 ? "atencao" : "ruim"}
      rodape={
        <Glossario
          termos={[
            {
              termo: "Vendido no período",
              oQueE: "Tudo que foi vendido e pago. Venda pendente não conta.",
              formula: `${resumo.qtdVendas} venda(s) · ticket médio ${fmtBRL(resumo.ticketMedio)}`,
            },
            {
              termo: "Receita líquida",
              oQueE: "O que sobrou depois da taxa que a maquininha/gateway já reteve na hora da venda.",
              formula: "vendido − taxa do gateway",
            },
            {
              termo: "Resultado do período",
              oQueE:
                "O lucro da operação: o que sobrou depois de pagar a rede, as contas e devolver reembolsos.",
              formula: "receita líquida − comissões − despesas − reembolsos",
            },
            {
              termo: "Caixa hoje",
              oQueE:
                "Dinheiro que existe na conta AGORA. É diferente do resultado: venda parcelada já é resultado, mas ainda não é caixa.",
              formula: "saldo inicial + tudo que entrou − tudo que saiu",
            },
          ]}
        />
      }
    >
      <Fluxo
        etapas={[
          {
            rotulo: "Vendido no período",
            valor: fmtBRL(resumo.faturamento),
            oQueE: "Soma das vendas pagas. É o tamanho da operação, não o lucro.",
            tom: "marca",
            destaque: true,
          },
          {
            rotulo: "Receita líquida",
            valor: fmtBRL(resumo.liquido),
            oQueE: "O que de fato entrou, já sem a taxa cobrada na venda.",
            tirado: [{ rotulo: "taxa do gateway", valor: fmtBRL(taxaGateway) }],
          },
          {
            rotulo: "Resultado do período",
            valor: fmtBRL(resumo.lucro),
            oQueE: `O lucro da operação. Margem de ${fmtPct(resumo.margem)} sobre o vendido.`,
            tom: resumo.lucro >= 0 ? "bom" : "ruim",
            tirado: [
              { rotulo: "comissões e despesas", valor: fmtBRL(custos) },
              { rotulo: "reembolsos", valor: fmtBRL(resumo.reembolsos) },
            ],
          },
          {
            rotulo: "Caixa hoje",
            valor: fmtBRL(pulso.saldoHoje),
            ligacao: "conta diferente: resultado é lucro, caixa é dinheiro disponível",
            oQueE:
              pulso.runway.meses === null
                ? "Dinheiro em conta agora. No ritmo atual a operação se paga."
                : `Dinheiro em conta agora. Dá para ${pulso.runway.meses.toFixed(1)} meses no gasto atual.`,
            tom: pulso.saldoHoje >= pulso.reservaMinima ? "neutro" : "ruim",
            href: "/financeiro/caixa",
          },
        ]}
      />
    </SecaoVisual>
  );
}
