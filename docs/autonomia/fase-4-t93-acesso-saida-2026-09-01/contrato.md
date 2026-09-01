# Contrato de execução — T-093

## Escopo

Cobrir e corrigir, somente localmente, os caminhos de saída de sessão do
MentorOS: Server Action com Supabase e rota do modo senha. O trabalho não
cria contas, não faz login nem usa variáveis secretas.

## Critérios de aceite

- Testes descrevem saída com e sem Supabase configurado e a rota de senha.
- O destino após saída não depende de dado enviado pelo cliente.
- A implementação falha de modo seguro diante de configuração ausente.
- Vitest focado, TypeScript e revisão independente aprovados.

## Células

1. Escrever testes focados para os dois mecanismos de saída.
2. Implementar apenas a menor correção que os faça passar.
3. Validar, revisar, registrar evidências e publicar o commit.

## Limites

Sem banco real, credenciais, login real, deploy, produção ou integração
externa. Dois pulsos sem delta pausam somente esta tarefa.

## Evidências locais

- `src/lib/actions-auth.test.ts`: 2 testes aprovados para saída Supabase e
  ausência de Supabase; em ambos o destino é a rota pública `/login`.
- `src/app/api/acesso/sair/route.test.ts`: 1 teste aprovado para a saída do
  modo senha; apaga somente `COOKIE_ACESSO` e redireciona para `/acesso`.
- `tsc --noEmit --incremental false` retornou código 0.

## Conclusão

Revisão independente de leitura: **APROVADO**, sem achados. Nenhuma sessão
real foi criada ou encerrada nesta tarefa.
