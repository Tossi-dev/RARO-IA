// Tipos de domínio da MentorOS — espelham o schema do Supabase (supabase/migrations)

import type { CategoriaFonte } from "./fontes";
// O contrato do WhatsApp é a fonte única de `canal` e `direcao` (ver
// atendimento/contrato.ts). Redeclarar as duas uniões aqui criaria um segundo
// lugar para elas divergirem no dia em que entrar Instagram Direct.
import type { CanalAtendimento, DirecaoMensagem } from "./atendimento/contrato";

export type Papel = "dono" | "gestor" | "afiliado" | "aluno";

// DÍVIDA DE ENGENHARIA REGISTRADA (deliberada, não reabrir): `Braco` era união
// fixa de "corpo" | "mente" | "espirito" — posicionamento de UM cliente que
// tinha vazado para dentro do produto. Agrupamento agora é CADASTRO do
// usuário (ver `Agrupamento` abaixo), então o tipo vira `string`: o id de um
// agrupamento cadastrado (ou vazio/nulo quando a venda não tem um). O campo
// continua se chamando `braco` no modelo de dados e nas colunas da planilha
// — renomear para `agrupamentoId` em ~660 referências espalhadas por 32
// arquivos multiplicaria o risco da migração sem mudar nada para quem usa o
// produto. O demo (src/lib/data/demo-db.ts) continua usando "corpo",
// "mente" e "espirito" como exemplo — são só valores de `id` como qualquer
// outro agrupamento cadastrado, não um tipo especial.
export type Braco = string;

/** Agrupamento cadastrado pelo usuário (ex.: "corpo", "mente", "espirito" no demo, ou qualquer outro nome/cor). Opcional: sem cadastro, nenhuma seção "por agrupamento" aparece. */
export interface Agrupamento {
  id: string;
  nome: string;
  cor: string;
  ordem: number;
  ativo: boolean;
}

/** Formulário de criação de um agrupamento. */
export interface NovoAgrupamento {
  nome: string;
  cor: string;
  ordem?: number;
}
export type StatusFunil = "potencial" | "novo" | "recorrente" | "inativo";
export type TipoProduto = "low_ticket" | "high_ticket" | "mentoria";
export type StatusLancamento = "planejado" | "ativo" | "encerrado";
export type FormaPgto =
  | "pix"
  | "dinheiro"
  | "debito"
  | "credito_vista"
  | "credito_2x6x"
  | "credito_7x12x";
export type TipoDespesa = "fixa" | "variavel";
export type StatusPagamento = "pago" | "pendente" | "reembolsado";

export interface Afiliado {
  id: string;
  nome: string;
  // `null` = responsável cadastrado SEM agrupamento (célula `Braco` em branco
  // na planilha, ou nunca preenchida no Supabase). Já foi obrigatório — a
  // leitura da planilha cobria a ausência com o primeiro agrupamento da
  // lista, o que empurrava a receita de quem não pertence a agrupamento
  // nenhum para dentro de um agrupamento errado (ver bracoDeTexto,
  // sheets/mapear.ts). Quem lê este campo para agregar por agrupamento
  // (metrics-comando.ts) precisa tratar `null` como "sem agrupamento", nunca
  // descartar a receita nem inventar um agrupamento para ela.
  braco: Braco | null;
  pctPadrao: number; // % de comissão padrão (ex.: 25)
  ativo: boolean;
  // P0 — fundação (Blueprint v3 §6): gestão da rede por braço
  metaMensal?: number; // meta individual de faturamento/mês
  whatsapp?: string;
  chavePix?: string; // para repasses de comissão
}

export interface Aluno {
  id: string;
  nome: string;
  telefone: string;
  email: string;
  statusFunil: StatusFunil;
  estagioId: string | null; // estágio do pipeline (crm_estagios)
  origem: string;
  primeiroContato: string; // ISO yyyy-mm-dd
  observacoes: string;
}

export interface Produto {
  id: string;
  nome: string;
  tipo: TipoProduto;
  precoBase: number;
  ativo: boolean;
  // P2 — fontes de renda: hoje o braço de uma venda é herdado do afiliado
  // (Matricula.braco cai para o braço do afiliado quando nulo); isso deixa a
  // receita de venda direta (sem afiliado) sem braço nenhum. Ancorar o braço
  // no produto dá um segundo fallback e permite ver receita por braço mesmo
  // quando a venda não passou por afiliado.
  braco: Braco | null;
  categoria: CategoriaFonte;
}

