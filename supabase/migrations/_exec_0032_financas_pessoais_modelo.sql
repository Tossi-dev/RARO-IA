-- ============================================================
-- 0032 — campos explícitos para finanças pessoais
--
-- Não há default nem retropreenchimento: registros legados sem os
-- novos dados continuam desconhecidos até serem informados pelo dono.
-- ============================================================

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'classe_patrimonio'
  ) then
    create type public.classe_patrimonio as enum (
      'imovel',
      'veiculo',
      'reserva',
      'investimento',
      'outro'
    );
  end if;
end $$;

alter table public.patrimonio
  add column if not exists classe public.classe_patrimonio;

alter table public.investimento
  add column if not exists aportado numeric(14, 2) check (aportado >= 0),
  add column if not exists valor_atual numeric(14, 2) check (valor_atual >= 0);
