# Contrato de dados: Base_Financeira_Operacao x Raro.ia

A planilha `Base_Financeira_Operacao` deixou de ser um relatório e virou a base de dados do
sistema. Tudo o que o Raro.ia mostra na tela sai de lá, e tudo o que é cadastrado na tela volta
para lá. Este documento é o mapa completo dessa ida e volta: qual coluna vira qual campo, o que
é convertido no caminho, e o que se perde quando os dois lados não falam a mesma língua.

## A regra de ouro

A planilha tem dois tipos de aba, e a diferença entre elas é a única regra que nunca se quebra.

**Abas de entrada** são fonte de verdade. O sistema lê e escreve nelas nos dois sentidos:
`VENDAS`, `RECEBIVEIS`, `DESPESAS`, `LEADS`, `METAS`, `INVESTIMENTO` e as 15 abas novas.

**Abas derivadas** são resultado. Cada célula de `PAINEL`, `DRE` e `FLUXO_CAIXA` é uma fórmula.
O sistema **só lê** dessas abas, e nem isso é necessário na maior parte do tempo, porque ele
recalcula os mesmos números a partir das abas de entrada. Escrever um valor em qualquer célula
delas substitui a fórmula por um número morto: a partir dali o painel para de atualizar, sem
erro, sem aviso, e só se descobre semanas depois quando o número não bate.

`INSTRUCOES` e `CONFIG` também são somente leitura. `INSTRUCOES` é texto escrito à mão.
`CONFIG` guarda as listas de apoio e os parâmetros da operação num layout irregular, que não é
tabela com cabeçalho na linha 1 e por isso não sobreviveria a uma escrita automática.

Essa regra está codificada em `scripts/planilha/raro-sync.gs` na constante `ABAS_PROIBIDAS`.
Não é convenção, é bloqueio: uma tentativa de escrita nessas abas é recusada antes de a
requisição tocar na planilha.

---

## Abas de entrada que já existem

### VENDAS

Entidade do sistema: `Matricula` (e, como subproduto, `Comissao`).

| Coluna da planilha | Campo do sistema | Conversão / regra |
|---|---|---|
| ID | `Matricula.id` | Chave de sincronização. Gerado pelo Apps Script no formato `VEN-<base36>-<4 aleatórios>` quando a venda nasce no sistema. |
| Timestamp | (sem campo) | Auditoria: quando a linha entrou na planilha. Preenchido pelo script, nunca pelo usuário. |
| Data | `Matricula.data` | `Date` na planilha, ISO `yyyy-mm-dd` no sistema. É a data de **competência** da venda. |
| Responsavel | `Matricula.afiliadoId` + `afiliadoNome` | Texto na planilha, resolvido contra `RESPONSAVEIS.Nome` para achar o `id`. Nome sem correspondência entra como `afiliadoId: null` e o nome preservado em `afiliadoNome`. |
| Produto | `Matricula.produtoId` + `produtoNome` | Mesma resolução por nome contra `PRODUTOS.Nome`. |
| Canal de origem | `Matricula.origem` e `utmSource` | Texto livre. Também é a chave de junção com `INVESTIMENTO.Canal` para calcular CAC e ROAS por canal. |
| Valor da venda | `Matricula.valor` e `valorBruto` | `Number`, nunca texto com `R$`. Valor cheio antes de taxas. |
| Forma de pagamento | `Matricula.formaPgto` | Não bate um-para-um. Ver "Forma de pagamento" abaixo — o número de parcelas participa da decisão. |
| Valor da entrada | (sem campo direto) | Vira o primeiro `Recebivel` da venda, com vencimento na data da venda. Não some: reaparece em `RECEBIVEIS`. |
| N de parcelas | `Recebivel.totalParcelas` | Também decide entre `credito_vista`, `credito_2x6x` e `credito_7x12x`. |
| Recebimento cartao | `Matricula.valorLiquido` ou `dataLiberacao` | **Ambíguo.** Se a coluna guarda valor, é `valorLiquido` e `taxaGateway = valorBruto - valorLiquido`. Se guarda data, é `dataLiberacao` (o D+X do gateway). Precisa de uma decisão do dono antes do primeiro import. |
| Comissao | `Comissao.valor` | Gera uma entidade `Comissao` separada, ligada por `matriculaId` e `afiliadoId`. `Comissao.pct` é recalculado como `valor / valorDaVenda * 100`. |
| Status | `Matricula.statusPagamento` | Não bate um-para-um. Ver "Status de venda" abaixo. |

Campos da `Matricula` que a planilha não tem: `alunoId` (ver `ALUNOS`), `lancamentoId`,
`turmaId`, `isUpsell`, `braco` (herdado do `RESPONSAVEIS.Braco`), `gateway` (assume `manual`),
`utmCampaign`.

### RECEBIVEIS

Entidade do sistema: `Recebivel`.

| Coluna da planilha | Campo do sistema | Conversão / regra |
|---|---|---|
| ID | `Recebivel.id` | Prefixo `REC`. |
| ID_Venda | `Recebivel.origemId` | `Recebivel.origem` fica fixo em `"matricula"`. Linha sem `ID_Venda` vira `origem: "manual"`. |
| Responsavel | `Recebivel.braco` | Resolvido contra `RESPONSAVEIS.Braco`. O `Recebivel` não guarda responsável, só o braço. |
| Descricao | `Recebivel.descricao` | Texto livre. Quando trouxer padrão `2/6`, alimenta `parcela` e `totalParcelas`. |
| Forma de pagamento | `Recebivel.diasLiberacao` | A planilha não tem gateway. A forma de pagamento define o D+X: Pix e Dinheiro = 0, Boleto = 1, cartão = conforme parâmetro em `CONFIG`. `Recebivel.gateway` assume `"manual"`. |
| Vencimento | `Recebivel.vencimento` | `Date` na planilha, ISO `yyyy-mm-dd` no sistema. |
| Valor | `Recebivel.valor` | `Number`. É o valor **líquido esperado na conta**. |
| Status | `Recebivel.status` | `A vencer` = `a_vencer`, `Recebido` = `recebido`. `atrasado` é **derivado**, não digitado: vencimento no passado sem data de recebimento. |
| Data recebimento | `Recebivel.dataRecebimento` | Vazio = `null`. Preencher aqui é o que muda o status para `recebido`. |

`Recebivel.contaId` não tem coluna: a conta de destino só existe se o movimento correspondente
for registrado em `MOVIMENTOS`.

### DESPESAS

Uma linha de `DESPESAS` alimenta **duas** entidades: `Despesa` (competência, alimenta o DRE) e
`Pagavel` (caixa, alimenta contas a pagar). Não são duas despesas, são duas visões da mesma.