export interface Lancamento {
  id: string;
  nome: string;
  produtoId: string;
  inicio: string;
  fim: string | null;
  status: StatusLancamento;
  metaFaturamento: number;
  descricao: string;
}

export interface Turma {
  id: string;
  lancamentoId: string;
  nome: string;
  vagas: number;
  // P2 — fontes de renda: turma passa a ter vida própria (início/fim/status)
  // em vez de depender só das datas do lançamento — necessário para produto
  // "curso" perpétuo, que roda turmas contínuas sem lançamento novo a cada vez.
  inicio: string | null; // ISO yyyy-mm-dd
  fim: string | null; // ISO yyyy-mm-dd
  status: "planejada" | "ativa" | "encerrada";
}

export interface Matricula {
  id: string;
  alunoId: string;
  produtoId: string;
  lancamentoId: string | null;
  afiliadoId: string | null;
  turmaId: string | null;
  valor: number;
  formaPgto: FormaPgto;
  valorLiquido: number; // valor após taxa da forma de pagamento
  data: string;
  statusPagamento: StatusPagamento;
  origem: string; // manual | hotmart | kiwify | ... (webhook-ready)
  isUpsell: boolean; // venda maior para quem já era cliente
  // P0 — fundação (Blueprint v3 §6): venda estendida
  braco?: Braco | null; // lente estrutural; fallback = braço do afiliado
  gateway?: Gateway; // por onde o dinheiro entrou
  valorBruto?: number; // antes das taxas (competência)
  taxaGateway?: number; // valorBruto − valorLiquido
  dataLiberacao?: string | null; // D+X — quando vira caixa de verdade
  utmSource?: string;
  utmCampaign?: string;
  // campos "join" preenchidos pelos providers para exibição
  alunoNome?: string;
  produtoNome?: string;
  afiliadoNome?: string | null;
}

export interface Comissao {
  id: string;
  matriculaId: string;
  afiliadoId: string;
  pct: number;
  valor: number;
  data: string;
}

export interface Reembolso {
  id: string;
  matriculaId: string;
  valor: number;
  data: string;
  motivo: string;
}

export interface Despesa {
  id: string;
  data: string;
  descricao: string;
  categoria: string;
  tipo: TipoDespesa;
  valor: number;
  // P0 — fundação: custo atribuível a braço/lançamento (tráfego, produção…)
  braco?: Braco | null;
  lancamentoId?: string | null;
}

export interface TarefaAluno {
  id: string;
  turmaId: string;
  alunoId: string;
  alunoNome?: string;
  titulo: string;
  concluida: boolean;
}

export interface CallResumo {
  id: string;
  lancamentoId: string;
  data: string;
  titulo: string;
  resumo: string;
}

// ---- inputs de criação (formulários) ----

export interface NovaDespesa {
  data: string;
  descricao: string;
  categoria: string;
  tipo: TipoDespesa;
  valor: number;
}

export interface NovoAluno {
  nome: string;
  telefone: string;
  email: string;
  statusFunil: StatusFunil;
  origem: string;
  observacoes: string;
}

export interface NovoLancamento {
  nome: string;
  produtoId: string;
  inicio: string;
  fim: string | null;
  metaFaturamento: number;
  descricao: string;
}

export interface NovaMatricula {
  alunoId: string;
  produtoId: string;
  lancamentoId: string | null;
  afiliadoId: string | null;
  valor: number;
  formaPgto: FormaPgto;
  data: string;
}

export interface NovoReembolso {
  matriculaId: string;
  valor: number;
  data: string;
  motivo: string;
}

// ---- inputs de criação: cadastro base (produto, responsável, conta) ----
//
// A planilha do cliente nasceu com todas as abas de entrada em zero linhas:
// sem produto não há fonte de renda, sem responsável não há braço nem
// comissão, sem conta não há caixa. Estes três tipos são o contrato mínimo
// para o app aprender a gravar esse cadastro base nos quatro providers.

export interface NovoProduto {
  nome: string;
  tipo: TipoProduto;
  precoBase: number;
  ativo: boolean;
  braco: Braco | null;
  categoria: CategoriaFonte;
}

export interface NovoResponsavel {
  nome: string;
  braco: Braco;
  comissaoPadrao: number; // % de comissão padrão (ex.: 25) — vira `Afiliado.pctPadrao`
  metaMensal: number;
}

