// Provider de dados apoiado na planilha Base_Financeira_Operacao.
//
// MODULO NEUTRO (sem diretiva de cliente): le a planilha pelo servidor e e
// consumido por Server Components. Um modulo marcado como cliente nao pode
// exportar valor de runtime lido por Server Component -- da "React Client
// Manifest" e 500 em runtime com o build verde.
//
// Duas regras governam este arquivo inteiro:
//
// 1. LEITURA NUNCA LANCA E NUNCA INVENTA. Aba vazia, aba inexistente, planilha
//    fora do ar: tudo devolve lista vazia. A planilha do dono esta hoje sem
//    linhas, e o comportamento correto e a tela aparecer vazia de verdade --
//    cair no dado de demonstracao faria o painel mostrar faturamento que nao
//    existe, que e o unico erro pior do que painel vazio.
//
// 2. ESCRITA LANCA QUANDO NAO DA PARA GRAVAR. O oposto da leitura, e de
//    proposito: uma insercao que falha em silencio deixa o usuario com a certeza
//    de que salvou. Onde a planilha nao tem aba ou coluna para representar a
//    operacao, o metodo lanca `Error` dizendo exatamente o que falta, em vez de
//    fingir sucesso.
//
// O QUE A PLANILHA NAO REPRESENTA (e por isso vira excecao ou lista vazia):
//  - VENDAS nao tem coluna de aluno nem de lancamento. A venda existe, mas nao
//    da para dizer QUEM comprou. `Matricula.alunoId` fica vazio, `getAluno`
//    devolve matriculas vazias e `isUpsell` e sempre falso.
//  - Nao existe aba de notas, transcricoes, orcamentos, turmas, tarefas de
//    turma, pontos de retencao nem pilares de video.
//  - CONFIG e somente leitura por decisao do contrato.

import {
  atualizarLinha,
  inserirLinhas,
  type RespostaEscrita,
} from "@/lib/sheets/escrever";
import { lerAbas, lerConfig } from "@/lib/sheets/ler";
import { escreverData, lerBooleano, lerDataOuNulo, lerNumero, normalizar } from "@/lib/sheets/parse";
import {
  ESTAGIOS_PLANILHA,
  afiliadoParaLinha,
  agrupamentoParaLinha,
  alunoParaLinha,
  atividadeParaLinha,
  campanhaParaLinha,
  celulaDe,
  configParaParametros,
  contaBancariaParaLinha,
  despesaParaLinha,
  envioParaLinha,
  etapaDoFunil,
  importacaoParaLinha,
  interacaoParaLinha,
  lancamentoParaLinha,
  linhaExtratoParaMovimento,
  linhaParaAfiliado,
  linhaParaAgrupamento,
  linhaParaAluno,
  linhaParaAtividade,
  linhaParaCampanha,
  linhaParaChargeback,
  linhaParaComissao,
  linhaParaContaBancaria,
  linhaParaConteudo,
  linhaParaConteudoMetrica,
  linhaParaDespesa,
  linhaParaDespesaDeTrafego,
  linhaParaEnvio,
  linhaParaImportacao,
  linhaParaInteracao,
  linhaParaLancamento,
  linhaParaMatricula,
  linhaParaMeta,
  linhaParaMovimentoCaixa,
  linhaParaMovimentoDeTrafego,
  linhaParaPagavel,
  linhaParaProduto,
  linhaParaRecebivel,
  linhaParaReuniao,
  linhaParaTarefa,
  metaParaLinha,
  movimentoCaixaParaLinha,
  parcelasDaForma,
  produtoParaLinha,
  resolverReferenciaDeAgrupamentos,
  reuniaoParaLinha,
  tarefaParaLinha,
} from "@/lib/sheets/mapear";
import type {
  AlunoDetalhe,
  DataProvider,
  LancamentoDetalhe,
  RegistroImportacao,
  ResultadoImportacao,
  ResultadoInteracoes,
} from "./provider";
import type {
  EnvioPendente,
  MensagemRecebida,
  ResultadoEnvio,
} from "@/lib/atendimento/contrato";
import { planejarRecepcao } from "@/lib/atendimento/recepcao";
import { podeGravarSozinha, sugerirEstagio } from "@/lib/atendimento/estagio";
import type { LinhaExtrato, OrigemExtrato } from "@/lib/extrato/extrato";
import type {
  Afiliado,
  Agrupamento,
  Aluno,
  Atividade,
  Aula,
  Campanha,
  Chargeback,
  Comissao,
  ContaBancaria,
  ConteudoMetrica,
  ConteudoView,
  DatasetCaixa,
  DatasetFinanceiro,
  Despesa,
  Encontro,
  Envio,
  Estagio,
  Interacao,
  Lancamento,
  Matricula,
  Meta,
  MetaFinanceira,
  Modulo,
  MovimentoCaixa,
  NovaConta,
  NovoAgrupamento,
  NovoEnvio,
  NovoProduto,
  NovoResponsavel,
  Pagavel,
  ParametrosFinanceiros,
  PerfilSocial,
  Produto,
  ProgressoAula,
  Recebivel,
  Reembolso,
  Reuniao,
  StatusFunil,
  Tarefa,
} from "../types";

// ============================================================
// Leitura crua
// ============================================================

/** Linhas de varias abas de uma vez. Aba com erro devolve array vazio. */
async function linhasDe(abas: string[]): Promise<Record<string, Record<string, string>[]>> {
  const mapa = await lerAbas(abas);
  const saida: Record<string, Record<string, string>[]> = {};
  for (const aba of abas) saida[aba] = mapa[aba]?.linhas ?? [];
  return saida;
}

/** Atalho para quando uma aba so basta. */
async function linhasDa(aba: string): Promise<Record<string, string>[]> {
  return (await linhasDe([aba]))[aba];
}

/** Descarta linhas sem ID: no CSV do gviz elas costumam ser sobra de formatacao. */
function comId(linhas: Record<string, string>[]): Record<string, string>[] {
  return linhas.filter((l) => celulaDe(l, "ID") !== "");
}

const porDataDesc = (a: { data: string }, b: { data: string }) => b.data.localeCompare(a.data);

/** Data ISO -> "dd/mm/aaaa", que e o formato que o Apps Script converte em Date. */
function dataCelula(iso: string | null | undefined): string {
  return iso ? escreverData(iso) : "";
}

// ============================================================
// Escrita: falha vira excecao
// ============================================================

/**
 * Converte `RespostaEscrita` com `ok: false` em excecao.
 *
 * A camada de escrita nunca lanca de proposito (ela e chamada por Server Action
 * e precisa devolver erro legivel). Aqui, no provider, o contrato e o oposto: o
 * `DataProvider` promete `Promise<void>`, e resolver a promessa depois de uma
 * falha significa dizer ao usuario que a venda foi salva quando ela nao foi.
 */
function exigirEscrita(resposta: RespostaEscrita, operacao: string): RespostaEscrita {
  if (!resposta.ok) {
    throw new Error(`${operacao} falhou: ${resposta.erro ?? "motivo nao informado pela planilha."}`);
  }
  return resposta;
}

/** Erro padronizado de operacao que a planilha simplesmente nao comporta. */
function naoRepresentavel(operacao: string, motivo: string): never {
  throw new Error(
    `${operacao} nao e possivel no modo planilha: ${motivo} ` +
      `Enquanto a aba/coluna nao existir, este dado so vive no banco relacional.`
  );
}

// ============================================================
// Indices de referencia entre abas
// ============================================================

/**
 * VENDAS guarda `Responsavel` e `Produto` como TEXTO, nao como id. Estes indices
 * fazem a ponte texto -> entidade, que e justamente o que `mapear.ts` nao faz
 * (ele e puro e nao le outras abas).
 */
type Indice = {
  produtoPorNome: Map<string, Produto>;
  afiliadoPorNome: Map<string, Afiliado>;
};

function indiceVazio(): Indice {
  return { produtoPorNome: new Map(), afiliadoPorNome: new Map() };
}

