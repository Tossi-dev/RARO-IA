# Contrato de execução — T-092

## Escopo autorizado

Executar auditoria local de produto e regressão do plano aprovado: testes,
TypeScript, revisão dos estados sem dados, consentimento revogado, conteúdo
privado e portal. Inclui evidências e revisão independente; não inclui banco
real, deploy, produção, credenciais, dados reais ou integrações externas.

## Critérios de aceite

- Suíte de testes integral e TypeScript aprovados, com falhas documentadas se
  existirem.
- Checagem de regressão cobre os portões de consentimento e a separação de
  conteúdo interno/portal.
- Revisão independente registra APROVADO ou achados concretos.
- Ledger, Onde parei e Git remoto refletem somente evidências reais.

## Células

1. Definir os gates locais e rodar a suíte integral.
2. Rodar TypeScript e revisar os caminhos sensíveis do plano.
3. Fazer revisão independente, registrar resultado e publicar Git.

## Limites

Sem banco real, produção, deploy, integração externa, segredos ou dados
reais. Cada célula tem checkpoint antes de 50 minutos; dois pulsos sem delta
pausam somente a tarefa.

## Evidências locais

- A suíte integral do Vitest foi executada em 01/09/2026 com saída de êxito;
  o processo retornou código 0. O terminal registrou apenas o aviso já
  conhecido da API CJS do Vite, sem falha de teste.
- `tsc --noEmit --incremental false` retornou código 0.
- A leitura do portal usa uma projeção mínima para mensagens e a função
  `contrato_do_portal`, sem `valor_total`. Os portões de marketing e
  onboarding falham fechados quando não há consentimento; cancelamento vence
  consentimento. Recomendações de risco seguem sendo perguntas factuais para
  revisão profissional, sem diagnóstico ou prescrição.
- Nenhum banco real, migration aplicada, deploy, credencial, dado real ou
  integração externa foi acessado nesta auditoria.

## Conclusão

Revisão independente de leitura: **APROVADO**, sem achados. Pendente somente
o registro Git da evidência. Esta conclusão não autoriza produção ou qualquer
ação externa.
