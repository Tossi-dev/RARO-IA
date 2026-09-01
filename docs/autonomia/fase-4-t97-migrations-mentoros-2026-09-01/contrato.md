# Contrato de execução — T-097

## Autorização recebida

Tossi autorizou explicitamente aplicar as migrations pendentes no projeto
MentorOS. Esta tarefa restringe a ação às migrations locais da Fase 3:
`0038_atendimento_mapa`, `0039_atendimento_plano`,
`0040_atendimento_grafo`, `0041_sessao_transcricao_autorizada` e
`0042_conversa_privada_contrato_portal`.

## Escopo

Comparar o histórico local com o projeto MentorOS vinculado; aplicar somente
os IDs acima que estiverem ausentes no remoto; confirmar o histórico depois.
Não alterar SQL, dados, usuários, fornecedor, deploy ou configurações fora
dessas migrations já revisadas.

## Critérios de aceite

- Projeto remoto e migrations pendentes são identificados antes da aplicação.
- Somente IDs 0038–0042 podem ser aplicados; diferença fora dessa lista pausa.
- Histórico remoto pós-aplicação confirma os mesmos IDs.
- Ledger registra resultado sem chaves, URLs privadas ou dados reais.
- Revisão independente verifica evidência e escopo após a aplicação.

## Paradas fortes

Parar sem aplicar se o projeto vinculado não for MentorOS, o CLI não puder
identificar o histórico, houver migration pendente fora do conjunto autorizado,
o diff remoto divergir ou a aplicação retornar erro. Não tentar contorno SQL
manual em ambiente real.

## Estado atual

O CLI Supabase não está instalado nem há vínculo local de projeto. O painel
oficial abriu na tela de autenticação; nenhuma credencial foi solicitada,
lida ou transmitida. A tarefa aguarda o usuário entrar no painel do MentorOS
para seguir com a comparação do histórico.
