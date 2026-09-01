# Contrato de execução — T-088

## Escopo autorizado

Implementar localmente conversa individual privada e a visibilidade explícita
de contrato no portal. A tarefa inclui migration local espelhada, RLS,
ações/tela/testes e auditoria de políticas; não inclui aplicar migration,
acessar o MentorOS real, enviar mensagens, deploy, credenciais ou dados reais.

## Critérios de aceite

- Remetente e destinatário são derivados no servidor, nunca do cliente.
- Um mentorado não lê ou escreve a conversa de outro mentorado.
- O contrato só aparece no portal quando houver liberação explícita.
- Arquivos e mensagens permanecem privados por padrão e deixam trilha de
  auditoria mínima.
- Testes focados, TypeScript e revisão independente aprovados.

## Células

1. Mapear o contrato de dados/RLS atual e registrar schema local espelhado.
2. Criar ações privadas e testes de isolamento.
3. Expor a projeção mínima no portal, somente após as guardas.
4. Validar, revisar, atualizar evidências e publicar Git.

## Limites

Sem banco real, produção, deploy, integração externa, segredos, dados reais
ou envio de mensagens. Cada célula tem checkpoint antes de 50 minutos; dois
pulsos sem delta pausam a tarefa, não a missão inteira.
