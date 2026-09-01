# Contrato de execução — T-091

## Escopo autorizado

Verificar e completar somente o comportamento local de renda pessoal isolada
do negócio e marketing com consentimento, cancelamento e nenhum envio padrão.
Inclui código/testes locais; não inclui ativar e-mail, landing externa,
tracking, banco real, deploy, credenciais, dados reais ou integração externa.

## Critérios de aceite

- Renda pessoal não se mistura às métricas ou ao caixa do negócio.
- Marketing sem consentimento ou cancelado não enfileira nem envia contato.
- Qualquer captura local explicita a finalidade e não ativa tracking externo.
- Testes focados, TypeScript e revisão independente aprovados.

## Células

1. Mapear pessoal e marketing atuais, incluindo ações/rotas locais.
2. Escrever testes para isolamento, consentimento e cancelamento.
3. Implementar somente lacunas seguras locais e validar.
4. Revisar e registrar; e-mail/landing externa/tracking continuam bloqueados.

## Limites

Sem banco real, produção, deploy, e-mail, landing externa, tracking,
integração externa, segredos ou dados reais. Cada célula tem checkpoint antes
de 50 minutos; dois pulsos sem delta pausam somente a tarefa.

## Conclusão

Concluída localmente em 2026-09-01: 14 testes focados e TypeScript sem
emissões aprovados; revisão independente aprovou sem achados. O cancelamento
encerra a captura antes de rate-limit ou persistência, e envio segue desativado.
