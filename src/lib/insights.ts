// Insights por regras — leituras acionáveis geradas dos próprios dados.
// (A camada de IA entra por cima disto via /api/ia quando a chave existir.)

import { faixasReativacao, mesFinanceiro, orcadoRealizado, serieMensal, statsLancamento, upsellResumo, ym } from "./metrics";
import type { Aluno, DatasetFinanceiro, Lancamento, Orcamento } from "./types";

export interface Insight {
  nivel: "positivo" | "atencao" | "alerta" | "oportunidade";
  texto: string;
  /** a quais análises este insight pertence (slugs de /analise + "geral") */
  indicadores: string[];
}

export function gerarInsights(args: {
  ds: DatasetFinanceiro;
  alunos: Aluno[];
  orcamentos: Orcamento[];
  lancamentos?: Lancamento[];
  ref?: Date;
}): Insight[] {
  const { ds, alunos, orcamentos, lancamentos = [], ref = new Date() } = args;
  const out: Insight[] = [];
  const ymAtual = `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, "0")}`;
  const serie = serieMensal(ds, 4, ref);
  const atual = serie[serie.length - 1];
  const anterior = serie[serie.length - 2];

  // 1) comissões comendo a margem
  if (atual.faturamento > 0 && anterior?.faturamento > 0) {
    const ppAtual = (atual.comissoes / atual.faturamento) * 100;
    const ppAnt = (anterior.comissoes / anterior.faturamento) * 100;
    if (ppAtual - ppAnt > 5) {
      out.push({
        nivel: "atencao",
        texto: `Comissões passaram de ${ppAnt.toFixed(1)}% para ${ppAtual.toFixed(1)}% do faturamento — revise o split de afiliados ou o mix de vendas.`,
        indicadores: ["comissoes", "margem", "lucro"],
      });
    }
  }

  // 2) orçamento estourado
  for (const linha of orcadoRealizado(ds, orcamentos, ymAtual)) {
    if (linha.estourou) {
      out.push({
        nivel: "alerta",
        texto: `"${linha.categoria}" estourou o orçamento do mês: R$ ${linha.realizado.toFixed(0)} de R$ ${linha.previsto.toFixed(0)} previstos (${linha.pct?.toFixed(0)}%).`,
        indicadores: ["custos", "lucro", "geral"],
      });
    }
  }

  // 3) margem do mês
  if (atual.faturamento > 0) {
    if (atual.margem < 40) {
      out.push({
        nivel: "alerta",
        texto: `Margem do mês em ${atual.margem.toFixed(1)}% — abaixo dos 40%. A cascata mostra o que está consumindo o resultado.`,
        indicadores: ["margem", "lucro", "geral"],
      });
    } else if (atual.margem >= 60) {
      out.push({
        nivel: "positivo",
        texto: `Margem saudável: ${atual.margem.toFixed(1)}% no mês. Espaço para reinvestir em tráfego com segurança.`,
        indicadores: ["margem", "lucro", "geral"],
      });
    }
  }

  // 4) maior categoria de despesa disparando vs média dos 3 meses anteriores
  {
    const doMes = ds.despesas.filter((d) => ym(d.data) === ymAtual);
    const porCat = new Map<string, number>();
    for (const d of doMes) porCat.set(d.categoria, (porCat.get(d.categoria) ?? 0) + d.valor);
    const maior = [...porCat.entries()].sort((a, b) => b[1] - a[1])[0];
    if (maior) {
      const media3 =
        serie.slice(0, 3).reduce((s, m) => {
          const mes = ds.despesas.filter((d) => ym(d.data) === m.periodo && d.categoria === maior[0]);
          return s + mes.reduce((x, d) => x + d.valor, 0);
        }, 0) / 3;
      if (media3 > 0 && maior[1] > media3 * 1.3) {
        out.push({
          nivel: "atencao",
          texto: `"${maior[0]}" está ${(((maior[1] - media3) / media3) * 100).toFixed(0)}% acima da média dos últimos meses — confirme se foi investimento planejado.`,
          indicadores: ["custos", "geral"],
        });
      }
    }
  }

  // 5) upsell
  {
    const up = upsellResumo(ds, ref);
    if (atual.faturamento > 0 && up.pctFaturamento < 10) {
      out.push({
        nivel: "oportunidade",
        texto: `Upsell é só ${up.pctFaturamento.toFixed(1)}% do faturamento do mês — a base de alunos ativos comporta ofertas de nível acima (mentoria/premium).`,
        indicadores: ["faturamento", "geral"],
      });
    } else if (up.pctFaturamento >= 25) {
      out.push({
        nivel: "positivo",
        texto: `Upsell forte: ${up.pctFaturamento.toFixed(1)}% do faturamento vem de clientes subindo de nível.`,
        indicadores: ["faturamento", "geral"],
      });
    }
  }

  // 6) reativação (60+ dias sem contato)
  {
    const faixas = faixasReativacao(alunos, [], ds.matriculas, ref);
    const parados = faixas.find((f) => f.faixa === "60+")?.alunos.length ?? 0;
    if (parados >= 5) {
      out.push({
        nivel: "oportunidade",
        texto: `${parados} clientes sem contato há 60+ dias — o quadro de avisos tem a lista com WhatsApp pronto para reativação.`,
        indicadores: ["faturamento", "geral"],
      });
    }
  }

  // 7) lançamento ativo abaixo do ritmo da meta
  for (const l of lancamentos.filter((x) => x.status === "ativo" && x.metaFaturamento > 0)) {
    const s = statsLancamento(l, ds.matriculas, ds.reembolsos, ds.comissoes, []);
    if (l.fim) {
      const total = new Date(l.fim).getTime() - new Date(l.inicio).getTime();
      const decorrido = ref.getTime() - new Date(l.inicio).getTime();
      const pctTempo = total > 0 ? (decorrido / total) * 100 : 0;
      if (pctTempo > 50 && (s.progressoMeta ?? 0) < 50) {
        out.push({
          nivel: "alerta",
          texto: `"${l.nome}" passou da metade do período com ${(s.progressoMeta ?? 0).toFixed(0)}% da meta — hora de reforçar tráfego/oferta.`,
          indicadores: ["faturamento", "geral"],
        });
      }
    }
  }

  return out;
}
