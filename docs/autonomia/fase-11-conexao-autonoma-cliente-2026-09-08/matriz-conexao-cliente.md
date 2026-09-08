# Conexões que o cliente faz sozinho

Esta matriz define a experiência de conexão do MentorOS para que a implantação
na empresa do cliente não dependa de compartilhar senha, token ou acesso de
administrador com a nossa equipe. A regra de produto é simples: a pessoa dona
da conta autentica diretamente no provedor; o MentorOS apenas explica o motivo,
os dados acessados e o resultado da conexão.

## Jornada única na tela Integrações

1. A pessoa administradora escolhe **Conectar** na integração desejada.
2. O MentorOS mostra o que será lido ou enviado, para qual finalidade e como
   desconectar depois.
3. A pessoa é levada para a tela oficial do provedor (OAuth) ou recebe uma
   instrução curta de administração quando OAuth não existe.
4. O provedor retorna ao MentorOS, que mostra o estado `Conectada`, a conta
   vinculada e a opção `Desconectar`.

O produto nunca pede senha do Google, Meta, TikTok ou banco, nem exibe uma
chave de API em um campo do navegador.

## Matriz de conexão

| Integração | O que o cliente faz | O que a plataforma prepara antes | Estado nesta fase |
| --- | --- | --- | --- |
| Google Calendar | Clica em **Conectar Google Calendar**, entra no Google e aceita as permissões. | Aplicativo OAuth do MentorOS, URL de retorno e armazenamento protegido do vínculo por organização. | O início guiado local existe; a ativação depende da configuração OAuth da plataforma. |
| Agenda por iCal (somente leitura) | Não cola uma URL de calendário na tela. Solicita a conexão ao administrador da plataforma e recebe confirmação quando ela estiver ativa. | URL iCal secreta por organização, leitura sem escrita, armazenamento protegido, renovação e opção de revogar. | Não é autoatendimento: uma URL iCal concede acesso a compromissos e não pode aparecer, ser colada ou ser compartilhada na UI. |
| Google Sheets | Clica em **Conectar Google Sheets**, escolhe a conta e depois a planilha autorizada. | Escopos OAuth mínimos, seletor de planilha e vínculo por organização. | Planejado; não oferecer botão até a plataforma estar pronta. |
| Meta / Instagram | Clica em **Conectar Meta**, entra na Meta e escolhe a empresa, página e conta permitidas. | Aplicativo Meta aprovado, URL de retorno, escopos mínimos e vínculo por organização. | Planejado; exige preparação e aprovação da Meta. |
| TikTok | Clica em **Conectar TikTok**, entra no TikTok e confirma a conta permitida. | Aplicativo TikTok aprovado, URL de retorno, escopos mínimos e vínculo por organização. | Planejado; exige preparação e aprovação do TikTok. |
| Transcrição (STT) | Não fornece chave no navegador. Escolhe ativar o recurso e aceita o termo de consentimento aplicável. | Decisão comercial: uso gerenciado pelo MentorOS ou cofre criptografado por organização; política de retenção e consentimento. | Sem conexão de cliente enquanto a decisão e o cofre não existirem. |
| IA de apoio | Não fornece chave no navegador. Escolhe ativar o recurso e aceita a finalidade de processamento. | Decisão comercial: uso gerenciado pelo MentorOS ou cofre criptografado por organização; controles de custo e consentimento. | Sem conexão de cliente enquanto a decisão e o cofre não existirem. |
| Gateway / Pix | Escolhe o provedor disponível e é encaminhado ao painel oficial dele. | Escolha do PSP, ambiente de homologação, webhooks idempotentes, conciliação e vínculo por organização. | Decisão pendente; nenhuma cobrança ou Pix é ativado por esta fase. |
| Supabase | Nenhuma ação pelo cliente. | Infraestrutura interna da plataforma, RLS, chaves de servidor e monitoramento. | Operação interna; chaves não aparecem na UI. |

## Requisitos antes de liberar um botão real

- A conexão deve ser isolada por organização, com autorização no servidor.
- O escopo deve ser o mínimo necessário e descrito em português na tela.
- O retorno OAuth deve validar `state`, expiração e associação à organização.
- A conta conectada e a data da última sincronização devem ser visíveis.
- A desconexão deve revogar o vínculo local e orientar a revogação no provedor
  quando aplicável.
- Falhas devem ser compreensíveis: `aplicativo ainda não preparado`,
  `permissão recusada`, `conta não autorizada` ou `conexão expirada`.

## Portões que continuam explícitos

Criar aplicações nos provedores, inserir credenciais, acessar contas reais,
armazenar tokens, aplicar migrations, ativar webhooks, cobrar por Pix ou fazer
chamadas para APIs externas são ações posteriores e exigem autorização
específica. Esta fase somente prepara a jornada segura e a linguagem que o
cliente verá.
