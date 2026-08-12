// Contrato da camada de dados — implementado por supabase-db e sheets-db (dados
// reais), demo-db (dados fictícios em memória, sob opt-in) e vazio-db (nenhuma
// base conectada). As páginas nunca sabem qual está ativo.

import type {
  Afiliado,
  Agrupamento,
  Aluno,
  Atividade,
  Aula,
  CallResumo,
  Campanha,
  Chargeback,
  ContaBancaria,
  Conteudo,
  ConteudoDetalhe,
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
  Nota,
  NovaAtividade,
  NovaCampanha,
  NovaConta,
  NovaDespesa,
  NovaMatricula,
  NovaNota,
  NovaReuniao,
  NovaTarefa,
  NovaTranscricao,
  NovoAgrupamento,
  NovoEnvio,
  NovoAluno,
  NovoLancamento,
  NovoProduto,
  NovoReembolso,
  NovoResponsavel,
  Orcamento,
  Pagavel,
  ParametrosFinanceiros,
  PerfilSocial,
  PilarVideo,
  Produto,
  ProgressoAula,
  Recebivel,
  Reembolso,
  Reuniao,
  StatusFunil,
  Tarefa,
  TarefaAluno,
  Transcricao,
  Turma,
  WebhookEvento,
} from "../types";
import type { LinhaExtrato, OrigemExtrato } from "../extrato/extrato";
import type { EnvioPendente, MensagemRecebida, ResultadoEnvio } from "../atendimento/contrato";

export interface AlunoDetalhe {
  aluno: Aluno;
  matriculas: Matricula[];
}

/**
 * Uma linha do livro-razão de importação (aba/tabela IMPORTACOES): prova de
 * que aquele lançamento do extrato — identificado pela `impressaoDigital` —
 * já foi trazido para dentro do sistema. NÃO é o lançamento em si; o
 * lançamento de verdade mora em `MovimentoCaixa` (ver `movimentoId`). Sem
 * este registro, reenviar um extrato que se sobrepõe ao anterior (o uso
 * normal do cliente: semanal em cima de diário, mensal em cima de semanal)
 * duplicaria dinheiro no caixa sem ninguém perceber até o fechamento.
 */
export interface RegistroImportacao {
  id: string;
  impressaoDigital: string;
  data: string; // ISO aaaa-mm-dd
  descricao: string;
  valor: number; // sinal preservado do extrato: positivo entra, negativo sai
  tipo: "entrada" | "saida";
  documento: string;
  origem: OrigemExtrato;
  contaId: string;
  movimentoId: string; // aponta para o MovimentoCaixa que este registro originou
  importadoEm: string; // ISO datetime — quando a importação rodou
}

/**
 * Resultado de uma chamada a `importarExtrato`: quantas linhas foram
 * gravadas de fato, quantas foram descartadas por já terem entrado antes (a
 * impressão digital já estava registrada) e QUAIS digitais foram essas — a
 * tela de conferência usa a lista para mostrar exatamente o que ficou de
 * fora, em vez de só um número que ninguém consegue conferir.
 */
export interface ResultadoImportacao {
  gravadas: number;
  ignoradas: number;
  digitaisIgnoradas: string[];
}

/**
 * O balanço de uma chamada a `registrarInteracoes`.
 *
 * Os três primeiros números são diferentes de propósito, e o endpoint devolve
 * os três: sem essa separação, "sumiu mensagem" vira uma pergunta sem resposta.
 *  · `gravadas`    — viraram interação nova na ficha de alguém;
 *  · `ignoradas`   — o `idExterno` já estava registrado (reenvio na
 *                    reconexão, que é o comportamento NORMAL do agente);
 *  · `descartadas` — não podiam virar interação de ninguém: mensagem de grupo,
 *                    telefone irreconhecível.
 * `leadsCriados` sai à parte porque é a única coisa aqui que CRIA cadastro sem
 * ninguém pedir — o dono precisa poder auditar quantas fichas nasceram sozinhas.
 */
export interface ResultadoInteracoes {
  gravadas: number;
  ignoradas: number;
  descartadas: number;
  leadsCriados: number;
  /** Os ids que já existiam, para a tela poder mostrar o que ficou de fora. */
  idsExternosIgnorados: string[];
}

export interface LancamentoDetalhe {
  lancamento: Lancamento;
  produto: Produto | null;
  turmas: Turma[];
  matriculas: Matricula[];
  tarefas: TarefaAluno[];
  calls: CallResumo[];
  reembolsos: Reembolso[];
}

