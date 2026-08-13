// Conversao linha da planilha <-> entidade do sistema, nos dois sentidos.
//
// MODULO NEUTRO (sem diretiva de cliente): funcoes PURAS, sem fetch, sem acesso
// a process.env, sem estado de requisicao. Um modulo marcado como cliente nao
// pode exportar valor de runtime lido por Server Component -- da "React Client
// Manifest" e 500 em runtime com o build verde.
//
// Este arquivo implementa docs/CONTRATO-PLANILHA.md. Onde o contrato decide,
// aqui obedece: forma de pagamento decidida por `N de parcelas`, status de venda
// decidido pelos recebiveis, etapa de lead roteada por `Estagio.funil`,
// categoria de despesa com fallback `outros`.
//
// O QUE ESTE ARQUIVO NAO FAZ, de proposito: resolver referencia entre abas.
// `VENDAS.Responsavel` e `VENDAS.Produto` sao TEXTO, e virar id exige ler
// RESPONSAVEIS e PRODUTOS -- isto e, I/O. Aqui o nome fica preservado nos campos
// de join (`afiliadoNome`, `produtoNome`) com o id vazio, e quem resolve e o
// provider (`sheets-db.ts`), que ja tem as duas abas na mao. Assim as conversoes
// continuam puras e testaveis sem rede.
//
// DECISAO SOBRE O TIPO DA CELULA NA ESCRITA: numero vai como `number` do
// JavaScript e nao como texto. A invariante 5 do contrato manda gravar Number, e
// o `converter()` do raro-sync.gs devolve `typeof valor === 'number'` intacto.
// `escreverNumero` (que produz "1234,56") passaria pelo `paraNumero` do .gs, mas
// o regex de la (`/,\d{1,2}$/`) so reconhece a virgula decimal com uma ou duas
// casas: "333,3333" viraria 3333333. Valor de parcela dividida cai exatamente
// nesse caso, entao mandar `number` puro e a unica forma segura.

import {
  lerData,
  lerDataOuNulo,
  lerNumero,
  lerNumeroOuNulo,
  lerPercentual,
  lerTexto,
  escreverData,
  normalizar,
} from "@/lib/sheets/parse";
import { calcLiquido } from "@/lib/domain";
import { PALETA_AGRUPAMENTO } from "@/lib/cores";
import { CATEGORIAS_FONTE, CATEGORIA_FONTE_LABEL, type CategoriaFonte } from "@/lib/fontes";
import type { LinhaExtrato, OrigemExtrato } from "@/lib/extrato/extrato";
import type { RegistroImportacao } from "@/lib/data/provider";
import type {
  Afiliado,
  Agrupamento,
  Aluno,
  Atividade,
  AtividadeTipo,
  Aula,
  Braco,
  Campanha,
  CampanhaTipo,
  CategoriaCaixa,
  Chargeback,
  Comissao,
  ContaBancaria,
  Conteudo,
  ConteudoMetrica,
  ConteudoTipo,
  DirecaoCaixa,
  Despesa,
  Encontro,
  Envio,
  Estagio,
  EscopoMeta,
  FormaPgto,
  Gateway,
  IndicadorMeta,
  Interacao,
  Lancamento,
  Matricula,
  Meta,
  Modulo,
  MotivoChargeback,
  MovimentoCaixa,
  OrigemMovimento,
  Pagavel,
  ParametrosFinanceiros,
  PlataformaSocial,
  Produto,
  ProgressoAula,
  Recebivel,
  RegimeTributario,
  Reuniao,
  ReuniaoStatus,
  StatusChargeback,
  StatusEnvio,
  StatusFunil,
  StatusLancamento,
  StatusMovimento,
  StatusPagamento,
  StatusPagavel,
  StatusRecebivel,
  Tarefa,
  TarefaPrioridade,
  TarefaStatus,
  TipoContaBancaria,
  TipoDespesa,
  TipoProduto,
} from "@/lib/types";

// ============================================================
// Acumulador de avisos
// ============================================================

/**
 * Ocorrencias de conversao que MUDARAM o dado em relacao a planilha.
 *
 * Por que existir: a regra do produto e nunca ajustar em silencio um valor que
 * nao bate com a origem. Se a planilha trouxer "Cartao parcelado sem juros" na
 * coluna de forma de pagamento, o sistema precisa cair em algum valor do enum
 * para nao derrubar a tela -- mas essa substituicao tem que ficar VISIVEL, e nao
 * sumir dentro de um numero que parece certo.
 *
 * `Set` e nao array: uma categoria desconhecida repetida em 400 linhas geraria
 * 400 avisos identicos e afogaria os outros. Aqui vira um aviso so, e a ordem de
 * insercao (garantida pelo Set do JS) preserva a leitura cronologica.
 */
const AVISOS = new Set<string>();

/**
 * Teto de avisos DISTINTOS guardados na janela.
 *
 * O acumulador e estado de MODULO: no servidor Next ele sobrevive entre
 * requisicoes, entao sem janela ele so cresce e, ao bater o teto, passa a
 * descartar em silencio -- o oposto exato do proposito desta funcao. Cinquenta
 * mensagens distintas ja mostram o padrao do problema; o que passar disso vira
 * contagem, nunca sumico.
 */
const TETO_AVISOS = 50;

/** Quantos avisos DISTINTOS ficaram de fora por estouro da janela. */
let avisosDescartados = 0;

function avisar(mensagem: string): void {
  if (AVISOS.has(mensagem)) return;
  if (AVISOS.size >= TETO_AVISOS) {
    avisosDescartados += 1;
    return;
  }
  AVISOS.add(mensagem);
}

/**
 * Avisos acumulados desde a ultima limpeza, na ordem em que apareceram.
 *
 * Houve descarte? A ULTIMA entrada diz quantos ficaram de fora. Nunca ficar em
 * silencio sobre o silencio: um aviso engolido sem rastro e pior que aviso
 * nenhum, porque a tela passa a afirmar que esta tudo certo.
 */
export function avisosDeMapeamento(): string[] {
  const lista = [...AVISOS];
  if (avisosDescartados > 0) {
    lista.push(
      `... e mais ${avisosDescartados} aviso(s) distinto(s) nao exibido(s): a janela guarda ${TETO_AVISOS}.`
    );
  }
  return lista;
}

/** Zera o acumulador. Usado no comeco de um diagnostico e nos testes. */
export function limparAvisosDeMapeamento(): void {
  AVISOS.clear();
  avisosDescartados = 0;
}

// ============================================================
// Leitura de celula e resolucao de dominio
// ============================================================

/**
 * Valor de uma coluna pelo TITULO, tolerante a acento e caixa.
 *
 * O acesso direto vem primeiro porque e o caso comum e nao aloca nada. A varredura
 * normalizada e a rede de seguranca: a planilha do dono grava "Comissao" e o
 * codigo pode pedir "Comissão", e um `undefined` silencioso aqui viraria valor
 * zero no painel sem nenhum erro.
 */
export function celulaDe(linha: Record<string, string>, titulo: string): string {
  const direto = linha[titulo];
  if (typeof direto === "string") return direto.trim();

  const alvo = normalizar(titulo);
  for (const chave of Object.keys(linha)) {
    if (normalizar(chave) === alvo) return lerTexto(linha[chave]);
  }
  return "";
}

/**
 * Casa o texto da celula com um item do enum. Celula vazia cai no neutro SEM
 * aviso (ausencia de informacao nao e informacao errada); texto preenchido que
 * nao casa cai no neutro COM aviso, porque ai houve substituicao de dado.
 */
function daLista<T extends string>(
  valor: string,
  mapa: Record<string, T>,
  neutro: T,
  contexto: string
): T {
  const chave = normalizar(valor);
  if (chave === "") return neutro;
  const achado = mapa[chave];
  if (achado !== undefined) return achado;
  avisar(`${contexto}: valor "${valor}" nao existe no sistema; foi lido como "${neutro}".`);
  return neutro;
}

