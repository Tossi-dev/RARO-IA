# Contrato de execução — T-098

## Autorização recebida

Tossi autorizou revisar e aplicar a cadeia anterior necessária, começando pela
`0029_contrato`, no projeto MentorOS.

## Escopo

Revisar a `0029_contrato` e aplicar somente ela se suas dependências já
existirem, pois ela cria `public.contrato` e `public.status_contrato`,
necessários à `0042`. Isso permite uma **nova verificação**, não prova por si
só que 0042 pode ser aplicada. Depois, reavaliar integralmente 0038–0042;
não aplicar migration não necessária à cadeia.

## Critérios de aceite

- Catálogo confirma dependências de 0029 antes de escrita.
- SQL local e testes de migrations são revisados independentemente.
- A ação de escrita é a cópia fiel da 0029, uma única vez, sem alteração.
- Histórico de objetos confirma resultado sem expor dados reais.
- Migrations posteriores só avançam com dependências e autorização confirmadas.

## Paradas fortes

Parar se uma dependência de 0029 estiver ausente, se o SQL divergir do arquivo
local, se o painel não apontar a MentorOS main, se houver erro de execução ou
se surgir uma necessidade fora de 0029 e 0038–0042.

## Evidência da 0029

A 0029 foi executada no MentorOS main após confirmação do usuário. A validação
de catálogo confirmou `contrato`, `status_contrato`, RLS ativa, execução da
função do portal negada a `anon` e permitida a `authenticated`. Não houve
inserção ou alteração de dado de negócio.

## Estado de 0038–0042

O teste local focado aprovou 25 verificações. No catálogo remoto, as cinco
tabelas novas ainda estão ausentes e nenhuma política `transcricoes` de 0041
existe. O recheck confirmou os vínculos `workspace_id`/`matricula_id` de
sessão e `workspace_id`/`mentorado_id` de matrícula. A aplicação delas ainda
depende de revisão independente e de aviso/confirmacão final ao usuário.
