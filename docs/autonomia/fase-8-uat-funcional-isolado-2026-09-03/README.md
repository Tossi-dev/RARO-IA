# Fase 8 — UAT funcional isolado

Contrato aprovado em 03/09/2026 para testar as jornadas de gestor, mentorado e comercial somente com contas `@audit.invalid` e massa `[AUDIT]`.

- T-117: isolamento server-side de integrações externas — aprovado.
- T-118: homologação função por função — matriz concluída e aprovada pela revisão independente, com funções bloqueadas e dois novos defeitos locais reproduzidos no perfil comercial.
- T-119: dois defeitos de isolamento visual reproduzidos foram corrigidos localmente; revisão independente aprovada.

Relatório operacional: `docs/operacao/fase-8-uat-funcional.md`.

Permanecem proibidos: dados reais, segredos, pagamentos, mensagens, deploy, migrations, mudanças de RLS e produção. O Supabase é usado apenas no workspace sintético já isolado.

Evidência T-117: 118/118 testes focados, suíte completa 167 arquivos/3.394 testes, TypeScript e revisão independente APROVADO.

Evidência atual T-118/T-119: 70/70 testes relevantes, TypeScript e revisão independente aprovados. A suíte integral avançou por 1.126 testes visíveis, mas a execução ficou sem delta e foi interrompida; não é declarada como aprovada. As escritas bloqueadas por RLS continuam sem correção e exigem gate próprio.

Diagnóstico de execução: o build não estava congelado; o trace continuava avançando enquanto o terminal permanecia silencioso. A repetição concluiu 46/46 páginas e `next start` ficou pronto em 1,6 s. A passagem comercial confirmou Começar, tour, agenda e bloqueios de papel; Conteúdo e Marketing produziram os próximos defeitos locais da fila.
