// Command Center (SPEC-P1 §3.1 / Anexo B.1) — a tela "/" deixou de ser um
// painel descritivo e virou o posto de comando: em ≤10 segundos o dono sabe
// se bate a meta, quanto está em risco em reais, qual fonte/afiliado sustenta
// o resultado, para onde a curva aponta, se sobrou dinheiro e se tem caixa.
//
// Esta página NÃO CALCULA: toda a matemática vem de src/lib/metrics.ts
// (núcleo) e src/lib/metrics-comando.ts (matemática nova do comando).

import Link from "next/link";
import { ComandoAlertas } from "@/components/comando-alertas";
import { ComandoAfiliados, ComandoBracos } from "@/components/comando-bracos";
import { ComandoCaixa } from "@/components/comando-caixa";
import { ComandoDinheiro } from "@/components/comando-dinheiro";
import { ComandoRitmo } from "@/components/comando-ritmo";
import { ComandoSaude } from "@/components/comando-saude";
import { ComandoTendencia } from "@/components/comando-tendencia";
import { Badge, Card, PageHeader, Tabela, Td, Th, Vazio } from "@/components/ui";
import { temAgrupamentos, rotularAgrupamento } from "@/lib/agrupamentos";
import { corDoAgrupamento } from "@/lib/cores";
import { getDB } from "@/lib/data";
import { getDensidade } from "@/lib/densidade-server";
import { getFiltroGlobal } from "@/lib/filtros-server";
import { fmtBRL, fmtDate, ymLabel } from "@/lib/format";
import { filtrarPorFonte, serieMensal } from "@/lib/metrics";
import {
  alertasComando,
  concentracaoReceita,
  desempenhoPorBraco,
  janelaComando,
  norteDoComando,
  paceAcumulado,
  pulsoDeCaixa,
  rankingAfiliados,
  saudeDoComando,
  serieBracos12m,
  tendenciaComForecast,
  ultimasVendas,
} from "@/lib/metrics-comando";
import type { DatasetFinanceiro } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function CommandCenter() {
  const db = getDB();
  const filtro = getFiltroGlobal();
  // Visão simples: quatro blocos. Visão completa: os oito de sempre.
  // Nada é apagado — cada bloco escondido tem uma tela própria, linkada no pé
  // da página, e a memória de cálculo de cada KPI continua no modal do cartão.
  const densidade = getDensidade();
  const simples = densidade === "simples";
  const [dsBruto, dc, alunos, afiliados, metas, atividades, orcamentos, produtos, agrupamentos] =
    await Promise.all([
      db.dataset(),
      db.datasetCaixa(),
      db.listAlunos(),
      db.listAfiliados(),
      db.listMetas(),
      db.listAtividades(),
      db.listOrcamentos(),
      db.listProdutos(),
      db.listAgrupamentos(),
    ]);

  // ---- lente global por FONTE DE RENDA (produto): recorta vendas/comissões/
  // reembolsos daquele produto. Despesa não pertence a um produto no modelo
  // de dados (só, opcionalmente, a um agrupamento ou lançamento) — ratear
  // custo estrutural para um produto inventaria uma atribuição que os dados
  // não sustentam. Com uma fonte selecionada, a leitura de custo/lucro desta
  // tela fica sem despesa: o "lucro" mostrado é receita líquida menos
  // comissão e reembolso da própria fonte, não o resultado da empresa inteira
  // dividido por produto — mais honesto do que subtrair o custo da empresa
  // toda da receita de um produto só.
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

  // ---- 1) janela de comando: o filtro de período vira período de calendário ----
  const janela = janelaComando(filtro.rangeDias, hoje);

  // ---- 2) faixa de comando: north star + meta + pace + comparativos ----
  const norte = norteDoComando(ds, metas, filtro.fonte, janela);

  // ---- 3) caixa: sobrou dinheiro? temos caixa? ----
  const pulso = pulsoDeCaixa(ds, dc, filtro.fonte, hoje);

  // ---- 4) séries: sparkline, tendência com forecast e pace acumulado ----
  const serie12 = serieMensal(ds, 12, hoje);
  const spark = serie12.map((m) => ({ label: ymLabel(m.periodo), valor: m.faturamento }));
  const tendencia = tendenciaComForecast(serie12, metas, filtro.fonte, 3);
  const pace = paceAcumulado(ds, janela, norte.meta);

  // ---- 5) lente estrutural: composição sempre vinda da base COMPLETA — é
  // outra dimensão da fonte selecionada na topbar, e não desaparece quando a
  // lente filtra um produto específico ----
  const bracos = desempenhoPorBraco(dsBruto.matriculas, afiliados, metas, janela, agrupamentos);
  const serieBracos = serieBracos12m(dsBruto.matriculas, afiliados, agrupamentos, 12, hoje);
  const concentracao = concentracaoReceita(ds, afiliados, janela.atual);
  // Rede de afiliados não é mais recortada pela lente (agrupamento saiu da
  // lente global) — mostra sempre todos, com a receita de cada um já vindo
  // do `ds` filtrado pela fonte quando houver uma selecionada.
  const afiliadosRank = rankingAfiliados(ds, afiliados, janela);

  // ---- 6) saúde composta e central de alertas priorizados por R$ ----
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

  const recentes = ultimasVendas(ds, janela.atual, 6);
  const mostraAgrupamento = temAgrupamentos(agrupamentos);

  // Sem driver com base não existe nota para anunciar: o cabeçalho diz que falta
  // base em vez de exibir um número que ninguém mediu. Score parcial vem rotulado
  // como parcial, com quantos drivers de quantos entraram na conta.
  const textoSaude =
    saude.score === null
      ? "saúde: sem base para calcular"
      : `saúde ${saude.score}/100 (${saude.rotuloNivel})${
          saude.parcial ? ` · parcial: ${saude.comBase.length} de ${saude.drivers.length} drivers com base` : ""
        }`;

  const rotuloFonte =
    filtro.fonte === "todos" ? "Todos" : (produtos.find((p) => p.id === filtro.fonte)?.nome ?? filtro.fonte);

  return (
    <>
      <PageHeader
        titulo="Indicadores do negócio"
        sub={`${janela.rotulo} · lente: ${rotuloFonte} · ${textoSaude}`}
      />

      <div data-indicadores-workspace="true" className="space-y-6">
        {/* A ordem das seções é a ordem das perguntas do dono:
              1. o que foi vendido virou quanto de dinheiro?
              2. estamos no ritmo da meta?
              3. o que precisa de ação agora?
              4. de onde vem a receita?
              5. o que aconteceu de concreto (últimas vendas) */}
        <ComandoDinheiro norte={norte} pulso={pulso} />

        <ComandoRitmo norte={norte} spark={spark} />

        {/* No modo simples só os três alertas de maior R$ em jogo: a lista
            inteira é o que fazia a tela virar parede de texto. */}
        <ComandoAlertas alertas={simples ? alertas.slice(0, 3) : alertas} />

        {!simples && <ComandoTendencia norte={norte} pace={pace} tendencia={tendencia} />}

        {/* Sem nenhum agrupamento cadastrado a seção não existe — nem gráfico
            vazio, nem "sem dados": uma única linha discreta aponta para onde
            cadastrar, sem virar propaganda repetida pela página. */}
        {mostraAgrupamento ? (
          <ComandoBracos bracos={bracos} serie={serieBracos} concentracao={concentracao} />
        ) : (
          <p className="text-xs text-texto-3">
            Sem agrupamento cadastrado —{" "}
            <Link href="/comecar" className="text-primaria-2 hover:underline">
              cadastre um em Começar
            </Link>{" "}
            para ver o desempenho por agrupamento aqui.
          </p>
        )}

        {!simples && (
          <>
            <ComandoAfiliados linhas={afiliadosRank} agrupamentos={agrupamentos} />

            <ComandoCaixa pulso={pulso} />

            <ComandoSaude saude={saude} />
          </>
        )}

        <Card titulo={`Últimas vendas — ${janela.rotulo}`}>
          {recentes.length ? (
            // colunaPrincipal=1: quem identifica a venda é o CLIENTE, não a
            // data (índice 0) — no cartão do celular é o nome que precisa
            // aparecer em cima e maior.
            <Tabela colunaPrincipal={1}>
              <thead>
                <tr>
                  <Th>Data</Th>
                  <Th>Cliente</Th>
                  <Th>Produto</Th>
                  {mostraAgrupamento && <Th>Agrupamento</Th>}
                  <Th>Origem</Th>
                  <Th num>Valor</Th>
                </tr>
              </thead>
              <tbody>
                {recentes.map((m) => (
                  <tr key={m.id}>
                    <Td>{fmtDate(m.data)}</Td>
                    <Td>
                      <Link className="hover:text-primaria-2" href={`/crm/${m.alunoId}`}>
                        {m.alunoNome}
                      </Link>
                    </Td>
                    <Td>{m.produtoNome}</Td>
                    {mostraAgrupamento && (
                      <Td>
                        {m.braco ? (
                          <span className="inline-flex items-center gap-1.5 text-xs">
                            <span
                              aria-hidden
                              className="h-2 w-2 shrink-0 rounded-full"
                              style={{ background: corDoAgrupamento(m.braco, agrupamentos) }}
                            />
                            {rotularAgrupamento(m.braco, agrupamentos)}
                          </span>
                        ) : (
                          <Badge tom="cinza">—</Badge>
                        )}
                      </Td>
                    )}
                    <Td>
                      {m.statusPagamento === "reembolsado" ? (
                        <Badge tom="vermelho">Reembolsado</Badge>
                      ) : m.afiliadoNome ? (
                        <Badge tom="violeta">{m.afiliadoNome}</Badge>
                      ) : (
                        <Badge tom="cinza">Venda direta</Badge>
                      )}
                    </Td>
                    <Td num>{fmtBRL(m.valor)}</Td>
                  </tr>
                ))}
              </tbody>
            </Tabela>
          ) : (
            <Vazio>Nenhuma venda registrada em {janela.rotulo}.</Vazio>
          )}
        </Card>

        {/* O que a visão simples deixou de fora não some do sistema: cada
            assunto tem tela própria, e o caminho fica escrito aqui. */}
        {simples && (
          <nav className="flex flex-wrap items-center gap-2 pt-1 text-xs text-texto-3">
            <span>Aprofundar:</span>
            {[
              { href: "/analise", rotulo: "Tendência e projeção" },
              { href: "/crm", rotulo: "Rede de afiliados" },
              { href: "/financeiro/caixa", rotulo: "Caixa" },
              { href: "/analise", rotulo: "Saúde do negócio" },
            ].map((l, i) => (
              <Link
                key={`${l.href}-${i}`}
                href={l.href}
                className="trans rounded-full border border-borda-sutil px-3 py-1.5 transition-colors hover:border-borda hover:text-texto"
              >
                {l.rotulo}
              </Link>
            ))}
          </nav>
        )}
      </div>
    </>
  );
}
