// /extrato — a tela que recebe o extrato bancário e joga cada linha no caixa.
//
// Quatro passos, sempre nesta ordem (ver src/components/extrato-importar.tsx):
// RECEBER → CONFERIR → DECIDIR → GRAVAR. O passo 4 chama direto a Server
// Action OFICIAL `importarExtratoBancario` (src/lib/actions.ts), que por sua
// vez chama `DataProvider.importarExtrato` — a MESMA trilha implementada em
// sheets-db/demo-db/vazio-db/supabase-db. Esta página deixou de ter Server
// Action própria: uma segunda implementação aqui só existia porque
// `LinhaExtrato` não carregava `categoria` (ver histórico em
// src/lib/extrato/extrato.ts); agora que carrega, não há mais razão para a
// bifurcação. Regra dura continua a mesma: extrato mal importado corrompe o
// caixa de um jeito que só aparece no fechamento do mês, quando já é tarde
// para lembrar o que era cada linha.
//
// A DIGITAL evita duplicar lançamento quando o dono reenvia um extrato que se
// sobrepõe ao anterior (uso normal: semanal em cima de diário). As digitais
// já conhecidas vêm de `listImportacoes()` — o livro-razão oficial de
// procedência (aba/tabela IMPORTACOES) — e não mais de uma varredura de
// `origemId` em MovimentoCaixa.

import { ExtratoImportar } from "@/components/extrato-importar";
import { PageHeader } from "@/components/ui";
import { getDB } from "@/lib/data";
import { CATEGORIA_CAIXA_LABEL, CATEGORIAS_ENTRADA, TIPO_CONTA_LABEL } from "@/lib/domain";
import { criarContaEDevolver, importarExtratoBancario } from "@/lib/actions";
import type { CategoriaCaixa } from "@/lib/types";

export const dynamic = "force-dynamic";

const TODAS_CATEGORIAS = Object.keys(CATEGORIA_CAIXA_LABEL) as CategoriaCaixa[];
const CATEGORIAS_SAIDA = TODAS_CATEGORIAS.filter((c) => !CATEGORIAS_ENTRADA.includes(c));

export default async function Extrato() {
  const db = getDB();
  const [contas, importacoes] = await Promise.all([db.listContasBancarias(), db.listImportacoes()]);

  const contasAtivas = contas.filter((c) => c.ativa).map((c) => ({ id: c.id, nome: c.nome }));

  // Fonte oficial das digitais já importadas (ver nota de topo): o
  // livro-razão de procedência, não mais uma varredura de `origemId`.
  const digitaisConhecidas = importacoes.map((i) => i.impressaoDigital);

  return (
    <div className="space-y-5">
      <PageHeader
        titulo="Importar extrato"
        sub="Leia o extrato do banco, confira linha a linha e só depois grave no caixa."
      />
      <ExtratoImportar
        contas={contasAtivas}
        digitaisConhecidas={digitaisConhecidas}
        categoriasEntrada={CATEGORIAS_ENTRADA}
        categoriasSaida={CATEGORIAS_SAIDA}
        rotuloCategoria={CATEGORIA_CAIXA_LABEL}
        gravar={importarExtratoBancario}
        criarConta={criarContaEDevolver}
        rotuloTipoConta={TIPO_CONTA_LABEL}
      />
    </div>
  );
}
