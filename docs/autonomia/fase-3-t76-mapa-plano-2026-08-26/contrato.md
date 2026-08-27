---
schema_version: 2
projeto: RARO IA
missao_id: fase-3-t76-mapa-plano-2026-08-26
tarefa: T-076-mapa-e-plano-de-acao
estado: concluida
janela_maxima: 2h
pulso_maximo: 30min
telemetria_estimativa_unidades: 2
executor: Luna-medio
revisor: independente
---

# Contrato individual — T-076: mapa e plano de ação

> Incorporado ao contrato-mestre `fase-3-atendimento-completo-2026-08-26`.
> Não executar isoladamente; a aprovação do plano-mestre libera o bloco local
> completo T-076 a T-080.

## Escopo

Criar, com TDD, regras locais e puras para validar um mapa voluntário do cliente
(dimensões de vida com nota 0–10) e um plano de ação (meta, prazo, passos e
acompanhamento). A saída deve preservar ausência como ausência — nunca inventar
nota, diagnóstico, conselho ou próximo passo.

## Critérios de aceite

- Notas aceitam apenas inteiros de 0 a 10; campos ausentes permanecem ausentes.
- Meta, prazo e passos têm validação explícita e mensagens utilizáveis.
- Perguntas abertas são sugestões para o profissional, não respostas para o
  cliente nem orientação clínica automática.
- Testes unitários cobrem limites, ausência, datas inválidas e isolamento entre
  mapas de clientes.
- `vitest` focado e `tsc --noEmit` passam; revisão independente aprova.

## Fora do escopo

Banco, migrations, RLS, rotas, telas, transcrição, IA, credenciais, dados reais,
produção, deploy, push e commit.

## Pausa forte

Parar se for necessária persistência, integração externa ou qualquer dado real.