/** Numero pronto para a celula: sempre finito, sempre `number` (ver cabecalho). */
function num(n: number | null | undefined): number {
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

/** Data ISO -> "dd/mm/aaaa". Vazio/nulo vira celula vazia, nunca a string "null". */
function dataCelula(iso: string | null | undefined): string {
  return iso ? escreverData(iso) : "";
}

/**
 * Data COM HORA vai para a celula como ISO cru.
 *
 * `escreverData` corta a hora, e em ATIVIDADES e REUNIOES a hora e a informacao
 * (linha do tempo e agenda). O `paraData` do .gs cai no `new Date(texto)` para
 * ISO completo e monta o Date com hora certa.
 */
function dataHoraCelula(iso: string | null | undefined): string {
  const bruto = lerTexto(iso);
  if (bruto === "") return "";
  // Sem hora no texto, "dd/mm/aaaa" e mais seguro: ISO puro de data e lido pelo
  // .gs no fuso local, e ISO com "Z" voltaria um dia em fuso negativo.
  return bruto.includes("T") ? bruto : dataCelula(bruto);
}

/** Texto pronto para a celula: nulo vira vazio. */
function txt(v: string | null | undefined): string {
  return typeof v === "string" ? v : "";
}

/**
 * Data/hora lida da celula. Preserva a hora quando existe; sem hora, devolve o
 * ISO de data que o `lerData` entrega.
 */
function lerDataHora(v: string | undefined | null): string {
  const bruto = lerTexto(v);
  if (bruto === "") return "";
  if (/\d{4}-\d{2}-\d{2}T/.test(bruto)) return bruto;
  return lerData(bruto);
}

/** Booleano da planilha. `Ativo`/`Ativa` aceitam "Sim", TRUE, "x", 1... */
function lerBool(v: string): boolean {
  const n = normalizar(v);
  return n === "sim" || n === "s" || n === "true" || n === "verdadeiro" || n === "v" || n === "1" || n === "x" || n === "ok";
}

// ============================================================
// Dominios compartilhados
// ============================================================

// Dicionario legado dos tres bracos fixos do cliente que originou o sistema.
// So sobrevive para casar o texto digitado a mao na coluna `Referencia` de
// METAS (linhaParaMeta, abaixo) contra um agrupamento sem precisar da lista de
// cadastro -- as metas escritas quando o sistema so conhecia esses tres nomes
// continuam lendo certo mesmo que o dono nunca tenha cadastrado um
// `Agrupamento` chamado "corpo"/"mente"/"espirito" depois da migracao (ver
// DIVIDA DE ENGENHARIA em types.ts). Agrupamento CRIADO pelo usuario -- que
// nao esta nesta lista -- resolve por `resolverReferenciaDeAgrupamentos`,
// abaixo, contra a lista de cadastro que o provider passa em `linhaParaMeta`.
// NAO usar para validar `Braco` de resto: ver bracoDeTexto.
const BRACOS: Record<string, Braco> = {
  corpo: "corpo",
  mente: "mente",
  espirito: "espirito",
};

/**
 * Braco (id de agrupamento) do texto da planilha. Devolve `null` para celula
 * vazia -- que e o certo: `Braco` nao tem valor neutro, e escolher um
 * agrupamento para uma celula em branco atribuiria a lente estrutural errada
 * a metade da operacao.
 *
 * Ate esta obra, `Braco` era uniao fixa de tres literais e esta funcao
 * validava contra eles. Agora agrupamento e CADASTRO DO USUARIO (ver
 * src/lib/agrupamentos.ts) e o id gravado aqui vem do proprio cadastro (ex.:
 * "AGR-3"), nao mais de uma lista fixa -- validar contra so tres nomes faria
 * qualquer agrupamento novo do cliente sumir silenciosamente na proxima
 * leitura. A celula so precisa existir; quem confere se o id ainda esta
 * cadastrado (ou virou orfao) e a camada de agrupamentos.ts, na leitura.
 */
export function bracoDeTexto(valor: string, _contexto = "Braco"): Braco | null {
  const bruto = valor.trim();
  return bruto === "" ? null : bruto;
}

const GATEWAYS: Record<string, Gateway> = {
  hotmart: "hotmart",
  kiwify: "kiwify",
  eduzz: "eduzz",
  stripe: "stripe",
  manual: "manual",
};

/**
 * Categorias de despesa da planilha -> plano de contas do caixa.
 * Cobre a lista de `CATEGORIAS_DESPESA` de domain.ts e os rotulos do proprio
 * `CategoriaCaixa`, para a ida e volta fechar.
 */
const CATEGORIAS_CAIXA: Record<string, CategoriaCaixa> = {
  "trafego pago": "trafego",
  trafego: "trafego",
  "ferramentas e software": "saas_ferramentas",
  "plataforma de curso": "saas_ferramentas",
  "saas e ferramentas": "saas_ferramentas",
  saas_ferramentas: "saas_ferramentas",
  equipe: "folha_prolabore",
  "folha e pro-labore": "folha_prolabore",
  "folha e pro labore": "folha_prolabore",
  folha_prolabore: "folha_prolabore",
  "producao de conteudo": "producao_conteudo",
  producao_conteudo: "producao_conteudo",
  impostos: "impostos",
  "taxas de pagamento": "taxas_gateway",
  "taxas de gateway": "taxas_gateway",
  taxas_gateway: "taxas_gateway",
  // Nao ha categoria de evento no plano de contas: cai em `outros` por decisao
  // do contrato, e por isso NAO gera aviso -- e mapeamento conhecido, nao perda.
  "eventos e presencial": "outros",
  comissoes: "comissoes",
  reembolsos: "reembolsos",
  vendas: "vendas",
  "outras receitas": "outras_receitas",
  outras_receitas: "outras_receitas",
  outros: "outros",
};

/**
 * Categoria de texto livre -> `CategoriaCaixa`. Desconhecida cai em `outros` e
 * NUNCA falha: perder uma despesa por causa de um rotulo novo e pior que
 * classifica-la como "outros". O texto original continua vivo em
 * `Despesa.categoria`, que e string livre.
 */
export function categoriaCaixaDeTexto(valor: string, contexto = "DESPESAS.Categoria"): CategoriaCaixa {
  return daLista(valor, CATEGORIAS_CAIXA, "outros", contexto);
}

const TIPOS_DESPESA: Record<string, TipoDespesa> = {
  fixa: "fixa",
  fixo: "fixa",
  variavel: "variavel",
};

// ============================================================
// Etapa de lead -> Estagio -> StatusFunil
// ============================================================

/**
 * Os estagios que a planilha conhece, na ordem do funil comercial.
 *
 * A planilha descreve o FUNIL (novo, qualificado, negociacao, ganho, perdido); o
 * `StatusFunil` descreve o CICLO DE VIDA do cliente (potencial, novo,
 * recorrente, inativo). Sao eixos diferentes, e por isso o mapeamento passa por
 * `Estagio`: sem ele, `qualificado` e `negociacao` colapsariam os dois em
 * `potencial` e a taxa de conversao por etapa deixaria de existir.
 *
 * `recorrente` nao aparece aqui de proposito: ele e CALCULADO (segunda matricula
 * em VENDAS), nao digitado. Etapa escrita como "recorrente" e ignorada e o
 * sistema recalcula, porque a contagem de matriculas e a fonte de verdade.
 *
 * A `chave` liga cada etapa da planilha ao degrau equivalente da escada
 * canonica (`src/lib/crm/jornada.ts`), que e o que ordena o kanban. So
 * 'Perdido' fica FORA da escada — negocio perdido nao e degrau de jornada
 * nenhum, e forcar 'alumni' ali diria que a pessoa concluiu o programa. Fora
 * da escada a coluna aparece no fim, com o rotulo da planilha, sem afirmar
 * nada sobre onde aquela gente esta.
 */
export const ESTAGIOS_PLANILHA: Estagio[] = [
  { id: "etapa-novo", nome: "Novo", chave: "prospect", ordem: 1, cor: "cinza", funil: "potencial" },
  { id: "etapa-qualificado", nome: "Qualificado", chave: "lead_qualificado", ordem: 2, cor: "azul", funil: "potencial" },
  { id: "etapa-negociacao", nome: "Negociação", chave: "proposta", ordem: 3, cor: "violeta", funil: "potencial" },
  { id: "etapa-ganho", nome: "Ganho", chave: "cliente_novo", ordem: 4, cor: "verde", funil: "novo" },
  { id: "etapa-perdido", nome: "Perdido", chave: "perdido", ordem: 5, cor: "vermelho", funil: "inativo" },
];

/** Aceita a etapa escrita de varios jeitos e devolve sempre um `Estagio`. */
const ETAPAS: Record<string, string> = {
  novo: "etapa-novo",
  lead: "etapa-novo",
  "novo lead": "etapa-novo",
  qualificado: "etapa-qualificado",
  qualificada: "etapa-qualificado",
  negociacao: "etapa-negociacao",
  "em negociacao": "etapa-negociacao",
  ganho: "etapa-ganho",
  ganha: "etapa-ganho",
  fechado: "etapa-ganho",
  perdido: "etapa-perdido",
  perdida: "etapa-perdido",
};

/**
 * Etapa da planilha -> `Estagio` do pipeline. Texto vazio ou desconhecido cai em
 * "Novo", que e o comeco do funil -- o ponto neutro, o que nao antecipa
 * qualificacao nem da a venda por perdida.
 */
export function estagioDaEtapa(valor: string, contexto = "Etapa/Status"): Estagio {
  const chave = normalizar(valor);
  const inicial = ESTAGIOS_PLANILHA[0];
  if (chave === "") return inicial;

  // "recorrente" e legitimo na planilha e ignorado por decisao do contrato:
  // aviso seria ruido, porque nao ha erro nenhum na celula.
  if (chave === "recorrente") return ESTAGIOS_PLANILHA[3];

  const id = ETAPAS[chave];
  const achado = id ? ESTAGIOS_PLANILHA.find((e) => e.id === id) : undefined;
  if (achado) return achado;

  avisar(`${contexto}: etapa "${valor}" nao existe no funil; a linha entrou como "${inicial.nome}".`);
  return inicial;
}

/** O balde de ciclo de vida em que a etapa cai. */
export function funilDaEtapa(valor: string, contexto = "Etapa/Status"): StatusFunil {
  return estagioDaEtapa(valor, contexto).funil;
}

/** Caminho inverso: `StatusFunil` -> a etapa que a planilha guarda. */
export function etapaDoFunil(status: StatusFunil): string | null {
  // `recorrente` nao tem etapa: e calculado a partir da contagem de matriculas.
  const achado = ESTAGIOS_PLANILHA.find((e) => e.funil === status);
  return achado ? achado.nome : null;
}

// ============================================================
// VENDAS <-> Matricula (+ Comissao)
// ============================================================

/**
 * A venda foi paga em Pix E cartao na mesma transacao?
 *
 * Importa porque `Matricula.formaPgto` e um valor so: a matricula recebe a forma
 * DA PARTE DO CARTAO (que e a parte que gera taxa e parcelamento), e o valor
 * liquido passa a ser a soma dos recebiveis -- nunca `calcLiquido` sobre o valor
 * cheio, que aplicaria taxa de cartao em cima do pedaco que veio no Pix.
 */
export function vendaEhHibrida(formaTexto: string): boolean {
  const t = normalizar(formaTexto);
  return t.includes("pix") && (t.includes("cartao") || t.includes("credito"));
}

/**
 * Forma de pagamento: a planilha guarda a modalidade numa coluna e o numero de
 * parcelas em OUTRA, e o `FormaPgto` do sistema separa credito por faixa de
 * parcelas porque a taxa muda (2,69% / 3,09% / 3,99%). A conversao depende das
 * duas colunas juntas -- e a razao de esta funcao receber dois argumentos.
 *
 * Acima de 12x tambem cai em `credito_7x12x`: e aproximacao assumida, a tabela
 * de taxas nao vai alem de 12x.
 */
export function formaPgtoDaVenda(formaTexto: string, nParcelas: number): FormaPgto {
  const t = normalizar(formaTexto);

  const porParcelas = (): FormaPgto => {
    if (nParcelas <= 1) return "credito_vista";
    if (nParcelas <= 6) return "credito_2x6x";
    return "credito_7x12x";
  };

  if (t === "") return "pix";

  // Hibrida primeiro: "Pix + Cartao" contem as duas palavras e a regra e a do cartao.
  if (vendaEhHibrida(t)) return porParcelas();

  // Debito antes do teste generico de cartao, senao "Cartao de debito" cairia em credito.
  if (t.includes("debito")) return "debito";
  if (t.includes("credito") || t.includes("cartao")) return porParcelas();
  if (t.includes("pix")) return "pix";
  if (t.includes("dinheiro") || t.includes("especie")) return "dinheiro";

  if (t.includes("boleto")) {
    // Nao existe `boleto` em FormaPgto. `pix` e a aproximacao menos ruim (taxa 0,
    // liquidacao rapida) e ela SUBESTIMA o custo do boleto -- por isso vira aviso.
    avisar(
      'VENDAS.Forma de pagamento: "Boleto" nao existe no sistema e foi lido como "pix". ' +
        "O custo do boleto fica subestimado ate `boleto` entrar em FormaPgto."
    );
    return "pix";
  }

  avisar(`VENDAS.Forma de pagamento: valor "${formaTexto}" nao existe no sistema; foi lido como "pix".`);
  return "pix";
}

const STATUS_VENDA: Record<string, "fechada" | "reembolsada" | "cancelada"> = {
  fechada: "fechada",
  fechado: "fechada",
  ganha: "fechada",
  reembolsada: "reembolsada",
  reembolsado: "reembolsada",
  cancelada: "cancelada",
  cancelado: "cancelada",
};

/**
 * Status da venda -> `StatusPagamento`.
 *
 * "Fechada" e sobre a NEGOCIACAO, nao sobre o dinheiro: quem sabe se foi pago
 * sao os recebiveis daquela venda. Por isso `todosRecebidos` entra na decisao.
 *
 * `cancelada` vira `reembolsado` porque `StatusPagamento` nao tem `cancelado`.
 * Perde-se bastante: cancelamento (o cliente desistiu antes de pagar, nunca
 * houve dinheiro) e reembolso (devolvemos dinheiro que ja tinhamos) passam a ser
 * a mesma coisa na tela. A recomendacao registrada no contrato e acrescentar
 * `cancelado` a `StatusPagamento`.
 */
export function statusVendaParaPagamento(statusTexto: string, todosRecebidos: boolean): StatusPagamento {
  const chave = normalizar(statusTexto);
  if (chave === "") return "pendente";

  const status = STATUS_VENDA[chave];
  if (!status) {
    avisar(`VENDAS.Status: valor "${statusTexto}" nao existe no sistema; foi lido como "pendente".`);
    return "pendente";
  }
  if (status === "fechada") return todosRecebidos ? "pago" : "pendente";
  return "reembolsado";
}

/** Contexto que so existe olhando OUTRAS abas; o provider preenche, o mapeamento nao. */
export type ContextoVenda = {
  /** Todos os recebiveis desta venda ja foram recebidos? Decide `pago` x `pendente`. */
  todosRecebidos?: boolean;
  /** Soma dos recebiveis da venda -- e o liquido correto na venda hibrida. */
  liquidoDosRecebiveis?: number;
};

export function linhaParaMatricula(linha: Record<string, string>, ctx: ContextoVenda = {}): Matricula {
  const valor = lerNumero(celulaDe(linha, "Valor da venda"));
  const parcelas = lerNumero(celulaDe(linha, "N de parcelas"));
  const formaTexto = celulaDe(linha, "Forma de pagamento");
  const formaPgto = formaPgtoDaVenda(formaTexto, parcelas);

  // "Recebimento cartao" e AMBIGUO no arquivo do dono: pode guardar o valor
  // liquido que caiu ou a data de liberacao do gateway. Discriminamos pelo
  // formato -- `lerData` so aceita data de verdade, entao texto que ela recusa e
  // valor. Enquanto a decisao nao for tomada pelo dono, cada linha decide sozinha.
  const recebimentoCartao = celulaDe(linha, "Recebimento cartao");
  const dataLiberacao = recebimentoCartao === "" ? null : lerDataOuNulo(recebimentoCartao);
  const liquidoDaColuna =
    recebimentoCartao !== "" && dataLiberacao === null ? lerNumeroOuNulo(recebimentoCartao) : null;

  const hibrida = vendaEhHibrida(formaTexto);
  const valorLiquido =
    liquidoDaColuna ??
    // Na venda hibrida o liquido e a soma dos recebiveis: `calcLiquido` sobre o
    // valor cheio cobraria taxa de cartao em cima do pedaco pago no Pix.
    (hibrida ? ctx.liquidoDosRecebiveis ?? valor : calcLiquido(valor, formaPgto));

  const canal = celulaDe(linha, "Canal de origem");

  return {
    id: celulaDe(linha, "ID"),
    // ID_Aluno vem direto da linha (coluna propria de VENDAS, acrescentada em
    // 2026-08). Celula vazia vira "" -- NUNCA inventamos id: venda sem dono
    // e caso normal (dinheiro entrou, so nao sabemos de quem), nao erro.
    // O NOME do aluno ainda depende de ALUNOS, entao continua resolvido pelo
    // provider (que tem o indice alunoPorId).
    alunoId: celulaDe(linha, "ID_Aluno"),
    produtoId: "",
    lancamentoId: null,
    afiliadoId: null,
    turmaId: null,
    valor,
    formaPgto,
    valorLiquido,
    data: lerData(celulaDe(linha, "Data")),
    statusPagamento: statusVendaParaPagamento(celulaDe(linha, "Status"), ctx.todosRecebidos === true),
    origem: canal,
    isUpsell: false, // calculado pelo provider: exige contar matriculas do aluno
    braco: null, // herdado do responsavel pelo provider
    gateway: "manual", // a planilha nao registra gateway
    valorBruto: valor,
    taxaGateway: +(valor - valorLiquido).toFixed(2),
    dataLiberacao,
    utmSource: canal,
    utmCampaign: "",
    produtoNome: celulaDe(linha, "Produto"),
    afiliadoNome: celulaDe(linha, "Responsavel") || null,
  };
}

/**
 * `Matricula` -> linha de VENDAS.
 *
 * Os nomes de responsavel e produto saem dos campos de join (`afiliadoNome`,
 * `produtoNome`): a planilha guarda TEXTO nessas colunas, nao id. Sem o join
 * preenchido a coluna sairia vazia e a venda ficaria orfa de produto.
 */
export function matriculaParaLinha(m: Matricula): Record<string, unknown> {
  return {
    ID: txt(m.id),
    Data: dataCelula(m.data),
    Responsavel: txt(m.afiliadoNome),
    Produto: txt(m.produtoNome),
    "Canal de origem": txt(m.origem),
    "Valor da venda": num(m.valorBruto ?? m.valor),
    "Forma de pagamento": formaPgtoParaPlanilha(m.formaPgto),
    "N de parcelas": num(parcelasDaForma(m.formaPgto)),
    "Recebimento cartao": num(m.valorLiquido),
    Status: statusPagamentoParaPlanilha(m.statusPagamento),
    // Grava o id tal como veio -- "" para venda sem dono. Nao inventamos
    // ALU-fantasma so para a celula nao ficar vazia.
    ID_Aluno: txt(m.alunoId),
  };
}

/** `FormaPgto` -> o texto que a lista de validacao da planilha aceita. */
export function formaPgtoParaPlanilha(forma: FormaPgto): string {
  if (forma === "pix") return "Pix";
  if (forma === "dinheiro") return "Dinheiro";
  if (forma === "debito") return "Cartao de debito";
  return "Cartao de credito";
}

/**
 * Numero de parcelas que a faixa de credito representa.
 *
 * A faixa e um intervalo e a coluna e um numero: a ida e volta escolhe o MENOR
 * numero da faixa (1, 2, 7), que e o unico que devolve a mesma faixa quando lido
 * de novo. Escolher o maior (6, 12) tambem fecharia, mas afirmaria um
 * parcelamento que ninguem digitou.
 */
export function parcelasDaForma(forma: FormaPgto): number {
  if (forma === "credito_2x6x") return 2;
  if (forma === "credito_7x12x") return 7;
  return 1;
}

/** `StatusPagamento` -> o texto de `Status` em VENDAS. */
export function statusPagamentoParaPlanilha(status: StatusPagamento): string {
  return status === "reembolsado" ? "reembolsada" : "fechada";
}

/**
 * A comissao registrada na venda vira entidade propria.
 * `pct` e RECALCULADO (`valor / valorDaVenda * 100`) porque a planilha guarda o
 * valor em reais, nao o percentual -- e o percentual e o que permite conferir se
 * o combinado com o responsavel foi respeitado.
 */
export function linhaParaComissao(linha: Record<string, string>): Comissao | null {
  const valorComissao = lerNumero(celulaDe(linha, "Comissao"));
  if (valorComissao === 0) return null;

  const valorVenda = lerNumero(celulaDe(linha, "Valor da venda"));
  const id = celulaDe(linha, "ID");
  return {
    id: `COM-${id}`,
    matriculaId: id,
    afiliadoId: "", // resolvido pelo provider a partir de Responsavel
    pct: valorVenda > 0 ? +((valorComissao / valorVenda) * 100).toFixed(2) : 0,
    valor: valorComissao,
    data: lerData(celulaDe(linha, "Data")),
  };
}

// ============================================================
// RECEBIVEIS <-> Recebivel
// ============================================================

const STATUS_RECEBIVEL: Record<string, StatusRecebivel> = {
  "a vencer": "a_vencer",
  a_vencer: "a_vencer",
  aberto: "a_vencer",
  pendente: "a_vencer",
  recebido: "recebido",
  recebida: "recebido",
  pago: "recebido",
  atrasado: "atrasado",
};

/** Contexto de conversao do recebivel (nada disso esta na linha). */
export type ContextoRecebivel = {
  /** Data de referencia para derivar `atrasado`. ISO. Default: hoje. */
  hoje?: string;
  /** D+X do cartao, que vem do bloco PARAMETROS de CONFIG. Default 30. */
  diasLiberacaoCartao?: number;
};

/**
 * D+X a partir da forma de pagamento, porque a planilha nao tem coluna de
 * gateway: Pix e Dinheiro liquidam no dia, boleto em D+1, cartao conforme o
 * parametro. Sem isso o fluxo de caixa mostraria o dinheiro do cartao entrando
 * no dia da venda, que e justamente o erro que a camada de caixa existe para
 * evitar.
 */
export function diasLiberacaoDaForma(formaTexto: string, diasCartao: number): number {
  const t = normalizar(formaTexto);
  if (t.includes("boleto")) return 1;
  if (t.includes("cartao") || t.includes("credito") || t.includes("debito")) return diasCartao;
  return 0;
}

/** "Parcela 2/6" -> { parcela: 2, totalParcelas: 6 }. Sem padrao, assume 1/1. */
function parcelasDaDescricao(descricao: string): { parcela: number; totalParcelas: number } {
  const m = descricao.match(/(\d+)\s*\/\s*(\d+)/);
  if (!m) return { parcela: 1, totalParcelas: 1 };
  return { parcela: Number(m[1]) || 1, totalParcelas: Number(m[2]) || 1 };
}

export function linhaParaRecebivel(
  linha: Record<string, string>,
  ctx: ContextoRecebivel = {}
): Recebivel {
  const idVenda = celulaDe(linha, "ID_Venda");
  const descricao = celulaDe(linha, "Descricao");
  const vencimento = lerData(celulaDe(linha, "Vencimento"));
  const dataRecebimento = lerDataOuNulo(celulaDe(linha, "Data recebimento"));
  const { parcela, totalParcelas } = parcelasDaDescricao(descricao);

  let status = daLista(celulaDe(linha, "Status"), STATUS_RECEBIVEL, "a_vencer", "RECEBIVEIS.Status");
  // `recebido` vence a derivacao: data de recebimento preenchida e o fato.
  if (dataRecebimento) status = "recebido";
  else if (status === "a_vencer") {
    // `atrasado` NAO e digitado, e derivado: venceu e nao entrou.
    const hoje = ctx.hoje ?? new Date().toISOString().slice(0, 10);
    if (vencimento !== "" && vencimento < hoje) status = "atrasado";
  }

  return {
    id: celulaDe(linha, "ID"),
    origem: idVenda === "" ? "manual" : "matricula",
    origemId: idVenda === "" ? null : idVenda,
    descricao,
    valor: lerNumero(celulaDe(linha, "Valor")),
    vencimento,
    dataRecebimento,
    status,
    gateway: "manual", // a planilha nao registra gateway
    diasLiberacao: diasLiberacaoDaForma(
      celulaDe(linha, "Forma de pagamento"),
      ctx.diasLiberacaoCartao ?? 30
    ),
    parcela,
    totalParcelas,
    braco: null, // resolvido pelo provider a partir de Responsavel
    contaId: null, // so existe se houver o movimento correspondente em MOVIMENTOS
  };
}

export function recebivelParaLinha(r: Recebivel, responsavel = ""): Record<string, unknown> {
  return {
    ID: txt(r.id),
    ID_Venda: txt(r.origemId),
    Responsavel: responsavel,
    Descricao: txt(r.descricao),
    "Forma de pagamento": r.diasLiberacao === 0 ? "Pix" : "Cartao de credito",
    Vencimento: dataCelula(r.vencimento),
    Valor: num(r.valor),
    Status: r.status === "recebido" ? "Recebido" : "A vencer",
    "Data recebimento": dataCelula(r.dataRecebimento),
  };
}

// ============================================================
// DESPESAS <-> Despesa (competencia) e <-> Pagavel (caixa)
// ============================================================

/**
 * UMA linha de DESPESAS alimenta DUAS entidades: `Despesa` (competencia, vai
 * para o DRE) e `Pagavel` (caixa, vai para contas a pagar). Nao sao duas
 * despesas, sao duas visoes da mesma -- por isso compartilham o ID de proposito.
 */
export function linhaParaDespesa(linha: Record<string, string>): Despesa {
  return {
    id: celulaDe(linha, "ID"),
    data: lerData(celulaDe(linha, "Data")),
    descricao: celulaDe(linha, "Descricao"),
    // Texto ORIGINAL, nao a categoria tipada: `Despesa.categoria` e string livre,
    // entao nada se perde no caminho. A versao tipada mora no `Pagavel`.
    categoria: celulaDe(linha, "Categoria"),
    tipo: daLista(celulaDe(linha, "Tipo"), TIPOS_DESPESA, "variavel", "DESPESAS.Tipo"),
    valor: lerNumero(celulaDe(linha, "Valor")),
    braco: null, // a aba nao tem coluna de braco
    lancamentoId: null, // idem: atribuicao a lancamento passaria por MOVIMENTOS
  };
}

export function despesaParaLinha(d: Despesa): Record<string, unknown> {
  return {
    ID: txt(d.id),
    Data: dataCelula(d.data),
    Categoria: txt(d.categoria),
    Tipo: d.tipo === "fixa" ? "Fixa" : "Variavel",
    Descricao: txt(d.descricao),
    Valor: num(d.valor),
  };
}

const STATUS_PAGAVEL: Record<string, StatusPagavel> = {
  "a vencer": "a_vencer",
  a_vencer: "a_vencer",
  aberto: "a_vencer",
  pendente: "a_vencer",
  pago: "pago",
  paga: "pago",
  atrasado: "atrasado",
};

export function linhaParaPagavel(linha: Record<string, string>, hoje?: string): Pagavel {
  const vencimento = lerData(celulaDe(linha, "Vencimento"));
  const dataPagamento = lerDataOuNulo(celulaDe(linha, "Data pagamento"));

  let status = daLista(celulaDe(linha, "Status"), STATUS_PAGAVEL, "a_vencer", "DESPESAS.Status");
  if (dataPagamento) status = "pago";
  else if (status === "a_vencer") {
    const referencia = hoje ?? new Date().toISOString().slice(0, 10);
    if (vencimento !== "" && vencimento < referencia) status = "atrasado";
  }

  return {
    id: celulaDe(linha, "ID"),
    categoria: categoriaCaixaDeTexto(celulaDe(linha, "Categoria")),
    fornecedor: celulaDe(linha, "Fornecedor"),
    descricao: celulaDe(linha, "Descricao"),
    valor: lerNumero(celulaDe(linha, "Valor")),
    vencimento,
    dataPagamento,
    status,
    tipo: daLista(celulaDe(linha, "Tipo"), TIPOS_DESPESA, "variavel", "DESPESAS.Tipo"),
    braco: null,
    origem: "despesa",
    origemId: celulaDe(linha, "ID"),
    contaId: null, // a coluna "Forma de pagamento" so sugere a conta; nao a define
  };
}

/** Rotulo de `CategoriaCaixa` na grafia que a planilha usa. */
const CATEGORIA_CAIXA_PLANILHA: Record<CategoriaCaixa, string> = {
  vendas: "Vendas",
  outras_receitas: "Outras receitas",
  trafego: "Trafego pago",
  comissoes: "Comissoes",
  taxas_gateway: "Taxas de pagamento",
  impostos: "Impostos",
  folha_prolabore: "Equipe",
  saas_ferramentas: "Ferramentas e software",
  producao_conteudo: "Producao de conteudo",
  reembolsos: "Reembolsos",
  outros: "Outros",
};

export function pagavelParaLinha(p: Pagavel): Record<string, unknown> {
  return {
    ID: txt(p.id),
    Categoria: CATEGORIA_CAIXA_PLANILHA[p.categoria],
    Tipo: p.tipo === "fixa" ? "Fixa" : "Variavel",
    Descricao: txt(p.descricao),
    Fornecedor: txt(p.fornecedor),
    Vencimento: dataCelula(p.vencimento),
    Valor: num(p.valor),
    Status: p.status === "pago" ? "Pago" : "A vencer",
    "Data pagamento": dataCelula(p.dataPagamento),
  };
}

// ============================================================
// ALUNOS <-> Aluno   e   LEADS -> evento de funil
// ============================================================

export function linhaParaAluno(linha: Record<string, string>): Aluno {
  const etapa = celulaDe(linha, "Etapa/Status");
  const estagio = estagioDaEtapa(etapa, "ALUNOS.Etapa/Status");
  return {
    id: celulaDe(linha, "ID"),
    nome: celulaDe(linha, "Nome"),
    telefone: celulaDe(linha, "Telefone"),
    email: celulaDe(linha, "Email"),
    statusFunil: estagio.funil,
    estagioId: estagio.id,
    origem: celulaDe(linha, "Canal de origem"),
    primeiroContato: lerData(celulaDe(linha, "Primeiro contato")),
    observacoes: celulaDe(linha, "Observacoes"),
  };
}

export function alunoParaLinha(a: Aluno, responsavel = "", idLead = ""): Record<string, unknown> {
  const estagio = ESTAGIOS_PLANILHA.find((e) => e.id === a.estagioId);
  return {
    ID: txt(a.id),
    Nome: txt(a.nome),
    Telefone: txt(a.telefone),
    Email: txt(a.email),
    Responsavel: responsavel,
    "Canal de origem": txt(a.origem),
    // Sem estagio conhecido, cai na etapa equivalente ao status de funil.
    "Etapa/Status": estagio?.nome ?? etapaDoFunil(a.statusFunil) ?? "",
    "Primeiro contato": dataCelula(a.primeiroContato),
    Observacoes: txt(a.observacoes),
    ID_Lead: idLead,
  };
}

/**
 * LEADS NAO E PESSOA -- e contador de funil.
 *
 * A aba nao tem nome, telefone nem e-mail, entao uma linha dela nao vira `Aluno`:
 * viraria um cadastro sem identidade, e o CRM passaria a exibir dezenas de
 * "aluno sem nome" que ninguem consegue contatar. O contrato e explicito nisso.
 * O que a linha vira e este evento, que alimenta as series de captacao (por dia,
 * por canal, por responsavel) e o denominador da taxa de conversao no agregado.
 * A ponte para pessoa identificada e `ALUNOS.ID_Lead`.
 */
export type EventoLead = {
  id: string;
  data: string;
  responsavel: string;
  canal: string;
  estagioId: string;
  statusFunil: StatusFunil;
};

export function linhaParaEventoLead(linha: Record<string, string>): EventoLead {
  const estagio = estagioDaEtapa(celulaDe(linha, "Etapa/Status"), "LEADS.Etapa/Status");
  return {
    id: celulaDe(linha, "ID"),
    data: lerData(celulaDe(linha, "Data")),
    responsavel: celulaDe(linha, "Responsavel"),
    canal: celulaDe(linha, "Canal de origem"),
    estagioId: estagio.id,
    statusFunil: estagio.funil,
  };
}

export function eventoLeadParaLinha(e: EventoLead): Record<string, unknown> {
  const estagio = ESTAGIOS_PLANILHA.find((x) => x.id === e.estagioId);
  return {
    ID: txt(e.id),
    Data: dataCelula(e.data),
    Responsavel: txt(e.responsavel),
    "Canal de origem": txt(e.canal),
    "Etapa/Status": estagio?.nome ?? "",
  };
}

// ============================================================
// METAS <-> Meta
// ============================================================

const INDICADORES_META: Record<string, IndicadorMeta> = {
  faturamento: "faturamento",
  receita: "faturamento",
  lucro: "lucro",
  vendas: "vendas",
  "n de vendas": "vendas",
  ticket: "ticket",
  "ticket medio": "ticket",
  roas: "roas",
  cac: "cac",
};

/** Indicadores cujo valor vem da coluna `Meta (R$)`; os demais vem de `Meta (n)`. */
const INDICADOR_MONETARIO: Record<IndicadorMeta, boolean> = {
  faturamento: true,
  lucro: true,
  ticket: true,
  cac: true,
  vendas: false,
  roas: false,
};

/** Resolve o texto de `Referencia` contra RESPONSAVEIS/PRODUTOS (o provider sabe). */
export type ResolverReferencia = (nome: string) => { escopo: EscopoMeta; escopoRef: string } | null;

/**
 * Constroi um `ResolverReferencia` que casa `METAS.Referencia` contra os
 * agrupamentos CADASTRADOS pelo usuario (aba AGRUPAMENTOS) -- o provider chama
 * isto com a lista que ja tem em maos e passa o resultado para `linhaParaMeta`.
 *
 * Duas tentativas, nesta ordem:
 * 1. Id exato: cobre uma meta gravada pelo proprio sistema, que guardaria o id
 *    do cadastro (ex.: "AGR-3"), nao o nome.
 * 2. Nome normalizado (minusculo, sem acento, espacos colapsados, via
 *    `normalizar`): cobre o caso comum, o dono digitando o NOME a mao na
 *    planilha -- "Espírito", "espirito" ou "ESPIRITO " tem que casar com o
 *    mesmo cadastro.
 *
 * So entra em jogo quando `BRACOS` (o dicionario legado dos tres nomes fixos,
 * acima) nao reconhece o texto -- ou seja, exatamente para o agrupamento que o
 * cliente criou depois que os tres nomes deixaram de ser a lista inteira.
 */
export function resolverReferenciaDeAgrupamentos(agrupamentos: Agrupamento[]): ResolverReferencia {
  return (nome: string) => {
    const porId = agrupamentos.find((a) => a.id === nome);
    if (porId) return { escopo: "braco", escopoRef: porId.id };

    const alvo = normalizar(nome);
    const porNome = agrupamentos.find((a) => normalizar(a.nome) === alvo);
    if (porNome) return { escopo: "braco", escopoRef: porNome.id };

    return null;
  };
}

/**
 * METAS -> `Meta`. Devolve `null` quando o indicador nao existe no sistema.
 *
 * Aqui a recusa e proposital e diverge do resto do arquivo: categoria
 * desconhecida vira "outros" porque perder a despesa e pior, mas meta com
 * indicador errado e PIOR que meta ausente -- ela vira um alvo falso que o
 * painel compara com o real e usa para dizer se a operacao esta bem ou mal.
 */
export function linhaParaMeta(
  linha: Record<string, string>,
  resolver?: ResolverReferencia
): Meta | null {
  const tipo = celulaDe(linha, "Tipo de meta");
  const indicador = INDICADORES_META[normalizar(tipo)];
  if (!indicador) {
    avisar(
      `METAS.Tipo de meta: indicador "${tipo}" nao existe no sistema; a meta foi RECUSADA ` +
        `(meta com indicador errado e pior que meta ausente).`
    );
    return null;
  }

  const referencia = celulaDe(linha, "Referencia");
  let escopo: EscopoMeta = "global";
  let escopoRef: string | null = null;

  if (referencia !== "") {
    const braco = BRACOS[normalizar(referencia)];
    if (braco) {
      escopo = "braco";
      escopoRef = braco;
    } else {
      const resolvido = resolver?.(referencia) ?? null;
      if (resolvido) {
        escopo = resolvido.escopo;
        escopoRef = resolvido.escopoRef;
      } else {
        // Nem os tres nomes legados nem o resolver (agrupamentos cadastrados,
        // e o que mais o provider souber resolver) reconheceram o texto. O
        // texto ainda vira referencia de afiliado -- e o escopo mais comum e
        // o unico que preserva o que foi digitado para conferencia depois --
        // mas isso e um CHUTE, e chute tem que aparecer: pode ser um
        // agrupamento cadastrado com erro de grafia, e sem aviso a meta cai
        // no escopo errado sem ninguem notar.
        avisar(
          `METAS.Referencia: "${referencia}" nao bate com nenhum agrupamento cadastrado nem com os ` +
            `tres nomes legados (corpo/mente/espirito); a meta foi lida com escopo "afiliado" e essa ` +
            `referencia -- confira se nao e um agrupamento digitado com erro de grafia.`
        );
        escopo = "afiliado";
        escopoRef = referencia;
      }
    }
  }

  return {
    id: celulaDe(linha, "ID"),
    indicador,
    escopo,
    escopoRef,
    // "2026-08-15" e "08/2026" viram "2026-08": o tipo guarda ano-mes.
    periodo: periodoAnoMes(celulaDe(linha, "Periodo")),
    valor: INDICADOR_MONETARIO[indicador]
      ? lerNumero(celulaDe(linha, "Meta (R$)"))
      : lerNumero(celulaDe(linha, "Meta (n)")),
  };
}

/** Normaliza `Periodo` para "YYYY-MM", aceitando data completa e "mm/aaaa". */
export function periodoAnoMes(valor: string): string {
  const bruto = lerTexto(valor);
  if (bruto === "") return "";

  const iso = lerData(bruto);
  if (iso !== "") return iso.slice(0, 7);

  const anoMesIso = bruto.match(/^(\d{4})-(\d{1,2})$/);
  if (anoMesIso) return `${anoMesIso[1]}-${String(Number(anoMesIso[2])).padStart(2, "0")}`;

  const mesAno = bruto.match(/^(\d{1,2})\/(\d{4})$/);
  if (mesAno) return `${mesAno[2]}-${String(Number(mesAno[1])).padStart(2, "0")}`;

  return bruto;
}

const INDICADOR_PLANILHA: Record<IndicadorMeta, string> = {
  faturamento: "faturamento",
  lucro: "lucro",
  vendas: "vendas",
  ticket: "ticket",
  roas: "roas",
  cac: "cac",
};

export function metaParaLinha(m: Meta): Record<string, unknown> {
  const monetaria = INDICADOR_MONETARIO[m.indicador];
  return {
    ID: txt(m.id),
    "Tipo de meta": INDICADOR_PLANILHA[m.indicador],
    Referencia: txt(m.escopoRef),
    Periodo: txt(m.periodo),
    // Nunca preencher as duas: qual coluna vale depende do indicador, e as duas
    // preenchidas deixariam o proximo import sem criterio para escolher.
    "Meta (R$)": monetaria ? num(m.valor) : "",
    "Meta (n)": monetaria ? "" : num(m.valor),
  };
}

// ============================================================
// INVESTIMENTO -> Despesa de trafego / MovimentoCaixa
// ============================================================

/**
 * INVESTIMENTO nao tem entidade propria: cada linha e um gasto de midia.
 * Como `Despesa`, ele entra no DRE e no calculo de margem; como `MovimentoCaixa`
 * (funcao abaixo), entra no fluxo. As duas leituras existem porque a planilha
 * separa investimento de despesa e o sistema nao -- para ele, midia e custo.
 */
export function linhaParaDespesaDeTrafego(linha: Record<string, string>): Despesa {
  const canal = celulaDe(linha, "Canal");
  return {
    id: celulaDe(linha, "ID"),
    data: lerData(celulaDe(linha, "Data")),
    descricao: canal === "" ? "Investimento em midia" : `Trafego pago — ${canal}`,
    categoria: "Tráfego pago",
    // Midia e custo variavel por definicao: some junto com o investimento.
    tipo: "variavel",
    valor: lerNumero(celulaDe(linha, "Investido (R$)")),
    braco: null,
    lancamentoId: null,
  };
}

export function despesaDeTrafegoParaLinha(d: Despesa, canal: string): Record<string, unknown> {
  return {
    ID: txt(d.id),
    Data: dataCelula(d.data),
    Canal: canal,
    "Investido (R$)": num(d.valor),
  };
}

/**
 * A mesma linha vista pelo caixa. A planilha tem UMA data e o movimento tem
 * duas; as duas recebem o mesmo valor porque trafego pago e debitado no dia.
 */
export function linhaParaMovimentoDeTrafego(linha: Record<string, string>): MovimentoCaixa {
  const data = lerData(celulaDe(linha, "Data"));
  const canal = celulaDe(linha, "Canal");
  const id = celulaDe(linha, "ID");
  return {
    id: `MOV-${id}`,
    direcao: "saida",
    categoria: "trafego",
    contaId: "",
    descricao: canal === "" ? "Investimento em midia" : `Trafego pago — ${canal}`,
    valor: lerNumero(celulaDe(linha, "Investido (R$)")),
    dataCompetencia: data,
    dataCaixa: data,
    status: "realizado",
    braco: null,
    origem: "despesa",
    origemId: id,
  };
}

// ============================================================
// RESPONSAVEIS <-> Afiliado
// ============================================================

export function linhaParaAfiliado(linha: Record<string, string>): Afiliado {
  return {
    id: celulaDe(linha, "ID"),
    nome: celulaDe(linha, "Nome"),
    // Celula em branco vira `null`, nao o primeiro agrupamento da lista: um
    // responsavel sem `Braco` preenchido nao pertence a agrupamento nenhum, e
    // forcar um (como este arquivo fazia ate esta obra, caindo em "corpo")
    // fazia a receita dele contar para o agrupamento errado em toda leitura
    // por agrupamento. `null` flui para `Afiliado.braco` (types.ts) e de la
    // para quem agrega (metrics-comando.ts): a receita continua contando no
    // total, so aparece no bucket "sem agrupamento" em vez de sumir ou de
    // ser atribuida a esmo.
    braco: bracoDeTexto(celulaDe(linha, "Braco"), "RESPONSAVEIS.Braco"),
    // Pontos percentuais: 25 e 25%, nunca 0,25.
    pctPadrao: lerPercentual(celulaDe(linha, "Comissao padrao (%)")),
    ativo: lerBool(celulaDe(linha, "Ativo")),
    metaMensal: lerNumero(celulaDe(linha, "Meta mensal (R$)")),
    whatsapp: celulaDe(linha, "WhatsApp"),
    chavePix: celulaDe(linha, "Chave Pix"),
  };
}

export function afiliadoParaLinha(a: Afiliado): Record<string, unknown> {
  return {
    ID: txt(a.id),
    Nome: txt(a.nome),
    // Grava o id do agrupamento cru: nao existe mais dicionario fixo de
    // capitalizacao (BRACO_PLANILHA, removido) para os tres nomes legados --
    // um agrupamento cadastrado pelo usuario pode ser "AGR-3", sem forma
    // "bonita" nenhuma para procurar. bracoDeTexto le de volta sem alterar.
    Braco: txt(a.braco),
    "Comissao padrao (%)": num(a.pctPadrao),
    "Meta mensal (R$)": num(a.metaMensal),
    WhatsApp: txt(a.whatsapp),
    "Chave Pix": txt(a.chavePix),
    Ativo: a.ativo,
  };
}

// ============================================================
// PRODUTOS <-> Produto
// ============================================================

const TIPOS_PRODUTO: Record<string, TipoProduto> = {
  "low ticket": "low_ticket",
  low_ticket: "low_ticket",
  "high ticket": "high_ticket",
  high_ticket: "high_ticket",
  mentoria: "mentoria",
};

/**
 * Chave normalizada -> `CategoriaFonte`, construida a partir do rotulo de
 * `CATEGORIA_FONTE_LABEL` (fontes.ts) em vez de repetir a lista na mao: se o
 * rotulo mudar la, o mapeamento aqui acompanha sem precisar lembrar de mexer
 * nos dois lugares.
 */
const CATEGORIAS_FONTE_MAPA: Record<string, CategoriaFonte> = Object.fromEntries(
  CATEGORIAS_FONTE.map((c) => [normalizar(CATEGORIA_FONTE_LABEL[c]), c])
);

/**
 * Categoria de fonte de renda da planilha -> `CategoriaFonte`. Celula vazia ou
 * desconhecida cai em "curso" (o mesmo neutro de `categoriaValida`, fontes.ts),
 * mas aqui o desconhecido tambem gera aviso -- e o padrao deste arquivo: perder
 * a classificacao em silencio esconderia que a planilha tem um rotulo que o
 * sistema nao reconhece.
 */
export function categoriaFonteDeTexto(valor: string, contexto = "PRODUTOS.Categoria"): CategoriaFonte {
  return daLista(valor, CATEGORIAS_FONTE_MAPA, "curso", contexto);
}

export function linhaParaProduto(linha: Record<string, string>): Produto {
  return {
    id: celulaDe(linha, "ID"),
    nome: celulaDe(linha, "Nome"),
    tipo: daLista(celulaDe(linha, "Tipo"), TIPOS_PRODUTO, "low_ticket", "PRODUTOS.Tipo"),
    precoBase: lerNumero(celulaDe(linha, "Preco base")),
    ativo: lerBool(celulaDe(linha, "Ativo")),
    braco: bracoDeTexto(celulaDe(linha, "Braco"), "PRODUTOS.Braco"),
    categoria: categoriaFonteDeTexto(celulaDe(linha, "Categoria")),
  };
}

const TIPO_PRODUTO_PLANILHA: Record<TipoProduto, string> = {
  low_ticket: "Low ticket",
  high_ticket: "High ticket",
  mentoria: "Mentoria",
};

export function produtoParaLinha(p: Produto): Record<string, unknown> {
  return {
    ID: txt(p.id),
    Nome: txt(p.nome),
    Tipo: TIPO_PRODUTO_PLANILHA[p.tipo],
    "Preco base": num(p.precoBase),
    Ativo: p.ativo,
    Braco: txt(p.braco),
    Categoria: CATEGORIA_FONTE_LABEL[p.categoria],
  };
}

// ============================================================
// LANCAMENTOS <-> Lancamento
// ============================================================

const STATUS_LANCAMENTO: Record<string, StatusLancamento> = {
  planejado: "planejado",
  planejada: "planejado",
  ativo: "ativo",
  ativa: "ativo",
  encerrado: "encerrado",
  encerrada: "encerrado",
};

export function linhaParaLancamento(linha: Record<string, string>): Lancamento {
  return {
    id: celulaDe(linha, "ID"),
    nome: celulaDe(linha, "Nome"),
    produtoId: celulaDe(linha, "ID_Produto"),
    inicio: lerData(celulaDe(linha, "Inicio")),
    fim: lerDataOuNulo(celulaDe(linha, "Fim")),
    status: daLista(celulaDe(linha, "Status"), STATUS_LANCAMENTO, "planejado", "LANCAMENTOS.Status"),
    metaFaturamento: lerNumero(celulaDe(linha, "Meta de faturamento")),
    descricao: celulaDe(linha, "Descricao"),
  };
}

const STATUS_LANCAMENTO_PLANILHA: Record<StatusLancamento, string> = {
  planejado: "Planejado",
  ativo: "Ativo",
  encerrado: "Encerrado",
};

export function lancamentoParaLinha(l: Lancamento): Record<string, unknown> {
  return {
    ID: txt(l.id),
    Nome: txt(l.nome),
    ID_Produto: txt(l.produtoId),
    Inicio: dataCelula(l.inicio),
    Fim: dataCelula(l.fim),
    Status: STATUS_LANCAMENTO_PLANILHA[l.status],
    "Meta de faturamento": num(l.metaFaturamento),
    Descricao: txt(l.descricao),
  };
}

// ============================================================
// CONTAS <-> ContaBancaria
// ============================================================

const TIPOS_CONTA: Record<string, TipoContaBancaria> = {
  corrente: "corrente",
  "conta corrente": "corrente",
  poupanca: "poupanca",
  gateway: "gateway",
  caixa_fisico: "caixa_fisico",
  "caixa fisico": "caixa_fisico",
  investimento: "investimento",
};

const TIPO_CONTA_PLANILHA: Record<TipoContaBancaria, string> = {
  corrente: "Corrente",
  poupanca: "Poupanca",
  gateway: "Gateway",
  caixa_fisico: "Caixa fisico",
  investimento: "Investimento",
};

export function linhaParaContaBancaria(linha: Record<string, string>): ContaBancaria {
  return {
    id: celulaDe(linha, "ID"),
    nome: celulaDe(linha, "Nome"),
    tipo: daLista(celulaDe(linha, "Tipo"), TIPOS_CONTA, "corrente", "CONTAS.Tipo"),
    saldoInicial: lerNumero(celulaDe(linha, "Saldo inicial")),
    dataSaldoInicial: lerData(celulaDe(linha, "Data do saldo inicial")),
    ativa: lerBool(celulaDe(linha, "Ativa")),
    braco: bracoDeTexto(celulaDe(linha, "Braco"), "CONTAS.Braco"),
  };
}

export function contaBancariaParaLinha(c: ContaBancaria): Record<string, unknown> {
  return {
    ID: txt(c.id),
    Nome: txt(c.nome),
    Tipo: TIPO_CONTA_PLANILHA[c.tipo],
    "Saldo inicial": num(c.saldoInicial),
    "Data do saldo inicial": dataCelula(c.dataSaldoInicial),
    Ativa: c.ativa,
    Braco: txt(c.braco),
  };
}

// ============================================================
// MOVIMENTOS <-> MovimentoCaixa
// ============================================================

const DIRECOES: Record<string, DirecaoCaixa> = {
  entrada: "entrada",
  saida: "saida",
  credito: "entrada",
  debito: "saida",
};

const STATUS_MOVIMENTO: Record<string, StatusMovimento> = {
  previsto: "previsto",
  prevista: "previsto",
  realizado: "realizado",
  realizada: "realizado",
};

const ORIGENS_MOVIMENTO: Record<string, OrigemMovimento> = {
  venda: "venda",
  matricula: "matricula",
  despesa: "despesa",
  comissao: "comissao",
  reembolso: "reembolso",
  chargeback: "chargeback",
  manual: "manual",
};

export function linhaParaMovimentoCaixa(linha: Record<string, string>): MovimentoCaixa {
  return {
    id: celulaDe(linha, "ID"),
    // Direcao desconhecida cai em "saida" de proposito: e a leitura pessimista.
    // Chutar "entrada" inflaria o saldo e daria a operacao um dinheiro que ela
    // pode nao ter -- erro que so aparece quando a conta ja estourou.
    direcao: daLista(celulaDe(linha, "Direcao"), DIRECOES, "saida", "MOVIMENTOS.Direcao"),
    categoria: categoriaCaixaDeTexto(celulaDe(linha, "Categoria"), "MOVIMENTOS.Categoria"),
    contaId: celulaDe(linha, "ID_Conta"),
    descricao: celulaDe(linha, "Descricao"),
    valor: lerNumero(celulaDe(linha, "Valor")),
    dataCompetencia: lerData(celulaDe(linha, "Data de competencia")),
    dataCaixa: lerData(celulaDe(linha, "Data de caixa")),
    // "previsto" e o neutro: o saldo real soma so `realizado`, entao o
    // desconhecido nunca entra no caixa de verdade sem alguem confirmar.
    status: daLista(celulaDe(linha, "Status"), STATUS_MOVIMENTO, "previsto", "MOVIMENTOS.Status"),
    braco: bracoDeTexto(celulaDe(linha, "Braco"), "MOVIMENTOS.Braco"),
    origem: daLista(celulaDe(linha, "Origem"), ORIGENS_MOVIMENTO, "manual", "MOVIMENTOS.Origem"),
    origemId: celulaDe(linha, "ID_Origem") || null,
  };
}

export function movimentoCaixaParaLinha(m: MovimentoCaixa): Record<string, unknown> {
  return {
    ID: txt(m.id),
    Direcao: m.direcao,
    Categoria: m.categoria,
    ID_Conta: txt(m.contaId),
    Descricao: txt(m.descricao),
    Valor: num(m.valor),
    "Data de competencia": dataCelula(m.dataCompetencia),
    "Data de caixa": dataCelula(m.dataCaixa),
    Status: m.status,
    Braco: txt(m.braco),
    Origem: m.origem ?? "manual",
    ID_Origem: txt(m.origemId),
  };
}

// ============================================================
// CHARGEBACKS <-> Chargeback
// ============================================================

const MOTIVOS_CHARGEBACK: Record<string, MotivoChargeback> = {
  nao_reconhecido: "nao_reconhecido",
  "nao reconhecido": "nao_reconhecido",
  "compra nao reconhecida": "nao_reconhecido",
  produto_nao_entregue: "produto_nao_entregue",
  "produto nao entregue": "produto_nao_entregue",
  fraude: "fraude",
  duplicidade: "duplicidade",
  "cobranca duplicada": "duplicidade",
  insatisfacao: "insatisfacao",
  outros: "outros",
};

const STATUS_CHARGEBACK: Record<string, StatusChargeback> = {
  aberto: "aberto",
  aberta: "aberto",
  "em disputa": "aberto",
  ganho: "ganho",
  ganha: "ganho",
  perdido: "perdido",
  perdida: "perdido",
};

export function linhaParaChargeback(linha: Record<string, string>): Chargeback {
  return {
    id: celulaDe(linha, "ID"),
    matriculaId: celulaDe(linha, "ID_Venda"),
    valor: lerNumero(celulaDe(linha, "Valor")),
    data: lerData(celulaDe(linha, "Data")),
    dataResolucao: lerDataOuNulo(celulaDe(linha, "Data de resolucao")),
    motivo: daLista(celulaDe(linha, "Motivo"), MOTIVOS_CHARGEBACK, "outros", "CHARGEBACKS.Motivo"),
    // "aberto" e o neutro certo: so `perdido` vira saida definitiva de caixa,
    // entao o desconhecido nunca debita dinheiro que ainda esta em disputa.
    status: daLista(celulaDe(linha, "Status"), STATUS_CHARGEBACK, "aberto", "CHARGEBACKS.Status"),
    gateway: daLista(celulaDe(linha, "Gateway"), GATEWAYS, "manual", "CHARGEBACKS.Gateway"),
    detalhe: celulaDe(linha, "Detalhe"),
    braco: null,
  };
}

export function chargebackParaLinha(c: Chargeback): Record<string, unknown> {
  return {
    ID: txt(c.id),
    ID_Venda: txt(c.matriculaId),
    Valor: num(c.valor),
    Data: dataCelula(c.data),
    "Data de resolucao": dataCelula(c.dataResolucao),
    Motivo: c.motivo,
    Status: c.status,
    Gateway: c.gateway,
    Detalhe: txt(c.detalhe),
  };
}

// ============================================================
// CAMPANHAS <-> Campanha
// ============================================================

const TIPOS_CAMPANHA: Record<string, CampanhaTipo> = {
  pago: "pago",
  "trafego pago": "pago",
  paga: "pago",
  organico: "organico",
  organica: "organico",
};

export function linhaParaCampanha(linha: Record<string, string>): Campanha {
  return {
    id: celulaDe(linha, "ID"),
    nome: celulaDe(linha, "Nome"),
    // "organico" e o neutro: `pago` afirmaria gasto de midia que ninguem
    // registrou e sujaria CAC e ROAS por canal.
    tipo: daLista(celulaDe(linha, "Tipo"), TIPOS_CAMPANHA, "organico", "CAMPANHAS.Tipo"),
    canal: celulaDe(linha, "Canal"),
    objetivo: celulaDe(linha, "Objetivo"),
    orcamento: lerNumero(celulaDe(linha, "Orcamento")),
    inicio: lerData(celulaDe(linha, "Inicio")),
    fim: lerDataOuNulo(celulaDe(linha, "Fim")),
    conteudoId: celulaDe(linha, "ID_Conteudo") || null,
  };
}

export function campanhaParaLinha(c: Campanha): Record<string, unknown> {
  return {
    ID: txt(c.id),
    Nome: txt(c.nome),
    Tipo: c.tipo === "pago" ? "Trafego pago" : "Organico",
    Canal: txt(c.canal),
    Objetivo: txt(c.objetivo),
    Orcamento: num(c.orcamento),
    Inicio: dataCelula(c.inicio),
    Fim: dataCelula(c.fim),
    ID_Conteudo: txt(c.conteudoId),
  };
}

// ============================================================
// CONTEUDOS <-> Conteudo + ConteudoMetrica
// ============================================================

const PLATAFORMAS: Record<string, PlataformaSocial> = {
  instagram: "instagram",
  ig: "instagram",
  tiktok: "tiktok",
  "tik tok": "tiktok",
  facebook: "facebook",
  fb: "facebook",
};

const TIPOS_CONTEUDO: Record<string, ConteudoTipo> = {
  reel: "reel",
  reels: "reel",
  post: "post",
  story: "story",
  stories: "story",
  video: "video",
  carrossel: "carrossel",
};

export function linhaParaConteudo(linha: Record<string, string>): Conteudo {
  return {
    id: celulaDe(linha, "ID"),
    // A planilha guarda o HANDLE do perfil; o id do perfil so existe dentro do
    // sistema. O provider resolve; aqui o handle fica preservado nos dois campos.
    perfilId: celulaDe(linha, "Perfil"),
    plataforma: daLista(celulaDe(linha, "Plataforma"), PLATAFORMAS, "instagram", "CONTEUDOS.Plataforma"),
    perfilHandle: celulaDe(linha, "Perfil"),
    tipo: daLista(celulaDe(linha, "Tipo"), TIPOS_CONTEUDO, "post", "CONTEUDOS.Tipo"),
    titulo: celulaDe(linha, "Titulo"),
    url: celulaDe(linha, "URL"),
    publicadoEm: lerData(celulaDe(linha, "Publicado em")),
    duracaoSeg: lerNumero(celulaDe(linha, "Duracao (seg)")),
    // Roteiro, pontos de retencao e pilares nao tem coluna: sao analise que so
    // existe dentro do sistema.
    roteiro: "",
  };
}

/**
 * A MESMA linha vista pelas metricas. A planilha guarda UMA foto por conteudo, e
 * nao a serie historica -- por isso `coletadoEm` recebe a data de publicacao
 * quando nao ha timestamp: e a unica data verdadeira que a linha carrega.
 */
export function linhaParaConteudoMetrica(linha: Record<string, string>): ConteudoMetrica {
  const duracao = lerNumero(celulaDe(linha, "Duracao (seg)"));
  const retencao = lerPercentual(celulaDe(linha, "Retencao media (%)"));
  return {
    conteudoId: celulaDe(linha, "ID"),
    coletadoEm: lerDataHora(celulaDe(linha, "Timestamp")) || lerData(celulaDe(linha, "Publicado em")),
    views: lerNumero(celulaDe(linha, "Views")),
    likes: lerNumero(celulaDe(linha, "Likes")),
    comentarios: lerNumero(celulaDe(linha, "Comentarios")),
    compartilhamentos: lerNumero(celulaDe(linha, "Compartilhamentos")),
    salvamentos: lerNumero(celulaDe(linha, "Salvamentos")),
    alcance: lerNumero(celulaDe(linha, "Alcance")),
    // Sem coluna propria: derivado da duracao pela retencao media, que e a unica
    // reconstrucao possivel sem inventar numero novo.
    tempoMedioSeg: +((duracao * retencao) / 100).toFixed(1),
    retencaoMedia: retencao,
  };
}

export function conteudoParaLinha(c: Conteudo, m?: ConteudoMetrica | null): Record<string, unknown> {
  return {
    ID: txt(c.id),
    Plataforma: c.plataforma ?? "",
    Perfil: txt(c.perfilHandle ?? c.perfilId),
    Tipo: c.tipo,
    Titulo: txt(c.titulo),
    URL: txt(c.url),
    "Publicado em": dataCelula(c.publicadoEm),
    "Duracao (seg)": num(c.duracaoSeg),
    Views: num(m?.views),
    Likes: num(m?.likes),
    Comentarios: num(m?.comentarios),
    Compartilhamentos: num(m?.compartilhamentos),
    Salvamentos: num(m?.salvamentos),
    Alcance: num(m?.alcance),
    "Retencao media (%)": num(m?.retencaoMedia),
  };
}

// ============================================================
// TAREFAS <-> Tarefa
// ============================================================

const PRIORIDADES: Record<string, TarefaPrioridade> = {
  alta: "alta",
  media: "media",
  normal: "media",
  baixa: "baixa",
};

const STATUS_TAREFA: Record<string, TarefaStatus> = {
  pendente: "pendente",
  aberta: "pendente",
  concluida: "concluida",
  concluido: "concluida",
  feita: "concluida",
};

export function linhaParaTarefa(linha: Record<string, string>): Tarefa {
  return {
    id: celulaDe(linha, "ID"),
    titulo: celulaDe(linha, "Titulo"),
    detalhe: celulaDe(linha, "Detalhe"),
    alunoId: celulaDe(linha, "ID_Aluno") || null,
    lancamentoId: celulaDe(linha, "ID_Lancamento") || null,
    responsavel: celulaDe(linha, "Responsavel"),
    prazo: lerDataOuNulo(celulaDe(linha, "Prazo")),
    prioridade: daLista(celulaDe(linha, "Prioridade"), PRIORIDADES, "media", "TAREFAS.Prioridade"),
    status: daLista(celulaDe(linha, "Status"), STATUS_TAREFA, "pendente", "TAREFAS.Status"),
  };
}

const PRIORIDADE_PLANILHA: Record<TarefaPrioridade, string> = {
  alta: "Alta",
  media: "Media",
  baixa: "Baixa",
};

export function tarefaParaLinha(t: Tarefa): Record<string, unknown> {
  return {
    ID: txt(t.id),
    Titulo: txt(t.titulo),
    Detalhe: txt(t.detalhe),
    ID_Aluno: txt(t.alunoId),
    ID_Lancamento: txt(t.lancamentoId),
    Responsavel: txt(t.responsavel),
    Prazo: dataCelula(t.prazo),
    Prioridade: PRIORIDADE_PLANILHA[t.prioridade],
    Status: t.status === "concluida" ? "Concluida" : "Pendente",
  };
}

// ============================================================
// ATIVIDADES <-> Atividade
// ============================================================

const TIPOS_ATIVIDADE: Record<string, AtividadeTipo> = {
  nota: "nota",
  contato: "contato",
  whatsapp: "whatsapp",
  ligacao: "ligacao",
  email: "email",
  "e-mail": "email",
  evento: "evento",
  reuniao: "evento",
  "reuniao/evento": "evento",
  compra: "compra",
  tarefa: "tarefa",
  sistema: "sistema",
};

export function linhaParaAtividade(linha: Record<string, string>): Atividade {
  return {
    id: celulaDe(linha, "ID"),
    alunoId: celulaDe(linha, "ID_Aluno"),
    tipo: daLista(celulaDe(linha, "Tipo"), TIPOS_ATIVIDADE, "nota", "ATIVIDADES.Tipo"),
    titulo: celulaDe(linha, "Titulo"),
    detalhe: celulaDe(linha, "Detalhe"),
    // Linha do tempo: a HORA importa, por isso nao passa por `lerData`, que corta.
    data: lerDataHora(celulaDe(linha, "Data")),
  };
}

export function atividadeParaLinha(a: Atividade): Record<string, unknown> {
  return {
    ID: txt(a.id),
    ID_Aluno: txt(a.alunoId),
    Tipo: a.tipo,
    Titulo: txt(a.titulo),
    Detalhe: txt(a.detalhe),
    Data: dataHoraCelula(a.data),
  };
}

// ============================================================
// REUNIOES <-> Reuniao
// ============================================================

const STATUS_REUNIAO: Record<string, ReuniaoStatus> = {
  agendada: "agendada",
  agendado: "agendada",
  marcada: "agendada",
  realizada: "realizada",
  realizado: "realizada",
  cancelada: "cancelada",
  cancelado: "cancelada",
};

export function linhaParaReuniao(linha: Record<string, string>): Reuniao {
  const fim = lerDataHora(celulaDe(linha, "Fim"));
  return {
    id: celulaDe(linha, "ID"),
    titulo: celulaDe(linha, "Titulo"),
    inicio: lerDataHora(celulaDe(linha, "Inicio")),
    fim: fim === "" ? null : fim,
    comQuem: celulaDe(linha, "Com quem"),
    alunoId: celulaDe(linha, "ID_Aluno") || null,
    lancamentoId: celulaDe(linha, "ID_Lancamento") || null,
    turmaId: null, // sem aba de turmas
    status: daLista(celulaDe(linha, "Status"), STATUS_REUNIAO, "agendada", "REUNIOES.Status"),
    link: celulaDe(linha, "Link"),
    // Sem coluna: a sincronizacao com o Google Agenda fica de mao unica (o
    // sistema cria o evento, mas nao reconhece o mesmo evento depois).
    googleEventId: "",
  };
}

const STATUS_REUNIAO_PLANILHA: Record<ReuniaoStatus, string> = {
  agendada: "Agendada",
  realizada: "Realizada",
  cancelada: "Cancelada",
};

export function reuniaoParaLinha(r: Reuniao): Record<string, unknown> {
  return {
    ID: txt(r.id),
    Titulo: txt(r.titulo),
    Inicio: dataHoraCelula(r.inicio),
    Fim: dataHoraCelula(r.fim),
    "Com quem": txt(r.comQuem),
    ID_Aluno: txt(r.alunoId),
    ID_Lancamento: txt(r.lancamentoId),
    Status: STATUS_REUNIAO_PLANILHA[r.status],
    Link: txt(r.link),
  };
}

// ============================================================
// MODULOS <-> Modulo
// ============================================================

export function linhaParaModulo(linha: Record<string, string>): Modulo {
  return {
    id: celulaDe(linha, "ID"),
    produtoId: celulaDe(linha, "ID_Produto"),
    nome: celulaDe(linha, "Nome"),
    ordem: lerNumero(celulaDe(linha, "Ordem")),
    descricao: celulaDe(linha, "Descricao"),
  };
}

export function moduloParaLinha(m: Modulo): Record<string, unknown> {
  return {
    ID: txt(m.id),
    ID_Produto: txt(m.produtoId),
    Nome: txt(m.nome),
    Ordem: num(m.ordem),
    Descricao: txt(m.descricao),
  };
}

// ============================================================
// AULAS <-> Aula
// ============================================================

/** Extrai o tipo direto da entidade -- a uniao inline de `Aula.tipo` nao tem nome proprio em types.ts. */
type TipoDeAula = Aula["tipo"];

const TIPOS_AULA: Record<string, TipoDeAula> = {
  video: "video",
  texto: "texto",
  ao_vivo: "ao_vivo",
  "ao vivo": "ao_vivo",
  tarefa: "tarefa",
};

export function linhaParaAula(linha: Record<string, string>): Aula {
  return {
    id: celulaDe(linha, "ID"),
    moduloId: celulaDe(linha, "ID_Modulo"),
    produtoId: celulaDe(linha, "ID_Produto"),
    titulo: celulaDe(linha, "Titulo"),
    ordem: lerNumero(celulaDe(linha, "Ordem")),
    duracaoMin: lerNumero(celulaDe(linha, "Duracao (min)")),
    // Vazio ou desconhecido cai em "video": e o formato mais comum da trilha e
    // nao inventa um formato mais raro (tarefa, ao_vivo) que a aula pode nao ter.
    tipo: daLista(celulaDe(linha, "Tipo"), TIPOS_AULA, "video", "AULAS.Tipo"),
  };
}

const TIPO_AULA_PLANILHA: Record<TipoDeAula, string> = {
  video: "Video",
  texto: "Texto",
  ao_vivo: "Ao vivo",
  tarefa: "Tarefa",
};

export function aulaParaLinha(a: Aula): Record<string, unknown> {
  return {
    ID: txt(a.id),
    ID_Modulo: txt(a.moduloId),
    ID_Produto: txt(a.produtoId),
    Titulo: txt(a.titulo),
    Ordem: num(a.ordem),
    "Duracao (min)": num(a.duracaoMin),
    Tipo: TIPO_AULA_PLANILHA[a.tipo],
  };
}

// ============================================================
// PROGRESSO <-> ProgressoAula
// ============================================================

export function linhaParaProgressoAula(linha: Record<string, string>): ProgressoAula {
  // Datetime, nao so data: "Concluida em" alimenta velocidade de consumo (quanto
  // tempo entre aulas), que sem hora perderia resolucao dentro do mesmo dia.
  const concluidaEm = lerDataHora(celulaDe(linha, "Concluida em"));
  return {
    id: celulaDe(linha, "ID"),
    alunoId: celulaDe(linha, "ID_Aluno"),
    aulaId: celulaDe(linha, "ID_Aula"),
    produtoId: celulaDe(linha, "ID_Produto"),
    concluida: lerBool(celulaDe(linha, "Concluida")),
    concluidaEm: concluidaEm === "" ? null : concluidaEm,
    minutosAssistidos: lerNumero(celulaDe(linha, "Minutos assistidos")),
  };
}

export function progressoAulaParaLinha(p: ProgressoAula): Record<string, unknown> {
  return {
    ID: txt(p.id),
    ID_Aluno: txt(p.alunoId),
    ID_Aula: txt(p.aulaId),
    ID_Produto: txt(p.produtoId),
    Concluida: p.concluida,
    "Concluida em": dataHoraCelula(p.concluidaEm),
    "Minutos assistidos": num(p.minutosAssistidos),
  };
}

// ============================================================
// ENCONTROS <-> Encontro
// ============================================================

/**
 * "ALU-1, ALU-2 ,,ALU-3" -> ["ALU-1", "ALU-2", "ALU-3"].
 *
 * Celula vazia vira lista vazia, nao `[""]`: `"".split(",")` devolve um array
 * com uma string vazia, e sem este atalho a leitura criaria um "aluno fantasma"
 * sem id na lista de presenca. Espaco ao redor da virgula e tolerado de
 * proposito -- e o jeito natural de digitar a mao -- mas campo vazio entre duas
 * virgulas (`"ALU-1,,ALU-2"`) e descartado em silencio, sem virar aviso: nao ha
 * como saber se ali faltou um id ou se foi so um erro de digitacao.
 */
export function presentesDaCelula(valor: string): string[] {
  const bruto = lerTexto(valor);
  if (bruto === "") return [];
  return bruto
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id !== "");
}

