# Contexto T-143P — publicação do reparo

- Projeto: RARO IA / MentorOS.
- Missão: fase-14-t143-status-integracoes-2026-09-10.
- T-143 aprovada; código 9d07f9bffeb99abc9b665c9c41bd30f6b199be45 sincronizado.
- Escopo autorizado: build e promoção do reparo na Vercel raro-ia, registros e Git origin/mentoros. Sem mudanças adicionais de aplicação.
- Equipe/projeto: guilhermes-projects-7de72796 / prj_jzYFZYdUe1azFDKlrSwEeQ9CGpMm.
- Candidato: dpl_2Z3W8dR8rRHjuEg9ziuvmChnnHPj, criado com --prod --skip-domain. READY, SHA correto e build concluído.
- Promoção concluída após revisão independente: o alias raro-ia.vercel.app aponta para dpl_2Z3W8dR8rRHjuEg9ziuvmChnnHPj, confirmado pelo coordenador e pelo revisor Sol. A versão anterior era dpl_8kqfYK9WB559jamK4oe1oEkjDvBd.
- Validação final: confirmar alias exato, relatório de revisão, commit/push dos registros e igualdade de SHA remoto.
- Evidências: evidencias/candidato-t143p.md, publicacao-t143p.md e revisao-t143p.md. Finalizar o espelho do ledger e verificar o SHA remoto do último commit documental; não executar novo deploy por documentação.
- Proibido: valores de env/credenciais em saídas, logs OAuth do usuário, banco/migrations/RLS, Google Cloud/audiência, novos fornecedores e heartbeat.
- Limite: teste autenticado da nova tela na sessão do usuário não foi feito; não confundir build com homologação real nem publicação Vercel com verificação Google.