export interface NovaConta {
  nome: string;
  tipo: TipoContaBancaria;
  saldoInicial: number;
  braco?: Braco | null; // conta dedicada a um braço, quando houver
}

// conjunto de dados usado pelas funções de métricas
export interface DatasetFinanceiro {
  matriculas: Matricula[];
  despesas: Despesa[];
  comissoes: Comissao[];
  reembolsos: Reembolso[];
}

// ============================================================
// Expansão v2 — CRM por estágios, atividades, reuniões,
// financeiro avançado e redes sociais
// ============================================================

export type AtividadeTipo =
  | "nota"
  | "contato"
  | "whatsapp"
  | "ligacao"
  | "email"
  | "evento"
  | "compra"
  | "tarefa"
  | "sistema";
export type ReuniaoStatus = "agendada" | "realizada" | "cancelada";
export type PlataformaSocial = "instagram" | "tiktok" | "facebook";
export type ConteudoTipo = "reel" | "post" | "story" | "video" | "carrossel";
export type PilarVideo = "gancho" | "desenvolvimento" | "cta";
export type CampanhaTipo = "pago" | "organico";
export type TarefaPrioridade = "alta" | "media" | "baixa";
export type TarefaStatus = "pendente" | "concluida";
export type OrigemTranscricao = "manual" | "audio_ia";

export interface Estagio {
  id: string;
  // Identificador ESTÁVEL do degrau da escada (`crm_estagios.chave`, criada
  // pela migração 0014). É por ela — nunca pelo `nome`, que é texto livre e
  // o dono renomeia na tela quando quiser — que o código reconhece a etapa;
  // o vocabulário canônico mora em `src/lib/crm/jornada.ts`. Chave que não
  // está na escada (o `inativo` que a 0014 preserva, ou um estágio criado à
  // mão) continua valendo: é estágio de verdade, só não participa das regras
  // da escada. Vem `""` de base anterior à 0014 e das fontes que não têm o
  // conceito — e `""` é tratado como "fora da escada", nunca como erro.
  chave: string;
  nome: string;
  ordem: number;
  cor: string; // tom do badge (violeta|ouro|verde|vermelho|cinza|azul)
  funil: StatusFunil; // mapeia o estágio para as métricas de funil
}

export interface Nota {
  id: string;
  alunoId: string;
  autor: string;
  texto: string;
  criadoEm: string; // ISO datetime
}

export interface Atividade {
  id: string;
  alunoId: string;
  tipo: AtividadeTipo;
  titulo: string;
  detalhe: string;
  data: string; // ISO datetime
}

export interface Tarefa {
  id: string;
  titulo: string;
  detalhe: string;
  alunoId: string | null;
  lancamentoId: string | null;
  responsavel: string;
  prazo: string | null; // ISO date
  prioridade: TarefaPrioridade;
  status: TarefaStatus;
}

export interface Reuniao {
  id: string;
  titulo: string;
  inicio: string; // ISO datetime
  fim: string | null;
  comQuem: string;
  alunoId: string | null;
  lancamentoId: string | null;
  turmaId: string | null;
  status: ReuniaoStatus;
  link: string;
  googleEventId: string;
}

export interface Transcricao {
  id: string;
  reuniaoId: string;
  origem: OrigemTranscricao;
  texto: string;
  resumo: string;
  criadoEm: string;
}

export interface Orcamento {
  id: string;
  categoria: string;
  periodo: string; // YYYY-MM
  valorPrevisto: number;
}

export interface MetaFinanceira {
  id: string;
  tipo: "faturamento" | "lucro";
  periodo: string; // YYYY-MM
  alvo: number;
}

export interface PerfilSocial {
  id: string;
  plataforma: PlataformaSocial;
  handle: string;
  seguidores: number;
  conectado: boolean;
  atualizadoEm: string;
}

export interface Conteudo {
  id: string;
  perfilId: string;
  plataforma?: PlataformaSocial; // join
  perfilHandle?: string; // join
  tipo: ConteudoTipo;
  titulo: string;
  url: string;
  publicadoEm: string; // ISO date
  duracaoSeg: number;
  roteiro: string;
}

