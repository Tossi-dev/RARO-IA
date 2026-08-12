// MODO VAZIO — nenhuma base de dados conectada.
//
// Por que este provider existe: o painel foi aberto em produção sem nenhuma
// variável de ambiente definida e a seleção caiu no provider de demonstração.
// O dono viu faturamento, meta de afiliado e parcelas vencidas que nunca
// existiram, e tomou aquilo por operação real. Número fabricado por omissão de
// configuração é pior do que tela vazia: a tela vazia se explica sozinha, o
// número inventado convence.
//
// A regra que este arquivo materializa: dado fictício só aparece quando alguém
// pede (RARO_MODO=demo). Sem base conectada o app não estima, não completa e não
// arredonda para cima — ele devolve nada e diz que é nada.
//
// Escrita não pode fingir sucesso pelo mesmo motivo. Um `addDespesa` que resolve
// silenciosamente ensina o usuário a confiar num registro que não foi para lugar
// nenhum; por isso toda escrita aqui lança erro dizendo o que falta configurar.

import type {
  Afiliado,
  Agrupamento,
  Aluno,
  Atividade,
  Aula,
  Campanha,
  Chargeback,
  ContaBancaria,
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
  Orcamento,
  Pagavel,
  ParametrosFinanceiros,
  PerfilSocial,
  Produto,
  ProgressoAula,
  Recebivel,
  Reuniao,
  Tarefa,
  Transcricao,
  WebhookEvento,
} from "../types";
import type {
  AlunoDetalhe,
  DataProvider,
  LancamentoDetalhe,
  RegistroImportacao,
  ResultadoImportacao,
  ResultadoInteracoes,
} from "./provider";
import type { EnvioPendente } from "../atendimento/contrato";

/**
 * Erro único de escrita sem base.
 *
 * A mensagem vive num só lugar de propósito: ela é a instrução que o usuário vai
 * ler no toast, e duas variações do mesmo texto viram duas explicações
 * diferentes para a mesma causa.
 */
function semBase(): never {
  throw new Error(
    "Sem base de dados conectada: configure a planilha (RARO_SHEETS_ID) ou o Supabase para registrar dados."
  );
}

/**
 * Parâmetros financeiros zerados.
 *
 * Mesma forma que `supabase-db` usa quando a tabela ainda não foi preenchida —
 * zero em todo número, para que break-even, runway e provisão de imposto
 * apareçam como "sem base" e não como um cenário confortável. `regimeTributario`
 * não tem valor neutro no tipo; fica "simples" por ser o fallback já adotado no
 * projeto, e nenhum cálculo depende dele enquanto a alíquota é 0.
 */
function parametrosVazios(): ParametrosFinanceiros {
  return {
    id: "pf-vazio",
    aliquotaImposto: 0,
    regimeTributario: "simples",
    saldoInicialCaixa: 0,
    dataSaldoInicial: "",
    custoFixoMensal: 0,
    reservaMinimaCaixa: 0,
    atualizadoEm: "",
  };
}

