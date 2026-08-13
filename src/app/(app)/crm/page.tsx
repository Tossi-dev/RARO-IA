import Link from "next/link";
import { GraficoFunil } from "@/components/charts";
import { KanbanCrm, type CartaoKanban } from "@/components/kanban";
import { Badge, Botao, Campo, Card, Input, PageHeader, PainelForm, Select, Stat, Tabela, Td, Th, TextArea, Vazio, cx, type Tom } from "@/components/ui";
import { criarAluno } from "@/lib/actions";
import { ordemDaEtapa, type EtapaJornada } from "@/lib/crm/jornada";
import { getDB } from "@/lib/data";
import { STATUS_FUNIL_LABEL } from "@/lib/domain";
import { fmtBRL, fmtDate } from "@/lib/format";
import { funil, statsAluno } from "@/lib/metrics";
import type { Estagio } from "@/lib/types";
import { CrmFila } from "@/components/crm-fila";
import { montarFilaDoDia, type AlunoParaFila } from "@/lib/atendimento/fila";
import { CrmWhatsapp } from "@/components/crm-whatsapp";
import { estadoWhatsapp } from "@/lib/actions";

export const dynamic = "force-dynamic";

const DIA_MS = 86400000;

/**
 * Os estágios na ordem da ESCADA CANÔNICA (`src/lib/crm/jornada.ts`), e não
 * em `crm_estagios.ordem`.
 *
 * POR QUE NÃO A ORDEM DO BANCO: `ordem` é campo editável pelo dono, e a 0014
 * até a reescreve no remapeamento. Uma tela que ordena por ele mostra o funil
 * fora de sequência no dia em que alguém arrumar as colunas na mão — e um
 * funil fora de ordem faz a pessoa ler conversão onde não há.
 *
 * O que o código NÃO conhece continua na tela: `ordemDaEtapa` devolve, para
 * chave fora da escada (o `inativo` que a 0014 preserva de propósito, o
 * estágio que o dono criou à mão, ou `""` de base anterior à 0014), uma
 * posição depois do último degrau — a coluna aparece no FIM, com o rótulo do
 * banco. Esconder estágio que existe seria apagar dado na tela.
 *
 * O desempate é a posição de ENTRADA, escrito à mão em vez de confiado ao
 * `sort`: duas colunas fora da escada empatam sempre, e a ordem entre elas
 * precisa ser a mesma a cada abertura da página.
 */
function ordenarPelaEscada(estagios: readonly Estagio[]): Estagio[] {
  return estagios
    .map((estagio, entrada) => ({ estagio, entrada }))
    .sort((a, b) => {
      const passo = ordemDaEtapa(a.estagio.chave) - ordemDaEtapa(b.estagio.chave);
      return passo !== 0 ? passo : a.entrada - b.entrada;
    })
    .map((item) => item.estagio);
}

// MÉDIO 5 da auditoria (o raciocínio está inteiro no cabeçalho de
// `src/lib/mentoria/acoes-portal.ts`): `?erro=` carrega um CÓDIGO curto,
// escrito por `moverAlunoEstagio`, e esta tabela fechada é o único lugar que
// traduz código em frase. Código desconhecido — typo ou ataque — nunca ecoa.
const MENSAGENS_ERRO: Record<string, string> = {
  transicao:
    "Quem já é alumni só volta para o funil como cliente ativo (recompra). O movimento foi recusado e ninguém mudou de estágio.",
  estagio: "Não foi possível mover a pessoa de estágio agora. Confira se o estágio ainda existe e tente de novo.",
  aluno:
    "Não foi possível confirmar em que estágio essa pessoa está agora. Atualize a página e tente de novo — nada foi alterado.",
};

const MENSAGEM_ERRO_GENERICA = "Não foi possível concluir a ação agora. Tente novamente em instantes.";

