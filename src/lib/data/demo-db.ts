// MODO DEMONSTRAÇÃO — dados 100% fictícios, gerados deterministicamente,
// só para visualizar a plataforma antes de conectar o Supabase.
// Regra herdada do LA Beauty: dado fictício NUNCA se mistura com operação real —
// este módulo inteiro é ignorado quando NEXT_PUBLIC_SUPABASE_URL está definida.

import { calcComissao, calcLiquido } from "../domain";
import type {
  Afiliado,
  Agrupamento,
  Aluno,
  Atividade,
  Aula,
  Braco,
  CallResumo,
  Campanha,
  CategoriaCaixa,
  Chargeback,
  Comissao,
  ContaBancaria,
  Conteudo,
  ConteudoDetalhe,
  ConteudoMetrica,
  ConteudoPilar,
  ConteudoView,
  DatasetCaixa,
  Despesa,
  Encontro,
  Envio,
  Estagio,
  FormaPgto,
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
  StatusPagavel,
  StatusRecebivel,
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

// ---------- base determinística ----------

const HOJE = new Date();
const ANO = HOJE.getFullYear();
const MES = HOJE.getMonth() + 1; // 1-12
const ymDe = (ano: number, mes: number) => `${ano}-${String(mes).padStart(2, "0")}`;
const YM_ATUAL = ymDe(ANO, MES);

let seq = 0;
const nid = (p: string) => `${p}-${++seq}`;

const NOMES = [
  "Marina Duarte", "Rafael Siqueira", "Camila Torres", "Bruno Almeida", "Larissa Fontes",
  "Diego Martins", "Paula Rezende", "Thiago Nunes", "Fernanda Lopes", "André Cardoso",
  "Juliana Prado", "Marcos Vinícius", "Beatriz Salles", "Gustavo Rocha", "Renata Farias",
  "Felipe Barros", "Aline Moreira", "Rodrigo Teles", "Vanessa Pires", "Lucas Sampaio",
  "Patrícia Melo", "Eduardo Ramos", "Carolina Dias", "Vinícius Costa", "Natália Borges",
  "Henrique Souza", "Amanda Leite", "Otávio Ferraz", "Sabrina Cunha", "Leandro Matos",
  "Priscila Neves", "Caio Bittencourt", "Débora Antunes", "Igor Vasconcelos", "Tatiane Franco",
  "Murilo Aguiar",
] as const;

const FORMAS: FormaPgto[] = ["pix", "credito_vista", "credito_2x6x", "pix", "credito_7x12x", "debito"];

// ---------- entidades fixas ----------

const afiliados: Afiliado[] = [
  { id: "af-jefson", nome: "Jefson Ragner", braco: "espirito", pctPadrao: 0, ativo: true, metaMensal: 40000, whatsapp: "11987650001", chavePix: "jefson@mentoros.com" },
  { id: "af-carlos", nome: "Carlos Andrade (personal)", braco: "corpo", pctPadrao: 25, ativo: true, metaMensal: 15000, whatsapp: "11987650002", chavePix: "119.876.500-02" },
  { id: "af-helena", nome: "Dra. Helena Vidal", braco: "mente", pctPadrao: 20, ativo: true, metaMensal: 12000, whatsapp: "11987650003", chavePix: "helena.vidal@exemplo.com" },
];

const BRACOS_ROTACAO: Braco[] = ["corpo", "mente", "espirito"];

/**
 * Agrupamento é CADASTRO OPCIONAL do usuário (ver `Agrupamento` em types.ts);
 * o demo cadastra corpo/mente/espírito só como EXEMPLO — são o posicionamento
 * de UM cliente, não um valor fixo do produto. Hex fixo aqui de propósito:
 * é exatamente o dado fictício que este módulo existe para carregar.
 */
const agrupamentos: Agrupamento[] = [
  { id: "corpo", nome: "Corpo", cor: "#FF7A5C", ordem: 1, ativo: true },
  { id: "mente", nome: "Mente", cor: "#46B6F0", ordem: 2, ativo: true },
  { id: "espirito", nome: "Espírito", cor: "#9B7BFF", ordem: 3, ativo: true },
];

/** D+X de liberação do caixa por forma de pagamento (demo determinística). */
function dataLiberacaoDe(data: string, forma: FormaPgto): string {
  const dias = forma === "pix" || forma === "dinheiro" || forma === "debito" ? 0 : 14;
  const d = new Date(`${data}T00:00:00`);
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

const produtos: Produto[] = [
  {
    id: "pr-protocolo", nome: "Protocolo Raro", tipo: "low_ticket", precoBase: 297, ativo: true,
    // perpétuo e vendido pelos três braços sem afiliado fixo — braço fica nulo
    // no produto e cada venda herda o braço de quem vendeu (afiliado ou rotação).
    braco: null, categoria: "curso",
  },
  {
    id: "pr-mentoria", nome: "Mentoria MentorOS", tipo: "mentoria", precoBase: 2997, ativo: true,
    braco: null, categoria: "mentoria",
  },
  {
    id: "pr-premium", nome: "Acompanhamento Premium 1:1", tipo: "high_ticket", precoBase: 9900, ativo: true,
    // sempre vendido pela Dra. Helena (afiliadoIdx 2, braço mente) — ancorar o
    // braço aqui também cobre uma eventual venda direta sem afiliado.
    braco: "mente", categoria: "servico",
  },
];

const lancamentos: Lancamento[] = [
  {
    id: "la-t1",
    nome: `Mentoria MentorOS — Turma 1`,
    produtoId: "pr-mentoria",
    inicio: `${ANO}-05-04`,
    fim: `${ANO}-05-29`,
    status: "encerrado",
    metaFaturamento: 45000,
    descricao: "Primeiro lançamento da mentoria — funil de aplicação + calls ao vivo.",
  },
  {
    id: "la-protocolo",
    nome: "Protocolo Raro — Captação",
    produtoId: "pr-protocolo",
    inicio: `${YM_ATUAL}-01`,
    fim: null,
    status: "ativo",
    metaFaturamento: 30000,
    descricao: "Low ticket perpétuo para escala e comunidade (corpo, mente e espírito).",
  },
];

// A mentoria roda ~2 meses além do fim da captação (30/mai) antes de fechar a
// turma — comparar contra a data de hoje evita ter que atualizar isto à mão.
const TURMA_T1_FIM = `${ANO}-07-04`;
const turmas: Turma[] = [
  {
    id: "tu-t1", lancamentoId: "la-t1", nome: "Turma 1", vagas: 15,
    inicio: `${ANO}-05-04`, fim: TURMA_T1_FIM,
    status: HOJE.toISOString().slice(0, 10) <= TURMA_T1_FIM ? "ativa" : "encerrada",
  },
];

// Pipeline de CRM (estágios customizáveis — Expansão v2)
const estagios: Estagio[] = [
  { id: "est-lead", nome: "Lead", ordem: 1, cor: "cinza", funil: "potencial" },
  { id: "est-conversa", nome: "Em conversa", ordem: 2, cor: "azul", funil: "potencial" },
  { id: "est-novo", nome: "Aluno novo", ordem: 3, cor: "violeta", funil: "novo" },
  { id: "est-ativo", nome: "Aluno ativo", ordem: 4, cor: "verde", funil: "recorrente" },
  { id: "est-risco", nome: "Em risco", ordem: 5, cor: "ouro", funil: "recorrente" },
  { id: "est-inativo", nome: "Inativo", ordem: 6, cor: "vermelho", funil: "inativo" },
];

// ---------- geração de vendas ----------

const alunos: Aluno[] = NOMES.map((nome, i) => ({
  id: `al-${i + 1}`,
  nome,
  telefone: `119${String(88000000 + i * 137).slice(0, 8)}`,
  email: `${nome.split(" ")[0].toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")}${i + 1}@exemplo.com`,
  statusFunil: "potencial", // recalculado depois com base nas compras
  estagioId: null,
  origem: i % 3 === 0 ? "Instagram" : i % 3 === 1 ? "Indicação" : "YouTube",
  primeiroContato: ymDe(ANO - 1, 1 + (i % 12)) + "-10",
  observacoes: "",
}));

const matriculas: Matricula[] = [];
const comissoes: Comissao[] = [];

function vender(
  alunoIdx: number,
  produto: Produto,
  data: string,
  opts: { lancamentoId?: string | null; turmaId?: string | null; afiliadoIdx?: number } = {}
) {
  const forma = FORMAS[(alunoIdx + matriculas.length) % FORMAS.length];
  const afil = opts.afiliadoIdx !== undefined ? afiliados[opts.afiliadoIdx] : null;
  const alunoIdVenda = alunos[alunoIdx % alunos.length].id;
  // upsell = venda de produto maior para quem já era cliente
  const jaCliente = matriculas.some((x) => x.alunoId === alunoIdVenda);
  const liquido = calcLiquido(produto.precoBase, forma);
  const m: Matricula = {
    id: nid("mt"),
    alunoId: alunoIdVenda,
    produtoId: produto.id,
    lancamentoId: opts.lancamentoId ?? null,
    turmaId: opts.turmaId ?? null,
    afiliadoId: afil && afil.pctPadrao > 0 ? afil.id : null,
    valor: produto.precoBase,
    formaPgto: forma,
    valorLiquido: liquido,
    data,
    statusPagamento: "pago",
    origem: "manual",
    isUpsell: jaCliente && produto.tipo !== "low_ticket",
    // P0 — venda estendida: braço (do afiliado, senão rotação determinística),
    // bruto/taxa e a data em que o dinheiro vira caixa (D+X)
    braco: afil ? afil.braco : BRACOS_ROTACAO[alunoIdx % BRACOS_ROTACAO.length],
    gateway: "manual",
    valorBruto: produto.precoBase,
    taxaGateway: +(produto.precoBase - liquido).toFixed(2),
    dataLiberacao: dataLiberacaoDe(data, forma),
  };
  matriculas.push(m);
  if (m.afiliadoId && afil) {
    comissoes.push({
      id: nid("co"),
      matriculaId: m.id,
      afiliadoId: afil.id,
      pct: afil.pctPadrao,
      valor: calcComissao(m.valor, afil.pctPadrao),
      data,
    });
  }
  return m;
}

// meses do ano passado inteiro até o mês atual
const MESES_DEMO: { ano: number; mes: number; i: number }[] = [];
{
  let i = 0;
  for (let mes = 1; mes <= 12; mes++) MESES_DEMO.push({ ano: ANO - 1, mes, i: i++ });
  for (let mes = 1; mes <= MES; mes++) MESES_DEMO.push({ ano: ANO, mes, i: i++ });
}

for (const { ano, mes, i } of MESES_DEMO) {
  // no mês corrente, nenhuma venda pode ter data futura
  const diaMax = ano === ANO && mes === MES ? HOJE.getDate() : 28;
  const dia = (n: number) => String(Math.max(1, Math.min(n, diaMax))).padStart(2, "0");
  const crescimento = ano === ANO ? 2 : 0; // ano atual vende mais (história de crescimento)
  const nMentoria = 1 + ((i + 1) % 2) + (crescimento ? 1 : 0);
  const nProtocolo = 4 + ((i * 3) % 5) + crescimento * 3;
  for (let j = 0; j < nMentoria; j++) {
    vender((i * 7 + j * 5) % 26, produtos[1], `${ymDe(ano, mes)}-${dia(3 + ((i + j * 9) % 24))}`, {
      afiliadoIdx: (i + j) % 3, // Jefson (0%) intercala com Carlos/Helena
    });
  }
  for (let j = 0; j < nProtocolo; j++) {
    vender((i * 11 + j * 3) % 26, produtos[0], `${ymDe(ano, mes)}-${dia(2 + ((i * 2 + j * 7) % 26))}`, {
      afiliadoIdx: (i + j + 1) % 3,
    });
  }
  // um premium a cada trimestre do ano atual
  if (ano === ANO && mes % 3 === 0) {
    vender((i * 13) % 26, produtos[2], `${ymDe(ano, mes)}-${dia(15)}`, { afiliadoIdx: 2 });
  }
}

// Lançamento T1 (maio do ano atual): 12 vendas de mentoria dentro do lançamento
const alunosT1: string[] = [];
if (MES >= 5) {
  for (let j = 0; j < 12; j++) {
    const m = vender((j * 2 + 1) % 26, produtos[1], `${ANO}-05-${String(5 + j * 2).padStart(2, "0")}`, {
      lancamentoId: "la-t1",
      turmaId: "tu-t1",
      afiliadoIdx: j % 3,
    });
    alunosT1.push(m.alunoId);
  }
}

// Lançamento ativo (mês atual): vendas de protocolo espalhadas pelo mês.
// Índice com passo 7 sobre módulo 29 (coprimos) → compradores ÚNICOS.
{
  const diasNoMes = Math.min(HOJE.getDate(), 28);
  const nVendas = Math.max(8, Math.min(26, diasNoMes * 2));
  for (let j = 0; j < nVendas; j++) {
    vender((j * 7 + 2) % 29, produtos[0], `${YM_ATUAL}-${String(1 + (j % diasNoMes)).padStart(2, "0")}`, {
      lancamentoId: "la-protocolo",
      afiliadoIdx: j % 3,
    });
  }
}

// Diversidade de funil para a demo:
// alunos 30-32 = uma única compra recente (viram "novo");
// alunos 33-34 = compra antiga isolada (viram "inativo").
{
  const d = (n: number) => String(Math.max(1, HOJE.getDate() - n)).padStart(2, "0");
  vender(30, produtos[0], `${YM_ATUAL}-${d(1)}`, { afiliadoIdx: 0 });
  vender(31, produtos[0], `${YM_ATUAL}-${d(2)}`, { afiliadoIdx: 1 });
  vender(32, produtos[1], `${YM_ATUAL}-${d(3)}`, { afiliadoIdx: 2 });
  vender(33, produtos[0], `${ANO - 1}-02-10`, { afiliadoIdx: 1 });
  vender(34, produtos[0], `${ANO - 1}-03-12`, { afiliadoIdx: 2 });
}

// ---------- reembolsos ----------

const reembolsos: Reembolso[] = [];
{
  const mT1 = matriculas.find((m) => m.lancamentoId === "la-t1");
  if (mT1 && MES >= 6) {
    mT1.statusPagamento = "reembolsado";
    reembolsos.push({
      id: nid("re"),
      matriculaId: mT1.id,
      valor: mT1.valor,
      data: `${ANO}-06-02`,
      motivo: "Não conseguiu acompanhar a agenda de calls",
    });
  }
  const mProt = matriculas.filter((m) => m.lancamentoId === "la-protocolo").at(-1);
  if (mProt) {
    mProt.statusPagamento = "reembolsado";
    reembolsos.push({
      id: nid("re"),
      matriculaId: mProt.id,
      valor: mProt.valor,
      data: mProt.data,
      motivo: "Arrependimento dentro dos 7 dias (CDC)",
    });
  }
}

// ---------- despesas ----------

const despesas: Despesa[] = [];
for (const { ano, mes, i } of MESES_DEMO) {
  const diaMax = ano === ANO && mes === MES ? HOJE.getDate() : 28;
  const d = (dia: number) => `${ymDe(ano, mes)}-${String(Math.max(1, Math.min(dia, diaMax))).padStart(2, "0")}`;
  despesas.push(
    { id: nid("de"), data: d(5), descricao: "Plataforma de curso (assinatura)", categoria: "Plataforma de curso", tipo: "fixa", valor: 297 },
    { id: nid("de"), data: d(5), descricao: "Ferramentas (CRM, e-mail, design)", categoria: "Ferramentas e software", tipo: "fixa", valor: 450 },
    { id: nid("de"), data: d(8), descricao: "Tráfego pago (Meta + Google)", categoria: "Tráfego pago", tipo: "variavel", valor: 1200 + i * 90 }
  );
  if (ano === ANO) {
    despesas.push({ id: nid("de"), data: d(1), descricao: "Equipe (social media + suporte)", categoria: "Equipe", tipo: "fixa", valor: 1800 });
  }
  if (i % 2 === 0) {
    despesas.push({ id: nid("de"), data: d(18), descricao: "Edição de vídeo e criativos", categoria: "Produção de conteúdo", tipo: "variavel", valor: 600 });
  }
}

// ============================================================
// P1 — camada de CAIXA
// Nada aqui é um universo paralelo: recebíveis, pagáveis e movimentos
// DERIVAM das mesmas matrículas, comissões, despesas e reembolsos acima.
// Competência = dia do fato (venda/despesa); caixa = dia da liberação/pagamento.
// ============================================================

const HOJE_ISO = `${YM_ATUAL}-${String(HOJE.getDate()).padStart(2, "0")}`;

/** Soma dias a uma data ISO mantendo o formato yyyy-mm-dd. */
function addDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

const contasBancarias: ContaBancaria[] = [
  { id: "cb-itau", nome: "Itaú PJ — conta principal", tipo: "corrente", saldoInicial: 25000, dataSaldoInicial: `${ANO - 1}-01-01`, ativa: true, braco: null },
  { id: "cb-gateway", nome: "Saldo a liberar (gateways)", tipo: "gateway", saldoInicial: 0, dataSaldoInicial: `${ANO - 1}-01-01`, ativa: true, braco: null },
  { id: "cb-caixa", nome: "Caixinha presencial (corpo)", tipo: "caixa_fisico", saldoInicial: 1200, dataSaldoInicial: `${ANO - 1}-01-01`, ativa: true, braco: "corpo" },
];

/** Custo fixo de referência = plataforma (297) + ferramentas (450) + equipe (1800). */
let parametrosFin: ParametrosFinanceiros = {
  id: "pf-1",
  aliquotaImposto: 6, // Simples Nacional, anexo de serviços na primeira faixa
  regimeTributario: "simples",
  saldoInicialCaixa: 26200, // soma dos saldos iniciais das contas ativas
  dataSaldoInicial: `${ANO - 1}-01-01`,
  custoFixoMensal: 2547,
  reservaMinimaCaixa: 15000,
  atualizadoEm: `${HOJE_ISO}T09:00:00.000Z`,
};

const recebiveis: Recebivel[] = [];
const pagaveis: Pagavel[] = [];
const movimentos: MovimentoCaixa[] = [];
/** Livro-razão de importação de extrato — vazio na demo: nada foi importado ainda. */
const importacoes: RegistroImportacao[] = [];

// ---------- atendimento (WhatsApp) ----------
//
// Começam VAZIOS de propósito, mesmo no modo demonstração. Todo o resto deste
// arquivo é dado fictício plausível; conversa de WhatsApp inventada seria dado
// fictício com nome, telefone e texto de mensagem — o dono abriria a ficha e
// leria uma frase que ninguém disse. A demo mostra a mecânica funcionando com
// o que o agente local mandar, não com diálogo fabricado.
const interacoes: Interacao[] = [];
const envios: Envio[] = [];

/**
 * Índice dos `idExterno` já gravados — o Set que impede a mesma mensagem de
 * virar duas interações quando o agente reenvia o histórico ao reconectar.
 * Existe além do array porque a checagem roda uma vez por mensagem de cada
 * lote, e varrer o array a cada mensagem transformaria um lote grande em
 * trabalho quadrático por nada.
 */
const idsExternosGravados = new Set<string>();

/** Quantas parcelas a forma de pagamento gera (demo determinística). */
function parcelasDe(forma: FormaPgto): number {
  if (forma === "credito_2x6x") return 3;
  if (forma === "credito_7x12x") return 9;
  return 1; // pix, dinheiro, débito e crédito à vista caem de uma vez
}

const nomeProdutoCaixa = (id: string) => produtos.find((p) => p.id === id)?.nome ?? "Produto";

// ---- recebíveis + entradas de caixa (nascem da venda) ----
for (const m of matriculas) {
  // venda pendente não é dinheiro contratado: não gera recebível
  if (m.statusPagamento === "pendente") continue;
  const n = parcelasDe(m.formaPgto);
  const base = m.dataLiberacao ?? m.data; // D+X do gateway
  const diasLib = Math.round((new Date(`${base}T00:00:00`).getTime() - new Date(`${m.data}T00:00:00`).getTime()) / 86400000);
  const valorParcela = +(m.valorLiquido / n).toFixed(2);
  for (let k = 1; k <= n; k++) {
    const venc = addDias(base, 30 * (k - 1));
    const venceu = venc <= HOJE_ISO;
    // inadimplência determinística: 1 em cada 23 parcelas já vencidas não entra
    const atrasada = venceu && recebiveis.length % 23 === 7;
    const status: StatusRecebivel = !venceu ? "a_vencer" : atrasada ? "atrasado" : "recebido";
    const dataRecebimento = status === "recebido" ? venc : null;
    recebiveis.push({
      id: nid("rc"),
      origem: "matricula",
      origemId: m.id,
      descricao: `${nomeProdutoCaixa(m.produtoId)} — parcela ${k}/${n}`,
      valor: valorParcela,
      vencimento: venc,
      dataRecebimento,
      status,
      gateway: m.gateway ?? "manual",
      diasLiberacao: diasLib,
      parcela: k,
      totalParcelas: n,
      braco: m.braco ?? null,
      contaId: "cb-itau",
    });
    movimentos.push({
      id: nid("mv"),
      direcao: "entrada",
      categoria: "vendas",
      contaId: "cb-itau",
      descricao: `${nomeProdutoCaixa(m.produtoId)} — parcela ${k}/${n}`,
      valor: valorParcela,
      dataCompetencia: m.data, // a receita é do dia da venda
      dataCaixa: dataRecebimento ?? venc, // o dinheiro só existe na liberação
      status: status === "recebido" ? "realizado" : "previsto",
      braco: m.braco ?? null,
      origem: "matricula",
      origemId: m.id,
    });
  }
  // taxa do gateway sai junto com a liberação do valor bruto
  if (m.taxaGateway && m.taxaGateway > 0) {
    movimentos.push({
      id: nid("mv"),
      direcao: "saida",
      categoria: "taxas_gateway",
      contaId: "cb-itau",
      descricao: `Taxa de pagamento — ${nomeProdutoCaixa(m.produtoId)}`,
      valor: m.taxaGateway,
      dataCompetencia: m.data,
      dataCaixa: base,
      status: base <= HOJE_ISO ? "realizado" : "previsto",
      braco: m.braco ?? null,
      origem: "matricula",
      origemId: m.id,
    });
  }
}

// ---- despesas viram saída de caixa no próprio dia (pagamento à vista) ----
const CATEGORIA_CAIXA_DESPESA: Record<string, CategoriaCaixa> = {
  "Tráfego pago": "trafego",
  "Ferramentas e software": "saas_ferramentas",
  "Plataforma de curso": "saas_ferramentas",
  Equipe: "folha_prolabore",
  "Produção de conteúdo": "producao_conteudo",
  Impostos: "impostos",
  "Taxas de pagamento": "taxas_gateway",
};
for (const de of despesas) {
  movimentos.push({
    id: nid("mv"),
    direcao: "saida",
    categoria: CATEGORIA_CAIXA_DESPESA[de.categoria] ?? "outros",
    contaId: "cb-itau",
    descricao: de.descricao,
    valor: de.valor,
    dataCompetencia: de.data,
    dataCaixa: de.data,
    status: "realizado",
    braco: de.braco ?? null,
    origem: "despesa",
    origemId: de.id,
  });
}

// ---- comissões: competência na venda, caixa 30 dias depois (fecha o mês e paga) ----
for (const c of comissoes) {
  const afil = afiliados.find((a) => a.id === c.afiliadoId);
  const venc = addDias(c.data, 30);
  const pago = venc <= HOJE_ISO;
  pagaveis.push({
    id: nid("pg"),
    categoria: "comissoes",
    fornecedor: afil?.nome ?? "Afiliado",
    descricao: `Comissão ${c.pct}% sobre venda ${c.matriculaId}`,
    valor: c.valor,
    vencimento: venc,
    dataPagamento: pago ? venc : null,
    status: pago ? "pago" : "a_vencer",
    tipo: "variavel",
    braco: afil?.braco ?? null,
    origem: "comissao",
    origemId: c.id,
    contaId: "cb-itau",
  });
  movimentos.push({
    id: nid("mv"),
    direcao: "saida",
    categoria: "comissoes",
    contaId: "cb-itau",
    descricao: `Comissão — ${afil?.nome ?? "Afiliado"}`,
    valor: c.valor,
    dataCompetencia: c.data,
    dataCaixa: venc,
    status: pago ? "realizado" : "previsto",
    braco: afil?.braco ?? null,
    origem: "comissao",
    origemId: c.id,
  });
}

// ---- reembolsos: dinheiro que volta para o cliente ----
for (const re of reembolsos) {
  const m = matriculas.find((x) => x.id === re.matriculaId);
  movimentos.push({
    id: nid("mv"),
    direcao: "saida",
    categoria: "reembolsos",
    contaId: "cb-itau",
    descricao: `Reembolso — ${re.motivo}`,
    valor: re.valor,
    dataCompetencia: re.data,
    dataCaixa: re.data,
    status: "realizado",
    braco: m?.braco ?? null,
    origem: "reembolso",
    origemId: re.id,
  });
}

// ---- imposto sobre faturamento: apurado no mês, pago dia 20 do mês seguinte ----
for (const { ano, mes } of MESES_DEMO) {
  const ymM = ymDe(ano, mes);
  const faturado = matriculas
    .filter((m) => m.data.startsWith(ymM) && m.statusPagamento !== "pendente")
    .reduce((s, m) => s + m.valor, 0);
  if (faturado <= 0) continue;
  const valor = +((faturado * parametrosFin.aliquotaImposto) / 100).toFixed(2);
  const venc = `${mes === 12 ? ymDe(ano + 1, 1) : ymDe(ano, mes + 1)}-20`;
  const pago = venc <= HOJE_ISO;
  pagaveis.push({
    id: nid("pg"),
    categoria: "impostos",
    fornecedor: "Receita Federal (DAS)",
    descricao: `Simples Nacional — competência ${ymM}`,
    valor,
    vencimento: venc,
    dataPagamento: pago ? venc : null,
    status: pago ? "pago" : "a_vencer",
    tipo: "variavel",
    braco: null,
    origem: "manual",
    origemId: null,
    contaId: "cb-itau",
  });
  movimentos.push({
    id: nid("mv"),
    direcao: "saida",
    categoria: "impostos",
    contaId: "cb-itau",
    descricao: `Simples Nacional — competência ${ymM}`,
    valor,
    dataCompetencia: `${ymM}-28`,
    dataCaixa: venc,
    status: pago ? "realizado" : "previsto",
    braco: null,
    origem: "manual",
    origemId: null,
  });
}

// ---- fornecedores em aberto (fatura já emitida, ainda não paga) ----
{
  const emAberto: { cat: CategoriaCaixa; fornecedor: string; desc: string; valor: number; dias: number; tipo: "fixa" | "variavel" }[] = [
    { cat: "trafego", fornecedor: "Meta Ads", desc: "Fatura de tráfego — ciclo atual", valor: 1850, dias: 7, tipo: "variavel" },
    { cat: "outros", fornecedor: "Contabilidade Prisma", desc: "Honorários contábeis", valor: 450, dias: 5, tipo: "fixa" },
    { cat: "producao_conteudo", fornecedor: "Editor freelancer", desc: "Edição de 8 vídeos", valor: 600, dias: -9, tipo: "variavel" },
  ];
  for (const p of emAberto) {
    const venc = addDias(HOJE_ISO, p.dias);
    // vencido e não pago = atrasado (entra no aging de contas a pagar)
    const status: StatusPagavel = venc < HOJE_ISO ? "atrasado" : "a_vencer";
    pagaveis.push({
      id: nid("pg"),
      categoria: p.cat,
      fornecedor: p.fornecedor,
      descricao: p.desc,
      valor: p.valor,
      vencimento: venc,
      dataPagamento: null,
      status,
      tipo: p.tipo,
      braco: null,
      origem: "manual",
      origemId: null,
      contaId: "cb-itau",
    });
    movimentos.push({
      id: nid("mv"),
      direcao: "saida",
      categoria: p.cat,
      contaId: "cb-itau",
      descricao: p.desc,
      valor: p.valor,
      dataCompetencia: venc,
      dataCaixa: venc,
      status: "previsto",
      braco: null,
      origem: "manual",
      origemId: null,
    });
  }
}

// ---- chargebacks (contestação imposta pela operadora ≠ reembolso acordado) ----
const chargebacks: Chargeback[] = [];
{
  const candidatas = matriculas.filter((m) => m.statusPagamento === "pago" && m.data < HOJE_ISO);
  const receita: { pos: number; motivo: Chargeback["motivo"]; status: Chargeback["status"] }[] = [
    { pos: 0.22, motivo: "nao_reconhecido", status: "ganho" },
    { pos: 0.58, motivo: "fraude", status: "perdido" },
    { pos: 0.88, motivo: "produto_nao_entregue", status: "aberto" },
  ];
  for (const c of receita) {
    const m = candidatas[Math.floor(candidatas.length * c.pos)];
    if (!m) continue;
    const abertura = addDias(m.data, 21);
    if (abertura > HOJE_ISO) continue;
    const resolvido = c.status !== "aberto";
    const dataResolucao = resolvido ? addDias(abertura, 30) : null;
    chargebacks.push({
      id: nid("cg"),
      matriculaId: m.id,
      valor: m.valor,
      data: abertura,
      dataResolucao: dataResolucao && dataResolucao <= HOJE_ISO ? dataResolucao : null,
      motivo: c.motivo,
      status: c.status,
      gateway: m.gateway ?? "manual",
      detalhe: "Contestação aberta pela operadora do cartão",
      braco: m.braco ?? null,
    });
    // só o chargeback PERDIDO vira saída definitiva de caixa
    if (c.status === "perdido" && dataResolucao) {
      movimentos.push({
        id: nid("mv"),
        direcao: "saida",
        categoria: "reembolsos",
        contaId: "cb-itau",
        descricao: `Chargeback perdido — ${nomeProdutoCaixa(m.produtoId)}`,
        valor: m.valor,
        dataCompetencia: abertura,
        dataCaixa: dataResolucao,
        status: dataResolucao <= HOJE_ISO ? "realizado" : "previsto",
        braco: m.braco ?? null,
        origem: "chargeback",
        origemId: m.id,
      });
    }
  }
}

// ---------- tarefas e calls (Turma 1) ----------

const TITULOS_TAREFAS = [
  "Preencher anamnese inicial",
  "Assistir módulo 1 — Fundamentos",
  "Enviar fotos e medidas de acompanhamento",
  "Agendar call de onboarding",
];

const tarefas: TarefaAluno[] = [];
{
  const unicos = [...new Set(alunosT1)].slice(0, 8);
  unicos.forEach((alunoId, ai) => {
    TITULOS_TAREFAS.forEach((titulo, ti) => {
      tarefas.push({
        id: nid("ta"),
        turmaId: "tu-t1",
        alunoId,
        titulo,
        concluida: (ai + ti) % 3 !== 0,
      });
    });
  });
}

const calls: CallResumo[] = MES >= 5
  ? [
      { id: nid("ca"), lancamentoId: "la-t1", data: `${ANO}-05-08`, titulo: "Onboarding da Turma 1", resumo: "Apresentação do protocolo corpo–mente–espírito, combinados da turma e diagnóstico inicial de cada aluno. Dúvida mais comum: como encaixar os treinos na rotina de trabalho." },
      { id: nid("ca"), lancamentoId: "la-t1", data: `${ANO}-05-15`, titulo: "Semana 1 — Treino base", resumo: "Revisão da execução dos treinos A/B. Ajustes de carga para 4 alunos. Ponto de atenção: adesão ao diário alimentar ainda baixa (50%)." },
      { id: nid("ca"), lancamentoId: "la-t1", data: `${ANO}-05-22`, titulo: "Nutrição e protocolo hormonal", resumo: "Participação da Dra. Helena. Explicação dos exames solicitados e do protocolo de sono. 3 alunos com exames pendentes — follow-up individual marcado." },
      { id: nid("ca"), lancamentoId: "la-t1", data: `${ANO}-06-05`, titulo: "Q&A mensal + espiritualidade", resumo: "Roda de perguntas + prática guiada. Feedback forte: comunidade é o maior valor percebido. Sugerido desafio de 30 dias para a próxima turma." },
    ]
  : [];

// ---------- status de funil derivado das compras ----------

{
  const seisMesesAtras = new Date(HOJE.getFullYear(), HOJE.getMonth() - 6, 1).toISOString().slice(0, 10);
  const sessentaDias = new Date(HOJE.getTime() - 60 * 86400000).toISOString().slice(0, 10);
  alunos.forEach((a, idx) => {
    const compras = matriculas.filter((m) => m.alunoId === a.id && m.statusPagamento !== "pendente");
    if (compras.length === 0) a.statusFunil = "potencial";
    else {
      const ultima = compras.map((m) => m.data).sort().at(-1)!;
      if (ultima < seisMesesAtras) a.statusFunil = "inativo";
      else a.statusFunil = compras.length >= 2 ? "recorrente" : "novo";
    }
    // estágio do pipeline derivado do comportamento
    if (a.statusFunil === "potencial") a.estagioId = idx % 2 ? "est-conversa" : "est-lead";
    else if (a.statusFunil === "novo") a.estagioId = "est-novo";
    else if (a.statusFunil === "inativo") a.estagioId = "est-inativo";
    else {
      const ultima = compras.map((m) => m.data).sort().at(-1)!;
      a.estagioId = ultima >= sessentaDias ? "est-ativo" : "est-risco";
    }
  });
}

// ============================================================
// Expansão v2 — seed demo (notas, atividades, tarefas, reuniões,
// transcrições, orçamentos/metas, redes sociais e campanhas)
// ============================================================

const DIA = 86400000;
const agoraISO = new Date().toISOString();
const dataRel = (dias: number) => new Date(HOJE.getTime() + dias * DIA).toISOString().slice(0, 10);
const dtRel = (dias: number, hora: string) => `${dataRel(dias)}T${hora}:00`;
const nomeProdutoDe = (id: string) => produtos.find((p) => p.id === id)?.nome ?? "—";

// ---------- Notas ----------
const notas: Nota[] = [];
{
  const seedNotas: [number, string, number][] = [
    [0, "Prefere treinar de manhã. Meta declarada: -8kg até dezembro.", 12],
    [2, "Pediu o material do protocolo de sono — enviado por WhatsApp.", 8],
    [4, "Trabalha em escala 12x36; ajustar plano de treino da semana.", 6],
    [7, "Indicou dois colegas do trabalho — acompanhar se entram no funil.", 5],
    [10, "Sensível a preço: esperar oferta da Turma 2 para propor upgrade.", 4],
    [12, "Exames enviados para a Dra. Helena, aguarda retorno do protocolo.", 3],
    [1, "Muito engajada na comunidade — possível case de sucesso.", 2],
    [19, "Reclamou do horário das calls; prefere após as 19h.", 1],
  ];
  for (const [idx, texto, diasAtras] of seedNotas) {
    notas.push({
      id: nid("no"),
      alunoId: alunos[idx].id,
      autor: "Jefson",
      texto,
      criadoEm: dtRel(-diasAtras, "10:30"),
    });
  }
}

// ---------- Atividades (timeline unificada) ----------
const atividades: Atividade[] = [];
for (const m of matriculas) {
  atividades.push({
    id: nid("at"),
    alunoId: m.alunoId,
    tipo: "compra",
    titulo: `Compra — ${nomeProdutoDe(m.produtoId)}${m.isUpsell ? " (upsell)" : ""}`,
    detalhe: `R$ ${m.valor.toFixed(2).replace(".", ",")} · ${m.formaPgto}`,
    data: `${m.data}T12:00:00`,
  });
}
for (const n of notas) {
  atividades.push({
    id: nid("at"),
    alunoId: n.alunoId,
    tipo: "nota",
    titulo: "Nota adicionada",
    detalhe: n.texto,
    data: n.criadoEm,
  });
}
{
  // contatos recentes de exemplo (WhatsApp/ligação)
  const contatos: [number, "whatsapp" | "ligacao", string, number][] = [
    [0, "whatsapp", "Follow-up do treino da semana — respondeu animada", 1],
    [3, "whatsapp", "Confirmou presença na call de quinta", 2],
    [5, "ligacao", "Ligação de boas-vindas (10 min)", 4],
    [8, "whatsapp", "Enviado lembrete de renovação", 9],
    [14, "whatsapp", "Pesquisa de satisfação respondida (nota 9)", 11],
    [22, "ligacao", "Tentativa de contato — sem resposta", 16],
  ];
  for (const [idx, tipo, detalhe, diasAtras] of contatos) {
    atividades.push({
      id: nid("at"),
      alunoId: alunos[idx].id,
      tipo,
      titulo: tipo === "whatsapp" ? "Conversa no WhatsApp" : "Ligação",
      detalhe,
      data: dtRel(-diasAtras, "15:20"),
    });
  }
}

// ---------- Tarefas de gestão ----------
const tarefasGestao: Tarefa[] = [
  { id: "tg-1", titulo: "Aprovar fichas de anamnese da Turma 1", detalhe: "3 fichas aguardando revisão", alunoId: null, lancamentoId: "la-t1", responsavel: "Jefson", prazo: dataRel(1), prioridade: "alta", status: "pendente" },
  { id: "tg-2", titulo: "Revisar criativos da campanha do Protocolo", detalhe: "2 variações de anúncio para aprovar", alunoId: null, lancamentoId: "la-protocolo", responsavel: "Tossi", prazo: dataRel(2), prioridade: "media", status: "pendente" },
  { id: "tg-3", titulo: "Responder dúvidas acumuladas da comunidade", detalhe: "", alunoId: null, lancamentoId: null, responsavel: "Jefson", prazo: dataRel(0), prioridade: "alta", status: "pendente" },
  { id: "tg-4", titulo: "Gravar aula bônus do módulo 2", detalhe: "Roteiro já aprovado", alunoId: null, lancamentoId: "la-t1", responsavel: "Jefson", prazo: dataRel(5), prioridade: "media", status: "pendente" },
  { id: "tg-5", titulo: "Conferir repasse de comissões do mês", detalhe: "Carlos e Dra. Helena", alunoId: null, lancamentoId: null, responsavel: "Tossi", prazo: dataRel(3), prioridade: "alta", status: "pendente" },
  { id: "tg-6", titulo: "Publicar reel de segunda-feira", detalhe: "", alunoId: null, lancamentoId: null, responsavel: "Social media", prazo: dataRel(-1), prioridade: "media", status: "concluida" },
  { id: "tg-7", titulo: "Enviar exames pendentes para a Dra. Helena", detalhe: "", alunoId: alunos[12].id, lancamentoId: null, responsavel: "Jefson", prazo: dataRel(-2), prioridade: "alta", status: "concluida" },
  { id: "tg-8", titulo: "Atualizar planilha de leads da semana", detalhe: "", alunoId: null, lancamentoId: null, responsavel: "Tossi", prazo: dataRel(-3), prioridade: "baixa", status: "concluida" },
];

// ---------- Reuniões (hoje, passadas e futuras) ----------
const reunioes: Reuniao[] = [
  { id: "ru-1", titulo: "Alinhamento semanal do time", inicio: dtRel(0, "09:00"), fim: dtRel(0, "09:30"), comQuem: "Jefson + Tossi", alunoId: null, lancamentoId: null, turmaId: null, status: "agendada", link: "", googleEventId: "" },
  { id: "ru-2", titulo: "Call ao vivo — Turma 1 (semana 7)", inicio: dtRel(0, "14:00"), fim: dtRel(0, "15:00"), comQuem: "Turma 1", alunoId: null, lancamentoId: "la-t1", turmaId: "tu-t1", status: "agendada", link: "", googleEventId: "" },
  { id: "ru-3", titulo: "1:1 de acompanhamento — Marina Duarte", inicio: dtRel(0, "16:30"), fim: dtRel(0, "17:00"), comQuem: "Marina Duarte", alunoId: alunos[0].id, lancamentoId: null, turmaId: null, status: "agendada", link: "", googleEventId: "" },
  { id: "ru-4", titulo: "Call ao vivo — Turma 1 (semana 6)", inicio: dtRel(-7, "14:00"), fim: dtRel(-7, "15:00"), comQuem: "Turma 1", alunoId: null, lancamentoId: "la-t1", turmaId: "tu-t1", status: "realizada", link: "", googleEventId: "" },
  { id: "ru-5", titulo: "Kickoff da campanha de julho", inicio: dtRel(-14, "10:00"), fim: dtRel(-14, "11:00"), comQuem: "Time + gestor de tráfego", alunoId: null, lancamentoId: "la-protocolo", turmaId: null, status: "realizada", link: "", googleEventId: "" },
  { id: "ru-6", titulo: "1:1 — Rafael Siqueira (renovação)", inicio: dtRel(-3, "18:00"), fim: dtRel(-3, "18:30"), comQuem: "Rafael Siqueira", alunoId: alunos[1].id, lancamentoId: null, turmaId: null, status: "realizada", link: "", googleEventId: "" },
  { id: "ru-7", titulo: "Gravação de conteúdo (batch de reels)", inicio: dtRel(2, "10:00"), fim: dtRel(2, "12:00"), comQuem: "Jefson + social media", alunoId: null, lancamentoId: null, turmaId: null, status: "agendada", link: "", googleEventId: "" },
  { id: "ru-8", titulo: "Call ao vivo — Turma 1 (semana 8)", inicio: dtRel(7, "14:00"), fim: dtRel(7, "15:00"), comQuem: "Turma 1", alunoId: null, lancamentoId: "la-t1", turmaId: "tu-t1", status: "agendada", link: "", googleEventId: "" },
];

const transcricoes: Transcricao[] = [
  {
    id: "tr-1",
    reuniaoId: "ru-4",
    origem: "manual",
    texto:
      "Jefson abriu revisando os treinos da semana 6. Dúvida recorrente sobre encaixe do protocolo na rotina de trabalho em escala — orientação: ancorar treino no turno fixo e proteger o sono. Dra. Helena cobrou exames de 3 alunos. Encerrou com prática guiada de respiração.",
    resumo:
      "• Revisão dos treinos da semana 6\n• Dúvida principal: rotina em escala → ancorar no turno fixo\n• Pendência: exames de 3 alunos com a Dra. Helena\n• Encerramento: prática de respiração guiada",
    criadoEm: dtRel(-7, "16:00"),
  },
  {
    id: "tr-2",
    reuniaoId: "ru-5",
    origem: "audio_ia",
    texto:
      "[transcrição gerada por IA] Definição das metas da campanha de julho: 30 mil de meta, foco no Protocolo Raro. Gestor de tráfego apresentou os públicos. Ficou definido testar 2 criativos com gancho de contradição e 1 com prova social.",
    resumo:
      "• Meta da campanha: R$ 30k no mês (Protocolo Raro)\n• 3 criativos em teste: 2 ganchos de contradição + 1 prova social\n• Próximo checkpoint: sexta-feira",
    criadoEm: dtRel(-14, "12:00"),
  },
];

// ---------- Orçamentos e metas financeiras ----------
const orcamentos: Orcamento[] = [
  { id: "or-1", categoria: "Tráfego pago", periodo: YM_ATUAL, valorPrevisto: 3000 },
  { id: "or-2", categoria: "Ferramentas e software", periodo: YM_ATUAL, valorPrevisto: 500 },
  { id: "or-3", categoria: "Equipe", periodo: YM_ATUAL, valorPrevisto: 1800 },
  { id: "or-4", categoria: "Produção de conteúdo", periodo: YM_ATUAL, valorPrevisto: 800 },
  { id: "or-5", categoria: "Plataforma de curso", periodo: YM_ATUAL, valorPrevisto: 300 },
];

const metasFinanceiras: MetaFinanceira[] = [
  { id: "mf-1", tipo: "faturamento", periodo: YM_ATUAL, alvo: 30000 },
  { id: "mf-2", tipo: "lucro", periodo: YM_ATUAL, alvo: 15000 },
];

// ---------- P0 fundação: metas generalizadas (indicador × escopo × período) ----------
const metas: Meta[] = [
  { id: "me-1", indicador: "faturamento", escopo: "global", escopoRef: null, periodo: YM_ATUAL, valor: 30000 },
  { id: "me-2", indicador: "vendas", escopo: "global", escopoRef: null, periodo: YM_ATUAL, valor: 45 },
  { id: "me-3", indicador: "ticket", escopo: "global", escopoRef: null, periodo: YM_ATUAL, valor: 650 },
  { id: "me-4", indicador: "faturamento", escopo: "braco", escopoRef: "corpo", periodo: YM_ATUAL, valor: 12000 },
  { id: "me-5", indicador: "faturamento", escopo: "braco", escopoRef: "mente", periodo: YM_ATUAL, valor: 9000 },
  { id: "me-6", indicador: "faturamento", escopo: "braco", escopoRef: "espirito", periodo: YM_ATUAL, valor: 9000 },
  { id: "me-7", indicador: "faturamento", escopo: "afiliado", escopoRef: "af-carlos", periodo: YM_ATUAL, valor: 15000 },
];

// ---------- P0 fundação: eventos de webhook (fluxo simulado do gateway) ----------
// Derivados das últimas vendas para a conciliação demo fechar 1:1 com as matrículas.
const eventosWebhook: WebhookEvento[] = (() => {
  const recentes = [...matriculas].sort((a, b) => b.data.localeCompare(a.data)).slice(0, 6);
  const evs: WebhookEvento[] = recentes.map((m, i) => ({
    id: nid("wh"),
    tipo: "venda",
    gateway: "hotmart",
    valor: m.valorBruto ?? m.valor,
    taxa: m.taxaGateway ?? 0,
    status: "processado",
    transacaoRef: `HP-${17_400_000 + i * 137}`,
    detalhe: `${m.produtoId === "pr-protocolo" ? "Protocolo Raro" : m.produtoId === "pr-mentoria" ? "Mentoria MentorOS" : "Acompanhamento Premium 1:1"} · pagamento aprovado`,
    recebidoEm: `${m.data}T10:${String(12 + i * 7).padStart(2, "0")}:00`,
  }));
  const base = recentes[0]?.data ?? `${YM_ATUAL}-05`;
  evs.push(
    {
      id: nid("wh"),
      tipo: "reembolso",
      gateway: "hotmart",
      valor: 297,
      taxa: 0,
      status: "processado",
      transacaoRef: "HP-17400900",
      detalhe: "Protocolo Raro · reembolso dentro da garantia (7 dias)",
      recebidoEm: `${base}T15:41:00`,
    },
    {
      id: nid("wh"),
      tipo: "assinatura",
      gateway: "hotmart",
      valor: 297,
      taxa: 14.85,
      status: "pendente",
      transacaoRef: "HP-17400955",
      detalhe: "Boleto gerado — aguardando compensação",
      recebidoEm: `${base}T18:02:00`,
    },
    {
      id: nid("wh"),
      tipo: "venda",
      gateway: "kiwify",
      valor: 297,
      taxa: 26.73,
      status: "erro",
      transacaoRef: "KW-88213",
      detalhe: "Produto externo sem mapeamento → revisar mapa de produtos",
      recebidoEm: `${base}T19:27:00`,
    }
  );
  return evs.sort((a, b) => b.recebidoEm.localeCompare(a.recebidoEm));
})();

// ---------- Redes sociais: perfis, conteúdos, métricas, retenção, pilares ----------
const perfisSociais: PerfilSocial[] = [
  { id: "ps-ig", plataforma: "instagram", handle: "@mentoros", seguidores: 12840, conectado: false, atualizadoEm: agoraISO },
  { id: "ps-tk", plataforma: "tiktok", handle: "@mentoros", seguidores: 8420, conectado: false, atualizadoEm: agoraISO },
  { id: "ps-fb", plataforma: "facebook", handle: "MentorOS Oficial", seguidores: 3210, conectado: false, atualizadoEm: agoraISO },
];

const conteudos: Conteudo[] = [];
const conteudoMetricas: ConteudoMetrica[] = [];
const pontosRetencao: PontoRetencao[] = [];
const conteudoPilares: ConteudoPilar[] = [];
{
  const TITULOS = [
    "3 sinais de que seu treino não está funcionando",
    "O erro nº 1 de quem quer emagrecer depois dos 30",
    "Protocolo matinal corpo-mente-espírito em 5 minutos",
    "Antes e depois: 90 dias de Protocolo Raro",
    "Testosterona baixa? Os 4 hábitos que detonam a sua",
    "Treino de 20 minutos para quem trabalha em escala",
    "Por que força de vontade não resolve (e o que resolve)",
    "O que eu como num dia de cutting",
    "Espiritualidade e performance: o elo que ninguém fala",
    "A rotina de sono dos meus alunos que mais evoluem",
    "POV: você começou o protocolo há 30 dias",
    "Responda isso antes de contratar um personal",
    "O mínimo efetivo de treino por semana",
    "3 suplementos que valem o dinheiro (e 3 que não)",
    "Um dia comigo: mentor em ação",
    "Aula aberta: fundamentos do método Raro",
    "Depoimento: como o João saiu do sedentarismo",
    "Convite: aplicação para a Turma 2 da mentoria",
  ];
  TITULOS.forEach((titulo, i) => {
    const perfil = i < 10 ? perfisSociais[0] : i < 15 ? perfisSociais[1] : perfisSociais[2];
    const tipo = i < 10 ? "reel" : i < 15 ? "video" : "post";
    const id = `ct-${i + 1}`;
    const dur = tipo === "post" ? 0 : 25 + ((i * 13) % 50);
    conteudos.push({
      id,
      perfilId: perfil.id,
      tipo,
      titulo,
      url: "",
      publicadoEm: dataRel(-(3 + i * 3)),
      duracaoSeg: dur,
      roteiro: "",
    });
    // vencedores da demo: ct-4 (antes/depois), ct-2 e ct-12
    const boost = i === 3 ? 9 : i === 1 ? 6 : i === 11 ? 7 : 1 + (i % 3);
    const views = (1800 + ((i * 733) % 4200)) * boost;
    const likes = Math.round(views * (0.05 + (i % 5) * 0.008));
    const retBase = i === 3 ? 78 : i === 1 ? 71 : i === 11 ? 74 : 34 + ((i * 7) % 26);
    conteudoMetricas.push({
      conteudoId: id,
      coletadoEm: agoraISO,
      views,
      likes,
      comentarios: Math.round(views * 0.004),
      compartilhamentos: Math.round(views * (boost >= 6 ? 0.02 : 0.006)),
      salvamentos: Math.round(views * (tipo === "reel" ? 0.012 : 0.004)),
      alcance: Math.round(views * 0.82),
      tempoMedioSeg: dur ? +((dur * retBase) / 100).toFixed(1) : 0,
      retencaoMedia: tipo === "post" ? 0 : retBase,
    });
    if (tipo !== "post") {
      // curva de retenção: 100% → queda do gancho → decaimento suave
      const posGancho = 100 - (100 - retBase) * 0.55;
      for (let p = 0; p <= 100; p += 10) {
        const v = p === 0 ? 100 : p === 10 ? posGancho : posGancho - (posGancho - retBase * 0.72) * ((p - 10) / 90);
        pontosRetencao.push({ conteudoId: id, pontoPct: p, retencaoPct: +v.toFixed(1) });
      }
      // pilares anotados nos vencedores e em metade dos demais
      if (i % 2 === 1 || i === 3) {
        const notaG = i === 3 ? 9.5 : i === 1 ? 9 : i === 11 ? 8.5 : 5 + (i % 4);
        conteudoPilares.push(
          { id: nid("pi"), conteudoId: id, pilar: "gancho", texto: `Abre com "${titulo.slice(0, 42)}" na primeira frase, texto na tela`, nota: notaG },
          { id: nid("pi"), conteudoId: id, pilar: "desenvolvimento", texto: "3 cortes de rotina real + 1 prova social no meio", nota: +(notaG - 1.5).toFixed(1) },
          { id: nid("pi"), conteudoId: id, pilar: "cta", texto: 'CTA de comentário: "Comenta PROTOCOLO que eu te chamo"', nota: +(notaG - 2).toFixed(1) }
        );
      }
    }
  });
}

const campanhas: Campanha[] = [
  { id: "cp-1", nome: "Captação Protocolo — Julho", tipo: "pago", canal: "instagram", objetivo: "Vendas do low ticket (Protocolo Raro)", orcamento: 1500, inicio: `${YM_ATUAL}-01`, fim: null, conteudoId: "ct-4" },
  { id: "cp-2", nome: "Aquecimento Mentoria T2", tipo: "pago", canal: "tiktok", objetivo: "Lista de espera da Turma 2", orcamento: 2000, inicio: dataRel(-10), fim: null, conteudoId: "ct-12" },
  { id: "cp-3", nome: "Série orgânica: 7 dias Raro", tipo: "organico", canal: "multi", objetivo: "Autoridade + crescimento da comunidade", orcamento: 0, inicio: dataRel(-20), fim: null, conteudoId: null },
];

// ============================================================
// P2 — Fontes de renda: trilha de conteúdo (módulo → aula → progresso)
// e encontros ao vivo da Turma 1.
//
// Só os produtos com trilha própria ganham módulos aqui — "Acompanhamento
// Premium 1:1" é atendimento sob demanda, sem conteúdo gravado, e por isso
// fica de fora deste bloco de propósito.
// ============================================================

const modulos: Modulo[] = [];
const aulas: Aula[] = [];
const progressoAulas: ProgressoAula[] = [];
const encontros: Encontro[] = [];

/** Cria um módulo com suas aulas e devolve as aulas já com id, na ordem — o progresso reaproveita essa ordem. */
function trilha(
  produtoId: string,
  moduloNome: string,
  moduloOrdem: number,
  moduloDescricao: string,
  itens: { titulo: string; tipo: Aula["tipo"]; duracaoMin: number }[]
): Aula[] {
  const modulo: Modulo = { id: nid("mo"), produtoId, nome: moduloNome, ordem: moduloOrdem, descricao: moduloDescricao };
  modulos.push(modulo);
  return itens.map((item, i) => {
    const aula: Aula = {
      id: nid("au"), moduloId: modulo.id, produtoId,
      titulo: item.titulo, ordem: i + 1, duracaoMin: item.duracaoMin, tipo: item.tipo,
    };
    aulas.push(aula);
    return aula;
  });
}

/**
 * Marca as primeiras `limite` aulas (na ordem da trilha) como concluídas e,
 * se houver uma a mais, deixa essa parcialmente assistida — é o "aluno
 * travado" quando `limite` para bem no meio de um módulo. `limite < 0`
 * significa que o aluno nunca abriu a trilha: não gera nenhuma linha, porque
 * ausência de registro É o dado, e não um "0% concluído" fabricado.
 */
function marcarProgresso(
  alunoId: string,
  produtoId: string,
  aulasOrdenadas: Aula[],
  limite: number,
  inicio: string
): void {
  if (limite < 0) return;
  aulasOrdenadas.forEach((aula, i) => {
    if (i < limite) {
      progressoAulas.push({
        id: nid("pa"), alunoId, aulaId: aula.id, produtoId,
        concluida: true, concluidaEm: `${addDias(inicio, i * 3)}T20:00:00`,
        minutosAssistidos: aula.duracaoMin,
      });
    } else if (i === limite) {
      progressoAulas.push({
        id: nid("pa"), alunoId, aulaId: aula.id, produtoId,
        concluida: false, concluidaEm: null,
        minutosAssistidos: Math.max(1, Math.round(aula.duracaoMin * 0.4)),
      });
    }
  });
}

// ---- Protocolo Raro: trilha autoinstrucional (categoria curso) ----
const aulasProtocolo = [
  ...trilha("pr-protocolo", "Fundamentos do Protocolo", 1, "Diagnóstico inicial e por que corpo, mente e espírito andam juntos.", [
    { titulo: "Boas-vindas ao Protocolo Raro", tipo: "video", duracaoMin: 8 },
    { titulo: "Diagnóstico: onde você está hoje", tipo: "tarefa", duracaoMin: 15 },
    { titulo: "Os 3 pilares: corpo, mente, espírito", tipo: "video", duracaoMin: 12 },
    { titulo: "Como usar a plataforma e a comunidade", tipo: "texto", duracaoMin: 5 },
  ]),
  ...trilha("pr-protocolo", "Treino: corpo em movimento", 2, "Rotina de treino adaptável a qualquer agenda, do zero à consistência.", [
    { titulo: "Treino A: base para iniciantes", tipo: "video", duracaoMin: 18 },
    { titulo: "Treino B: intensidade progressiva", tipo: "video", duracaoMin: 20 },
    { titulo: "Mobilidade em 10 minutos", tipo: "video", duracaoMin: 10 },
    { titulo: "Ajustando o treino à sua rotina", tipo: "texto", duracaoMin: 6 },
    { titulo: "Envie suas fotos e medidas", tipo: "tarefa", duracaoMin: 5 },
  ]),
  ...trilha("pr-protocolo", "Nutrição consciente", 3, "Ajustes de alimentação sem contar caloria, com foco em hábito.", [
    { titulo: "O prato do dia a dia", tipo: "video", duracaoMin: 14 },
    { titulo: "Substituições inteligentes", tipo: "texto", duracaoMin: 8 },
    { titulo: "Hidratação e suplementação básica", tipo: "video", duracaoMin: 9 },
    { titulo: "Monte seu cardápio da semana", tipo: "tarefa", duracaoMin: 10 },
  ]),
  ...trilha("pr-protocolo", "Mente & Espírito", 4, "Sono, respiração e prática guiada para sustentar o resultado.", [
    { titulo: "Protocolo de sono", tipo: "video", duracaoMin: 11 },
    { titulo: "Respiração guiada", tipo: "ao_vivo", duracaoMin: 20 },
    { titulo: "Prática de gratidão", tipo: "texto", duracaoMin: 5 },
    { titulo: "Encontro ao vivo: fechamento do mês", tipo: "ao_vivo", duracaoMin: 45 },
  ]),
];

{
  // al-4 fica de fora de propósito: "comprou e nunca abriu a trilha" também é
  // um estado real do funil de conteúdo, não um vazio a esconder.
  const limites: Record<string, number> = {
    "al-1": aulasProtocolo.length, // concluiu tudo
    "al-2": 14,
    "al-3": 6, // travado no mesmo módulo (Nutrição) há semanas
    "al-5": 9,
    "al-6": 3,
    "al-7": 12,
    "al-8": 1,
  };
  for (const [alunoId, limite] of Object.entries(limites)) {
    marcarProgresso(alunoId, "pr-protocolo", aulasProtocolo, limite, dataRel(-90));
  }
}

// ---- Mentoria MentorOS: trilha de apoio da Turma 1 ----
const aulasMentoria = [
  ...trilha("pr-mentoria", "Diagnóstico e anamnese", 1, "Ponto de partida individual antes da primeira call em grupo.", [
    { titulo: "Preencher anamnese inicial", tipo: "tarefa", duracaoMin: 15 },
    { titulo: "Onboarding: como funciona a mentoria", tipo: "video", duracaoMin: 10 },
    { titulo: "Agendar sua call de diagnóstico", tipo: "tarefa", duracaoMin: 5 },
  ]),
  ...trilha("pr-mentoria", "Execução do protocolo em grupo", 2, "Material de apoio das semanas de treino, nutrição e protocolo hormonal.", [
    { titulo: "Semana 1: treino base", tipo: "ao_vivo", duracaoMin: 60 },
    { titulo: "Semana 2: nutrição e protocolo hormonal", tipo: "ao_vivo", duracaoMin: 60 },
    { titulo: "Enviar fotos e medidas de acompanhamento", tipo: "tarefa", duracaoMin: 5 },
    { titulo: "Ajustes individuais de treino", tipo: "video", duracaoMin: 15 },
  ]),
  ...trilha("pr-mentoria", "Consolidação e comunidade", 3, "Fechamento do ciclo e plano para sustentar o resultado sem a turma.", [
    { titulo: "Q&A mensal + espiritualidade", tipo: "ao_vivo", duracaoMin: 60 },
    { titulo: "Plano de manutenção pós-mentoria", tipo: "video", duracaoMin: 12 },
    { titulo: "Depoimento e encerramento da turma", tipo: "texto", duracaoMin: 5 },
  ]),
];

// alunos da Turma 1, sem repetição — mesma base usada nas tarefas e calls acima
const alunosT1Unicos = [...new Set(alunosT1)];

{
  // -1 = nunca abriu a trilha; os demais valores vão de "só começou" a
  // "terminou tudo", cobrindo a mesma diversidade de engajamento da turma.
  const LIMITES = [aulasMentoria.length, 8, 3, -1, 5, 6, 4, 7, 2, 9, 1, 3];
  alunosT1Unicos.forEach((alunoId, i) => {
    marcarProgresso(alunoId, "pr-mentoria", aulasMentoria, LIMITES[i % LIMITES.length], dataRel(-95));
  });
}

// ---- Encontros ao vivo da Turma 1 (presença — contraparte dos CallResumo acima) ----
{
  // `(i * 7) % 12` é uma permutação fixa de 0..11: dá uma amostra "espalhada"
  // da turma sem precisar de gerador aleatório, mantendo a demo determinística.
  const presenca = (fracao: number) =>
    alunosT1Unicos.filter((_, i) => (i * 7) % 12 < fracao * 12);
  if (MES >= 5) {
    encontros.push(
      { id: nid("en"), turmaId: "tu-t1", titulo: "Onboarding da Turma 1", data: `${ANO}-05-08T14:00:00`, presentes: presenca(1) },
      { id: nid("en"), turmaId: "tu-t1", titulo: "Semana 1 — Treino base", data: `${ANO}-05-15T14:00:00`, presentes: presenca(0.83) },
      { id: nid("en"), turmaId: "tu-t1", titulo: "Nutrição e protocolo hormonal", data: `${ANO}-05-22T14:00:00`, presentes: presenca(0.75) },
      { id: nid("en"), turmaId: "tu-t1", titulo: "Q&A mensal + espiritualidade", data: `${ANO}-06-05T14:00:00`, presentes: presenca(0.58) }
    );
  }
  if (MES >= 6) {
    encontros.push({ id: nid("en"), turmaId: "tu-t1", titulo: "Semana 6 — revisão de resultados", data: `${ANO}-06-12T14:00:00`, presentes: presenca(0.5) });
  }
}

function viewConteudo(c: Conteudo): ConteudoView {
  const perfil = perfisSociais.find((p) => p.id === c.perfilId);
  return {
    ...c,
    plataforma: perfil?.plataforma,
    perfilHandle: perfil?.handle,
    metrica: conteudoMetricas.find((m) => m.conteudoId === c.id) ?? null,
  };
}

// ---------- lookups e provider ----------

const nomeAluno = (id: string) => alunos.find((a) => a.id === id)?.nome ?? "—";
const nomeProduto = (id: string) => produtos.find((p) => p.id === id)?.nome ?? "—";
const nomeAfiliado = (id: string | null) =>
  id ? afiliados.find((a) => a.id === id)?.nome ?? null : null;

function view(m: Matricula): Matricula {
  return {
    ...m,
    alunoNome: nomeAluno(m.alunoId),
    produtoNome: nomeProduto(m.produtoId),
    afiliadoNome: nomeAfiliado(m.afiliadoId),
  };
}

const ordenadaDesc = (a: { data: string }, b: { data: string }) => b.data.localeCompare(a.data);

export const demoProvider: DataProvider = {
  modo: "demo",

  async listAfiliados() { return [...afiliados]; },
  async listAlunos() { return [...alunos].sort((a, b) => a.nome.localeCompare(b.nome)); },
  async getAluno(id: string): Promise<AlunoDetalhe | null> {
    const aluno = alunos.find((a) => a.id === id);
    if (!aluno) return null;
    return {
      aluno,
      matriculas: matriculas.filter((m) => m.alunoId === id).map(view).sort(ordenadaDesc),
    };
  },
  async listProdutos() { return [...produtos]; },
  async listMatriculas() { return matriculas.map(view).sort(ordenadaDesc); },
  async listDespesas() { return [...despesas].sort(ordenadaDesc); },
  async listLancamentos() {
    return [...lancamentos].sort((a, b) => b.inicio.localeCompare(a.inicio));
  },
  async getLancamento(id: string): Promise<LancamentoDetalhe | null> {
    const lancamento = lancamentos.find((l) => l.id === id);
    if (!lancamento) return null;
    const mats = matriculas.filter((m) => m.lancamentoId === id).map(view).sort(ordenadaDesc);
    const ids = new Set(mats.map((m) => m.id));
    return {
      lancamento,
      produto: produtos.find((p) => p.id === lancamento.produtoId) ?? null,
      turmas: turmas.filter((t) => t.lancamentoId === id),
      matriculas: mats,
      tarefas: tarefas
        .filter((t) => turmas.some((tu) => tu.id === t.turmaId && tu.lancamentoId === id))
        .map((t) => ({ ...t, alunoNome: nomeAluno(t.alunoId) })),
      calls: calls.filter((c) => c.lancamentoId === id).sort(ordenadaDesc),
      reembolsos: reembolsos.filter((r) => ids.has(r.matriculaId)).sort(ordenadaDesc),
    };
  },
  async dataset() {
    return {
      matriculas: matriculas.map(view),
      despesas: [...despesas],
      comissoes: [...comissoes],
      reembolsos: [...reembolsos],
    };
  },

  async addDespesa(d: NovaDespesa) {
    despesas.push({ id: nid("de"), ...d });
  },
  async addAluno(a: NovoAluno) {
    const estagio = a.statusFunil === "novo" ? "est-novo" : a.statusFunil === "recorrente" ? "est-ativo" : a.statusFunil === "inativo" ? "est-inativo" : "est-lead";
    alunos.push({
      id: nid("al"),
      ...a,
      estagioId: estagio,
      primeiroContato: new Date().toISOString().slice(0, 10),
    });
  },
  async setStatusAluno(id: string, status: StatusFunil) {
    const a = alunos.find((x) => x.id === id);
    if (a) a.statusFunil = status;
  },
  async addLancamento(l: NovoLancamento) {
    lancamentos.push({ id: nid("la"), status: "planejado", ...l });
  },
  async addMatricula(nova: NovaMatricula) {
    const produto = produtos.find((p) => p.id === nova.produtoId);
    const afil = afiliados.find((a) => a.id === nova.afiliadoId);
    const jaCliente = matriculas.some((x) => x.alunoId === nova.alunoId);
    const m: Matricula = {
      id: nid("mt"),
      alunoId: nova.alunoId,
      produtoId: nova.produtoId,
      lancamentoId: nova.lancamentoId,
      turmaId: null,
      afiliadoId: afil && afil.pctPadrao > 0 ? afil.id : null,
      valor: nova.valor || produto?.precoBase || 0,
      formaPgto: nova.formaPgto,
      valorLiquido: calcLiquido(nova.valor || produto?.precoBase || 0, nova.formaPgto),
      data: nova.data,
      statusPagamento: "pago",
      origem: "manual",
      isUpsell: jaCliente && (produto?.tipo ?? "low_ticket") !== "low_ticket",
    };
    matriculas.push(m);
    atividades.push({
      id: nid("at"),
      alunoId: m.alunoId,
      tipo: "compra",
      titulo: `Compra — ${produto?.nome ?? "produto"}${m.isUpsell ? " (upsell)" : ""}`,
      detalhe: `R$ ${m.valor.toFixed(2).replace(".", ",")}`,
      data: new Date().toISOString(),
    });
    if (m.afiliadoId && afil) {
      comissoes.push({
        id: nid("co"),
        matriculaId: m.id,
        afiliadoId: afil.id,
        pct: afil.pctPadrao,
        valor: calcComissao(m.valor, afil.pctPadrao),
        data: m.data,
      });
    }
    // comprar move o aluno no funil
    const a = alunos.find((x) => x.id === m.alunoId);
    if (a && a.statusFunil === "potencial") a.statusFunil = "novo";
    else if (a && a.statusFunil === "novo") a.statusFunil = "recorrente";
  },
  async toggleTarefa(id: string) {
    const t = tarefas.find((x) => x.id === id);
    if (t) t.concluida = !t.concluida;
  },
  async addReembolso(r: NovoReembolso) {
    reembolsos.push({ id: nid("re"), ...r });
    const m = matriculas.find((x) => x.id === r.matriculaId);
    if (m) m.statusPagamento = "reembolsado";
  },

  // ----- cadastro base: produto, responsável e conta -----
  async addProduto(p: NovoProduto) {
    produtos.push({ id: nid("pr"), ...p });
  },
  async addResponsavel(r: NovoResponsavel) {
    afiliados.push({
      id: nid("af"),
      nome: r.nome,
      braco: r.braco,
      pctPadrao: r.comissaoPadrao,
      ativo: true,
      metaMensal: r.metaMensal,
    });
  },
  async addConta(c: NovaConta) {
    const id = nid("cb");
    contasBancarias.push({
      id,
      nome: c.nome,
      tipo: c.tipo,
      saldoInicial: c.saldoInicial,
      dataSaldoInicial: new Date().toISOString().slice(0, 10),
      ativa: true,
      braco: c.braco ?? null,
    });
    return id;
  },

  // ----- cadastro OPCIONAL de agrupamento -----
  async listAgrupamentos() {
    return [...agrupamentos].sort((a, b) => a.ordem - b.ordem);
  },
  async addAgrupamento(a: NovoAgrupamento) {
    agrupamentos.push({
      id: nid("ag"),
      nome: a.nome,
      cor: a.cor,
      ordem: a.ordem ?? agrupamentos.length + 1,
      ativo: true,
    });
  },

  // ----- expansão v2: CRM -----
  async listEstagios() {
    return [...estagios].sort((a, b) => a.ordem - b.ordem);
  },
  async setEstagioAluno(alunoId, estagio) {
    const a = alunos.find((x) => x.id === alunoId);
    if (a) {
      a.estagioId = estagio.id;
      a.statusFunil = estagio.funil;
    }
  },
  async listNotas(alunoId) {
    return notas
      .filter((n) => n.alunoId === alunoId)
      .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
  },
  async addNota(n) {
    notas.push({ id: nid("no"), ...n, criadoEm: new Date().toISOString() });
  },
  async listAtividades(alunoId) {
    const l = alunoId ? atividades.filter((a) => a.alunoId === alunoId) : atividades;
    return [...l].sort((a, b) => b.data.localeCompare(a.data));
  },
  async addAtividade(a) {
    atividades.push({ id: nid("at"), ...a, data: new Date().toISOString() });
  },
  async listTarefas() {
    return [...tarefasGestao].sort((a, b) => {
      if (a.status !== b.status) return a.status === "pendente" ? -1 : 1;
      return (a.prazo ?? "9999").localeCompare(b.prazo ?? "9999");
    });
  },
  async addTarefaGestao(t) {
    tarefasGestao.push({ id: nid("tg"), status: "pendente", ...t });
  },
  async concluirTarefa(id) {
    const t = tarefasGestao.find((x) => x.id === id);
    if (t) t.status = t.status === "pendente" ? "concluida" : "pendente";
  },

  // ----- expansão v2: reuniões e transcrições -----
  async listReunioes() {
    return [...reunioes].sort((a, b) => a.inicio.localeCompare(b.inicio));
  },
  async addReuniao(r) {
    const nova: Reuniao = {
      id: nid("ru"),
      titulo: r.titulo,
      inicio: r.inicio,
      fim: r.fim,
      comQuem: r.comQuem,
      alunoId: r.alunoId,
      lancamentoId: r.lancamentoId,
      turmaId: r.turmaId,
      status: "agendada",
      link: r.linkExterno ?? r.link ?? "",
      googleEventId: r.googleEventId ?? "",
    };
    reunioes.push(nova);
    return nova;
  },
  async listTranscricoes(reuniaoId) {
    const l = reuniaoId ? transcricoes.filter((t) => t.reuniaoId === reuniaoId) : transcricoes;
    return [...l].sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
  },
  async addTranscricao(t) {
    transcricoes.push({ id: nid("tr"), ...t, criadoEm: new Date().toISOString() });
    const r = reunioes.find((x) => x.id === t.reuniaoId);
    if (r && r.status === "agendada") r.status = "realizada";
  },

  // ----- expansão v2: financeiro avançado -----
  async listOrcamentos() {
    return [...orcamentos];
  },
  async setOrcamento(categoria, periodo, valorPrevisto) {
    const o = orcamentos.find((x) => x.categoria === categoria && x.periodo === periodo);
    if (o) o.valorPrevisto = valorPrevisto;
    else orcamentos.push({ id: nid("or"), categoria, periodo, valorPrevisto });
  },
  async listMetasFinanceiras() {
    return [...metasFinanceiras];
  },
  async setMetaFinanceira(tipo, periodo, alvo) {
    const m = metasFinanceiras.find((x) => x.tipo === tipo && x.periodo === periodo);
    if (m) m.alvo = alvo;
    else metasFinanceiras.push({ id: nid("mf"), tipo, periodo, alvo });
  },

  // ----- P0 fundação: metas generalizadas + eventos de webhook -----
  async listMetas() {
    return [...metas];
  },
  async setMeta(nova) {
    const m = metas.find(
      (x) =>
        x.indicador === nova.indicador &&
        x.escopo === nova.escopo &&
        x.escopoRef === nova.escopoRef &&
        x.periodo === nova.periodo
    );
    if (m) m.valor = nova.valor;
    else metas.push({ id: nid("me"), ...nova });
  },
  async listEventosWebhook() {
    return [...eventosWebhook];
  },

  // ----- P1 camada de caixa -----
  async listContasBancarias() {
    return [...contasBancarias];
  },
  async listMovimentosCaixa() {
    return [...movimentos].sort((a, b) => a.dataCaixa.localeCompare(b.dataCaixa));
  },
  async addMovimentoCaixa(m) {
    movimentos.push({ id: nid("mv"), ...m });
  },
  async listRecebiveis() {
    return [...recebiveis].sort((a, b) => a.vencimento.localeCompare(b.vencimento));
  },
  async baixarRecebivel(id, dataRecebimento) {
    const r = recebiveis.find((x) => x.id === id);
    if (!r) return;
    r.dataRecebimento = dataRecebimento;
    r.status = "recebido";
    // a baixa também confirma o movimento de caixa correspondente
    const mv = movimentos.find((x) => x.origemId === r.origemId && x.categoria === "vendas" && x.status === "previsto");
    if (mv) {
      mv.status = "realizado";
      mv.dataCaixa = dataRecebimento;
    }
  },
  async listPagaveis() {
    return [...pagaveis].sort((a, b) => a.vencimento.localeCompare(b.vencimento));
  },
  async baixarPagavel(id, dataPagamento) {
    const p = pagaveis.find((x) => x.id === id);
    if (!p) return;
    p.dataPagamento = dataPagamento;
    p.status = "pago";
    const mv = movimentos.find((x) => x.origemId === p.origemId && x.categoria === p.categoria && x.status === "previsto");
    if (mv) {
      mv.status = "realizado";
      mv.dataCaixa = dataPagamento;
    }
  },
  async listChargebacks() {
    return [...chargebacks].sort((a, b) => b.data.localeCompare(a.data));
  },
  async getParametrosFinanceiros() {
    return { ...parametrosFin };
  },
  async setParametrosFinanceiros(p) {
    parametrosFin = { ...parametrosFin, ...p, atualizadoEm: new Date().toISOString() };
  },
  async datasetCaixa(): Promise<DatasetCaixa> {
    return {
      contas: [...contasBancarias],
      movimentos: [...movimentos],
      recebiveis: [...recebiveis],
      pagaveis: [...pagaveis],
      chargebacks: [...chargebacks],
      parametros: { ...parametrosFin },
    };
  },

  // ----- importação de extrato bancário: livro-razão de procedência -----
  async listImportacoes() {
    return [...importacoes];
  },
  async importarExtrato(linhas, contaId, origem): Promise<ResultadoImportacao> {
    // a. digitais já registradas
    const existentes = new Set(importacoes.map((r) => r.impressaoDigital));
    // b. descarta as repetidas, contando quantas
    const novas = linhas.filter((l) => !existentes.has(l.impressaoDigital));
    const digitaisIgnoradas = linhas
      .filter((l) => existentes.has(l.impressaoDigital))
      .map((l) => l.impressaoDigital);

    // c. grava em MOVIMENTOS e registra a procedência em IMPORTACOES
    const agora = new Date().toISOString();
    for (const l of novas) {
      const movimentoId = nid("mv");
      movimentos.push({
        id: movimentoId,
        direcao: l.tipo,
        // Categoria da PRÓPRIA linha, escolhida/confirmada pelo dono no passo
        // de conferência da tela — não um valor fixo (ver mapear.ts, mesma
        // correção do lado da planilha).
        categoria: l.categoria,
        contaId,
        descricao: l.descricao,
        valor: Math.abs(l.valor),
        dataCompetencia: l.data,
        dataCaixa: l.data,
        status: "realizado",
        braco: null,
        origem: "manual",
        origemId: null,
      });
      importacoes.push({
        id: nid("im"),
        impressaoDigital: l.impressaoDigital,
        data: l.data,
        descricao: l.descricao,
        valor: l.valor,
        tipo: l.tipo,
        documento: l.documento,
        origem,
        contaId,
        movimentoId,
        importadoEm: agora,
      });
    }

    // d. gravadas, ignoradas e as digitais ignoradas
    return { gravadas: novas.length, ignoradas: digitaisIgnoradas.length, digitaisIgnoradas };
  },

  // ----- expansão v2: conteúdo & redes -----
  async listPerfisSociais() {
    return [...perfisSociais];
  },
  async listConteudos() {
    return conteudos.map(viewConteudo).sort((a, b) => b.publicadoEm.localeCompare(a.publicadoEm));
  },
  async getConteudo(id) {
    const c = conteudos.find((x) => x.id === id);
    if (!c) return null;
    const view = viewConteudo(c);
    return {
      conteudo: view,
      metrica: view.metrica,
      retencao: pontosRetencao
        .filter((p) => p.conteudoId === id)
        .sort((a, b) => a.pontoPct - b.pontoPct),
      pilares: conteudoPilares.filter((p) => p.conteudoId === id),
    };
  },
  async setPilar(conteudoId, pilar, texto, nota) {
    const p = conteudoPilares.find((x) => x.conteudoId === conteudoId && x.pilar === pilar);
    if (p) {
      p.texto = texto;
      p.nota = nota;
    } else {
      conteudoPilares.push({ id: nid("pi"), conteudoId, pilar, texto, nota });
    }
  },
  async listCampanhas() {
    return [...campanhas].sort((a, b) => b.inicio.localeCompare(a.inicio));
  },
  async addCampanha(c) {
    campanhas.push({ id: nid("cp"), ...c });
  },

  // ----- P2 — fontes de renda: trilha do produto e encontros -----
  async listModulos() {
    return [...modulos].sort((a, b) =>
      a.produtoId === b.produtoId ? a.ordem - b.ordem : a.produtoId.localeCompare(b.produtoId)
    );
  },
  async listAulas() {
    return [...aulas].sort((a, b) =>
      a.moduloId === b.moduloId ? a.ordem - b.ordem : a.moduloId.localeCompare(b.moduloId)
    );
  },
  async listProgresso() {
    return [...progressoAulas];
  },
  async listEncontros() {
    return [...encontros].sort((a, b) => a.data.localeCompare(b.data));
  },

  // ----- atendimento: WhatsApp virando ficha do cliente -----

  async listInteracoes(alunoId?: string): Promise<Interacao[]> {
    const l = alunoId ? interacoes.filter((i) => i.alunoId === alunoId) : interacoes;
    return [...l].sort((a, b) => b.quando.localeCompare(a.quando));
  },

  async registrarInteracoes(msgs: MensagemRecebida[]): Promise<ResultadoInteracoes> {
    // (a) e (b): o plano já lê os ids gravados, descarta grupo e conta o que
    // era reenvio — a mesma decisão que os outros três providers usam.
    const plano = planejarRecepcao(msgs, alunos, idsExternosGravados);

    // (c) leads de número desconhecido nascem antes das interações, porque a
    // interação precisa de um dono para existir.
    const idPorChave = new Map<string, string>();
    for (const lead of plano.leads) {
      const id = nid("al");
      alunos.push({
        id,
        nome: lead.nome,
        telefone: lead.telefone,
        email: "",
        statusFunil: "potencial",
        estagioId: "est-lead",
        origem: "whatsapp",
        primeiroContato: new Date().toISOString().slice(0, 10),
        observacoes: "",
      });
      idPorChave.set(lead.chave, id);
    }

    // (d) grava
    const afetados = new Set<string>();
    for (const i of plano.interacoes) {
      const alunoId = i.alunoId !== "" ? i.alunoId : idPorChave.get(i.chaveLead) ?? "";
      if (alunoId === "") continue;
      interacoes.push({
        id: nid("it"),
        alunoId,
        canal: i.canal,
        direcao: i.direcao,
        texto: i.texto,
        quando: i.quando,
        idExterno: i.idExterno,
        tipoMidia: i.tipoMidia,
        nomeExibicao: i.nomeExibicao,
        telefone: i.telefone,
      });
      idsExternosGravados.add(i.idExterno);
      afetados.add(alunoId);
    }

    aplicarEstagioObservado(afetados);

    // (e) o balanço
    return {
      gravadas: plano.interacoes.length,
      ignoradas: plano.ignoradas,
      descartadas: plano.descartadas,
      leadsCriados: plano.leads.length,
      idsExternosIgnorados: plano.idsExternosIgnorados,
    };
  },

  // ----- atendimento: fila de saída -----

  async listEnvios(): Promise<Envio[]> {
    return [...envios].sort((a, b) => b.autorizadoEm.localeCompare(a.autorizadoEm));
  },

  async listEnviosPendentes(): Promise<EnvioPendente[]> {
    // Só "aprovado" sai daqui. O filtro é a regra de negócio inteira: o agente
    // local não tem como saber se uma mensagem foi autorizada, então quem
    // garante isso é este `filter` — e ele nunca pode virar "tudo que não foi
    // enviado ainda".
    return envios
      .filter((e) => e.status === "aprovado")
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
    const id = nid("en");
    envios.push({
      id,
      alunoId: n.alunoId,
      telefone: n.telefone,
      texto: n.texto,
      autorizadoPor: n.autorizadoPor,
      autorizadoEm: new Date().toISOString(),
      status: "aprovado",
      enviadoEm: "",
      idExterno: "",
      erro: "",
    });
    return id;
  },

  async registrarResultadoEnvio(resultados: ResultadoEnvio[]): Promise<number> {
    const agora = new Date().toISOString();
    let mudadas = 0;
    for (const r of resultados ?? []) {
      const e = envios.find((x) => x.id === r.id);
      // Resultado de id desconhecido é ignorado em silêncio de propósito: o
      // agente pode estar reenviando a confirmação de algo já baixado, e criar
      // linha aqui inventaria um envio que ninguém aprovou.
      if (!e || e.status !== "aprovado") continue;
      e.status = r.enviado ? "enviado" : "falhou";
      e.enviadoEm = agora;
      e.idExterno = r.idExterno ?? "";
      e.erro = r.enviado ? "" : r.erro ?? "";
      mudadas++;
    }
    return mudadas;
  },
};

/**
 * Aplica a sugestão de estágio aos alunos tocados por um lote de mensagens.
 *
 * Só escreve o que `podeGravarSozinha` libera — isto é, sugestão apoiada em
 * evento que ACONTECEU (comprou, respondeu). "Em risco" nasce do silêncio, que
 * é ausência de evento, e por isso fica para uma pessoa decidir.
 */
function aplicarEstagioObservado(alunoIds: Set<string>): void {
  const agora = new Date();
  for (const id of alunoIds) {
    const aluno = alunos.find((a) => a.id === id);
    if (!aluno) continue;

    const atual =
      aluno.estagioId === "est-conversa"
        ? ("em_conversa" as const)
        : aluno.estagioId === "est-risco"
          ? ("em_risco" as const)
          : aluno.estagioId === "est-novo" || aluno.estagioId === "est-ativo"
            ? ("cliente" as const)
            : null;

    const sugestao = sugerirEstagio({
      interacoes: interacoes.filter((i) => i.alunoId === id),
      compras: matriculas.filter((m) => m.alunoId === id).map((m) => ({ quando: m.data })),
      estagioAtual: atual,
      agora,
    });
    if (!podeGravarSozinha(sugestao)) continue;

    const destino = sugestao.estagio === "cliente" ? "est-novo" : "est-conversa";
    const estagio = estagios.find((e) => e.id === destino);
    if (!estagio) continue;
    aluno.estagioId = estagio.id;
    aluno.statusFunil = estagio.funil;
  }
}
