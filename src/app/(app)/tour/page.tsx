// Tour pelos resultados da empresa — /tour.
//
// Esta página existe porque o painel responde tudo de uma vez e exige que a
// pessoa saiba onde olhar. Aqui é uma pergunta por tela, na ordem em que um
// dono pensa. Ela NÃO tem matemática própria: chama exatamente as mesmas
// funções de src/lib/metrics-comando.ts que src/app/(app)/painel/page.tsx
// chama, com a mesma lente e a mesma janela, e entrega os resultados para
// src/lib/tour.ts escolher o que vira frase. Se um dia o painel e o tour
// discordarem de um número, é bug — não diferença de metodologia.

import { TourEmpresa } from "@/components/tour-empresa";
import { PageHeader } from "@/components/ui";
import { getDB } from "@/lib/data";
import { getFiltroGlobal } from "@/lib/filtros-server";
import { filtrarPorFonte, funil } from "@/lib/metrics";
import {
  alertasComando,
  concentracaoReceita,
  desempenhoPorBraco,
  janelaComando,
  norteDoComando,
  pulsoDeCaixa,
  saudeDoComando,
} from "@/lib/metrics-comando";
import { montarTour } from "@/lib/tour";
import type { DatasetFinanceiro } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Tour() {
  const db = getDB();
  const filtro = getFiltroGlobal();
  const [dsBruto, dc, alunos, afiliados, metas, atividades, orcamentos, agrupamentos] =
    await Promise.all([
      db.dataset(),
      db.datasetCaixa(),
      db.listAlunos(),
      db.listAfiliados(),
      db.listMetas(),
      db.listAtividades(),
      db.listOrcamentos(),
      db.listAgrupamentos(),
    ]);

  // Mesmo recorte de lente do painel: com uma fonte selecionada, despesa fica
  // de fora porque despesa não pertence a um produto no modelo de dados —
  // ratear custo estrutural inventaria uma atribuição que os dados não
  // sustentam. O comentário longo que explica isso mora no painel.
  const matriculasLente = filtrarPorFonte(dsBruto.matriculas, filtro.fonte);
  const idsLente = new Set(matriculasLente.map((m) => m.id));
  const ds: DatasetFinanceiro =
    filtro.fonte === "todos"
      ? dsBruto
      : {
          matriculas: matriculasLente,
          comissoes: dsBruto.comissoes.filter((c) => idsLente.has(c.matriculaId)),
          reembolsos: dsBruto.reembolsos.filter((r) => idsLente.has(r.matriculaId)),
          despesas: [],
        };

  const hoje = new Date();
  const janela = janelaComando(filtro.rangeDias, hoje);
  const norte = norteDoComando(ds, metas, filtro.fonte, janela);
  const pulso = pulsoDeCaixa(ds, dc, filtro.fonte, hoje);
  const concentracao = concentracaoReceita(ds, afiliados, janela.atual);
  const bracos = desempenhoPorBraco(dsBruto.matriculas, afiliados, metas, janela, agrupamentos);
  const saude = saudeDoComando(ds, dc, filtro.fonte, norte, pulso, concentracao, hoje);
  const alertas = alertasComando({
    ds,
    dc,
    alunos,
    atividades,
    afiliados,
    orcamentos,
    norte,
    pulso,
    fonte: filtro.fonte,
    porAgrupamento: bracos,
    ref: hoje,
  });

  // Mesma contagem da Central de Clientes: ativos = novos + recorrentes; em
  // risco = quem está marcado como inativo no funil. A tela do CRM soma
  // também a coluna "Em risco" do kanban, que depende dos filtros DAQUELA
  // tela — aqui não há filtro de tela, então entra só a parte que vem da base
  // inteira, e é isso que a frase do passo diz.
  const f = funil(alunos);

  const passos = montarTour({
    norte,
    pulso,
    concentracao,
    saude,
    alertas,
    clientes: {
      total: alunos.length,
      ativos: f.novo + f.recorrente,
      emRisco: f.inativo,
    },
    rotuloPeriodo: janela.rotulo,
  });

  return (
    <>
      <PageHeader
        titulo="Tour pelos resultados"
        sub="Uma pergunta por tela — do quanto entrou até o que fazer hoje."
      />
      <TourEmpresa passos={passos} periodo={janela.rotulo} />
    </>
  );
}