export interface ConteudoMetrica {
  conteudoId: string;
  coletadoEm: string;
  views: number;
  likes: number;
  comentarios: number;
  compartilhamentos: number;
  salvamentos: number;
  alcance: number;
  tempoMedioSeg: number;
  retencaoMedia: number; // %
}

export interface PontoRetencao {
  conteudoId: string;
  pontoPct: number; // 0..100 (posição no vídeo)
  retencaoPct: number; // % assistindo
}

export interface ConteudoPilar {
  id: string;
  conteudoId: string;
  pilar: PilarVideo;
  texto: string;
  nota: number | null; // 0..10
}

export interface Campanha {
  id: string;
  nome: string;
  tipo: CampanhaTipo;
  canal: string; // instagram | tiktok | facebook | multi
  objetivo: string;
  orcamento: number;
  inicio: string;
  fim: string | null;
  conteudoId: string | null;
}

// visões compostas
export interface ConteudoView extends Conteudo {
  metrica: ConteudoMetrica | null;
}

export interface ConteudoDetalhe {
  conteudo: Conteudo;
  metrica: ConteudoMetrica | null;
  retencao: PontoRetencao[];
  pilares: ConteudoPilar[];
}

// ---- inputs (formulários) da expansão ----

export interface NovaNota {
  alunoId: string;
  autor: string;
  texto: string;
}

export interface NovaAtividade {
  alunoId: string;
  tipo: AtividadeTipo;
  titulo: string;
  detalhe: string;
}

export interface NovaTarefa {
  titulo: string;
  detalhe: string;
  alunoId: string | null;
  lancamentoId: string | null;
  responsavel: string;
  prazo: string | null;
  prioridade: TarefaPrioridade;
}

export interface NovaReuniao {
  titulo: string;
  inicio: string;
  fim: string | null;
  comQuem: string;
  alunoId: string | null;
  lancamentoId: string | null;
  turmaId: string | null;
  link: string;
}

export interface NovaTranscricao {
  reuniaoId: string;
  origem: OrigemTranscricao;
  texto: string;
  resumo: string;
}

export interface NovaCampanha {
  nome: string;
  tipo: CampanhaTipo;
  canal: string;
  objetivo: string;
  orcamento: number;
  inicio: string;
  fim: string | null;
  conteudoId: string | null;
}

// ============================================================
// P0 — Fundação (Blueprint v3 §6): metas generalizadas,
// eventos de webhook, integrações e snapshot diário de KPI
// ============================================================

export type Gateway = "hotmart" | "kiwify" | "eduzz" | "stripe" | "manual";
export type CanalVenda = "perpetuo" | "lancamento";

export type IndicadorMeta = "faturamento" | "lucro" | "vendas" | "ticket" | "roas" | "cac";
export type EscopoMeta = "global" | "braco" | "afiliado" | "produto";

/** Meta generalizada: qualquer indicador × escopo × período (norte do pace). */
export interface Meta {
  id: string;
  indicador: IndicadorMeta;
  escopo: EscopoMeta;
  escopoRef: string | null; // braço ("corpo"…), afiliadoId ou produtoId — null p/ global
  periodo: string; // YYYY-MM
  valor: number;
}

export type WebhookTipo = "venda" | "reembolso" | "chargeback" | "assinatura";
export type WebhookStatus = "processado" | "pendente" | "erro";

/** Evento recebido (ou simulado, em demo) do gateway de pagamento. */
export interface WebhookEvento {
  id: string;
  tipo: WebhookTipo;
  gateway: Gateway;
  valor: number;
  taxa: number;
  status: WebhookStatus;
  transacaoRef: string; // id da transação no gateway
  detalhe: string;
  recebidoEm: string; // ISO datetime
}

/** Status computado de uma integração externa (não persiste — deriva dos env). */
export interface StatusIntegracao {
  id: string;
  nome: string;
  categoria: "dados" | "pagamento" | "agenda" | "ia" | "redes";
  conectado: boolean;
  detalhe: string; // o que está ativo ou o que falta
  passo: string; // como conectar (env var / provedor)
}

/** Snapshot diário de KPI (mini data-warehouse p/ MTD/YoY/pace sem recomputar). */
export interface SnapshotKpiDiario {
  data: string; // ISO yyyy-mm-dd
  faturamento: number;
  vendas: number;
  liquido: number;
}

