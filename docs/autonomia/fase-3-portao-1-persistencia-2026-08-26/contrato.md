---
schema_version: 2
projeto: RARO IA
missao_id: fase-3-portao-1-persistencia-2026-08-26
estado: aguarda_decisoes_do_tossi
janela_maxima: 1h
pulso_maximo: 30min
telemetria_estimativa_unidades: 0
executor: Luna-medio
revisor: independente
---

# Portão 1 — persistência de dados do atendimento

## O que este portão libera depois de aprovado

Somente a criação e o teste local das migrations da T-081. Aplicar qualquer SQL
no MentorOS real continua exigindo autorização explícita posterior.

## Decisões necessárias

1. **Acesso interno:** o padrão proposto é profissional responsável e dono do
   workspace; gestor só com permissão explícita por cliente. Confirme ou altere.
2. **Portal:** o padrão proposto é cliente ver apenas itens marcados
   compartilháveis e com consentimento da categoria e do portal ativos. Confirme
   ou altere.
3. **Retenção e remoção:** defina por quanto tempo mapa, reflexões, grafo e
   transcrições ficam guardados e como o profissional atende uma solicitação de
   remoção. Nenhum prazo será inventado pelo software.
4. **Auditoria:** o padrão proposto é registrar leitura, escrita, mudança de
   consentimento e projeção ao portal, sem guardar o texto sensível no log.
   Confirme ou altere.

## Limites

Sem aplicar migrations, banco real, credenciais, dados reais, IA, transcrição,
produção, deploy, push ou commit enquanto estas decisões não forem aprovadas.
