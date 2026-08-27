# Triagem da Fase 3 — MentorOS centrado no atendimento

## Princípio de ordem

Primeiro vem o que permite ao profissional compreender, conduzir e acompanhar
uma pessoa entre sessões. Operação financeira, aquisição e automações só entram
depois, como apoio a esse atendimento.

| Ordem | Entrega | Estado atual | Por que agora | Dependência / risco |
|---|---|---|---|---|
| P0 | Mapa inicial e plano de ação | nova | Dá ao profissional dor, medo, objetivo, dimensões 0–10, metas, prazo e próximos passos numa linguagem de perguntas. | Dados sensíveis: começar local, sem persistência ou IA. |
| P0 | Ficha/grafo contínuo do cliente | nova | Conecta sessões, reflexões, metas, ações e métricas; evita perda de contexto. | Precisa de modelo, consentimento, retenção e regras de acesso antes do banco. |
| P1 | Transcrições autorizadas | parcial | Traz memória fiel para a ficha e para a próxima conversa. | Primeiro entrada manual/local; provedor externo, IA e banco real exigem contrato próprio. |
| P1 | Coleta estruturada no onboarding | parcial | Reutiliza o mapa inicial sem fazer o cliente responder duas vezes. | Depende do mapa P0 e de consentimento explícito. |
| P2 | Recomendações visíveis ao profissional | parcial | Mostra padrões e perguntas possíveis, nunca uma orientação automática ao cliente. | Depende de histórico suficiente e revisão humana. |
| P2 | Mensagem individual mentor ↔ mentorado | parcial | Ajuda no acompanhamento entre sessões. | Privacidade, destinatário, retenção e auditoria. |
| P3 | Contrato pelo portal | parcial | Melhora a formalização do atendimento. | Upload e permissões de arquivo; não é núcleo da sessão. |
| P3 | Boas-vindas automatizada | falta | Facilita a entrada depois que o onboarding existe. | Ação externa de comunicação: contrato/autorização próprios. |
| P4 | Scripts por etapa comercial | falta | Apoia aquisição, não a sessão. | Deve seguir o mesmo princípio de perguntas, sem respostas prontas. |
| P4 | Renda pessoal separada | falta | Controle complementar do profissional. | Independente da jornada de atendimento. |
| P5 | E-mail marketing e landing pages | falta | Aquisição futura, fora do núcleo de atendimento. | Integrações e conteúdo externo; contrato separado. |

## Primeiro corte: T-076

**Fazer agora, só local:** contrato de dados e regras puras para o mapa
voluntário e o plano de ação. Inclui dimensões 0–10, meta, prazo, passos,
reflexões e perguntas abertas. Não inclui banco, tela, transcrição, IA ou dados
reais.

**Depois:** desenhar persistência e permissões da ficha/grafo; somente então
ligar onboarding e transcrições.

## Decisões que permanecem com o Tossi antes de banco real

1. Quem poderá ver cada dimensão, transcrição e relação do grafo: só o
   profissional responsável, equipe clínica, ou também o cliente?
2. Por quanto tempo transcrições e notas ficam guardadas e como será solicitada
   a remoção?
3. Quais credenciais profissionais podem usar o módulo clínico e como a
   separação entre mentoria e atendimento clínico aparecerá na interface?