function montarIndice(
  produtos: Record<string, string>[],
  responsaveis: Record<string, string>[]
): Indice {
  const idx = indiceVazio();
  for (const l of comId(produtos)) {
    const p = linhaParaProduto(l);
    if (p.nome !== "") idx.produtoPorNome.set(normalizar(p.nome), p);
  }
  for (const l of comId(responsaveis)) {
    const a = linhaParaAfiliado(l);
    if (a.nome !== "") idx.afiliadoPorNome.set(normalizar(a.nome), a);
  }
  return idx;
}

// ============================================================
// VENDAS -> Matricula (com joins resolvidos)
// ============================================================

/** Agregado dos recebiveis de uma venda: decide `pago` x `pendente` e o liquido. */
type ResumoRecebiveis = { total: number; todosRecebidos: boolean };

function agruparRecebiveis(linhas: Record<string, string>[]): Map<string, ResumoRecebiveis> {
  const mapa = new Map<string, ResumoRecebiveis>();
  for (const l of comId(linhas)) {
    const idVenda = celulaDe(l, "ID_Venda");
    if (idVenda === "") continue;
    const r = linhaParaRecebivel(l);
    const atual = mapa.get(idVenda) ?? { total: 0, todosRecebidos: true };
    atual.total = +(atual.total + r.valor).toFixed(2);
    if (r.status !== "recebido") atual.todosRecebidos = false;
    mapa.set(idVenda, atual);
  }
  return mapa;
}

function montarMatriculas(
  vendas: Record<string, string>[],
  recebiveis: Record<string, string>[],
  idx: Indice
): Matricula[] {
  const resumo = agruparRecebiveis(recebiveis);

  return comId(vendas).map((linha) => {
    const agregado = resumo.get(celulaDe(linha, "ID"));
    const m = linhaParaMatricula(linha, {
      // Venda SEM nenhum recebivel cadastrado conta como quitada.
      // "Todos os recebiveis foram recebidos" e verdade vazia quando nao ha
      // nenhum, e a alternativa seria pior: `pendente` some do faturamento
      // (metrics.ts descarta pendente), entao uma venda fechada de verdade
      // desapareceria da receita so porque falta a linha da parcela.
      todosRecebidos: agregado ? agregado.todosRecebidos : true,
      liquidoDosRecebiveis: agregado?.total,
    });

    const produto = m.produtoNome ? idx.produtoPorNome.get(normalizar(m.produtoNome)) : undefined;
    const afiliado = m.afiliadoNome
      ? idx.afiliadoPorNome.get(normalizar(m.afiliadoNome))
      : undefined;

    return {
      ...m,
      produtoId: produto?.id ?? "",
      afiliadoId: afiliado?.id ?? null,
      // O braco da venda e herdado do responsavel: VENDAS nao tem coluna de braco
      // e o responsavel e o unico vinculo estrutural que a linha carrega.
      braco: afiliado?.braco ?? null,
      // `alunoNome` fica vazio de proposito: VENDAS nao tem coluna de aluno.
      alunoNome: "",
    };
  });
}

/** Comissoes registradas na coluna `Comissao` de VENDAS. */
function montarComissoes(vendas: Record<string, string>[], idx: Indice): Comissao[] {
  const saida: Comissao[] = [];
  for (const linha of comId(vendas)) {
    const c = linhaParaComissao(linha);
    if (!c) continue;
    const nome = celulaDe(linha, "Responsavel");
    const afiliado = nome ? idx.afiliadoPorNome.get(normalizar(nome)) : undefined;
    saida.push({ ...c, afiliadoId: afiliado?.id ?? "" });
  }
  return saida;
}

/**
 * Reembolsos reconstruidos a partir do `Status` da venda.
 *
 * Nao ha aba de reembolsos. Sem esta reconstrucao o estorno viraria zero, e
 * `metrics.ts` conta a venda reembolsada no faturamento bruto justamente porque
 * espera ver o estorno do outro lado -- o lucro sairia inflado exatamente pelo
 * valor devolvido. A DATA e a da venda, porque a planilha nao guarda a data do
 * reembolso: o valor fica certo, o mes pode ficar deslocado, e essa e a perda
 * assumida. Vale tambem para `cancelada`, que o contrato manda ler como
 * reembolso por falta de `cancelado` em `StatusPagamento`.
 */
function montarReembolsos(matriculas: Matricula[]): Reembolso[] {
  return matriculas
    .filter((m) => m.statusPagamento === "reembolsado")
    .map((m) => ({
      id: `REE-${m.id}`,
      matriculaId: m.id,
      valor: m.valor,
      data: m.data,
      motivo: "",
    }));
}

// ============================================================
// Despesas: DESPESAS + INVESTIMENTO
// ============================================================

/**
 * A lista de despesas soma DESPESAS e INVESTIMENTO.
 *
 * Para o sistema, midia e custo; a planilha e que separa as duas coisas em abas
 * diferentes. RISCO CONHECIDO: se o dono lancar o mesmo gasto de trafego nas
 * duas abas, ele conta duas vezes. A alternativa (ignorar INVESTIMENTO) zeraria
 * o CAC e o ROAS, que sao o motivo de a aba existir -- entao a escolha e somar e
 * registrar o risco.
 */
function montarDespesas(
  despesas: Record<string, string>[],
  investimento: Record<string, string>[]
): Despesa[] {
  return [
    ...comId(despesas).map(linhaParaDespesa),
    ...comId(investimento).map(linhaParaDespesaDeTrafego),
  ].sort(porDataDesc);
}

// ============================================================
// P2 — fontes de renda: trilha do produto (MODULOS, AULAS, PROGRESSO) e
// presença nos encontros da turma (ENCONTROS).
//
// Nenhuma das quatro abas existe na planilha hoje. `lerAba` ja devolve lista
// vazia para aba inexistente (ver cabecalho de ler.ts), entao os metodos
// abaixo ficam vazios sem lançar erro ate o dia em que alguem criar as abas —
// e nesse dia o mapeamento ja esta pronto, sem mexer no contrato do provider.
// ============================================================

/** "video" | "texto" | "ao_vivo" | "tarefa" -- vazio ou desconhecido cai em "video". */
function tipoAulaDeTexto(valor: string): Aula["tipo"] {
  const chave = normalizar(valor).replace(/\s+/g, "_");
  if (chave === "texto" || chave === "ao_vivo" || chave === "tarefa") return chave;
  return "video";
}

/** "dd/mm/aaaa hh:mm" ou ISO com T vira ISO cru; celula vazia vira null. */
function dataHoraOuNula(celula: string): string | null {
  if (celula === "") return null;
  return celula.includes("T") ? celula : lerDataOuNulo(celula);
}

function linhaParaModulo(l: Record<string, string>): Modulo {
  return {
    id: celulaDe(l, "ID"),
    produtoId: celulaDe(l, "ID_Produto"),
    nome: celulaDe(l, "Nome"),
    ordem: lerNumero(celulaDe(l, "Ordem")),
    descricao: celulaDe(l, "Descricao"),
  };
}

function linhaParaAula(l: Record<string, string>): Aula {
  return {
    id: celulaDe(l, "ID"),
    moduloId: celulaDe(l, "ID_Modulo"),
    produtoId: celulaDe(l, "ID_Produto"),
    titulo: celulaDe(l, "Titulo"),
    ordem: lerNumero(celulaDe(l, "Ordem")),
    duracaoMin: lerNumero(celulaDe(l, "Duracao_min")),
    tipo: tipoAulaDeTexto(celulaDe(l, "Tipo")),
  };
}

function linhaParaProgressoAula(l: Record<string, string>): ProgressoAula {
  return {
    id: celulaDe(l, "ID"),
    alunoId: celulaDe(l, "ID_Aluno"),
    aulaId: celulaDe(l, "ID_Aula"),
    produtoId: celulaDe(l, "ID_Produto"),
    concluida: lerBooleano(celulaDe(l, "Concluida")),
    concluidaEm: dataHoraOuNula(celulaDe(l, "Concluida_em")),
    minutosAssistidos: lerNumero(celulaDe(l, "Minutos_assistidos")),
  };
}

