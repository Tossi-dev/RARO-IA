/**
 * raro-sync.gs — ponte de ESCRITA entre o sistema Raro.ia e a planilha
 * Base_Financeira_Operacao.
 *
 * COMO ISSO FUNCIONA
 * ------------------
 * A leitura da planilha já acontece sem autenticação nenhuma, pelo endpoint
 * público gviz. Este arquivo resolve o outro lado: a escrita. Ele é colado no
 * editor de Apps Script da PRÓPRIA planilha (Extensões > Apps Script) e
 * publicado como Aplicativo da Web. Publicado assim, o script roda com a conta
 * do dono da planilha e já enxerga a planilha em que mora — não existe projeto
 * no Google Cloud, não existe conta de serviço, não existe arquivo de
 * credencial JSON para vazar. O passo a passo está em
 * docs/PUBLICAR-APPS-SCRIPT.md.
 *
 * REGRA QUE NÃO SE NEGOCIA
 * ------------------------
 * PAINEL, DRE e FLUXO_CAIXA são abas DERIVADAS: cada célula delas é uma
 * fórmula escrita pelo dono da operação. Escrever um valor em qualquer célula
 * dessas abas SUBSTITUI a fórmula por um número morto e o painel para de
 * calcular — silenciosamente, sem erro nenhum, e só se descobre semanas
 * depois quando o número não bate. Por isso elas estão em ABAS_PROIBIDAS e
 * toda ação de escrita nelas é recusada antes de tocar na planilha.
 *
 * SEGURANÇA
 * ---------
 * A URL do Web App é pública (precisa ser, para o servidor do sistema chamar
 * sem OAuth). Quem protege é o segredo compartilhado, guardado nas
 * Propriedades do Script na chave RARO_SEGREDO. O segredo NUNCA aparece neste
 * arquivo — este arquivo vai para o repositório, as propriedades do script
 * não vão.
 *
 * O segredo viaja SEMPRE no corpo de um POST, nunca na URL. Query string fica
 * gravada no histórico do navegador, no log de execução do Apps Script e em
 * qualquer proxy no caminho — e fechar a aba depois não apaga nada disso.
 * Por isso o doGet deste arquivo não aceita segredo nenhum (ver doGet).
 *
 * Nenhum dado real, nenhuma URL privada e nenhum segredo neste arquivo.
 */

/**
 * Versão do contrato. Suba quando mudar o formato de requisição/resposta.
 *
 * 2.7.0 — `criarAbas` passou a criar também INTERACOES e ENVIOS, as duas
 *         abas do CRM automático. INTERACOES é o histórico de conversa de
 *         cada cliente — uma linha por mensagem de WhatsApp, com o
 *         ID_Externo que o próprio WhatsApp deu, que é o que impede a MESMA
 *         mensagem de virar duas linhas quando o notebook do dono reabre e
 *         re-sincroniza horas de conversa. ENVIOS é a fila de saída: nada é
 *         enviado sem uma linha aqui com Autorizado_Por preenchido, porque
 *         mensagem saindo no nome do dono sem alguém ter aprovado é o erro
 *         que o cliente final percebe. Compatível para trás: quem já rodou a
 *         versão anterior roda de novo e recebe só as duas novas em
 *         `criadas`; nenhuma coluna das abas existentes é tocada.
 * 2.6.0 — cópia de segurança diária da planilha. Três coisas novas, e
 *         NENHUMA linha das anteriores tocada: `fazerBackupDiario()`, que
 *         copia a planilha inteira para uma pasta própria no Drive;
 *         `instalarBackupDiario()`, que registra o gatilho de tempo (rode
 *         UMA vez, na mão, pelo editor do Apps Script); e a ação `backup`,
 *         para disparar a cópia sob demanda pelo Web App. Existe porque o
 *         banco de dados deste sistema é uma planilha, e planilha perde
 *         linha: basta alguém apagar sem querer. O histórico de versões do
 *         Google guarda, mas ninguém acha isso sob pressão — uma cópia
 *         datada por dia acha.
 * 2.5.0 — `criarAbas` passou a criar também IMPORTACOES: ID,
 *         Impressao_Digital, Data, Descricao, Valor, Tipo, Documento,
 *         Origem, ID_Conta, ID_Movimento, Importado_Em. É o livro-razão da
 *         importação de extrato bancário — uma linha por lançamento já
 *         trazido para dentro do sistema, usada só para o mesmo extrato
 *         reenviado (o uso normal do cliente: semanal em cima de diário,
 *         mensal em cima de semanal) nunca duplicar dinheiro em MOVIMENTOS.
 *         O lançamento de verdade continua indo para MOVIMENTOS; esta aba é
 *         registro de procedência, não cópia paralela. Compatível para
 *         trás: quem já rodou a versão anterior roda de novo e recebe só
 *         IMPORTACOES em `criadas`; nenhuma coluna das abas existentes é
 *         tocada.
 * 2.4.0 — `criarAbas` passou a criar também AGRUPAMENTOS: ID, Nome, Cor,
 *         Ordem, Ativo. Antes "corpo", "mente" e "espirito" eram os únicos
 *         três valores possíveis do campo Braco, fixados no próprio tipo do
 *         sistema; agora quem opera cadastra o agrupamento que quiser — com o
 *         nome e a cor que quiser, ou nenhum — e Braco passa a guardar o ID
 *         de uma linha desta aba nova. Compatível para trás: quem já rodou a
 *         versão anterior roda de novo e recebe só AGRUPAMENTOS em `criadas`;
 *         nenhuma coluna das abas existentes é tocada.
 * 2.3.0 — `criarAbas` passou a criar também MODULOS, AULAS, PROGRESSO e
 *         ENCONTROS, as quatro abas da plataforma de curso (conteúdo, avanço
 *         de cada aluno e presença nos encontros). O cabeçalho de PRODUTOS
 *         ganhou Braco e Categoria, acrescentadas no FIM da linha 1 — nunca
 *         no meio, porque a planilha do cliente já tem linhas e reordenar
 *         coluna desalinha todo o dado existente. Compatível para trás: quem
 *         já rodou a versão anterior roda de novo e recebe as quatro abas
 *         novas em `criadas`; aba que já existia não é recriada nem tem
 *         coluna tocada (criarAbas só cria o que falta, nunca migra).
 * 2.2.1 — correção de recursão infinita em planilhaAtiva(): a própria função
 *         chamava a si mesma no lugar de SpreadsheetApp.getActiveSpreadsheet(),
 *         e qualquer ação estourava com "Maximum call stack size exceeded".
 * 2.2.0 — o acesso à planilha deixou de depender de o script estar preso a
 *         ela. Agora passa por planilhaAtiva(): usa a planilha ativa quando
 *         existe e, quando não existe (script avulso), abre pelo ID guardado
 *         na propriedade RARO_PLANILHA_ID. Isso permite publicar o Web App a
 *         partir de um projeto avulso, sem depender do dono da planilha.
 *         Também serve de marca: se o /exec responder versao 2.2.0, é esta
 *         implantação que está atendendo.
 * 2.1.0 — `criarAbas` passou a criar também COBRANCAS, INGESTAO e
 *         DESPESAS_RECORRENTES, as três abas da coleta automática. Compatível
 *         para trás: quem já rodou a versão anterior roda de novo e recebe as
 *         três novas em `criadas` e as antigas em `jaExistiam`.
 * 2.0.0 — doGet deixou de aceitar segredo e de devolver dados da planilha;
 *         virou só sinal de vida. Todo diagnóstico com conteúdo é POST
 *         acao:"ping". Mudança incompatível com quem chamava o GET antigo.
 * 1.0.0 — primeira versão.
 */
