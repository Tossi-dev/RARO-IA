begin;

-- Remove somente o complemento visual T-124; preserva a massa-base T-112.
delete from public.conteudo_liberado
where id between '00000000-0000-0000-0000-000000001250' and '00000000-0000-0000-0000-000000001252';

delete from public.marco
where id between '00000000-0000-0000-0000-000000001240' and '00000000-0000-0000-0000-000000001241';

delete from public.score_evolucao
where id between '00000000-0000-0000-0000-000000001230' and '00000000-0000-0000-0000-000000001235';

delete from public.tarefa_mentoria
where id between '00000000-0000-0000-0000-000000001221' and '00000000-0000-0000-0000-000000001223';

delete from public.sessao
where id = '00000000-0000-0000-0000-000000001220';

commit;
