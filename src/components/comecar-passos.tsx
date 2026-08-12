// Os passos da tela "Começar" — cadastro base que tira a planilha do zero:
// agrupamentos (opcional) → produto (fonte de renda) → responsável
// (agrupamento/comissão) → conta (caixa) → meta (norte do ano). A ordem dos
// quatro obrigatórios é a ordem de dependência: um passo só faz sentido
// depois que o anterior existe. "Agrupamentos" vem antes de "Fontes de
// renda" porque é lá que um produto escolhe a que linha pertence — mas não
// tem número: é opcional, não faz parte da conta de "quanto falta".
//
// Módulo NEUTRO de propósito (sem "use client"): os formulários postam direto
// para Server Actions via `action={...}`, sem precisar de estado no cliente.

import { Glossario, SecaoVisual } from "@/components/explicador";
import { Badge, Botao, Campo, Card, Input, Select, Tabela, Td, Th, Vazio, cx } from "@/components/ui";
import {
  criarAgrupamento,
  criarConta,
  criarProduto,
  criarResponsavel,
  salvarMetaFinanceira,
} from "@/lib/actions";
import { agrupamentosAtivos, ordenarAgrupamentos, rotularAgrupamento } from "@/lib/agrupamentos";
import { fraseResumoComecar, resumoComecar, type ContagensComecar, type IdPassoComecar } from "@/lib/comecar";
import { corDoAgrupamento, PALETA_AGRUPAMENTO } from "@/lib/cores";
import { TIPO_CONTA_LABEL, TIPO_PRODUTO_LABEL } from "@/lib/domain";
import { CATEGORIAS_FONTE, CATEGORIA_FONTE_LABEL } from "@/lib/fontes";
import { fmtBRL, fmtPct, ymAtual } from "@/lib/format";
import type {
  Afiliado,
  Agrupamento,
  ContaBancaria,
  MetaFinanceira,
  Produto,
} from "@/lib/types";

const DESCRICAO_PASSO: Record<IdPassoComecar, string> = {
  produtos: "o que aparece pronto e o que ainda falta, na ordem em que um libera o outro.",
  responsaveis: "quem cadastra a comissão certa em cada venda.",
  contas: "onde o caixa nasce.",
  metas: "para onde o ano está indo.",
};

function IconePasso({ concluido }: { concluido: boolean }) {
  return (
    <span aria-hidden className={concluido ? "text-positivo" : "text-texto-4"}>
      {concluido ? "▲" : "▬"}
    </span>
  );
}

/**
 * Pílula de agrupamento para as tabelas de produto/responsável/conta abaixo.
 * Não usa `Badge`: `tom` daquele componente é uma lista fixa de nomes (não
 * aceita hex arbitrário), e a cor de um agrupamento agora vem do cadastro do
 * usuário — pode ser qualquer uma da paleta. `corDoAgrupamento` cobre o caso
 * de um id órfão (agrupamento apagado depois de usado) com uma cor neutra
 * determinística, então isto nunca quebra mesmo com dado antigo.
 */
function BadgeAgrupamento({
  id,
  agrupamentos,
}: {
  id: string | null | undefined;
  agrupamentos: Agrupamento[];
}) {
  if (!id) return <>—</>;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-borda-sutil bg-poco px-2 py-0.5 text-xs font-medium text-texto-2">
      <span
        aria-hidden
        className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ background: corDoAgrupamento(id, agrupamentos) }}
      />
      {rotularAgrupamento(id, agrupamentos)}
    </span>
  );
}