/** Caminho inverso: lista de ids -> texto separado por vírgula e espaço. */
export function presentesParaCelula(ids: string[]): string {
  return ids
    .map((id) => id.trim())
    .filter((id) => id !== "")
    .join(", ");
}

export function linhaParaEncontro(linha: Record<string, string>): Encontro {
  return {
    id: celulaDe(linha, "ID"),
    turmaId: celulaDe(linha, "ID_Turma"),
    titulo: celulaDe(linha, "Titulo"),
    data: lerDataHora(celulaDe(linha, "Data")),
    presentes: presentesDaCelula(celulaDe(linha, "Presentes")),
  };
}

export function encontroParaLinha(e: Encontro): Record<string, unknown> {
  return {
    ID: txt(e.id),
    ID_Turma: txt(e.turmaId),
    Titulo: txt(e.titulo),
    Data: dataHoraCelula(e.data),
    Presentes: presentesParaCelula(e.presentes),
  };
}

// ============================================================
// AGRUPAMENTOS <-> Agrupamento
//
// Cadastro OPCIONAL do usuario: a planilha pode simplesmente nao ter linha
// nenhuma aqui, e isso e um estado valido (nao um erro de preenchimento).
// ============================================================

export function linhaParaAgrupamento(linha: Record<string, string>): Agrupamento {
  const cor = celulaDe(linha, "Cor");
  return {
    id: celulaDe(linha, "ID"),
    nome: celulaDe(linha, "Nome"),
    // `Agrupamento.cor` e obrigatoria no tipo; celula em branco cai na primeira
    // cor da paleta do sistema, nunca em string vazia (quebraria o grafico).
    cor: cor !== "" ? cor : PALETA_AGRUPAMENTO[0],
    ordem: lerNumero(celulaDe(linha, "Ordem")),
    ativo: lerBool(celulaDe(linha, "Ativo")),
  };
}

