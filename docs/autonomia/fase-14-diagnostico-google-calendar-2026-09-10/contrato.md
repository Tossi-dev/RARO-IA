# T-140 — diagnóstico seguro da conexão Google Calendar

Registra no servidor apenas a categoria permitida de falha ao salvar a conexão OAuth e mostra uma orientação acionável na Agenda. Não registra nem expõe token, código OAuth, pessoa, workspace ou segredo.

Validação: testes focados da entrada/retorno OAuth e da Agenda, TypeScript,
inspeção do diff e revisão independente. A entrada distingue permissões,
configuração do cofre e indisponibilidade do servidor sem transmitir detalhes
internos ao navegador.