| Coluna da planilha | Campo do sistema | Conversão / regra |
|---|---|---|
| ID | `Despesa.id` e `Pagavel.id` | Prefixo `DES`. O mesmo ID nas duas entidades, de propósito. |
| Data | `Despesa.data` | Data de competência: quando o custo foi incorrido. |
| Categoria | `Despesa.categoria` e `Pagavel.categoria` | Texto livre na planilha; no sistema vira `CategoriaCaixa` tipada. Ver "Categoria de despesa" abaixo. |
| Tipo | `Despesa.tipo` e `Pagavel.tipo` | `Fixa` = `fixa`, `Variável` = `variavel`. Alimenta o ponto de equilíbrio. |
| Descricao | `Despesa.descricao` e `Pagavel.descricao` | Texto livre. |
| Fornecedor | `Pagavel.fornecedor` | Só existe no `Pagavel`. A `Despesa` não guarda fornecedor. |
| Vencimento | `Pagavel.vencimento` | Data de caixa prevista. |
| Valor | `Despesa.valor` e `Pagavel.valor` | `Number`. |
| Status | `Pagavel.status` | `A vencer` = `a_vencer`, `Pago` = `pago`. `atrasado` é derivado do vencimento vencido sem pagamento. |
| Data pagamento | `Pagavel.dataPagamento` | Vazio = `null`. É a data de caixa real. |
| Forma de pagamento | `Pagavel.contaId` (indireto) | Não tem campo próprio. Serve para escolher de qual conta de `CONTAS` o dinheiro saiu. |

`Despesa.braco` e `Despesa.lancamentoId` não têm coluna. Custo de tráfego atribuído a um
lançamento precisa passar por `MOVIMENTOS` ou por uma coluna nova aqui.

### LEADS

**Não é pessoa.** É contador de funil. A aba não tem nome, telefone nem e-mail, então uma linha
de `LEADS` não vira um `Aluno` — vira um ponto na série de captação.

| Coluna da planilha | Campo do sistema | Conversão / regra |
|---|---|---|
| ID | (id do evento) | Prefixo `LEA`. Referenciado por `ALUNOS.ID_Lead` quando o lead vira pessoa identificada. |
| Timestamp | (auditoria) | Quando a linha entrou. |
| Data | (data do evento de funil) | Agrupador das séries diárias e mensais de leads. |
| Responsavel | `Afiliado.nome` (resolvido) | Quem captou. Alimenta leads por responsável. |
| Canal de origem | (dimensão) | Junta com `INVESTIMENTO.Canal` para custo por lead. |
| Etapa/Status | `StatusFunil` (via `Estagio`) | Ver "Etapa de lead" abaixo. |

### METAS

Entidade do sistema: `Meta`.

| Coluna da planilha | Campo do sistema | Conversão / regra |
|---|---|---|
| ID | `Meta.id` | Prefixo `MET`. |
| Tipo de meta | `Meta.indicador` | `faturamento`, `lucro`, `vendas`, `ticket`, `roas`, `cac`. Texto fora dessa lista é recusado no import, não convertido em `outros` (meta com indicador errado é pior que meta ausente). |
| Referencia | `Meta.escopo` e `Meta.escopoRef` | Vazio = `escopo: "global"`, `escopoRef: null`. `corpo`, `mente` ou `espirito` = `escopo: "braco"`. Nome que casa com `RESPONSAVEIS` = `escopo: "afiliado"` com o id. Nome que casa com `PRODUTOS` = `escopo: "produto"`. |
| Periodo | `Meta.periodo` | Formato `YYYY-MM`. Se a planilha trouxer data completa, corta para ano-mês. |
| Meta (R$) | `Meta.valor` | Usado quando o indicador é monetário: `faturamento`, `lucro`, `ticket`, `cac`. |
| Meta (n) | `Meta.valor` | Usado quando o indicador é de contagem ou razão: `vendas`, `roas`. As duas colunas alimentam o mesmo campo; qual delas vale depende do indicador. Nunca preencher as duas. |

### INVESTIMENTO

Não tem entidade própria. Cada linha vira **duas coisas**: um `MovimentoCaixa` de saída na
categoria `trafego`, e o denominador das métricas de eficiência.

| Coluna da planilha | Campo do sistema | Conversão / regra |
|---|---|---|
| ID | `MovimentoCaixa.origemId` | Prefixo `INV`. |
| Data | `MovimentoCaixa.dataCompetencia` e `dataCaixa` | A planilha tem uma data só; as duas recebem o mesmo valor. Tráfego pago normalmente é debitado no dia, então a aproximação é aceitável. |
| Canal | (dimensão) | Junta com `VENDAS.Canal de origem` e `LEADS.Canal de origem`. É a chave de ROAS e CAC por canal. |
| Investido (R$) | `MovimentoCaixa.valor` | `Number`, sempre positivo. O sinal vem de `direcao: "saida"`. |

---

## Abas de entrada novas

### ALUNOS

Entidade: `Aluno`.

| Coluna da planilha | Campo do sistema | Conversão / regra |
|---|---|---|
| ID | `Aluno.id` | Prefixo `ALU`. |
| Timestamp | (auditoria) | Criação da linha. |
| Nome | `Aluno.nome` | |
| Telefone | `Aluno.telefone` | Texto. Formatar a coluna como texto na planilha, senão o Sheets come o zero à esquerda do DDD. |
| Email | `Aluno.email` | |
| Responsavel | (resolvido para `Afiliado`) | O `Aluno` não guarda responsável no tipo atual; a ligação é feita pelo sistema na visualização. |
| Canal de origem | `Aluno.origem` | Mesmo vocabulário de `VENDAS.Canal de origem`. |
| Etapa/Status | `Aluno.estagioId` e `Aluno.statusFunil` | A etapa vira um `Estagio` do pipeline; o `statusFunil` é o agrupamento dessa etapa. Ver "Etapa de lead". |
| Primeiro contato | `Aluno.primeiroContato` | ISO `yyyy-mm-dd`. |
| Observacoes | `Aluno.observacoes` | Texto livre. Notas estruturadas ficam em `Nota`, que não tem aba. |
| ID_Lead | (ligação com `LEADS.ID`) | É o que fecha o ciclo: o contador de funil vira pessoa identificada. |

### PRODUTOS

Entidade: `Produto`.