export function ComecarPassos({
  bloqueado,
  produtos,
  responsaveis,
  contas,
  metas,
  agrupamentos,
}: {
  /** Sem base conectada — gravar seria mentir para quem digitou. */
  bloqueado: boolean;
  produtos: Produto[];
  responsaveis: Afiliado[];
  contas: ContaBancaria[];
  metas: MetaFinanceira[];
  agrupamentos: Agrupamento[];
}) {
  const anoAtual = new Date().getFullYear();
  const metasDoAno = metas.filter((m) => m.periodo.startsWith(String(anoAtual)));

  const contagens: ContagensComecar = {
    produtos: produtos.length,
    responsaveis: responsaveis.length,
    contas: contas.length,
    metas: metasDoAno.length,
    agrupamentos: agrupamentos.length,
  };
  const resumo = resumoComecar(contagens);

  return (
    <div className="space-y-4">
      <SecaoVisual
        pergunta="Quanto falta para o painel sair do zero?"
        resposta={fraseResumoComecar(resumo)}
        tom={resumo.completo ? "bom" : resumo.concluidos > 0 ? "atencao" : "neutro"}
        rodape={
          bloqueado
            ? "Sem base conectada, nenhum cadastro abaixo grava de verdade — ligue a planilha ou o Supabase primeiro."
            : "Clique em qualquer passo abaixo para ir direto ao formulário dele."
        }
      >
        {/* Trilha de passos, e NÃO o componente <Fluxo>.
            Fluxo existe para dinheiro atravessando deduções: número herói
            grande e fluido. Um status é palavra, não número — "Opcional — dá
            para pular" em corpo 26 estourava a caixa e saía cortado. Mesma
            leitura, tipografia certa para texto. */}
        <ol className="flex flex-col gap-2 md:flex-row md:items-stretch">
          {[
            {
              id: "agrupamentos",
              titulo: resumo.passoOpcional.titulo,
              status: resumo.passoOpcional.cadastrado
                ? `${resumo.passoOpcional.quantidade} cadastrado${resumo.passoOpcional.quantidade > 1 ? "s" : ""}`
                : "Opcional",
              pronto: resumo.passoOpcional.cadastrado,
              opcional: true,
              oQueE:
                "juntar produtos da mesma linha do negócio, para ver quanto cada linha pesa.",
            },
            ...resumo.passos.map((p) => ({
              id: p.id,
              titulo: p.titulo,
              status: p.concluido
                ? `${p.quantidade} cadastrado${p.quantidade > 1 ? "s" : ""}`
                : "Pendente",
              pronto: p.concluido,
              opcional: false,
              oQueE: DESCRICAO_PASSO[p.id],
            })),
          ].map((p, i) => (
            <li key={p.id} className="contents">
              {i > 0 && (
                <span
                  aria-hidden
                  className="flex shrink-0 items-center justify-center text-texto-4 md:px-1"
                >
                  <span className="md:hidden">▼</span>
                  <span className="hidden md:inline">▶</span>
                </span>
              )}
              <a
                href={`#${p.id}`}
                className="superficie trans flex-1 rounded-2xl border p-4 transition-all hover:-translate-y-px hover:shadow-e2 md:min-w-0"
              >
                <p className="text-[11px] font-medium uppercase tracking-wider text-texto-3">
                  {p.titulo}
                </p>
                <p className="mt-2">
                  <span
                    className={cx(
                      "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium",
                      p.pronto
                        ? "border-positivo/40 bg-positivo/10 text-positivo"
                        : p.opcional
                          ? "border-borda bg-eleva text-texto-2"
                          : "border-ouro/40 bg-ouro/10 text-ouro"
                    )}
                  >
                    {p.status}
                  </span>
                </p>
                <p className="mt-2.5 text-[11px] leading-snug text-texto-2">{p.oQueE}</p>
              </a>
            </li>
          ))}
        </ol>
      </SecaoVisual>

      <PassoAgrupamento
        id="agrupamentos"
        bloqueado={bloqueado}
        agrupamentos={agrupamentos}
        cadastrado={resumo.passoOpcional.cadastrado}
      />

      <PassoProduto
        id="produtos"
        bloqueado={bloqueado}
        produtos={produtos}
        agrupamentos={agrupamentos}
        concluido={contagens.produtos > 0}
      />
      <PassoResponsavel
        id="responsaveis"
        bloqueado={bloqueado}
        responsaveis={responsaveis}
        agrupamentos={agrupamentos}
        concluido={contagens.responsaveis > 0}
      />
      <PassoConta
        id="contas"
        bloqueado={bloqueado}
        contas={contas}
        agrupamentos={agrupamentos}
        concluido={contagens.contas > 0}
      />
      <PassoMeta id="metas" bloqueado={bloqueado} metas={metasDoAno} concluido={contagens.metas > 0} />

      <Glossario
        termos={[
          {
            termo: "Fonte de renda (produto)",
            oQueE: "Tudo que o negócio vende — curso, mentoria, serviço, produto físico, assinatura ou evento.",
          },
          {
            termo: "Responsável",
            oQueE: "Quem vende: o dono ou um afiliado. Cada um tem uma comissão padrão.",
          },
          {
            termo: "Agrupamento",
            oQueE:
              "Uma linha do negócio criada por você (opcional) — junta produtos parecidos para ver quanto cada linha pesa. Sem nenhum cadastrado, essa visão simplesmente não aparece.",
          },
          {
            termo: "Comissão padrão",
            oQueE: "O percentual que este responsável recebe por venda, quando a venda não tem comissão própria.",
          },
          {
            termo: "Conta",
            oQueE: "Onde o dinheiro fica de verdade — banco, gateway ou caixa físico. A soma das contas ativas é o caixa.",
          },
          {
            termo: "Saldo inicial",
            oQueE: "Quanto essa conta já tinha antes de o app começar a registrar — a base do extrato.",
          },
          {
            termo: "Meta",
            oQueE: "O alvo do mês para faturamento ou lucro — é contra ele que o painel mede o ritmo do ano.",
          },
        ]}
      />
    </div>
  );
}