export function agrupamentoParaLinha(a: Agrupamento): Record<string, unknown> {
  return {
    ID: txt(a.id),
    Nome: txt(a.nome),
    Cor: txt(a.cor),
    Ordem: num(a.ordem),
    Ativo: a.ativo,
  };
}

// ============================================================
// CONFIG -> ParametrosFinanceiros (somente leitura)
// ============================================================

const REGIMES: Record<string, RegimeTributario> = {
  simples: "simples",
  "simples nacional": "simples",
  presumido: "presumido",
  "lucro presumido": "presumido",
  real: "real",
  "lucro real": "real",
  mei: "mei",
};

/** Le um rotulo do bloco PARAMETROS aceitando variacoes de grafia. */
function parametro(parametros: Record<string, string>, ...rotulos: string[]): string {
  const alvos = rotulos.map((r) => normalizar(r));
  for (const [chave, valor] of Object.entries(parametros)) {
    if (alvos.includes(normalizar(chave))) return lerTexto(valor);
  }
  return "";
}

/**
 * Bloco PARAMETROS de CONFIG -> `ParametrosFinanceiros`.
 *
 * SOMENTE LEITURA, e nao por comodidade: CONFIG esta na lista de abas proibidas.
 * Aliquota, regime e reserva minima sao a ancora de break-even, runway e provisao
 * de imposto. Mudanca ali nao e operacao de rotina, e deixar isso escrito por
 * robo e a diferenca entre um erro de digitacao e um break-even calculado errado
 * o trimestre inteiro.
 *
 * A aliquota vem em PONTOS PERCENTUAIS (6 = 6%), igual ao resto do projeto.
 * Rotulo ausente vira zero: e um numero VISIVELMENTE errado na tela, enquanto um
 * palpite plausivel seria um erro que ninguem nota.
 */