/** ENCONTROS guarda a presença como uma lista de IDs de aluno na mesma célula. */
function linhaParaEncontro(l: Record<string, string>): Encontro {
  const presentes = celulaDe(l, "Presentes");
  return {
    id: celulaDe(l, "ID"),
    turmaId: celulaDe(l, "ID_Turma"),
    titulo: celulaDe(l, "Titulo"),
    data: dataHoraOuNula(celulaDe(l, "Data")) ?? "",
    presentes: presentes === "" ? [] : presentes.split(/[,;]+/).map((id) => id.trim()).filter(Boolean),
  };
}

// ============================================================
// Provider
// ============================================================

// ============================================================
// Memoria curta dos leads recem-criados
// ============================================================
//
// O PROBLEMA QUE ELA RESOLVE
// --------------------------
// A leitura da planilha passa pelo endpoint publico do Google (gviz), que
// serve COPIA EM CACHE. Uma linha inserida agora demora para aparecer ali.
// Isso ja tinha mordido no cadastro de conta bancaria, e mordeu de novo aqui,
// pior: o agente reenvia o mesmo lote quando a gravacao falha, e a cada
// tentativa a releitura nao enxergava o lead criado na tentativa anterior --
// entao criava outro. Quatro tentativas, quatro fichas da mesma pessoa.
//
// POR QUE UMA MEMORIA E NAO UMA RELEITURA
// ---------------------------------------
// Nao adianta ler de novo: o cache e do Google, nao nosso. Quem sabe que o
// lead existe e quem acabou de cria-lo. Entao ele anota, por alguns minutos, o
// par telefone -> id. Nao e banco nem verdade: e uma lembranca de curto prazo
// que so serve para NAO duplicar. Se o processo morrer, ou se outra instancia
// atender a proxima tentativa, o pior caso e voltar ao comportamento antigo --
// nunca pior que ele.
const LEAD_LEMBRADO_MS = 10 * 60 * 1000;
const leadsRecemCriados = new Map<string, { id: string; telefone: string; em: number }>();

function lembrarLead(chave: string, id: string, telefone: string): void {
  if (chave === "" || id === "") return;
  leadsRecemCriados.set(chave, { id, telefone, em: Date.now() });
}

/** Os que ainda valem, ja limpando os vencidos para o mapa nao crescer sem fim. */
function leadsLembrados(): { id: string; telefone: string }[] {
  const agora = Date.now();
  const vivos: { id: string; telefone: string }[] = [];
  for (const [chave, v] of leadsRecemCriados) {
    if (agora - v.em > LEAD_LEMBRADO_MS) leadsRecemCriados.delete(chave);
    else vivos.push({ id: v.id, telefone: v.telefone });
  }
  return vivos;
}

const ABAS_DATASET = ["VENDAS", "RECEBIVEIS", "DESPESAS", "INVESTIMENTO", "PRODUTOS", "RESPONSAVEIS"];
const ABAS_CAIXA = ["CONTAS", "MOVIMENTOS", "RECEBIVEIS", "DESPESAS", "INVESTIMENTO", "CHARGEBACKS"];