export interface DataProvider {
  modo: "demo" | "supabase" | "planilha" | "vazio";

  // ----- núcleo v1 -----
  listAfiliados(): Promise<Afiliado[]>;
  listAlunos(): Promise<Aluno[]>;
  getAluno(id: string): Promise<AlunoDetalhe | null>;
  listProdutos(): Promise<Produto[]>;
  listMatriculas(): Promise<Matricula[]>;
  listDespesas(): Promise<Despesa[]>;
  listLancamentos(): Promise<Lancamento[]>;
  getLancamento(id: string): Promise<LancamentoDetalhe | null>;
  dataset(): Promise<DatasetFinanceiro>;

  addDespesa(d: NovaDespesa): Promise<void>;
  addAluno(a: NovoAluno): Promise<void>;
  setStatusAluno(id: string, status: StatusFunil): Promise<void>;
  addLancamento(l: NovoLancamento): Promise<void>;
  addMatricula(m: NovaMatricula): Promise<void>;
  toggleTarefa(id: string): Promise<void>; // tarefas de turma (tarefas_alunos)
  addReembolso(r: NovoReembolso): Promise<void>;

  // ----- cadastro base: produto, responsável (afiliado) e conta -----
  addProduto(p: NovoProduto): Promise<void>;
  addResponsavel(r: NovoResponsavel): Promise<void>;
  /**
   * Cadastra a conta e DEVOLVE o id dela.
   *
   * Por que não é `void`: a tela de importação de extrato precisa selecionar
   * a conta recém-criada sem recarregar a página (recarregar joga fora o
   * extrato já conferido). A primeira tentativa foi gravar e reler a lista
   * para achar a conta nova — e isso quebrou em produção no modo planilha: a
   * leitura da planilha passa pelo endpoint público do Google, que serve uma
   * cópia em cache e ainda não tinha a linha recém-inserida. Quem sabe o id é
   * quem gravou; então é ele que devolve.
   */
  addConta(c: NovaConta): Promise<string>;

  // ----- cadastro OPCIONAL de agrupamento (ver Agrupamento em ../types) -----
  // Sem nenhuma linha cadastrada, a lista vem vazia — não existe "padrão" de
  // três agrupamentos esperando para aparecer; a tela é quem decide sumir a
  // seção quando a lista chega vazia.
  listAgrupamentos(): Promise<Agrupamento[]>;
  addAgrupamento(a: NovoAgrupamento): Promise<void>;

  // ----- expansão v2: CRM -----
  listEstagios(): Promise<Estagio[]>;
  setEstagioAluno(alunoId: string, estagio: Estagio): Promise<void>;
  listNotas(alunoId: string): Promise<Nota[]>;
  addNota(n: NovaNota): Promise<void>;
  listAtividades(alunoId?: string): Promise<Atividade[]>;
  addAtividade(a: NovaAtividade): Promise<void>;
  listTarefas(): Promise<Tarefa[]>;
  addTarefaGestao(t: NovaTarefa): Promise<void>;
  concluirTarefa(id: string): Promise<void>;

  // ----- expansão v2: reuniões e transcrições -----
  listReunioes(): Promise<Reuniao[]>;
  addReuniao(r: NovaReuniao & { googleEventId?: string; linkExterno?: string }): Promise<Reuniao>;
  listTranscricoes(reuniaoId?: string): Promise<Transcricao[]>;
  addTranscricao(t: NovaTranscricao): Promise<void>;

  // ----- expansão v2: financeiro avançado -----
  listOrcamentos(): Promise<Orcamento[]>;
  setOrcamento(categoria: string, periodo: string, valorPrevisto: number): Promise<void>;
  listMetasFinanceiras(): Promise<MetaFinanceira[]>;
  setMetaFinanceira(tipo: "faturamento" | "lucro", periodo: string, alvo: number): Promise<void>;

  // ----- P0 fundação: metas generalizadas + eventos de webhook -----
  listMetas(): Promise<Meta[]>;
  setMeta(m: Omit<Meta, "id">): Promise<void>;
  listEventosWebhook(): Promise<WebhookEvento[]>;

