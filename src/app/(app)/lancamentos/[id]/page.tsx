import Link from "next/link";
import { notFound } from "next/navigation";
import { GraficoTracaoLancamento } from "@/components/charts";
import { CursoTurma } from "@/components/curso-turma";
import { Tabs } from "@/components/tabs";
import { TranscricaoForm } from "@/components/transcricao-form";
import { Badge, Botao, Campo, Card, Input, PageHeader, PainelForm, ProgressBar, Select, Stat, Tabela, Td, Th, Vazio, type Tom } from "@/components/ui";
import { marcarReuniao, registrarMatricula, registrarReembolso } from "@/lib/actions";
import { getDB } from "@/lib/data";
import { FORMA_PGTO_LABEL, REUNIAO_STATUS_LABEL, STATUS_LANCAMENTO_LABEL } from "@/lib/domain";
import { fmtBRL, fmtBRLExato, fmtDate, fmtPct } from "@/lib/format";
import {
  alunosEmRisco,
  conteudoDoCurso,
  funilPorModulo,
  mapaProgresso,
  presencaEncontros,
  progressoDaTurma,
  saudeTurma,
  type AlunoRosterItem,
} from "@/lib/metrics-curso";
import { receitaPorDia, statsLancamento } from "@/lib/metrics";
import type { StatusLancamento, Turma } from "@/lib/types";

export const dynamic = "force-dynamic";

const TOM_LANC: Record<StatusLancamento, Tom> = {
  planejado: "cinza",
  ativo: "verde",
  encerrado: "violeta",
};

const TOM_REUNIAO = { agendada: "azul", realizada: "verde", cancelada: "cinza" } as const;

const STATUS_TURMA_LABEL: Record<Turma["status"], string> = {
  planejada: "Planejada",
  ativa: "Ativa",
  encerrada: "Encerrada",
};

const TOM_TURMA: Record<Turma["status"], Tom> = {
  planejada: "cinza",
  ativa: "verde",
  encerrada: "violeta",
};

