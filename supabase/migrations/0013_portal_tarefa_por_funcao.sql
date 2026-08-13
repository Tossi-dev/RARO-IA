-- ============================================================
-- 0013 — fecha o ALTO 1 da auditoria: RLS por LINHA não é RLS por COLUNA.
-- Rode APÓS 0012_portal_mentorado_conclui_tarefa.sql.
--
-- O ATAQUE QUE UM REVISOR PROVOU, EM POSTGRES DE VERDADE
-- --------------------------------------------------------
-- 0012 criou uma política `for update` inteira (linha completa) para o
-- mentorado marcar/desmarcar a própria tarefa. O comentário daquela migração
-- já avisava que Postgres RLS decide por LINHA, nunca por COLUNA — e um
-- revisor autenticado como mentorado, com a anon key (pública) e o próprio
-- JWT, provou exatamente essa lacuna com um PATCH direto no PostgREST,
-- sem passar pela Server Action (`acoes-portal.ts`) nenhuma vez:
--
--   1) reescreveu `titulo` e `prazo` da PRÓPRIA tarefa — a que o mentor
--      escreveu para ele -> UPDATE 1, passou. O `using`/`with check` de
--      0012 só confere DE QUEM é a linha (`mentorado_id = mentorado_atual()`);
--      depois de passar por essa porta, o UPDATE podia mexer em QUALQUER
--      coluna da linha, não só `concluida`/`concluida_em`.
--   2) forjou `concluida_em = '2020-01-01'` (backdating) -> passou, pelo
--      mesmo motivo: nada nessa política restringia QUAL coluna estava
--      sendo escrita.
--   3) moveu a PRÓPRIA tarefa para a sessão de OUTRO mentorado, trocando
--      `mentorado_id` no mesmo PATCH -> passou. O `with check` reavalia a
--      condição depois da escrita, mas com o `mentorado_id` NOVO sendo
--      IGUAL a `mentorado_atual()`? Não — o ataque real trocava para o id
--      alheio e ainda passava, porque o `with check` de 0012 comparava
--      contra `mentorado_atual()` (quem está logado), e nada ali impedia
--      escrever um `mentorado_id` que fosse de outra pessoa se o restante
--      da condição (`workspace_id`, `papel_atual()`) continuasse batendo —
--      a única coluna que a política de fato PRENDIA nos dois lados era
--      `mentorado_id`, mas só comparando com o valor final da linha, não
--      travando as OUTRAS colunas contra qualquer mudança.
--   4) tentou ROUBAR a tarefa de outro mentorado (linha que já começa com
--      `mentorado_id` alheio) -> barrado. O `using` prende: a linha nunca é
--      visível para o UPDATE começar.
--   5) tentou DOAR a própria tarefa para outro mentorado -> barrado. O
--      `with check` prende: a linha resultante não bate mais com
--      `mentorado_atual()`, então o Postgres desfaz o UPDATE.
--
-- Ou seja: a política de 0012 fechava a porta de "linha errada" nos dois
-- sentidos (4 e 5), mas nunca fechou a porta de "coluna errada" (1, 2, 3) —
-- porque RLS, por desenho do Postgres, não tem esse conceito.
--
-- A Server Action (`concluirTarefa`/`reabrirTarefa` em `acoes-portal.ts`)
-- NÃO é defesa nenhuma aqui: ela só existe no caminho do NAVEGADOR. Com a
-- anon key (pública, embutida no bundle) e o JWT da própria sessão, um PATCH
-- direto em `/rest/v1/tarefa_mentoria` contorna o arquivo inteiro — a Server
-- Action nunca é chamada, e mesmo assim o UPDATE acontece.
--
-- OS DOIS DESENHOS TESTADOS, E O QUE DECIDIU
-- --------------------------------------------
-- 1) GRANT/REVOKE por coluna (Postgres tem privilégio de UPDATE por coluna,
--    de verdade: `grant update (concluida, concluida_em) on tarefa_mentoria
--    to authenticated`). Barra o mentorado, mas QUEBRA O GESTOR: no Supabase
--    todo mundo autenticado — dono, gestor, comercial, mentorado — conecta
--    com o MESMO role de banco, `authenticated`. Um GRANT por coluna vale
--    para o role inteiro, não por linha nem por política; não existe jeito
--    de dizer "esta coluna só para quem, além de authenticated, também for
--    mentorado E dono da linha" só com GRANT. Reduzir as colunas permitidas
--    para (concluida, concluida_em) barraria o GESTOR de editar `titulo`/
--    `prazo` da MESMA tabela — a escrita de gestão que já funciona hoje.
--    Descartado.
--
-- 2) FUNÇÃO `security definer` que só troca o PAR (`concluida`,
--    `concluida_em`), com a política de UPDATE do mentorado (a de 0012)
--    REMOVIDA por completo. Medido nos quatro casos que importam:
--      - mentorado escrevendo direto na tabela (`.update()` cru) -> 0 linhas
--        afetadas, RLS barra (não sobra política nenhuma de UPDATE para ele).
--      - mentorado chamando a função, na PRÓPRIA tarefa -> funciona.
--      - mentorado chamando a função, na tarefa de OUTRO mentorado -> a
--        cláusula `where` da função (mentorado_id = mentorado_atual()) não
--        acha a linha, zero linhas afetadas, `raise exception`.
--      - gestor editando `titulo`/`prazo` pela tela de gestão (update
--        completo, "update da gestao" do 0006, intocada) -> continua
--        funcionando, porque esta migração não mexe nessa política.
--    É o desenho correto: a função só sabe fazer UMA coisa (trocar o par
--    concluida/concluida_em de UMA tarefa que já é do chamador), e RLS
--    nem chega a decidir por coluna — decide por FUNÇÃO, um problema que o
--    Postgres resolve de verdade (GRANT EXECUTE), não um que ele finge
--    resolver com using/with check numa política de linha inteira.
-- ============================================================

drop policy if exists "mentorado conclui/reabre a propria tarefa" on public.tarefa_mentoria;

-- `security definer` pelo mesmo motivo de `mentorado_atual()`/`papel_atual()`
-- (0001/0005/0007): o mentorado não tem (e não pode ter) um GRANT de UPDATE
-- na tabela inteira, mas a função pode fazer essa escrita pontual em nome
-- dele, sob as regras que ELA impõe — não as que a tabela impõe.
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

-- Ninguém chama esta função a não ser quem está autenticado — sem isso,
-- `public` (que no Postgres inclui `anon`, antes de qualquer login) poderia
-- chamar a função e testar ids de tarefa às cegas, mesmo sem sessão.
-- `from public` NAO basta no Supabase. O projeto vem com
-- `alter default privileges in schema public grant all on functions to anon,
-- authenticated, service_role`, entao toda funcao nova nasce com EXECUTE
-- concedido NOMINALMENTE a `anon` — e um revoke em `public` (o pseudo-papel)
-- nao mexe num grant nominal. Conferido no banco real depois de aplicar:
-- `has_function_privilege('anon', ...)` continuava true. Nao havia risco de
-- dado (sem sessao, `mentorado_atual()` e nulo e o update afeta zero linhas,
-- que vira excecao), mas uma funcao `security definer` — que roda com os
-- poderes do DONO do banco — alcancavel sem autenticacao nenhuma e
-- superficie de ataque que nao precisa existir.
revoke all on function public.portal_marcar_tarefa(uuid, boolean) from anon;
revoke all on function public.portal_marcar_tarefa(uuid, boolean) from public;
grant execute on function public.portal_marcar_tarefa(uuid, boolean) to authenticated;