  // ----- P1 camada de caixa: extrato, recebíveis, pagáveis, chargebacks -----
  listContasBancarias(): Promise<ContaBancaria[]>;
  listMovimentosCaixa(): Promise<MovimentoCaixa[]>;
  addMovimentoCaixa(m: Omit<MovimentoCaixa, "id">): Promise<void>;
  listRecebiveis(): Promise<Recebivel[]>;
  /** Baixa da parcela: marca como recebida na data informada (conciliação). */
  baixarRecebivel(id: string, dataRecebimento: string): Promise<void>;
  listPagaveis(): Promise<Pagavel[]>;
  /** Baixa da conta a pagar: marca como paga na data informada. */
  baixarPagavel(id: string, dataPagamento: string): Promise<void>;
  listChargebacks(): Promise<Chargeback[]>;
  getParametrosFinanceiros(): Promise<ParametrosFinanceiros>;
  setParametrosFinanceiros(p: Omit<ParametrosFinanceiros, "id" | "atualizadoEm">): Promise<void>;
  /** Pacote de caixa completo — evita N chamadas nas páginas do P1. */
  datasetCaixa(): Promise<DatasetCaixa>;

  // ----- Importação de extrato bancário: livro-razão de procedência -----
  // `importarExtrato` NUNCA é chamada direto pelo upload do arquivo — só
  // depois da conferência humana da lista lida por `lerExtrato` (ver
  // src/lib/extrato). Ela precisa, NESTA ordem: (a) ler as digitais já
  // registradas em IMPORTACOES; (b) descartar as linhas cuja digital já
  // existe, contando quantas; (c) gravar as novas em `MovimentoCaixa` e
  // registrar a procedência de cada uma; (d) devolver quantas foram
  // gravadas, quantas ignoradas e as digitais ignoradas. `origem` é
  // propriedade do ARQUIVO inteiro (`LeituraExtrato.origem`), não de cada
  // linha — por isso entra como parâmetro à parte, e não dentro de
  // `LinhaExtrato`.
  listImportacoes(): Promise<RegistroImportacao[]>;
  importarExtrato(
    linhas: LinhaExtrato[],
    contaId: string,
    origem: OrigemExtrato
  ): Promise<ResultadoImportacao>;

  // ----- expansão v2: conteúdo & redes -----
  listPerfisSociais(): Promise<PerfilSocial[]>;
  listConteudos(): Promise<ConteudoView[]>;
  getConteudo(id: string): Promise<ConteudoDetalhe | null>;
  setPilar(conteudoId: string, pilar: PilarVideo, texto: string, nota: number | null): Promise<void>;
  listCampanhas(): Promise<Campanha[]>;
  addCampanha(c: NovaCampanha): Promise<void>;

  // ----- P2 — fontes de renda: trilha do produto e encontros -----
  listModulos(): Promise<Modulo[]>;
  listAulas(): Promise<Aula[]>;
  listProgresso(): Promise<ProgressoAula[]>;
  listEncontros(): Promise<Encontro[]>;

  // ----- Atendimento: WhatsApp virando ficha do cliente -----
  //
  // `registrarInteracoes` é a única porta de entrada das mensagens, e ela
  // precisa fazer, NESTA ordem e nesta chamada só (o mesmo espírito de
  // `importarExtrato`): (a) ler os `idExterno` já gravados; (b) descartar a
  // mensagem cujo id já existe, contando quantas — reenvio na reconexão é uso
  // NORMAL do agente local, não erro; (c) casar cada mensagem com um aluno por
  // `acharPorTelefone`, criando lead novo quando o número é desconhecido; (d)
  // gravar as novas; (e) devolver o balanço. Mensagem de grupo (telefone que
  // `telefoneDoJid` resolve para "") não entra em (c) nem em (d): ela não
  // pertence à ficha de ninguém.
  listInteracoes(alunoId?: string): Promise<Interacao[]>;
  registrarInteracoes(msgs: MensagemRecebida[]): Promise<ResultadoInteracoes>;

  // ----- Atendimento: fila de saída -----
  //
  // `listEnviosPendentes` entrega ao agente local SOMENTE o que uma pessoa
  // aprovou (status "aprovado", com autor e data registrados). Não existe
  // caminho neste contrato por onde uma mensagem chegue ao agente sem ter
  // passado por `aprovarEnvio` — envio automático em nome do dono é o erro que
  // ele não consegue desfazer.
  listEnvios(): Promise<Envio[]>;
  listEnviosPendentes(): Promise<EnvioPendente[]>;
  aprovarEnvio(e: NovoEnvio): Promise<string>;
  /** Baixa da fila: aplica o que o agente respondeu. Devolve quantas linhas mudaram. */
  registrarResultadoEnvio(resultados: ResultadoEnvio[]): Promise<number>;
}

export type { Conteudo };
