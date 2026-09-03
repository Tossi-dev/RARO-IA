# Evidência de preparação — T-112B

## Escopo aprovado

Recriar somente a massa sintética mínima no workspace fixo da T-112. O SQL
não cria CRM, arquivo de Storage, áudio, transcrição, cobrança, schema ou RLS.

## Controles

- Transação única com `begin` e `commit`.
- Falha fechada para workspace divergente, perfis diferentes dos três
  `audit.invalid`, qualquer dado de negócio prévio, objeto de Storage ou UUID ocupado.
- Conteúdo marcado `[AUDIT] T-112`, datas fixas e contrato de valor zero.
- Documento apenas como metadado sintético, invisível e arquivado; nenhum objeto é criado.
- A primeira aplicação foi revertida integralmente pela restrição única de
  `mentorado.perfil_id`; consulta agregada confirmou um vínculo sintético T-102 antigo.
- A correção exige exatamente esse único vínculo, define somente seu
  `perfil_id` como nulo e comprova o novo vínculo no workspace T-112, sem apagar
  ou mover a linha antiga.
- Hash SHA-256 do SQL corrigido:
  `D8B7E075235BE4D282EE787A2D97403BD82450443DAD9E97D1111084955AA48B`.

## Validação local

- TDD: falha inicial por SQL ausente; estado final 5/5 testes aprovados.
- TypeScript: aprovado.
- Contrato Loop Engineering: `VALID`.
- `git diff --check`: aprovado.
- Primeira revisão independente: `APROVADO`.
- Segunda revisão: dois achados; ambos corrigidos antes de nova aplicação.
- Revisão final do SQL corrigido: `APROVADO`.

## Aplicação e conferência

- Primeira tentativa: revertida integralmente; nenhuma linha persistiu.
- Segunda tentativa, hash `D8B7E0…A48B`: `Success. No rows returned`.
- Contagens: mentorado 1, programa 1, matrícula 1, sessão 1, documento 1,
  mapa 1, consentimentos 3, meta 1, passo 1, nós 2, relação 1, mensagem 1 e
  contrato de valor zero 1.
- Storage: 0 objetos.
- Vínculos antigos da conta sintética de portal fora do workspace T-112: 0.