export function configParaParametros(
  parametros: Record<string, string>,
  agora = new Date().toISOString()
): ParametrosFinanceiros {
  return {
    id: "config-planilha",
    aliquotaImposto: lerPercentual(parametro(parametros, "Aliquota de imposto", "Aliquota")),
    regimeTributario: daLista(
      parametro(parametros, "Regime tributario", "Regime"),
      REGIMES,
      "simples",
      "CONFIG.Regime tributario"
    ),
    saldoInicialCaixa: lerNumero(parametro(parametros, "Caixa atual (R$)", "Caixa atual", "Saldo inicial de caixa")),
    dataSaldoInicial: lerData(parametro(parametros, "Data do saldo inicial", "Data do caixa")),
    custoFixoMensal: lerNumero(parametro(parametros, "Custo fixo mensal", "Custo fixo")),
    reservaMinimaCaixa: lerNumero(parametro(parametros, "Reserva minima de caixa", "Reserva minima")),
    atualizadoEm: agora,
  };
}

// ============================================================
// IMPORTACOES <-> RegistroImportacao (livro-razao da importacao de extrato)
//
// Diferente do resto do arquivo, esta aba e escrita SO pelo sistema (nunca a
// mao): por isso a leitura de "Tipo" e "Origem" abaixo nao passa por
// `daLista`/`avisar` -- nao ha grafia divergente de dono de planilha para
// tolerar, so o que o proprio `importacaoParaLinha` gravou.
// ============================================================