// ============================================================
// P1 — Camada de CAIXA (SPEC-P1 §6 e Anexo B.2)
//
// Regra de ouro do pacote: COMPETÊNCIA ≠ CAIXA.
// Faturar (competência) é reconhecer a venda no dia em que ela acontece;
// receber (caixa) é o dinheiro entrar na conta, depois do D+X do gateway
// ou do vencimento da parcela. Todas as entidades abaixo carregam as
// DUAS datas para que fluxo de caixa e DRE nunca sejam confundidos.
// ============================================================

/** Tipo de banco/carteira onde o dinheiro fica parado. */
export type TipoContaBancaria = "corrente" | "poupanca" | "gateway" | "caixa_fisico" | "investimento";

/** Conta bancária / carteira. O saldo de caixa é a soma das contas ativas. */
export interface ContaBancaria {
  id: string;
  nome: string; // "Itaú PJ", "Saldo Hotmart", "Caixinha presencial"
  tipo: TipoContaBancaria;
  saldoInicial: number; // saldo na data de abertura (base do extrato)
  dataSaldoInicial: string; // ISO yyyy-mm-dd
  ativa: boolean;
  braco?: Braco | null; // conta dedicada a um braço, quando houver
}

/** Entrada (dinheiro que chega) ou saída (dinheiro que sai). */
export type DirecaoCaixa = "entrada" | "saida";

/**
 * Categorias de caixa tipadas (SPEC-P1 §6).
 * São o "plano de contas" do fluxo direto: toda linha do extrato cai em uma.
 * Entradas: vendas, outras_receitas. Saídas: o resto.
 */
export type CategoriaCaixa =
  | "vendas"
  | "outras_receitas"
  | "trafego"
  | "comissoes"
  | "taxas_gateway"
  | "impostos"
  | "folha_prolabore"
  | "saas_ferramentas"
  | "producao_conteudo"
  | "reembolsos"
  | "outros";

/**
 * Status do movimento: `previsto` é projeção (ainda não bateu na conta),
 * `realizado` é extrato de verdade. O saldo real só soma realizados.
 */
export type StatusMovimento = "previsto" | "realizado";

/** Origem de negócio que gerou o movimento (rastreabilidade para conciliação). */
export type OrigemMovimento = "venda" | "matricula" | "despesa" | "comissao" | "reembolso" | "chargeback" | "manual";

/**
 * Linha do extrato de caixa (fluxo direto).
 * `dataCompetencia` = quando o fato econômico ocorreu (vai para o DRE).
 * `dataCaixa` = quando o dinheiro efetivamente entra/sai (vai para o fluxo).
 */
export interface MovimentoCaixa {
  id: string;
  direcao: DirecaoCaixa;
  categoria: CategoriaCaixa;
  contaId: string;
  descricao: string;
  valor: number; // sempre positivo; o sinal vem de `direcao`
  dataCompetencia: string; // ISO yyyy-mm-dd — regime de competência (DRE)
  dataCaixa: string; // ISO yyyy-mm-dd — liberação/pagamento efetivo (fluxo)
  status: StatusMovimento;
  braco?: Braco | null;
  origem?: OrigemMovimento;
  origemId?: string | null; // id da matrícula/despesa/comissão que originou
}

/** Situação da parcela a receber. `atrasado` = venceu e não entrou. */
export type StatusRecebivel = "a_vencer" | "recebido" | "atrasado";

/**
 * Parcela a receber (contas a receber).
 * Nasce da venda: uma matrícula em 3x gera 3 recebíveis.
 * `diasLiberacao` (D+X) é a regra do gateway aplicada sobre o vencimento.
 */
export interface Recebivel {
  id: string;
  origem: OrigemMovimento; // normalmente "matricula"
  origemId: string | null; // matriculaId
  descricao: string;
  valor: number; // valor líquido esperado na conta
  vencimento: string; // ISO yyyy-mm-dd — quando a parcela vence
  dataRecebimento: string | null; // ISO yyyy-mm-dd — null enquanto não caiu
  status: StatusRecebivel;
  gateway: Gateway;
  diasLiberacao: number; // D+X do gateway (0 = imediato)
  parcela: number; // 1..n
  totalParcelas: number;
  braco?: Braco | null;
  contaId?: string | null; // conta destino prevista
}

/** Situação da conta a pagar. */
export type StatusPagavel = "a_vencer" | "pago" | "atrasado";

