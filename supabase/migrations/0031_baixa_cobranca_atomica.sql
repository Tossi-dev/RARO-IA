-- 0031 — baixa manual atômica: cobrança e movimento de caixa
-- Esta migration é local até aplicação manual autorizada. Não é gateway.

create or replace function public.baixar_cobranca_com_movimento(
  p_cobranca_id uuid,
  p_pago_em date,
  p_forma public.forma_cobranca
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cobranca public.cobranca%rowtype;
  v_movimento_id uuid;
begin
  if auth.uid() is null
    or public.papel_atual() not in ('dono', 'gestor')
    or public.papel_atual() is null then
    raise exception 'sem permissão para baixar cobrança';
  end if;

  if p_pago_em is null
    or p_pago_em > (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'data da baixa inválida';
  end if;

  select *
    into v_cobranca
    from public.cobranca
   where id = p_cobranca_id
     and workspace_id = public.workspace_atual()
   for update;

  if not found then
    raise exception 'cobrança não encontrada';
  end if;

  if v_cobranca.status = 'cancelada' then
    raise exception 'cobrança cancelada não pode receber baixa';
  end if;

  if v_cobranca.status = 'paga' then
    if v_cobranca.movimento_id is not null then
      return v_cobranca.movimento_id;
    end if;
    raise exception 'cobrança paga sem movimento vinculado';
  end if;

  insert into public.movimentos_caixa (
    workspace_id,
    direcao,
    categoria,
    descricao,
    valor,
    data_competencia,
    data_caixa,
    status,
    origem,
    origem_id
  ) values (
    v_cobranca.workspace_id,
    'entrada',
    'vendas',
    'Baixa de cobrança ' || v_cobranca.id::text,
    v_cobranca.valor,
    v_cobranca.competencia,
    p_pago_em,
    'realizado',
    'matricula',
    v_cobranca.id::text
  ) returning id into v_movimento_id;

  update public.cobranca
     set status = 'paga',
         pago_em = p_pago_em,
         forma = p_forma,
         movimento_id = v_movimento_id
   where id = v_cobranca.id;

  return v_movimento_id;
end;
$$;

revoke all on function public.baixar_cobranca_com_movimento(uuid, date, public.forma_cobranca) from public;
revoke all on function public.baixar_cobranca_com_movimento(uuid, date, public.forma_cobranca) from anon;
grant execute on function public.baixar_cobranca_com_movimento(uuid, date, public.forma_cobranca) to authenticated;