| Coluna da planilha | Campo do sistema | Conversão / regra |
|---|---|---|
| ID | `Produto.id` | Prefixo `PRO`. |
| Nome | `Produto.nome` | É a chave usada por `VENDAS.Produto`. Renomear aqui quebra vendas antigas: renomeie no sistema, que reescreve as duas pontas. |
| Tipo | `Produto.tipo` | `Low ticket` = `low_ticket`, `High ticket` = `high_ticket`, `Mentoria` = `mentoria`. |
| Preco base | `Produto.precoBase` | `Number`. |
| Ativo | `Produto.ativo` | Booleano de verdade (`TRUE`/`FALSE`), não o texto "Sim". |

### RESPONSAVEIS

Entidade: `Afiliado`. O nome da aba é o vocabulário da planilha; o do tipo é o vocabulário do
sistema. São a mesma coisa.

| Coluna da planilha | Campo do sistema | Conversão / regra |
|---|---|---|
| ID | `Afiliado.id` | Prefixo `RES`. |
| Nome | `Afiliado.nome` | Chave usada por `VENDAS.Responsavel`, `RECEBIVEIS.Responsavel` e `LEADS.Responsavel`. |
| Braco | `Afiliado.braco` | `Corpo` = `corpo`, `Mente` = `mente`, `Espírito` = `espirito` (sem acento no valor interno). |
| Comissao padrao (%) | `Afiliado.pctPadrao` | `Number` em pontos percentuais: 25 é 25%, não 0,25. |
| Meta mensal (R$) | `Afiliado.metaMensal` | `Number`. |
| WhatsApp | `Afiliado.whatsapp` | Texto. |
| Chave Pix | `Afiliado.chavePix` | Texto. Usada para repasse de comissão. |
| Ativo | `Afiliado.ativo` | Booleano. |

### LANCAMENTOS

Entidade: `Lancamento`.

| Coluna da planilha | Campo do sistema | Conversão / regra |
|---|---|---|
| ID | `Lancamento.id` | Prefixo `LAN`. |
| Nome | `Lancamento.nome` | |
| ID_Produto | `Lancamento.produtoId` | ID, não nome: um lançamento aponta para um produto específico. |
| Inicio | `Lancamento.inicio` | ISO `yyyy-mm-dd`. |
| Fim | `Lancamento.fim` | Vazio = `null` (lançamento perpétuo ou em aberto). |
| Status | `Lancamento.status` | `Planejado` = `planejado`, `Ativo` = `ativo`, `Encerrado` = `encerrado`. |
| Meta de faturamento | `Lancamento.metaFaturamento` | `Number`. |
| Descricao | `Lancamento.descricao` | Texto livre. |

`Turma` não tem aba. Enquanto não tiver, `Matricula.turmaId` fica sempre `null` no que vem da
planilha.

### CONTAS

Entidade: `ContaBancaria`.

| Coluna da planilha | Campo do sistema | Conversão / regra |
|---|---|---|
| ID | `ContaBancaria.id` | Prefixo `CTA`. |
| Nome | `ContaBancaria.nome` | Como aparece no extrato. |
| Tipo | `ContaBancaria.tipo` | `corrente`, `poupanca`, `gateway`, `caixa_fisico`, `investimento`. |
| Saldo inicial | `ContaBancaria.saldoInicial` | `Number`. É a âncora do extrato: todo saldo calculado parte daqui. |
| Data do saldo inicial | `ContaBancaria.dataSaldoInicial` | ISO `yyyy-mm-dd`. Movimento anterior a essa data é ignorado no saldo, para não contar duas vezes. |
| Ativa | `ContaBancaria.ativa` | Booleano. Só conta ativa entra no saldo consolidado. |
| Braco | `ContaBancaria.braco` | Vazio = `null` (conta compartilhada). |

### MOVIMENTOS

Entidade: `MovimentoCaixa`. É o extrato: toda linha de dinheiro que entra ou sai.

| Coluna da planilha | Campo do sistema | Conversão / regra |
|---|---|---|
| ID | `MovimentoCaixa.id` | Prefixo `MOV`. |
| Direcao | `MovimentoCaixa.direcao` | `entrada` ou `saida`. O valor é sempre positivo; o sinal mora aqui. |
| Categoria | `MovimentoCaixa.categoria` | `CategoriaCaixa`: `vendas`, `outras_receitas`, `trafego`, `comissoes`, `taxas_gateway`, `impostos`, `folha_prolabore`, `saas_ferramentas`, `producao_conteudo`, `reembolsos`, `outros`. |
| ID_Conta | `MovimentoCaixa.contaId` | Referência a `CONTAS.ID`. Obrigatório: movimento sem conta não entra em saldo nenhum. |
| Descricao | `MovimentoCaixa.descricao` | |
| Valor | `MovimentoCaixa.valor` | `Number`, sempre positivo. |
| Data de competencia | `MovimentoCaixa.dataCompetencia` | Quando o fato econômico ocorreu. Alimenta o DRE. |
| Data de caixa | `MovimentoCaixa.dataCaixa` | Quando o dinheiro entrou ou saiu de verdade. Alimenta o fluxo. As duas datas existem justamente porque competência não é caixa. |
| Status | `MovimentoCaixa.status` | `previsto` (projeção) ou `realizado` (extrato). O saldo real soma apenas `realizado`. |
| Braco | `MovimentoCaixa.braco` | Vazio = `null`. |
| Origem | `MovimentoCaixa.origem` | `venda`, `matricula`, `despesa`, `comissao`, `reembolso`, `chargeback` ou `manual`. |
| ID_Origem | `MovimentoCaixa.origemId` | ID da linha que originou o movimento, em `VENDAS`, `DESPESAS` ou `CHARGEBACKS`. É o que permite conciliar. |

### CHARGEBACKS

Entidade: `Chargeback`. Diferente de reembolso: reembolso é devolução acordada, chargeback é
contestação imposta pela operadora, com disputa que pode ser ganha.

| Coluna da planilha | Campo do sistema | Conversão / regra |
|---|---|---|
| ID | `Chargeback.id` | Prefixo `CHB`. |
| ID_Venda | `Chargeback.matriculaId` | Referência a `VENDAS.ID`. |
| Valor | `Chargeback.valor` | `Number`. |
| Data | `Chargeback.data` | Abertura da contestação. |
| Data de resolucao | `Chargeback.dataResolucao` | Vazio = `null` enquanto está em disputa. |
| Motivo | `Chargeback.motivo` | `nao_reconhecido`, `produto_nao_entregue`, `fraude`, `duplicidade`, `insatisfacao`, `outros`. |
| Status | `Chargeback.status` | `aberto`, `ganho`, `perdido`. **Só `perdido` vira saída definitiva de caixa.** |
| Gateway | `Chargeback.gateway` | `hotmart`, `kiwify`, `eduzz`, `stripe`, `manual`. |
| Detalhe | `Chargeback.detalhe` | Texto livre da defesa. |