/** Compromisso a pagar (contas a pagar): fornecedor, tráfego, comissão, imposto. */
export interface Pagavel {
  id: string;
  categoria: CategoriaCaixa;
  fornecedor: string;
  descricao: string;
  valor: number;
  vencimento: string; // ISO yyyy-mm-dd
  dataPagamento: string | null; // ISO yyyy-mm-dd — null enquanto não pago
  status: StatusPagavel;
  tipo: TipoDespesa; // fixa ou variável (alimenta ponto de equilíbrio)
  braco?: Braco | null;
  origem?: OrigemMovimento;
  origemId?: string | null; // despesaId / comissaoId
  contaId?: string | null;
}

/** Motivo alegado no chargeback (define a defesa). */
export type MotivoChargeback = "nao_reconhecido" | "produto_nao_entregue" | "fraude" | "duplicidade" | "insatisfacao" | "outros";

/** Andamento da disputa junto ao gateway/adquirente. */
export type StatusChargeback = "aberto" | "ganho" | "perdido";

/**
 * Chargeback — diferente de `Reembolso`.
 * Reembolso é devolução acordada com o cliente; chargeback é contestação
 * imposta pela operadora, com disputa que pode ser ganha ou perdida.
 * Só o `perdido` vira saída definitiva de caixa.
 */
export interface Chargeback {
  id: string;
  matriculaId: string;
  valor: number;
  data: string; // ISO yyyy-mm-dd — abertura da contestação
  dataResolucao: string | null; // ISO yyyy-mm-dd — quando ganhou/perdeu
  motivo: MotivoChargeback;
  status: StatusChargeback;
  gateway: Gateway;
  detalhe: string;
  braco?: Braco | null;
}

/** Regime tributário vigente (muda a alíquota efetiva sobre faturamento). */
export type RegimeTributario = "simples" | "presumido" | "real" | "mei";

/**
 * Parâmetros financeiros da operação (linha única de configuração).
 * Base de cálculo de break-even, runway e provisão de imposto —
 * sem isso as métricas de sobrevivência não têm âncora.
 */
export interface ParametrosFinanceiros {
  id: string;
  aliquotaImposto: number; // % sobre faturamento (ex.: 6 = 6%)
  regimeTributario: RegimeTributario;
  saldoInicialCaixa: number; // caixa consolidado na data de corte
  dataSaldoInicial: string; // ISO yyyy-mm-dd
  custoFixoMensal: number; // custo fixo de referência (folha + SaaS + estrutura)
  reservaMinimaCaixa: number; // colchão mínimo desejado (alerta de runway)
  atualizadoEm: string; // ISO datetime
}

/**
 * Pacote de caixa entregue pelo provider em uma tacada só —
 * espelha `DatasetFinanceiro` (competência) do lado do caixa.
 * As funções de métrica recebem este objeto e nunca fazem I/O.
 */
export interface DatasetCaixa {
  contas: ContaBancaria[];
  movimentos: MovimentoCaixa[];
  recebiveis: Recebivel[];
  pagaveis: Pagavel[];
  chargebacks: Chargeback[];
  parametros: ParametrosFinanceiros;
}

// ============================================================
// P2 — Fontes de renda: trilha do produto (módulo → aula →
// progresso do aluno) e encontros ao vivo da turma.
// ============================================================

/** Bloco de conteúdo do produto — a "trilha" antes de virar aulas. */
export interface Modulo {
  id: string;
  produtoId: string;
  nome: string;
  ordem: number;
  descricao: string;
}

/** Item consumível dentro de um módulo. */
export interface Aula {
  id: string;
  moduloId: string;
  produtoId: string; // desnormalizado — evita join módulo→produto em toda leitura de progresso
  titulo: string;
  ordem: number;
  duracaoMin: number;
  tipo: "video" | "texto" | "ao_vivo" | "tarefa";
}

/** Marca de consumo do aluno numa aula — base de métricas de engajamento/conclusão. */
export interface ProgressoAula {
  id: string;
  alunoId: string;
  aulaId: string;
  produtoId: string; // desnormalizado — evita join aula→produto ao somar progresso por produto
  concluida: boolean;
  concluidaEm: string | null; // ISO datetime — null enquanto não concluída
  minutosAssistidos: number;
}

/** Sessão ao vivo de uma turma (aula "ao_vivo", mentoria em grupo etc.), com lista de presença. */
export interface Encontro {
  id: string;
  turmaId: string;
  titulo: string;
  data: string; // ISO datetime
  presentes: string[]; // ids de aluno
}