export const vazioProvider: DataProvider = {
  modo: "vazio",

  // ---------- núcleo v1 ----------

  async listAfiliados(): Promise<Afiliado[]> {
    return [];
  },
  async listAlunos(): Promise<Aluno[]> {
    return [];
  },
  async getAluno(): Promise<AlunoDetalhe | null> {
    return null;
  },
  async listProdutos(): Promise<Produto[]> {
    return [];
  },
  async listMatriculas(): Promise<Matricula[]> {
    return [];
  },
  async listDespesas(): Promise<Despesa[]> {
    return [];
  },
  async listLancamentos(): Promise<Lancamento[]> {
    return [];
  },
  async getLancamento(): Promise<LancamentoDetalhe | null> {
    return null;
  },
  async dataset(): Promise<DatasetFinanceiro> {
    return { matriculas: [], despesas: [], comissoes: [], reembolsos: [] };
  },

  async addDespesa(): Promise<void> {
    semBase();
  },
  async addAluno(): Promise<void> {
    semBase();
  },
  async setStatusAluno(): Promise<void> {
    semBase();
  },
  async addLancamento(): Promise<void> {
    semBase();
  },
  async addMatricula(): Promise<void> {
    semBase();
  },
  async toggleTarefa(): Promise<void> {
    semBase();
  },
  async addReembolso(): Promise<void> {
    semBase();
  },

  // ---------- cadastro base: produto, responsável e conta ----------

  async addProduto(): Promise<void> {
    semBase();
  },
  async addResponsavel(): Promise<void> {
    semBase();
  },
  async addConta(): Promise<string> {
    semBase();
  },

  // ---------- cadastro OPCIONAL de agrupamento ----------

  async listAgrupamentos(): Promise<Agrupamento[]> {
    return [];
  },
  async addAgrupamento(): Promise<void> {
    semBase();
  },

  // ---------- expansão v2: CRM ----------

  async listEstagios(): Promise<Estagio[]> {
    // Sem base não existe nem pipeline padrão: um estágio devolvido aqui viraria
    // coluna no quadro do CRM sugerindo configuração que ninguém fez.
    return [];
  },
  async setEstagioAluno(): Promise<void> {
    semBase();
  },
  async listNotas(): Promise<Nota[]> {
    return [];
  },
  async addNota(): Promise<void> {
    semBase();
  },
  async listAtividades(): Promise<Atividade[]> {
    return [];
  },
  async addAtividade(): Promise<void> {
    semBase();
  },
  async listTarefas(): Promise<Tarefa[]> {
    return [];
  },
  async addTarefaGestao(): Promise<void> {
    semBase();
  },
  async concluirTarefa(): Promise<void> {
    semBase();
  },

  // ---------- expansão v2: reuniões e transcrições ----------

  async listReunioes(): Promise<Reuniao[]> {
    return [];
  },
  async addReuniao(): Promise<Reuniao> {
    // Assinatura devolve a reunião criada. Devolver um objeto montado na hora
    // daria à tela um id que não existe em base nenhuma.
    semBase();
  },
  async listTranscricoes(): Promise<Transcricao[]> {
    return [];
  },
  async addTranscricao(): Promise<void> {
    semBase();
  },

  // ---------- expansão v2: financeiro avançado ----------

  async listOrcamentos(): Promise<Orcamento[]> {
    return [];
  },
  async setOrcamento(): Promise<void> {
    semBase();
  },
  async listMetasFinanceiras(): Promise<MetaFinanceira[]> {
    return [];
  },
  async setMetaFinanceira(): Promise<void> {
    semBase();
  },

  // ---------- P0 fundação: metas e eventos de webhook ----------

  async listMetas(): Promise<Meta[]> {
    // Meta sem base é a raiz do incidente: foi um alvo fictício que produziu o
    // "0% da meta" atribuído a uma pessoa real na tela do dono.
    return [];
  },
  async setMeta(): Promise<void> {
    semBase();
  },
  async listEventosWebhook(): Promise<WebhookEvento[]> {
    return [];
  },

  // ---------- P1 camada de caixa ----------

  async listContasBancarias(): Promise<ContaBancaria[]> {
    return [];
  },
  async listMovimentosCaixa(): Promise<MovimentoCaixa[]> {
    return [];
  },
  async addMovimentoCaixa(): Promise<void> {
    semBase();
  },
  async listRecebiveis(): Promise<Recebivel[]> {
    return [];
  },
  async baixarRecebivel(): Promise<void> {
    semBase();
  },
  async listPagaveis(): Promise<Pagavel[]> {
    return [];
  },
  async baixarPagavel(): Promise<void> {
    semBase();
  },
  async listChargebacks(): Promise<Chargeback[]> {
    return [];
  },
  async getParametrosFinanceiros(): Promise<ParametrosFinanceiros> {
    return parametrosVazios();
  },
  async setParametrosFinanceiros(): Promise<void> {
    semBase();
  },
  async datasetCaixa(): Promise<DatasetCaixa> {
    return {
      contas: [],
      movimentos: [],
      recebiveis: [],
      pagaveis: [],
      chargebacks: [],
      parametros: parametrosVazios(),
    };
  },

  // ---------- importação de extrato bancário ----------

  async listImportacoes(): Promise<RegistroImportacao[]> {
    return [];
  },
  async importarExtrato(): Promise<ResultadoImportacao> {
    // Recusa explícita: sem base conectada não há onde gravar o movimento nem
    // onde registrar a procedência, e fingir sucesso ensinaria quem confirmou
    // a importação a confiar num extrato que nunca chegou a lugar nenhum.
    semBase();
  },

  // ---------- expansão v2: conteúdo e redes ----------

  async listPerfisSociais(): Promise<PerfilSocial[]> {
    return [];
  },
  async listConteudos(): Promise<ConteudoView[]> {
    return [];
  },
  async getConteudo(): Promise<null> {
    return null;
  },
  async setPilar(): Promise<void> {
    semBase();
  },
  async listCampanhas(): Promise<Campanha[]> {
    return [];
  },
  async addCampanha(): Promise<void> {
    semBase();
  },

  // ---------- P2 — fontes de renda: trilha do produto e encontros ----------

  async listModulos(): Promise<Modulo[]> {
    return [];
  },
  async listAulas(): Promise<Aula[]> {
    return [];
  },
  async listProgresso(): Promise<ProgressoAula[]> {
    return [];
  },
  async listEncontros(): Promise<Encontro[]> {
    return [];
  },

  // ---------- atendimento: WhatsApp ----------

  async listInteracoes(): Promise<Interacao[]> {
    return [];
  },
  async registrarInteracoes(): Promise<ResultadoInteracoes> {
    // Recusa explícita, e não um `{ gravadas: 0 }` silencioso: o agente local
    // roda desatendido no Mac do dono e trata "gravadas: 0" como sucesso — ele
    // apagaria da fila local mensagens que nunca chegaram a lugar nenhum, e
    // esse histórico não volta. Erro aqui faz o agente segurar e tentar de novo.
    semBase();
  },
  async listEnvios(): Promise<Envio[]> {
    return [];
  },
  async listEnviosPendentes(): Promise<EnvioPendente[]> {
    return [];
  },
  async aprovarEnvio(): Promise<string> {
    semBase();
  },
  async registrarResultadoEnvio(): Promise<number> {
    semBase();
  },
};
