# Fase 8 — UAT funcional isolado

Contrato aprovado em 03/09/2026 para testar as jornadas de gestor, mentorado e comercial somente com contas `@audit.invalid` e massa `[AUDIT]`.

- T-117: isolamento server-side de integrações externas — aprovado.
- T-118: homologação função por função — em execução.
- T-119: corrigir apenas defeitos reproduzidos pela UAT.

Permanecem proibidos: dados reais, segredos, pagamentos, mensagens, deploy, migrations, mudanças de RLS e produção. O Supabase é usado apenas no workspace sintético já isolado.

Evidência T-117: 118/118 testes focados, suíte completa 167 arquivos/3.394 testes, TypeScript e revisão independente APROVADO.