export const sheetsProvider: DataProvider = {
  modo: "planilha",

  // ---------- nucleo v1 ----------

  async listAfiliados(): Promise<Afiliado[]> {
    const linhas = await linhasDa("RESPONSAVEIS");
    return comId(linhas).map(linhaParaAfiliado);
  },

  async listAlunos(): Promise<Aluno[]> {
    const linhas = await linhasDa("ALUNOS");
    return comId(linhas)
      .map(linhaParaAluno)
      .sort((a, b) => a.nome.localeCompare(b.nome));
  },

  async getAluno(id: string): Promise<AlunoDetalhe | null> {
    const linhas = await linhasDa("ALUNOS");
    const linha = comId(linhas).find((l) => celulaDe(l, "ID") === id);
    if (!linha) return null;
    // Matriculas vazias NAO e omissao: VENDAS nao tem coluna de aluno, entao nao
    // existe forma de dizer quais vendas sao desta pessoa sem inventar o vinculo.
    return { aluno: linhaParaAluno(linha), matriculas: [] };
  },

  async listProdutos(): Promise<Produto[]> {
    const linhas = await linhasDa("PRODUTOS");
    return comId(linhas).map(linhaParaProduto);
  },

  async listMatriculas(): Promise<Matricula[]> {
    const abas = await linhasDe(["VENDAS", "RECEBIVEIS", "PRODUTOS", "RESPONSAVEIS"]);
    const idx = montarIndice(abas.PRODUTOS, abas.RESPONSAVEIS);
    return montarMatriculas(abas.VENDAS, abas.RECEBIVEIS, idx).sort(porDataDesc);
  },

  async listDespesas(): Promise<Despesa[]> {
    const abas = await linhasDe(["DESPESAS", "INVESTIMENTO"]);
    return montarDespesas(abas.DESPESAS, abas.INVESTIMENTO);
  },

  async listLancamentos(): Promise<Lancamento[]> {
    const linhas = await linhasDa("LANCAMENTOS");
    return comId(linhas)
      .map(linhaParaLancamento)
      .sort((a, b) => b.inicio.localeCompare(a.inicio));
  },

  async getLancamento(id: string): Promise<LancamentoDetalhe | null> {
    const abas = await linhasDe(["LANCAMENTOS", "PRODUTOS"]);
    const linha = comId(abas.LANCAMENTOS).find((l) => celulaDe(l, "ID") === id);
    if (!linha) return null;

    const lancamento = linhaParaLancamento(linha);
    const produto =
      comId(abas.PRODUTOS)
        .map(linhaParaProduto)
        .find((p) => p.id === lancamento.produtoId) ?? null;

    return {
      lancamento,
      produto,
      // Turmas, tarefas de turma e resumos de call nao tem aba. Matriculas
      // tambem ficam vazias: VENDAS nao tem coluna ID_Lancamento, entao nao ha
      // como saber quais vendas pertencem a esta janela.
      turmas: [],
      matriculas: [],
      tarefas: [],
      calls: [],
      reembolsos: [],
    };
  },

  async dataset(): Promise<DatasetFinanceiro> {
    const abas = await linhasDe(ABAS_DATASET);
    const idx = montarIndice(abas.PRODUTOS, abas.RESPONSAVEIS);
    const matriculas = montarMatriculas(abas.VENDAS, abas.RECEBIVEIS, idx);
    return {
      matriculas,
      despesas: montarDespesas(abas.DESPESAS, abas.INVESTIMENTO),
      comissoes: montarComissoes(abas.VENDAS, idx),
      reembolsos: montarReembolsos(matriculas),
    };
  },

  async addDespesa(d): Promise<void> {
    exigirEscrita(
      await inserirLinhas("DESPESAS", [
        {
          ...despesaParaLinha({ id: "", ...d }),
          // Sem vencimento a linha nunca aparece em contas a pagar. A data de
          // competencia e a unica data que o formulario informa, entao ela vale
          // tambem como vencimento; `Status` fica vazio (= a vencer) porque
          // marcar "Pago" afirmaria uma saida de caixa que ninguem confirmou.
          Vencimento: dataCelula(d.data),
        },
      ]),
      "cadastro de despesa"
    );
  },

  async addAluno(a): Promise<void> {
    const estagio = ESTAGIOS_PLANILHA.find((e) => e.funil === a.statusFunil) ?? ESTAGIOS_PLANILHA[0];
    const aluno: Aluno = {
      id: "", // o Apps Script gera o ID; mandar vazio e o combinado
      nome: a.nome,
      telefone: a.telefone,
      email: a.email,
      statusFunil: a.statusFunil,
      estagioId: estagio.id,
      origem: a.origem,
      primeiroContato: new Date().toISOString().slice(0, 10),
      observacoes: a.observacoes,
    };
    exigirEscrita(await inserirLinhas("ALUNOS", [alunoParaLinha(aluno)]), "cadastro de aluno");
  },

  async setStatusAluno(id: string, status: StatusFunil): Promise<void> {
    const etapa = etapaDoFunil(status);
    if (etapa === null) {
      // `recorrente` e CALCULADO pela contagem de matriculas, nunca digitado.
      // Gravar a etapa congelaria um estado que o proprio dado deve produzir.
      naoRepresentavel(
        "Marcar o aluno como recorrente",
        "o status `recorrente` e derivado da segunda compra do aluno em VENDAS e nao tem etapa correspondente na planilha."
      );
    }
    exigirEscrita(
      await atualizarLinha("ALUNOS", id, { "Etapa/Status": etapa }),
      "atualizacao de status do aluno"
    );
  },

  async addLancamento(l): Promise<void> {
    exigirEscrita(
      await inserirLinhas("LANCAMENTOS", [
        lancamentoParaLinha({ id: "", status: "planejado", ...l }),
      ]),
      "cadastro de lancamento"
    );
  },

  async addMatricula(nova): Promise<void> {
    const abas = await linhasDe(["PRODUTOS", "RESPONSAVEIS", "ALUNOS"]);

    const produto = comId(abas.PRODUTOS)
      .map(linhaParaProduto)
      .find((p) => p.id === nova.produtoId);
    const afiliado = comId(abas.RESPONSAVEIS)
      .map(linhaParaAfiliado)
      .find((a) => a.id === nova.afiliadoId);

    const valor = nova.valor || produto?.precoBase || 0;
    const parcelas = parcelasDaForma(nova.formaPgto);

    // A venda entra em VENDAS...
    const insercao = exigirEscrita(
      await inserirLinhas("VENDAS", [
        {
          ID: "",
          Data: dataCelula(nova.data),
          Responsavel: afiliado?.nome ?? "",
          Produto: produto?.nome ?? "",
          "Canal de origem": "sistema",
          "Valor da venda": valor,
          "Forma de pagamento": formaDaPlanilha(nova.formaPgto),
          "N de parcelas": parcelas,
          Comissao: afiliado ? +((valor * afiliado.pctPadrao) / 100).toFixed(2) : 0,
          Status: "fechada",
        },
      ]),
      "registro da venda"
    );

    const idVenda = insercao.ids?.[0] ?? "";
    if (idVenda === "") {
      throw new Error(
        "a venda foi gravada mas a planilha nao devolveu o ID da linha; " +
          "sem ele nao da para criar os recebiveis e a conferencia `vendas x recebiveis (=0)` abriria."
      );
    }

    // ...e os recebiveis na MESMA operacao, somando exatamente o valor da venda.
    // E a invariante 4 do contrato: a conferencia do PAINEL tem que continuar
    // fechando depois de qualquer escrita do sistema.
    exigirEscrita(
      await inserirLinhas("RECEBIVEIS", parcelasDaVenda(idVenda, nova, valor, parcelas, afiliado?.nome ?? "")),
      "criacao dos recebiveis da venda"
    );

    // A unica forma de ligar a venda ao aluno: VENDAS nao tem coluna de aluno,
    // entao o vinculo fica na linha do tempo dele.
    const aluno = comId(abas.ALUNOS)
      .map(linhaParaAluno)
      .find((a) => a.id === nova.alunoId);
    if (aluno) {
      await inserirLinhas("ATIVIDADES", [
        atividadeParaLinha({
          id: "",
          alunoId: aluno.id,
          tipo: "compra",
          titulo: `Compra — ${produto?.nome ?? "produto"}`,
          detalhe: `R$ ${valor.toFixed(2).replace(".", ",")} (venda ${idVenda})`,
          data: new Date().toISOString(),
        }),
      ]);
    }
  },

  async toggleTarefa(): Promise<void> {
    naoRepresentavel(
      "Concluir tarefa de turma",
      "nao existe aba de turmas nem de tarefas por aluno; a aba TAREFAS guarda tarefas do time, que sao concluidas por `concluirTarefa`."
    );
  },

  async addReembolso(r): Promise<void> {
    // A planilha nao tem aba de reembolso: o registro possivel e mudar o status
    // da venda. Valor parcial, motivo e data do estorno se perdem -- o sistema
    // passa a tratar a venda inteira como devolvida na data da venda.
    exigirEscrita(
      await atualizarLinha("VENDAS", r.matriculaId, { Status: "reembolsada" }),
      "registro do reembolso"
    );
  },

  // ---------- cadastro base: produto, responsável e conta ----------

  async addProduto(p: NovoProduto): Promise<void> {
    exigirEscrita(
      await inserirLinhas("PRODUTOS", [produtoParaLinha({ id: "", ...p })]),
      "cadastro de produto"
    );
  },

  async addResponsavel(r: NovoResponsavel): Promise<void> {
    exigirEscrita(
      await inserirLinhas("RESPONSAVEIS", [
        afiliadoParaLinha({
          id: "",
          nome: r.nome,
          braco: r.braco,
          pctPadrao: r.comissaoPadrao,
          ativo: true,
          metaMensal: r.metaMensal,
        }),
      ]),
      "cadastro de responsavel"
    );
  },

  async addConta(c: NovaConta): Promise<string> {
    const resposta = exigirEscrita(
      await inserirLinhas("CONTAS", [
        contaBancariaParaLinha({
          id: "",
          nome: c.nome,
          tipo: c.tipo,
          saldoInicial: c.saldoInicial,
          dataSaldoInicial: new Date().toISOString().slice(0, 10),
          ativa: true,
          braco: c.braco ?? null,
        }),
      ]),
      "cadastro de conta"
    );

    // Quem sabe o id e quem gravou. Reler a planilha aqui para descobrir o id
    // NAO funciona: a leitura passa pelo endpoint publico do Google, que serve
    // uma copia em cache e leva um tempo ate enxergar a linha recem-inserida --
    // foi exatamente assim que a tela de importacao de extrato quebrou em
    // producao na primeira versao.
    const id = resposta.ids?.[0] ?? "";
    if (id === "") {
      throw new Error(
        "a conta foi gravada mas a planilha nao devolveu o ID da linha; " +
          "sem ele nao da para selecionar a conta na tela nem lancar movimento nela."
      );
    }
    return id;
  },

  // ---------- cadastro OPCIONAL de agrupamento ----------

  async listAgrupamentos(): Promise<Agrupamento[]> {
    const linhas = await linhasDa("AGRUPAMENTOS");
    return comId(linhas)
      .map(linhaParaAgrupamento)
      .sort((a, b) => a.ordem - b.ordem);
  },

  async addAgrupamento(a: NovoAgrupamento): Promise<void> {
    exigirEscrita(
      await inserirLinhas("AGRUPAMENTOS", [
        agrupamentoParaLinha({ id: "", nome: a.nome, cor: a.cor, ordem: a.ordem ?? 0, ativo: true }),
      ]),
      "cadastro de agrupamento"
    );
  },

  // ---------- CRM ----------

  async listEstagios(): Promise<Estagio[]> {
    // Os estagios sao do contrato, nao da planilha: a coluna `Etapa/Status`
    // guarda o NOME da etapa e a lista de validacao vive em CONFIG.
    return [...ESTAGIOS_PLANILHA];
  },

  async setEstagioAluno(alunoId: string, estagio: Estagio): Promise<void> {
    exigirEscrita(
      await atualizarLinha("ALUNOS", alunoId, { "Etapa/Status": estagio.nome }),
      "mudanca de estagio do aluno"
    );
  },

  async listNotas(): Promise<[]> {
    return [];
  },

  async addNota(): Promise<void> {
    naoRepresentavel(
      "Salvar nota do aluno",
      "nao existe aba de notas na planilha. O registro equivalente e uma atividade do tipo `nota`, gravada em ATIVIDADES."
    );
  },

  async listAtividades(alunoId?: string): Promise<Atividade[]> {
    const linhas = await linhasDa("ATIVIDADES");
    const todas = comId(linhas).map(linhaParaAtividade);
    const filtradas = alunoId ? todas.filter((a) => a.alunoId === alunoId) : todas;
    return filtradas.sort((a, b) => b.data.localeCompare(a.data));
  },

  async addAtividade(a): Promise<void> {
    exigirEscrita(
      await inserirLinhas("ATIVIDADES", [
        atividadeParaLinha({ id: "", ...a, data: new Date().toISOString() }),
      ]),
      "registro de atividade"
    );
  },

  async listTarefas(): Promise<Tarefa[]> {
    const linhas = await linhasDa("TAREFAS");
    return comId(linhas)
      .map(linhaParaTarefa)
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === "pendente" ? -1 : 1;
        return (a.prazo ?? "9999").localeCompare(b.prazo ?? "9999");
      });
  },

  async addTarefaGestao(t): Promise<void> {
    exigirEscrita(
      await inserirLinhas("TAREFAS", [tarefaParaLinha({ id: "", status: "pendente", ...t })]),
      "cadastro de tarefa"
    );
  },

  async concluirTarefa(id: string): Promise<void> {
    // Le antes de escrever porque a operacao ALTERNA o status, e alternar exige
    // saber o valor atual -- a planilha nao tem "inverter celula".
    const linhas = await linhasDa("TAREFAS");
    const linha = comId(linhas).find((l) => celulaDe(l, "ID") === id);
    if (!linha) throw new Error(`tarefa ${id} nao encontrada na aba TAREFAS.`);

    const atual = linhaParaTarefa(linha);
    const novo = atual.status === "pendente" ? "Concluida" : "Pendente";
    exigirEscrita(await atualizarLinha("TAREFAS", id, { Status: novo }), "conclusao de tarefa");
  },

  // ---------- reunioes e transcricoes ----------

  async listReunioes(): Promise<Reuniao[]> {
    const linhas = await linhasDa("REUNIOES");
    return comId(linhas)
      .map(linhaParaReuniao)
      .sort((a, b) => a.inicio.localeCompare(b.inicio));
  },

  async addReuniao(r): Promise<Reuniao> {
    const nova: Reuniao = {
      id: "",
      titulo: r.titulo,
      inicio: r.inicio,
      fim: r.fim,
      comQuem: r.comQuem,
      alunoId: r.alunoId,
      lancamentoId: r.lancamentoId,
      turmaId: r.turmaId,
      status: "agendada",
      link: r.linkExterno ?? r.link ?? "",
      // A aba nao tem coluna de evento do Google: a sincronizacao com a agenda
      // fica de mao unica (o sistema cria o evento e depois nao o reconhece).
      googleEventId: r.googleEventId ?? "",
    };
    const resposta = exigirEscrita(
      await inserirLinhas("REUNIOES", [reuniaoParaLinha(nova)]),
      "agendamento de reuniao"
    );
    return { ...nova, id: resposta.ids?.[0] ?? "" };
  },

  async listTranscricoes(): Promise<[]> {
    return [];
  },

  async addTranscricao(): Promise<void> {
    naoRepresentavel(
      "Salvar transcricao de reuniao",
      "nao existe aba de transcricoes, e o texto integral de uma call nao cabe em celula de planilha."
    );
  },

  // ---------- financeiro avancado ----------

  async listOrcamentos(): Promise<[]> {
    return [];
  },

  async setOrcamento(): Promise<void> {
    naoRepresentavel(
      "Definir orcamento por categoria",
      "nao existe aba de orcamentos. METAS guarda meta de resultado (faturamento, lucro, vendas), nao teto de gasto por categoria."
    );
  },

  async listMetasFinanceiras(): Promise<MetaFinanceira[]> {
    const metas = await lerMetas(await linhasDa("METAS"));
    // MetaFinanceira e o subconjunto monetario de Meta; os demais indicadores
    // (vendas, roas, cac) nao cabem no tipo e ficam fora sem virar zero.
    return metas
      .filter((m) => m.indicador === "faturamento" || m.indicador === "lucro")
      .map((m) => ({
        id: m.id,
        tipo: m.indicador === "lucro" ? "lucro" : "faturamento",
        periodo: m.periodo,
        alvo: m.valor,
      }));
  },

  async setMetaFinanceira(tipo, periodo, alvo): Promise<void> {
    await gravarMeta({ indicador: tipo, escopo: "global", escopoRef: null, periodo, valor: alvo });
  },

  // ---------- metas e webhooks ----------

  async listMetas(): Promise<Meta[]> {
    return lerMetas(await linhasDa("METAS"));
  },

  async setMeta(m): Promise<void> {
    await gravarMeta(m);
  },

  async listEventosWebhook(): Promise<[]> {
    // Webhook e evento de gateway; a planilha nao recebe webhook nenhum.
    return [];
  },

  // ---------- camada de caixa ----------

  async listContasBancarias(): Promise<ContaBancaria[]> {
    const linhas = await linhasDa("CONTAS");
    return comId(linhas).map(linhaParaContaBancaria);
  },

  async listMovimentosCaixa(): Promise<MovimentoCaixa[]> {
    const abas = await linhasDe(["MOVIMENTOS", "INVESTIMENTO"]);
    return montarMovimentos(abas.MOVIMENTOS, abas.INVESTIMENTO);
  },

  async addMovimentoCaixa(m): Promise<void> {
    exigirEscrita(
      await inserirLinhas("MOVIMENTOS", [movimentoCaixaParaLinha({ id: "", ...m })]),
      "registro de movimento de caixa"
    );
  },

  async listRecebiveis(): Promise<Recebivel[]> {
    const abas = await linhasDe(["RECEBIVEIS", "RESPONSAVEIS"]);
    return montarRecebiveis(abas.RECEBIVEIS, abas.RESPONSAVEIS);
  },

  async baixarRecebivel(id: string, dataRecebimento: string): Promise<void> {
    // ATUALIZA a linha existente. Inserir uma linha nova aqui duplicaria o
    // recebivel e abriria a conferencia `vendas x recebiveis (=0)`.
    exigirEscrita(
      await atualizarLinha("RECEBIVEIS", id, {
        Status: "Recebido",
        "Data recebimento": dataCelula(dataRecebimento),
      }),
      "baixa do recebivel"
    );
  },

  async listPagaveis(): Promise<Pagavel[]> {
    const linhas = await linhasDa("DESPESAS");
    return comId(linhas)
      .map((l) => linhaParaPagavel(l))
      .sort((a, b) => a.vencimento.localeCompare(b.vencimento));
  },

  async baixarPagavel(id: string, dataPagamento: string): Promise<void> {
    exigirEscrita(
      await atualizarLinha("DESPESAS", id, {
        Status: "Pago",
        "Data pagamento": dataCelula(dataPagamento),
      }),
      "baixa da conta a pagar"
    );
  },

  async listChargebacks(): Promise<Chargeback[]> {
    const linhas = await linhasDa("CHARGEBACKS");
    return comId(linhas).map(linhaParaChargeback).sort(porDataDesc);
  },

  async getParametrosFinanceiros(): Promise<ParametrosFinanceiros> {
    const { parametros } = await lerConfig();
    return configParaParametros(parametros);
  },

  async setParametrosFinanceiros(): Promise<void> {
    // CONFIG esta na lista de abas proibidas do contrato, e nao por comodidade:
    // aliquota, regime e reserva minima sao a ancora de break-even, runway e
    // provisao de imposto. Robo escrevendo ali e a diferenca entre um erro de
    // digitacao e um break-even calculado errado o trimestre inteiro.
    naoRepresentavel(
      "Alterar os parametros financeiros",
      "a aba CONFIG e somente leitura por decisao do contrato -- ela e editada a mao pelo dono da planilha."
    );
  },

  async datasetCaixa(): Promise<DatasetCaixa> {
    const [abas, config] = await Promise.all([linhasDe(ABAS_CAIXA), lerConfig()]);
    return {
      contas: comId(abas.CONTAS).map(linhaParaContaBancaria),
      movimentos: montarMovimentos(abas.MOVIMENTOS, abas.INVESTIMENTO),
      // Sem RESPONSAVEIS no pacote de caixa: o braco do recebivel exigiria uma
      // sexta aba so para preencher um campo opcional.
      recebiveis: montarRecebiveis(abas.RECEBIVEIS, []),
      pagaveis: comId(abas.DESPESAS).map((l) => linhaParaPagavel(l)),
      chargebacks: comId(abas.CHARGEBACKS).map(linhaParaChargeback),
      parametros: configParaParametros(config.parametros),
    };
  },

  // ---------- importacao de extrato bancario: livro-razao de procedencia ----------

  async listImportacoes(): Promise<RegistroImportacao[]> {
    const linhas = await linhasDa("IMPORTACOES");
    return comId(linhas).map(linhaParaImportacao).sort(porDataDesc);
  },

  async importarExtrato(
    linhas: LinhaExtrato[],
    contaId: string,
    origem: OrigemExtrato
  ): Promise<ResultadoImportacao> {
    if (linhas.length === 0) return { gravadas: 0, ignoradas: 0, digitaisIgnoradas: [] };

    // a. digitais ja registradas
    const existentes = await digitaisImportadas();

    // b. descarta as repetidas, contando quantas
    const novas = linhas.filter((l) => !existentes.has(l.impressaoDigital));
    const digitaisIgnoradas = linhas
      .filter((l) => existentes.has(l.impressaoDigital))
      .map((l) => l.impressaoDigital);

    if (novas.length === 0) {
      return { gravadas: 0, ignoradas: digitaisIgnoradas.length, digitaisIgnoradas };
    }

    // c. grava em MOVIMENTOS e registra a procedencia em IMPORTACOES.
    // Insercao em LOTE (nao uma chamada por linha) para o array `ids` da
    // resposta vir na MESMA ordem de `novas` -- e assim casar cada movimento
    // com o registro de importacao correspondente.
    const insercaoMovimentos = exigirEscrita(
      await inserirLinhas(
        "MOVIMENTOS",
        novas.map((l) => movimentoCaixaParaLinha({ id: "", ...linhaExtratoParaMovimento(l, contaId) }))
      ),
      "registro dos movimentos do extrato"
    );

    const idsMovimentos = insercaoMovimentos.ids ?? [];
    if (idsMovimentos.length !== novas.length) {
      throw new Error(
        "o extrato foi gravado em MOVIMENTOS mas a planilha nao devolveu um ID por linha; " +
          "sem o ID de cada movimento nao da para registrar a procedencia em IMPORTACOES."
      );
    }

    const agora = new Date().toISOString();
    exigirEscrita(
      await inserirLinhas(
        "IMPORTACOES",
        novas.map((l, i) =>
          importacaoParaLinha({
            id: "",
            impressaoDigital: l.impressaoDigital,
            data: l.data,
            descricao: l.descricao,
            valor: l.valor,
            tipo: l.tipo,
            documento: l.documento,
            origem,
            contaId,
            movimentoId: idsMovimentos[i],
            importadoEm: agora,
          })
        )
      ),
      "registro da procedencia da importacao"
    );

    // d. gravadas, ignoradas e as digitais ignoradas
    return { gravadas: novas.length, ignoradas: digitaisIgnoradas.length, digitaisIgnoradas };
  },

  // ---------- conteudo e redes ----------

  async listPerfisSociais(): Promise<PerfilSocial[]> {
    const linhas = await linhasDa("CONTEUDOS");
    return perfisDeConteudos(linhas);
  },

  async listConteudos(): Promise<ConteudoView[]> {
    const linhas = await linhasDa("CONTEUDOS");
    return comId(linhas)
      .map((l) => ({ ...linhaParaConteudo(l), metrica: linhaParaConteudoMetrica(l) }))
      .sort((a, b) => b.publicadoEm.localeCompare(a.publicadoEm));
  },

  async getConteudo(id: string) {
    const linhas = await linhasDa("CONTEUDOS");
    const linha = comId(linhas).find((l) => celulaDe(l, "ID") === id);
    if (!linha) return null;

    const conteudo = linhaParaConteudo(linha);
    const metrica: ConteudoMetrica = linhaParaConteudoMetrica(linha);
    return {
      conteudo,
      metrica,
      // A planilha guarda o RESULTADO do conteudo, nao a analise dele: curva de
      // retencao e pilares sao leitura do sistema e nao tem coluna.
      retencao: [],
      pilares: [],
    };
  },

  async setPilar(): Promise<void> {
    naoRepresentavel(
      "Salvar analise de pilar do video",
      "CONTEUDOS guarda as metricas da plataforma, e nao ha colunas para gancho, desenvolvimento e CTA."
    );
  },

  async listCampanhas(): Promise<Campanha[]> {
    const linhas = await linhasDa("CAMPANHAS");
    return comId(linhas)
      .map(linhaParaCampanha)
      .sort((a, b) => b.inicio.localeCompare(a.inicio));
  },

  async addCampanha(c): Promise<void> {
    exigirEscrita(
      await inserirLinhas("CAMPANHAS", [campanhaParaLinha({ id: "", ...c })]),
      "cadastro de campanha"
    );
  },

  // ---------- P2 — fontes de renda: trilha do produto e encontros ----------

  async listModulos(): Promise<Modulo[]> {
    const linhas = await linhasDa("MODULOS");
    return comId(linhas)
      .map(linhaParaModulo)
      .sort((a, b) => (a.produtoId === b.produtoId ? a.ordem - b.ordem : a.produtoId.localeCompare(b.produtoId)));
  },

  async listAulas(): Promise<Aula[]> {
    const linhas = await linhasDa("AULAS");
    return comId(linhas)
      .map(linhaParaAula)
      .sort((a, b) => (a.moduloId === b.moduloId ? a.ordem - b.ordem : a.moduloId.localeCompare(b.moduloId)));
  },

  async listProgresso(): Promise<ProgressoAula[]> {
    const linhas = await linhasDa("PROGRESSO");
    return comId(linhas).map(linhaParaProgressoAula);
  },

  async listEncontros(): Promise<Encontro[]> {
    const linhas = await linhasDa("ENCONTROS");
    return comId(linhas)
      .map(linhaParaEncontro)
      .sort((a, b) => a.data.localeCompare(b.data));
  },

  // ---------- atendimento: WhatsApp virando ficha do cliente ----------

  async listInteracoes(alunoId?: string): Promise<Interacao[]> {
    const linhas = await linhasDa("INTERACOES");
    const todas = comId(linhas).map(linhaParaInteracao);
    const filtradas = alunoId ? todas.filter((i) => i.alunoId === alunoId) : todas;
    return filtradas.sort((a, b) => b.quando.localeCompare(a.quando));
  },

  async registrarInteracoes(msgs: MensagemRecebida[]): Promise<ResultadoInteracoes> {
    if (msgs.length === 0) {
      return { gravadas: 0, ignoradas: 0, descartadas: 0, leadsCriados: 0, idsExternosIgnorados: [] };
    }

    // a. e b. -- mesmo espirito de `importarExtrato`: ler o que ja entrou ANTES
    // de inserir. Aqui a chave e o `ID_Externo` do WhatsApp, e nao a impressao
    // digital do extrato, mas o problema e identico: o agente local reenvia o
    // historico ao reconectar, entao a mesma mensagem chega de novo por
    // desenho. Sem esta leitura, cada reconexao duplicaria a conversa inteira.
    // A CONFERENCIA QUE PRECISA VIR ANTES DE QUALQUER ESCRITA
    // -------------------------------------------------------
    // `linhasDe` colapsa "aba vazia" e "aba inexistente" no mesmo `[]`, porque
    // a leitura nunca lanca (ver `sheets/ler.ts`). Aqui essa indulgencia custa
    // caro: com a aba INTERACOES faltando, o lead era criado em ALUNOS e so
    // DEPOIS a gravacao da conversa estourava. O agente recebia 500, tentava
    // de novo, e a releitura do gviz -- que serve copia em cache -- ainda nao
    // enxergava o lead recem-criado: cada tentativa criava outra ficha da
    // mesma pessoa. Foi exatamente o que aconteceu: quatro fichas iguais na
    // tela e 500 sem parar.
    //
    // Entao a aba e conferida ANTES de escrever qualquer coisa. Sem lugar para
    // guardar a conversa, nada e criado -- e o erro diz o que fazer.
    const leitura = await lerAbas(["INTERACOES", "ALUNOS"]);
    for (const aba of ["INTERACOES", "ALUNOS"] as const) {
      const erro = leitura[aba]?.erro;
      if (erro) {
        throw new Error(
          `nao da para registrar as mensagens agora: ${erro} ` +
            `Se a aba ${aba} nao existir na planilha, publique a versao mais recente do Apps Script ` +
            `(menu Extensoes > Apps Script > Implantar) e rode "Raro > Conferir estrutura".`
        );
      }
    }
    const abas = {
      INTERACOES: leitura.INTERACOES?.linhas ?? [],
      ALUNOS: leitura.ALUNOS?.linhas ?? [],
    };
    const jaGravados = new Set(comId(abas.INTERACOES).map((l) => celulaDe(l, "ID_Externo")));
    // Os lembrados vao NA FRENTE: quando a mesma pessoa aparece nos dois
    // lugares o id e o mesmo, e quando so aparece na memoria e porque o cache
    // do gviz ainda nao alcancou a linha que acabamos de escrever.
    const alunos = [...leadsLembrados(), ...comId(abas.ALUNOS).map(linhaParaAluno)];

    const plano = planejarRecepcao(msgs, alunos, jaGravados);
    if (plano.interacoes.length === 0) {
      return {
        gravadas: 0,
        ignoradas: plano.ignoradas,
        descartadas: plano.descartadas,
        leadsCriados: 0,
        idsExternosIgnorados: plano.idsExternosIgnorados,
      };
    }

    // c. leads de numero desconhecido nascem antes das interacoes -- a
    // interacao precisa de um dono para existir. Insercao em LOTE para o array
    // `ids` voltar na MESMA ordem de `plano.leads` (ver `importarExtrato`).
    const idPorChave = new Map<string, string>();
    if (plano.leads.length > 0) {
      const insercao = exigirEscrita(
        await inserirLinhas(
          "ALUNOS",
          plano.leads.map((lead) =>
            alunoParaLinha({
              id: "", // o Apps Script gera o ID
              nome: lead.nome,
              telefone: lead.telefone,
              email: "",
              statusFunil: "potencial",
              estagioId: ESTAGIOS_PLANILHA[0].id,
              // CRIACAO AUTOMATICA: `origem` marca a ficha que nasceu de uma
              // mensagem, e nao de alguem cadastrando. Sem essa marca o dono
              // nao consegue separar o que ele cadastrou do que o sistema criou.
              origem: "whatsapp",
              primeiroContato: new Date().toISOString().slice(0, 10),
              observacoes: "",
            })
          )
        ),
        "cadastro dos leads que chegaram por WhatsApp"
      );
      const ids = insercao.ids ?? [];
      if (ids.length !== plano.leads.length) {
        throw new Error(
          "os leads novos foram gravados em ALUNOS mas a planilha nao devolveu um ID por linha; " +
            "sem o ID de cada aluno as interacoes ficariam sem dono."
        );
      }
      plano.leads.forEach((lead, i) => {
        idPorChave.set(lead.chave, ids[i]);
        // Anotado ANTES da gravacao das interacoes de proposito: se ela falhar,
        // a proxima tentativa precisa achar este lead aqui, e nao cria-lo de novo.
        lembrarLead(lead.chave, ids[i], lead.telefone);
      });
    }

    // d. grava as interacoes
    const paraGravar = plano.interacoes.map((i) => ({
      ...i,
      alunoId: i.alunoId !== "" ? i.alunoId : idPorChave.get(i.chaveLead) ?? "",
    }));

    exigirEscrita(
      await inserirLinhas(
        "INTERACOES",
        paraGravar.map((i) =>
          interacaoParaLinha({
            id: "",
            alunoId: i.alunoId,
            canal: i.canal,
            direcao: i.direcao,
            texto: i.texto,
            quando: i.quando,
            idExterno: i.idExterno,
            tipoMidia: i.tipoMidia,
            nomeExibicao: i.nomeExibicao,
            telefone: i.telefone,
          })
        )
      ),
      "registro das mensagens de WhatsApp"
    );

    await aplicarEstagioObservado(new Set(paraGravar.map((i) => i.alunoId).filter((id) => id !== "")));

    // e. o balanco
    return {
      gravadas: paraGravar.length,
      ignoradas: plano.ignoradas,
      descartadas: plano.descartadas,
      leadsCriados: plano.leads.length,
      idsExternosIgnorados: plano.idsExternosIgnorados,
    };
  },

  // ---------- atendimento: fila de saida ----------

  async listEnvios(): Promise<Envio[]> {
    const linhas = await linhasDa("ENVIOS");
    return comId(linhas)
      .map(linhaParaEnvio)
      .sort((a, b) => b.autorizadoEm.localeCompare(a.autorizadoEm));
  },

  async listEnviosPendentes(): Promise<EnvioPendente[]> {
    const linhas = await linhasDa("ENVIOS");
    return comId(linhas)
      .map(linhaParaEnvio)
      // O filtro por "aprovado" E a regra de negocio: o agente local nao tem
      // como saber se uma mensagem foi autorizada por uma pessoa, entao quem
      // garante isso e esta linha. Ela nunca pode virar "tudo que nao saiu".
      .filter((e) => e.status === "aprovado" && e.autorizadoPor !== "" && e.telefone !== "")
      .sort((a, b) => a.autorizadoEm.localeCompare(b.autorizadoEm))
      .map((e) => ({
        id: e.id,
        telefone: e.telefone,
        texto: e.texto,
        autorizadoPor: e.autorizadoPor,
        autorizadoEm: e.autorizadoEm,
      }));
  },

  async aprovarEnvio(n: NovoEnvio): Promise<string> {
    const insercao = exigirEscrita(
      await inserirLinhas("ENVIOS", [
        envioParaLinha({
          id: "",
          alunoId: n.alunoId,
          telefone: n.telefone,
          texto: n.texto,
          autorizadoPor: n.autorizadoPor,
          autorizadoEm: new Date().toISOString(),
          status: "aprovado",
          enviadoEm: "",
          idExterno: "",
          erro: "",
        }),
      ]),
      "aprovacao do envio"
    );
    const id = (insercao.ids ?? [])[0] ?? "";
    if (id === "") {
      throw new Error(
        "o envio foi gravado em ENVIOS mas a planilha nao devolveu o ID da linha; " +
          "sem ele nao ha como baixar a fila quando o agente responder."
      );
    }
    return id;
  },

  async registrarResultadoEnvio(resultados: ResultadoEnvio[]): Promise<number> {
    if (!resultados || resultados.length === 0) return 0;

    const linhas = await linhasDa("ENVIOS");
    const porId = new Map(comId(linhas).map((l) => [celulaDe(l, "ID"), linhaParaEnvio(l)]));
    const agora = new Date().toISOString();

    let mudadas = 0;
    for (const r of resultados) {
      const atual = porId.get(r.id);
      // Id desconhecido ou linha ja baixada e ignorado em silencio: o agente
      // reenvia confirmacao quando nao tem certeza de ter sido ouvido, e criar
      // linha aqui inventaria um envio que ninguem aprovou.
      if (!atual || atual.status !== "aprovado") continue;
      exigirEscrita(
        await atualizarLinha("ENVIOS", r.id, {
          Status: r.enviado ? "enviado" : "falhou",
          Enviado_Em: agora,
          ID_Externo: r.idExterno ?? "",
          Erro: r.enviado ? "" : r.erro ?? "",
        }),
        "baixa da fila de envio"
      );
      mudadas++;
    }
    return mudadas;
  },
};

