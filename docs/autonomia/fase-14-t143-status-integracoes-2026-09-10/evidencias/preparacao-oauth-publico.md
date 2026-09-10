# Google OAuth público — preparação, não publicação

Documento preparado em 2026-09-10 a partir do código e da documentação oficial; não é comprovação de verificação do aplicativo pelo Google. Tossi informou que conseguiu conectar a conta e visualizar a agenda depois de entrar como testador. Esse sucesso funcional é relato do usuário; não foi repetido com a sessão dele pelo agente.

## Diferença entre os dois ambientes

Vercel Production significa que o site está publicado. O aplicativo OAuth do Google possui sua própria audiência, publicação e verificação. Em Testing, o Calendar requer testadores cadastrados; as autorizações e refresh tokens de teste expiram após sete dias. Essa configuração não é a entrega definitiva para clientes. Fonte: [Google — Manage App Audience](https://support.google.com/cloud/answer/15549945?hl=en).

Sair de Testing remove a exigência da lista de testadores, mas não equivale a obter aprovação dos escopos. Um aplicativo público para clientes que pede permissões sensíveis deve passar pela verificação aplicável; não tratar o limite de usuários de um aplicativo não verificado como solução de produção. Fonte: [Google — Sensitive scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification).

## Evidências locais e pendências

- O código pede `calendar.readonly` e `calendar.events` em `src/lib/integracoes/google-agenda.ts`. A leitura da agenda e a sincronização explícita de sessões devem ser justificadas separadamente. Não ampliar permissões nesta correção.
- `src/app/privacidade/page.tsx` existe fora do layout autenticado, mas mantém aviso de rascunho e campos não preenchidos: identidade da empresa, endereço e contato de privacidade. O texto ainda descreve um sistema interno baseado em planilha, portanto precisa revisão para representar o SaaS atual. Nenhuma informação empresarial foi inventada ou publicada nesta célula.
- A home `/` do aplicativo é autenticada; a apresentação pública para revisão deve descrever o MentorOS e oferecer o link da política, sem abrir dados nem alterar a home de aplicativos já aprovada.
- O domínio atualmente conhecido é `raro-ia.vercel.app`. A propriedade/verificação dos domínios autorizados no Google Cloud não foi inspecionada nesta sessão. Pergunta enviada ao Tossi sobre o domínio público pretendido; não comprar domínio, alterar DNS ou assumir propriedade de `vercel.app`.
- Nome público, e-mail de suporte e contatos do projeto Google precisam ser confirmados no painel; a configuração remota não foi modificada.

## Sequência segura

1. Definir o endereço público e confirmar a propriedade exigida pelo Google.
2. Completar a apresentação pública e a política de privacidade com dados reais aprovados, descrevendo acesso, uso, armazenamento, compartilhamento e remoção dos dados Google.
3. Conferir branding, links e escopos no mesmo projeto OAuth usado em produção.
4. Preparar demonstração do consentimento e do uso de cada permissão, em conta/calendário próprios de teste, sem segredos ou dados de clientes.
5. Com esses itens prontos, efetuar a publicação e a submissão aplicáveis no Google Cloud; acompanhar o resultado real no painel. Não prometer prazo ou aprovação.
6. Testar uma conta fora da lista de testadores, reconexão e desconexão. A política de uma organização Google Workspace ainda pode limitar aplicativos externos.

A página pública e a política precisam ser acessíveis sem login e coerentes com o aplicativo; os domínios precisam ter a propriedade verificada conforme os requisitos da revisão. Fonte: [Google — Brand verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification). A justificativa dos escopos e a demonstração pertencem à revisão de acesso a dados. Fonte: [Google — Sensitive scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification).

## Limite desta entrega

T-143 corrige o reconhecimento da conexão e o próximo passo dentro do MentorOS. Este documento prepara a liberação pública, mas não muda audiência, não submete revisão, não altera credenciais ou banco, não conecta serviços e não usa dados reais em demonstrações. A aprovação do Google permanece pendente.
