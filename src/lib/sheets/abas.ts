// Contrato de dados da planilha Base_Financeira_Operacao -- fonte unica da
// verdade sobre nome de aba e cabecalho de coluna.
//
// MODULO NEUTRO (sem diretiva de cliente): a tabela abaixo e valor de runtime
// lido por Server Components (paginas de diagnostico da integracao) e por rotas
// de API de escrita.
//
// Por que existir em vez de espalhar strings pelo codigo: o cabecalho da
// planilha e escrito por uma pessoa, num arquivo que ela pode renomear a
// qualquer momento. Concentrando tudo aqui, uma mudanca de grafia se conserta em
// UM lugar e o diagnostico consegue comparar o que a planilha tem com o que o
// sistema espera. `titulo` e o cabecalho LITERAL da planilha (que grava sem
// acento); `chave` e o nome camelCase usado no codigo.

/** Uma coluna: o titulo literal na planilha e a chave usada no codigo. */
export type ColunaAba = { chave: string; titulo: string };

/**
 * `entrada`  -- recebe dado; o sistema pode ler e escrever.
 * `derivada` -- calculada por formula do dono; SO LEITURA.
 * `config`   -- parametro e lista; layout irregular, so leitura.
 */
export type PapelAba = "entrada" | "derivada" | "config";

/** `planilha`: ja existia no arquivo do dono. `sistema`: a adaptacao criou. */
export type OrigemAba = "planilha" | "sistema";

export type DefinicaoAba = {
  nome: string;
  papel: PapelAba;
  origem: OrigemAba;
  descricao: string;
  colunas: ColunaAba[];
};

/** Monta a lista de colunas a partir de pares [chave, titulo] -- so encurta. */
function cols(...pares: [string, string][]): ColunaAba[] {
  return pares.map(([chave, titulo]) => ({ chave, titulo }));
}

