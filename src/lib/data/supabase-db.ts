// Provider Supabase (dados reais). Ativado quando NEXT_PUBLIC_SUPABASE_URL +
// NEXT_PUBLIC_SUPABASE_ANON_KEY existem no ambiente.
// ATENÇÃO: escrito contra o schema de supabase/migrations/0001_schema.sql.
//    Validar ponta a ponta na primeira conexão com o projeto real.

import { calcComissao, calcLiquido } from "../domain";
import { criarSupabaseServer } from "../supabase/server";
import { categoriaValida } from "../fontes";
import type {
  Afiliado,
  Agrupamento,
  Aluno,
  Atividade,
  Aula,
  CallResumo,
  Campanha,
  Chargeback,
  Comissao,
  ContaBancaria,
  Conteudo,
  ConteudoMetrica,
  ConteudoPilar,
  ConteudoView,
  DatasetCaixa,
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
  NovaConta,
  NovaDespesa,
  NovaMatricula,
  NovoAgrupamento,
  NovoAluno,
  NovoEnvio,
  NovoLancamento,
  NovoProduto,
  NovoReembolso,
  NovoResponsavel,
  Orcamento,
  Pagavel,
  ParametrosFinanceiros,
  PerfilSocial,
  PontoRetencao,
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
} from "../atendimento/contrato";
import { planejarRecepcao } from "../atendimento/recepcao";
import { podeGravarSozinha, sugerirEstagio } from "../atendimento/estagio";
import type { LinhaExtrato, OrigemExtrato } from "../extrato/extrato";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

const mapAfiliado = (r: Row): Afiliado => ({
  id: r.id, nome: r.nome, braco: r.braco, pctPadrao: Number(r.pct_padrao), ativo: r.ativo,
  metaMensal: r.meta_mensal != null ? Number(r.meta_mensal) : undefined,
  whatsapp: r.whatsapp ?? undefined, chavePix: r.chave_pix ?? undefined,
});
const mapAluno = (r: Row): Aluno => ({
  id: r.id, nome: r.nome, telefone: r.telefone ?? "", email: r.email ?? "",
  statusFunil: r.status_funil, estagioId: r.estagio_id ?? null, origem: r.origem ?? "",
  primeiroContato: r.primeiro_contato ?? "", observacoes: r.observacoes ?? "",
});
const mapProduto = (r: Row): Produto => ({
  id: r.id, nome: r.nome, tipo: r.tipo, precoBase: Number(r.preco_base), ativo: r.ativo,
  braco: r.braco ?? null, categoria: categoriaValida(r.categoria),
});
const mapLancamento = (r: Row): Lancamento => ({
  id: r.id, nome: r.nome, produtoId: r.produto_id, inicio: r.inicio, fim: r.fim,
  status: r.status, metaFaturamento: Number(r.meta_faturamento), descricao: r.descricao ?? "",
});
const mapTurma = (r: Row): Turma => ({
  id: r.id, lancamentoId: r.lancamento_id, nome: r.nome, vagas: r.vagas ?? 0,
  inicio: r.inicio ?? null, fim: r.fim ?? null, status: r.status ?? "planejada",
});
const mapMatricula = (r: Row): Matricula => ({
  id: r.id, alunoId: r.aluno_id, produtoId: r.produto_id, lancamentoId: r.lancamento_id,
  afiliadoId: r.afiliado_id, turmaId: r.turma_id, valor: Number(r.valor), formaPgto: r.forma_pgto,
  valorLiquido: Number(r.valor_liquido), data: r.data, statusPagamento: r.status_pagamento,
  origem: r.origem ?? "manual", isUpsell: Boolean(r.is_upsell),
  alunoNome: r.alunos?.nome, produtoNome: r.produtos?.nome, afiliadoNome: r.afiliados?.nome ?? null,
});
const mapComissao = (r: Row): Comissao => ({
  id: r.id, matriculaId: r.matricula_id, afiliadoId: r.afiliado_id,
  pct: Number(r.pct), valor: Number(r.valor), data: r.data,
});
const mapReembolso = (r: Row): Reembolso => ({
  id: r.id, matriculaId: r.matricula_id, valor: Number(r.valor), data: r.data, motivo: r.motivo ?? "",
});
const mapDespesa = (r: Row): Despesa => ({
  id: r.id, data: r.data, descricao: r.descricao, categoria: r.categoria,
  tipo: r.tipo, valor: Number(r.valor),
});
const mapTarefa = (r: Row): TarefaAluno => ({
  id: r.id, turmaId: r.turma_id, alunoId: r.aluno_id, alunoNome: r.alunos?.nome,
  titulo: r.titulo, concluida: r.concluida,
});
const mapCall = (r: Row): CallResumo => ({
  id: r.id, lancamentoId: r.lancamento_id, data: r.data, titulo: r.titulo, resumo: r.resumo ?? "",
});

const SEL_MATRICULA = "*, alunos(nome), produtos(nome), afiliados(nome)";

