# T-142V/T-142P — validar a chave atual e publicar

## Situação verificada em 2026-09-10

Após Tossi informar que salvou a Secret key atual, o preflight no ambiente Production retornou **HTTP200 e array vazio nas duas tabelas técnicas**. A recusa anterior HTTP401/legacy_disabled deixou de ocorrer nesta verificação. Nenhuma chave foi lida/copied; nenhum registro de cliente foi retornado ou alterado.

```json
{"prefixo":"GOOGLE_SERVER_PREFLIGHT","resultados":[{"tabela":"google_oauth_estado","status_http":200,"codigo":"ok","codigo_origem":null,"motivo":"leitura_vazia_confirmada"},{"tabela":"google_calendar_conexao","status_http":200,"codigo":"ok","codigo_origem":null,"motivo":"leitura_vazia_confirmada"}]}
```

## Validações

- Código de aplicação: a7123232d5ed65eed7f0c85ba6a3fb1df694fa89 em mentoros, previamente aprovado por revisão independente Sol R2. Nenhuma nova mudança de código nesta célula.
- Vitest reexecutado: 6 arquivos, 37/37 testes; preflight, Agenda, cofre, repositório OAuth e rotas entrar/retorno.
- `npx --no-install tsc --noEmit`: exit0.
- Build remoto: compilação/typecheck e finalização confirmados no log, deployment Ready.
- Upload revisado: 667 entradas / 6754691 bytes; nenhum arquivo de segredo/ambiente/build local incluído.
- Candidato: dpl_8kqfYK9WB559jamK4oe1oEkjDvBd, criado com --prod --skip-domain; metadados confirmam SHA de código a7123232... e projeto RARO IA correto.

## Publicação

A revisão independente Sol aprovou o candidato específico. `vercel promote` retornou exit0/Success e `vercel inspect https://raro-ia.vercel.app` passou a resolver o domínio para dpl_8kqfYK9WB559jamK4oe1oEkjDvBd, Ready. O domínio principal foi preservado durante o preflight/build; somente após aprovação o candidato foi promovido. Antes desta célula o usuário já havia feito redeploy do candidato anterior após atualizar a variável, sem introdução de código de outra origem.

## Limite e próximo passo

GET200/[] comprova o acesso vazio ao schema técnico com a configuração atual. Não comprova INSERT de state, consentimento Google, callback, persistência do vínculo ou leitura de eventos. Não declarar conexão Google concluída apenas pelo preflight ou pelo build.

A pessoa agora deve abrir [Agenda](https://raro-ia.vercel.app/agenda) e iniciar Conectar com o Google. Login e consentimento não são automatizados em nome dela. Nenhuma migration, alteração de RLS, troca de segredo/cofre, evento Calendar ou heartbeat foi executado.

O histórico anterior permanece na missão fase-14-google-armazenamento-2026-09-10. Esta continuação foi criada porque o controlador não reabre diretamente tarefa pausada; não houve edição retroativa de ledger nem novo congelamento fictício. Telemetria de unidades é estimativa, não consumo medido.
