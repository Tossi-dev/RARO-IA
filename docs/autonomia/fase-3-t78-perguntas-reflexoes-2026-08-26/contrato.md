---
schema_version: 2
projeto: RARO IA
missao_id: fase-3-t78-perguntas-reflexoes-2026-08-26
tarefa: T-078-perguntas-e-reflexoes
estado: concluida
janela_maxima: 2h
pulso_maximo: 30min
telemetria_estimativa_unidades: 2
executor: Luna-medio
revisor: independente
---

# Contrato individual — T-078: perguntas e reflexões

## Escopo

Regras puras locais para perguntas abertas por dimensão e registro de reflexões
de cliente ou profissional. O patch existe, foi testado e revisado tecnicamente,
mas só será encerrado após T-077 (metas e plano de ação) concluir.

## Aceite

- No máximo cinco perguntas abertas por dimensão, sem conselho ou diagnóstico.
- Reflexão exige cliente, texto, origem e visibilidade válidos.
- Dimensão inválida falha fechada; testes provam isolamento por cliente.
- Vitest focado, TypeScript e revisão independente aprovam.

## Limites

Sem banco, migrations, RLS, rotas, telas, IA, transcrição, integrações,
produção, deploy, push, commit, credenciais ou dados reais.