### CAMPANHAS

Entidade: `Campanha`.

| Coluna da planilha | Campo do sistema | Conversão / regra |
|---|---|---|
| ID | `Campanha.id` | Prefixo `CAM`. |
| Nome | `Campanha.nome` | |
| Tipo | `Campanha.tipo` | `Tráfego pago` = `pago`, `Orgânico` = `organico`. |
| Canal | `Campanha.canal` | `instagram`, `tiktok`, `facebook` ou `multi`. |
| Objetivo | `Campanha.objetivo` | Texto livre. |
| Orcamento | `Campanha.orcamento` | `Number`. Orçamento planejado, não gasto realizado — o gasto está em `INVESTIMENTO`. |
| Inicio | `Campanha.inicio` | |
| Fim | `Campanha.fim` | Vazio = `null`. |
| ID_Conteudo | `Campanha.conteudoId` | Referência a `CONTEUDOS.ID`. Vazio = `null`. |

### CONTEUDOS

Uma linha alimenta **duas** entidades: `Conteudo` (o post) e `ConteudoMetrica` (o desempenho).

| Coluna da planilha | Campo do sistema | Conversão / regra |
|---|---|---|
| ID | `Conteudo.id` e `ConteudoMetrica.conteudoId` | Prefixo `CTD`. |
| Plataforma | `Conteudo.plataforma` | `instagram`, `tiktok`, `facebook`. |
| Perfil | `Conteudo.perfilId` (via `PerfilSocial.handle`) | A planilha guarda o handle; o sistema resolve para o id do perfil. |
| Tipo | `Conteudo.tipo` | `reel`, `post`, `story`, `video`, `carrossel`. |
| Titulo | `Conteudo.titulo` | |
| URL | `Conteudo.url` | |
| Publicado em | `Conteudo.publicadoEm` | ISO `yyyy-mm-dd`. |
| Duracao (seg) | `Conteudo.duracaoSeg` | `Number`. Zero para conteúdo estático. |
| Views | `ConteudoMetrica.views` | `Number`. |
| Likes | `ConteudoMetrica.likes` | `Number`. |
| Comentarios | `ConteudoMetrica.comentarios` | `Number`. |
| Compartilhamentos | `ConteudoMetrica.compartilhamentos` | `Number`. |
| Salvamentos | `ConteudoMetrica.salvamentos` | `Number`. |
| Alcance | `ConteudoMetrica.alcance` | `Number`. |
| Retencao media (%) | `ConteudoMetrica.retencaoMedia` | `Number` em pontos percentuais: 42 é 42%. |

`ConteudoMetrica.coletadoEm` recebe o `Timestamp` da última escrita. `Conteudo.roteiro`,
`PontoRetencao` e `ConteudoPilar` não têm coluna: são análise que só existe dentro do sistema.
A planilha guarda uma foto por conteúdo, não a série histórica de métricas.

### TAREFAS

Entidade: `Tarefa`.

| Coluna da planilha | Campo do sistema | Conversão / regra |
|---|---|---|
| ID | `Tarefa.id` | Prefixo `TAR`. |
| Titulo | `Tarefa.titulo` | |
| Detalhe | `Tarefa.detalhe` | |
| ID_Aluno | `Tarefa.alunoId` | Referência a `ALUNOS.ID`. Vazio = `null`. |
| ID_Lancamento | `Tarefa.lancamentoId` | Referência a `LANCAMENTOS.ID`. Vazio = `null`. |
| Responsavel | `Tarefa.responsavel` | Texto (nome), não id: o tipo guarda string. |
| Prazo | `Tarefa.prazo` | ISO `yyyy-mm-dd`. Vazio = `null`. |
| Prioridade | `Tarefa.prioridade` | `Alta` = `alta`, `Média` = `media`, `Baixa` = `baixa`. |
| Status | `Tarefa.status` | `Pendente` = `pendente`, `Concluída` = `concluida`. São só esses dois. |

### ATIVIDADES

Entidade: `Atividade`. É a linha do tempo do aluno.

| Coluna da planilha | Campo do sistema | Conversão / regra |
|---|---|---|
| ID | `Atividade.id` | Prefixo `ATV`. |
| ID_Aluno | `Atividade.alunoId` | Referência a `ALUNOS.ID`. Obrigatório: atividade sem aluno não tem onde aparecer. |
| Tipo | `Atividade.tipo` | `nota`, `contato`, `whatsapp`, `ligacao`, `email`, `evento`, `compra`, `tarefa`, `sistema`. |
| Titulo | `Atividade.titulo` | |
| Detalhe | `Atividade.detalhe` | |
| Data | `Atividade.data` | ISO datetime, com hora. É uma linha do tempo, então a hora importa. |

### REUNIOES

Entidade: `Reuniao`.

| Coluna da planilha | Campo do sistema | Conversão / regra |
|---|---|---|
| ID | `Reuniao.id` | Prefixo `REU`. |
| Titulo | `Reuniao.titulo` | |
| Inicio | `Reuniao.inicio` | ISO datetime. |
| Fim | `Reuniao.fim` | Vazio = `null`. |
| Com quem | `Reuniao.comQuem` | Texto livre. |
| ID_Aluno | `Reuniao.alunoId` | Vazio = `null`. |
| ID_Lancamento | `Reuniao.lancamentoId` | Vazio = `null`. |
| Status | `Reuniao.status` | `Agendada` = `agendada`, `Realizada` = `realizada`, `Cancelada` = `cancelada`. |
| Link | `Reuniao.link` | URL da chamada. |

`Reuniao.googleEventId` e `Reuniao.turmaId` não têm coluna. Sem `googleEventId`, a
sincronização com o Google Agenda é de mão única (o sistema cria o evento, mas não reconhece o
mesmo evento depois).

---

## Abas da coleta automática

As três abas abaixo existem por um motivo só: tirar a digitação do caminho. A operação do
cliente final recebe **só por Pix**, **não roda anúncio nenhum** e os leads chegam por contato
presencial e (em breve) por WhatsApp. Com esse desenho, quase tudo o que o painel mostra pode
nascer de um evento automático — mas só se a planilha tiver onde guardar o evento antes de ele
virar número.

### COBRANCAS

Não tem entidade própria ainda. É o estado que faltava entre `VENDAS` (a venda já fechada) e
`RECEBIVEIS` (as parcelas dela): **a cobrança emitida e ainda não paga**. Sem esta aba, "mandei
a cobrança e estou esperando" não existe em lugar nenhum, e a confirmação do Pix não tem contra
o que ser conciliada — alguém precisa olhar o extrato e digitar a venda à mão.

