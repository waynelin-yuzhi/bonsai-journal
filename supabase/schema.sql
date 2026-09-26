-- ============================================================
-- 盆栽創作紀錄（bonsai-journal）· Supabase 資料庫結構
-- 在 Supabase 後台 → SQL Editor 整段貼上執行一次即可。
-- 可重複執行（if not exists / create or replace / drop policy if exists）。
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- 樹種 ----------
-- owner_id 為 null：系統預設（所有人看得到）；有值：使用者自訂
create table if not exists public.species (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  category   text not null default '松柏類',
  owner_id   uuid references auth.users(id) on delete cascade,
  sort       int  not null default 100,
  created_at timestamptz not null default now()
);

-- ---------- 作業項目 ----------
-- species_id 為 null：所有樹種共用；有值：該樹種專屬
-- owner_id   為 null：系統預設；有值：使用者自訂
create table if not exists public.operation_types (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  species_id uuid references public.species(id) on delete cascade,
  owner_id   uuid references auth.users(id) on delete cascade,
  sort       int  not null default 100,
  created_at timestamptz not null default now()
);

-- ---------- 作品（一棵樹）----------
create table if not exists public.trees (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  code        text,                 -- 編號，如 JP-001
  name        text not null,        -- 作品名稱
  species_id  uuid references public.species(id) on delete set null,
  source      text,                 -- 來源：山採／素材／扦插…
  acquired_on date,                 -- 取得日期
  est_age     int,                  -- 取得時的估計樹齡（年）
  pot         text,                 -- 盆器
  front_note  text,                 -- 正面設定說明（正面可能會改，舊的寫在紀錄備註裡）
  note        text,
  status      text not null default 'active' check (status in ('active', 'archived')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------- 紀錄（每次作業一筆）----------
create table if not exists public.entries (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  tree_id     uuid not null references public.trees(id) on delete cascade,
  entry_date  date not null default current_date,
  operations  text[] not null default '{}',  -- 作業項目（存名稱，之後改名不影響歷史）
  height_cm   numeric(6,1),                  -- 樹高
  width_cm    numeric(6,1),                  -- 幅寬
  trunk_cm    numeric(6,1),                  -- 幹徑
  vigor       smallint check (vigor between 1 and 5),  -- 樹勢 1–5
  wire        text,                          -- 線材
  soil        text,                          -- 用土
  fertilizer  text,                          -- 肥料／藥劑
  note        text,
  next_action text,                          -- 下次預計做什麼
  next_date   date,                          -- 下次預計日期（Phase 2 提醒會用到）
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------- 照片 ----------
-- 檔案放在 Storage 的 photos bucket：{user_id}/{tree_id}/{entry_id}/{photo_id}.jpg（縮圖為 _t.jpg）
create table if not exists public.photos (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  tree_id     uuid not null references public.trees(id) on delete cascade,
  entry_id    uuid not null references public.entries(id) on delete cascade,
  angle       text not null check (angle in ('front', 'back', 'left', 'right', 'top', 'detail')),
  caption     text,
  path        text not null,
  thumb_path  text not null,
  width       int,
  height      int,
  sort        int not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists trees_owner_idx       on public.trees (owner_id);
create index if not exists entries_tree_date_idx on public.entries (tree_id, entry_date desc);
create index if not exists photos_entry_idx      on public.photos (entry_id);
create index if not exists photos_tree_angle_idx on public.photos (tree_id, angle);
create index if not exists photos_owner_idx      on public.photos (owner_id);
create index if not exists entries_owner_idx     on public.entries (owner_id);
create index if not exists trees_species_idx     on public.trees (species_id);
create index if not exists species_owner_idx     on public.species (owner_id);
create index if not exists op_types_species_idx  on public.operation_types (species_id);
create index if not exists op_types_owner_idx    on public.operation_types (owner_id);

-- ---------- updated_at 自動更新 ----------
create or replace function public.touch_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trees_touch on public.trees;
create trigger trees_touch before update on public.trees
  for each row execute function public.touch_updated_at();

drop trigger if exists entries_touch on public.entries;
create trigger entries_touch before update on public.entries
  for each row execute function public.touch_updated_at();

-- ---------- 樹的總覽（列表用：封面縮圖、紀錄次數、最後紀錄日）----------
-- security_invoker：查詢時套用呼叫者的 RLS，只看得到自己的樹
create or replace view public.tree_overview with (security_invoker = true) as
select
  t.*,
  s.name as species_name,
  (select count(*) from public.entries e where e.tree_id = t.id)          as entry_count,
  (select max(e.entry_date) from public.entries e where e.tree_id = t.id) as last_entry_date,
  (select p.thumb_path
     from public.photos p
     join public.entries e on e.id = p.entry_id
    where p.tree_id = t.id
    order by (p.angle = 'front') desc, e.entry_date desc, p.created_at desc
    limit 1)                                                               as cover_thumb
from public.trees t
left join public.species s on s.id = t.species_id;

-- ============================================================
-- 權限（RLS）：每個人只能讀寫自己的資料；系統預設的樹種／作業項目大家都看得到
-- ============================================================
alter table public.species         enable row level security;
alter table public.operation_types enable row level security;
alter table public.trees           enable row level security;
alter table public.entries         enable row level security;
alter table public.photos          enable row level security;

drop policy if exists species_read   on public.species;
drop policy if exists species_write  on public.species;
drop policy if exists species_insert on public.species;
drop policy if exists species_update on public.species;
drop policy if exists species_delete on public.species;
create policy species_read on public.species for select to authenticated
  using (owner_id is null or owner_id = (select auth.uid()));
create policy species_insert on public.species for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy species_update on public.species for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy species_delete on public.species for delete to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists operation_types_read   on public.operation_types;
drop policy if exists operation_types_write  on public.operation_types;
drop policy if exists operation_types_insert on public.operation_types;
drop policy if exists operation_types_update on public.operation_types;
drop policy if exists operation_types_delete on public.operation_types;
create policy operation_types_read on public.operation_types for select to authenticated
  using (owner_id is null or owner_id = (select auth.uid()));
create policy operation_types_insert on public.operation_types for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and (species_id is null or exists (
      select 1 from public.species s
       where s.id = species_id and (s.owner_id is null or s.owner_id = (select auth.uid()))))
  );
create policy operation_types_update on public.operation_types for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and (species_id is null or exists (
      select 1 from public.species s
       where s.id = species_id and (s.owner_id is null or s.owner_id = (select auth.uid()))))
  );
create policy operation_types_delete on public.operation_types for delete to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists trees_own on public.trees;
create policy trees_own on public.trees for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and (species_id is null or exists (
      select 1 from public.species s
       where s.id = species_id and (s.owner_id is null or s.owner_id = (select auth.uid()))))
  );

drop policy if exists entries_own on public.entries;
create policy entries_own on public.entries for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and exists (select 1 from public.trees t where t.id = tree_id and t.owner_id = (select auth.uid()))
  );

