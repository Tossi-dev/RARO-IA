# T-144 — lista completa de integrações e pendências

## Pedido e causa

Tossi solicitou mostrar TODAS as integrações que faltam. A página anterior destacava quatro conexões, mostrava somente duas pendências e encaminhava Ver todas para um diagnóstico técnico fechado. A T-143 resolveu o status Google e a próxima etapa, mas deixou esses recortes.

## Escopo da correção

- Inventário principal com as oito integrações atuais: base Supabase, Planilha Google, confirmação Pix, Google Calendar, transcrição de áudio, apoio por IA, Instagram/Facebook e TikTok.
- Lista completa de pendências, incluindo as conexões parciais, com motivo, responsável e próximo passo seguro. Sem recorte de itens nem texto cortado; visível sem abrir o diagnóstico.
- Google confirmado por organização sai das pendências; iCal legado não é exigido como conexão adicional. A conexão já feita não é recriada.
- Configuração de plataforma não comprova homologação no fornecedor; Google desconhecido/revogado e conta UAT não recebem mensagens de sucesso ou instruções incompatíveis.
- O painel não faz novas chamadas nem ativa fornecedor. Home, estilos globais, credenciais, banco, Google OAuth público e heartbeat ficam fora do escopo.

## Validação e publicação

TDD e revisão independente registrados no ledger. A primeira rodada teve 21 testes focados e 112 de regressão, mas Sol exigiu correção de mensagens e seletores de testes. Na segunda rodada, Terra corrigiu os achados; Sol aprovou e executou seus próprios 27/27 testes. O coordenador confirmou 118/118 testes de regressão, TypeScript exit 0 e diff check sem erros. A aprovação local não declara publicação.

Depois de aprovado, o reparo seguirá o fluxo autorizado de build/candidato/revisão/promoção no projeto Vercel existente. O limite de teste autenticado real será declarado na evidência, sem confundir metadados de deploy com inspeção da sessão do usuário.

## Publicação realizada

Código `b7479cf7f77ab596bc0379c217bb062c18dce326` confirmado em origin/mentoros. Candidato `dpl_AMfnZYxN7JphEogh8Juyu6XwBwKv` passou no build e na revisão independente; promoção retornou Success. Consulta exata confirmou o alias `raro-ia.vercel.app` nesse deployment e no projeto correto.

Abra [todas as integrações pendentes](https://raro-ia.vercel.app/integracoes#todas-integracoes-pendentes). A lista completa é validada em renderização sintética e testes, mas não foi inspecionada na sessão real pelo agente. Nenhum fornecedor foi ativado por esta entrega.

Sol também confirmou independentemente o alias público, deployment Ready, projeto e SHA. T-144 e T-144P concluídas no ledger; fila sem tarefas prontas. Registros e hashes de evidência são espelhados neste diretório, sem novo deploy por documentação. Telemetria total:5unidades estimadas, não cobrança medida. Heartbeat continua desativado.