Com ela, o ciclo fecha sozinho: o sistema emite a cobrança e grava a linha; o banco ou o PSP
confirma o pagamento; o webhook cai em `INGESTAO`; o `TxID` casa com a linha daqui; o status vira
`Pago` e a venda nasce em `VENDAS` com os recebíveis correspondentes, sem ninguém digitar nada.

| Coluna da planilha | Campo do sistema | Conversão / regra |
|---|---|---|
| ID | (id da cobrança) | Prefixo `COB`. É o que a venda gerada guarda como rastro da cobrança que a originou. |
| Timestamp | (auditoria) | Quando a cobrança foi emitida. Preenchido pelo script, nunca pelo usuário. |
| ID_Aluno | (ligação com `ALUNOS.ID`) | Quem vai pagar. Vazio = cobrança avulsa, sem pessoa cadastrada. |
| ID_Venda | (ligação com `VENDAS.ID`) | Fica **vazio até o pagamento**. É preenchido com o ID da venda criada quando o Pix é confirmado — é este campo que prova que a cobrança já virou venda e impede que ela vire duas. |
| Produto | (resolvido contra `PRODUTOS.Nome`) | O que está sendo cobrado. Copiado para `VENDAS.Produto` na hora de gerar a venda. |
| Responsavel | (resolvido contra `RESPONSAVEIS.Nome`) | Quem emitiu. Vai para `VENDAS.Responsavel` e é o que permite atribuir a venda automática a uma pessoa. |
| Descricao | (texto livre) | O que o pagador vê. Também é onde cabe "Parcela 2/6" quando a cobrança é de uma parcela. |
| Valor | (valor cobrado) | `Number`. Vira `VENDAS.Valor da venda` quando a cobrança é do total. |
| Vencimento | (data limite) | `Date`. Cobrança vencida e não paga é o que alimenta a régua de cobrança. |
| TxID | (identificador do Pix) | **A chave de conciliação.** É o campo que o webhook do PSP devolve e o único jeito de casar "o Pix que caiu" com "a cobrança que emiti" sem depender de valor e data, que se repetem. |
| Chave Pix | (chave de recebimento) | Qual chave recebeu. Existe porque a operação pode ter mais de uma, e saber qual recebeu é o que permite jogar o dinheiro na conta certa de `CONTAS`. |
| Link de pagamento | (URL) | Link curto para mandar no WhatsApp. |
| Copia e cola | (payload EMV do Pix) | O código copia e cola do QR. Guardado porque é ele que o cliente usa no app do banco, e reemitir a cobrança gera um `TxID` novo — o que quebraria a conciliação da cobrança antiga. |
| Status | (situação) | `Emitida`, `Pago`, `Vencida`, `Cancelada`. Só `Pago` gera venda. |
| Data pagamento | (data de caixa) | Vazio = ainda não pagou. Preenchida pelo webhook, é a data que a venda e o recebível herdam. |
| Pagador nome | (quem pagou) | Vem do PSP. Serve para conferir se quem pagou é quem devia pagar, e para achar o `ALUNOS.ID` quando a cobrança foi avulsa. |
| Pagador documento | (CPF/CNPJ do pagador) | Idem. É o identificador mais confiável para casar pagamento com pessoa, já que nome vem escrito de jeitos diferentes. |
| Origem | (quem emitiu a cobrança) | `sistema`, `manual` ou `whatsapp`. Distingue a cobrança gerada pelo fluxo automático da que alguém criou na tela. |

### INGESTAO

Não tem entidade própria: é infraestrutura. Todo evento automático — webhook de Pix, mensagem de
WhatsApp — **pousa aqui bruto antes de virar linha limpa** em qualquer outra aba.

O motivo é uma pergunta que o dono fez e que precisa ter resposta para sempre: *de onde você
está tirando esses dados?* Qualquer número automático do painel pode ser rastreado até o evento
que o criou, com o payload original ao lado. Sem esta aba, um dado automático errado é
indefensável: não dá para saber se o erro foi do PSP, do mapeamento ou da planilha.

O segundo motivo é operacional: evento que falhou no processamento **fica aqui com o erro
escrito**, em vez de sumir. Reprocessar é reler a linha, não pedir o webhook de volta.

| Coluna da planilha | Campo do sistema | Conversão / regra |
|---|---|---|
| ID | (id do evento) | Prefixo `ING`. |
| Recebido em | (carimbo de chegada) | `Date` com hora. É quando o evento **chegou aqui**, não quando o fato aconteceu lá fora — as duas datas divergem quando o PSP reenvia. |
| Origem | (de onde veio) | `pix`, `whatsapp`, `manual`. Quem produziu o evento. |
| Tipo de evento | (o que é) | `pix.recebido`, `mensagem.recebida`, e assim por diante. É o que decide qual rotina processa a linha. |
| Identificador externo | (id do lado de fora) | O `TxID` do Pix, o id da mensagem do WhatsApp. **É a trava de duplicidade:** PSP reenvia o mesmo webhook quando não recebe confirmação, e sem esta coluna o mesmo Pix viraria duas vendas. |
| Resumo | (uma linha legível) | O evento em texto curto, para o dono entender a linha sem abrir o payload. |
| Payload | (JSON original) | O corpo bruto recebido, como texto. É a prova documental: se o número do painel for contestado, é aqui que se confere. |
| Status | (situação do processamento) | `Recebido`, `Processado`, `Ignorado`, `Erro`. Linha em `Erro` é fila de reprocessamento, não lixo. |
| Aba destino | (para onde foi) | Nome da aba em que o evento virou linha: `COBRANCAS`, `VENDAS`, `ALUNOS`. Vazio enquanto não processou. |
| ID gerado | (o que nasceu daqui) | O ID da linha criada na aba de destino. É o elo que fecha a rastreabilidade nos dois sentidos: do número no painel para o evento, e do evento para o número. |
| Erro | (por que falhou) | Mensagem do erro quando `Status` é `Erro`. Vazio no caminho feliz. |

### DESPESAS_RECORRENTES

Não é despesa: é o **molde** de uma despesa. Uma linha aqui é uma despesa fixa configurada uma
vez, que o sistema lança em `DESPESAS` todo mês sem ninguém digitar de novo.

Existe porque o cliente final é desorganizado, e despesa fixa digitada à mão é a primeira coisa
que ele esquece. Custo fixo faltando não derruba nada visivelmente — ele só faz o lucro parecer
maior do que é e o ponto de equilíbrio parecer mais baixo do que é, que é o tipo de erro que
ninguém percebe até faltar dinheiro.