/**
 * Aplica a sugestao de estagio aos alunos tocados por um lote de mensagens.
 *
 * Grava SO o que `podeGravarSozinha` libera -- sugestao apoiada em evento que
 * aconteceu (comprou, respondeu). "Em risco" nasce do silencio, que e ausencia
 * de evento, e fica para uma pessoa decidir.
 *
 * A planilha nao tem coluna de aluno em VENDAS, entao `compras` entra vazio
 * aqui: no modo planilha nao existe forma de dizer QUEM comprou sem inventar o
 * vinculo (mesma limitacao ja registrada em `getAluno`). Na pratica sobra a
 * regra "respondeu -> em conversa", que e exatamente o que a planilha sabe.
 */
async function aplicarEstagioObservado(alunoIds: Set<string>): Promise<void> {
  if (alunoIds.size === 0) return;

  const abas = await linhasDe(["ALUNOS", "INTERACOES"]);
  const alunos = comId(abas.ALUNOS).map(linhaParaAluno);
  const interacoes = comId(abas.INTERACOES).map(linhaParaInteracao);
  const agora = new Date();

  for (const id of alunoIds) {
    const aluno = alunos.find((a) => a.id === id);
    if (!aluno) continue;

    const sugestao = sugerirEstagio({
      interacoes: interacoes.filter((i) => i.alunoId === id),
      compras: [],
      estagioAtual: aluno.estagioId === "etapa-qualificado" ? "em_conversa" : null,
      agora,
    });
    if (!podeGravarSozinha(sugestao)) continue;
    if (sugestao.estagio !== "em_conversa") continue; // "cliente" exigiria compra, que a planilha nao liga ao aluno

    exigirEscrita(
      await atualizarLinha("ALUNOS", id, { "Etapa/Status": "Qualificado" }),
      "atualizacao da etapa do aluno pelo atendimento"
    );
  }
}