/** A frase do banner, ou `null` quando não há código nenhum para mostrar. */
function mensagemDeErro(codigo: string | null | undefined): string | null {
  if (typeof codigo !== "string" || codigo.trim() === "") return null;
  // `hasOwn` e não `MENSAGENS_ERRO[codigo] ?? ...`: a busca crua acha o que
  // veio do PROTÓTIPO de Object. `?erro=toString` devolveria uma FUNÇÃO em
  // vez de frase, e o `??` não a substituiria pela genérica — o banner
  // sairia quebrado por causa de um valor de querystring.
  return Object.prototype.hasOwnProperty.call(MENSAGENS_ERRO, codigo)
    ? MENSAGENS_ERRO[codigo]
    : MENSAGEM_ERRO_GENERICA;
}

export default async function Crm({
  searchParams,
}: {
  searchParams: { q?: string; estagio?: string; visao?: string; erro?: string };
}) {
  const db = getDB();
  const [alunos, ds, estagios, atividades, interacoes] = await Promise.all([
    db.listAlunos(),
    db.dataset(),
    db.listEstagios(),
    db.listAtividades(),
    db.listInteracoes(),
  ]);

  // ---- fila do dia ----------------------------------------------------
  // Os fatos de cada pessoa são as CONVERSAS mais as COMPRAS. A compra entra
  // como "evento" e não como mensagem: venda não é fala de ninguém, e chamá-la
  // de mensagem recebida faria o cliente furar a fila como se estivesse
  // esperando resposta.
  const interacoesPorAluno = new Map<string, typeof interacoes>();
  for (const i of interacoes) {
    const arr = interacoesPorAluno.get(i.alunoId) ?? [];
    arr.push(i);
    interacoesPorAluno.set(i.alunoId, arr);
  }
  const paraFila: AlunoParaFila[] = alunos.map((a) => ({
    id: a.id,
    nome: a.nome,
    telefone: a.telefone,
    fatos: [
      ...(interacoesPorAluno.get(a.id) ?? []).map((i) => ({
        quando: i.quando,
        direcao: i.direcao,
      })),
      ...ds.matriculas
        .filter((m) => m.alunoId === a.id && m.statusPagamento !== "pendente")
        .map((m) => ({ quando: m.data, direcao: "evento" as const, compra: true })),
    ],
  }));
  const fila = montarFilaDoDia(paraFila, new Date());
  const agente = await estadoWhatsapp();

  // matrículas e último contato por aluno
  const porAluno = new Map<string, typeof ds.matriculas>();
  for (const m of ds.matriculas) {
    const arr = porAluno.get(m.alunoId) ?? [];
    arr.push(m);
    porAluno.set(m.alunoId, arr);
  }
  const ultimoContato = new Map<string, string>();
  const marca = (id: string, d: string) => {
    const dia = d.slice(0, 10);
    if (!ultimoContato.has(id) || ultimoContato.get(id)! < dia) ultimoContato.set(id, dia);
  };
  for (const a of atividades) marca(a.alunoId, a.data);
  for (const m of ds.matriculas) marca(m.alunoId, m.data);
  const hoje = new Date();
  const hojeT = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()).getTime();
  const diasSem = (id: string): number | null => {
    const base = ultimoContato.get(id);
    if (!base) return null;
    const d = Math.round((hojeT - new Date(`${base}T00:00:00`).getTime()) / DIA_MS);
    return d < 0 ? 0 : d;
  };

  const visao = searchParams.visao === "lista" ? "lista" : "kanban";
  const q = (searchParams.q ?? "").trim().toLowerCase();
  const estagioFiltro = searchParams.estagio ?? "";

  const filtrados = alunos.filter((a) => {
    if (estagioFiltro && a.estagioId !== estagioFiltro) return false;
    if (q && !a.nome.toLowerCase().includes(q) && !a.telefone.includes(q.replace(/\D/g, "") || "§"))
      return false;
    return true;
  });

  // kanban — as colunas na ordem da escada (ver `ordenarPelaEscada`). Esta
  // lista é a que a tela inteira usa daqui para baixo: o quadro, o filtro de
  // estágio e a ordenação da visão em lista. Duas ordens diferentes para a
  // mesma escada, na mesma tela, é a confusão que a Fase 2 veio desfazer.
  const estagiosNaEscada = ordenarPelaEscada(estagios);
  const colunas: Record<string, CartaoKanban[]> = {};
  for (const e of estagiosNaEscada) colunas[e.id] = [];
  for (const a of filtrados) {
    const st = statsAluno(porAluno.get(a.id) ?? []);
    const cartao: CartaoKanban = {
      id: a.id,
      nome: a.nome,
      origem: a.origem,
      telefone: a.telefone,
      ltv: st.ltv,
      diasSemContato: diasSem(a.id),
    };
    // Sem estágio (ou com um id que não existe mais) a pessoa cai na PRIMEIRA
    // coluna da escada, não na primeira linha que o banco devolveu: o começo
    // do funil é o lugar que não afirma nada sobre ela — mesmo fail-closed de
    // `jornadaDe`, que manda o desconhecido para `prospect`.
    const chave = a.estagioId && colunas[a.estagioId] ? a.estagioId : estagiosNaEscada[0]?.id;
    if (chave) colunas[chave].push(cartao);
  }
  for (const e of estagiosNaEscada) {
    colunas[e.id].sort((x, y) => (y.diasSemContato ?? 0) - (x.diasSemContato ?? 0));
  }

  const f = funil(alunos);
  const compradores = alunos.filter((a) => (porAluno.get(a.id) ?? []).length > 0);
  const ltvs = compradores.map((a) => statsAluno(porAluno.get(a.id) ?? []).ltv);
  // LTV médio = soma dos LTV individuais ÷ número de clientes que compraram.
  // O total fica em variável própria porque é ele que vira parte da composição.
  const ltvTotal = ltvs.reduce((s, v) => s + v, 0);
  const ltvMedio = ltvs.length ? ltvTotal / ltvs.length : 0;
  const ativos = f.novo + f.recorrente;
  // A coluna de risco é achada pela CHAVE da escada, nunca por um id
  // literal: `crm_estagios.id` é uuid gerado pelo Postgres (a 0014 não
  // escreve id nenhum), e o `est-risco` que ficava aqui só existe na base de
  // demonstração. Em Supabase de verdade a busca por id não achava nada e o
  // KPI mostrava 0 — um zero apresentado como contagem, com composição
  // detalhada, que é a pior forma de mentir número.
  //
  // `EtapaJornada` e não `string` para o `tsc` cobrar a chave: um typo aqui
  // volta a zerar o cartão em silêncio.
  const CHAVE_EM_RISCO: EtapaJornada = "em_risco";
  const estagioDeRisco = estagiosNaEscada.find((e) => e.chave === CHAVE_EM_RISCO);
  // atenção: a coluna de risco sai do kanban, que já respeita os filtros da
  // tela; `f.inativo` sai da base inteira. A ressalva vai na nota do KPI.
  const emRisco = estagioDeRisco ? (colunas[estagioDeRisco.id]?.length ?? 0) : 0;
  const emRiscoOuInativos = emRisco + f.inativo;
  const dadosFunil = [
    { name: "Potencial", value: f.potencial },
    { name: "Novo", value: f.novo },
    { name: "Recorrente", value: f.recorrente },
    { name: "Inativo", value: f.inativo },
  ];
  const nomeEstagio = new Map(estagios.map((e) => [e.id, e] as const));

  /**
   * O degrau da escada que a visão em LISTA usa para ordenar cada pessoa.
   *
   * É a mesma conta que o quadro faz para escolher a coluna do cartão
   * (`estagiosNaEscada[0]` quando o `estagioId` não resolve): sem isso, a
   * mesma pessoa aparece no começo do funil no quadro e no fim da tabela na
   * lista — duas respostas para "onde ela está" na mesma tela.
   *
   * Ordenar não é afirmar: a coluna "Estágio" da linha continua mostrando
   * "—" para quem o banco não sabe dizer. O lugar é o do começo do funil, que
   * é o que não afirma nada; o rótulo diz a verdade, que é não saber.
   */
  const degrauNaLista = (estagioId: string | null): number => {
    const estagio = nomeEstagio.get(estagioId ?? "");
    return ordemDaEtapa((estagio ?? estagiosNaEscada[0])?.chave);
  };

  const linkVisao = (v: string) =>
    `/crm?visao=${v}${q ? `&q=${encodeURIComponent(searchParams.q ?? "")}` : ""}${estagioFiltro ? `&estagio=${estagioFiltro}` : ""}`;

  // `searchParams.erro` NUNCA é renderizado direto — só o que a tabela
  // fechada acima reconhece (ver `mensagemDeErro`).
  const mensagemErro = mensagemDeErro(searchParams.erro);

  return (
    <>
      <PageHeader titulo="Central de Clientes" sub="Pipeline por estágio — do lead à recorrência">
        <div className="flex gap-1 rounded-lg border border-borda p-0.5">
          {(["kanban", "lista"] as const).map((v) => (
            <Link
              key={v}
              href={linkVisao(v)}
              className={cx(
                "rounded-md px-3 py-1.5 text-sm capitalize",
                visao === v ? "bg-primaria/15 font-medium text-primaria-2" : "text-texto-2 hover:text-texto"
              )}
            >
              {v}
            </Link>
          ))}
        </div>
      </PageHeader>

      {/* A recusa de `moverAlunoEstagio` volta aqui, em `?erro=<código>` —
          mesmo banner (e mesmo estilo) do portal do mentorado. A frase diz o
          que NÃO aconteceu, porque quem acabou de arrastar um card precisa
          saber que o card voltou para o lugar. */}
      {mensagemErro ? (
        <p className="mb-4 rounded-xl border border-negativo/40 bg-negativo/10 px-4 py-3 text-sm text-negativo">
          {mensagemErro}
        </p>
      ) : null}

      {/* A fila vem ANTES dos números. A pergunta que o dono faz ao abrir esta
          tela é "com quem eu falo agora", não "quantos alunos eu tenho" — e a
          ordem da tela é a resposta a essa pergunta. */}
      <div className="mb-4 grid gap-4 lg:grid-cols-[1fr_280px]">
        <CrmFila itens={fila} />
        <CrmWhatsapp
          inicial={agente}
          consultar={async () => {
            "use server";
            return estadoWhatsapp();
          }}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* Composição extraída de `funil` (src/lib/metrics.ts, linha 210):
            cada aluno cai em exatamente uma das quatro situações do funil,
            então as quatro contagens somam a base inteira. */}
        <Stat
          label="Base total"
          valor={String(alunos.length)}
          formato="numero"
          valorNumerico={alunos.length}
          composicao={{
            formula: "soma",
            partes: [
              { rotulo: "Potenciais (ainda não compraram)", valor: f.potencial },
              { rotulo: "Alunos novos (uma compra)", valor: f.novo },
              { rotulo: "Recorrentes (duas compras ou mais)", valor: f.recorrente },
              { rotulo: "Inativos", valor: f.inativo },
            ],
            nota: "Cada pessoa entra em uma única situação do funil, por isso as quatro linhas fecham a base. Os filtros de busca e de estágio desta tela não mexem neste número.",
          }}
          origem="listAlunos() classificado pela situação no funil, via funil() · base inteira, sem filtro de tela"
        />
        {/* `funil` (src/lib/metrics.ts, linha 210): ativo = quem já comprou e
            ainda não foi marcado como inativo = novo + recorrente. */}
        <Stat
          label="Alunos ativos"
          valor={String(ativos)}
          formato="numero"
          valorNumerico={ativos}
          composicao={{
            formula: "soma",
            partes: [
              { rotulo: "Alunos novos (uma compra)", valor: f.novo },
              { rotulo: "Recorrentes (duas compras ou mais)", valor: f.recorrente },
            ],
            nota: "Ativo aqui é quem já comprou e ainda não foi marcado como inativo. Potencial e inativo ficam de fora de propósito.",
          }}
          origem="listAlunos() → situações novo e recorrente do funil, via funil()"
        />
        {/* `statsAluno` (src/lib/metrics.ts, linha 223): ltv = soma do valor das
            matrículas com situação diferente de pendente. A média divide esse
            total pelo número de pessoas que têm ao menos uma compra. */}
        <Stat
          label="LTV médio"
          valor={fmtBRL(ltvMedio)}
          formato="moeda"
          valorNumerico={ltvMedio}
          composicao={
            compradores.length
              ? {
                  formula: "divisao",
                  partes: [
                    { rotulo: "Valor somado de todas as compras da base", valor: ltvTotal },
                    {
                      rotulo: "Pessoas com ao menos uma compra",
                      valor: compradores.length,
                      formato: "numero",
                    },
                  ],
                  nota: "Média por CLIENTE que comprou — quem nunca comprou não entra no divisor e não puxa a média para baixo. O valor é o bruto da venda: compra reembolsada continua somando e a taxa do gateway não é descontada.",
                }
              : "Ninguém na base tem compra registrada — sem cliente pagante não há LTV médio a calcular."
          }
          origem="listAlunos() cruzado com dataset().matriculas (situação diferente de pendente), via statsAluno"
        />
        {/* Soma de duas listas distintas: a coluna "Em risco" do pipeline e a
            situação inativo do funil. Menor é melhor → invertida. */}
        <Stat
          label="Em risco / inativos"
          valor={String(emRiscoOuInativos)}
          formato="numero"
          valorNumerico={emRiscoOuInativos}
          invertida
          composicao={
            estagioDeRisco
              ? {
                  formula: "soma",
                  partes: [
                    // O rótulo do BANCO, como no resto da tela: quem
                    // renomeou a coluna para "Risco de churn" lê o nome que
                    // escolheu, não o literal do código.
                    { rotulo: `No estágio ${estagioDeRisco.nome} do pipeline`, valor: emRisco },
                    { rotulo: "Marcados como inativos no funil", valor: f.inativo },
                  ],
                  nota: "Menor é melhor. A parcela do pipeline respeita os filtros de busca e estágio da tela; a de inativos vem sempre da base inteira — com filtro ligado, as duas olham recortes diferentes. Estágio é campo editável: se alguém for posto na coluna de risco e também marcado como inativo, aparece nas duas linhas.",
                }
              : // Sem coluna de risco no pipeline, a parcela do pipeline não
                // é zero — ela não existe. Escrever "No estágio Em risco do
                // pipeline 0" afirmaria duas coisas falsas de uma vez: que a
                // coluna existe e que está vazia.
                "Este pipeline não tem coluna de risco, então o número é só o de quem está marcado como inativo no funil."
          }
          origem="listAlunos(): coluna de chave em_risco no kanban (já filtrada) + situação inativo do funil, via funil()"
        />
      </div>

      {/* filtros + novo aluno */}
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card titulo="Filtros" className="lg:col-span-2">
          <form className="flex flex-wrap items-end gap-2" method="GET">
            <input type="hidden" name="visao" value={visao} />
            <Campo label="Buscar" className="min-w-[200px] flex-1">
              <Input name="q" defaultValue={searchParams.q ?? ""} placeholder="Nome ou telefone…" />
            </Campo>
            <Campo label="Estágio" className="min-w-[170px]">
              <Select name="estagio" defaultValue={estagioFiltro}>
                <option value="">Todos</option>
                {estagiosNaEscada.map((e) => (
                  <option key={e.id} value={e.id}>{e.nome}</option>
                ))}
              </Select>
            </Campo>
            <Botao tipo="fantasma">Filtrar</Botao>
          </form>
        </Card>
        <Card titulo="Funil (visão macro)">
          <GraficoFunil data={dadosFunil} />
        </Card>
      </div>

      <div className="mt-4">
        <PainelForm titulo="Cadastrar lead / aluno">
          <form action={criarAluno} className="grid gap-3 sm:grid-cols-2">
            <Campo label="Nome completo" className="sm:col-span-2">
              <Input name="nome" required placeholder="Nome do lead ou aluno" />
            </Campo>
            <Campo label="Telefone / WhatsApp">
              <Input name="telefone" placeholder="11 99999-9999" />
            </Campo>
            <Campo label="E-mail">
              <Input name="email" type="email" placeholder="email@exemplo.com" />
            </Campo>
            <Campo label="Situação">
              <Select name="statusFunil" defaultValue="potencial">
                {Object.entries(STATUS_FUNIL_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </Select>
            </Campo>
            <Campo label="Origem">
              <Input name="origem" placeholder="Instagram, indicação, YouTube…" />
            </Campo>
            <Campo label="Observações" className="sm:col-span-2">
              <TextArea name="observacoes" placeholder="Contexto, objetivo, restrições…" />
            </Campo>
            <div className="sm:col-span-2">
              <Botao>Salvar</Botao>
            </div>
          </form>
        </PainelForm>
      </div>

      <div className="mt-4">
        {visao === "kanban" ? (
          <KanbanCrm estagios={estagiosNaEscada} colunas={colunas} />
        ) : (
          <Card titulo={`Pessoas (${filtrados.length})`}>
            {filtrados.length ? (
              <Tabela>
                <thead>
                  <tr>
                    <Th>Nome</Th>
                    <Th>Estágio</Th>
                    <Th>Origem</Th>
                    <Th num>Compras</Th>
                    <Th num>LTV</Th>
                    <Th num>Últ. contato</Th>
                  </tr>
                </thead>
                <tbody>
                  {filtrados
                    .slice()
                    // A mesma escada do quadro (`ordenarPelaEscada`), pela
                    // mesma razão: as duas visões da mesma tela não podem
                    // discordar sobre a sequência do funil. Pessoa em estágio
                    // fora da escada vai para o fim, com o nome do banco na
                    // coluna "Estágio" — não some da lista. Empate resolvido
                    // pelo nome, para a lista não trocar de ordem sozinha
                    // entre duas aberturas.
                    .sort(
                      (a, b) =>
                        degrauNaLista(a.estagioId) - degrauNaLista(b.estagioId) ||
                        a.nome.localeCompare(b.nome, "pt-BR")
                    )
                    .map((a) => {
                      const st = statsAluno(porAluno.get(a.id) ?? []);
                      const e = nomeEstagio.get(a.estagioId ?? "");
                      const dias = diasSem(a.id);
                      return (
                        <tr key={a.id}>
                          <Td>
                            <Link className="font-medium hover:text-primaria-2" href={`/crm/${a.id}`}>
                              {a.nome}
                            </Link>
                          </Td>
                          <Td>
                            <Badge tom={(e?.cor as Tom) ?? "cinza"}>{e?.nome ?? "—"}</Badge>
                          </Td>
                          <Td className="text-texto-2">{a.origem || "—"}</Td>
                          <Td num>{st.compras}</Td>
                          <Td num>{fmtBRL(st.ltv)}</Td>
                          <Td num>{dias !== null ? `${dias}d` : "—"}</Td>
                        </tr>
                      );
                    })}
                </tbody>
              </Tabela>
            ) : (
              <Vazio>Ninguém encontrado com esses filtros.</Vazio>
            )}
          </Card>
        )}
      </div>
    </>
  );
}
