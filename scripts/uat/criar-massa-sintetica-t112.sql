begin;

-- Aplicar somente no MentorOS main após autorização explícita da T-112B.
-- O script aborta antes das inserções se o workspace não estiver vazio e isolado.
do $$
declare
  v_workspace_id constant uuid := '00000000-0000-0000-0000-000000000112';
  v_workspace_nome constant text := '[AUDIT] T-112 — workspace sintetico';
  v_mentorado_id constant uuid := '00000000-0000-0000-0000-000000001201';
  v_programa_id constant uuid := '00000000-0000-0000-0000-000000001202';
  v_matricula_id constant uuid := '00000000-0000-0000-0000-000000001203';
  v_sessao_id constant uuid := '00000000-0000-0000-0000-000000001204';
  v_documento_id constant uuid := '00000000-0000-0000-0000-000000001205';
  v_mapa_id constant uuid := '00000000-0000-0000-0000-000000001206';
  v_meta_id constant uuid := '00000000-0000-0000-0000-000000001210';
  v_passo_id constant uuid := '00000000-0000-0000-0000-000000001211';
  v_no_meta_id constant uuid := '00000000-0000-0000-0000-000000001212';
  v_no_passo_id constant uuid := '00000000-0000-0000-0000-000000001213';
  v_relacao_id constant uuid := '00000000-0000-0000-0000-000000001214';
  v_mensagem_id constant uuid := '00000000-0000-0000-0000-000000001215';
  v_contrato_id constant uuid := '00000000-0000-0000-0000-000000001216';
  v_gestor_id uuid;
  v_mentorado_perfil_id uuid;
  v_mentorado_antigo_id uuid;
  v_quantidade integer;
  v_tabela record;
