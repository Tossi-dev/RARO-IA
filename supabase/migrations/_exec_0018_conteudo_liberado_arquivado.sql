alter table public.conteudo_liberado
  add column if not exists arquivado boolean not null default false;

comment on column public.conteudo_liberado.arquivado is
  'Revogado. A linha fica, com a data e o titulo originais -- conteudo
   liberado e uma promessa feita a um cliente, e apagar a linha apagaria a
   prova de que a promessa existiu. O mentorado deixa de VER a linha (a
   politica de select dele exige arquivado = false); a gestao continua vendo.';

create index if not exists idx_conteudo_liberado_ativo
  on public.conteudo_liberado (mentorado_id)
  where arquivado = false;

drop policy if exists "leitura: dono, gestor e o proprio mentorado" on public.conteudo_liberado;
create policy "leitura: dono, gestor e o proprio mentorado" on public.conteudo_liberado
  for select to authenticated
  using (
    workspace_id = public.workspace_atual()
    and (
      public.papel_atual() in ('dono', 'gestor')
      or (
        public.papel_atual() = 'mentorado'
        and mentorado_id = public.mentorado_atual()
        and arquivado = false
      )
    )
  );