// ---- maps da expansão v2 ----
const mapEstagio = (r: Row): Estagio => ({
  id: r.id, nome: r.nome, ordem: r.ordem ?? 0, cor: r.cor ?? "cinza", funil: r.funil,
});
const mapNota = (r: Row): Nota => ({
  id: r.id, alunoId: r.aluno_id, autor: r.autor ?? "", texto: r.texto ?? "", criadoEm: r.criado_em,
});
const mapAtividade = (r: Row): Atividade => ({
  id: r.id, alunoId: r.aluno_id, tipo: r.tipo, titulo: r.titulo ?? "", detalhe: r.detalhe ?? "", data: r.data,
});
const mapTarefaG = (r: Row): Tarefa => ({
  id: r.id, titulo: r.titulo, detalhe: r.detalhe ?? "", alunoId: r.aluno_id ?? null,
  lancamentoId: r.lancamento_id ?? null, responsavel: r.responsavel ?? "",
  prazo: r.prazo ?? null, prioridade: r.prioridade ?? "media", status: r.status ?? "pendente",
});
const mapReuniao = (r: Row): Reuniao => ({
  id: r.id, titulo: r.titulo, inicio: r.inicio, fim: r.fim ?? null, comQuem: r.com_quem ?? "",
  alunoId: r.aluno_id ?? null, lancamentoId: r.lancamento_id ?? null, turmaId: r.turma_id ?? null,
  status: r.status ?? "agendada", link: r.link ?? "", googleEventId: r.google_event_id ?? "",
});
const mapTranscricao = (r: Row): Transcricao => ({
  id: r.id, reuniaoId: r.reuniao_id, origem: r.origem ?? "manual", texto: r.texto ?? "",
  resumo: r.resumo ?? "", criadoEm: r.criado_em,
});
const mapOrcamento = (r: Row): Orcamento => ({
  id: r.id, categoria: r.categoria, periodo: r.periodo, valorPrevisto: Number(r.valor_previsto),
});
const mapMetaFin = (r: Row): MetaFinanceira => ({
  id: r.id, tipo: r.tipo, periodo: r.periodo, alvo: Number(r.alvo),
});
const mapPerfil = (r: Row): PerfilSocial => ({
  id: r.id, plataforma: r.plataforma, handle: r.handle ?? "", seguidores: r.seguidores ?? 0,
  conectado: Boolean(r.conectado), atualizadoEm: r.atualizado_em,
});
const mapConteudo = (r: Row): Conteudo => ({
  id: r.id, perfilId: r.perfil_id, plataforma: r.perfis_sociais?.plataforma,
  perfilHandle: r.perfis_sociais?.handle, tipo: r.tipo, titulo: r.titulo ?? "",
  url: r.url ?? "", publicadoEm: r.publicado_em ?? "", duracaoSeg: r.duracao_seg ?? 0,
  roteiro: r.roteiro ?? "",
});
const mapMetrica = (r: Row): ConteudoMetrica => ({
  conteudoId: r.conteudo_id, coletadoEm: r.coletado_em, views: r.views ?? 0, likes: r.likes ?? 0,
  comentarios: r.comentarios ?? 0, compartilhamentos: r.compartilhamentos ?? 0,
  salvamentos: r.salvamentos ?? 0, alcance: r.alcance ?? 0,
  tempoMedioSeg: Number(r.tempo_medio_seg ?? 0), retencaoMedia: Number(r.retencao_media ?? 0),
});
const mapPontoRet = (r: Row): PontoRetencao => ({
  conteudoId: r.conteudo_id, pontoPct: r.ponto_pct ?? 0, retencaoPct: Number(r.retencao_pct ?? 0),
});
const mapPilar = (r: Row): ConteudoPilar => ({
  id: r.id, conteudoId: r.conteudo_id, pilar: r.pilar, texto: r.texto ?? "",
  nota: r.nota === null || r.nota === undefined ? null : Number(r.nota),
});
const mapCampanha = (r: Row): Campanha => ({
  id: r.id, nome: r.nome, tipo: r.tipo, canal: r.canal ?? "multi", objetivo: r.objetivo ?? "",
  orcamento: Number(r.orcamento ?? 0), inicio: r.inicio, fim: r.fim ?? null,
  conteudoId: r.conteudo_id ?? null,
});

// ---- maps da P2 — fontes de renda: trilha do produto e encontros ----
const mapModulo = (r: Row): Modulo => ({
  id: String(r.id), produtoId: r.produto_id, nome: r.nome ?? "", ordem: Number(r.ordem ?? 0),
  descricao: r.descricao ?? "",
});
const mapAula = (r: Row): Aula => ({
  id: String(r.id), moduloId: r.modulo_id, produtoId: r.produto_id, titulo: r.titulo ?? "",
  ordem: Number(r.ordem ?? 0), duracaoMin: Number(r.duracao_min ?? 0), tipo: r.tipo ?? "video",
});
const mapProgressoAula = (r: Row): ProgressoAula => ({
  id: String(r.id), alunoId: r.aluno_id, aulaId: r.aula_id, produtoId: r.produto_id,
  concluida: Boolean(r.concluida), concluidaEm: r.concluida_em ?? null,
  minutosAssistidos: Number(r.minutos_assistidos ?? 0),
});
const mapEncontro = (r: Row): Encontro => ({
  id: String(r.id), turmaId: r.turma_id, titulo: r.titulo ?? "", data: r.data,
  presentes: Array.isArray(r.presentes) ? r.presentes.map(String) : [],
});

// ---- cadastro OPCIONAL de agrupamento ----
const mapAgrupamento = (r: Row): Agrupamento => ({
  id: String(r.id), nome: r.nome ?? "", cor: r.cor ?? "", ordem: Number(r.ordem ?? 0),
  ativo: r.ativo ?? true,
});

// ---------- P1: camada de caixa (snake_case → camelCase) ----------
const mapContaBancaria = (r: Row): ContaBancaria => ({
  id: String(r.id), nome: r.nome ?? "", tipo: r.tipo, saldoInicial: Number(r.saldo_inicial ?? 0),
  dataSaldoInicial: String(r.data_saldo_inicial), ativa: !!r.ativa, braco: r.braco ?? null,
});
const mapMovimentoCaixa = (r: Row): MovimentoCaixa => ({
  id: String(r.id), direcao: r.direcao, categoria: r.categoria, contaId: String(r.conta_id ?? ""),
  descricao: r.descricao ?? "", valor: Number(r.valor ?? 0),
  dataCompetencia: String(r.data_competencia), dataCaixa: String(r.data_caixa),
  status: r.status, braco: r.braco ?? null, origem: r.origem ?? "manual",
  origemId: r.origem_id ?? null,
});
const mapRecebivel = (r: Row): Recebivel => ({
  id: String(r.id), origem: r.origem ?? "matricula", origemId: r.origem_id ?? null,
  descricao: r.descricao ?? "", valor: Number(r.valor ?? 0), vencimento: String(r.vencimento),
  dataRecebimento: r.data_recebimento ?? null, status: r.status, gateway: r.gateway ?? "manual",
  diasLiberacao: Number(r.dias_liberacao ?? 0), parcela: Number(r.parcela ?? 1),
  totalParcelas: Number(r.total_parcelas ?? 1), braco: r.braco ?? null, contaId: r.conta_id ?? null,
});
const mapPagavel = (r: Row): Pagavel => ({
  id: String(r.id), categoria: r.categoria, fornecedor: r.fornecedor ?? "", descricao: r.descricao ?? "",
  valor: Number(r.valor ?? 0), vencimento: String(r.vencimento), dataPagamento: r.data_pagamento ?? null,
  status: r.status, tipo: r.tipo ?? "variavel", braco: r.braco ?? null,
  origem: r.origem ?? "manual", origemId: r.origem_id ?? null, contaId: r.conta_id ?? null,
});
const mapChargeback = (r: Row): Chargeback => ({
  id: String(r.id), matriculaId: String(r.matricula_id), valor: Number(r.valor ?? 0),
  data: String(r.data), dataResolucao: r.data_resolucao ?? null, motivo: r.motivo ?? "outros",
  status: r.status ?? "aberto", gateway: r.gateway ?? "manual", detalhe: r.detalhe ?? "",
  braco: r.braco ?? null,
});
const mapImportacao = (r: Row): RegistroImportacao => ({
  id: String(r.id), impressaoDigital: r.impressao_digital, data: String(r.data),
  descricao: r.descricao ?? "", valor: Number(r.valor ?? 0), tipo: r.tipo,
  documento: r.documento ?? "", origem: r.origem, contaId: String(r.conta_id ?? ""),
  movimentoId: String(r.movimento_id ?? ""), importadoEm: String(r.importado_em),
});
const mapInteracao = (r: Row): Interacao => ({
  id: String(r.id), alunoId: String(r.aluno_id ?? ""), canal: "whatsapp",
  direcao: r.direcao === "enviada" ? "enviada" : "recebida", texto: r.texto ?? "",
  quando: String(r.quando ?? ""), idExterno: String(r.id_externo ?? ""),
  tipoMidia: r.tipo_midia ?? "", nomeExibicao: r.nome_exibicao ?? "",
  telefone: String(r.telefone ?? ""),
});
const mapEnvio = (r: Row): Envio => ({
  id: String(r.id), alunoId: String(r.aluno_id ?? ""), telefone: r.telefone ?? "",
  texto: r.texto ?? "", autorizadoPor: r.autorizado_por ?? "",
  autorizadoEm: String(r.autorizado_em ?? ""),
  // Status irreconhecível NÃO vira "aprovado": cair no neutro aqui entregaria
  // ao agente local uma mensagem que ninguém autorizou.
  status: r.status === "enviado" ? "enviado" : r.status === "aprovado" ? "aprovado" : "falhou",
  enviadoEm: String(r.enviado_em ?? ""), idExterno: String(r.id_externo ?? ""),
  erro: r.erro ?? "",
});
const mapParametros = (r: Row): ParametrosFinanceiros => ({
  id: String(r.id), aliquotaImposto: Number(r.aliquota_imposto ?? 0),
  regimeTributario: r.regime_tributario ?? "simples",
  saldoInicialCaixa: Number(r.saldo_inicial_caixa ?? 0),
  dataSaldoInicial: String(r.data_saldo_inicial), custoFixoMensal: Number(r.custo_fixo_mensal ?? 0),
  reservaMinimaCaixa: Number(r.reserva_minima_caixa ?? 0), atualizadoEm: String(r.atualizado_em),
});

