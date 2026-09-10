# T-144 — preflight e escopo observado

Data: 2026-09-10. Pedido explícito: todas as integrações pendentes devem ser vistas, não apenas a próxima.

- Branch mentoros; pull --ff-only confirmou atualização em dia, base 38d7069e2b646bec74ae3a3829efe9bd53a5fa58. Worktree inicialmente limpo.
- Causa local: conexoesDestaque seleciona quatro itens, Requer atenção usa slice(0, 2) e line-clamp, e o botão Ver todas aponta para details técnico fechado por padrão. A T-143 corrigiu reconhecimento Google, mas não removeu esses recortes.
- Inventário atual: Supabase, Planilha Google, Pix, Google Calendar, transcrição, IA, Meta e TikTok. iCal é alternativa legada, não nova integração exigida por OAuth.
- Estado novo só será derivado das verificações já existentes. Não consultar conta/provedores para descobrir valores de configuração nem prometer integração homologada pelo fato de existir env.
- Contrato criado antes do código e validado pelo controlador; T-144 iniciada em Terra. A tentativa de init após a criação do contrato retornou Missão já existe; recuperação por validate/start bem-sucedida, sem reescrever histórico.
- Vercel CLI autenticada como tossi-dev; projeto prj_jzYFZYdUe1azFDKlrSwEeQ9CGpMm, equipe team_ERPRO2NpUKp7P0llS05hnRpf. Metadados reconfirmam gitLinked=false: push não dispara deploy neste projeto.
- Publicação seguirá o mesmo fluxo autorizado de correção: código revisado, upload inspecionado, candidato sem mover domínio, revisão independente e somente então promoção.
- Nenhum segredo/.env lido, banco alterado, integração ativada ou heartbeat reativado. Sem acesso à sessão real do usuário nesta checagem.
