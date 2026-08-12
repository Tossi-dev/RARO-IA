// O tour pelos resultados da empresa — módulo NEUTRO (sem "use client", sem
// leitura de banco).
//
// POR QUE ESTE ARQUIVO EXISTE
// ---------------------------
// O painel responde tudo de uma vez: oito blocos, dezenas de números, e quem
// não é do financeiro trava na primeira dobra. O tour responde UMA pergunta
// por tela, na ordem em que um dono pensa: vendi quanto → sobrou quanto →
// tenho dinheiro na conta → estou no ritmo → de onde vem esse dinheiro →
// quantos clientes → o que eu faço agora. É a mesma matemática do painel,
// contada em sequência.
//
// A REGRA DURA DAQUI: este módulo NÃO CALCULA NADA. Ele recebe os objetos que
// `src/lib/metrics-comando.ts` já produziu para o painel e só escolhe o que
// vira frase. Se ele recalculasse qualquer coisa, o tour e o painel poderiam
// divergir — e dois números diferentes para a mesma pergunta, no mesmo
// sistema, destrói a confiança em ambos.
//
// A SEGUNDA REGRA: passo sem base não vira passo. Nada de "R$ 0,00" onde o
// certo é "esse dado ainda não existe" — o passo simplesmente não entra, e o
// tour fica mais curto. Zero inventado é pior que pergunta não respondida.

import { fmtBRL, fmtNum, fmtPct } from "./format";
import type {
  AlertaComando,
  Concentracao,
  NorteDoComando,
  PulsoCaixa,
  SaudeComposta,
} from "./metrics-comando";

/** O tom pinta o número: é uma notícia boa, ruim ou apenas um fato? */
export type TomPasso = "neutro" | "positivo" | "negativo";

export interface PassoTour {
  id: string;
  /** A pergunta que este passo responde, do jeito que o dono faria. */
  pergunta: string;
  /** O número, já formatado — a tela nunca formata nada por conta própria. */
  valor: string;
  tom: TomPasso;
  /** A resposta conclusiva, em uma frase de gente. */
  frase: string;
  /** De onde esse número saiu — a memória de cálculo em linguagem simples. */
  detalhe: string;
  /** Para onde ir se a pessoa quiser o detalhe completo. */
  href: string | null;
  rotuloHref: string | null;
}

export interface EntradaTour {
  norte: NorteDoComando;
  pulso: PulsoCaixa;
  concentracao: Concentracao;
  saude: SaudeComposta;
  alertas: AlertaComando[];
  /** Base de clientes: total, ativos e em risco — contados por quem chamou. */
  clientes: { total: number; ativos: number; emRisco: number };
  /** Rótulo do período olhado ("últimos 12 meses", "este mês"…). */
  rotuloPeriodo: string;
}

/**
 * Monta os passos do tour na ordem de raciocínio de um dono.
 *
 * Ordem escolhida de propósito, e não por importância: cada passo só faz
 * sentido depois do anterior. Não dá para entender "sobrou quanto" sem antes
 * saber "vendeu quanto", nem para julgar o caixa sem saber o resultado.
 */
