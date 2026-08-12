-- ============================================================
-- Raro.ia — Seed OPCIONAL (estrutura mínima para começar a operar)
-- Rodar DEPOIS do 0001_schema.sql. Ajuste nomes/percentuais reais.
-- Nenhum dado de venda é criado — a operação começa limpa.
-- ============================================================

insert into public.afiliados (nome, braco, pct_padrao) values
  ('Jefson Ragner', 'espirito', 0),          -- dono/mentor: sem comissão
  ('Personal trainer (definir)', 'corpo', 25),
  ('Especialista saúde (definir)', 'mente', 20);

insert into public.produtos (nome, tipo, preco_base) values
  ('Protocolo Raro', 'low_ticket', 297),
  ('Mentoria Raro.ia', 'mentoria', 2997),
  ('Acompanhamento Premium 1:1', 'high_ticket', 9900);

-- Depois de criar seu usuário em Authentication → Users,
-- promova-o a dono (troque o e-mail):
-- update public.profiles set papel = 'dono', nome = 'Jefson Ragner'
--  where id = (select id from auth.users where email = 'email@dojefson.com');