export const ABAS: DefinicaoAba[] = [
  // ---------------------------------------------------------------------
  // Abas que JA EXISTEM no arquivo do dono. Os titulos foram lidos da
  // planilha real e estao copiados caractere por caractere, inclusive a
  // ausencia de acento -- mudar a grafia aqui quebra a leitura em silencio.
  // ---------------------------------------------------------------------
  {
    nome: "VENDAS",
    papel: "entrada",
    origem: "planilha",
    descricao:
      "Venda fechada: quem vendeu, o que, por qual canal, quanto e como sera recebido. E a base do faturamento do periodo.",
    colunas: cols(
      ["id", "ID"],
      ["timestamp", "Timestamp"],
      ["data", "Data"],
      ["responsavel", "Responsavel"],
      ["produto", "Produto"],
      ["canalDeOrigem", "Canal de origem"],
      ["valorDaVenda", "Valor da venda"],
      ["formaDePagamento", "Forma de pagamento"],
      ["valorDaEntrada", "Valor da entrada"],
      ["nDeParcelas", "N de parcelas"],
      ["recebimentoCartao", "Recebimento cartao"],
      ["comissao", "Comissao"],
      ["status", "Status"]
    ),
  },
  {
    nome: "RECEBIVEIS",
    papel: "entrada",
    origem: "planilha",
    descricao:
      "Parcela a receber, ligada a venda pelo ID_Venda. E o que separa faturamento de dinheiro no caixa.",
    colunas: cols(
      ["id", "ID"],
      ["idVenda", "ID_Venda"],
      ["responsavel", "Responsavel"],
      ["descricao", "Descricao"],
      ["formaDePagamento", "Forma de pagamento"],
      ["vencimento", "Vencimento"],
      ["valor", "Valor"],
      ["status", "Status"],
      ["dataRecebimento", "Data recebimento"]
    ),
  },
  {
    nome: "DESPESAS",
    papel: "entrada",
    origem: "planilha",
    descricao: "Conta a pagar e conta paga, com categoria e tipo (fixa/variavel) para o DRE.",
    colunas: cols(
      ["id", "ID"],
      ["data", "Data"],
      ["categoria", "Categoria"],
      ["tipo", "Tipo"],
      ["descricao", "Descricao"],
      ["fornecedor", "Fornecedor"],
      ["vencimento", "Vencimento"],
      ["valor", "Valor"],
      ["status", "Status"],
      ["dataPagamento", "Data pagamento"],
      ["formaDePagamento", "Forma de pagamento"]
    ),
  },
  {
    nome: "LEADS",
    papel: "entrada",
    origem: "planilha",
    descricao: "Lead que entrou no funil, com canal de origem e etapa -- denominador da taxa de conversao.",
    colunas: cols(
      ["id", "ID"],
      ["timestamp", "Timestamp"],
      ["data", "Data"],
      ["responsavel", "Responsavel"],
      ["canalDeOrigem", "Canal de origem"],
      ["etapaStatus", "Etapa/Status"]
    ),
  },
  {
    nome: "METAS",
    papel: "entrada",
    origem: "planilha",
    descricao: "Meta por periodo, em reais e em quantidade. E a referencia de comparacao dos KPIs.",
    colunas: cols(
      ["id", "ID"],
      ["tipoDeMeta", "Tipo de meta"],
      ["referencia", "Referencia"],
      ["periodo", "Periodo"],
      ["metaRs", "Meta (R$)"],
      ["metaN", "Meta (n)"]
    ),
  },
  {
    nome: "INVESTIMENTO",
    papel: "entrada",
    origem: "planilha",
    descricao: "Investimento em midia por canal e data -- numerador do CAC e do custo por lead.",
    colunas: cols(["id", "ID"], ["data", "Data"], ["canal", "Canal"], ["investidoRs", "Investido (R$)"]),
  },
  {
    nome: "CONFIG",
    papel: "config",
    origem: "planilha",
    descricao:
      "Listas de validacao (Status_Venda, formas de pagamento, canais) e o bloco PARAMETROS (aliquota de imposto, caixa atual, meses do periodo). Layout IRREGULAR: a linha 1 traz um titulo em A1 e os cabecalhos das listas aparecem mais abaixo, entao nao ha cabecalho unico -- por isso `colunas` vazio. Quem le esta aba e `lerConfig`, que localiza os cabecalhos pela celula Status_Venda.",
    colunas: [],
  },
  {
    nome: "PAINEL",
    papel: "derivada",
    origem: "planilha",
    descricao:
      "Painel do dono, CALCULADO POR FORMULA dentro da planilha. O sistema NUNCA escreve aqui: gravar valor nesta aba apaga as formulas do Tossi e destroi o arquivo dele. Somente leitura.",
    colunas: [],
  },
  {
    nome: "DRE",
    papel: "derivada",
    origem: "planilha",
    descricao:
      "Demonstrativo de resultado, CALCULADO POR FORMULA dentro da planilha. O sistema NUNCA escreve aqui: gravar valor nesta aba apaga as formulas do Tossi. Somente leitura.",
    colunas: [],
  },
  {
    nome: "FLUXO_CAIXA",
    papel: "derivada",
    origem: "planilha",
    descricao:
      "Fluxo de caixa, CALCULADO POR FORMULA dentro da planilha. O sistema NUNCA escreve aqui: gravar valor nesta aba apaga as formulas do Tossi. Somente leitura.",
    colunas: [],
  },
  {
    nome: "INSTRUCOES",
    papel: "config",
    origem: "planilha",
    descricao: "Texto livre de orientacao ao usuario da planilha. Nao tem cabecalho nem dado estruturado.",
    colunas: [],
  },

  // ---------------------------------------------------------------------
  // Abas NOVAS, criadas pela adaptacao. O sistema tem entidades que a
  // planilha ainda nao tinha; a resposta honesta e a planilha ganhar as abas,
  // e nao o sistema perder os modulos. Todas sao de entrada.
  // ---------------------------------------------------------------------
  {
    nome: "ALUNOS",
    papel: "entrada",
    origem: "sistema",
    descricao: "Aluno/cliente ao longo da jornada. ID_Lead liga de volta ao lead que o originou.",
    colunas: cols(
      ["id", "ID"],
      ["timestamp", "Timestamp"],
      ["nome", "Nome"],
      ["telefone", "Telefone"],
      ["email", "Email"],
      ["responsavel", "Responsavel"],
      ["canalDeOrigem", "Canal de origem"],
      ["etapaStatus", "Etapa/Status"],
      ["primeiroContato", "Primeiro contato"],
      ["observacoes", "Observacoes"],
      ["idLead", "ID_Lead"]
    ),
  },
  {
    nome: "PRODUTOS",
    papel: "entrada",
    origem: "sistema",
    descricao:
      "Catalogo de produtos e o preco base de cada um. Braco e Categoria classificam o produto " +
      "por lente estrutural e por fonte de renda -- servem de segundo fallback quando a venda nao " +
      "tem afiliado para herdar o braco.",
    colunas: cols(
      ["id", "ID"],
      ["nome", "Nome"],
      ["tipo", "Tipo"],
      ["precoBase", "Preco base"],
      ["ativo", "Ativo"],
      ["braco", "Braco"],
      ["categoria", "Categoria"]
    ),
  },
  {
    nome: "RESPONSAVEIS",
    papel: "entrada",
    origem: "sistema",
    descricao: "Time comercial: braco, comissao padrao, meta mensal e dados de contato e pagamento.",
    colunas: cols(
      ["id", "ID"],
      ["nome", "Nome"],
      ["braco", "Braco"],
      ["comissaoPadraoPct", "Comissao padrao (%)"],
      ["metaMensalRs", "Meta mensal (R$)"],
      ["whatsapp", "WhatsApp"],
      ["chavePix", "Chave Pix"],
      ["ativo", "Ativo"]
    ),
  },
  {
    nome: "LANCAMENTOS",
    papel: "entrada",
    origem: "sistema",
    descricao: "Janela de venda de um produto, com inicio, fim e meta de faturamento.",
    colunas: cols(
      ["id", "ID"],
      ["nome", "Nome"],
      ["idProduto", "ID_Produto"],
      ["inicio", "Inicio"],
      ["fim", "Fim"],
      ["status", "Status"],
      ["metaDeFaturamento", "Meta de faturamento"],
      ["descricao", "Descricao"]
    ),
  },
  {
    nome: "CONTAS",
    papel: "entrada",
    origem: "sistema",
    descricao: "Conta bancaria ou caixa, com saldo inicial e a data em que esse saldo foi apurado.",
    colunas: cols(
      ["id", "ID"],
      ["nome", "Nome"],
      ["tipo", "Tipo"],
      ["saldoInicial", "Saldo inicial"],
      ["dataDoSaldoInicial", "Data do saldo inicial"],
      ["ativa", "Ativa"],
      ["braco", "Braco"]
    ),
  },
  {
    nome: "AGRUPAMENTOS",
    papel: "entrada",
    origem: "sistema",
    descricao:
      "Cadastro OPCIONAL do usuario -- agrupamento livre (ex.: corpo, mente, espirito no demo; ou linha " +
      "de produto, unidade, marca... qualquer nome que fizer sentido para o negocio). Sem nenhuma linha " +
      "aqui, a secao \"por agrupamento\" simplesmente nao aparece no painel; nao ha valor padrao esperando.",
    colunas: cols(
      ["id", "ID"],
      ["nome", "Nome"],
      ["cor", "Cor"],
      ["ordem", "Ordem"],
      ["ativo", "Ativo"]
    ),
  },
  {
    nome: "MOVIMENTOS",
    papel: "entrada",
    origem: "sistema",
    descricao:
      "Movimento financeiro com as DUAS datas separadas: competencia (quando o fato ocorreu, base do DRE) e caixa (quando o dinheiro andou, base do fluxo). Origem e ID_Origem apontam para o registro que gerou o movimento.",
    colunas: cols(
      ["id", "ID"],
      ["direcao", "Direcao"],
      ["categoria", "Categoria"],
      ["idConta", "ID_Conta"],
      ["descricao", "Descricao"],
      ["valor", "Valor"],
      ["dataDeCompetencia", "Data de competencia"],
      ["dataDeCaixa", "Data de caixa"],
      ["status", "Status"],
      ["braco", "Braco"],
      ["origem", "Origem"],
      ["idOrigem", "ID_Origem"]
    ),
  },
  {
    nome: "CHARGEBACKS",
    papel: "entrada",
    origem: "sistema",
    descricao: "Contestacao de venda no cartao, com motivo, gateway e data de resolucao.",
    colunas: cols(
      ["id", "ID"],
      ["idVenda", "ID_Venda"],
      ["valor", "Valor"],
      ["data", "Data"],
      ["dataDeResolucao", "Data de resolucao"],
      ["motivo", "Motivo"],
      ["status", "Status"],
      ["gateway", "Gateway"],
      ["detalhe", "Detalhe"]
    ),
  },
  {
    nome: "CAMPANHAS",
    papel: "entrada",
    origem: "sistema",
    descricao: "Campanha de midia ou conteudo, com orcamento, janela e o conteudo associado.",
    colunas: cols(
      ["id", "ID"],
      ["nome", "Nome"],
      ["tipo", "Tipo"],
      ["canal", "Canal"],
      ["objetivo", "Objetivo"],
      ["orcamento", "Orcamento"],
      ["inicio", "Inicio"],
      ["fim", "Fim"],
      ["idConteudo", "ID_Conteudo"]
    ),
  },
  {
    nome: "CONTEUDOS",
    papel: "entrada",
    origem: "sistema",
    descricao: "Post ou video publicado, com as metricas de alcance e engajamento da plataforma.",
    colunas: cols(
      ["id", "ID"],
      ["plataforma", "Plataforma"],
      ["perfil", "Perfil"],
      ["tipo", "Tipo"],
      ["titulo", "Titulo"],
      ["url", "URL"],
      ["publicadoEm", "Publicado em"],
      ["duracaoSeg", "Duracao (seg)"],
      ["views", "Views"],
      ["likes", "Likes"],
      ["comentarios", "Comentarios"],
      ["compartilhamentos", "Compartilhamentos"],
      ["salvamentos", "Salvamentos"],
      ["alcance", "Alcance"],
      ["retencaoMediaPct", "Retencao media (%)"]
    ),
  },
  {
    nome: "TAREFAS",
    papel: "entrada",
    origem: "sistema",
    descricao: "Tarefa do time, opcionalmente ligada a um aluno ou a um lancamento.",
    colunas: cols(
      ["id", "ID"],
      ["titulo", "Titulo"],
      ["detalhe", "Detalhe"],
      ["idAluno", "ID_Aluno"],
      ["idLancamento", "ID_Lancamento"],
      ["responsavel", "Responsavel"],
      ["prazo", "Prazo"],
      ["prioridade", "Prioridade"],
      ["status", "Status"]
    ),
  },
  {
    nome: "ATIVIDADES",
    papel: "entrada",
    origem: "sistema",
    descricao: "Registro do que aconteceu com um aluno: contato, aula, cobranca. E a linha do tempo dele.",
    colunas: cols(
      ["id", "ID"],
      ["idAluno", "ID_Aluno"],
      ["tipo", "Tipo"],
      ["titulo", "Titulo"],
      ["detalhe", "Detalhe"],
      ["data", "Data"]
    ),
  },
  {
    nome: "REUNIOES",
    papel: "entrada",
    origem: "sistema",
    descricao: "Reuniao agendada, com janela, participante e link de acesso.",
    colunas: cols(
      ["id", "ID"],
      ["titulo", "Titulo"],
      ["inicio", "Inicio"],
      ["fim", "Fim"],
      ["comQuem", "Com quem"],
      ["idAluno", "ID_Aluno"],
      ["idLancamento", "ID_Lancamento"],
      ["status", "Status"],
      ["link", "Link"]
    ),
  },

  {
    nome: "MODULOS",
    papel: "entrada",
    origem: "sistema",
    descricao: "Bloco de conteudo do produto -- a trilha antes de virar aula avulsa.",
    colunas: cols(
      ["id", "ID"],
      ["idProduto", "ID_Produto"],
      ["nome", "Nome"],
      ["ordem", "Ordem"],
      ["descricao", "Descricao"]
    ),
  },
  {
    nome: "AULAS",
    papel: "entrada",
    origem: "sistema",
    descricao: "Item consumivel dentro de um modulo, com duracao e tipo -- a base da trilha do produto.",
    colunas: cols(
      ["id", "ID"],
      ["idModulo", "ID_Modulo"],
      ["idProduto", "ID_Produto"],
      ["titulo", "Titulo"],
      ["ordem", "Ordem"],
      ["duracaoMin", "Duracao (min)"],
      ["tipo", "Tipo"]
    ),
  },
  {
    nome: "PROGRESSO",
    papel: "entrada",
    origem: "sistema",
    descricao:
      "Marca de consumo do aluno numa aula -- uma linha por aluno por aula. E a base das metricas de " +
      "engajamento e conclusao da trilha.",
    colunas: cols(
      ["id", "ID"],
      ["idAluno", "ID_Aluno"],
      ["idAula", "ID_Aula"],
      ["idProduto", "ID_Produto"],
      ["concluida", "Concluida"],
      ["concluidaEm", "Concluida em"],
      ["minutosAssistidos", "Minutos assistidos"]
    ),
  },
  {
    nome: "ENCONTROS",
    papel: "entrada",
    origem: "sistema",
    descricao:
      "Sessao ao vivo de uma turma (aula ao vivo, mentoria em grupo etc.), com a lista de presenca. " +
      "A coluna Presentes e a UNICA coluna multivalorada do arquivo: guarda os ID de aluno separados " +
      "por virgula (ex.: \"ALU-1, ALU-2, ALU-3\"). Quem preenche a mao precisa manter esse formato -- " +
      "espaco em volta da virgula nao atrapalha, mas outro separador (ponto e virgula, quebra de linha) " +
      "faz a leitura perder aluno em silencio.",
    colunas: cols(
      ["id", "ID"],
      ["idTurma", "ID_Turma"],
      ["titulo", "Titulo"],
      ["data", "Data"],
      ["presentes", "Presentes"]
    ),
  },

  // ---------------------------------------------------------------------
  // Abas da COLETA AUTOMATICA. As tres existem porque o dono pediu que o
  // sistema parasse de depender de digitacao: o cliente final recebe so por
  // Pix, nao roda anuncio nenhum e os leads chegam presencialmente e (em
  // breve) por WhatsApp. Sem elas o ciclo "cobranca emitida -> Pix
  // confirmado -> venda registrada" nao fecha sem uma pessoa no meio.
  // ---------------------------------------------------------------------
  {
    nome: "COBRANCAS",
    papel: "entrada",
    origem: "sistema",
    descricao:
      "Cobranca Pix emitida e ainda nao paga -- o estado que faltava entre a venda fechada de VENDAS e as parcelas de RECEBIVEIS. E por aqui que a confirmacao do banco vira venda sem ninguem digitar: o sistema emite, o PSP confirma o Pix pelo TxID e a venda nasce sozinha.",
    colunas: cols(
      ["id", "ID"],
      ["timestamp", "Timestamp"],
      ["idAluno", "ID_Aluno"],
      ["idVenda", "ID_Venda"],
      ["produto", "Produto"],
      ["responsavel", "Responsavel"],
      ["descricao", "Descricao"],
      ["valor", "Valor"],
      ["vencimento", "Vencimento"],
      ["txid", "TxID"],
      ["chavePix", "Chave Pix"],
      ["linkPagamento", "Link de pagamento"],
      ["copiaECola", "Copia e cola"],
      ["status", "Status"],
      ["dataPagamento", "Data pagamento"],
      ["pagadorNome", "Pagador nome"],
      ["pagadorDocumento", "Pagador documento"],
      ["origem", "Origem"]
    ),
  },
  {
    nome: "INGESTAO",
    papel: "entrada",
    origem: "sistema",
    descricao:
      "Pouso bruto de todo evento automatico (webhook de Pix, mensagem de WhatsApp) ANTES de virar linha limpa. E a trilha de auditoria da automacao: qualquer numero automatico do painel se rastreia ate o evento que o criou, entao a pergunta do dono -- de onde voce esta tirando esses dados -- tem resposta verificavel para sempre.",
    colunas: cols(
      ["id", "ID"],
      ["recebidoEm", "Recebido em"],
      ["origem", "Origem"],
      ["tipoDeEvento", "Tipo de evento"],
      ["identificadorExterno", "Identificador externo"],
      ["resumo", "Resumo"],
      ["payload", "Payload"],
      ["status", "Status"],
      ["abaDestino", "Aba destino"],
      ["idGerado", "ID gerado"],
      ["erro", "Erro"]
    ),
  },
  {
    nome: "DESPESAS_RECORRENTES",
    papel: "entrada",
    origem: "sistema",
    descricao:
      "Despesa fixa configurada uma vez e lancada em DESPESAS todo mes, sem ninguem digitar de novo. Despesa fixa digitada a mao e a primeira coisa que o cliente final esquece, e custo fixo esquecido derruba o ponto de equilibrio sem aviso.",
    colunas: cols(
      ["id", "ID"],
      ["descricao", "Descricao"],
      ["categoria", "Categoria"],
      ["tipo", "Tipo"],
      ["fornecedor", "Fornecedor"],
      ["valor", "Valor"],
      ["diaDoVencimento", "Dia do vencimento"],
      ["formaDePagamento", "Forma de pagamento"],
      ["inicio", "Inicio"],
      ["fim", "Fim"],
      ["ativo", "Ativo"],
      ["ultimoLancamento", "Ultimo lancamento"]
    ),
  },

  // ---------------------------------------------------------------------
  // IMPORTACOES -- livro-razao da importacao de extrato bancario. Existe
  // porque reenviar um extrato que se sobrepoe ao anterior e o uso NORMAL do
  // cliente (semanal em cima de diario, mensal em cima de semanal): sem um
  // registro de procedencia por lancamento, o mesmo dinheiro entra duas vezes
  // em MOVIMENTOS e o caixa fica errado sem ninguem perceber ate o
  // fechamento. Esta aba NAO e o lancamento -- o lancamento de verdade vai
  // para MOVIMENTOS -- e sim a prova de que aquele lancamento (pela
  // impressao digital) ja foi trazido para dentro do sistema.
  // ---------------------------------------------------------------------
  {
    nome: "IMPORTACOES",
    papel: "entrada",
    origem: "sistema",
    descricao:
      "Uma linha por lancamento de extrato bancario ja importado -- o livro-razao que impede reimportar o " +
      "mesmo lancamento. O lancamento de verdade fica em MOVIMENTOS (ID_Movimento aponta para ele); esta " +
      "aba e so o registro de procedencia.",
    colunas: cols(
      ["id", "ID"],
      ["impressaoDigital", "Impressao_Digital"],
      ["data", "Data"],
      ["descricao", "Descricao"],
      ["valor", "Valor"],
      ["tipo", "Tipo"],
      ["documento", "Documento"],
      ["origem", "Origem"],
      ["idConta", "ID_Conta"],
      ["idMovimento", "ID_Movimento"],
      ["importadoEm", "Importado_Em"]
    ),
  },

  // ---------------------------------------------------------------------
  // ATENDIMENTO -- a conversa de WhatsApp virando ficha do cliente.
  //
  // As duas abas abaixo sao escritas SO pelo sistema, a partir do agente local
  // que roda no Mac do dono. Ninguem digita linha aqui a mao, e por isso a
  // leitura delas em mapear.ts nao tolera grafia divergente como as abas do
  // dono toleram: o unico texto que aparece nessas celulas e o que o proprio
  // `interacaoParaLinha`/`envioParaLinha` gravou.
  // ---------------------------------------------------------------------
  {
    nome: "INTERACOES",
    papel: "entrada",
    origem: "sistema",
    descricao:
      "Uma linha por mensagem de WhatsApp trocada com um cliente -- a linha do tempo do atendimento, " +
      "montada sem ninguem digitar. ID_Externo e o identificador que o proprio WhatsApp deu a mensagem, " +
      "e e ele que impede a mesma mensagem de virar duas interacoes quando o agente local reconecta e " +
      "reenvia o que ficou para tras (cenario garantido: o notebook do dono fica fechado por horas).",
    colunas: cols(
      ["id", "ID"],
      ["idAluno", "ID_Aluno"],
      ["canal", "Canal"],
      ["direcao", "Direcao"],
      ["texto", "Texto"],
      ["quando", "Quando"],
      ["idExterno", "ID_Externo"],
      ["tipoMidia", "Tipo_Midia"],
      ["nomeExibicao", "Nome_Exibicao"],
      // Repetido da ficha do aluno de proposito: sem ele, a unica coisa com
      // cara de telefone nesta linha e o ID_Externo -- que hoje comeca com o
      // identificador interno do WhatsApp ("36533109289004@lid_..."), parece
      // um numero e nao disca. Quem le a planilha ligaria para o lugar errado.
      ["telefone", "Telefone"]
    ),
  },
  {
    nome: "ENVIOS",
    papel: "entrada",
    origem: "sistema",
    descricao:
      "Fila de mensagens de saida, uma linha por mensagem. So sai da fila para o agente local o que " +
      "estiver com Status = aprovado: envio de mensagem em nome do dono NUNCA e automatico, e uma linha " +
      "sem aprovacao humana registrada em Autorizado_Por/Autorizado_Em nao pode ser entregue. Depois da " +
      "tentativa o agente devolve o resultado, e a linha vira enviado (com ID_Externo) ou falhou (com Erro).",
    colunas: cols(
      ["id", "ID"],
      ["idAluno", "ID_Aluno"],
      ["telefone", "Telefone"],
      ["texto", "Texto"],
      ["autorizadoPor", "Autorizado_Por"],
      ["autorizadoEm", "Autorizado_Em"],
      ["status", "Status"],
      ["enviadoEm", "Enviado_Em"],
      ["idExterno", "ID_Externo"],
      ["erro", "Erro"]
    ),
  },
];

/** Abas calculadas por formula na propria planilha. Escrever nelas apaga a conta do dono. */
export const ABAS_DERIVADAS: readonly string[] = ["PAINEL", "DRE", "FLUXO_CAIXA"];

/** Busca a definicao pelo nome exato da aba; `null` quando a aba nao e do contrato. */
export function definicaoDaAba(nome: string): DefinicaoAba | null {
  return ABAS.find((a) => a.nome === nome) ?? null;
}

/**
 * Porta de seguranca da escrita. Bloqueia:
 *  - as derivadas (PAINEL, DRE, FLUXO_CAIXA), porque gravar ali apaga formula;
 *  - INSTRUCOES e CONFIG, que sao ajuste manual do dono e nao dado de sistema;
 *  - qualquer aba fora do contrato, porque criar aba por engano polui o arquivo.
 */
export function podeEscrever(nome: string): boolean {
  const def = definicaoDaAba(nome);
  if (!def) return false;
  if (ABAS_DERIVADAS.includes(def.nome)) return false;
  return def.papel === "entrada";
}
