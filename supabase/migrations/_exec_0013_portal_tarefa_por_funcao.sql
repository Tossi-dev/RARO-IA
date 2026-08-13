drop policy if exists "mentorado conclui/reabre a propria tarefa" on public.tarefa_mentoria;
create or replace function public.portal_marcar_tarefa(p_tarefa_id uuid, p_concluida boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  linhas_afetadas int;
begin
  -- `now()` roda NO SERVIDOR, dentro desta função — nunca um timestamp que
  -- viesse do cliente (formulário, corpo de request, o que for). Quem marca
  -- uma tarefa como concluída não escolhe QUANDO marcou: o "quando" é o
  -- instante em que o banco processou o pedido, sempre, sem exceção. Foi
  -- exatamente essa liberdade — aceitar um `concluida_em` mandado pelo
  -- cliente — que o revisor usou para forjar `concluida_em = '2020-01-01'`
  -- contra a política de 0012.
  --
  -- As QUATRO condições do `where` abaixo são a linha inteira de defesa
  -- desta função — cada uma fecha uma porta específica do ataque:
  --   `id = p_tarefa_id`               -- só a tarefa pedida, nenhuma outra.
  --   `mentorado_id = mentorado_atual()` -- só se a tarefa for DESTE mentorado
  --                                        logado — a mesma travessia que o
  --                                        `using`/`with check` de 0012 já
  --                                        fazia, só que agora sem nenhuma
  --                                        outra coluna exposta ao lado dela.
  --   `workspace_id = workspace_atual()` -- multi-tenant: nunca a tarefa de
  --                                        outro workspace, mesmo que por
  --                                        acidente os dois ids de mentorado
  --                                        colidissem entre workspaces.
  --   `papel_atual() = 'mentorado'`     -- só quem está logado COMO mentorado
  --                                        passa por aqui — um dono ou gestor
  --                                        que quisesse dar baixa em nome de
  --                                        alguém usa a tela de gestão
  --                                        (update completo, intocado por
  --                                        esta migração), não esta função.
  update public.tarefa_mentoria
  set
    concluida = p_concluida,
    concluida_em = case when p_concluida then now() else null end
  where
    id = p_tarefa_id
    and mentorado_id = public.mentorado_atual()
    and workspace_id = public.workspace_atual()
    and public.papel_atual() = 'mentorado';

  get diagnostics linhas_afetadas = row_count;

  -- Zero linhas afetadas: id inexistente, tarefa de outro mentorado, papel
  -- errado, ou workspace errado — qualquer um desses casos, do ponto de
  -- vista de quem chamou, é a MESMA resposta ("não consegui marcar esta
  -- tarefa"), e a mensagem não carrega detalhe de schema/tabela/coluna
  -- nenhum: ela pode chegar ao usuário (ver `acoes-portal.ts`, que só
  -- repassa `SQLERRM` para `console.warn`, nunca para a tela).
  if linhas_afetadas = 0 then
    raise exception 'Não foi possível marcar esta tarefa.';
  end if;
end;
$$;
comment on function public.portal_marcar_tarefa is
  'Único caminho pelo qual um mentorado marca/reabre a PROPRIA tarefa
   (concluida + concluida_em). Substitui a politica de UPDATE de linha
   inteira de 0012 (removida acima) depois que uma auditoria em Postgres
   real provou que RLS por linha nao impede reescrever titulo/prazo,
   forjar concluida_em, ou mover a tarefa para outro mentorado_id. GRANT
   por coluna foi cogitado e descartado: no Supabase todo mundo conecta
   como o mesmo role authenticated, entao um GRANT por coluna bloquearia
   o GESTOR de editar titulo/prazo tanto quanto bloqueia o mentorado. Ver
   o cabecalho de 0013_portal_tarefa_por_funcao.sql para o ataque completo.';
revoke all on function public.portal_marcar_tarefa(uuid, boolean) from anon;
revoke all on function public.portal_marcar_tarefa(uuid, boolean) from public;
grant execute on function public.portal_marcar_tarefa(uuid, boolean) to authenticated;