begin
  if not exists (
    select 1 from public.workspace
    where id = v_workspace_id and nome = v_workspace_nome
  ) then
    raise exception 'T-112B abortada: workspace sintetico ausente ou incompatível';
  end if;

  select count(*) into v_quantidade
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.workspace_id = v_workspace_id
    and (
      (lower(u.email) = 'rls-audit-gestor@audit.invalid' and p.papel = 'gestor')
      or (lower(u.email) = 'rls-audit-comercial@audit.invalid' and p.papel = 'comercial')
      or (lower(u.email) = 'rls-audit-mentorado@audit.invalid' and p.papel = 'mentorado')
    );

  if v_quantidade <> 3
    or (select count(*) from public.profiles where workspace_id = v_workspace_id) <> 3 then
    raise exception 'T-112B abortada: perfis sintéticos divergentes';
  end if;

  select p.id into strict v_gestor_id
  from public.profiles p join auth.users u on u.id = p.id
  where p.workspace_id = v_workspace_id
    and lower(u.email) = 'rls-audit-gestor@audit.invalid'
    and p.papel = 'gestor';

  select p.id into strict v_mentorado_perfil_id
  from public.profiles p join auth.users u on u.id = p.id
  where p.workspace_id = v_workspace_id
    and lower(u.email) = 'rls-audit-mentorado@audit.invalid'
    and p.papel = 'mentorado';

  select count(*) into v_quantidade
  from public.mentorado
  where perfil_id = v_mentorado_perfil_id
    and workspace_id <> v_workspace_id
    and nome ilike '%[AUDIT]%';

  if v_quantidade <> 1 then
    raise exception 'T-112B abortada: vínculo sintético anterior divergente';
  end if;

  select id into strict v_mentorado_antigo_id
  from public.mentorado
  where perfil_id = v_mentorado_perfil_id
    and workspace_id <> v_workspace_id
    and nome ilike '%[AUDIT]%';

  for v_tabela in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = 'public'
      and c.column_name = 'workspace_id'
      and t.table_type = 'BASE TABLE'
      and c.table_name not in ('workspace', 'profiles')
  loop
    execute format('select count(*) from public.%I where workspace_id = $1', v_tabela.table_name)
      into v_quantidade using v_workspace_id;
    if v_quantidade <> 0 then
      raise exception 'T-112B abortada: workspace contém dados na tabela %', v_tabela.table_name;
    end if;
  end loop;

  if exists (
    select 1 from storage.objects
    where (storage.foldername(name))[1] = v_workspace_id::text
  ) then
    raise exception 'T-112B abortada: workspace contém objetos de Storage';
  end if;

  select
    (exists (select 1 from public.mentorado where id = v_mentorado_id))::int
    + (exists (select 1 from public.programa where id = v_programa_id))::int
    + (exists (select 1 from public.matricula where id = v_matricula_id))::int
    + (exists (select 1 from public.sessao where id = v_sessao_id))::int
    + (exists (select 1 from public.documento where id = v_documento_id))::int
    + (exists (select 1 from public.atendimento_mapa where id = v_mapa_id))::int
    + (exists (select 1 from public.atendimento_meta where id = v_meta_id))::int
    + (exists (select 1 from public.atendimento_passo where id = v_passo_id))::int
    + (exists (select 1 from public.atendimento_grafo_no where id in (v_no_meta_id, v_no_passo_id)))::int
    + (exists (select 1 from public.atendimento_grafo_relacao where id = v_relacao_id))::int
    + (exists (select 1 from public.mensagem_mentoria where id = v_mensagem_id))::int
    + (exists (select 1 from public.contrato where id = v_contrato_id))::int
  into v_quantidade;

  if v_quantidade <> 0 then
    raise exception 'T-112B abortada: UUID sintético já está ocupado';
  end if;

  update public.mentorado
  set perfil_id = null
  where id = v_mentorado_antigo_id
    and perfil_id = v_mentorado_perfil_id
    and workspace_id <> v_workspace_id
    and nome ilike '%[AUDIT]%';

  get diagnostics v_quantidade = row_count;
  if v_quantidade <> 1 then
    raise exception 'T-112B abortada: desvinculação sintética incompleta';
  end if;

  insert into public.mentorado
    (id, workspace_id, perfil_id, nome, telefone, email, origem, status)
  values
    (v_mentorado_id, v_workspace_id, v_mentorado_perfil_id,
     '[AUDIT] T-112 · Mentorado sintético', '',
     'rls-audit-mentorado@audit.invalid', '[AUDIT] T-112', 'ativo')
  on conflict do nothing;

  insert into public.programa
    (id, workspace_id, nome, formato, total_sessoes, preco, ativo)
  values
    (v_programa_id, v_workspace_id, '[AUDIT] T-112 · Programa sintético',
     'individual', 12, 0.00, true)
  on conflict do nothing;

  insert into public.matricula
    (id, workspace_id, mentorado_id, programa_id, inicio, fim_previsto,
     status, sessoes_previstas)
  values
    (v_matricula_id, v_workspace_id, v_mentorado_id, v_programa_id,
     date '2026-09-01', date '2027-02-28', 'ativa', 12)
  on conflict do nothing;

  insert into public.sessao
    (id, workspace_id, matricula_id, numero, quando, duracao_min, status,
     link_gravacao, transcricao, resumo)
  values
    (v_sessao_id, v_workspace_id, v_matricula_id, 1,
     timestamptz '2026-09-01 14:00:00+00', 60, 'realizada', '', '',
     '[AUDIT] T-112 · Sessão sintética sem conteúdo privado')
  on conflict do nothing;

  insert into public.documento
    (id, workspace_id, mentorado_id, titulo, caminho_storage, mime, bytes,
     categoria, visivel_portal, enviado_por, arquivado)
  values
    (v_documento_id, v_workspace_id, v_mentorado_id,
     '[AUDIT] T-112 · Metadado sintético sem arquivo',
     v_workspace_id::text || '/outro/t112-metadado-sem-arquivo.pdf',
     'application/x-synthetic', 1, 'outro', false, v_gestor_id, true)
  on conflict do nothing;

  insert into public.atendimento_mapa
    (id, workspace_id, mentorado_id, dimensao, nota, dor, medo, objetivo)
  values
    (v_mapa_id, v_workspace_id, v_mentorado_id, 'profissional', 6,
     '[AUDIT] T-112 · Dor sintética', '[AUDIT] T-112 · Medo sintético',
     '[AUDIT] T-112 · Objetivo sintético')
  on conflict do nothing;

  insert into public.atendimento_consentimento
    (id, workspace_id, mentorado_id, categoria, consentido)
  select ids[i], v_workspace_id, v_mentorado_id, categorias[i], true
  from (
    select
      array[
        '00000000-0000-0000-0000-000000001207',
        '00000000-0000-0000-0000-000000001208',
        '00000000-0000-0000-0000-000000001209'
      ]::uuid[] as ids,
      array['mapa', 'meta', 'portal']::text[] as categorias
  ) dados
  cross join lateral generate_subscripts(dados.categorias, 1) as indice(i)
  on conflict do nothing;

  insert into public.atendimento_meta
    (id, workspace_id, mentorado_id, titulo, prazo, status, visibilidade)
  values
    (v_meta_id, v_workspace_id, v_mentorado_id,
     '[AUDIT] T-112 · Meta sintética', date '2026-12-01',
     'em_andamento', 'compartilhavel')
  on conflict do nothing;

  insert into public.atendimento_passo
    (id, workspace_id, mentorado_id, meta_id, descricao, responsavel, ordem, status)
  values
    (v_passo_id, v_workspace_id, v_mentorado_id, v_meta_id,
     '[AUDIT] T-112 · Passo sintético', 'cliente', 0, 'pendente')
  on conflict do nothing;

  insert into public.atendimento_grafo_no
    (id, workspace_id, mentorado_id, tipo, referencia_id, rotulo)
  values
    (v_no_meta_id, v_workspace_id, v_mentorado_id, 'meta', v_meta_id,
     '[AUDIT] T-112 · Nó meta sintético'),
    (v_no_passo_id, v_workspace_id, v_mentorado_id, 'passo', v_passo_id,
     '[AUDIT] T-112 · Nó passo sintético')
  on conflict do nothing;

  insert into public.atendimento_grafo_relacao
    (id, workspace_id, mentorado_id, origem_no_id, destino_no_id, tipo)
  values
    (v_relacao_id, v_workspace_id, v_mentorado_id,
     v_no_passo_id, v_no_meta_id, 'apoia')
  on conflict do nothing;

  insert into public.mensagem_mentoria
    (id, workspace_id, mentorado_id, autor_id, direcao, texto, arquivada)
  values
    (v_mensagem_id, v_workspace_id, v_mentorado_id, v_gestor_id,
     'gestao_para_mentorado', '[AUDIT] T-112 · Mensagem sintética', false)
  on conflict do nothing;

  insert into public.contrato
    (id, workspace_id, mentorado_id, matricula_id, documento_id,
     vigencia_inicio, vigencia_fim, valor_total, status, visivel_portal)
  values
    (v_contrato_id, v_workspace_id, v_mentorado_id, v_matricula_id, null,
     date '2026-09-01', date '2027-02-28', 0.00, 'pendente', true)
  on conflict do nothing;

  if (select count(*) from public.mentorado where workspace_id = v_workspace_id) <> 1
    or (select count(*) from public.programa where workspace_id = v_workspace_id) <> 1
    or (select count(*) from public.matricula where workspace_id = v_workspace_id) <> 1
    or (select count(*) from public.sessao where workspace_id = v_workspace_id) <> 1
    or (select count(*) from public.documento where workspace_id = v_workspace_id) <> 1
    or (select count(*) from public.atendimento_mapa where workspace_id = v_workspace_id) <> 1
    or (select count(*) from public.atendimento_consentimento where workspace_id = v_workspace_id) <> 3
    or (select count(*) from public.atendimento_meta where workspace_id = v_workspace_id) <> 1
    or (select count(*) from public.atendimento_passo where workspace_id = v_workspace_id) <> 1
    or (select count(*) from public.atendimento_grafo_no where workspace_id = v_workspace_id) <> 2
    or (select count(*) from public.atendimento_grafo_relacao where workspace_id = v_workspace_id) <> 1
    or (select count(*) from public.mensagem_mentoria where workspace_id = v_workspace_id) <> 1
    or (select count(*) from public.contrato where workspace_id = v_workspace_id) <> 1 then
    raise exception 'T-112B abortada: conferência atômica da massa falhou';
  end if;

  if (select count(*) from public.mentorado where perfil_id = v_mentorado_perfil_id and workspace_id = v_workspace_id) <> 1
    or exists (select 1 from public.mentorado where perfil_id = v_mentorado_perfil_id and workspace_id <> v_workspace_id) then
    raise exception 'T-112B abortada: vínculo do portal não ficou isolado';
  end if;

  if exists (
    select 1 from storage.objects
    where (storage.foldername(name))[1] = v_workspace_id::text
  ) then
    raise exception 'T-112B abortada: objeto de Storage criado indevidamente';
  end if;
end
$$;

commit;