function PassoAgrupamento({
  id,
  bloqueado,
  agrupamentos,
  cadastrado,
}: {
  id: string;
  bloqueado: boolean;
  agrupamentos: Agrupamento[];
  cadastrado: boolean;
}) {
  const ordenados = ordenarAgrupamentos(agrupamentos);
  return (
    <Card className="scroll-mt-20">
      <div id={id} className="scroll-mt-20">
        <h2 className="flex items-center gap-2 font-display text-[15px] font-normal tracking-tight text-texto">
          <span className="flex items-center gap-2">
            <IconePasso concluido={cadastrado} />
            Agrupamentos
          </span>
          <Badge tom="cinza">Opcional</Badge>
        </h2>
        <p className="mt-1 text-sm text-texto-2">
          Junta produtos da mesma linha do negócio, para ver quanto cada linha pesa no total. Dá
          para pular esta etapa inteira — sem nenhum agrupamento cadastrado, o painel funciona
          normalmente, só sem essa visão por linha.
        </p>

        {ordenados.length > 0 ? (
          <Tabela className="mt-4">
            <thead>
              <tr>
                <Th>Nome</Th>
                <Th>Cor</Th>
                <Th num>Ordem</Th>
                <Th>Situação</Th>
              </tr>
            </thead>
            <tbody>
              {ordenados.map((a) => (
                <tr key={a.id}>
                  <Td>{a.nome}</Td>
                  <Td>
                    <span
                      aria-hidden
                      className="inline-block h-3 w-3 rounded-full border border-borda-sutil"
                      style={{ background: a.cor }}
                    />
                  </Td>
                  <Td num>{a.ordem}</Td>
                  <Td>
                    <Badge tom={a.ativo ? "verde" : "cinza"}>{a.ativo ? "Ativo" : "Inativo"}</Badge>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Tabela>
        ) : (
          <Vazio>Nenhum agrupamento cadastrado — e tudo bem, esta etapa é opcional.</Vazio>
        )}

        <fieldset disabled={bloqueado} className="mt-4 border-t border-borda-sutil pt-4">
          <form action={criarAgrupamento} className="grid gap-3 sm:grid-cols-3">
            <Campo label="Nome do agrupamento" className="sm:col-span-2">
              <Input name="nome" required placeholder="ex.: Linha Premium, Unidade SP" />
            </Campo>
            <Campo label="Ordem de exibição">
              <Input name="ordem" type="number" step="1" min="0" defaultValue={ordenados.length} />
            </Campo>
            <Campo label="Cor" className="sm:col-span-3">
              <Select name="cor" required defaultValue={PALETA_AGRUPAMENTO[0]}>
                {PALETA_AGRUPAMENTO.map((cor) => (
                  <option key={cor} value={cor} style={{ background: cor }}>
                    {cor}
                  </option>
                ))}
              </Select>
            </Campo>
            <div className="sm:col-span-3">
              <Botao>Cadastrar agrupamento</Botao>
            </div>
          </form>
        </fieldset>
      </div>
    </Card>
  );
}

function TituloPasso({ numero, titulo, concluido }: { numero: number; titulo: string; concluido: boolean }) {
  return (
    <h2 className="flex items-center gap-2 font-display text-[15px] font-normal tracking-tight text-texto">
      <span className="flex items-center gap-2">
        <IconePasso concluido={concluido} />
        {numero}. {titulo}
      </span>
      {concluido ? <Badge tom="verde">Concluído</Badge> : null}
    </h2>
  );
}

function PassoProduto({
  id,
  bloqueado,
  produtos,
  agrupamentos,
  concluido,
}: {
  id: string;
  bloqueado: boolean;
  produtos: Produto[];
  agrupamentos: Agrupamento[];
  concluido: boolean;
}) {
  const ativos = agrupamentosAtivos(agrupamentos);
  return (
    <Card className="scroll-mt-20">
      <div id={id} className="scroll-mt-20">
        <TituloPasso numero={1} titulo="Fontes de renda" concluido={concluido} />
        <p className="mt-1 text-sm text-texto-2">
          O que o negócio vende. Sem um produto cadastrado, nenhuma venda tem a que ser ligada.
        </p>

        {produtos.length > 0 ? (
          <Tabela className="mt-4">
            <thead>
              <tr>
                <Th>Nome</Th>
                <Th>Tipo</Th>
                <Th>Categoria</Th>
                <Th num>Preço base</Th>
                <Th>Agrupamento</Th>
              </tr>
            </thead>
            <tbody>
              {produtos.map((p) => (
                <tr key={p.id}>
                  <Td>{p.nome}</Td>
                  <Td>{TIPO_PRODUTO_LABEL[p.tipo]}</Td>
                  <Td>{CATEGORIA_FONTE_LABEL[p.categoria]}</Td>
                  <Td num>{fmtBRL(p.precoBase)}</Td>
                  <Td>
                    <BadgeAgrupamento id={p.braco} agrupamentos={agrupamentos} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Tabela>
        ) : (
          <Vazio>Nenhuma fonte de renda cadastrada ainda.</Vazio>
        )}

        <fieldset disabled={bloqueado} className="mt-4 border-t border-borda-sutil pt-4">
          <form action={criarProduto} className="grid gap-3 sm:grid-cols-2">
            <Campo label="Nome do produto" className="sm:col-span-2">
              <Input name="nome" required placeholder="como o cliente reconhece esse produto" />
            </Campo>
            <Campo label="Tipo">
              <Select name="tipo" required defaultValue="low_ticket">
                {Object.entries(TIPO_PRODUTO_LABEL).map(([v, rotulo]) => (
                  <option key={v} value={v}>
                    {rotulo}
                  </option>
                ))}
              </Select>
            </Campo>
            <Campo label="Categoria">
              <Select name="categoria" required defaultValue={CATEGORIAS_FONTE[0]}>
                {CATEGORIAS_FONTE.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORIA_FONTE_LABEL[c]}
                  </option>
                ))}
              </Select>
            </Campo>
            <Campo label="Preço base (R$)">
              <Input name="precoBase" type="number" step="0.01" min="0" required placeholder="valor em reais" />
            </Campo>
            {/* Só aparece com pelo menos um agrupamento cadastrado (passo acima,
                opcional) — sem cadastro nenhum, o `input hidden` garante que o
                formulário continua enviando "braco" vazio, do jeito que
                `ProdutoSchema` já espera (chave sempre presente, string vazia
                vira null). */}
            {ativos.length > 0 ? (
              <Campo label="Agrupamento (opcional)">
                <Select name="braco" defaultValue="">
                  <option value="">Nenhum agrupamento</option>
                  {ordenarAgrupamentos(ativos).map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.nome}
                    </option>
                  ))}
                </Select>
              </Campo>
            ) : (
              <input type="hidden" name="braco" value="" />
            )}
            <div className="sm:col-span-2">
              <Botao>Cadastrar produto</Botao>
            </div>
          </form>
        </fieldset>
      </div>
    </Card>
  );
}

