-- Trilha única de aulas da comunidade (sequência exibida em /comunidade).

alter table public.drop_lessons drop constraint if exists drop_lessons_module_check;

alter table public.drop_lessons
  add constraint drop_lessons_module_check
  check (module in ('aulas', 'atacado', 'varejo', 'etiqueta', 'pedido'));

insert into public.drop_lessons (module, title, youtube_url, position, published)
select v.module, v.title, v.youtube_url, v.position, true
from (
  values
    ('aulas', 'AULA 1 - IMPORTANTE', 'https://youtu.be/NfaCjbfJ9HY', 0),
    ('aulas', 'AULA 2 - COMO FAZER AS PRIMEIRAS VENDAS', 'https://youtu.be/NJ7wHHSIIbs', 1),
    ('aulas', 'AULA 3 - COMO GERAR ETIQUETA DE ENVIO', 'https://youtu.be/LkP6NzKpMM4', 2),
    ('aulas', 'AULA 4 - COMO MANDAR SEU PEDIDO', 'https://youtu.be/aRAd8KaWXvk', 3),
    ('aulas', 'AULA 5 - COMO ESCALAR AS VENDAS', 'https://youtu.be/i3n-qtvgf18', 4)
) as v(module, title, youtube_url, position)
where not exists (
  select 1 from public.drop_lessons d
  where d.module = 'aulas' and d.youtube_url = v.youtube_url
);
