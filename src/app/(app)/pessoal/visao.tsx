import { Card, PageHeader, Stat, Vazio } from "@/components/ui";
import { fmtBRL } from "@/lib/format";
import type { DadosPessoais } from "@/lib/pessoal/dados";

function percentual(valor: number | null): string { return valor === null ? "sem base" : `${(valor * 100).toFixed(2).replace(".", ",")}%`; }

export function PessoalVisao({ dados }: { dados: DadosPessoais }) {
  return <>
    <PageHeader titulo="Finanças pessoais" sub="Patrimônio e investimentos exclusivos do dono" />
    {!dados.conectado ? <Card><p className="text-sm text-texto-2">{dados.motivo}</p></Card> : <>
      {dados.parcial ? <p className="mb-4 rounded-xl border border-atencao/40 bg-atencao/10 px-4 py-3 text-sm text-texto-2">{dados.motivo}</p> : null}
      <Stat label="Patrimônio" valor={dados.resumo.total === null ? "sem base" : fmtBRL(dados.resumo.total)} hint="itens com classe e valores informados" />
      {dados.resumo.total === null ? <p className="mt-2 text-sm text-texto-2">Ainda não há base suficiente para calcular o patrimônio.</p> : null}
      <Card titulo="Alocação" className="mt-4">
        {dados.resumo.alocacao.length === 0 ? <Vazio>Nenhum item classificado para exibir.</Vazio> : <ul className="space-y-2 text-sm">{dados.resumo.alocacao.map((item) => <li key={item.classe} className="flex justify-between gap-4"><span>{item.classe}</span><span>{fmtBRL(item.valor)} · {item.percentual.toFixed(2).replace(".", ",")}%</span></li>)}</ul>}
      </Card>
      <Card titulo="Investimentos" className="mt-4">
        {dados.resumo.investimentos.length === 0 ? <Vazio>Nenhum investimento com valores completos.</Vazio> : <ul className="space-y-2 text-sm">{dados.resumo.investimentos.map((item) => <li key={item.nome} className="flex flex-wrap justify-between gap-4"><span>{item.nome}</span><span>Atual: {fmtBRL(item.valorAtual)} · Rentabilidade: {percentual(item.rentabilidade)}</span></li>)}</ul>}
      </Card>
    </>}
  </>;
}