function PassoResponsavel({
  id,
  bloqueado,
  responsaveis,
  agrupamentos,
  concluido,
}: {
  id: string;
  bloqueado: boolean;
  responsaveis: Afiliado[];
  agrupamentos: Agrupamento[];
  concluido: boolean;
}) {
  // `Afiliado.braco` aceita `null` no TIPO agora (responsável sem agrupamento
  // é um estado válido — ver nota em types.ts), mas o CADASTRO por este
  // formulário continua pedindo um agrupamento: escolha é decisão de produto
  // deste passo, não do tipo. Por isso, diferente do produto, o campo nunca
  // some: sem nenhum agrupamento cadastrado ele cai para um texto livre, em
  // vez de um select sem opção nenhuma para oferecer.
  const ativos = ordenarAgrupamentos(agrupamentosAtivos(agrupamentos));
  return (
    <Card className="scroll-mt-20">
      <div id={id} className="scroll-mt-20">
        <TituloPasso numero={2} titulo="Quem vende" concluido={concluido} />
        <p className="mt-1 text-sm text-texto-2">
          O dono e os afiliados, cada um com a comissão dele. Sem isto não existe rede nem
          comissão calculada.
        </p>

        {responsaveis.length > 0 ? (
          <Tabela className="mt-4">
            <thead>
              <tr>
                <Th>Nome</Th>
                <Th>Agrupamento</Th>
                <Th num>Comissão padrão</Th>
                <Th num>Meta mensal</Th>
              </tr>
            </thead>
            <tbody>
              {responsaveis.map((r) => (
                <tr key={r.id}>
                  <Td>{r.nome}</Td>
                  <Td>
                    <BadgeAgrupamento id={r.braco} agrupamentos={agrupamentos} />
                  </Td>
                  <Td num>{fmtPct(r.pctPadrao)}</Td>
                  <Td num>{r.metaMensal ? fmtBRL(r.metaMensal) : "—"}</Td>
                </tr>
              ))}
            </tbody>
          </Tabela>
        ) : (
          <Vazio>Nenhum responsável cadastrado ainda.</Vazio>
        )}

        <fieldset disabled={bloqueado} className="mt-4 border-t border-borda-sutil pt-4">
          <form action={criarResponsavel} className="grid gap-3 sm:grid-cols-2">
            <Campo label="Nome" className="sm:col-span-2">
              <Input name="nome" required placeholder="nome de quem vende" />
            </Campo>
            {ativos.length > 0 ? (
              <Campo label="Agrupamento">
                <Select name="braco" required defaultValue={ativos[0].id}>
                  {ativos.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.nome}
                    </option>
                  ))}
                </Select>
              </Campo>
            ) : (
              <Campo label="Agrupamento">
                <Input
                  name="braco"
                  required
                  placeholder="nome curto da linha deste responsável (ex.: vendas)"
                />
              </Campo>
            )}
            <Campo label="Comissão padrão (%)">
              <Input
                name="comissaoPadrao"
                type="number"
                step="0.1"
                min="0"
                max="100"
                required
                placeholder="percentual sobre a venda"
              />
            </Campo>
            <Campo label="Meta mensal (R$, opcional)" className="sm:col-span-2">
              <Input name="metaMensal" type="number" step="0.01" min="0" placeholder="valor em reais" />
            </Campo>
            <div className="sm:col-span-2">
              <Botao>Cadastrar responsável</Botao>
            </div>
          </form>
        </fieldset>
      </div>
    </Card>
  );
}