var VERSAO = '2.7.0';

/** Nome da propriedade do script onde mora o segredo compartilhado. */
var CHAVE_SEGREDO = 'RARO_SEGREDO';

/**
 * Nome da propriedade do script onde mora o ID da planilha.
 *
 * Só é usada quando o script NÃO está preso à planilha. Ver planilhaAtiva().
 */
var CHAVE_PLANILHA_ID = 'RARO_PLANILHA_ID';

/**
 * A planilha em que este script trabalha.
 *
 * Existem duas formas de um script do Apps Script chegar numa planilha:
 *
 *   preso à planilha  -> SpreadsheetApp.getActiveSpreadsheet() devolve ela
 *   avulso, no Drive  -> getActiveSpreadsheet() devolve null, e é preciso
 *                        abrir pelo ID
 *
 * Depender só do primeiro caso amarra a publicação do Web App a quem é dono
 * da planilha. Com o ID guardado numa propriedade do script, qualquer pessoa
 * com permissão de edição na planilha publica a sua própria implantação.
 *
 * O resultado é guardado em memória para não abrir a planilha duas vezes na
 * mesma requisição.
 */
var _planilha = null;

function planilhaAtiva() {
  if (_planilha) return _planilha;

  var ativa = SpreadsheetApp.getActiveSpreadsheet();
  if (ativa) {
    _planilha = ativa;
    return _planilha;
  }

  var id = PropertiesService.getScriptProperties().getProperty(CHAVE_PLANILHA_ID);
  if (!id) {
    throw new Error(
      'Este script não está preso a nenhuma planilha e a propriedade ' +
        CHAVE_PLANILHA_ID +
        ' não foi preenchida. Grave nela o ID da planilha.'
    );
  }

  _planilha = SpreadsheetApp.openById(id);
  return _planilha;
}

/**
 * Abas em que o sistema NUNCA escreve.
 *
 * PAINEL, DRE e FLUXO_CAIXA: calculadas por fórmula. Escrever nelas destrói o
 * trabalho do dono da planilha — a fórmula vira valor fixo e o painel morre.
 * INSTRUCOES: documentação escrita à mão para quem opera a planilha.
 * CONFIG: listas de apoio e parâmetros com layout irregular (não é tabela com
 * cabeçalho na linha 1); o sistema LÊ daqui, mas quem altera é uma pessoa.
 *
 * A comparação com esta lista NUNCA é feita por igualdade de literal — ver
 * chaveAba() e abaProibida() lá embaixo.
 */
var ABAS_PROIBIDAS = ['PAINEL', 'DRE', 'FLUXO_CAIXA', 'INSTRUCOES', 'CONFIG'];

/**
 * Prefixo do ID gerado por aba. Serve para bater o olho numa célula e saber de
 * onde a linha veio, sem consultar nada.
 */
var PREFIXOS = {
  VENDAS: 'VEN',
  RECEBIVEIS: 'REC',
  DESPESAS: 'DES',
  LEADS: 'LEA',
  METAS: 'MET',
  INVESTIMENTO: 'INV',
  ALUNOS: 'ALU',
  PRODUTOS: 'PRO',
  RESPONSAVEIS: 'RES',
  LANCAMENTOS: 'LAN',
  CONTAS: 'CTA',
  MOVIMENTOS: 'MOV',
  CHARGEBACKS: 'CHB',
  CAMPANHAS: 'CAM',
  CONTEUDOS: 'CTD',
  TAREFAS: 'TAR',
  ATIVIDADES: 'ATV',
  REUNIOES: 'REU',
  COBRANCAS: 'COB',
  INGESTAO: 'ING',
  // 'DRC' e não 'DES': o fallback de gerarId() pega as três primeiras letras do
  // nome da aba, e DESPESAS_RECORRENTES cairia em 'DES', o mesmo prefixo de
  // DESPESAS. Prefixo repetido tira do ID justamente o que ele serve para
  // dizer — de qual aba a linha veio — bem no par de abas em que a confusão
  // custa caro, porque uma gera linhas na outra.
  DESPESAS_RECORRENTES: 'DRC',
  MODULOS: 'MOD',
  AULAS: 'AUL',
  // 'PRG' e não 'PRO': o fallback de gerarId() pega as três primeiras letras
  // do nome da aba, e PROGRESSO cairia em 'PRO' — o mesmo prefixo já usado por
  // PRODUTOS. Mesma armadilha do comentário de DESPESAS_RECORRENTES acima.
  PROGRESSO: 'PRG',
  ENCONTROS: 'ENC',
  // 'AGR' bate com o fallback (três primeiras letras de AGRUPAMENTOS) e não
  // colide com nenhum prefixo acima; está aqui explícito, como os demais,
  // para não depender do fallback se algum dia entrar outra aba com nome
  // parecido.
  AGRUPAMENTOS: 'AGR',
  // O fallback (três primeiras letras de IMPORTACOES) já dá 'IMP'; está
  // explícito aqui, como os demais, para não depender do fallback se um dia
  // entrar outra aba com nome parecido.
  IMPORTACOES: 'IMP',
  // O fallback daria 'INT' e 'ENV' de qualquer jeito; explícitos aqui, como
  // os demais, para não depender do fallback se um dia entrar outra aba de
  // nome parecido.
  INTERACOES: 'INT',
  ENVIOS: 'ENV'
};

/**
 * As 16 abas NOVAS que a ação `criarAbas` cria, com o cabeçalho exato da
 * linha 1. Toda aba aqui é aba de ENTRADA: o sistema escreve e lê.
 *
 * A ordem das colunas aqui é a ordem em que a aba nasce, mas o código NUNCA
 * depende dela depois — o mapeamento de valor para coluna é sempre feito pelo
 * TÍTULO lido da linha 1 (ver colunaPorTitulo). Se alguém arrastar uma coluna
 * de lugar, a escrita continua caindo no lugar certo.
 */