function origemExtratoDeTexto(valor: string): OrigemExtrato {
  return valor === "ofx" || valor === "csv" ? valor : "texto";
}

export function linhaParaImportacao(linha: Record<string, string>): RegistroImportacao {
  return {
    id: celulaDe(linha, "ID"),
    impressaoDigital: celulaDe(linha, "Impressao_Digital"),
    data: lerData(celulaDe(linha, "Data")),
    descricao: celulaDe(linha, "Descricao"),
    valor: lerNumero(celulaDe(linha, "Valor")),
    tipo: celulaDe(linha, "Tipo") === "saida" ? "saida" : "entrada",
    documento: celulaDe(linha, "Documento"),
    origem: origemExtratoDeTexto(celulaDe(linha, "Origem")),
    contaId: celulaDe(linha, "ID_Conta"),
    movimentoId: celulaDe(linha, "ID_Movimento"),
    importadoEm: lerDataHora(celulaDe(linha, "Importado_Em")),
  };
}

export function importacaoParaLinha(r: RegistroImportacao): Record<string, unknown> {
  return {
    ID: txt(r.id),
    Impressao_Digital: txt(r.impressaoDigital),
    Data: dataCelula(r.data),
    Descricao: txt(r.descricao),
    Valor: num(r.valor),
    Tipo: r.tipo,
    Documento: txt(r.documento),
    Origem: r.origem,
    ID_Conta: txt(r.contaId),
    ID_Movimento: txt(r.movimentoId),
    Importado_Em: dataHoraCelula(r.importadoEm),
  };
}

