---
schema_version: 2
projeto: RARO IA
missao_id: fase-3-t87b-transcricao-externa-2026-08-29
tarefa: T-087B-transcricao-externa-e-resumo-revisavel
estado: pausada
autorizacao: Portao 2 autorizado explicitamente pelo Tossi em 2026-08-29; transcricao automatica com consentimento explicito, sem expor segredos
janela_maxima: 60min
pulso_maximo: 30min
telemetria_estimativa_unidades: sem_teto
executor: Luna-medio
revisor: independente
---

# Contrato individual — T-087B

## Escopo autorizado

- Reabilitar somente a transcrição automática acionada por pessoa, pelo
  adaptador Groq já existente, após consentimento de transcrição derivado no
  servidor sob RLS.
- Tratar o resultado como rascunho privado: nenhum resumo, fato ou relação é
  criado no grafo sem revisão e aceite explícito do profissional.
- Cobrir fornecedor indisponível, erro externo e preservação da transcrição
  manual; testes não fazem chamadas de rede.

## Limites e privacidade

- Pode sair apenas o arquivo da sessão autorizada; texto manual, ficha,
  metadados de cliente e credenciais não saem.
- A chave `GROQ_API_KEY` é lida apenas em runtime e nunca é solicitada,
  impressa, versionada ou usada durante esta missão local.
- Sem banco real, aplicação de migration, dados reais, deploy ou chamada ao
  fornecedor nesta tarefa. Se o modelo atual não permitir provar o
  consentimento por sessão sem schema novo, pausar e registrar o bloqueio.

## Critérios de aceite

- Consentimento ausente, revogado ou não autorizado impede a chamada ao
  fornecedor antes de qualquer envio.
- Falha do fornecedor não altera a transcrição manual existente.
- O resultado automático não publica no portal nem cria resumo/fato/relação
  sem aceite humano.
- Vitest focado, `npx tsc --noEmit --incremental false` e revisão
  independente aprovados.

## Pausa de segurança

Revisão independente reprovou a célula anterior: o schema atual só consegue derivar
consentimento por mentorado/categoria, não por sessão; além disso, um `Blob`
enviado pelo formulário não permite provar que o áudio pertence à sessão. A
implementação parcial não foi aprovada nem publicada. Retomar exige uma
decisão de modelo de dados para consentimento por sessão e vinculação auditável
do arquivo, sem aplicar banco real nesta missão. O Tossi autorizou a retomada
em 2026-08-31 pelo modelo seguro: consentimento por sessão e arquivo privado
vinculado à sessão. A migration será somente local e espelhada; aplicação no
MentorOS real continua proibida.

## Pausa operacional

A célula de implementação venceu sem evidência final de validação. O patch
local e a migration espelhada foram preservados para retomada; nada externo
foi executado. A próxima célula deve validar a migration, recuperar os testes
e só então continuar a adaptação da ação.
