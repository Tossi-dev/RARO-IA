---
schema_version: 2
projeto: RARO IA
missao_id: fase-3-t77-perguntas-reflexoes-2026-08-26
tarefa: T-077-perguntas-e-reflexoes
estado: invalidada_por_ordenacao
janela_maxima: 2h
pulso_maximo: 30min
telemetria_estimativa_unidades: 2
executor: Luna-medio
revisor: independente
---

# Registro administrativo inválido — perguntas e reflexões

> Este registro foi criado com a numeração errada. No plano-mestre aprovado,
> perguntas e reflexões são T-078; T-077 é metas, prazo e plano de ação. O
> código local foi reassociado de modo transparente à T-078 antes de liberar a
> dependência seguinte.

## Escopo

Criar regras puras locais para perguntas abertas por dimensão e para registro de
reflexões do cliente ou profissional. Perguntas são sugestões editáveis; não
há persistência, tela, IA, transcrição ou dado real.

## Aceite

- No máximo cinco perguntas abertas por dimensão, sem conselho ou diagnóstico.
- Reflexão exige cliente, texto, origem e visibilidade válidos.
- Testes cobrem limite, contexto, valores inválidos e isolamento por cliente.
- Vitest focado, TypeScript e revisão independente aprovam.

## Limites

Sem banco, migrations, RLS, rotas, telas, integrações, produção, deploy, push,
commit, credenciais ou dados reais.