// ============================================================
// Auxiliares usados por mais de um metodo
// ============================================================

/** `FormaPgto` -> texto da lista de validacao de VENDAS. */
function formaDaPlanilha(forma: string): string {
  if (forma === "pix") return "Pix";
  if (forma === "dinheiro") return "Dinheiro";
  if (forma === "debito") return "Cartao de debito";
  return "Cartao de credito";
}

/**
 * Parcelas de uma venda nova, somando EXATAMENTE o valor da venda.
 *
 * O arredondamento sobra na ULTIMA parcela de proposito: 1000 em 3x da
 * 333,33 + 333,33 + 333,34. Distribuir 333,33 nas tres deixaria um centavo de
 * diferenca, e um centavo basta para a conferencia do PAINEL acusar erro.
 */
function parcelasDaVenda(
  idVenda: string,
  nova: { data: string; formaPgto: string },
  valor: number,
  parcelas: number,
  responsavel: string
): Record<string, unknown>[] {
  const total = Math.max(1, parcelas);
  const base = +(valor / total).toFixed(2);
  const linhas: Record<string, unknown>[] = [];

  for (let i = 0; i < total; i++) {
    const ultimo = i === total - 1;
    const parcela = ultimo ? +(valor - base * (total - 1)).toFixed(2) : base;

    // Vencimento: mes a mes a partir da data da venda. `setMonth` com dia 31
    // escorrega para o mes seguinte, o que e o comportamento aceito aqui --
    // corrigir para "ultimo dia do mes" seria inventar regra que ninguem definiu.
    const venc = new Date(`${nova.data}T12:00:00`);
    venc.setMonth(venc.getMonth() + i);

    linhas.push({
      ID: "",
      ID_Venda: idVenda,
      Responsavel: responsavel,
      Descricao: total === 1 ? "Parcela unica" : `Parcela ${i + 1}/${total}`,
      "Forma de pagamento": formaDaPlanilha(nova.formaPgto),
      Vencimento: dataCelula(venc.toISOString().slice(0, 10)),
      Valor: parcela,
      Status: "A vencer",
    });
  }
  return linhas;
}