function PassoConta({
  id,
  bloqueado,
  contas,
  agrupamentos,
  concluido,
}: {
  id: string;
  bloqueado: boolean;
  contas: ContaBancaria[];
  agrupamentos: Agrupamento[];
  concluido: boolean;
}) {
  const ativos = agrupamentosAtivos(agrupamentos);
  return (
    <Card className="scroll-mt-20">
      <div id={id} className="scroll-mt-20">
        <TituloPasso numero={3} titulo="Onde o dinheiro fica" concluido={concluido} />
        <p className="mt-1 text-sm text-texto-2">
          A conta e o saldo dela hoje. Sem saldo inicial o caixa nasce errado e nunca se conserta
          sozinho.
        </p>

        {contas.length > 0 ? (
          <Tabela className="mt-4">
            <thead>
              <tr>
                <Th>Nome</Th>
                <Th>Tipo</Th>
                <Th num>Saldo inicial</Th>
                <Th>Agrupamento</Th>
              </tr>
            </thead>
            <tbody>
              {contas.map((c) => (
                <tr key={c.id}>
                  <Td>{c.nome}</Td>
                  <Td>{TIPO_CONTA_LABEL[c.tipo]}</Td>
                  <Td num>{fmtBRL(c.saldoInicial)}</Td>
                  <Td>
                    <BadgeAgrupamento id={c.braco} agrupamentos={agrupamentos} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Tabela>
        ) : (
          <Vazio>Nenhuma conta cadastrada ainda.</Vazio>
        )}

        <fieldset disabled={bloqueado} className="mt-4 border-t border-borda-sutil pt-4">
          <form action={criarConta} className="grid gap-3 sm:grid-cols-2">
            <Campo label="Nome da conta" className="sm:col-span-2">
              <Input name="nome" required placeholder="como você reconhece essa conta" />
            </Campo>
            <Campo label="Tipo">
              <Select name="tipo" required defaultValue="corrente">
                {Object.entries(TIPO_CONTA_LABEL).map(([v, rotulo]) => (
                  <option key={v} value={v}>
                    {rotulo}
                  </option>
                ))}
              </Select>
            </Campo>
            <Campo label="Saldo inicial de hoje (R$)">
              <Input name="saldoInicial" type="number" step="0.01" min="0" placeholder="valor em reais" />
            </Campo>
            {ativos.length > 0 ? (
              <Campo label="Agrupamento (opcional)">
                <Select name="braco" defaultValue="">
                  <option value="">Nenhum agrupamento</option>
                  {ordenarAgrupamentos(ativos).map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.nome}
                    </option>
                  ))}
                </Select>
              </Campo>
            ) : (
              <input type="hidden" name="braco" value="" />
            )}
            <div className="sm:col-span-2">
              <Botao>Cadastrar conta</Botao>
            </div>
          </form>
        </fieldset>
      </div>
    </Card>
  );
}