/**
 * `LinhaExtrato` lida (ver src/lib/extrato) -> `MovimentoCaixa` pronto para
 * MOVIMENTOS. `valor` sai sempre positivo porque a invariante de
 * `MovimentoCaixa` é essa -- o sinal vive em `direcao`, não no número.
 * `categoria` vem da PRÓPRIA linha (`l.categoria`): nasce como sugestão de
 * `sugerirCategoria` na leitura e o dono reclassifica no passo de conferência
 * (ver `importarExtratoBancario` em actions.ts) -- gravar "outros" fixo aqui
 * jogaria fora exatamente a escolha que a tela existe para capturar.
 */
export function linhaExtratoParaMovimento(
  l: LinhaExtrato,
  contaId: string
): Omit<MovimentoCaixa, "id"> {
  return {
    direcao: l.tipo,
    categoria: l.categoria,
    contaId,
    descricao: l.descricao,
    valor: Math.abs(l.valor),
    dataCompetencia: l.data,
    dataCaixa: l.data,
    status: "realizado",
    braco: null,
    // Não existe origem "importacao" em `OrigemMovimento`: o movimento não
    // nasceu de venda, despesa, comissão nem chargeback do próprio sistema, e
    // "manual" é o valor existente mais próximo desse fato.
    origem: "manual",
    origemId: null,
  };
}

