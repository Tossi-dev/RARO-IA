// "Começar" — o passo a passo que tira a planilha do zero.
//
// A planilha do cliente nasce com todas as abas de entrada em zero linhas: o
// painel calcula certo e mostra vazio porque não existe cadastro base. Esta
// tela existe para o dono do negócio, que não é técnico, resolver isso sem
// precisar entender o que é "responsável" ou por que precisa de "conta" antes
// de alguém explicar em uma frase.

import { PageHeader } from "@/components/ui";
import { ComecarPassos } from "@/components/comecar-passos";
import { getDB } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function Comecar() {
  const db = getDB();
  const [produtos, responsaveis, contas, metas, agrupamentos] = await Promise.all([
    db.listProdutos(),
    db.listAfiliados(),
    db.listContasBancarias(),
    db.listMetasFinanceiras(),
    db.listAgrupamentos(),
  ]);

  return (
    <div>
      <PageHeader
        titulo="Começar"
        sub="Quatro cadastros, nesta ordem, para o painel ter de onde calcular — mais um opcional, para juntar produtos por linha do negócio."
      />
      <ComecarPassos
        bloqueado={db.modo === "vazio"}
        produtos={produtos}
        responsaveis={responsaveis}
        contas={contas}
        metas={metas}
        agrupamentos={agrupamentos}
      />
    </div>
  );
}