| Coluna da planilha | Campo do sistema | Conversão / regra |
|---|---|---|
| ID | (id do molde) | Prefixo `DRC`, e não `DES`: o ID precisa dizer que esta linha é o molde, não a despesa. |
| Descricao | `Despesa.descricao` (copiado) | Vai para a despesa gerada tal como está aqui. |
| Categoria | `Despesa.categoria` (copiado) | Mesmo vocabulário de `DESPESAS.Categoria`, com as mesmas regras de "Categoria de despesa" abaixo. |
| Tipo | `Despesa.tipo` (copiado) | Normalmente `Fixa` — é o motivo de a aba existir. |
| Fornecedor | `Pagavel.fornecedor` (copiado) | Quem recebe todo mês. |
| Valor | `Despesa.valor` (copiado) | `Number`. Valor esperado. Mudou o valor, muda aqui: as despesas já lançadas ficam como estavam, porque histórico não se reescreve. |
| Dia do vencimento | (dia do mês, 1 a 31) | `Number`, **não data**. Guardar "todo dia 10" como data exigiria inventar mês e ano. Mês que não tem o dia (dia 31 em fevereiro) usa o último dia do mês. |
| Forma de pagamento | `Pagavel.contaId` (indireto) | Igual a `DESPESAS.Forma de pagamento`: escolhe de qual conta o dinheiro sai. |
| Inicio | (primeira competência) | `Date`. Antes desta data nada é lançado. |
| Fim | (última competência) | Vazio = `null`, recorrência sem prazo. Preencher aqui é como se encerra uma recorrência **sem apagar a linha**, que é a regra 2 dos invariantes. |
| Ativo | (liga/desliga) | Booleano de verdade (`TRUE`/`FALSE`). Pausa temporária sem perder a configuração. |
| Ultimo lancamento | (controle de idempotência) | `Date` da última competência já lançada em `DESPESAS`. **É o que impede lançamento em dobro:** a rotina só gera o mês seguinte a esta data, então rodar duas vezes no mesmo mês não duplica a despesa. |

---

## Mapeamentos de domínio

São os quatro pontos em que os dois vocabulários não coincidem. Cada um precisa de uma decisão
explícita, porque a alternativa é o import inventar uma por conta própria.

### Forma de pagamento

A planilha tem cinco valores. O tipo `FormaPgto` tem seis. Os conjuntos não se sobrepõem: o
sistema separa crédito por faixa de parcelas (porque a taxa muda: 2,69%, 3,09%, 3,99%), a
planilha guarda o número de parcelas numa coluna à parte. **A conversão depende das duas
colunas juntas.**

| Planilha (`Forma de pagamento`) | N de parcelas | `FormaPgto` | Observação |
|---|---|---|---|
| Pix | qualquer | `pix` | Taxa 0%. |
| Dinheiro | qualquer | `dinheiro` | Taxa 0%. |
| Cartao de credito | vazio, 0 ou 1 | `credito_vista` | Taxa 2,69%. |
| Cartao de credito | 2 a 6 | `credito_2x6x` | Taxa 3,09%. |
| Cartao de credito | 7 a 12 | `credito_7x12x` | Taxa 3,99%. |
| Cartao de credito | acima de 12 | `credito_7x12x` | Aproximação. A tabela de taxas não vai além de 12x; registre o número real em `RECEBIVEIS`. |
| Boleto | qualquer | `pix` (provisório) | **Não existe `boleto` no tipo.** `pix` é a aproximação menos ruim (taxa 0, liquidação rápida), mas subestima o custo do boleto. O texto original fica preservado em `Matricula.origem`. Recomendação: acrescentar `boleto` a `FormaPgto` em `src/lib/types.ts` e a taxa correspondente em `TAXAS_PGTO`. |
| Pix + Cartao | conforme a parte do cartão | a forma **da parte do cartão** | Ver abaixo. |

O `debito` do sistema não tem origem na planilha: a lista de `CONFIG` não oferece débito. Ele só
chega por `MOVIMENTOS`.

**Venda híbrida (Pix + Cartao).** `Matricula.formaPgto` é um valor só, então não representa uma
venda paga em duas formas. A regra: a matrícula recebe a forma da parte do cartão, porque é a
parte que gera taxa e parcelamento; o `Valor da entrada` vira um `Recebivel` com liberação
imediata; o restante vira os recebíveis do cartão. O que se perde: `calcLiquido(valor, forma)`
aplicado ao valor cheio calcula taxa de cartão sobre o pedaço que veio no Pix, e o líquido sai
menor do que foi. Por isso, **em venda híbrida o valor líquido é a soma dos recebíveis, nunca o
resultado de `calcLiquido`**.

### Status de venda

| Planilha (`Status`) | `StatusPagamento` | O que se perde |
|---|---|---|
| fechada | `pago` se todos os recebíveis da venda estão `Recebido`; `pendente` caso contrário | Nada. "Fechada" é sobre a negociação; o pagamento vem de `RECEBIVEIS`, que é quem sabe. |
| reembolsada | `reembolsado` | Nada. Gera também uma entidade `Reembolso`. |
| cancelada | `reembolsado` | **Perde bastante.** Cancelamento (cliente desistiu antes de pagar, nunca houve dinheiro) e reembolso (devolvemos dinheiro que já tínhamos) viram a mesma coisa. |

O cancelamento é o problema real desse mapeamento. Tratado como reembolso puro, ele derruba o
resultado duas vezes: some do faturamento e ainda aparece como devolução. A regra adotada:
venda `cancelada` recebe `statusPagamento: "reembolsado"` **mas não gera entidade `Reembolso`
quando nenhum recebível dela foi marcado como recebido** — sem dinheiro recebido não houve
devolução. Consequência: o painel de reembolsos não distingue cancelamento de reembolso.
Recomendação: acrescentar `cancelado` a `StatusPagamento`.

### Etapa de lead

`Etapa/Status` da planilha descreve o **funil comercial**. `StatusFunil` descreve o **ciclo de
vida do cliente**. São eixos diferentes, e é por isso que os valores não conversam.

O sistema já tem a peça que resolve isso: `Estagio`, que tem `nome`, `ordem`, `cor` e um campo
`funil: StatusFunil` que agrupa. Cada etapa da planilha vira um `Estagio`; o `StatusFunil` é o
agrupamento dela. `Aluno.estagioId` guarda a etapa fina, `Aluno.statusFunil` guarda o balde.