/**
 * METAS -> `Meta[]`, descartando as linhas que o mapeamento recusou.
 *
 * Le AGRUPAMENTOS aqui (nao recebe a lista por parametro) porque os tres
 * pontos que chamam `lerMetas` nao tinham essa lista em maos antes -- e
 * `linhasDa` e cacheada (ver sheets/ler.ts), entao o custo de mais uma leitura
 * de aba e uma resposta de cache, nao uma chamada de rede nova a cada vez.
 * `resolverReferenciaDeAgrupamentos` casa `METAS.Referencia` contra o
 * cadastro: sem isto, meta escrita para um agrupamento criado pelo cliente
 * (que nao esta nos tres nomes legados de `BRACOS`, mapear.ts) era lida como
 * se fosse referencia de afiliado, e o alvo comparado no painel virava outra
 * coisa em silencio.
 */
async function lerMetas(linhas: Record<string, string>[]): Promise<Meta[]> {
  const agrupamentos = comId(await linhasDa("AGRUPAMENTOS")).map(linhaParaAgrupamento);
  const resolver = resolverReferenciaDeAgrupamentos(agrupamentos);
  const saida: Meta[] = [];
  for (const l of comId(linhas)) {
    const m = linhaParaMeta(l, resolver);
    // `null` = indicador desconhecido. O aviso ja foi registrado em mapear.ts;
    // aqui a linha some, porque meta com indicador errado vira alvo falso.
    if (m) saida.push(m);
  }
  return saida;
}

