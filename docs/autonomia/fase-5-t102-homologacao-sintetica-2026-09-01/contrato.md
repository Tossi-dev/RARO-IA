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
