---
tipo: pacote-contexto-autonomia
projeto: ""
missao_id: ""
tarefa_id: ""
criado: {{date:YYYY-MM-DD}}
status: pendente
tags: [autonomia, contexto, tarefa]
---

# Pacote de contexto — T-142P

> Entregue apenas este arquivo, o contrato e os arquivos listados. Não leia o vault inteiro nem contexto de outras tarefas.

## Brief

- **Resultado / aceite:**
- **Ler:**
- **Escrever:**
- **Dependências aprovadas:** ver controle gerado
- **Pulso:** até 30 min; inclua evidência/delta quando houver

## Como agir

1. Trabalhe somente no escopo e na rota de modelo liberados.
2. Falha operacional: registre alerta, corrija e continue.
3. Dois pulsos sem delta ou célula de 60 min: pause só esta tarefa; siga uma independente pronta.
4. Escopo proibido, ação externa, dado sensível, produção ou risco novo: freeze.
5. Entregue arquivos mudados, validação e evidência. Código/integração exigem revisor independente.

## Não pode fazer

- Deploy, push, merge, rebase, produção, cliente, credenciais, dinheiro ou autoaprovação.
- Mudar escopo ou modelo fora da única escalada declarada.

## Fontes

- [[_Sistema/Loop-Engineering]] · [[Template - Contrato de Execucao Autonoma]]

## Controle gerado do contrato

**Objetivo:** Promover candidato aprovado e registrar limite da validação OAuth

**Dependências:**
- T-142V

**Escopo de escrita:**
- Vercel:raro-ia promoção do deployment aprovado para raro-ia.vercel.app
- repo:docs/autonomia/fase-14-google-validacao-chave-2026-09-10/**
- vault:Projetos/RARO IA/Autonomia/fase-14-google-validacao-chave-2026-09-10/**
- vault:Projetos/RARO IA/Onde parei.md
- Git:origin/mentoros documentação sem segredos

**Recursos exclusivos compartilhados:**
- repo:RARO IA
- vercel:raro-ia

**Critérios de aceite:**
- Domínio público aponta para o candidato aprovado Ready
- Contexto e SHA remoto verificados
- Consentimento e persistência ainda não testados permanecem explícitos

**Validação:**
- vercel inspect do domínio e deployment
- revisão independente das evidências
- git diff sem segredos e SHA remoto igual

**Estimativa de telemetria:** 1 unidades

**Modelo inicial:** script

**Modelo liberado nesta tentativa:** script

**Esforço:** medium

**Única escalada prevista:**

**Continuidade da missão:** rolling; renovar janela não autoriza trabalho sem tarefa pronta.

**Entrega técnica esperada:** incremental; pronto para produção nunca autoriza ações externas.

**Pulso obrigatório:** até 30 min; sem delta em dois pulsos pausa somente esta tarefa.
