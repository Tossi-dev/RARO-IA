---
schema_version: 2
projeto: RARO IA
missao_id: fase-3-t81-schema-rls-2026-08-26
tarefa: T-081-schema-e-rls-do-atendimento
estado: em_revisao_independente
janela_maxima: 2h
pulso_maximo: 30min
telemetria_estimativa_unidades: 3
executor: Luna-medio
revisor: independente
---

# Contrato individual — T-081: schema e RLS do atendimento

## Escopo aprovado

Criar somente migrations locais `0038` a `0040` e seus espelhos, com testes de
forma. Elas cobrem mapa voluntário, consentimentos, metas, passos, reflexões,
grafo, relações, auditoria de acesso sem texto sensível e projeção mínima ao
portal.

## Decisão de menor privilégio adotada localmente

Enquanto não existe no schema uma relação explícita de profissional responsável
por cliente, o acesso interno fica restrito aos papéis já existentes `dono` e
`gestor` no workspace atual. O papel `mentorado` não recebe acesso direto às
tabelas. A projeção ao portal será uma função estreita, só para metas
compartilháveis com consentimento de `meta` e de `portal` ativos.

## Limites e pendências antes da aplicação real

Não aplicar SQL, não conectar ao MentorOS, não criar dados reais e não executar
retenção ou remoção automática. A modelagem de profissional responsável e a
política de retenção/remoção continuam decisões necessárias antes de aplicar as
migrations em banco real.

## Aceite

- Todas as tabelas têm `workspace_id`, `mentorado_id`, RLS e proteção contra
  referências cruzadas de workspace.
- Não há política para `anon`, `using (true)` ou projeção de reflexão, mapa,
  relação ou transcrição ao portal.
- Funções têm ACL fechada e `search_path` fixo.
- Os arquivos `_exec_` espelham as migrations numeradas.
- O teste de migrations e `npx tsc --noEmit` passam; revisão independente é
  registrada.