var ABAS_NOVAS = {
  ALUNOS: [
    'ID', 'Timestamp', 'Nome', 'Telefone', 'Email', 'Responsavel',
    'Canal de origem', 'Etapa/Status', 'Primeiro contato', 'Observacoes', 'ID_Lead'
  ],
  PRODUTOS: [
    'ID', 'Nome', 'Tipo', 'Preco base', 'Ativo', 'Braco', 'Categoria'
  ],
  RESPONSAVEIS: [
    'ID', 'Nome', 'Braco', 'Comissao padrao (%)', 'Meta mensal (R$)',
    'WhatsApp', 'Chave Pix', 'Ativo'
  ],
  LANCAMENTOS: [
    'ID', 'Nome', 'ID_Produto', 'Inicio', 'Fim', 'Status',
    'Meta de faturamento', 'Descricao'
  ],
  CONTAS: [
    'ID', 'Nome', 'Tipo', 'Saldo inicial', 'Data do saldo inicial', 'Ativa', 'Braco'
  ],
  MOVIMENTOS: [
    'ID', 'Direcao', 'Categoria', 'ID_Conta', 'Descricao', 'Valor',
    'Data de competencia', 'Data de caixa', 'Status', 'Braco', 'Origem', 'ID_Origem'
  ],
  CHARGEBACKS: [
    'ID', 'ID_Venda', 'Valor', 'Data', 'Data de resolucao', 'Motivo',
    'Status', 'Gateway', 'Detalhe'
  ],
  CAMPANHAS: [
    'ID', 'Nome', 'Tipo', 'Canal', 'Objetivo', 'Orcamento', 'Inicio', 'Fim', 'ID_Conteudo'
  ],
  CONTEUDOS: [
    'ID', 'Plataforma', 'Perfil', 'Tipo', 'Titulo', 'URL', 'Publicado em',
    'Duracao (seg)', 'Views', 'Likes', 'Comentarios', 'Compartilhamentos',
    'Salvamentos', 'Alcance', 'Retencao media (%)'
  ],
  TAREFAS: [
    'ID', 'Titulo', 'Detalhe', 'ID_Aluno', 'ID_Lancamento', 'Responsavel',
    'Prazo', 'Prioridade', 'Status'
  ],
  ATIVIDADES: [
    'ID', 'ID_Aluno', 'Tipo', 'Titulo', 'Detalhe', 'Data'
  ],
  REUNIOES: [
    'ID', 'Titulo', 'Inicio', 'Fim', 'Com quem', 'ID_Aluno', 'ID_Lancamento',
    'Status', 'Link'
  ],
  COBRANCAS: [
    'ID', 'Timestamp', 'ID_Aluno', 'ID_Venda', 'Produto', 'Responsavel',
    'Descricao', 'Valor', 'Vencimento', 'TxID', 'Chave Pix',
    'Link de pagamento', 'Copia e cola', 'Status', 'Data pagamento',
    'Pagador nome', 'Pagador documento', 'Origem'
  ],
  INGESTAO: [
    'ID', 'Recebido em', 'Origem', 'Tipo de evento', 'Identificador externo',
    'Resumo', 'Payload', 'Status', 'Aba destino', 'ID gerado', 'Erro'
  ],
  DESPESAS_RECORRENTES: [
    'ID', 'Descricao', 'Categoria', 'Tipo', 'Fornecedor', 'Valor',
    'Dia do vencimento', 'Forma de pagamento', 'Inicio', 'Fim', 'Ativo',
    'Ultimo lancamento'
  ],
  MODULOS: [
    'ID', 'ID_Produto', 'Nome', 'Ordem', 'Descricao'
  ],
  AULAS: [
    'ID', 'ID_Modulo', 'ID_Produto', 'Titulo', 'Ordem', 'Duracao_Min', 'Tipo'
  ],
  PROGRESSO: [
    'ID', 'ID_Aluno', 'ID_Aula', 'ID_Produto', 'Concluida', 'Concluida_Em',
    'Minutos_Assistidos'
  ],
  // 'Presentes' é a ÚNICA coluna multivalorada do arquivo: guarda os IDs de
  // aluno separados por vírgula. Quem for preencher à mão precisa saber, e o
  // leitor do lado do app trata espaço sobrando e célula vazia.
  ENCONTROS: [
    'ID', 'ID_Turma', 'Titulo', 'Data', 'Presentes'
  ],
  // Cadastro livre do usuário: substitui os três valores fixos de Braco
  // ("corpo", "mente", "espirito") por quantos agrupamentos a operação
  // quiser criar, com o nome e a cor que quiser — ou nenhum. As colunas
  // Braco existentes (PRODUTOS, RESPONSAVEIS, CONTAS, MOVIMENTOS) continuam
  // com esse nome, mas passam a guardar o ID de uma linha desta aba.
  AGRUPAMENTOS: [
    'ID', 'Nome', 'Cor', 'Ordem', 'Ativo'
  ],
  // Livro-razão da importação de extrato bancário: uma linha por lançamento
  // já trazido para dentro do sistema, para o mesmo extrato reenviado nunca
  // duplicar dinheiro em MOVIMENTOS (ID_Movimento aponta pra lá). Esta aba
  // NÃO é o lançamento — é só o registro de procedência dele.
  IMPORTACOES: [
    'ID', 'Impressao_Digital', 'Data', 'Descricao', 'Valor', 'Tipo',
    'Documento', 'Origem', 'ID_Conta', 'ID_Movimento', 'Importado_Em'
  ],
  // Histórico de conversa do CRM automático: uma linha por mensagem trocada
  // com o cliente. ID_Externo é o identificador que o PRÓPRIO WhatsApp deu à
  // mensagem — é ele que impede a mesma mensagem de virar duas linhas quando
  // o agente local reconecta e re-sincroniza o que ficou para trás, cenário
  // garantido no desenho escolhido (o notebook do dono fica fechado por
  // horas). Direcao guarda 'recebida' (o cliente falou) ou 'enviada'.
  INTERACOES: [
    'ID', 'ID_Aluno', 'Canal', 'Direcao', 'Texto', 'Quando',
    'ID_Externo', 'Tipo_Midia', 'Nome_Exibicao'
  ],
  // Fila de saída. Nenhuma mensagem sai sem uma linha aqui, e nenhuma linha
  // vale sem Autorizado_Por: envio no nome do dono sem aprovação de gente é o
  // único erro deste sistema que o cliente final percebe. Status caminha por
  // 'rascunho' -> 'aprovado' -> 'enviado' | 'falhou'.
  ENVIOS: [
    'ID', 'ID_Aluno', 'Telefone', 'Texto', 'Autorizado_Por', 'Autorizado_Em',
    'Status', 'Enviado_Em', 'ID_Externo', 'Erro'
  ]
};

/**
 * Títulos de coluna que carregam DATA. O valor chega como texto ISO do
 * JavaScript ("2026-08-02" ou "2026-08-02T14:30:00Z") e precisa virar objeto
 * Date do Apps Script antes de entrar na célula. Se gravar como texto, as
 * fórmulas do PAINEL que fazem comparação de período param de enxergar a
 * linha — a célula vira string e SOMASES/FILTER por mês ignora ela.
 */
var COLUNAS_DATA = [
  'timestamp', 'data', 'vencimento', 'data recebimento', 'data pagamento',
  'inicio', 'fim', 'prazo', 'primeiro contato', 'publicado em',
  'data de competencia', 'data de caixa', 'data de resolucao',
  'data do saldo inicial',
  // Coleta automática: sem estes dois títulos aqui, o carimbo do webhook e a
  // marca do último lançamento entrariam como texto, e aí "qual recorrente já
  // rodou este mês" vira comparação de string — que erra na virada do ano.
  'recebido em', 'ultimo lancamento',
  // Importação de extrato: o carimbo de quando a importação rodou, na aba
  // IMPORTACOES. Sem entrar aqui viraria texto, e uma futura tela de "última
  // importação por conta" que ordene por essa coluna pararia de funcionar.
  'importado em',
  // CRM automático. 'quando' é o instante da mensagem, e é ele que ordena a
  // linha do tempo do cliente e alimenta a leitura de temperatura ("sem falar
  // há 30 dias"). Como texto, a conta de dias vira comparação de string e
  // erra na virada de mês e de ano — justamente onde o dono mais olha.
  'quando', 'autorizado em', 'enviado em'
];

/**
 * Títulos de coluna que carregam DINHEIRO ou número. Grava como Number puro,
 * nunca como texto "R$ 1.234,56" — texto não soma.
 */
var COLUNAS_NUMERO = [
  'valor', 'valor da venda', 'valor da entrada', 'recebimento cartao',
  'comissao', 'n de parcelas', 'meta (r$)', 'meta (n)', 'investido (r$)',
  'preco base', 'comissao padrao (%)', 'meta mensal (r$)',
  'meta de faturamento', 'saldo inicial', 'orcamento', 'duracao (seg)',
  'views', 'likes', 'comentarios', 'compartilhamentos', 'salvamentos',
  'alcance', 'retencao media (%)',
  // Dia do mês (1 a 31), não data. Fica fora de COLUNAS_DATA de propósito: o
  // dia sozinho não identifica um dia do calendário, e converter "10" em data
  // inventaria mês e ano.
  'dia do vencimento'
];