function PassoMeta({
  id,
  bloqueado,
  metas,
  concluido,
}: {
  id: string;
  bloqueado: boolean;
  metas: MetaFinanceira[];
  concluido: boolean;
}) {
  return (
    <Card className="scroll-mt-20">
      <div id={id} className="scroll-mt-20">
        <TituloPasso numero={4} titulo="Metas do ano" concluido={concluido} />
        <p className="mt-1 text-sm text-texto-2">
          O alvo de faturamento ou lucro de cada mês deste ano. Sem meta o painel mostra o número,
          mas não diz se ele é bom.
        </p>

        {metas.length > 0 ? (
          <Tabela className="mt-4">
            <thead>
              <tr>
                <Th>Indicador</Th>
                <Th>Período</Th>
                <Th num>Alvo</Th>
              </tr>
            </thead>
            <tbody>
              {[...metas]
                .sort((a, b) => a.periodo.localeCompare(b.periodo))
                .map((m) => (
                  <tr key={m.id}>
                    <Td>{m.tipo === "faturamento" ? "Faturamento" : "Lucro"}</Td>
                    <Td>{m.periodo}</Td>
                    <Td num>{fmtBRL(m.alvo)}</Td>
                  </tr>
                ))}
            </tbody>
          </Tabela>
        ) : (
          <Vazio>Nenhuma meta cadastrada para este ano ainda.</Vazio>
        )}

        <fieldset disabled={bloqueado} className="mt-4 border-t border-borda-sutil pt-4">
          <form action={salvarMetaFinanceira} className="grid gap-3 sm:grid-cols-3">
            <Campo label="Meta">
              <Select name="tipo" required defaultValue="faturamento">
                <option value="faturamento">Faturamento</option>
                <option value="lucro">Lucro</option>
              </Select>
            </Campo>
            <Campo label="Mês">
              <Input name="periodo" type="month" required defaultValue={ymAtual()} />
            </Campo>
            <Campo label="Alvo (R$)">
              <Input name="alvo" type="number" step="0.01" min="0" required placeholder="valor em reais" />
            </Campo>
            <div className="sm:col-span-3">
              <Botao>Salvar meta</Botao>
            </div>
          </form>
        </fieldset>
      </div>
    </Card>
  );
}
