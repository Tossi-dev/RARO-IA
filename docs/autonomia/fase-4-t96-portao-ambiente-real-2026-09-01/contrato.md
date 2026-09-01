# Contrato de execução — T-096

## Escopo

Documentar o portão para uma futura validação em ambiente real: autorizações,
evidências mínimas, ordem segura e critérios de pausa. Não executar nenhuma
das ações listadas.

## Critérios de aceite

- O documento separa pronto localmente de autorizado em ambiente real.
- Cada ação externa tem autorização específica, evidência e condição de parada.
- Não contém segredos, URLs privadas, nomes de usuários ou dados reais.
- Verificador de prontidão local, TypeScript e revisão independente aprovados.

## Limites

T-096 não autoriza banco, migrations aplicadas, login, criação de conta,
fornecedor, transcrição, deploy ou produção. É um portão documental.

## Evidências locais

- `verificar-prontidao-local.ts` aprovou sem segredo ou artefato rastreado.
- `tsc --noEmit --incremental false` retornou código 0.
- O documento contém somente condições e nomes genéricos; não foram usados
  ambiente, credencial, URL privada ou dado real.

## Conclusão

Revisão independente de leitura: **APROVADO**, sem achados. A próxima etapa
exige uma autorização específica para o bloco de ambiente real escolhido.
