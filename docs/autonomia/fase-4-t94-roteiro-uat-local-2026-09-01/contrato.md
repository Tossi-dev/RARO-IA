# Contrato de execução — T-094

## Escopo

Criar um roteiro UAT local, reproduzível e sem dados reais para as jornadas de
acesso, ficha profissional, consentimento e portal do mentorado. Consolidar
e executar os testes automatizados que sustentam cada cenário.

## Critérios de aceite

- Cada cenário declara ator, pré-condição, ação, resultado e evidência local.
- O roteiro não pede credencial, conta real, banco, fornecedor ou deploy.
- Consentimento ausente/revogado, ausência de perfil e portal mínimo têm
  resultado explicitamente fail-closed.
- Testes focados, TypeScript e revisão independente aprovados.

## Limites

Não executar login real, não aplicar migrations e não publicar nada. Este
roteiro prova o comportamento local; validação em ambiente real é o T-096 e
exigirá autorização específica.

## Evidências locais

- `consentimento.test.ts`: 3 testes aprovados para categoria, revogação e
  projeção compartilhável.
- `portal.test.ts`: 15 testes aprovados para estados seguros e projeções do
  portal.
- `tsc --noEmit --incremental false` retornou código 0.

## Conclusão

Revisão independente de leitura: **APROVADO**, após registrar as
pré-condições de mocks e fixtures por cenário. O roteiro não executou contas
reais nem abriu ambiente externo.
