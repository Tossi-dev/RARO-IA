begin;

-- Complemento visual temporario da matricula sintetica T-112.
-- Idempotente: todos os registros usam UUIDs fixos e ficam no workspace [AUDIT].
do $$
declare
  v_workspace_id constant uuid := '00000000-0000-0000-0000-000000000112';
  v_mentorado_id constant uuid := '00000000-0000-0000-0000-000000001201';
  v_matricula_id constant uuid := '00000000-0000-0000-0000-000000001203';
begin
  if not exists (
    select 1 from public.workspace
    where id = v_workspace_id and nome = '[AUDIT] T-112 — workspace sintetico'
  ) then
    raise exception 'T-124 abortada: workspace sintetico T-112 ausente ou divergente';
  end if;

  if not exists (
    select 1 from public.matricula
    where id = v_matricula_id
      and workspace_id = v_workspace_id
      and mentorado_id = v_mentorado_id
  ) then
    raise exception 'T-124 abortada: matricula sintetica T-112 ausente ou divergente';
  end if;

  if exists (select 1 from public.sessao where id = '00000000-0000-0000-0000-000000001220' and (workspace_id <> v_workspace_id or matricula_id <> v_matricula_id))
    or exists (select 1 from public.tarefa_mentoria where id between '00000000-0000-0000-0000-000000001221' and '00000000-0000-0000-0000-000000001223' and (workspace_id <> v_workspace_id or mentorado_id <> v_mentorado_id))
    or exists (select 1 from public.score_evolucao where id between '00000000-0000-0000-0000-000000001230' and '00000000-0000-0000-0000-000000001235' and (workspace_id <> v_workspace_id or mentorado_id <> v_mentorado_id))
    or exists (select 1 from public.marco where id between '00000000-0000-0000-0000-000000001240' and '00000000-0000-0000-0000-000000001241' and (workspace_id <> v_workspace_id or mentorado_id <> v_mentorado_id))
    or exists (select 1 from public.conteudo_liberado where id between '00000000-0000-0000-0000-000000001250' and '00000000-0000-0000-0000-000000001252' and (workspace_id <> v_workspace_id or mentorado_id <> v_mentorado_id)) then
    raise exception 'T-124 abortada: UUID reservado colide com registro fora da massa sintetica';
  end if;

  insert into public.sessao
    (id, workspace_id, matricula_id, numero, quando, duracao_min, status,
     link_gravacao, transcricao, resumo)
  values
    ('00000000-0000-0000-0000-000000001220', v_workspace_id,
     v_matricula_id, 2, timestamptz '2026-09-12 17:00:00+00', 60,
     'agendada', '', '', '[AUDIT] T-124 · Crenças sobre merecimento e crescimento')
  on conflict (id) do nothing;

  insert into public.tarefa_mentoria
    (id, workspace_id, mentorado_id, sessao_id, titulo, prazo, concluida, marcada_por)
  values
    ('00000000-0000-0000-0000-000000001221', v_workspace_id, v_mentorado_id, null,
     '[AUDIT] Registrar situações que ativam insegurança', date '2026-09-10', false, '[AUDIT] T-124'),
    ('00000000-0000-0000-0000-000000001222', v_workspace_id, v_mentorado_id, null,
     '[AUDIT] Conversar com a equipe sobre delegação', date '2026-09-12', false, '[AUDIT] T-124'),
    ('00000000-0000-0000-0000-000000001223', v_workspace_id, v_mentorado_id, null,
     '[AUDIT] Revisar meta de faturamento', date '2026-09-14', false, '[AUDIT] T-124')
  on conflict (id) do nothing;

  insert into public.score_evolucao
    (id, workspace_id, mentorado_id, semana, score, motivo)
  values
    ('00000000-0000-0000-0000-000000001230', v_workspace_id, v_mentorado_id, date '2026-08-03', 56, '[AUDIT] T-124'),
    ('00000000-0000-0000-0000-000000001231', v_workspace_id, v_mentorado_id, date '2026-08-10', 54, '[AUDIT] T-124'),
    ('00000000-0000-0000-0000-000000001232', v_workspace_id, v_mentorado_id, date '2026-08-17', 61, '[AUDIT] T-124'),
    ('00000000-0000-0000-0000-000000001233', v_workspace_id, v_mentorado_id, date '2026-08-24', 63, '[AUDIT] T-124'),
    ('00000000-0000-0000-0000-000000001234', v_workspace_id, v_mentorado_id, date '2026-08-31', 70, '[AUDIT] T-124'),
    ('00000000-0000-0000-0000-000000001235', v_workspace_id, v_mentorado_id, date '2026-09-06', 76, '[AUDIT] T-124')
  on conflict (mentorado_id, semana) do nothing;

  insert into public.marco
    (id, workspace_id, mentorado_id, titulo, descricao, conquistado_em)
  values
    ('00000000-0000-0000-0000-000000001240', v_workspace_id, v_mentorado_id,
     '[AUDIT] Clarifiquei meus valores como lider', '[AUDIT] T-124', date '2026-08-28'),
    ('00000000-0000-0000-0000-000000001241', v_workspace_id, v_mentorado_id,
     '[AUDIT] Deleguei com confianca e autonomia', '[AUDIT] T-124', date '2026-09-04')
  on conflict (id) do nothing;

  insert into public.conteudo_liberado
    (id, workspace_id, mentorado_id, titulo, url, liberado_em, arquivado)
  values
    ('00000000-0000-0000-0000-000000001250', v_workspace_id, v_mentorado_id,
     '[AUDIT] Aula 4 — Mentalidade de crescimento na pratica', '', timestamptz '2026-09-01 12:00:00+00', false),
    ('00000000-0000-0000-0000-000000001251', v_workspace_id, v_mentorado_id,
     '[AUDIT] Guia — Comunicacao que gera confianca', '', timestamptz '2026-09-02 12:00:00+00', false),
    ('00000000-0000-0000-0000-000000001252', v_workspace_id, v_mentorado_id,
     '[AUDIT] Video — Tomada de decisao com clareza', '', timestamptz '2026-09-03 12:00:00+00', false)
  on conflict (id) do nothing;

  if (select count(*) from public.sessao where id = '00000000-0000-0000-0000-000000001220' and workspace_id = v_workspace_id and matricula_id = v_matricula_id) <> 1
    or (select count(*) from public.tarefa_mentoria where id between '00000000-0000-0000-0000-000000001221' and '00000000-0000-0000-0000-000000001223' and workspace_id = v_workspace_id and mentorado_id = v_mentorado_id) <> 3
    or (select count(*) from public.score_evolucao where id between '00000000-0000-0000-0000-000000001230' and '00000000-0000-0000-0000-000000001235' and workspace_id = v_workspace_id and mentorado_id = v_mentorado_id) <> 6
    or (select count(*) from public.marco where id between '00000000-0000-0000-0000-000000001240' and '00000000-0000-0000-0000-000000001241' and workspace_id = v_workspace_id and mentorado_id = v_mentorado_id) <> 2
    or (select count(*) from public.conteudo_liberado where id between '00000000-0000-0000-0000-000000001250' and '00000000-0000-0000-0000-000000001252' and workspace_id = v_workspace_id and mentorado_id = v_mentorado_id) <> 3 then
    raise exception 'T-124 abortada: conferencia atomica do complemento falhou';
  end if;
end
$$;

commit;