| Planilha (`Etapa/Status`) | `Estagio.nome` / `ordem` | `StatusFunil` |
|---|---|---|
| novo | Novo / 1 | `potencial` |
| qualificado | Qualificado / 2 | `potencial` |
| negociacao | Negociação / 3 | `potencial` |
| ganho | Ganho / 4 | `novo` |
| perdido | Perdido / 5 | `inativo` |

`recorrente` não vem da planilha: é **calculado**, não digitado. Um aluno é recorrente a partir
da segunda matrícula em `VENDAS`. Se alguém escrever "recorrente" na coluna de etapa, o sistema
ignora e recalcula, porque a contagem de matrículas é a fonte de verdade.

Sem `Estagio`, `qualificado` e `negociacao` colapsariam em `potencial` e a taxa de conversão por
etapa deixaria de existir. É a razão de o mapeamento passar por `Estagio` em vez de ir direto.

### Categoria de despesa

`DESPESAS.Categoria` é texto livre; `CategoriaCaixa` é um conjunto fechado de onze valores. A
tabela abaixo cobre a lista de `CATEGORIAS_DESPESA` em `src/lib/domain.ts`.

| Planilha (`Categoria`) | `CategoriaCaixa` |
|---|---|
| Tráfego pago | `trafego` |
| Ferramentas e software | `saas_ferramentas` |
| Plataforma de curso | `saas_ferramentas` |
| Equipe | `folha_prolabore` |
| Produção de conteúdo | `producao_conteudo` |
| Impostos | `impostos` |
| Taxas de pagamento | `taxas_gateway` |
| Eventos e presencial | `outros` |
| Comissões | `comissoes` |
| Reembolsos | `reembolsos` |
| Outros | `outros` |
| qualquer outro texto | `outros` |

Regras da conversão: comparação sem acento e sem diferença de maiúscula; categoria desconhecida
cai em `outros` e **nunca** falha o import (perder uma despesa por causa de um rótulo novo é
pior que classificá-la como "outros"); o texto original é preservado em `Despesa.categoria`, que
é string livre, então nada se perde de fato. `Eventos e presencial` cai em `outros` porque não
existe categoria de evento no plano de contas — se esse gasto crescer, vale criar uma.

### Parâmetros financeiros

`ParametrosFinanceiros` (alíquota, regime tributário, saldo inicial de caixa, custo fixo mensal,
reserva mínima) é lido de `CONFIG` e **nunca escrito de volta**. `CONFIG` está na lista de abas
proibidas: é a única configuração que continua sendo alterada só à mão, na planilha, por uma
pessoa. Mudança de alíquota ou de reserva mínima não é operação de rotina, e deixar isso escrito
por robô é a diferença entre um erro de digitação e um break-even calculado errado o trimestre
inteiro.

---

## O que a planilha não tinha e o sistema tem

A planilha nasceu para responder "quanto entrou e quanto saiu". O sistema responde também "de
quem", "por qual caminho" e "para onde vai". Essas 15 abas são a diferença.

| Aba nova | Por que precisa existir |
|---|---|
| `ALUNOS` | `LEADS` conta eventos de funil, não guarda pessoa. Sem uma aba de pessoas identificadas não existe CRM, não existe LTV por aluno e não dá para saber se a venda de hoje é de um cliente novo ou de um que já comprou. |
| `PRODUTOS` | `VENDAS.Produto` é texto. Sem catálogo, "Mentoria" e "mentoria " são dois produtos, e margem por produto vira ficção. |
| `RESPONSAVEIS` | Guarda o que a planilha assume sem registrar: o braço de cada pessoa, o percentual padrão de comissão, a meta individual e a chave Pix do repasse. É o que permite conferir se a comissão lançada em `VENDAS` bate com a combinada. |
| `LANCAMENTOS` | A planilha é perpétua: soma tudo por mês. Lançamento tem começo, fim e meta próprios, e o desempenho dele só existe se as vendas puderem ser atribuídas a ele. |
| `CONTAS` | `FLUXO_CAIXA` mostra o saldo consolidado. Sem saber em qual conta o dinheiro está, não dá para conciliar com extrato bancário nem saber se o dinheiro que "existe" está preso no gateway. |
| `MOVIMENTOS` | O extrato de verdade, com data de competência e data de caixa separadas. É a única aba que permite dizer, sem chutar, quando o dinheiro reconhecido em `VENDAS` virou dinheiro na conta. |
| `CHARGEBACKS` | A planilha só conhece reembolso. Chargeback é imposto pela operadora, tem disputa que pode ser ganha e tem um teto (1% do volume) que, se estourado, bloqueia o gateway. Isso precisa ser monitorado antes de acontecer. |
| `CAMPANHAS` | `INVESTIMENTO` diz quanto foi gasto por canal. Campanha diz em quê, com qual objetivo e com qual orçamento previsto. É o que separa "gastei 3 mil no Instagram" de "a campanha X estourou o orçamento em 40%". |
| `CONTEUDOS` | Conteúdo orgânico é o topo do funil de quem não paga tráfego. Sem registrar views, retenção e alcance, o orgânico é um custo sem retorno mensurável. |
| `TAREFAS` | Operação tem pendência com dono e prazo. Sem isso o sistema mostra o problema e não oferece nada para resolvê-lo. |
| `ATIVIDADES` | A linha do tempo do aluno: cada contato, ligação, mensagem, compra. É o que faz a ficha do aluno ser útil numa negociação em vez de ser um cadastro. |
| `REUNIOES` | Agenda ligada ao aluno e ao lançamento, com status. Permite medir taxa de comparecimento e conversão pós-reunião. |
| `COBRANCAS` | `VENDAS` guarda a venda fechada, `RECEBIVEIS` guarda as parcelas, e nenhuma das duas representa "mandei a cobrança e estou esperando". É o estado que falta para o Pix confirmado virar venda sozinho, sem alguém conferir extrato e digitar. |
| `INGESTAO` | Todo evento automático precisa pousar em algum lugar antes de virar número. Sem esta aba, a pergunta "de onde você está tirando esses dados?" não tem resposta verificável, e webhook repetido vira venda em dobro. |
| `DESPESAS_RECORRENTES` | Despesa fixa digitada à mão é a primeira que se esquece, e custo fixo faltando não dá erro: só faz o lucro e o ponto de equilíbrio mentirem para o lado otimista. |

---

## O que o sistema não sabe e a planilha sabe

O caminho inverso, sem maquiagem. Estes são os pontos em que a planilha carrega informação que o
sistema hoje não representa — se o import for feito sem tratar cada um, o dado some.

