# RARO IA / MentorOS — contexto de execução autônoma

Leia este arquivo antes de alterar o projeto. Ele é a versão portátil do
contrato-mestre aprovado pelo Tossi em 26/08/2026.

## Git e continuidade entre máquinas

- Repositório privado: `https://github.com/Tossi-dev/RARO-IA`
- Branch de trabalho: `mentoros`
- Antes de começar: `git switch mentoros` e `git pull --ff-only origin mentoros`.
- Depois de cada mudança que esteja verificada e dentro do escopo: execute os
  testes aplicáveis, faça `git add`, um commit descritivo e
  `git push origin mentoros`.
- Confirme o envio com `git status -sb` e compare `HEAD` com
  `git ls-remote --heads origin mentoros`.
- Nunca envie `.env*`, chaves, tokens, credenciais, dados reais, caches ou
  artefatos de build.

## Produto e direção aprovada

O produto é o **MentorOS**, ferramenta de trabalho para profissionais de
mentoria, coaching, psicologia e psicoterapia. A ficha de atendimento é o
centro: o profissional conduz perguntas abertas para que o cliente encontre o
próprio caminho; o sistema não dá diagnóstico, prescrição ou aconselhamento
autônomo.

Prioridades da ficha: mapa voluntário de dor, medo e objetivo; notas 0–10 para
espiritualidade, família/parentes, casamento/cônjuge, filhos, social, saúde,
servir, intelectual, financeiro, profissional e emocional; metas, prazo e
plano de ação; reflexões; histórico/grafo; transcrições autorizadas. CRM,
comercial e financeiro são módulos de apoio.

Dados de saúde, espiritualidade, relações e emoções são sensíveis. Coletar o
mínimo, respeitar consentimento por categoria, acesso mínimo, trilha de
auditoria sem texto sensível e projeção ao portal somente quando explicitamente
compartilhável e consentida.

## Contrato-mestre e plano

O plano completo está em
[`docs/superpowers/plans/2026-08-26-mentoros-atendimento.md`](docs/superpowers/plans/2026-08-26-mentoros-atendimento.md).

O Tossi aprovou o plano-mestre e autorizou execução autônoma local. Para cada
tarefa: contrato individual, ledger, TDD (teste vermelho antes do código),
Vitest focado, `npx tsc --noEmit`, revisão independente e atualização do
checkpoint humano.

Não interromper a missão apenas porque uma revisão está pendente e não há erro
técnico: registre-a e siga para uma tarefa independente pronta. Não marque a
tarefa como aprovada sem evidência de revisão.

## Portões absolutos

- Nunca aplicar migration ou tocar no banco MentorOS real sem autorização
  específica para aquela aplicação.
- Transcrição externa, IA, fornecedor, e-mail, WhatsApp, landing externa e
  qualquer integração real exigem contrato e autorização específicos.
- Sem produção, deploy, merge, credenciais, dados reais ou ação financeira sem
  autorização explícita.
- Ao surgir risco novo, escopo proibido, dado sensível inesperado ou ação
  externa: parada forte, registrar evidência e pedir direção ao Tossi.

## Estado atual em 01/09/2026

- A Fase 3, T-076 a T-092, foi concluída localmente com testes, TypeScript e
  revisão independente. As migrations continuam somente como arquivos locais.
- T-087B permanece sem envio real a fornecedor; o código trata consentimento
  por sessão e falha fechada, mas não recebeu áudio, dado real ou credencial.
- A Fase 4 local está aprovada e começa pela T-093, para comprovar acesso e
  saída de sessão antes dos roteiros UAT e de prontidão operacional.
- O próximo portão de ambiente real permanece separado: banco, migrations
  aplicadas, deploy, produção e integrações externas exigem autorização
  específica para a ação.