export default async function DetalheLancamento({ params }: { params: { id: string } }) {
  const db = getDB();
  const detalhe = await db.getLancamento(params.id);
  if (!detalhe) notFound();
  const { lancamento: l, produto, turmas, matriculas, tarefas, calls, reembolsos } = detalhe;

  const [alunos, afiliados, ds, todasReunioes, transcricoes, modulos, aulas, progressoAulas, encontros] =
    await Promise.all([
      db.listAlunos(),
      db.listAfiliados(),
      db.dataset(),
      db.listReunioes(),
      db.listTranscricoes(),
      db.listModulos(),
      db.listAulas(),
      db.listProgresso(),
      db.listEncontros(),
    ]);

  const reunioes = todasReunioes.filter((r) => r.lancamentoId === l.id);
  const transPorReuniao = new Map<string, typeof transcricoes>();
  for (const t of transcricoes) {
    const arr = transPorReuniao.get(t.reuniaoId) ?? [];
    arr.push(t);
    transPorReuniao.set(t.reuniaoId, arr);
  }

  const s = statsLancamento(l, ds.matriculas, ds.reembolsos, ds.comissoes, tarefas);

  // ---------- memória de cálculo dos KPIs da visão geral ----------
  // Espelho exato do recorte de `statsLancamento` (src/lib/metrics.ts, linha
  // 256): matrículas DESTE lançamento com situação diferente de pendente.
  const vendas = ds.matriculas.filter(
    (m) => m.lancamentoId === l.id && m.statusPagamento !== "pendente"
  );
  const idsVendas = new Set(vendas.map((m) => m.id));
  const brutoPago = vendas
    .filter((m) => m.statusPagamento === "pago")
    .reduce((a, m) => a + m.valor, 0);
  const brutoReembolsado = vendas
    .filter((m) => m.statusPagamento === "reembolsado")
    .reduce((a, m) => a + m.valor, 0);
  // liquido = soma de valorLiquido (valor já sem a taxa da forma de pagamento),
  // então a diferença contra o bruto é exatamente a taxa retida no caminho.
  const taxasRetidas = s.faturamento - s.liquido;
  const recomprasLanc = s.qtdVendas - s.alunosUnicos;
  // comissões e reembolsos das MESMAS vendas — mesmo filtro por id da matrícula
  const nomeAfiliado = new Map(afiliados.map((a) => [a.id, a.nome] as const));
  const comissaoPorAfiliado = new Map<string, number>();
  for (const c of ds.comissoes) {
    if (!idsVendas.has(c.matriculaId)) continue;
    comissaoPorAfiliado.set(c.afiliadoId, (comissaoPorAfiliado.get(c.afiliadoId) ?? 0) + c.valor);
  }
  const partesComissao = [...comissaoPorAfiliado.entries()]
    .map(([id, valor]) => ({ rotulo: nomeAfiliado.get(id) ?? "Parceiro sem cadastro", valor }))
    .sort((a, b) => b.valor - a.valor);
  const reembolsosDoLanc = ds.reembolsos.filter((r) => idsVendas.has(r.matriculaId));
  const partesReembolso = reembolsosDoLanc.map((r) => ({
    rotulo: `${fmtDate(r.data)} · ${r.motivo || "sem motivo registrado"}`,
    valor: r.valor,
  }));
  const origemVendas = `dataset().matriculas com lançamento ${l.id} e situação diferente de pendente, via statsLancamento`;

  const tracao = receitaPorDia(ds.matriculas, l.id).map((d) => ({
    label: fmtDate(d.data).slice(0, 5),
    acumulado: d.acumulado,
  }));
  const hoje = new Date().toISOString().slice(0, 10);
  const reembolsaveis = matriculas.filter((m) => m.statusPagamento === "pago");
  const agendadas = reunioes.filter((r) => r.status === "agendada").length;

  // ---------- Aba: turma & progresso (plataforma de curso) ----------
  // `modulos`/`aulas` são do PRODUTO deste lançamento (a trilha não é
  // específica de uma turma); o roster e os encontros, sim, são por turma.
  const modulosDoProduto = modulos.filter((m) => m.produtoId === l.produtoId);
  const aulasDoProduto = aulas.filter((a) => a.produtoId === l.produtoId);
  const temTrilhaDoProduto = modulosDoProduto.length > 0 && aulasDoProduto.length > 0;

  const cursoPorTurma = turmas.map((turma) => {
    const roster: AlunoRosterItem[] = [];
    const vistos = new Set<string>();
    for (const m of matriculas) {
      if (m.turmaId !== turma.id || vistos.has(m.alunoId)) continue;
      vistos.add(m.alunoId);
      roster.push({ alunoId: m.alunoId, alunoNome: m.alunoNome ?? "—" });
    }
    const encontrosDaTurma = encontros.filter((e) => e.turmaId === turma.id);
    // `progressoAulas` entra sem pré-filtro: cada função casa por alunoId do
    // roster e por aulaId da trilha do produto, então linhas de outro
    // produto/turma simplesmente não encontram par e são ignoradas.
    const porAluno = progressoDaTurma(roster, modulosDoProduto, aulasDoProduto, progressoAulas, hoje);
    return {
      turma,
      temAlunos: roster.length > 0,
      saude: saudeTurma(porAluno),
      funil: funilPorModulo(roster, modulosDoProduto, aulasDoProduto, progressoAulas),
      risco: alunosEmRisco(porAluno),
      mapa: mapaProgresso(roster, modulosDoProduto, aulasDoProduto, progressoAulas, porAluno),
      presencas: presencaEncontros(encontrosDaTurma, roster.length),
      conteudo: conteudoDoCurso(modulosDoProduto, aulasDoProduto, progressoAulas, roster.length),
    };
  });
  const totalAlunosEmRiscoNaAba = cursoPorTurma.reduce((s, c) => s + c.risco.length, 0);

  // ---------- Aba: visão geral ----------
  const abaVisao = (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
        {/* `statsLancamento` (src/lib/metrics.ts, linha 260): faturamento = soma
            do valor bruto das vendas não pendentes. Só existem duas situações
            possíveis nesse recorte — paga e reembolsada — e as duas somam. */}
        <Stat
          label="Faturamento"
          valor={fmtBRL(s.faturamento)}
          formato="moeda"
          valorNumerico={s.faturamento}
          referencia={l.metaFaturamento > 0 ? l.metaFaturamento : null}
          labelReferencia="meta do lançamento"
          composicao={{
            formula: "soma",
            partes: [
              { rotulo: "Vendas pagas", valor: brutoPago },
              { rotulo: "Vendas depois reembolsadas (o bruto continua contando)", valor: brutoReembolsado },
            ],
            nota: "Valor bruto e em regime de competência: é o que foi vendido, não o que caiu na conta. O reembolso aparece na sua própria linha e só é abatido no resultado.",
          }}
          origem={origemVendas}
        />
        {/* `statsLancamento` (linha 261): liquido = soma de valorLiquido, que
            já vem sem a taxa da forma de pagamento. A diferença contra o bruto
            é exatamente a taxa retida. */}
        <Stat
          label="Líquido (após taxas)"
          valor={fmtBRL(s.liquido)}
          formato="moeda"
          valorNumerico={s.liquido}
          composicao={{
            formula: "subtracao",
            partes: [
              { rotulo: "Faturamento bruto do lançamento", valor: s.faturamento },
              { rotulo: "Taxas de pagamento e parcelamento retidas", valor: taxasRetidas },
            ],
            nota: "Aqui só saiu a taxa da maquininha/gateway. Comissão de parceiro e reembolso ainda não foram descontados — isso é o Resultado.",
          }}
          origem={origemVendas}
        />
        {/* `statsLancamento` (linha 262): comissões das vendas deste lançamento,
            casadas pelo id da matrícula. A conta abre por parceiro. */}
        <Stat
          label="Comissões"
          valor={fmtBRL(s.comissoes)}
          formato="moeda"
          valorNumerico={s.comissoes}
          composicao={
            partesComissao.length >= 2
              ? {
                  formula: "soma",
                  partes: partesComissao,
                  nota: "Comissão calculada sobre as vendas deste lançamento. Venda direta, sem parceiro, não gera linha aqui.",
                }
              : partesComissao.length === 1
                ? `${fmtBRLExato(s.comissoes)} de comissão, toda ela de um único parceiro (${partesComissao[0].rotulo}), sobre as vendas não pendentes deste lançamento.`
                : "Nenhuma comissão neste lançamento — todas as vendas foram diretas, sem parceiro."
          }
          origem={`dataset().comissoes casadas pelo id das matrículas deste lançamento (${origemVendas})`}
        />
        {/* `statsLancamento` (linha 263): reembolsos das vendas deste
            lançamento. Menor é melhor → invertida. */}
        <Stat
          label="Reembolsos"
          valor={fmtBRL(s.reembolsos)}
          formato="moeda"
          valorNumerico={s.reembolsos}
          invertida
          composicao={
            partesReembolso.length >= 2
              ? {
                  formula: "soma",
                  partes: partesReembolso,
                  nota: "Menor é melhor. É o dinheiro devolvido ao cliente; a venda original continua somando no faturamento.",
                }
              : partesReembolso.length === 1
                ? `${fmtBRLExato(s.reembolsos)} devolvidos em um único reembolso — ${partesReembolso[0].rotulo}. A venda original continua somando no faturamento.`
                : "Nenhum reembolso registrado neste lançamento."
          }
          origem={`dataset().reembolsos casados pelo id das matrículas deste lançamento (${origemVendas})`}
        />
        {/* `statsLancamento` (linha 270): resultado = liquido − comissões − reembolsos. */}
        <Stat
          label="Resultado"
          valor={fmtBRL(s.resultado)}
          formato="moeda"
          valorNumerico={s.resultado}
          composicao={{
            formula: "subtracao",
            partes: [
              { rotulo: "Receita líquida das vendas (já sem a taxa de pagamento)", valor: s.liquido },
              { rotulo: "Comissões de parceiros", valor: s.comissoes },
              { rotulo: "Reembolsos devolvidos", valor: s.reembolsos },
            ],
            nota: "Resultado do LANÇAMENTO, não da empresa: tráfego, produção, equipe e imposto não entram nesta conta. Para o lucro de verdade, veja o DRE gerencial.",
          }}
          origem={origemVendas}
        />
        {/* alunosUnicos (linha 271) é contagem de pessoas distintas: a diferença
            para o número de vendas é a recompra do mesmo aluno. */}
        <Stat
          label="Alunos"
          valor={`${s.alunosUnicos}`}
          formato="numero"
          valorNumerico={s.alunosUnicos}
          composicao={{
            formula: "subtracao",
            partes: [
              { rotulo: "Vendas fechadas no lançamento", valor: s.qtdVendas },
              { rotulo: "Compras repetidas do mesmo aluno (upsell, segunda oferta)", valor: recomprasLanc },
            ],
            nota: "Conta PESSOAS, não vendas: quem comprou duas vezes no mesmo lançamento aparece uma vez só.",
          }}
          origem={origemVendas}
        />
      </div>

      {s.progressoMeta !== null && (
        <Card className="mt-4">
          <div className="mb-1 flex items-baseline justify-between text-sm">
            <span className="text-texto-2">Progresso da meta</span>
            <span className="font-medium tabular-nums">
              {fmtPct(s.progressoMeta)} de {fmtBRL(l.metaFaturamento)}
            </span>
          </div>
          <ProgressBar pct={s.progressoMeta} tom="ouro" />
        </Card>
      )}

      <Card titulo="Tração — receita acumulada" className="mt-4">
        {tracao.length ? (
          <GraficoTracaoLancamento data={tracao} />
        ) : (
          <Vazio>Nenhuma venda registrada neste lançamento.</Vazio>
        )}
      </Card>
    </>
  );

  // ---------- Aba: turma & progresso (plataforma de curso) ----------
  // Toda a matemática (saúde, funil, risco, mapa, presença, conteúdo) já
  // saiu pronta de src/lib/metrics-curso.ts em `cursoPorTurma`, acima — esta
  // aba só decide o que mostrar quando falta turma ou falta trilha.
  const abaTurma = !turmas.length ? (
    <Vazio>
      Este lançamento ainda não tem turma cadastrada — sem turma não há quem monitorar. Cadastre a turma na tabela{" "}
      <code className="rounded bg-poco px-1 py-0.5 font-mono text-[10px]">turmas</code> (Supabase) ou na aba{" "}
      <code className="rounded bg-poco px-1 py-0.5 font-mono text-[10px]">TURMAS</code> da planilha.
    </Vazio>
  ) : (
    <div className="space-y-8">
      {cursoPorTurma.map(({ turma, temAlunos, saude, funil, risco, mapa, presencas, conteudo }) => (
        <CursoTurma
          key={turma.id}
          turmaNome={turma.nome}
          turmaStatus={{ label: STATUS_TURMA_LABEL[turma.status], tom: TOM_TURMA[turma.status] }}
          crmHref={(alunoId) => `/crm/${alunoId}`}
          temTrilha={temTrilhaDoProduto}
          temAlunos={temAlunos}
          saude={saude}
          funil={funil}
          risco={risco}
          mapa={mapa}
          presencas={presencas}
          conteudo={conteudo}
        />
      ))}
    </div>
  );

  // ---------- Aba: reuniões & transcrições ----------
  const abaReunioes = (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-3 lg:col-span-2">
        {reunioes.length ? (
          [...reunioes]
            .sort((a, b) => b.inicio.localeCompare(a.inicio))
            .map((r) => {
              const trans = transPorReuniao.get(r.id) ?? [];
              return (
                <Card key={r.id}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{r.titulo}</p>
                      <p className="text-xs text-texto-2">
                        {fmtDate(r.inicio.slice(0, 10))} às {r.inicio.slice(11, 16)}
                        {r.comQuem ? ` · ${r.comQuem}` : ""}
                        {r.link ? (
                          <>
                            {" · "}
                            <a className="text-primaria-2 hover:underline" href={r.link} target="_blank" rel="noopener noreferrer">
                              link
                            </a>
                          </>
                        ) : null}
                      </p>
                    </div>
                    <Badge tom={TOM_REUNIAO[r.status]}>{REUNIAO_STATUS_LABEL[r.status]}</Badge>
                  </div>

                  {trans.map((t) => (
                    <div key={t.id} className="mt-3 rounded-lg bg-painel-2 p-3">
                      <p className="mb-1 text-[10px] uppercase tracking-wide text-texto-2">
                        {t.origem === "audio_ia" ? "Transcrição por IA (áudio)" : "Resumo/transcrição manual"}
                      </p>
                      {t.resumo ? (
                        <pre className="whitespace-pre-wrap font-body text-sm">{t.resumo}</pre>
                      ) : null}
                      {t.texto ? (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-xs text-primaria-2">ver transcrição completa</summary>
                          <p className="mt-1 whitespace-pre-wrap text-sm text-texto-2">{t.texto}</p>
                        </details>
                      ) : null}
                    </div>
                  ))}

                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs text-primaria-2">
                      {trans.length ? "adicionar outra transcrição" : "registrar resumo/transcrição"}
                    </summary>
                    <div className="mt-2">
                      <TranscricaoForm reuniaoId={r.id} />
                    </div>
                  </details>
                </Card>
              );
            })
        ) : (
          <Vazio>Nenhuma reunião deste lançamento ainda.</Vazio>
        )}
      </div>

      <div>
        <PainelForm titulo="Marcar reunião">
          <form action={marcarReuniao} className="space-y-3">
            <input type="hidden" name="lancamentoId" value={l.id} />
            {turmas[0] ? <input type="hidden" name="turmaId" value={turmas[0].id} /> : null}
            <Campo label="Título">
              <Input name="titulo" required placeholder="Ex.: Call ao vivo — semana 8" />
            </Campo>
            <div className="grid grid-cols-2 gap-2">
              <Campo label="Data">
                <Input name="data" type="date" defaultValue={hoje} required />
              </Campo>
              <Campo label="Hora">
                <Input name="hora" type="time" defaultValue="14:00" required />
              </Campo>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Campo label="Duração (min)">
                <Input name="duracaoMin" type="number" defaultValue={60} min={15} step={15} />
              </Campo>
              <Campo label="Com quem">
                <Input name="comQuem" placeholder="Turma 1, convidado…" />
              </Campo>
            </div>
            <Botao>Marcar (e criar no Google)</Botao>
            <p className="text-[11px] text-texto-2">
              Sem credenciais do Google configuradas, a reunião fica registrada aqui na plataforma.
            </p>
          </form>
        </PainelForm>
      </div>
    </div>
  );

  // ---------- Aba: vendas ----------
  const abaVendas = (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <Card titulo={`Vendas do lançamento (${matriculas.length})`}>
          {matriculas.length ? (
            <div className="max-h-[480px] overflow-y-auto">
              <Tabela>
                <thead>
                  <tr>
                    <Th>Data</Th>
                    <Th>Aluno</Th>
                    <Th>Situação</Th>
                    <Th num>Valor</Th>
                  </tr>
                </thead>
                <tbody>
                  {matriculas.map((m) => (
                    <tr key={m.id}>
                      <Td>{fmtDate(m.data)}</Td>
                      <Td>
                        <Link className="hover:text-primaria-2" href={`/crm/${m.alunoId}`}>
                          {m.alunoNome}
                        </Link>
                        {m.isUpsell && (
                          <span className="ml-1.5 align-middle">
                            <Badge tom="ouro">upsell</Badge>
                          </span>
                        )}
                      </Td>
                      <Td>
                        {m.statusPagamento === "reembolsado" ? (
                          <Badge tom="vermelho">Reembolsado</Badge>
                        ) : (
                          <Badge tom="verde">Pago</Badge>
                        )}
                      </Td>
                      <Td num>{fmtBRLExato(m.valor)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Tabela>
            </div>
          ) : (
            <Vazio>Nenhuma venda ainda.</Vazio>
          )}
        </Card>
      </div>
      <div>
        <PainelForm titulo="Registrar matrícula">
          <form action={registrarMatricula} className="space-y-3">
            <input type="hidden" name="lancamentoId" value={l.id} />
            <input type="hidden" name="produtoId" value={l.produtoId} />
            <Campo label="Aluno">
              <Select name="alunoId" required>
                {alunos.map((a) => (
                  <option key={a.id} value={a.id}>{a.nome}</option>
                ))}
              </Select>
            </Campo>
            <Campo label="Valor (R$)">
              <Input name="valor" type="number" step="0.01" min="0" defaultValue={produto?.precoBase} required />
            </Campo>
            <Campo label="Forma de pagamento">
              <Select name="formaPgto" defaultValue="pix">
                {Object.entries(FORMA_PGTO_LABEL).map(([v, rot]) => (
                  <option key={v} value={v}>{rot}</option>
                ))}
              </Select>
            </Campo>
            <Campo label="Data">
              <Input name="data" type="date" defaultValue={hoje} required />
            </Campo>
            <Campo label="Afiliado (comissão)">
              <Select name="afiliadoId" defaultValue="">
                <option value="">Venda direta (sem comissão)</option>
                {afiliados
                  .filter((a) => a.pctPadrao > 0)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.nome} · {a.pctPadrao}%
                    </option>
                  ))}
              </Select>
            </Campo>
            <Botao>Registrar venda</Botao>
          </form>
        </PainelForm>
      </div>
    </div>
  );

  // ---------- Aba: pós-venda ----------
  const abaPosVenda = (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        <PainelForm titulo="Registrar reembolso">
          {reembolsaveis.length ? (
            <form action={registrarReembolso} className="grid gap-3 sm:grid-cols-2">
              <Campo label="Venda reembolsada" className="sm:col-span-2">
                <Select name="matriculaId" required>
                  {reembolsaveis.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.alunoNome} · {fmtDate(m.data)} · {fmtBRLExato(m.valor)}
                    </option>
                  ))}
                </Select>
              </Campo>
              <Campo label="Valor devolvido (R$)">
                <Input name="valor" type="number" step="0.01" min="0" required />
              </Campo>
              <Campo label="Data">
                <Input name="data" type="date" defaultValue={hoje} required />
              </Campo>
              <Campo label="Motivo" className="sm:col-span-2">
                <Input name="motivo" placeholder="Ex.: arrependimento dentro dos 7 dias" />
              </Campo>
              <div className="sm:col-span-2">
                <Botao tipo="perigo">Registrar reembolso</Botao>
              </div>
            </form>
          ) : (
            <Vazio>Não há vendas pagas para reembolsar.</Vazio>
          )}
        </PainelForm>

        <Card titulo={`Reembolsos (${reembolsos.length})`}>
          {reembolsos.length ? (
            <Tabela>
              <thead>
                <tr>
                  <Th>Data</Th>
                  <Th>Motivo</Th>
                  <Th num>Valor</Th>
                </tr>
              </thead>
              <tbody>
                {reembolsos.map((r) => (
                  <tr key={r.id}>
                    <Td>{fmtDate(r.data)}</Td>
                    <Td className="text-texto-2">{r.motivo || "—"}</Td>
                    <Td num>{fmtBRLExato(r.valor)}</Td>
                  </tr>
                ))}
              </tbody>
            </Tabela>
          ) : (
            <Vazio>Nenhum reembolso — ótimo sinal.</Vazio>
          )}
        </Card>
      </div>

      <Card titulo="Resumos de calls (histórico)">
        {calls.length ? (
          <ul className="space-y-3">
            {calls.map((c) => (
              <li key={c.id} className="rounded-lg bg-painel-2 p-3">
                <p className="text-sm font-medium">
                  {c.titulo} <span className="ml-1 text-xs font-normal text-texto-2">{fmtDate(c.data)}</span>
                </p>
                <p className="mt-1 text-sm text-texto-2">{c.resumo}</p>
              </li>
            ))}
          </ul>
        ) : (
          <Vazio>Nenhum resumo de call antigo.</Vazio>
        )}
      </Card>
    </div>
  );

  return (
    <>
      <p className="mb-2 text-xs text-texto-2">
        <Link href="/lancamentos" className="hover:text-primaria-2">← Lançamentos</Link>
      </p>
      <PageHeader
        titulo={l.nome}
        sub={`${produto?.nome ?? "—"} · ${fmtDate(l.inicio)}${l.fim ? ` → ${fmtDate(l.fim)}` : " → em aberto"}`}
      >
        <Badge tom={TOM_LANC[l.status]}>{STATUS_LANCAMENTO_LABEL[l.status]}</Badge>
      </PageHeader>
      {l.descricao ? <p className="mb-4 max-w-3xl text-sm text-texto-2">{l.descricao}</p> : null}

      <Tabs
        abas={[
          { id: "visao", rotulo: "Visão geral", conteudo: abaVisao },
          { id: "turma", rotulo: "Turma & progresso", badge: totalAlunosEmRiscoNaAba, conteudo: abaTurma },
          { id: "reunioes", rotulo: "Reuniões & transcrições", badge: agendadas, conteudo: abaReunioes },
          { id: "vendas", rotulo: "Vendas", badge: matriculas.length, conteudo: abaVendas },
          { id: "posvenda", rotulo: "Pós-venda", badge: reembolsos.length, conteudo: abaPosVenda },
        ]}
      />
    </>
  );
}
