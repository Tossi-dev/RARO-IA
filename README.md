# Raro.ia — Plataforma de gestão

Sistema de gestão do ecossistema **corpo · mente · espírito** (Jefson Ragner):
saúde financeira consolidada, CRM de alunos e desempenho de lançamentos em tempo real.

> Modelado a partir da reunião de 14/07/2026 (Jefson × Tossi). Plano completo e decisões:
> `Dev.Tossi/Projetos/RARO IA/` (vault Obsidian).

## Módulos (v2 — Expansão aplicada em 16/07/2026)

| Rota | Módulo |
|---|---|
| `/` | **Dashboard** — KPIs clicáveis (drill-down), card Saúde do Negócio, série 12 meses + **Quadro de Avisos** (painel esquerdo: reuniões de hoje, tarefas, semana, upsell, retomar contato c/ WhatsApp por faixas 1-2/3-7/8-15/15-60/60+) |
| `/analise/[indicador]` | **Análises** — decomposição de faturamento/custos/comissões/margem/lucro: cascata, composição, MoM/YoY, insights |
| `/financeiro` | **Financeiro avançado** — health score explicável, insights/alertas, orçado×realizado, metas do mês, cenários, comparativo anual, margem por produto |
| `/crm` | **Central de Clientes** — pipeline por estágio (Kanban + lista), ficha do aluno em abas (visão/atividades/notas/progresso/compras), timeline unificada |
| `/lancamentos` | **Lançamentos 2.0** — abas: visão, turma & progresso por aluno, reuniões (Google Calendar) & transcrições (texto ou áudio→IA), vendas, pós-venda |
| `/conteudo` | **Conteúdo & Redes** — perfis IG/TikTok/FB, reels com curva de retenção + 3 pilares (gancho/desenvolvimento/CTA), ranking & padrões vencedores, campanhas, roteiros com IA |

### Integrações (todas com modo demo até configurar as chaves — ver `.env.example`)

Google Calendar (reuniões) · Groq Whisper (áudio→texto) · Anthropic (resumos/roteiros/copys) · Meta + TikTok APIs (sync diário via Vercel Cron `/api/sync-social`).

## Stack

Next.js 14 (App Router) + TypeScript · Tailwind · Recharts · Supabase (Postgres + Auth + RLS) · Zod · Vercel.

## Como rodar

**Jeito fácil (Windows):** duplo-clique em `rodar-local.bat` → abre em `http://localhost:3000`.

**Na mão:**
```bash
npm install
npm run dev
```

### Modo demonstração × dados reais

- **Sem** `.env.local` → **modo demonstração**: dados fictícios em memória (banner amarelo avisa). Serve para apresentar a plataforma ao Jefson.
- **Com** Supabase configurado → dados reais + login obrigatório. Passo a passo: **`supabase/README.md`**.

## Scripts da pasta

| Script | O que faz |
|---|---|
| `rodar-local.bat` | Instala dependências (1ª vez) e sobe o app local |
| `subir-github.bat` | Add + commit + push para `github.com/Tossi-dev/raro-ia` |
| `deploy-vercel.bat` | Publica na Vercel (scope `guilhermes-projects`) |

## Estrutura

```
src/
  app/(app)/            → dashboard, financeiro, crm, lancamentos (Server Components)
  app/login/            → login (ativo só com Supabase)
  app/api/webhooks/     → stub do webhook de gateway (aguardando definição)
  components/           → ui (primitivas), charts (Recharts), sidebar, demo-banner
  lib/
    domain.ts           → taxas de pagamento, comissões, categorias (regras de negócio)
    metrics.ts          → TODOS os cálculos financeiros/CRM/lançamentos
    data/               → provider demo (fictício) × supabase (real) — mesma interface
    actions.ts          → Server Actions (escritas validadas com Zod)
supabase/
  migrations/0001_schema.sql  → schema completo + RLS (rodar no SQL Editor)
  seed.sql                    → afiliados/produtos iniciais (opcional)
```

## Decisões pendentes (travam a fase 2)

1. **Gateway de pagamento** (Hotmart/Kiwify/Eduzz/Stripe) → ativa o webhook de vendas automáticas.
2. **Split de comissão real** por afiliado/braço (hoje: % padrão por afiliado).
3. Importar histórico 2025 (planilha) para o comparativo com dados reais.
