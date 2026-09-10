---
tipo: pacote-contexto-autonomia
projeto: ""
missao_id: ""
tarefa_id: ""
criado: {{date:YYYY-MM-DD}}
status: pendente
tags: [autonomia, contexto, tarefa]
---

# Pacote de contexto — T-142V

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

**Objetivo:** Revalidar chave alterada e construir candidato sem promover

**Dependências:**
- nenhuma

**Escopo de escrita:**
- Vercel:raro-ia build Production sem promover domínio
- repo:docs/autonomia/fase-14-google-validacao-chave-2026-09-10/**
- vault:Projetos/RARO IA/Autonomia/fase-14-google-validacao-chave-2026-09-10/**
- vault:Projetos/RARO IA/Onde parei.md

**Recursos exclusivos compartilhados:**
- repo:RARO IA
- vercel:raro-ia

**Critérios de aceite:**
- Preflight retorna HTTP200 e array vazio nas duas tabelas
- Build candidato Ready e domínio atual preservado
- Nenhum segredo ou registro em evidências

**Validação:**
- Vitest focal e regressão OAuth
- TypeScript
- inventário de upload
- preflight real filtrado
- build remoto e revisão independente

**Estimativa de telemetria:** 2 unidades

**Modelo inicial:** script

**Modelo liberado nesta tentativa:** script

**Esforço:** medium

**Única escalada prevista:**

**Continuidade da missão:** rolling; renovar janela não autoriza trabalho sem tarefa pronta.

**Entrega técnica esperada:** incremental; pronto para produção nunca autoriza ações externas.

**Pulso obrigatório:** até 30 min; sem delta em dois pulsos pausa somente esta tarefa.
