import Link from "next/link";
import { notFound } from "next/navigation";
import { CrmConversa } from "@/components/crm-conversa";
import { Tabs } from "@/components/tabs";
import { Timeline } from "@/components/timeline";
import { Badge, Botao, Campo, Card, Input, PageHeader, PainelForm, ProgressBar, Select, Stat, Tabela, Td, Th, TextArea, Vazio, cx, type Tom } from "@/components/ui";
import { alternarTarefa, aprovarEnvioWhatsapp, criarNota, moverAlunoEstagio, registrarAtividade } from "@/lib/actions";
import { estadoDoAgente } from "@/lib/atendimento/pulso";
import { lerTemperatura, type FatoObservado } from "@/lib/atendimento/temperatura";
import { getDB } from "@/lib/data";
import { FORMA_PGTO_LABEL } from "@/lib/domain";
import { fmtBRL, fmtBRLExato, fmtDate } from "@/lib/format";
import { statsAluno } from "@/lib/metrics";
import { linkWhatsApp } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

export default async function FichaAluno({ params }: { params: { id: string } }) {
  const db = getDB();
  const detalhe = await db.getAluno(params.id);
  if (!detalhe) notFound();
  const { aluno, matriculas } = detalhe;

  const [estagios, notas, atividades, interacoes] = await Promise.all([
    db.listEstagios(),
    db.listNotas(aluno.id),
    db.listAtividades(aluno.id),
    db.listInteracoes(aluno.id),
  ]);

  // A leitura de temperatura é DERIVADA aqui, a cada abertura da ficha, e
  // nunca lida de uma coluna: lead marcado como "quente" três meses atrás é a
  // mentira mais comum de CRM, e ela só existe onde alguém pode marcar na mão.
  //
  // As compras entram como `direcao: "evento"`, e não como mensagem: uma venda
  // não é fala de ninguém. Como "recebida", ela faria o cliente furar a fila
  // como se estivesse esperando resposta; como "enviada", a tela diria "última
  // mensagem foi nossa" apontando para uma venda.
  const fatos: FatoObservado[] = [
    ...interacoes.map((i) => ({ quando: i.quando, direcao: i.direcao })),
    ...matriculas
      .filter((m) => m.statusPagamento !== "pendente")
      .map((m) => ({ quando: m.data, direcao: "evento" as const, compra: true })),
  ];
  const leitura = lerTemperatura(fatos, new Date());
  const agente = estadoDoAgente(new Date());

  // progresso: tarefas de turma dos lançamentos em que o aluno está
  const lancIds = [...new Set(matriculas.map((m) => m.lancamentoId).filter(Boolean))] as string[];
  const detalhesLanc = (await Promise.all(lancIds.map((id) => db.getLancamento(id)))).filter(Boolean);
  const minhasTarefas = detalhesLanc.flatMap((d) =>
    d!.tarefas.filter((t) => t.alunoId === aluno.id).map((t) => ({ ...t, lancNome: d!.lancamento.nome }))
  );
  const concluidas = minhasTarefas.filter((t) => t.concluida).length;
  const pctProgresso = minhasTarefas.length ? (concluidas / minhasTarefas.length) * 100 : 0;

  const st = statsAluno(matriculas);
  const estagio = estagios.find((e) => e.id === aluno.estagioId) ?? null;

  // Espelho exato do recorte de `statsAluno` (src/lib/metrics.ts, linha 223):
  // só matrícula com situação DIFERENTE de pendente entra no LTV e nas compras.
  // Venda reembolsada continua contando — é dinheiro que entrou e voltou.
  const compradas = matriculas.filter((m) => m.statusPagamento !== "pendente");
  const pendentes = matriculas.length - compradas.length;
  // A conta abre por PRODUTO, não por matrícula: cliente recorrente tem dezenas
  // de compras do mesmo item, e a lista linha a linha viraria ruído no cartão.
  // O total é idêntico — só o agrupamento muda.
  const porProduto = new Map<string, { rotulo: string; qtd: number; valor: number }>();
  for (const m of compradas) {
    const nome = m.produtoNome ?? "Produto sem nome";
    const atual = porProduto.get(nome) ?? { rotulo: nome, qtd: 0, valor: 0 };
    atual.qtd += 1;
    atual.valor += m.valor;
    porProduto.set(nome, atual);
  }
  const partesCompras = [...porProduto.values()]
    .sort((a, b) => b.valor - a.valor)
    .map((p) => ({ rotulo: `${p.rotulo} (${p.qtd}x)`, valor: p.valor }));
  const reembolsadas = compradas.filter((m) => m.statusPagamento === "reembolsado").length;
  const origemCompras = "getAluno(): matrículas deste cliente com situação diferente de pendente, via statsAluno";

  const abaVisaoGeral = (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card titulo="Contato e contexto">
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between gap-2">
            <dt className="text-texto-2">Telefone</dt>
            <dd className="flex items-center gap-2">
              {aluno.telefone || "—"}
              {aluno.telefone && (
                <a
                  href={linkWhatsApp(aluno.telefone)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-md border border-positivo/40 bg-positivo/10 px-1.5 py-0.5 text-[10px] font-medium text-positivo hover:bg-positivo/20"
                >
                  WhatsApp
                </a>
              )}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-texto-2">E-mail</dt>
            <dd className="truncate">{aluno.email || "—"}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-texto-2">Origem</dt>
            <dd>{aluno.origem || "—"}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-texto-2">No funil desde</dt>
            <dd>{fmtDate(aluno.primeiroContato)}</dd>
          </div>
        </dl>
        <form action={moverAlunoEstagio} className="mt-4 flex items-end gap-2 border-t border-borda pt-3">
          <input type="hidden" name="alunoId" value={aluno.id} />
          {/* De onde a pessoa SAI, do jeito que esta tela viu quando abriu.
              É PISTA, não prova: quem decide é `moverAlunoEstagio`, que lê a
              linha do aluno e a do estágio no banco antes de gravar (a aba
              pode estar aberta desde antes de a pessoa mudar de degrau). O
              campo continua aqui porque é ele que deixa o portão sem-banco
              recusar o arrasto obviamente proibido; a garantia é a leitura. */}
          <input type="hidden" name="chaveAtual" value={estagio?.chave ?? ""} />
          <Campo label="Mover de estágio" className="flex-1">
            <Select name="estagioId" defaultValue={aluno.estagioId ?? ""}>
              {estagios.map((e) => (
                <option key={e.id} value={e.id}>{e.nome}</option>
              ))}
            </Select>
          </Campo>
          <Botao tipo="fantasma">Aplicar</Botao>
        </form>
      </Card>

      <Card titulo="Resumo do cliente" className="lg:col-span-2">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {/* `statsAluno` (src/lib/metrics.ts, linha 225): ltv = soma do valor
              bruto de cada compra não pendente, aqui agrupada por produto.
              Com um produto só não há conta de duas partes — vira texto. */}
          <Stat
            label="LTV"
            valor={fmtBRL(st.ltv)}
            formato="moeda"
            valorNumerico={st.ltv}
            composicao={
              partesCompras.length >= 2
                ? {
                    formula: "soma",
                    partes: partesCompras,
                    nota: `Valor bruto das vendas, somado por produto: reembolso não é abatido aqui e a taxa do gateway não é descontada. Venda ainda pendente não entra.${
                      reembolsadas ? ` ${reembolsadas} destas compras foi(ram) reembolsada(s) e continua(m) somando.` : ""
                    }`,
                  }
                : partesCompras.length === 1
                  ? `${fmtBRLExato(st.ltv)} em ${st.compras} compra(s) de um único produto: ${partesCompras[0].rotulo}. Valor bruto — sem abater reembolso nem taxa de gateway.`
                  : "Nenhuma compra registrada para este cliente — lead ainda em prospecção, sem LTV a calcular."
            }
            origem={origemCompras}
          />
          {/* `statsAluno` (linha 229): compras = matrículas que NÃO estão pendentes. */}
          <Stat
            label="Compras"
            valor={String(st.compras)}
            formato="numero"
            valorNumerico={st.compras}
            composicao={{
              formula: "subtracao",
              partes: [
                { rotulo: "Matrículas registradas para o cliente", valor: matriculas.length },
                { rotulo: "Ainda aguardando pagamento (não contam)", valor: pendentes },
              ],
              nota: "Compra reembolsada continua contando como compra: ela aconteceu. Só o pagamento pendente fica de fora.",
            }}
            origem={origemCompras}
          />
          {/* `statsAluno` (linha 230): ticketMedio = ltv ÷ compras. */}
          <Stat
            label="Ticket médio"
            valor={fmtBRL(st.ticketMedio)}
            formato="moeda"
            valorNumerico={st.ticketMedio}
            composicao={
              st.compras
                ? {
                    formula: "divisao",
                    partes: [
                      { rotulo: "Valor somado das compras", valor: st.ltv },
                      { rotulo: "Compras não pendentes", valor: st.compras, formato: "numero" },
                    ],
                    nota: "Média simples por compra, no valor bruto. Upsell entra como compra separada e puxa a média para cima.",
                  }
                : "Sem compra registrada — não há ticket médio a calcular para este cliente."
            }
            origem={origemCompras}
          />
          {/* `statsAluno` (linha 226): ultimaCompra = maior data entre as
              matrículas não pendentes. É uma data, não uma conta → forma texto. */}
          <Stat
            label="Última compra"
            valor={st.ultimaCompra ? fmtDate(st.ultimaCompra) : "—"}
            composicao={
              st.ultimaCompra
                ? `Data mais recente entre as ${st.compras} compra(s) não pendente(s) deste cliente. Contato posterior (ligação, WhatsApp, nota) não muda esta data — aqui é venda, não relacionamento.`
                : "Nenhuma compra registrada: este cliente ainda não tem data de última compra."
            }
            origem={origemCompras}
          />
        </div>
        {minhasTarefas.length > 0 && (
          <div className="mt-4">
            <div className="mb-1 flex items-baseline justify-between text-sm">
              <span className="text-texto-2">Progresso no treinamento</span>
              <span className="tabular-nums">{concluidas}/{minhasTarefas.length}</span>
            </div>
            <ProgressBar pct={pctProgresso} />
          </div>
        )}
        {aluno.observacoes ? (
          <p className="mt-4 rounded-lg bg-painel-2 p-3 text-sm text-texto-2">{aluno.observacoes}</p>
        ) : null}
      </Card>
    </div>
  );

  const abaAtividades = (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <Card titulo={`Linha do tempo (${atividades.length})`}>
          <Timeline atividades={atividades} />
        </Card>
      </div>
      <div>
        <PainelForm titulo="Registrar contato / atividade">
          <form action={registrarAtividade} className="space-y-3">
            <input type="hidden" name="alunoId" value={aluno.id} />
            <Campo label="Tipo">
              <Select name="tipo" defaultValue="whatsapp">
                <option value="whatsapp">WhatsApp</option>
                <option value="ligacao">Ligação</option>
                <option value="email">E-mail</option>
                <option value="contato">Contato (outro)</option>
                <option value="evento">Reunião/Evento</option>
              </Select>
            </Campo>
            <Campo label="Título">
              <Input name="titulo" required placeholder="Ex.: Follow-up do treino" />
            </Campo>
            <Campo label="Detalhes">
              <TextArea name="detalhe" placeholder="O que foi conversado…" />
            </Campo>
            <Botao>Registrar</Botao>
          </form>
        </PainelForm>
      </div>
    </div>
  );

  const abaNotas = (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="space-y-3 lg:col-span-2">
        {notas.length ? (
          notas.map((n) => (
            <div key={n.id} className="rounded-lg border border-borda bg-painel p-3">
              <p className="text-sm">{n.texto}</p>
              <p className="mt-1 text-xs text-texto-2">
                {n.autor || "Gestão"} · {fmtDate(n.criadoEm.slice(0, 10))}
              </p>
            </div>
          ))
        ) : (
          <Vazio>Nenhuma nota ainda — registre o contexto importante deste cliente.</Vazio>
        )}
      </div>
      <div>
        <PainelForm titulo="Nova nota">
          <form action={criarNota} className="space-y-3">
            <input type="hidden" name="alunoId" value={aluno.id} />
            <TextArea name="texto" required placeholder="Preferências, metas, restrições, combinados…" />
            <Botao>Salvar nota</Botao>
          </form>
        </PainelForm>
      </div>
    </div>
  );

  const abaProgresso = (
    <Card titulo="Progresso no treinamento (por lançamento/turma)">
      {minhasTarefas.length ? (
        <>
          <div className="mb-3 flex items-center gap-3">
            <div className="flex-1">
              <ProgressBar pct={pctProgresso} />
            </div>
            <span className="text-sm tabular-nums text-texto-2">
              {concluidas}/{minhasTarefas.length} etapas
            </span>
          </div>
          <ul className="space-y-1.5">
            {minhasTarefas.map((t) => (
              <li key={t.id} className="flex items-center gap-2 text-sm">
                <form action={alternarTarefa}>
                  <input type="hidden" name="id" value={t.id} />
                  <button
                    className={cx(
                      "flex h-5 w-5 items-center justify-center rounded border text-xs",
                      t.concluida
                        ? "border-positivo/60 bg-positivo/15 text-positivo"
                        : "border-borda text-transparent hover:border-primaria"
                    )}
                    aria-label={t.concluida ? "Desmarcar etapa" : "Concluir etapa"}
                  >
                    •
                  </button>
                </form>
                <span className={cx(t.concluida && "text-texto-2 line-through")}>{t.titulo}</span>
                <span className="ml-auto shrink-0 text-xs text-texto-2">{t.lancNome}</span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <Vazio>Este cliente ainda não está em nenhuma turma com etapas de treinamento.</Vazio>
      )}
    </Card>
  );

  const abaCompras = (
    <Card titulo="Histórico de compras e pagamentos">
      {matriculas.length ? (
        <Tabela>
          <thead>
            <tr>
              <Th>Data</Th>
              <Th>Produto</Th>
              <Th>Pagamento</Th>
              <Th>Situação</Th>
              <Th num>Valor</Th>
              <Th num>Líquido</Th>
            </tr>
          </thead>
          <tbody>
            {matriculas.map((m) => (
              <tr key={m.id}>
                <Td>{fmtDate(m.data)}</Td>
                <Td>
                  {m.produtoNome}
                  {m.isUpsell && (
                    <span className="ml-1.5 align-middle">
                      <Badge tom="ouro">upsell</Badge>
                    </span>
                  )}
                </Td>
                <Td className="text-texto-2">{FORMA_PGTO_LABEL[m.formaPgto]}</Td>
                <Td>
                  {m.statusPagamento === "pago" && <Badge tom="verde">Pago</Badge>}
                  {m.statusPagamento === "pendente" && <Badge tom="ouro">Pendente</Badge>}
                  {m.statusPagamento === "reembolsado" && <Badge tom="vermelho">Reembolsado</Badge>}
                </Td>
                <Td num>{fmtBRLExato(m.valor)}</Td>
                <Td num>{fmtBRLExato(m.valorLiquido)}</Td>
              </tr>
            ))}
          </tbody>
        </Tabela>
      ) : (
        <Vazio>Nenhuma compra ainda — lead em prospecção.</Vazio>
      )}
    </Card>
  );

  return (
    <>
      <p className="mb-2 text-xs text-texto-2">
        <Link href="/crm" className="hover:text-primaria-2">← Central de Clientes</Link>
      </p>
      <PageHeader titulo={aluno.nome} sub={aluno.origem ? `Origem: ${aluno.origem}` : undefined}>
        {estagio ? <Badge tom={(estagio.cor as Tom) ?? "cinza"}>{estagio.nome}</Badge> : null}
      </PageHeader>

      <Tabs
        abas={[
          { id: "visao", rotulo: "Visão geral", conteudo: abaVisaoGeral },
          {
            id: "conversa",
            rotulo: "Conversa",
            badge: interacoes.length,
            conteudo: (
              <CrmConversa
                interacoes={interacoes}
                leitura={leitura}
                telefone={aluno.telefone}
                agenteLigado={agente.ligado}
                aprovar={async (texto: string) => {
                  "use server";
                  return aprovarEnvioWhatsapp({ alunoId: aluno.id, texto });
                }}
              />
            ),
          },
          { id: "atividades", rotulo: "Atividades", badge: atividades.length, conteudo: abaAtividades },
          { id: "notas", rotulo: "Notas", badge: notas.length, conteudo: abaNotas },
          { id: "progresso", rotulo: "Progresso", badge: minhasTarefas.length, conteudo: abaProgresso },
          { id: "compras", rotulo: "Compras", badge: matriculas.length, conteudo: abaCompras },
        ]}
      />
    </>
  );
}