/** Espera máxima pelo lock de escrita, em milissegundos. */
var ESPERA_LOCK_MS = 20000;

// ============================================================
// Pontos de entrada HTTP
// ============================================================

/**
 * Único ponto de entrada de ESCRITA.
 * Corpo esperado (JSON):
 *   { segredo: "...", acao: "ping|criarAbas|inserir|atualizar|lista",
 *     aba: "VENDAS", dados: ... }
 */
function doPost(e) {
  var corpo;
  try {
    corpo = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (erro) {
    // JSON quebrado é erro de quem chamou, não vaza nada da planilha.
    return responder({ ok: false, erro: 'corpo invalido' });
  }

  if (!segredoConfere(corpo.segredo)) {
    // Mensagem seca de propósito. Endpoint público que explica POR QUE o
    // segredo não bateu ("tamanho errado", "propriedade não configurada")
    // entrega informação para quem está tentando adivinhar.
    return responder({ ok: false, erro: 'nao autorizado' });
  }

  try {
    return responder(executar(corpo.acao, corpo.aba, corpo.dados));
  } catch (erro) {
    return responder({ ok: false, erro: String((erro && erro.message) || erro) });
  }
}

/**
 * Sinal de vida, e só isso. Serve para o dono abrir a URL no navegador e
 * confirmar que a implantação está no ar.
 *
 * POR QUE A RESPOSTA É POBRE DE PROPÓSITO
 * ---------------------------------------
 * Este endpoint é público e não autenticado: qualquer pessoa com a URL chega
 * aqui. Um endpoint público NÃO confirma nem nega a existência de nada —
 * nada de nome de planilha, lista de abas, contagem de linhas ou fuso. Cada
 * um desses campos é um pedaço de mapa da operação entregue de graça a quem
 * só tinha a URL.
 *
 * E ele NÃO aceita segredo. Segredo em query string fica no histórico do
 * navegador, no log de "Execuções" do Apps Script e no log de qualquer proxy
 * entre o navegador e o Google; fechar a aba não apaga nenhum dos três.
 * Diagnóstico com conteúdo (nome da planilha, abas, linhas) continua existindo
 * em `acao: "ping"` via POST, com o segredo no CORPO da requisição.
 *
 * Nenhuma escrita passa por aqui.
 */
function doGet() {
  return responder({ ok: true, servico: 'raro-sync', versao: VERSAO });
}

/** Resposta sempre JSON, sempre com a chave `ok`. */
function responder(objeto) {
  return ContentService
    .createTextOutput(JSON.stringify(objeto))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// Autenticação
// ============================================================

/**
 * Compara o segredo recebido com o guardado nas Propriedades do Script.
 *
 * Por que comparação em tempo constante e não `a === b`:
 * o `===` do JavaScript devolve `false` no primeiro caractere diferente. Isso
 * faz a resposta demorar um tico a mais quando o começo do segredo está certo.
 * Com requisições repetidas dá para medir essa diferença e descobrir o segredo
 * caractere por caractere (ataque de temporização). Aqui percorremos SEMPRE os
 * dois valores inteiros, acumulando as diferenças com XOR, e só no fim
 * decidimos — o tempo de resposta não conta nada sobre o conteúdo.
 *
 * HMAC não resolveria nada aqui: o problema não é provar a integridade de uma
 * mensagem, é comparar dois segredos que ambos os lados já têm. Comparação
 * simples resolve, desde que o tempo não vaze.
 */
function segredoConfere(enviado) {
  var esperado = PropertiesService.getScriptProperties().getProperty(CHAVE_SEGREDO);
  if (!esperado) return false;                 // propriedade não configurada
  if (typeof enviado !== 'string') return false;

  var a = enviado;
  var b = esperado;
  // A diferença de tamanho já entra no acumulador, então segredo de tamanho
  // errado também é recusado sem sair mais cedo do laço.
  var diferenca = a.length ^ b.length;
  var n = Math.max(a.length, b.length);
  for (var i = 0; i < n; i++) {
    // charCodeAt fora do tamanho devolve NaN; o `|| 0` normaliza.
    diferenca |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diferenca === 0;
}

// ============================================================
// Roteador de ações
// ============================================================

function executar(acao, aba, dados) {
  switch (acao) {
    case 'ping':
      return acaoPing();
    case 'criarAbas':
      return comLock(function () { return acaoCriarAbas(); });
    case 'inserir':
      return comLock(function () { return acaoInserir(aba, dados); });
    case 'atualizar':
      return comLock(function () { return acaoAtualizar(aba, dados); });
    case 'lista':
      return acaoLista(aba, dados);
    case 'backup':
      // Sem comLock: a cópia é leitura da planilha inteira e escrita NO
      // DRIVE, não nas abas — não disputa nada com inserir/atualizar. Segurar
      // o lock por vários segundos aqui travaria gravação de venda à toa.
      return acaoBackup();
    default:
      return { ok: false, erro: 'acao desconhecida' };
  }
}

/**
 * Toda escrita passa por aqui.
 * Sem lock, duas requisições simultâneas leem o mesmo `getLastRow()` e
 * escrevem na MESMA linha — uma apaga a outra e ninguém percebe, porque as
 * duas recebem `ok: true`. A espera é curta de propósito: melhor devolver
 * "ocupado" e deixar o sistema tentar de novo do que segurar a requisição.
 */
function comLock(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(ESPERA_LOCK_MS)) {
    return { ok: false, erro: 'planilha ocupada, tente de novo' };
  }
  try {
    return fn();
  } finally {
    lock.releaseLock();
    SpreadsheetApp.flush();  // garante que tudo foi para a planilha antes de responder
  }
}

// ============================================================
// Ação: ping (diagnóstico)
// ============================================================

/** Devolve versão, nome da planilha e as abas com contagem de linhas de dados. */
function acaoPing() {
  var ss = planilhaAtiva();
  var abas = ss.getSheets().map(function (sheet) {
    var ultima = sheet.getLastRow();
    return {
      nome: sheet.getName(),
      // linha 1 é cabeçalho nas abas de entrada; desconta para não confundir
      linhas: ultima > 0 ? ultima - 1 : 0,
      colunas: sheet.getLastColumn(),
      derivada: abaProibida(sheet.getName())
    };
  });
  return {
    ok: true,
    versao: VERSAO,
    planilha: ss.getName(),
    fuso: ss.getSpreadsheetTimeZone(),
    abas: abas
  };
}

// ============================================================
// Ação: criarAbas (a adaptação)
// ============================================================

/**
 * Cria as 16 abas novas que ainda não existirem.
 *
 * O que esta função NÃO faz, e é o ponto principal dela:
 * - não toca em nenhuma aba que já exista (nem nas novas, se já foram criadas);
 * - não reordena aba nenhuma (as novas entram sempre no FIM);
 * - não apaga linha, coluna nem aba;
 * - não escreve em aba derivada.
 * Rodar duas vezes é seguro: a segunda vez não faz nada.
 */
function acaoCriarAbas() {
  var ss = planilhaAtiva();
  var criadas = [];
  var jaExistiam = [];

  for (var nome in ABAS_NOVAS) {
    if (!ABAS_NOVAS.hasOwnProperty(nome)) continue;

    // Defensivo: se um dia alguém colocar um nome protegido aqui por engano.
    if (abaProibida(nome)) continue;

    if (ss.getSheetByName(nome)) {
      jaExistiam.push(nome);
      continue;
    }

    var cabecalho = ABAS_NOVAS[nome];
    // insertSheet no índice getNumSheets() = sempre no fim. Nunca no meio, para
    // não mexer na ordem das abas que o dono já organizou.
    var sheet = ss.insertSheet(nome, ss.getNumSheets());
    var range = sheet.getRange(1, 1, 1, cabecalho.length);
    range.setValues([cabecalho]);
    range.setFontWeight('bold');
    sheet.setFrozenRows(1);        // cabeçalho fixo ao rolar
    sheet.autoResizeColumns(1, cabecalho.length);
    criadas.push(nome);
  }

  return { ok: true, criadas: criadas, jaExistiam: jaExistiam };
}

// ============================================================
// Ação: inserir (append)
// ============================================================

/**
 * Acrescenta uma ou mais linhas no fim da aba.
 *
 * `dados` aceita um objeto ({ Coluna: valor, ... }) ou um array de objetos.
 * As chaves são TÍTULOS de coluna da linha 1. Chave que não existe na aba é
 * ignorada e devolvida em `ignorados`, para o erro aparecer em vez de sumir.
 *
 * ID: quando vier vazio, é gerado no formato PREFIXO-base36-4aleatorios.
 * Os IDs gerados voltam na resposta porque o sistema precisa deles para casar
 * o registro local com a linha da planilha — sem isso não existe `atualizar`.
 *
 * Timestamp: preenchido com a data/hora do momento quando a aba tiver a
 * coluna e o valor não vier de fora.
 */
function acaoInserir(aba, dados) {
  var sheet = abaGravavel(aba);
  var cabecalho = lerCabecalho(sheet);
  var linhas = Array.isArray(dados) ? dados : [dados];

  if (!linhas.length) return { ok: false, erro: 'nenhuma linha enviada' };

  var idxId = indiceDe(cabecalho, 'ID');
  var idxTimestamp = indiceDe(cabecalho, 'Timestamp');
  var agora = new Date();

  var matriz = [];
  var ids = [];
  var ignorados = {};

  for (var i = 0; i < linhas.length; i++) {
    var registro = linhas[i] || {};
    var linha = novaLinhaVazia(cabecalho.length);

    for (var chave in registro) {
      if (!registro.hasOwnProperty(chave)) continue;
      var col = indiceDe(cabecalho, chave);
      if (col === -1) {
        ignorados[chave] = true;   // coluna inexistente: reporta, não inventa
        continue;
      }
      linha[col] = converter(cabecalho[col], registro[chave]);
    }

    // ID gerado quando não veio nada utilizável.
    if (idxId !== -1 && !linha[idxId]) {
      linha[idxId] = gerarId(sheet.getName());
    }
    if (idxId !== -1) ids.push(linha[idxId]);

    // Timestamp automático de auditoria: quando a linha entrou na planilha.
    if (idxTimestamp !== -1 && !linha[idxTimestamp]) {
      linha[idxTimestamp] = agora;
    }

    matriz.push(linha);
  }

  // getLastRow() dentro do lock: ninguém mais está escrevendo neste instante.
  var primeira = sheet.getLastRow() + 1;
  sheet.getRange(primeira, 1, matriz.length, cabecalho.length).setValues(matriz);

  return {
    ok: true,
    aba: sheet.getName(),
    inseridas: matriz.length,
    primeiraLinha: primeira,
    ids: ids,
    ignorados: Object.keys(ignorados)
  };
}

// ============================================================
// Ação: atualizar
// ============================================================

/**
 * Localiza a linha pelo valor da coluna ID e sobrescreve SÓ as colunas
 * enviadas. As demais células ficam exatamente como estavam.
 *
 * Esta função NUNCA apaga linha e NUNCA cria linha.
 *
 * Por que ID não encontrado é ERRO e não "cria a linha":
 * a aba INSTRUCOES da planilha manda "uma linha por transação, sem exclusões".
 * Se um `atualizar` com ID errado criasse a linha em silêncio, a mesma venda
 * apareceria duas vezes e o faturamento do mês subiria sozinho. Erro alto e
 * cedo é melhor do que número errado no painel.
 *
 * `dados` aceita um objeto ou um array de objetos; cada um precisa da chave
 * `ID` mais as colunas a alterar.
 */
function acaoAtualizar(aba, dados) {
  var sheet = abaGravavel(aba);
  var cabecalho = lerCabecalho(sheet);
  var itens = Array.isArray(dados) ? dados : [dados];

  var idxId = indiceDe(cabecalho, 'ID');
  if (idxId === -1) {
    return { ok: false, erro: 'aba sem coluna ID: ' + sheet.getName() };
  }

  var ultima = sheet.getLastRow();
  if (ultima < 2) return { ok: false, erro: 'aba vazia: ' + sheet.getName() };

  // Índice ID -> número da linha, montado uma vez só. Com poucas centenas ou
  // milhares de linhas isso é uma leitura só, contra uma leitura por item.
  var colunaIds = sheet.getRange(2, idxId + 1, ultima - 1, 1).getValues();
  var mapa = {};
  for (var l = 0; l < colunaIds.length; l++) {
    var valorId = String(colunaIds[l][0] || '').trim();
    if (valorId && !(valorId in mapa)) mapa[valorId] = l + 2;  // linha real
  }

  var atualizados = [];
  var naoEncontrados = [];
  var ignorados = {};

  for (var i = 0; i < itens.length; i++) {
    var registro = itens[i] || {};
    var id = String(registro.ID || registro.id || '').trim();
    if (!id) { naoEncontrados.push('(sem ID)'); continue; }

    var linha = mapa[id];
    if (!linha) { naoEncontrados.push(id); continue; }

    var alteradas = 0;
    for (var chave in registro) {
      if (!registro.hasOwnProperty(chave)) continue;
      if (chave === 'ID' || chave === 'id') continue;   // ID é a chave, não se altera
      var col = indiceDe(cabecalho, chave);
      if (col === -1) { ignorados[chave] = true; continue; }
      sheet.getRange(linha, col + 1).setValue(converter(cabecalho[col], registro[chave]));
      alteradas++;
    }
    atualizados.push({ id: id, linha: linha, colunas: alteradas });
  }

  // Sucesso parcial é reportado como falha: se algum ID não existe, o sistema
  // precisa saber para não considerar a sincronização concluída.
  return {
    ok: naoEncontrados.length === 0,
    erro: naoEncontrados.length ? 'ID nao encontrado: ' + naoEncontrados.join(', ') : undefined,
    aba: sheet.getName(),
    atualizados: atualizados,
    naoEncontrados: naoEncontrados,
    ignorados: Object.keys(ignorados)
  };
}

// ============================================================
// Ação: lista (depuração)
// ============================================================

/**
 * Devolve as linhas de uma aba como array de objetos, chaveado pelo título da
 * coluna. Serve para depurar de fora sem abrir a planilha.
 *
 * `dados` opcional: { limite: 100, desde: 2 } — `desde` é o número da linha.
 * Ler aba derivada aqui é permitido (ler não estraga nada); só a ESCRITA é
 * proibida.
 */
function acaoLista(aba, dados) {
  var ss = planilhaAtiva();
  var sheet = ss.getSheetByName(aba);
  if (!sheet) return { ok: false, erro: 'aba inexistente: ' + aba };

  var opcoes = dados || {};
  var ultima = sheet.getLastRow();
  if (ultima < 2) return { ok: true, aba: aba, linhas: [] };

  var cabecalho = lerCabecalho(sheet);
  var inicio = Math.max(2, Number(opcoes.desde) || 2);
  var disponiveis = ultima - inicio + 1;
  if (disponiveis <= 0) return { ok: true, aba: aba, linhas: [] };

  var limite = Number(opcoes.limite) || disponiveis;
  var quantidade = Math.min(limite, disponiveis);

  var valores = sheet.getRange(inicio, 1, quantidade, cabecalho.length).getValues();
  var linhas = valores.map(function (linha, i) {
    var obj = { _linha: inicio + i };
    for (var c = 0; c < cabecalho.length; c++) {
      if (!cabecalho[c]) continue;
      var v = linha[c];
      // Date não sobrevive ao JSON.stringify de forma útil para o cliente;
      // devolve ISO, que é o que o sistema consome.
      obj[cabecalho[c]] = (v instanceof Date) ? v.toISOString() : v;
    }
    return obj;
  });

  return { ok: true, aba: aba, total: ultima - 1, linhas: linhas };
}

// ============================================================
// Utilitários
// ============================================================

/**
 * Devolve a aba se ela existir E for gravável. É o guarda-chuva de segurança:
 * nenhuma escrita chega na planilha sem passar por aqui.
 */
function abaGravavel(aba) {
  var nome = String(aba || '').trim();
  if (!nome) throw new Error('aba nao informada');

  // Comparação por chave canônica: caixa, acento e separador não abrem buraco.
  // "Painel", "Fluxo_Caixa", "FLUXO CAIXA" e "INSTRUÇÕES" caem todos aqui.
  if (abaProibida(nome)) {
    // Erro explícito e com o motivo, porque quem chega aqui é o próprio
    // sistema (já autenticado) cometendo um erro de programação, não um
    // desconhecido sondando o endpoint.
    throw new Error(
      'escrita recusada na aba ' + nome + ': aba derivada ou de configuracao. ' +
      'PAINEL, DRE e FLUXO_CAIXA sao calculadas por formula e escrever nelas ' +
      'apaga as formulas do dono da planilha.'
    );
  }

  var sheet = planilhaAtiva().getSheetByName(nome);
  if (!sheet) throw new Error('aba inexistente: ' + nome + ' (rode a acao criarAbas)');
  return sheet;
}

/** Cabeçalho da linha 1, com os títulos como texto sem espaço nas pontas. */
function lerCabecalho(sheet) {
  var largura = sheet.getLastColumn();
  if (largura < 1) throw new Error('aba sem cabecalho: ' + sheet.getName());
  var linha = sheet.getRange(1, 1, 1, largura).getValues()[0];
  return linha.map(function (t) { return String(t == null ? '' : t).trim(); });
}

/**
 * Índice da coluna pelo TÍTULO, ignorando maiúsculas, acentos e espaços extras.
 *
 * Nunca use índice fixo. Se o dono arrastar a coluna "Valor" para outro lugar,
 * um índice fixo passa a gravar o valor da venda dentro de "Status" — sem
 * erro, sem aviso, e o painel some com o faturamento.
 */
function indiceDe(cabecalho, titulo) {
  var alvo = normalizar(titulo);
  for (var i = 0; i < cabecalho.length; i++) {
    if (normalizar(cabecalho[i]) === alvo) return i;
  }
  return -1;
}

/**
 * Chave canônica de nome de aba: minúsculas, sem acento, e com todo separador
 * (espaço, ponto, hífen, underline) virando um único `_`.
 *
 * "FLUXO_CAIXA", "Fluxo Caixa", "fluxo-caixa" e "Fluxo.Caixa" viram todos
 * "fluxo_caixa"; "INSTRUÇÕES" vira "instrucoes". É por essa chave, e nunca
 * pelo literal, que se decide se uma aba é proibida.
 */
function chaveAba(nome) {
  return normalizar(nome).replace(/[\s._\-]+/g, '_');
}

/**
 * ÚLTIMA LINHA DE DEFESA. Não afrouxe isto por conveniência nenhuma.
 *
 * A checagem que existe do lado do TypeScript é contornável: o guia ensina o
 * dono a fazer POST direto por PowerShell, e nesse caminho este arquivo é a
 * ÚNICA coisa entre a requisição e as abas de fórmula. PAINEL, DRE e
 * FLUXO_CAIXA são calculadas célula a célula pelo dono; escrever nelas
 * substitui a fórmula por um número morto, apaga o painel inteiro e NÃO TEM
 * DESFAZER — o estrago só aparece semanas depois, quando o número não bate.
 *
 * Por isso a comparação é por chaveAba() dos DOIS lados: um `indexOf(nome)`
 * cru deixa passar "Painel", "Fluxo_Caixa", "FLUXO CAIXA" e "INSTRUÇÕES".
 * Recusar uma aba a mais por engano custa uma mensagem de erro; deixar passar
 * uma a menos custa o painel do dono. O preço não é o mesmo — na dúvida,
 * recuse.
 */
function abaProibida(nome) {
  var chave = chaveAba(nome);
  if (!chave) return false;
  for (var i = 0; i < ABAS_PROIBIDAS.length; i++) {
    if (chaveAba(ABAS_PROIBIDAS[i]) === chave) return true;
  }
  return false;
}

/** minúsculas, sem acento, sem espaço duplicado. */
function normalizar(texto) {
  return String(texto == null ? '' : texto)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')   // remove os acentos separados pelo NFD
    .replace(/\s+/g, ' ');
}

function novaLinhaVazia(largura) {
  var linha = [];
  for (var i = 0; i < largura; i++) linha.push('');
  return linha;
}

/**
 * ID no formato PREFIXO-<timestamp em base36>-<4 caracteres aleatórios>.
 * O timestamp em base36 deixa o ID curto e ordenável por criação; os 4
 * caracteres aleatórios evitam colisão entre duas inserções no mesmo
 * milissegundo.
 */
function gerarId(aba) {
  var prefixo = PREFIXOS[aba] || normalizar(aba).replace(/[^a-z]/g, '').slice(0, 3).toUpperCase() || 'RAR';
  var tempo = Date.now().toString(36).toUpperCase();
  var alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';  // sem I, O, 0, 1 (confusão visual)
  var aleatorio = '';
  for (var i = 0; i < 4; i++) {
    aleatorio += alfabeto.charAt(Math.floor(Math.random() * alfabeto.length));
  }
  return prefixo + '-' + tempo + '-' + aleatorio;
}

/**
 * Converte o valor recebido no JSON para o tipo certo da célula.
 *
 * - Coluna de data recebe objeto Date. Se gravar texto, SOMASES/FILTER por
 *   período no PAINEL deixam de enxergar a linha.
 * - Coluna de dinheiro recebe Number. "R$ 1.234,56" como texto não soma, e a
 *   conferência "vendas x recebiveis (=0)" do PAINEL passa a acusar diferença.
 * - Booleano vira TRUE/FALSE de verdade (colunas Ativo/Ativa).
 * - null/undefined viram célula vazia, nunca a string "null".
 */
function converter(titulo, valor) {
  if (valor === null || valor === undefined || valor === '') return '';

  var t = normalizar(titulo);

  if (typeof valor === 'boolean') return valor;
  // Date só passa direto se for VÁLIDA. Um Date inválido gravado na célula
  // vira erro visível e quebra as fórmulas do PAINEL, igual a NaN.
  if (valor instanceof Date) return isNaN(valor.getTime()) ? String(valor) : valor;

  if (COLUNAS_DATA.indexOf(t) !== -1) {
    var d = paraData(valor);
    // Se não deu para interpretar, preserva o original COMO TEXTO. Nunca
    // "Invalid Date", nunca a data de hoje: texto errado o dono enxerga e
    // corrige; data errada entra no cálculo do painel em silêncio.
    return d === null ? comoTexto(valor) : d;
  }

  if (COLUNAS_NUMERO.indexOf(t) !== -1) {
    var n = paraNumero(valor);
    // Idem: o que não virou número finito vai como TEXTO, nunca NaN. NaN em
    // célula vira #NUM!/#VALOR! e derruba SOMASES do PAINEL na cadeia inteira.
    return n === null ? comoTexto(valor) : n;
  }

  // Coluna de texto: número continua número, o resto vira texto.
  if (typeof valor === 'number') return valor;
  if (typeof valor === 'object') return JSON.stringify(valor);
  return String(valor);
}

/** Valor original como texto, para quando a conversão não deu certo. */
function comoTexto(valor) {
  if (valor === null || valor === undefined) return '';
  if (typeof valor === 'object') return JSON.stringify(valor);
  return String(valor);
}

/**
 * Monta um Date no fuso LOCAL a partir de ano/mês/dia, ou null se a data não
 * existe no calendário.
 *
 * Fuso local, e não UTC, porque `new Date("2026-08-02")` é lido como meia-noite
 * UTC: no Brasil isso volta para 01/08 às 21h e a venda cai no mês anterior no
 * PAINEL.
 *
 * A conferência no fim existe porque o JavaScript ROLA data inexistente em
 * silêncio: `new Date(2026, 1, 31)` devolve 03/03/2026 sem reclamar, e
 * `new Date(2026, 12, 45)` devolve 14/02/2027. Data absurda tem que virar
 * texto visível, não uma data plausível e errada.
 */
function montarData(ano, mes, dia) {
  if (!(ano >= 1000 && ano <= 9999)) return null;
  if (!(mes >= 1 && mes <= 12)) return null;
  if (!(dia >= 1 && dia <= 31)) return null;
  var d = new Date(ano, mes - 1, dia);
  if (d.getFullYear() !== ano || d.getMonth() !== mes - 1 || d.getDate() !== dia) {
    return null;
  }
  return d;
}

/**
 * Converte para objeto Date do Apps Script. Devolve null quando não dá — quem
 * chama grava o valor original como texto.
 *
 * Grava-se Date de verdade, e não texto, porque SOMASES/FILTER por período no
 * PAINEL comparam datas; string nunca entra na comparação e a linha some da
 * conta sem erro nenhum.
 *
 * REGRA: null em vez de chute. Nunca "Invalid Date", nunca a data de hoje.
 * Data de hoje no lugar de uma data ilegível é o pior desfecho: passa
 * despercebida e joga o valor para o mês errado.
 *
 * CASOS (verificados em teste de mesa; Apps Script só roda no Google):
 *   new Date(2026, 11, 31) -> o MESMO objeto, intacto
 *   "31/12/2026"           -> 31/12/2026 no fuso local
 *   "2026-12-31"           -> 31/12/2026 no fuso local
 *   "2026-08-02T14:30:00Z" -> instante ISO com hora
 *   1767225600000          -> Date do epoch em ms
 *   "31/02/2026"           -> null (não existe; NÃO vira 03/03)
 *   "banana", "", "  "     -> null (vira texto, nunca Invalid Date)
 *   {} , null, NaN         -> null
 *   new Date("banana")     -> null (Date inválido não passa direto)
 */
function paraData(valor) {
  if (valor instanceof Date) {
    // Date que entra sai intacto — desde que seja válido.
    return isNaN(valor.getTime()) ? null : valor;
  }

  if (typeof valor === 'number') {
    if (!isFinite(valor)) return null;          // NaN/Infinity não viram data
    var epoch = new Date(valor);
    return isNaN(epoch.getTime()) ? null : epoch;
  }

  if (typeof valor !== 'string') return null;

  var texto = valor.trim();
  if (!texto) return null;

  // "2026-12-31" (sem hora)
  var iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(texto);
  if (iso) return montarData(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  // "31/12/2026" — dia primeiro, sempre. É o formato que o dono digita.
  var br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(texto);
  if (br) return montarData(Number(br[3]), Number(br[2]), Number(br[1]));

  // ISO com hora: "2026-08-02T14:30:00Z", "2026-08-02 14:30".
  // O fallback genérico `new Date(texto)` foi RETIRADO de propósito: ele lê
  // "01/02/2026" como 1o de FEVEREIRO, no padrão americano, invertendo dia e
  // mês em silêncio. Formato que não está listado aqui vira texto.
  if (/^\d{4}-\d{2}-\d{2}[T ]/.test(texto)) {
    var d = new Date(texto);
    return isNaN(d.getTime()) ? null : d;
  }

  return null;
}

/**
 * Converte para Number pela heurística de localidade pt-BR. Devolve null
 * quando não dá — quem chama grava o original como texto, JAMAIS NaN. NaN numa
 * célula vira erro visível e propaga por toda a cadeia de fórmulas do PAINEL.
 *
 * REGRAS
 * 1. number entra e sai intacto (é o caminho normal: o mapeamento manda number
 *    cru; só não passa o que não é finito).
 * 2. Tem VÍRGULA: a vírgula é o decimal, com QUALQUER número de casas, e todo
 *    ponto é separador de milhar.
 * 3. Sem vírgula e com PONTO: os pontos são milhar quando o primeiro grupo tem
 *    de 1 a 3 dígitos e todos os seguintes têm exatamente 3; caso contrário o
 *    ponto é decimal.
 * 4. Parênteses envolvendo o valor INTEIRO significam negativo (padrão
 *    contábil). Parêntese no meio do texto NÃO inverte sinal.
 * 5. Símbolo de moeda, espaço comum e espaço não separável (U+00A0 e U+202F —
 *    o Intl usa entre "R$" e o número, e ele chega colado no JSON) são
 *    descartados antes da análise.
 * 6. O que não vira número finito devolve null, e quem chama grava texto.
 *
 * CASOS (verificados em teste de mesa; esta função não tem como ser testada
 * pelo repositório — Apps Script só roda na infraestrutura do Google):
 *   1234.567          -> 1234.567    (regra 1: number intacto)
 *   "1234,567"        -> 1234.567    (regra 2; antes dava 1234567, mil vezes maior)
 *   "0,005"           -> 0.005       (regra 2; antes dava 5, mil vezes maior)
 *   "33,333333"       -> 33.333333   (regra 2; antes dava 33333333, um milhão de vezes)
 *   "1.234,56"        -> 1234.56     (regra 2: o ponto é milhar)
 *   "R$ 1.234,56"     -> 1234.56     (regra 5)
 *   "R$ 1.234,56" -> 1234.56    (regra 5, espaço não separável)
 *   "150.480"         -> 150480      (regra 3: 3 + 3 dígitos = milhar)
 *   "1.234.567"       -> 1234567     (regra 3)
 *   "1234.56"         -> 1234.56     (regra 3: 4 dígitos no 1o grupo = decimal)
 *   "1.5"             -> 1.5         (regra 3: 2o grupo não tem 3 dígitos)
 *   "1234567"         -> 1234567
 *   "(1.234,56)"      -> -1234.56    (regra 4)
 *   "(R$ 80,00)"      -> -80         (regras 4 e 5)
 *   "-1.234,56"       -> -1234.56
 *   "1(2)3"           -> null        (regra 4: parêntese no meio não conta)
 *   "abc", "", "12abc", "1.2.3", "50%", "1,2,3" -> null (viram texto, nunca NaN)
 */
function paraNumero(valor) {
  // 1. number entra e sai intacto.
  if (typeof valor === 'number') return isFinite(valor) ? valor : null;
  if (typeof valor !== 'string') return null;

  // 5. Fora moeda e espaços (comum, U+00A0 não separável, U+202F estreito).
  var texto = valor.replace(/[R$\s\u00a0\u202f]/gi, '');
  if (!texto) return null;

  // 4. Parênteses só valem como negativo se envolverem o valor INTEIRO.
  var negativo = false;
  if (texto.length > 2 && texto.charAt(0) === '(' && texto.charAt(texto.length - 1) === ')') {
    negativo = true;
    texto = texto.slice(1, -1);
  }

  // Sinal explícito, depois dos parênteses ("(-5)" continua negativo).
  var sinal = /^[+\-]/.exec(texto);
  if (sinal) {
    if (sinal[0] === '-') negativo = true;
    texto = texto.slice(1);
  }

  // Daqui para frente só dígito, ponto e vírgula. Qualquer outra coisa
  // ("12abc", "1e3", "50%", "1)(2") não é número e volta como texto.
  if (!/^[\d.,]+$/.test(texto)) return null;

  var normalizado;
  if (texto.indexOf(',') !== -1) {
    // 2. A vírgula é o decimal, com quantas casas vierem; todo ponto é milhar.
    if (texto.indexOf(',') !== texto.lastIndexOf(',')) return null;   // duas vírgulas
    normalizado = texto.replace(/\./g, '').replace(',', '.');
  } else if (texto.indexOf('.') !== -1) {
    // 3. Só ponto: milhar ou decimal, decidido pelo tamanho dos grupos.
    var grupos = texto.split('.');
    var milhar = /^\d{1,3}$/.test(grupos[0]);
    for (var i = 1; milhar && i < grupos.length; i++) {
      if (!/^\d{3}$/.test(grupos[i])) milhar = false;
    }
    if (milhar) {
      normalizado = grupos.join('');          // "150.480" -> 150480
    } else if (grupos.length === 2) {
      normalizado = texto;                    // "1234.56" -> 1234.56
    } else {
      return null;                            // "1.2.3" não é número nenhum
    }
  } else {
    normalizado = texto;
  }

  var n = Number(normalizado);
  if (!isFinite(n)) return null;              // 6. nunca devolve NaN
  return negativo ? -n : n;
}

// ============================================================
// Cópia de segurança diária
// ============================================================
//
// POR QUE ISTO EXISTE
// -------------------
// O banco de dados deste sistema é uma planilha do Google. Foi uma escolha
// boa — o dono já vivia nela —, mas carrega a fragilidade de qualquer
// planilha: uma linha apagada sem querer é dinheiro que some do histórico. O
// Google guarda versões, só que ninguém encontra "a versão de terça às 14h"
// sob pressão, e menos ainda quem não é técnico. Uma cópia datada por dia,
// numa pasta com nome óbvio, qualquer pessoa acha.
//
// O QUE ESTA ROTINA NÃO FAZ, DE PROPÓSITO
// ---------------------------------------
// Não apaga nada em definitivo. A limpeza da retenção manda a cópia velha
// para a LIXEIRA do Drive (setTrashed), onde ela ainda passa 30 dias antes de
// sumir de verdade. Regra da casa: nada é deletado, é arquivado.

/** Nome da pasta no Drive onde as cópias moram. */
var PASTA_BACKUP = 'Raro.ia — cópias de segurança';

/** Quantas cópias diárias ficam guardadas. 30 cobre um fechamento de mês
 *  inteiro: dá para voltar ao dia anterior a qualquer erro que só apareceu no
 *  fechamento. Mais que isso é ocupar Drive do cliente sem ganho. */
var RETENCAO_BACKUP = 30;

/** A pasta de backup, criada na primeira vez e reaproveitada depois.
 *  Busca por nome (e não por ID guardado) porque ID em propriedade vira
 *  ponteiro quebrado no dia em que alguém apaga a pasta à mão — e aí o
 *  backup para de rodar em silêncio, que é o pior desfecho possível. */
function pastaDeBackup() {
  var achadas = DriveApp.getFoldersByName(PASTA_BACKUP);
  if (achadas.hasNext()) return achadas.next();
  return DriveApp.createFolder(PASTA_BACKUP);
}

/** aaaa-mm-dd no fuso da planilha — o nome do arquivo precisa ordenar
 *  alfabeticamente na mesma ordem em que o tempo passa. */
function carimboDeHoje(ss) {
  return Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd');
}

/**
 * Copia a planilha inteira para a pasta de backup e aplica a retenção.
 * Devolve um resumo — é o mesmo objeto que a ação `backup` responde.
 */
function fazerBackupDiario() {
  var ss = planilhaAtiva();
  var pasta = pastaDeBackup();
  var nome = ss.getName() + ' — ' + carimboDeHoje(ss);

  // Se já existe cópia de hoje, não faz outra: o gatilho pode disparar duas
  // vezes (reinstalação, execução manual em cima da automática) e três
  // arquivos idênticos do mesmo dia só atrapalham quem for procurar.
  var mesmasDeHoje = pasta.getFilesByName(nome);
  if (mesmasDeHoje.hasNext()) {
    return { ok: true, copiada: false, motivo: 'ja existe copia de hoje', nome: nome };
  }

  var arquivo = DriveApp.getFileById(ss.getId()).makeCopy(nome, pasta);
  var removidas = aplicarRetencaoBackup(pasta);

  return {
    ok: true,
    copiada: true,
    nome: nome,
    id: arquivo.getId(),
    pasta: PASTA_BACKUP,
    enviadasParaLixeira: removidas
  };
}

/** Manda para a lixeira as cópias que passaram da retenção, da mais velha
 *  para a mais nova. Só mexe em arquivo desta pasta cujo nome começa com o
 *  nome da planilha — nunca em outra coisa que o dono tenha guardado ali. */
function aplicarRetencaoBackup(pasta) {
  var ss = planilhaAtiva();
  var prefixo = ss.getName() + ' — ';
  var lista = [];
  var it = pasta.getFiles();
  while (it.hasNext()) {
    var f = it.next();
    if (f.getName().indexOf(prefixo) === 0) {
      lista.push({ arquivo: f, criado: f.getDateCreated().getTime() });
    }
  }
  if (lista.length <= RETENCAO_BACKUP) return 0;

  lista.sort(function (a, b) { return a.criado - b.criado; });   // mais velha primeiro
  var excedente = lista.length - RETENCAO_BACKUP;
  for (var i = 0; i < excedente; i++) lista[i].arquivo.setTrashed(true);
  return excedente;
}

/**
 * Registra o gatilho diário. RODE UMA VEZ, na mão, pelo editor do Apps
 * Script — o Google vai pedir autorização de acesso ao Drive nesse momento,
 * e autorização só acontece com alguém logado clicando.
 *
 * Remove antes de criar: rodar duas vezes por engano não pode virar duas
 * cópias por dia.
 */
function instalarBackupDiario() {
  var existentes = ScriptApp.getProjectTriggers();
  for (var i = 0; i < existentes.length; i++) {
    if (existentes[i].getHandlerFunction() === 'fazerBackupDiario') {
      ScriptApp.deleteTrigger(existentes[i]);
    }
  }
  ScriptApp.newTrigger('fazerBackupDiario')
    .timeBased()
    .atHour(3)          // 3h da manhã: ninguém está mexendo na planilha
    .everyDays(1)
    .create();
  return 'gatilho diario de backup instalado';
}

/** Ação do Web App: dispara a cópia sob demanda (exige o segredo, como toda
 *  ação). Serve para conferir que o backup funciona sem esperar 3h da manhã. */
function acaoBackup() {
  return responder(fazerBackupDiario());
}
