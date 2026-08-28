---
schema_version: 2
projeto: RARO IA
missao_id: fase-3-t83-ficha-360-2026-08-27
tarefa: T-083-ficha-360-do-atendimento
estado: concluida
autorizacao: plano-mestre fase-3 aprovado; continuidade autorizada em 2026-08-27
janela_maxima: 2h
pulso_maximo: 30min
telemetria_estimativa_unidades: 3
executor: Luna-medio
revisor: independente
---

# Contrato individual — T-083: ficha 360° do atendimento

## Escopo local

Criar componentes puros para mapa de atendimento, plano de ação e grafo, e
integrá-los à ficha profissional em `/mentoria/[id]`. A interface recebe
somente a projeção já autorizada por `Ficha.atendimento`; esta tarefa não cria
novas consultas, ações de servidor, migrations ou telas de portal.

## Regras de segurança

- Sem dados, sem consentimento ou com falha de leitura, a tela explica a
  ausência sem inventar avaliação, diagnóstico ou recomendação.
- Perguntas são sugestões editáveis ao profissional; nunca instruções ou
  respostas prontas para o cliente.
- Reflexões privadas ficam visíveis apenas na ficha profissional já protegida
  por RLS; nenhuma projeção é criada para o portal.
- Nenhuma migration será aplicada e nenhum banco real, credencial, integração
  externa, dado real ou deploy será usado.

## Aceite

- Testes cobrem sem base, consentimento ausente, falha de leitura e dados
  completos.
- A ficha exibe mapa, metas, passos, reflexões e relações somente no contexto
  profissional.
- Vitest focado e `npx tsc --noEmit` passam.
- Ledger e revisão independente registram evidências reais antes da conclusão.
