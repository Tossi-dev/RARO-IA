---
schema_version: 3
projeto: RARO IA
missao_id: fase-7-t112-massa-sintetica-2026-09-02
estado: concluido
autorizacao: recriação da massa sintética mínima autorizada por Tossi em 2026-09-02
pulso_maximo: 10min
---

# Contrato individual — T-112B: massa sintética isolada

## Escopo

Preparar, testar, revisar e aplicar no MentorOS main um único SQL transacional
que crie massa mínima exclusivamente no workspace sintético fixo da T-112.
Somente as três identidades `audit.invalid` já isoladas podem ser referenciadas.

## Aceite

- O workspace precisa existir vazio e conter exatamente os três perfis sintéticos esperados.
- Exatamente um mentorado sintético antigo ligado à conta de portal deve existir
  fora do workspace; somente esse `perfil_id` é desvinculado, sem mover ou apagar a linha.
- A operação cria somente registros com UUIDs fixos e conteúdo marcado `[AUDIT] T-112`.
- São criados mentorado, programa, matrícula, sessão, documento sem objeto de
  Storage, mapa, três consentimentos, meta, passo, dois nós, uma relação,
  mensagem e contrato de valor zero.
- Não há lead, oportunidade, proposta, áudio, transcrição, arquivo, cobrança,
  migration, RLS, configuração, deploy ou dado real.
- Qualquer dado de negócio prévio, perfil divergente, objeto de Storage ou UUID
  ocupado aborta a transação inteira.
- Teste focado, TypeScript, diff check e revisão independente precisam aprovar
  antes da aplicação.

<!-- LOOP-CONTRACT:START
{
  "schema_version": 3,
  "project": "RARO IA",
  "mission_id": "fase-7-t112-massa-sintetica-2026-09-02",
  "approved_by": "Tossi",
  "approved_at": "2026-09-02",
  "continuation_mode": "rolling",
  "delivery_mode": "incremento_tecnico",
  "window_max_hours": 4,
  "task_max_minutes": 55,
  "checkpoint_minutes": 10,
  "max_parallel_workers": 1,
  "tasks": [{
    "id": "T-112B",
    "title": "Recriar massa sintética mínima no workspace isolado",
    "depends_on": [],
    "write_scope": ["scripts/uat/criar-massa-sintetica-t112.sql", "scripts/criar-massa-sintetica-t112.test.ts", "docs/autonomia/fase-7-t112-massa-sintetica-2026-09-02/**", "vault:Projetos/RARO IA/Autonomia/fase-7-t112-massa-sintetica-2026-09-02/**", "vault:Projetos/RARO IA/Onde parei.md"],
    "shared_resources": ["repo:RARO IA", "lock:t112-massa", "database:MentorOS-main"],
    "acceptance": ["Massa mínima contém somente marcadores e identidades sintéticas no workspace T-112.", "Falha fechada antes de qualquer escrita se o workspace não estiver vazio e isolado.", "O único update permitido desvincula o perfil de portal da massa T-102 antiga, sem apagar ou mover a linha."],
    "validation": ["npx vitest run scripts/criar-massa-sintetica-t112.test.ts", "npx tsc --noEmit --incremental false", "git diff --check", "revisão independente", "consulta agregada pós-aplicação"],
    "max_minutes": 55,
    "estimated_units": 3,
    "risk": "escrita-sintetica-em-banco-real",
    "requires_independent_review": true,
    "external_scope": "MentorOS main: somente inserções sintéticas autorizadas no workspace 00000000-0000-0000-0000-000000000112",
    "model": {"initial":"luna","effort":"medium","one_escalation_to":"terra"}
  }]
}
LOOP-CONTRACT:END -->

## Encerramento

A primeira aplicação foi revertida integralmente. Após diagnóstico agregado e
correção revisada, o SQL final foi aplicado com sucesso no MentorOS main. As
contagens pós-aplicação confirmaram toda a massa mínima, zero objeto de Storage
e zero vínculo antigo da conta sintética de portal.