/** Fallback quando parametros_financeiros ainda não foi preenchida — nunca quebra a tela. */
const PARAMETROS_PADRAO: ParametrosFinanceiros = {
  id: "pf-padrao",
  aliquotaImposto: 0,
  regimeTributario: "simples",
  saldoInicialCaixa: 0,
  dataSaldoInicial: new Date().toISOString().slice(0, 10),
  custoFixoMensal: 0,
  reservaMinimaCaixa: 0,
  atualizadoEm: new Date().toISOString(),
};

function ok<T>(data: T | null, error: { message: string } | null): T {
  if (error) throw new Error(`Supabase: ${error.message}`);
  return (data ?? []) as T;
}

/**
 * Como `ok`, mas trata "a tabela não existe" (42P01) como ausência legítima de
 * base, não como falha: as quatro entidades de trilha de conteúdo (P2) podem
 * não ter a migração aplicada ainda em toda instalação. Qualquer outro erro
 * (permissão, coluna renomeada, conexão) continua lançando — isso é falha de
 * verdade, não "sem base".
 */
function okOuVazia<T>(data: T | null, error: { message: string; code?: string } | null): T {
  if (error) {
    if (error.code === "42P01") return [] as unknown as T;
    throw new Error(`Supabase: ${error.message}`);
  }
  return (data ?? []) as T;
}

