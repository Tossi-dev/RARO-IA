-- ============================================================
-- 0018 — revogar um conteúdo liberado, sem apagar a linha
-- ============================================================
--
-- O QUE ENTRA
-- ------------
-- `conteudo_liberado.arquivado` — falso por padrão. É o que "revogar"
-- significa neste sistema: a linha CONTINUA existindo, com a data em que foi
-- liberada e o título que foi prometido, e apenas deixa de ser oferecida.
--
-- POR QUE NÃO É DELETE
-- ---------------------
-- Regra da casa, escrita no cabeçalho de `src/lib/mentoria/acoes.ts`: nunca
-- apagar linha, status muda, linha fica. Aqui a regra tem um motivo extra e
-- concreto: um conteúdo liberado é uma PROMESSA feita a um cliente. Apagar a
-- linha apaga também a prova de que a promessa existiu — e a primeira pergunta
-- de quem reclamar ("você tinha me liberado aquilo") ficaria sem resposta
-- verificável de nenhum dos dois lados.
--
-- O PONTO DIFÍCIL: REVOGAR PRECISA REVOGAR DE VERDADE
-- ----------------------------------------------------
-- Filtrar `arquivado = false` na consulta do portal resolveria a TELA. Não
-- resolveria o PostgREST: a anon key é pública, e um GET direto em
-- `conteudo_liberado` continuaria devolvendo a linha revogada para o próprio
-- mentorado, porque a política de select dele não sabe da coluna nova.
--
-- É a mesma lição que 0013 e 0017 já cobraram deste projeto duas vezes: quando
-- a régua mora numa linha de código, ela só protege quem passa por aquela
-- linha. Então a política de select do MENTORADO passa a exigir
-- `arquivado = false`. A gestão (dono e gestor) continua enxergando tudo,
-- inclusive o revogado — é a diferença entre "não é mais oferecido a você" e
-- "nunca aconteceu", e quem opera precisa da segunda visão para conferir o que
-- foi liberado um dia.
--
-- As políticas de INSERT e UPDATE não mudam: já são "escrita da gestão" e
-- "update da gestão", criadas em 0008 para as sete tabelas do grupo 3.

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

-- A política de select, reescrita: mesma estrutura de 0008, mais a condição
-- de arquivamento no ramo do mentorado. `workspace_atual()` continua na
-- primeira linha, e nenhum ramo usa `using (true)`.
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
