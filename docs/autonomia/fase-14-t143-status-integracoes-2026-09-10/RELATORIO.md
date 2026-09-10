# T-143 — Integrações reconhece o Google conectado

## Entrega local aprovada em 2026-09-10

O usuário confirmou que o Google conectou e a agenda aparece. O bug restante estava em Integrações: a página consultava configuração global antiga, não o vínculo OAuth por organização, e seu cartão sempre oferecia conectar novamente.

- O status Google agora vem da mesma fronteira autenticada usada pela Agenda, filtrada pela organização atual e sem trazer tokens ou eventos Google para o painel.
- Cartão, contador e listas usam esse resultado; iCal deixa de ser contado como segunda conexão OAuth ou exigido como configuração adicional.
- Uma organização conectada vê Ver agenda/Gerenciar conexão e a próxima integração pendente do catálogo, com indicação honesta de preparação quando não há autoatendimento pronto.
- Etapas parcialmente concluídas não são puladas: planilha só leitura continua pendente de escrita. A orientação guiada é humana e não pede chaves; detalhes de administração permanecem no diagnóstico completo.
- Contas UAT não consultam a conexão real. Revogação, ausência, erro ou exceção não produzem sucesso falso.

## Evidência

TDD em Terra, revisão independente Sol. A primeira revisão apontou a planilha parcial e cobertura insuficiente; ambas foram corrigidas e testadas antes da aprovação R2.

Regressão do coordenador: **108/108 testes em 10 arquivos**, TypeScript exit 0. Revisor executou seus próprios **17/17 focados**, sem novos achados. Diff check aprovado. Nenhuma alteração de home, estilos globais, migration/RLS, credenciais ou configuração Google Cloud.

## Publicação e limites

A publicação do reparo é a tarefa T-143P, posterior à aprovação local. Build, candidato, promoção e SHA remoto serão registrados separadamente com evidências reais; este registro inicial não declara deploy.

A liberação OAuth para clientes fora da lista de testadores continua pendente. Ver [preparação do Google público](evidencias/preparacao-oauth-publico.md): política ainda em rascunho, apresentação pública/domínio e revisão de permissões precisam ser preparados. A correção visual do status não publica nem verifica o aplicativo no Google.