export function montarTour(e: EntradaTour): PassoTour[] {
  const passos: PassoTour[] = [];
  const { norte, pulso, concentracao, saude, alertas, clientes } = e;
  const r = norte.resumo;

  // ---- 1. Vendeu quanto ----------------------------------------------------
  // Sempre entra, mesmo em zero: "a empresa não vendeu nada no período" é uma
  // resposta legítima e importante, diferente de "não sei medir".
  passos.push({
    id: "vendeu",
    pergunta: "Quanto a empresa vendeu?",
    valor: fmtBRL(r.faturamento),
    tom: "neutro",
    frase:
      r.qtdVendas > 0
        ? `${fmtNum(r.qtdVendas)} venda(s) em ${e.rotuloPeriodo}, com ticket médio de ${fmtBRL(r.ticketMedio)}.`
        : `Nenhuma venda registrada em ${e.rotuloPeriodo}.`,
    detalhe:
      "Soma das vendas pagas no período. É o tamanho da operação — ainda não é lucro nem dinheiro na conta.",
    href: "/painel",
    rotuloHref: "ver o painel",
  });

  // ---- 2. Sobrou quanto ----------------------------------------------------
  if (r.faturamento > 0) {
    passos.push({
      id: "sobrou",
      pergunta: "Quanto sobrou depois de pagar tudo?",
      valor: fmtBRL(r.lucro),
      tom: r.lucro > 0 ? "positivo" : r.lucro < 0 ? "negativo" : "neutro",
      frase:
        r.lucro >= 0
          ? `De cada R$ 100 vendidos, sobraram ${fmtBRL((r.lucro / r.faturamento) * 100)} depois de pagar tudo.`
          : `A operação gastou ${fmtBRL(Math.abs(r.lucro))} a mais do que entrou no período.`,
      detalhe: `Do que foi vendido saíram taxas, comissões de ${fmtBRL(r.comissoes)}, reembolsos de ${fmtBRL(
        r.reembolsos
      )} e ${fmtBRL(r.despesasFixas + r.despesasVariaveis)} de despesa. Margem de ${fmtPct(r.margem)}.`,
      href: "/financeiro/dre",
      rotuloHref: "ver o DRE",
    });
  }

  // ---- 3. Dinheiro na conta ------------------------------------------------
  // Lucro e caixa são contas diferentes, e é AQUI que a maioria das pessoas se
  // perde — por isso o passo existe separado do anterior, e o detalhe diz a
  // diferença com todas as letras. Sem extrato lançado não há saldo para
  // mostrar: o passo sai do tour em vez de anunciar zero.
  if (pulso.temExtrato) {
    passos.push({
      id: "caixa",
      pergunta: "Tem dinheiro na conta hoje?",
      valor: fmtBRL(pulso.saldoHoje),
      tom: pulso.abaixoDaReserva ? "negativo" : pulso.temCaixa ? "positivo" : "neutro",
      frase: pulso.abaixoDaReserva
        ? `O saldo está abaixo da reserva mínima de ${fmtBRL(pulso.reservaMinima)}.`
        : "O saldo cobre a reserva mínima e as próximas semanas projetadas.",
      detalhe:
        "Lucro e caixa são contas diferentes: lucro é o que a operação gerou, caixa é o dinheiro que está disponível agora. Dá para ter lucro e não ter caixa.",
      href: "/financeiro/caixa",
      rotuloHref: "ver o fluxo de caixa",
    });
  }

  // ---- 4. No ritmo da meta -------------------------------------------------
  // Sem meta cadastrada não existe ritmo a comparar. Em vez de sumir com o
  // passo, ele vira um convite a cadastrar — é a única pendência do tour que a
  // própria pessoa resolve em um minuto.
  if (norte.meta !== null && norte.meta > 0) {
    passos.push({
      id: "ritmo",
      pergunta: "Está no ritmo de bater a meta?",
      valor: norte.pctMeta !== null ? fmtPct(norte.pctMeta) : "—",
      tom: norte.noRitmo === true ? "positivo" : norte.noRitmo === false ? "negativo" : "neutro",
      frase:
        norte.noRitmo === true
          ? `No ritmo de hoje, o período fecha em ${fmtBRL(norte.projecao)} — acima da meta de ${fmtBRL(norte.meta)}.`
          : `No ritmo de hoje, o período fecha em ${fmtBRL(norte.projecao)} — abaixo da meta de ${fmtBRL(norte.meta)}.`,
      detalhe: `Hoje o negócio faz ${fmtBRL(norte.ritmoAtual)} por dia. Para bater a meta no que resta do período, precisa fazer ${fmtBRL(
        norte.ritmoNecessario
      )} por dia.`,
      href: "/painel",
      rotuloHref: "ver o ritmo",
    });
  } else {
    passos.push({
      id: "ritmo-sem-meta",
      pergunta: "Está no ritmo de bater a meta?",
      valor: "sem meta",
      tom: "neutro",
      frase: "Nenhuma meta foi cadastrada para este período, então não há ritmo a comparar.",
      detalhe:
        "A meta é o que transforma faturamento em 'está indo bem' ou 'está indo mal'. Sem ela, o sistema só sabe dizer quanto entrou.",
      href: "/comecar",
      rotuloHref: "cadastrar uma meta",
    });
  }

  // ---- 5. De onde vem o dinheiro ------------------------------------------
  if (!concentracao.semBase && concentracao.topNome && concentracao.topPct !== null) {
    passos.push({
      id: "origem",
      pergunta: "De onde vem esse dinheiro?",
      valor: fmtPct(concentracao.topPct),
      tom: concentracao.nivel === "critico" ? "negativo" : concentracao.nivel === "atencao" ? "neutro" : "positivo",
      frase: `${concentracao.topPct.toFixed(0)}% da receita vem de uma fonte só: ${concentracao.topNome}.`,
      detalhe: concentracao.leitura,
      // Apontava para a seção "Fontes de renda" de /lancamentos, removida na
      // virada para mentoria. O painel tem a mesma leitura por braço/fonte.
      href: "/painel",
      rotuloHref: "ver a concentração no painel",
    });
  }

  // ---- 6. Clientes ---------------------------------------------------------
  if (clientes.total > 0) {
    passos.push({
      id: "clientes",
      pergunta: "Quantos clientes, e quantos estão escapando?",
      valor: fmtNum(clientes.ativos),
      tom: clientes.emRisco > 0 ? "negativo" : "positivo",
      frase:
        clientes.emRisco > 0
          ? `${fmtNum(clientes.ativos)} clientes ativos, e ${fmtNum(clientes.emRisco)} em risco de sair.`
          : `${fmtNum(clientes.ativos)} clientes ativos, nenhum em risco no momento.`,
      detalhe: `A base tem ${fmtNum(clientes.total)} pessoa(s) no total, somando ativos, inativos e quem ainda não comprou.`,
      href: "/crm",
      rotuloHref: "abrir a central de clientes",
    });
  }

  // ---- 7. Saúde ------------------------------------------------------------
  if (saude.score !== null && saude.rotuloNivel) {
    passos.push({
      id: "saude",
      pergunta: "No geral, a empresa está saudável?",
      valor: `${saude.score}/100`,
      tom: saude.nivel === "critico" ? "negativo" : saude.nivel === "excelente" || saude.nivel === "bom" ? "positivo" : "neutro",
      frase: `Nota ${saude.score} de 100 — ${saude.rotuloNivel}.${saude.parcial ? " Cálculo parcial: parte dos indicadores ainda não tem base." : ""}`,
      detalhe:
        saude.puxamParaBaixo.length > 0
          ? `O que mais puxa a nota para baixo: ${saude.puxamParaBaixo
              .slice(0, 2)
              .map((d) => d.rotulo)
              .join(" e ")}.`
          : "Nenhum indicador está puxando a nota para baixo.",
      href: "/painel",
      rotuloHref: "ver os indicadores",
    });
  }

  // ---- 8. O que fazer agora ------------------------------------------------
  // O tour termina em AÇÃO, não em número. Quem chegou até aqui já entendeu o
  // retrato; o último passo diz o que fazer com ele hoje.
  const principal = alertas[0];
  if (principal) {
    passos.push({
      id: "acao",
      pergunta: "O que fazer agora?",
      valor: fmtBRL(principal.valor),
      tom: principal.severidade === "critico" ? "negativo" : "neutro",
      frase: `${principal.titulo} — ${fmtBRL(principal.valor)} ${principal.rotuloValor}.`,
      detalhe: `${principal.detalhe} ${principal.acao}`,
      href: principal.href,
      rotuloHref: "resolver agora",
    });
  } else {
    passos.push({
      id: "acao-vazia",
      pergunta: "O que fazer agora?",
      valor: "nada urgente",
      tom: "positivo",
      frase: "Nenhum alerta em aberto — não há nada gritando por atenção hoje.",
      detalhe:
        "O sistema procura conta vencida, cliente sumido, meta em risco e concentração de receita. Nada disso apareceu.",
      href: "/painel",
      rotuloHref: "voltar ao painel",
    });
  }

  return passos;
}