**`LEADS` não tem pessoa.** As colunas são ID, Timestamp, Data, Responsavel, Canal de origem e
Etapa/Status. Não tem nome, não tem telefone, não tem e-mail. Um lead da planilha é um contador
de funil, não uma pessoa identificada. Consequências diretas: não dá para reconstruir quem eram
os leads de meses passados; não dá para ligar retroativamente lead a venda (só a partir de agora,
por `ALUNOS.ID_Lead`); a taxa de conversão lead para venda é calculável no agregado (por mês, por
canal, por responsável) mas nunca no indivíduo. Quem precisar de conversão nominal tem que
cadastrar em `ALUNOS` na entrada, não depois.

**`Valor da entrada` e `Recebimento cartao`.** São duas colunas que o sistema não tem campo
equivalente direto. A entrada é reconstruída como um recebível; o "recebimento cartao" depende de
uma decisão sobre o que a coluna guarda (valor líquido ou data de liberação). Enquanto essa
decisão não for tomada, a coluna é importada como texto bruto e não alimenta métrica nenhuma.

**A conferência do `PAINEL`.** A planilha tem uma verificação `vendas x recebiveis (=0)` que é
uma regra de negócio de verdade, e o sistema não a tem escrita em lugar nenhum. Ela precisa virar
teste, não continuar sendo uma célula que alguém olha de vez em quando.

**Fórmulas do `DRE` e do `FLUXO_CAIXA`.** Elas contêm as decisões contábeis do dono: o que entra
em qual linha, o que é deduzido antes do quê, qual mês recebe qual valor. O sistema recalcula
essas mesmas coisas com o código dele. Se os dois números divergirem, **a planilha ganha** até
alguém provar o contrário, porque foi ela que rodou a operação até aqui. Divergência é bug do
sistema, não da planilha.

**`CONFIG`.** Listas de apoio e parâmetros num layout que só faz sentido para quem montou.
O sistema lê os valores que reconhece e ignora o resto. Nada garante que ele leu tudo.

**Histórico anterior à adaptação.** Toda linha que já existe em `VENDAS`, `RECEBIVEIS`,
`DESPESAS`, `LEADS`, `METAS` e `INVESTIMENTO` foi escrita por uma pessoa, com as convenções dessa
pessoa. Nome de produto abreviado, responsável escrito de dois jeitos, categoria fora da lista.
A resolução por nome vai falhar em parte desses casos, e o import precisa **reportar o que não
casou** em vez de descartar em silêncio.

---

## Variáveis de ambiente

São três, e elas fazem coisas diferentes.

| Variável | Para que serve | Sem ela |
|---|---|---|
| `RARO_SHEETS_ID` | ID da planilha. Com ela sozinha, a **leitura já funciona**: o endpoint público gviz não pede autenticação nenhuma. | Nada é lido da planilha; o sistema cai no provider de demonstração. |
| `RARO_SHEETS_WEBAPP_URL` | URL do Web App publicado a partir do Apps Script. É o endereço de escrita. | O sistema lê a planilha mas não escreve nela: vira painel somente leitura. |
| `RARO_SHEETS_SEGREDO` | O segredo compartilhado que autentica cada escrita. Tem que ser exatamente o mesmo valor cadastrado em `RARO_SEGREDO` nas Propriedades do Script. | Toda escrita volta `{ ok: false, erro: "nao autorizado" }`. |

`RARO_SHEETS_SEGREDO` é **server-only**. Nunca com prefixo `NEXT_PUBLIC_`, nunca importado em
Client Component, nunca em arquivo que vai para o bundle do navegador. Tudo com `NEXT_PUBLIC_` é
embutido no JavaScript que chega no navegador do usuário: qualquer pessoa lê com Ctrl+U. Um
segredo publicado assim dá a qualquer visitante permissão de escrever na planilha financeira da
operação. A escrita acontece só em Server Action ou Route Handler.

`RARO_SHEETS_WEBAPP_URL` também fica server-only por prudência. A URL sozinha não escreve nada
sem o segredo, mas não há motivo para publicá-la.

---

## Invariantes de sincronização

Cinco regras. Quebrar qualquer uma delas produz número errado no painel, e número errado no
painel é pior do que painel fora do ar, porque ninguém desconfia.

**1. ID é a chave, e ele nunca muda.** Toda linha de aba de entrada tem um ID único e estável.
Ele é gerado uma vez, na criação, e daí em diante identifica aquela linha para sempre. Editar um
ID à mão na planilha quebra o vínculo com o registro do sistema e cria um órfão dos dois lados.
IDs referenciados por outras abas (`ID_Venda`, `ID_Aluno`, `ID_Conta`, `ID_Produto`,
`ID_Lancamento`, `ID_Origem`, `ID_Lead`, `ID_Conteudo`) dependem disso.

**2. Nunca apagar linha.** A aba `INSTRUCOES` manda "uma linha por transação, sem exclusões", e
essa regra é do sistema também. Correção se faz mudando `Status`, não removendo a linha:
venda errada vira `cancelada`, recebível que não entrou vira o valor certo, despesa duplicada
vira estorno. Apagar linha quebra a série histórica e faz o comparativo com o ano anterior
mentir. `atualizar` no Apps Script nunca apaga, e quando não encontra o ID **devolve erro em vez
de criar a linha** — criar linha no lugar de atualizar duplica faturamento.

**3. Nunca escrever em aba derivada.** `PAINEL`, `DRE` e `FLUXO_CAIXA` são fórmula. Qualquer
escrita ali substitui a fórmula por um valor fixo e mata o cálculo em silêncio. `INSTRUCOES` e
`CONFIG` completam a lista por outros motivos. Isso é bloqueado no código, não confiado à
disciplina de quem escreve.

**4. A conferência `vendas x recebiveis (=0)` continua fechando.** É a invariante que o dono já
usa, e ela sobrevive à automação. Na prática: toda venda inserida em `VENDAS` gera, **na mesma
requisição**, os recebíveis que somam exatamente o valor da venda; alterar `Valor da venda` de
uma venda existente obriga a reescrever os recebíveis dela; venda cancelada ou reembolsada
mantém os recebíveis com o status ajustado, não os remove. Se essa conferência abrir depois de
uma escrita, a escrita está errada — não a conferência.

**5. Tipo de célula importa.** Data grava como objeto `Date`, valor grava como `Number`. Data
como texto some das fórmulas de período do `PAINEL`, porque `SOMASES` por mês não enxerga
string. Valor como `"R$ 1.234,56"` não soma, e a conferência da regra 4 passa a acusar
diferença sem que nada esteja errado no negócio. A conversão é feita em `converter()` no
`raro-sync.gs`.