// ============================================================
// INTERACOES <-> Interacao  |  ENVIOS <-> Envio
//
// Como IMPORTACOES, estas duas abas sao escritas SO pelo sistema: nao ha
// grafia de dono de planilha para tolerar, entao `daLista`/`avisar` nao
// aparecem aqui. O que existe e o oposto -- desconfianca do que veio de fora:
// `direcao`, `canal` e `status` caem em valor conhecido, e nunca em texto
// arbitrario que o agente local (que roda fora deste repositorio) mandar.
// ============================================================

/** ISO datetime de qualquer origem; texto ilegivel vira "" em vez de "Invalid Date". */
function lerInstante(v: string | undefined | null): string {
  const bruto = lerTexto(v);
  if (bruto === "") return "";
  if (/\d{4}-\d{2}-\d{2}T/.test(bruto)) return bruto;
  return lerData(bruto);
}

export function linhaParaInteracao(linha: Record<string, string>): Interacao {
  return {
    id: celulaDe(linha, "ID"),
    alunoId: celulaDe(linha, "ID_Aluno"),
    // Um canal so existe hoje. O campo e gravado assim mesmo para o historico
    // continuar legivel se um dia entrar Instagram Direct ou Telegram.
    canal: "whatsapp",
    direcao: celulaDe(linha, "Direcao") === "enviada" ? "enviada" : "recebida",
    texto: celulaDe(linha, "Texto"),
    quando: lerInstante(celulaDe(linha, "Quando")),
    idExterno: celulaDe(linha, "ID_Externo"),
    tipoMidia: celulaDe(linha, "Tipo_Midia"),
    nomeExibicao: celulaDe(linha, "Nome_Exibicao"),
    telefone: celulaDe(linha, "Telefone"),
  };
}

export function interacaoParaLinha(i: Interacao): Record<string, unknown> {
  return {
    ID: txt(i.id),
    ID_Aluno: txt(i.alunoId),
    Canal: txt(i.canal),
    Direcao: txt(i.direcao),
    // Aspa simples na frente: o WhatsApp carrega texto que comeca com "=", "+"
    // ou "-", e a planilha leria isso como formula. "=1+1" viraria 2 na celula
    // e o dono leria um numero no lugar da mensagem do cliente.
    Texto: comEscape(i.texto),
    Quando: dataHoraCelula(i.quando),
    ID_Externo: txt(i.idExterno),
    Tipo_Midia: txt(i.tipoMidia),
    Nome_Exibicao: txt(i.nomeExibicao),
    // Texto e nao numero: telefone com DDI passa de 15 digitos, e a planilha
    // arredondaria em notacao cientifica ("5,51499E+12"). Um numero que nao
    // disca e pior que nenhum.
    Telefone: txt(i.telefone),
  };
}

const STATUS_ENVIO: StatusEnvio[] = ["aprovado", "enviado", "falhou"];

export function linhaParaEnvio(linha: Record<string, string>): Envio {
  const bruto = normalizar(celulaDe(linha, "Status"));
  const status = STATUS_ENVIO.find((s) => s === bruto);
  return {
    id: celulaDe(linha, "ID"),
    alunoId: celulaDe(linha, "ID_Aluno"),
    telefone: celulaDe(linha, "Telefone"),
    texto: celulaDe(linha, "Texto"),
    autorizadoPor: celulaDe(linha, "Autorizado_Por"),
    autorizadoEm: lerInstante(celulaDe(linha, "Autorizado_Em")),
    // Status irreconhecivel NAO vira "aprovado". Cair no neutro aqui entregaria
    // ao agente local uma mensagem que ninguem aprovou -- o unico erro deste
    // modulo que chega no celular de um cliente e nao tem como ser desfeito.
    status: status ?? "falhou",
    enviadoEm: lerInstante(celulaDe(linha, "Enviado_Em")),
    idExterno: celulaDe(linha, "ID_Externo"),
    erro: celulaDe(linha, "Erro"),
  };
}

export function envioParaLinha(e: Envio): Record<string, unknown> {
  return {
    ID: txt(e.id),
    ID_Aluno: txt(e.alunoId),
    Telefone: txt(e.telefone),
    Texto: comEscape(e.texto),
    Autorizado_Por: txt(e.autorizadoPor),
    Autorizado_Em: dataHoraCelula(e.autorizadoEm),
    Status: txt(e.status),
    Enviado_Em: dataHoraCelula(e.enviadoEm),
    ID_Externo: txt(e.idExterno),
    Erro: comEscape(e.erro),
  };
}

/**
 * Texto de terceiro pronto para a celula.
 *
 * O conteudo aqui vem do celular de um cliente, e a planilha interpreta como
 * formula tudo que comeca com "=", "+", "-" ou "@". A aspa simples na frente e
 * como o Sheets marca "isto e texto"; ela nao aparece na celula e some na
 * leitura de volta (o gviz devolve o valor exibido).
 */
function comEscape(v: string | null | undefined): string {
  const t = txt(v);
  return /^[=+\-@]/.test(t) ? `'${t}` : t;
}
