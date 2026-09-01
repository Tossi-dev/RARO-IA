# Contrato individual — T-102

## Escopo autorizado

Homologar no MentorOS apenas com contas sintéticas existentes. A primeira
célula é de preflight: confirmar alvo, schema e jornadas que podem ser lidas
sem criar conteúdo. Qualquer criação de dado sintético, mensagem, contrato,
arquivo ou alteração de banco será descrita antes de ocorrer.

## Aceite

- O alvo é MentorOS main e a evidência não expõe credenciais nem dados reais.
- A matriz separa leituras seguras das ações que exigem confirmação adicional.
- Não há acesso a clientes reais, fornecedor externo, deploy ou segredo.

## Parada forte

Parar se o alvo divergir, se for necessário criar dados sintéticos sem escopo
confirmado, se surgir dado real, credencial ou ação externa nova.

## Preflight concluído

O painel autenticado confirmou o projeto MentorOS. A UAT completa ainda não
pode ser executada sem uma massa mínima explicitamente sintética para as
novas tabelas e sem o login manual do Tossi no app local. A próxima ação não
é inferida: exige autorizar a criação desse conjunto e o usuário inserir as
senhas no navegador.

## Bloqueio técnico encontrado

A criação atômica autorizada foi tentada e revertida integralmente pelo
PostgreSQL: a função `validar_referencias_atendimento()` instalada no MentorOS
acessa `NEW.meta_id` também quando acionada por tabelas sem essa coluna. A
correção precisa ser uma migration corretiva versionada e a aplicação dessa
mudança no banco real requer autorização específica. Nenhum registro
sintético foi persistido.

## Correção autorizada no loop

A continuação autorizada cobre a migration `0043_corrigir_trigger_referencias_atendimento` e seu espelho executável. Ela substitui somente a função de validação já existente: separa os ramos de `atendimento_passo` e `atendimento_grafo_relacao`, preserva `security definer`, `search_path` fixo e as revogações. Não altera tabelas, RLS, permissões, dados reais ou Storage.

## Execução autenticada

A migration 0043 foi aplicada no MentorOS main e a criação atômica passou. A
verificação pós-escrita confirmou: um programa, matrícula, sessão, metadado de
documento arquivado/invisível, mapa, meta, passo, mensagem, contrato de valor
zero e relação entre dois nós; os três consentimentos foram criados. Falta
somente a visita manual pelas contas sintéticas no app local, pois as senhas
nunca são lidas ou digitadas pelo agente.