export const supabaseProvider: DataProvider = {
  modo: "supabase",

  async listAfiliados() {
    const s = criarSupabaseServer();
    const { data, error } = await s.from("afiliados").select("*").order("nome");
    return ok<Row[]>(data, error).map(mapAfiliado);
  },
  async listAlunos() {
    const s = criarSupabaseServer();
    const { data, error } = await s.from("alunos").select("*").order("nome");
    return ok<Row[]>(data, error).map(mapAluno);
  },
  async getAluno(id: string): Promise<AlunoDetalhe | null> {
    const s = criarSupabaseServer();
    const { data: aluno } = await s.from("alunos").select("*").eq("id", id).maybeSingle();
    if (!aluno) return null;
    const { data: mats, error } = await s
      .from("matriculas").select(SEL_MATRICULA).eq("aluno_id", id).order("data", { ascending: false });
    return { aluno: mapAluno(aluno), matriculas: ok<Row[]>(mats, error).map(mapMatricula) };
  },
  async listProdutos() {
    const s = criarSupabaseServer();
    const { data, error } = await s.from("produtos").select("*").order("preco_base");
    return ok<Row[]>(data, error).map(mapProduto);
  },
  async listMatriculas() {
    const s = criarSupabaseServer();
    const { data, error } = await s
      .from("matriculas").select(SEL_MATRICULA).order("data", { ascending: false });
    return ok<Row[]>(data, error).map(mapMatricula);
  },
  async listDespesas() {
    const s = criarSupabaseServer();
    const { data, error } = await s.from("despesas").select("*").order("data", { ascending: false });
    return ok<Row[]>(data, error).map(mapDespesa);
  },
  async listLancamentos() {
    const s = criarSupabaseServer();
    const { data, error } = await s.from("lancamentos").select("*").order("inicio", { ascending: false });
    return ok<Row[]>(data, error).map(mapLancamento);
  },
  async getLancamento(id: string): Promise<LancamentoDetalhe | null> {
    const s = criarSupabaseServer();
    const { data: lanc } = await s.from("lancamentos").select("*").eq("id", id).maybeSingle();
    if (!lanc) return null;
    const [{ data: prod }, { data: tur }, { data: mats }, { data: tar }, { data: cal }] =
      await Promise.all([
        s.from("produtos").select("*").eq("id", lanc.produto_id).maybeSingle(),
        s.from("turmas").select("*").eq("lancamento_id", id),
        s.from("matriculas").select(SEL_MATRICULA).eq("lancamento_id", id).order("data", { ascending: false }),
        s.from("tarefas_alunos").select("*, alunos(nome)").order("titulo"),
        s.from("calls_resumos").select("*").eq("lancamento_id", id).order("data", { ascending: false }),
      ]);
    const turmas = (tur ?? []).map(mapTurma);
    const turmaIds = new Set(turmas.map((t) => t.id));
    const matriculas = (mats ?? []).map(mapMatricula);
    const matIds = new Set(matriculas.map((m) => m.id));
    const { data: rees } = await s.from("reembolsos").select("*");
    return {
      lancamento: mapLancamento(lanc),
      produto: prod ? mapProduto(prod) : null,
      turmas,
      matriculas,
      tarefas: (tar ?? []).map(mapTarefa).filter((t) => turmaIds.has(t.turmaId)),
      calls: (cal ?? []).map(mapCall),
      reembolsos: (rees ?? []).map(mapReembolso).filter((r) => matIds.has(r.matriculaId)),
    };
  },
  async dataset() {
    const s = criarSupabaseServer();
    const [mats, desp, com, ree] = await Promise.all([
      s.from("matriculas").select(SEL_MATRICULA),
      s.from("despesas").select("*"),
      s.from("comissoes").select("*"),
      s.from("reembolsos").select("*"),
    ]);
    return {
      matriculas: ok<Row[]>(mats.data, mats.error).map(mapMatricula),
      despesas: ok<Row[]>(desp.data, desp.error).map(mapDespesa),
      comissoes: ok<Row[]>(com.data, com.error).map(mapComissao),
      reembolsos: ok<Row[]>(ree.data, ree.error).map(mapReembolso),
    };
  },

  async addDespesa(d: NovaDespesa) {
    const s = criarSupabaseServer();
    const { error } = await s.from("despesas").insert({
      data: d.data, descricao: d.descricao, categoria: d.categoria, tipo: d.tipo, valor: d.valor,
    });
    if (error) throw new Error(error.message);
  },
  async addAluno(a: NovoAluno) {
    const s = criarSupabaseServer();
    const { error } = await s.from("alunos").insert({
      nome: a.nome, telefone: a.telefone, email: a.email, status_funil: a.statusFunil,
      origem: a.origem, observacoes: a.observacoes,
      primeiro_contato: new Date().toISOString().slice(0, 10),
    });
    if (error) throw new Error(error.message);
  },
  async setStatusAluno(id: string, status: StatusFunil) {
    const s = criarSupabaseServer();
    const { error } = await s.from("alunos").update({ status_funil: status }).eq("id", id);
    if (error) throw new Error(error.message);
  },
  async addLancamento(l: NovoLancamento) {
    const s = criarSupabaseServer();
    const { error } = await s.from("lancamentos").insert({
      nome: l.nome, produto_id: l.produtoId, inicio: l.inicio, fim: l.fim,
      status: "planejado", meta_faturamento: l.metaFaturamento, descricao: l.descricao,
    });
    if (error) throw new Error(error.message);
  },
  async addMatricula(m: NovaMatricula) {
    const s = criarSupabaseServer();
    const liquido = calcLiquido(m.valor, m.formaPgto);
    const [{ data: afil }, { data: prod }, { count: compras }] = await Promise.all([
      m.afiliadoId
        ? s.from("afiliados").select("*").eq("id", m.afiliadoId).maybeSingle()
        : Promise.resolve({ data: null } as { data: Row | null }),
      s.from("produtos").select("tipo, nome").eq("id", m.produtoId).maybeSingle(),
      s.from("matriculas").select("id", { count: "exact", head: true }).eq("aluno_id", m.alunoId),
    ]);
    const isUpsell = (compras ?? 0) > 0 && (prod?.tipo ?? "low_ticket") !== "low_ticket";
    const { data: inserida, error } = await s
      .from("matriculas")
      .insert({
        aluno_id: m.alunoId, produto_id: m.produtoId, lancamento_id: m.lancamentoId,
        afiliado_id: afil && Number(afil.pct_padrao) > 0 ? m.afiliadoId : null,
        valor: m.valor, forma_pgto: m.formaPgto, valor_liquido: liquido,
        data: m.data, status_pagamento: "pago", origem: "manual", is_upsell: isUpsell,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await s.from("atividades").insert({
      aluno_id: m.alunoId, tipo: "compra",
      titulo: `Compra — ${prod?.nome ?? "produto"}${isUpsell ? " (upsell)" : ""}`,
      detalhe: `R$ ${m.valor.toFixed(2)}`,
    });
    if (afil && Number(afil.pct_padrao) > 0) {
      const { error: e2 } = await s.from("comissoes").insert({
        matricula_id: inserida.id, afiliado_id: m.afiliadoId,
        pct: Number(afil.pct_padrao), valor: calcComissao(m.valor, Number(afil.pct_padrao)),
        data: m.data,
      });
      if (e2) throw new Error(e2.message);
    }
  },
  async toggleTarefa(id: string) {
    const s = criarSupabaseServer();
    const { data: t } = await s.from("tarefas_alunos").select("concluida").eq("id", id).maybeSingle();
    if (!t) return;
    const { error } = await s.from("tarefas_alunos").update({ concluida: !t.concluida }).eq("id", id);
    if (error) throw new Error(error.message);
  },
  async addReembolso(r: NovoReembolso) {
    const s = criarSupabaseServer();
    const { error } = await s.from("reembolsos").insert({
      matricula_id: r.matriculaId, valor: r.valor, data: r.data, motivo: r.motivo,
    });
    if (error) throw new Error(error.message);
    await s.from("matriculas").update({ status_pagamento: "reembolsado" }).eq("id", r.matriculaId);
  },

  // ----- cadastro base: produto, responsável e conta -----
  async addProduto(p: NovoProduto) {
    const s = criarSupabaseServer();
    const { error } = await s.from("produtos").insert({
      nome: p.nome, tipo: p.tipo, preco_base: p.precoBase, ativo: p.ativo,
      braco: p.braco, categoria: p.categoria,
    });
    if (error) throw new Error(error.message);
  },
  async addResponsavel(r: NovoResponsavel) {
    const s = criarSupabaseServer();
    const { error } = await s.from("afiliados").insert({
      nome: r.nome, braco: r.braco, pct_padrao: r.comissaoPadrao,
      meta_mensal: r.metaMensal, ativo: true,
    });
    if (error) throw new Error(error.message);
  },
  async addConta(c: NovaConta): Promise<string> {
    const s = criarSupabaseServer();
    // `.select("id").single()` na MESMA chamada: o Postgres devolve a linha
    // criada de graca, e assim o id nao depende de uma segunda leitura (que
    // no modo planilha esbarra em cache -- ver a nota em provider.ts).
    const { data, error } = await s
      .from("contas_bancarias")
      .insert({
        nome: c.nome, tipo: c.tipo, saldo_inicial: c.saldoInicial,
        data_saldo_inicial: new Date().toISOString().slice(0, 10),
        ativa: true, braco: c.braco ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return String(data?.id ?? "");
  },

  // ----- cadastro OPCIONAL de agrupamento -----
  async listAgrupamentos() {
    const s = criarSupabaseServer();
    // `okOuVazia`, como na trilha de conteúdo (P2): a migração desta tabela
    // pode não existir ainda em toda instalação, e "sem tabela" aqui é
    // exatamente "sem agrupamento cadastrado" — não é falha.
    const { data, error } = await s.from("agrupamentos").select("*").order("ordem");
    return okOuVazia<Row[]>(data, error).map(mapAgrupamento);
  },
  async addAgrupamento(a: NovoAgrupamento) {
    const s = criarSupabaseServer();
    const { error } = await s.from("agrupamentos").insert({
      nome: a.nome, cor: a.cor, ordem: a.ordem ?? 0, ativo: true,
    });
    if (error) throw new Error(error.message);
  },

  // ----- expansão v2: CRM -----
  async listEstagios() {
    const s = criarSupabaseServer();
    const { data, error } = await s.from("crm_estagios").select("*").order("ordem");
    return ok<Row[]>(data, error).map(mapEstagio);
  },
  async setEstagioAluno(alunoId, estagio) {
    const s = criarSupabaseServer();
    const { error } = await s
      .from("alunos")
      .update({ estagio_id: estagio.id, status_funil: estagio.funil })
      .eq("id", alunoId);
    if (error) throw new Error(error.message);
  },
  async listNotas(alunoId) {
    const s = criarSupabaseServer();
    const { data, error } = await s
      .from("notas").select("*").eq("aluno_id", alunoId).order("criado_em", { ascending: false });
    return ok<Row[]>(data, error).map(mapNota);
  },
  async addNota(n) {
    const s = criarSupabaseServer();
    const { error } = await s.from("notas").insert({ aluno_id: n.alunoId, autor: n.autor, texto: n.texto });
    if (error) throw new Error(error.message);
  },
  async listAtividades(alunoId) {
    const s = criarSupabaseServer();
    let q = s.from("atividades").select("*").order("data", { ascending: false }).limit(500);
    if (alunoId) q = q.eq("aluno_id", alunoId);
    const { data, error } = await q;
    return ok<Row[]>(data, error).map(mapAtividade);
  },
  async addAtividade(a) {
    const s = criarSupabaseServer();
    const { error } = await s
      .from("atividades")
      .insert({ aluno_id: a.alunoId, tipo: a.tipo, titulo: a.titulo, detalhe: a.detalhe });
    if (error) throw new Error(error.message);
  },
  async listTarefas() {
    const s = criarSupabaseServer();
    const { data, error } = await s.from("tarefas").select("*").order("prazo", { ascending: true });
    const lista = ok<Row[]>(data, error).map(mapTarefaG);
    return lista.sort((a, b) => (a.status !== b.status ? (a.status === "pendente" ? -1 : 1) : 0));
  },
  async addTarefaGestao(t) {
    const s = criarSupabaseServer();
    const { error } = await s.from("tarefas").insert({
      titulo: t.titulo, detalhe: t.detalhe, aluno_id: t.alunoId, lancamento_id: t.lancamentoId,
      responsavel: t.responsavel, prazo: t.prazo, prioridade: t.prioridade,
    });
    if (error) throw new Error(error.message);
  },
  async concluirTarefa(id) {
    const s = criarSupabaseServer();
    const { data: t } = await s.from("tarefas").select("status").eq("id", id).maybeSingle();
    if (!t) return;
    const { error } = await s
      .from("tarefas")
      .update({ status: t.status === "pendente" ? "concluida" : "pendente" })
      .eq("id", id);
    if (error) throw new Error(error.message);
  },

  // ----- expansão v2: reuniões e transcrições -----
  async listReunioes() {
    const s = criarSupabaseServer();
    const { data, error } = await s.from("reunioes").select("*").order("inicio");
    return ok<Row[]>(data, error).map(mapReuniao);
  },
  async addReuniao(r) {
    const s = criarSupabaseServer();
    const { data, error } = await s
      .from("reunioes")
      .insert({
        titulo: r.titulo, inicio: r.inicio, fim: r.fim, com_quem: r.comQuem,
        aluno_id: r.alunoId, lancamento_id: r.lancamentoId, turma_id: r.turmaId,
        link: r.linkExterno ?? r.link ?? "", google_event_id: r.googleEventId ?? "",
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return mapReuniao(data);
  },
  async listTranscricoes(reuniaoId) {
    const s = criarSupabaseServer();
    let q = s.from("transcricoes").select("*").order("criado_em", { ascending: false });
    if (reuniaoId) q = q.eq("reuniao_id", reuniaoId);
    const { data, error } = await q;
    return ok<Row[]>(data, error).map(mapTranscricao);
  },
  async addTranscricao(t) {
    const s = criarSupabaseServer();
    const { error } = await s
      .from("transcricoes")
      .insert({ reuniao_id: t.reuniaoId, origem: t.origem, texto: t.texto, resumo: t.resumo });
    if (error) throw new Error(error.message);
    await s.from("reunioes").update({ status: "realizada" }).eq("id", t.reuniaoId).eq("status", "agendada");
  },

  // ----- expansão v2: financeiro avançado -----
  async listOrcamentos() {
    const s = criarSupabaseServer();
    const { data, error } = await s.from("orcamentos").select("*");
    return ok<Row[]>(data, error).map(mapOrcamento);
  },
  async setOrcamento(categoria, periodo, valorPrevisto) {
    const s = criarSupabaseServer();
    const { error } = await s
      .from("orcamentos")
      .upsert({ categoria, periodo, valor_previsto: valorPrevisto }, { onConflict: "categoria,periodo" });
    if (error) throw new Error(error.message);
  },
  async listMetasFinanceiras() {
    const s = criarSupabaseServer();
    const { data, error } = await s.from("metas_financeiras").select("*");
    return ok<Row[]>(data, error).map(mapMetaFin);
  },
  async setMetaFinanceira(tipo, periodo, alvo) {
    const s = criarSupabaseServer();
    const { error } = await s
      .from("metas_financeiras")
      .upsert({ tipo, periodo, alvo }, { onConflict: "tipo,periodo" });
    if (error) throw new Error(error.message);
  },

  // ----- P0 fundação: metas generalizadas + eventos de webhook -----
  async listMetas() {
    const s = criarSupabaseServer();
    const { data, error } = await s.from("metas").select("*").order("periodo", { ascending: false });
    return ok<Row[]>(data, error).map((r) => ({
      id: String(r.id),
      indicador: r.indicador as Meta["indicador"],
      escopo: r.escopo as Meta["escopo"],
      escopoRef: (r.escopo_ref as string | null) ?? null,
      periodo: String(r.periodo),
      valor: Number(r.valor),
    }));
  },
  async setMeta(m) {
    const s = criarSupabaseServer();
    const { error } = await s.from("metas").upsert(
      {
        indicador: m.indicador,
        escopo: m.escopo,
        escopo_ref: m.escopoRef,
        periodo: m.periodo,
        valor: m.valor,
      },
      { onConflict: "indicador,escopo,escopo_ref,periodo" }
    );
    if (error) throw new Error(error.message);
  },
  async listEventosWebhook() {
    const s = criarSupabaseServer();
    const { data, error } = await s
      .from("webhook_eventos")
      .select("*")
      .order("recebido_em", { ascending: false })
      .limit(100);
    return ok<Row[]>(data, error).map((r) => ({
      id: String(r.id),
      tipo: r.tipo as WebhookEvento["tipo"],
      gateway: r.gateway as WebhookEvento["gateway"],
      valor: Number(r.valor),
      taxa: Number(r.taxa ?? 0),
      status: r.status as WebhookEvento["status"],
      transacaoRef: String(r.transacao_ref ?? ""),
      detalhe: String(r.detalhe ?? ""),
      recebidoEm: String(r.recebido_em),
    }));
  },

  // ----- P1 camada de caixa -----
  async listContasBancarias() {
    const s = criarSupabaseServer();
    const { data, error } = await s.from("contas_bancarias").select("*").order("nome");
    return ok<Row[]>(data, error).map(mapContaBancaria);
  },
  async listMovimentosCaixa() {
    const s = criarSupabaseServer();
    const { data, error } = await s.from("movimentos_caixa").select("*").order("data_caixa");
    return ok<Row[]>(data, error).map(mapMovimentoCaixa);
  },
  async addMovimentoCaixa(m) {
    const s = criarSupabaseServer();
    const { error } = await s.from("movimentos_caixa").insert({
      direcao: m.direcao,
      categoria: m.categoria,
      conta_id: m.contaId || null,
      descricao: m.descricao,
      valor: m.valor,
      data_competencia: m.dataCompetencia,
      data_caixa: m.dataCaixa,
      status: m.status,
      braco: m.braco ?? null,
      origem: m.origem ?? "manual",
      origem_id: m.origemId ?? null,
    });
    if (error) throw new Error(error.message);
  },
  async listRecebiveis() {
    const s = criarSupabaseServer();
    const { data, error } = await s.from("recebiveis").select("*").order("vencimento");
    return ok<Row[]>(data, error).map(mapRecebivel);
  },
  async baixarRecebivel(id, dataRecebimento) {
    const s = criarSupabaseServer();
    const { error } = await s
      .from("recebiveis")
      .update({ data_recebimento: dataRecebimento, status: "recebido" })
      .eq("id", id);
    if (error) throw new Error(error.message);
  },
  async listPagaveis() {
    const s = criarSupabaseServer();
    const { data, error } = await s.from("pagaveis").select("*").order("vencimento");
    return ok<Row[]>(data, error).map(mapPagavel);
  },
  async baixarPagavel(id, dataPagamento) {
    const s = criarSupabaseServer();
    const { error } = await s
      .from("pagaveis")
      .update({ data_pagamento: dataPagamento, status: "pago" })
      .eq("id", id);
    if (error) throw new Error(error.message);
  },
  async listChargebacks() {
    const s = criarSupabaseServer();
    const { data, error } = await s.from("chargebacks").select("*").order("data", { ascending: false });
    return ok<Row[]>(data, error).map(mapChargeback);
  },
  async getParametrosFinanceiros() {
    const s = criarSupabaseServer();
    const { data, error } = await s.from("parametros_financeiros").select("*").limit(1);
    const linhas = ok<Row[]>(data, error);
    return linhas.length ? mapParametros(linhas[0]) : PARAMETROS_PADRAO;
  },
  async setParametrosFinanceiros(p) {
    const s = criarSupabaseServer();
    const { error } = await s.from("parametros_financeiros").upsert(
      {
        singleton: true,
        aliquota_imposto: p.aliquotaImposto,
        regime_tributario: p.regimeTributario,
        saldo_inicial_caixa: p.saldoInicialCaixa,
        data_saldo_inicial: p.dataSaldoInicial,
        custo_fixo_mensal: p.custoFixoMensal,
        reserva_minima_caixa: p.reservaMinimaCaixa,
        atualizado_em: new Date().toISOString(),
      },
      { onConflict: "singleton" }
    );
    if (error) throw new Error(error.message);
  },
  async datasetCaixa(): Promise<DatasetCaixa> {
    const [contas, movimentos, recebiveis, pagaveis, chargebacks, parametros] = await Promise.all([
      this.listContasBancarias(),
      this.listMovimentosCaixa(),
      this.listRecebiveis(),
      this.listPagaveis(),
      this.listChargebacks(),
      this.getParametrosFinanceiros(),
    ]);
    return { contas, movimentos, recebiveis, pagaveis, chargebacks, parametros };
  },

  // ----- importação de extrato bancário: livro-razão de procedência -----
  async listImportacoes(): Promise<RegistroImportacao[]> {
    const s = criarSupabaseServer();
    const { data, error } = await s.from("importacoes").select("*").order("data", { ascending: false });
    // `okOuVazia`, como na trilha de conteúdo (P2): a migração desta tabela
    // pode não existir ainda em toda instalação, e "sem tabela" aqui é
    // exatamente "nada foi importado ainda" — não é falha.
    return okOuVazia<Row[]>(data, error).map(mapImportacao);
  },
  async importarExtrato(
    linhas: LinhaExtrato[],
    contaId: string,
    origem: OrigemExtrato
  ): Promise<ResultadoImportacao> {
    if (linhas.length === 0) return { gravadas: 0, ignoradas: 0, digitaisIgnoradas: [] };
    const s = criarSupabaseServer();

    // a. digitais já registradas
    const { data: existentesRows, error: erroExistentes } = await s
      .from("importacoes")
      .select("impressao_digital");
    const existentes = new Set(
      okOuVazia<Row[]>(existentesRows, erroExistentes).map((r) => String(r.impressao_digital))
    );

    // b. descarta as repetidas, contando quantas
    const novas = linhas.filter((l) => !existentes.has(l.impressaoDigital));
    const digitaisIgnoradas = linhas
      .filter((l) => existentes.has(l.impressaoDigital))
      .map((l) => l.impressaoDigital);

    // c. grava em movimentos_caixa e registra a procedência em importacoes,
    // uma linha por vez: só assim dá para casar o ID do movimento que o banco
    // gera com o registro de importação correspondente.
    const agora = new Date().toISOString();
    for (const l of novas) {
      const { data: mov, error: erroMov } = await s
        .from("movimentos_caixa")
        .insert({
          direcao: l.tipo,
          // Categoria da PRÓPRIA linha, escolhida/confirmada pelo dono no
          // passo de conferência da tela — não um valor fixo (mesma correção
          // aplicada em demo-db.ts e mapear.ts/sheets-db.ts).
          categoria: l.categoria,
          conta_id: contaId,
          descricao: l.descricao,
          valor: Math.abs(l.valor),
          data_competencia: l.data,
          data_caixa: l.data,
          status: "realizado",
          braco: null,
          origem: "manual",
          origem_id: null,
        })
        .select("id")
        .single();
      if (erroMov) throw new Error(erroMov.message);

      const { error: erroImp } = await s.from("importacoes").insert({
        impressao_digital: l.impressaoDigital,
        data: l.data,
        descricao: l.descricao,
        valor: l.valor,
        tipo: l.tipo,
        documento: l.documento,
        origem,
        conta_id: contaId,
        movimento_id: mov.id,
        importado_em: agora,
      });
      if (erroImp) throw new Error(erroImp.message);
    }

    // d. gravadas, ignoradas e as digitais ignoradas
    return { gravadas: novas.length, ignoradas: digitaisIgnoradas.length, digitaisIgnoradas };
  },

  // ----- expansão v2: conteúdo & redes -----
  async listPerfisSociais() {
    const s = criarSupabaseServer();
    const { data, error } = await s.from("perfis_sociais").select("*").order("plataforma");
    return ok<Row[]>(data, error).map(mapPerfil);
  },
  async listConteudos() {
    const s = criarSupabaseServer();
    const [{ data: cont, error }, { data: mets }] = await Promise.all([
      s.from("conteudos").select("*, perfis_sociais(plataforma, handle)").order("publicado_em", { ascending: false }),
      s.from("conteudo_metricas").select("*").order("coletado_em", { ascending: false }),
    ]);
    const metricaPorConteudo = new Map<string, ConteudoMetrica>();
    for (const m of (mets ?? []).map(mapMetrica)) {
      if (!metricaPorConteudo.has(m.conteudoId)) metricaPorConteudo.set(m.conteudoId, m);
    }
    return ok<Row[]>(cont, error).map((r) => {
      const c = mapConteudo(r);
      return { ...c, metrica: metricaPorConteudo.get(c.id) ?? null } as ConteudoView;
    });
  },
  async getConteudo(id) {
    const s = criarSupabaseServer();
    const { data: c } = await s
      .from("conteudos").select("*, perfis_sociais(plataforma, handle)").eq("id", id).maybeSingle();
    if (!c) return null;
    const [{ data: mets }, { data: ret }, { data: pil }] = await Promise.all([
      s.from("conteudo_metricas").select("*").eq("conteudo_id", id).order("coletado_em", { ascending: false }).limit(1),
      s.from("conteudo_retencao").select("*").eq("conteudo_id", id).order("ponto_pct"),
      s.from("conteudo_pilares").select("*").eq("conteudo_id", id),
    ]);
    return {
      conteudo: mapConteudo(c),
      metrica: mets?.length ? mapMetrica(mets[0]) : null,
      retencao: (ret ?? []).map(mapPontoRet),
      pilares: (pil ?? []).map(mapPilar),
    };
  },
  async setPilar(conteudoId, pilar, texto, nota) {
    const s = criarSupabaseServer();
    const { error } = await s
      .from("conteudo_pilares")
      .upsert({ conteudo_id: conteudoId, pilar, texto, nota }, { onConflict: "conteudo_id,pilar" });
    if (error) throw new Error(error.message);
  },
  async listCampanhas() {
    const s = criarSupabaseServer();
    const { data, error } = await s.from("campanhas").select("*").order("inicio", { ascending: false });
    return ok<Row[]>(data, error).map(mapCampanha);
  },
  async addCampanha(c) {
    const s = criarSupabaseServer();
    const { error } = await s.from("campanhas").insert({
      nome: c.nome, tipo: c.tipo, canal: c.canal, objetivo: c.objetivo,
      orcamento: c.orcamento, inicio: c.inicio, fim: c.fim, conteudo_id: c.conteudoId,
    });
    if (error) throw new Error(error.message);
  },

  // ----- P2 — fontes de renda: trilha do produto e encontros -----
  async listModulos() {
    const s = criarSupabaseServer();
    const { data, error } = await s.from("modulos").select("*").order("produto_id").order("ordem");
    return okOuVazia<Row[]>(data, error).map(mapModulo);
  },
  async listAulas() {
    const s = criarSupabaseServer();
    const { data, error } = await s.from("aulas").select("*").order("modulo_id").order("ordem");
    return okOuVazia<Row[]>(data, error).map(mapAula);
  },
  async listProgresso() {
    const s = criarSupabaseServer();
    const { data, error } = await s.from("progresso_aulas").select("*");
    return okOuVazia<Row[]>(data, error).map(mapProgressoAula);
  },
  async listEncontros() {
    const s = criarSupabaseServer();
    const { data, error } = await s.from("encontros").select("*").order("data");
    return okOuVazia<Row[]>(data, error).map(mapEncontro);
  },

  // ----- atendimento: WhatsApp virando ficha do cliente -----
  //
  // `okOuVazia` (e não `ok`) em toda leitura destas duas tabelas: a migração do
  // módulo de atendimento pode não existir ainda numa instalação, e "sem
  // tabela" aqui é honestamente "nenhuma conversa registrada" — não é falha.
  // Na ESCRITA vale o oposto, e por isso ela usa `error` cru: gravar mensagem
  // num lugar que não existe não pode voltar como sucesso.

  async listInteracoes(alunoId?: string): Promise<Interacao[]> {
    const s = criarSupabaseServer();
    let q = s.from("interacoes").select("*").order("quando", { ascending: false });
    if (alunoId) q = q.eq("aluno_id", alunoId);
    const { data, error } = await q;
    return okOuVazia<Row[]>(data, error).map(mapInteracao);
  },

  async registrarInteracoes(msgs: MensagemRecebida[]): Promise<ResultadoInteracoes> {
    if (msgs.length === 0) {
      return { gravadas: 0, ignoradas: 0, descartadas: 0, leadsCriados: 0, idsExternosIgnorados: [] };
    }
    const s = criarSupabaseServer();

    // a. e b. os idExterno já gravados — o agente reenvia o histórico ao
    // reconectar, então a mesma mensagem chega de novo por desenho.
    const { data: jaRows, error: erroJa } = await s.from("interacoes").select("id_externo");
    const jaGravados = new Set(
      okOuVazia<Row[]>(jaRows, erroJa).map((r) => String(r.id_externo))
    );
    const { data: alunoRows, error: erroAlunos } = await s.from("alunos").select("*");
    const alunos = okOuVazia<Row[]>(alunoRows, erroAlunos).map(mapAluno);

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

    // c. leads de número desconhecido nascem antes das interações.
    const idPorChave = new Map<string, string>();
    for (const lead of plano.leads) {
      const { data: novo, error } = await s
        .from("alunos")
        .insert({
          nome: lead.nome,
          telefone: lead.telefone,
          email: "",
          status_funil: "potencial",
          // CRIAÇÃO AUTOMÁTICA: `origem` marca a ficha que nasceu de uma
          // mensagem, e não de alguém cadastrando.
          origem: "whatsapp",
          primeiro_contato: new Date().toISOString().slice(0, 10),
          observacoes: "",
        })
        .select("id")
        .single();
      if (error) throw new Error(`Supabase: ${error.message}`);
      idPorChave.set(lead.chave, String(novo.id));
    }

    // d. grava as interações
    const paraGravar = plano.interacoes.map((i) => ({
      ...i,
      alunoId: i.alunoId !== "" ? i.alunoId : idPorChave.get(i.chaveLead) ?? "",
    }));
    const { error: erroInsercao } = await s.from("interacoes").insert(
      paraGravar.map((i) => ({
        aluno_id: i.alunoId,
        canal: i.canal,
        direcao: i.direcao,
        texto: i.texto,
        quando: i.quando,
        id_externo: i.idExterno,
        tipo_midia: i.tipoMidia,
        nome_exibicao: i.nomeExibicao,
        telefone: i.telefone,
      }))
    );
    if (erroInsercao) throw new Error(`Supabase: ${erroInsercao.message}`);

    await aplicarEstagioObservado(new Set(paraGravar.map((i) => i.alunoId).filter((id) => id !== "")));

    // e. o balanço
    return {
      gravadas: paraGravar.length,
      ignoradas: plano.ignoradas,
      descartadas: plano.descartadas,
      leadsCriados: plano.leads.length,
      idsExternosIgnorados: plano.idsExternosIgnorados,
    };
  },

  // ----- atendimento: fila de saída -----

  async listEnvios(): Promise<Envio[]> {
    const s = criarSupabaseServer();
    const { data, error } = await s
      .from("envios")
      .select("*")
      .order("autorizado_em", { ascending: false });
    return okOuVazia<Row[]>(data, error).map(mapEnvio);
  },

  async listEnviosPendentes(): Promise<EnvioPendente[]> {
    const s = criarSupabaseServer();
    // O `eq("status", "aprovado")` É a regra de negócio: o agente local não tem
    // como saber se uma mensagem foi autorizada por uma pessoa, então quem
    // garante isso é este filtro. Ele nunca pode virar "tudo que não saiu".
    const { data, error } = await s
      .from("envios")
      .select("*")
      .eq("status", "aprovado")
      .order("autorizado_em");
    return okOuVazia<Row[]>(data, error)
      .map(mapEnvio)
      .filter((e) => e.autorizadoPor !== "" && e.telefone !== "")
      .map((e) => ({
        id: e.id,
        telefone: e.telefone,
        texto: e.texto,
        autorizadoPor: e.autorizadoPor,
        autorizadoEm: e.autorizadoEm,
      }));
  },

  async aprovarEnvio(n: NovoEnvio): Promise<string> {
    const s = criarSupabaseServer();
    const { data, error } = await s
      .from("envios")
      .insert({
        aluno_id: n.alunoId,
        telefone: n.telefone,
        texto: n.texto,
        autorizado_por: n.autorizadoPor,
        autorizado_em: new Date().toISOString(),
        status: "aprovado",
      })
      .select("id")
      .single();
    if (error) throw new Error(`Supabase: ${error.message}`);
    return String(data.id);
  },

  async registrarResultadoEnvio(resultados: ResultadoEnvio[]): Promise<number> {
    if (!resultados || resultados.length === 0) return 0;
    const s = criarSupabaseServer();
    const agora = new Date().toISOString();

    let mudadas = 0;
    for (const r of resultados) {
      // `eq("status", "aprovado")` no UPDATE: o agente reenvia confirmação
      // quando não tem certeza de ter sido ouvido, e reaplicar a baixa
      // reescreveria a data de envio de algo já baixado.
      const { data, error } = await s
        .from("envios")
        .update({
          status: r.enviado ? "enviado" : "falhou",
          enviado_em: agora,
          id_externo: r.idExterno ?? "",
          erro: r.enviado ? "" : r.erro ?? "",
        })
        .eq("id", r.id)
        .eq("status", "aprovado")
        .select("id");
      if (error) throw new Error(`Supabase: ${error.message}`);
      mudadas += (data ?? []).length;
    }
    return mudadas;
  },
};

/**
 * Aplica a sugestão de estágio aos alunos tocados por um lote de mensagens.
 *
 * Grava só o que `podeGravarSozinha` libera — sugestão apoiada em evento que
 * aconteceu. "Em risco" nasce do silêncio, que é ausência de evento, e fica
 * para uma pessoa decidir.
 */
async function aplicarEstagioObservado(alunoIds: Set<string>): Promise<void> {
  if (alunoIds.size === 0) return;
  const s = criarSupabaseServer();

  const ids = [...alunoIds];
  const [{ data: alunoRows, error: erroAlunos }, { data: interRows, error: erroInter }, { data: matRows, error: erroMat }] =
    await Promise.all([
      s.from("alunos").select("*").in("id", ids),
      s.from("interacoes").select("*").in("aluno_id", ids),
      s.from("matriculas").select("aluno_id, data").in("aluno_id", ids),
    ]);
  const alunos = okOuVazia<Row[]>(alunoRows, erroAlunos).map(mapAluno);
  const interacoes = okOuVazia<Row[]>(interRows, erroInter).map(mapInteracao);
  const matriculas = okOuVazia<Row[]>(matRows, erroMat);

  const { data: estagioRows } = await s.from("crm_estagios").select("*").order("ordem");
  const estagios = (estagioRows ?? []).map(mapEstagio);
  const agora = new Date();

  for (const aluno of alunos) {
    const sugestao = sugerirEstagio({
      interacoes: interacoes.filter((i) => i.alunoId === aluno.id),
      compras: matriculas
        .filter((m) => String(m.aluno_id) === aluno.id)
        .map((m) => ({ quando: String(m.data) })),
      estagioAtual: null,
      agora,
    });
    if (!podeGravarSozinha(sugestao)) continue;

    // O estágio-alvo é procurado pelo BALDE de funil, e não por um id fixo: o
    // pipeline do Supabase é cadastrado pelo usuário, e um id chumbado aqui
    // apontaria para nada na primeira instalação que renomeasse os estágios.
    const funil = sugestao.estagio === "cliente" ? "novo" : "potencial";
    const alvo =
      sugestao.estagio === "cliente"
        ? estagios.find((e) => e.funil === "novo")
        : estagios.filter((e) => e.funil === "potencial")[1] ?? estagios.find((e) => e.funil === "potencial");
    if (!alvo) continue;

    const { error } = await s
      .from("alunos")
      .update({ estagio_id: alvo.id, status_funil: funil })
      .eq("id", aluno.id);
    if (error) throw new Error(`Supabase: ${error.message}`);
  }
}