/**
 * Insere ou atualiza a meta do mesmo indicador/escopo/periodo.
 *
 * Le antes de escrever porque a planilha nao tem "upsert": sem a leitura, cada
 * ajuste de meta criaria uma linha nova e o periodo passaria a ter dois alvos
 * diferentes sem criterio de desempate.
 */
async function gravarMeta(nova: Omit<Meta, "id">): Promise<void> {
  const linhas = await linhasDa("METAS");
  const existentes = await lerMetas(linhas);
  const igual = existentes.find(
    (m) =>
      m.indicador === nova.indicador &&
      m.escopo === nova.escopo &&
      m.escopoRef === nova.escopoRef &&
      m.periodo === nova.periodo
  );

  const linha = metaParaLinha({ id: igual?.id ?? "", ...nova });

  if (igual) {
    exigirEscrita(await atualizarLinha("METAS", igual.id, linha), "atualizacao da meta");
    return;
  }
  exigirEscrita(await inserirLinhas("METAS", [linha]), "cadastro da meta");
}

/** RECEBIVEIS -> `Recebivel[]`, com o braco herdado do responsavel da parcela. */
function montarRecebiveis(
  recebiveis: Record<string, string>[],
  responsaveis: Record<string, string>[]
): Recebivel[] {
  const porNome = new Map<string, Afiliado>();
  for (const l of comId(responsaveis)) {
    const a = linhaParaAfiliado(l);
    if (a.nome !== "") porNome.set(normalizar(a.nome), a);
  }

  return comId(recebiveis)
    .map((l) => {
      const r = linhaParaRecebivel(l);
      const nome = celulaDe(l, "Responsavel");
      const afiliado = nome ? porNome.get(normalizar(nome)) : undefined;
      return { ...r, braco: afiliado?.braco ?? null };
    })
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento));
}

/**
 * Conjunto das impressoes digitais ja registradas em IMPORTACOES -- passo (a)
 * de `importarExtrato`. Le so a coluna que importa em vez de montar o
 * `RegistroImportacao` inteiro, porque uma importacao grande so precisa saber
 * "essa digital ja existe?", nunca o resto da linha.
 */
async function digitaisImportadas(): Promise<Set<string>> {
  const linhas = await linhasDa("IMPORTACOES");
  return new Set(comId(linhas).map((l) => celulaDe(l, "Impressao_Digital")));
}

/** MOVIMENTOS + o gasto de midia de INVESTIMENTO, que tambem e saida de caixa. */
function montarMovimentos(
  movimentos: Record<string, string>[],
  investimento: Record<string, string>[]
): MovimentoCaixa[] {
  return [
    ...comId(movimentos).map(linhaParaMovimentoCaixa),
    ...comId(investimento).map(linhaParaMovimentoDeTrafego),
  ].sort((a, b) => a.dataCaixa.localeCompare(b.dataCaixa));
}

/**
 * Perfis sociais DEDUZIDOS de CONTEUDOS.
 *
 * Nao existe aba de perfis. Um perfil so e conhecido porque publicou alguma
 * coisa, entao `seguidores` fica em zero e `conectado` em falso: e a verdade
 * (a planilha nao sabe quantos seguidores existem), e um numero inventado ali
 * viraria taxa de engajamento errada na tela de conteudo.
 */
function perfisDeConteudos(linhas: Record<string, string>[]): PerfilSocial[] {
  const mapa = new Map<string, PerfilSocial>();
  for (const l of comId(linhas)) {
    const c = linhaParaConteudo(l);
    const handle = c.perfilHandle ?? "";
    if (handle === "") continue;
    const chave = `${c.plataforma}:${normalizar(handle)}`;
    if (mapa.has(chave)) continue;
    mapa.set(chave, {
      id: handle,
      plataforma: c.plataforma ?? "instagram",
      handle,
      seguidores: 0,
      conectado: false,
      atualizadoEm: c.publicadoEm,
    });
  }
  return [...mapa.values()];
}
