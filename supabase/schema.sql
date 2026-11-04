-- Rode no Supabase: SQL Editor > New query > Run
create table profiles (id uuid primary key references auth.users on delete cascade, email text, active boolean not null default false, created_at timestamptz default now());
create function handle_new_user() returns trigger language plpgsql security definer as $$
begin insert into profiles(id,email) values (new.id,new.email); return new; end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

create function is_active() returns boolean language sql security definer stable as $$
  select coalesce((select active from profiles where id = auth.uid()), false) $$;

create table videos (
  id text primary key, title text not null, channel text, format text default 'Vídeo',
  duration_s int, views bigint default 0, views_first bigint, published_at timestamptz,
  thumb text, created_at timestamptz default now(),
  growth numeric generated always as ((views - coalesce(views_first,0)) * 100.0 / greatest(coalesce(views_first,1),1)) stored
);
create function set_views_first() returns trigger language plpgsql as $$
begin new.views_first := new.views; return new; end $$;
create trigger videos_views_first before insert on videos for each row execute function set_views_first();

create table ideas (video_id text primary key references videos(id) on delete cascade, idea text not null, created_at timestamptz default now());

create table community (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users, title text not null, channel text not null, url text not null, format text, created_at timestamptz default now());

alter table profiles enable row level security;
alter table videos enable row level security;
alter table ideas enable row level security;
alter table community enable row level security;

create policy "ver proprio perfil" on profiles for select using (id = auth.uid());
create policy "feed publico" on videos for select using (true);
-- Ideias: assinantes veem todas; os demais veem só as 2 de maior crescimento
create policy "ideias por assinatura" on ideas for select using (
  is_active() or video_id in (select id from videos order by growth desc limit 2));
create policy "mural publico" on community for select using (true);
create policy "assinante publica" on community for insert with check (user_id = auth.uid() and is_active());
create policy "apagar o proprio" on community for delete using (user_id = auth.uid());

-- Ativar um assinante manualmente (até ligar o webhook de pagamento):
-- update profiles set active = true where email = 'cliente@email.com';