// ---- inputs de criação (formulários) ----

export interface NovoModulo {
  produtoId: string;
  nome: string;
  ordem: number;
  descricao: string;
}

export interface NovaAula {
  moduloId: string;
  produtoId: string;
  titulo: string;
  ordem: number;
  duracaoMin: number;
  tipo: "video" | "texto" | "ao_vivo" | "tarefa";
}

export interface NovoEncontro {
  turmaId: string;
  titulo: string;
  data: string;
}

// ============================================================
// Atendimento — a conversa de WhatsApp virando ficha do cliente
//
// POR QUE `Interacao` NÃO É `Atividade`
// -------------------------------------
// `Atividade` é o que uma PESSOA anotou sobre o aluno ("liguei", "mandei
// proposta"): texto livre, digitado, sem garantia de unicidade. `Interacao` é o
// que uma MÁQUINA observou: veio do WhatsApp, tem identificador do próprio
// WhatsApp (`idExterno`) e nunca foi digitada por ninguém. Misturar as duas
// coisas na mesma tabela apagaria a diferença entre "alguém disse que
// aconteceu" e "aconteceu" — e é essa diferença que permite o sistema afirmar
// coisas sobre o funil sem estar chutando.
// ============================================================

/**
 * Uma mensagem já gravada na ficha de um cliente.
 *
 * `idExterno` é a chave de deduplicação: o agente local reenvia o histórico
 * quando reconecta (o notebook do dono fica fechado por horas), então a MESMA
 * mensagem chega várias vezes por desenho, não por bug. Duas interações para a
 * mesma mensagem inflariam a contagem de contatos e envenenariam a temperatura
 * do lead.
 */
export interface Interacao {
  id: string;
  alunoId: string;
  canal: CanalAtendimento;
  direcao: DirecaoMensagem;
  texto: string;
  /** ISO datetime do momento em que a mensagem existiu no WhatsApp. */
  quando: string;
  idExterno: string;
  /** "audio", "imagem", "documento"… vazio quando é só texto. */
  tipoMidia: string;
  /** Nome que o WhatsApp exibia. Referência do momento, não cadastro. */
  nomeExibicao: string;
  /**
   * O telefone da outra ponta, repetido aqui de propósito.
   *
   * POR QUE REPETIR SE JÁ ESTÁ NA FICHA DO ALUNO
   * --------------------------------------------
   * Porque quem abre a planilha lê a aba, não o banco. Sem esta coluna, uma
   * linha de conversa mostra `ID_Aluno` e `ID_Externo` — e o `ID_Externo` do
   * WhatsApp hoje é "36533109289004@lid_false_3A22…", um identificador interno
   * que PARECE telefone e não é. Quem olhasse a planilha leria aquilo como o
   * número do cliente e ligaria para o lugar errado.
   *
   * Também é o registro histórico: se o cliente trocar de número, a ficha passa
   * a mostrar o novo, e sem esta coluna não sobraria nenhum vestígio de por
   * qual número aquela conversa aconteceu.
   */
  telefone: string;
}

/**
 * Estado de uma mensagem na fila de saída.
 *
 * `aprovado` é o ÚNICO estado que o agente local recebe. Não existe estado
 * "rascunho virando envio sozinho": linha sem status aprovado nunca sai, porque
 * envio automático de mensagem em nome do dono é o erro que ele não pode
 * desfazer.
 */
export type StatusEnvio = "aprovado" | "enviado" | "falhou";

/** Uma mensagem de saída, do momento em que uma pessoa aprova até o resultado. */
export interface Envio {
  id: string;
  alunoId: string;
  telefone: string;
  texto: string;
  /** Quem autorizou — envio nunca é anônimo, nem quando dá errado. */
  autorizadoPor: string;
  autorizadoEm: string; // ISO datetime
  status: StatusEnvio;
  enviadoEm: string; // "" enquanto não saiu
  /** Id que o WhatsApp deu à mensagem enviada; "" quando ainda não saiu. */
  idExterno: string;
  /** Motivo da falha, preenchido só quando `status` é "falhou". */
  erro: string;
}

/** O que a tela de aprovação envia para colocar uma mensagem na fila. */
export interface NovoEnvio {
  alunoId: string;
  telefone: string;
  texto: string;
  autorizadoPor: string;
}
