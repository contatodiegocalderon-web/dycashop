-- Vídeo de boas-vindas: visto uma vez na primeira entrada da área de membros.

alter table public.drop_members
  add column if not exists welcome_seen_at timestamptz;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'community-media',
  'community-media',
  true,
  52428800,
  array['video/mp4', 'image/jpeg']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists community_media_select_public on storage.objects;
create policy community_media_select_public
on storage.objects for select
to public
using (bucket_id = 'community-media');

-- Aula 0. O arquivo está no bucket community-media (boas-vindas.mp4).
do $$
begin
  if not exists (
    select 1 from public.drop_lessons
    where module = 'aulas' and youtube_url like '%boas-vindas.mp4'
  ) then
    update public.drop_lessons
    set position = position + 1
    where module = 'aulas';

    insert into public.drop_lessons (module, title, description, youtube_url, position, published)
    values (
      'aulas',
      'Boas-vindas',
      'Assista antes de começar.',
      'https://wvrkfbcyszrttbqewypc.supabase.co/storage/v1/object/public/community-media/boas-vindas.mp4',
      0,
      true
    );
  end if;
end $$;