drop policy if exists photos_own on public.photos;
create policy photos_own on public.photos for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.entries e
       where e.id = entry_id and e.tree_id = photos.tree_id and e.owner_id = (select auth.uid()))
  );

grant usage on schema public to authenticated;
grant select, insert, update, delete
  on public.species, public.operation_types, public.trees, public.entries, public.photos
  to authenticated;
grant select on public.tree_overview to authenticated;

-- ============================================================
-- 照片儲存空間（Storage）：私人 bucket，只能存取自己資料夾 {user_id}/...
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 5242880, array['image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists photos_bucket_select on storage.objects;
drop policy if exists photos_bucket_insert on storage.objects;
drop policy if exists photos_bucket_update on storage.objects;
drop policy if exists photos_bucket_delete on storage.objects;
create policy photos_bucket_select on storage.objects for select to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy photos_bucket_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy photos_bucket_update on storage.objects for update to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy photos_bucket_delete on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ============================================================
-- 預設資料：樹種與作業項目（可在 App「設定」頁再自訂）
-- ============================================================
insert into public.species (name, category, sort)
select v.name, '松柏類', v.sort
  from (values ('真柏', 10), ('黑松', 20), ('五葉松', 30)) as v(name, sort)
 where not exists (select 1 from public.species s where s.name = v.name and s.owner_id is null);

-- 共用作業
insert into public.operation_types (name, sort)
select v.name, v.sort
  from (values
    ('觀察紀錄', 10), ('修剪', 20), ('疏枝', 30), ('摘芽', 40), ('蟠扎', 50), ('拆線', 60),
    ('換盆', 70), ('嫁接', 80), ('施肥', 90), ('病蟲害防治', 100)
  ) as v(name, sort)
 where not exists (
   select 1 from public.operation_types o
    where o.name = v.name and o.species_id is null and o.owner_id is null);

-- 樹種專屬作業
insert into public.operation_types (name, species_id, sort)
select v.op, s.id, v.sort
  from (values
    ('真柏', '雕舍利／神枝', 200), ('真柏', '塗石灰硫磺合劑', 210),
    ('黑松', '切芽（短葉法）', 200), ('黑松', '芽數調整', 210), ('黑松', '拔舊葉', 220),
    ('五葉松', '拔舊葉', 200)
  ) as v(species, op, sort)
  join public.species s on s.name = v.species and s.owner_id is null
 where not exists (
   select 1 from public.operation_types o
    where o.name = v.op and o.species_id = s.id and o.owner_id is null);
