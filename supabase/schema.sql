-- ============================================================
-- 盆栽創作紀錄（bonsai-journal）· Supabase 資料庫結構
-- 在 Supabase 後台 → SQL Editor 整段貼上執行一次即可。
-- 可重複執行（if not exists / create or replace / drop policy if exists）。
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- 樹種 ----------
-- owner_id 為 null：系統預設（所有人看得到）；有值：使用者自訂
-- category：柏、松、花果、落葉、常綠（後三者合稱雜木）
create table if not exists public.species (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  category   text not null check (category in ('柏', '松', '花果', '落葉', '常綠')),
  owner_id   uuid references auth.users(id) on delete cascade,
  sort       int  not null default 100,
  created_at timestamptz not null default now()
);

-- ---------- 作業項目 ----------
-- species_id、category 都是 null：所有樹種共用
-- category 有值：該分類適用（雜木＝花果、落葉、常綠都適用）；species_id 有值：該樹種專屬
-- owner_id   為 null：系統預設；有值：使用者自訂
create table if not exists public.operation_types (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  species_id uuid references public.species(id) on delete cascade,
  category   text,
  owner_id   uuid references auth.users(id) on delete cascade,
  sort       int  not null default 100,
  created_at timestamptz not null default now()
);

-- ---------- 作品（一棵樹）----------
create table if not exists public.trees (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  code        text,                 -- 編號，如 JP-001
  name        text,                 -- 作品名稱（選填，沒取名就顯示樹種）
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
drop view if exists public.tree_overview;
create view public.tree_overview with (security_invoker = true) as
select
  t.*,
  s.name as species_name,
  s.category as species_category,
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
-- 分類：柏／松／雜木（花果、落葉、常綠）
--   舊版的樹種分類都是「松柏類」，依名稱轉成柏或松
-- ============================================================
alter table public.species alter column category drop default;
update public.species set category = case when name like '%松%' then '松' else '柏' end
 where category not in ('柏', '松', '花果', '落葉', '常綠');
alter table public.species drop constraint if exists species_category_check;
alter table public.species add constraint species_category_check
  check (category in ('柏', '松', '花果', '落葉', '常綠'));

alter table public.operation_types add column if not exists category text;
alter table public.operation_types drop constraint if exists operation_types_category_check;
alter table public.operation_types add constraint operation_types_category_check
  check (category is null or (species_id is null and category in ('柏', '松', '雜木', '花果', '落葉', '常綠')));

-- 盆栽名稱改為選填
alter table public.trees alter column name drop not null;

-- ============================================================
-- 預設資料：樹種與作業項目（可在 App「設定」頁再自訂）
-- ============================================================
with v(name, category, sort) as (values
    ('真柏', '柏', 10), ('杜松', '柏', 20), ('檜', '柏', 30),
    ('黑松', '松', 110), ('五葉松', '松', 120), ('赤松', '松', 130), ('羅漢松', '松', 140),
    ('梅', '花果', 210), ('杜鵑（皐月）', '花果', 220), ('石榴', '花果', 230), ('長壽梅', '花果', 240), ('海棠', '花果', 250), ('火棘', '花果', 260),
    ('楓', '落葉', 310), ('三角楓', '落葉', 320), ('櫸', '落葉', 330), ('朴樹', '落葉', 340), ('九芎', '落葉', 350), ('銀杏', '落葉', 360),
    ('榕樹', '常綠', 410), ('黃楊', '常綠', 420), ('七里香', '常綠', 430), ('春不老', '常綠', 440), ('雀梅', '常綠', 450)
  ),
  upd as (
    update public.species s set category = v.category, sort = v.sort
      from v where s.name = v.name and s.owner_id is null
    returning s.id
  )
insert into public.species (name, category, sort)
select v.name, v.category, v.sort from v
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

-- 分類適用的作業
insert into public.operation_types (name, category, sort)
select v.op, v.category, v.sort
  from (values
    ('雜木', '摘心', 300), ('雜木', '葉刈（剪葉）', 310),
    ('花果', '花後修剪', 320), ('花果', '摘果', 330)
  ) as v(category, op, sort)
 where not exists (
   select 1 from public.operation_types o
    where o.name = v.op and o.category = v.category and o.owner_id is null);

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

-- ============================================================
-- 試用期：邀請制（只有名單內的 Email 可以註冊，其他人按註冊會被擋下）
--   加人：insert into private.signup_allowlist (email) values ('someone@example.com');
--   正式開放註冊：drop trigger if exists bonsai_signup_allowlist on auth.users;
-- ============================================================
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.signup_allowlist (
  email      text primary key,
  note       text,
  created_at timestamptz not null default now()
);

create or replace function private.enforce_signup_allowlist() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from private.signup_allowlist a where lower(a.email) = lower(new.email)
  ) then
    raise exception 'signups not allowed for this email';
  end if;
  return new;
end $$;

drop trigger if exists bonsai_signup_allowlist on auth.users;
create trigger bonsai_signup_allowlist before insert on auth.users
  for each row execute function private.enforce_signup_allowlist();

-- ============================================================
-- 盆栽身分證、創作者、傳承與轉移
--   一盆盆栽的一生可能經過好幾位創作者（傳承、買賣、贈與）：
--   · 每盆盆栽有系統產生、終身不變的身分證 BJ-XXXX-XXXX
--   · 紀錄保留原作者（entries.owner_id），新主人看得到前人的紀錄與照片（唯讀）
--   · 轉移：原主人產生轉移碼 → 新主人輸入後接收，傳承紀錄（tree_custody）記下每一段時期
-- ============================================================

-- ---------- 身分證 ----------
-- 內部函式放在 private（不對外開放 API），由觸發器呼叫
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.gen_bonsai_uid() returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';  -- 去掉 I L O U，避免看錯
  c text;
begin
  loop
    c := '';
    for i in 1..8 loop
      c := c || substr(alphabet, 1 + (get_byte(extensions.gen_random_bytes(1), 0) % 32), 1);
    end loop;
    c := 'BJ-' || substr(c, 1, 4) || '-' || substr(c, 5, 4);
    exit when not exists (select 1 from public.trees where uid = c);
  end loop;
  return c;
end $$;

-- 新增時一律由系統產生，之後不可修改
create or replace function private.bonsai_uid_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.uid = private.gen_bonsai_uid();
  else
    new.uid = old.uid;
  end if;
  return new;
end $$;

alter table public.trees add column if not exists uid text;
alter table public.trees alter column uid drop default;
update public.trees set uid = private.gen_bonsai_uid() where uid is null;
alter table public.trees alter column uid set not null;
create unique index if not exists trees_uid_key on public.trees (uid);

drop trigger if exists trees_keep_uid on public.trees;
drop trigger if exists trees_uid_guard on public.trees;
create trigger trees_uid_guard before insert or update on public.trees
  for each row execute function private.bonsai_uid_guard();
drop function if exists public.keep_bonsai_uid();
drop function if exists public.gen_bonsai_uid();

-- ---------- 創作者名稱 ----------
create table if not exists public.profiles (
  user_id      uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  display_name text check (char_length(display_name) <= 40),
  updated_at   timestamptz not null default now()
);

-- ---------- 傳承紀錄：每一段時期的創作者 ----------
create table if not exists public.tree_custody (
  id         uuid primary key default gen_random_uuid(),
  tree_id    uuid not null references public.trees(id) on delete cascade,
  owner_id   uuid not null references auth.users(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at   timestamptz,
  note       text   -- 例：建立、購入、傳承、贈與
);
create index if not exists tree_custody_tree_idx  on public.tree_custody (tree_id, started_at);
create index if not exists tree_custody_owner_idx on public.tree_custody (owner_id);

-- 建立盆栽時自動記下第一段時期
create or replace function private.start_custody() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.tree_custody (tree_id, owner_id, started_at, note)
  values (new.id, new.owner_id, new.created_at, '建立');
  return new;
end $$;
drop trigger if exists trees_start_custody on public.trees;
create trigger trees_start_custody after insert on public.trees
  for each row execute function private.start_custody();
drop function if exists public.start_custody();

insert into public.tree_custody (tree_id, owner_id, started_at, note)
select t.id, t.owner_id, t.created_at, '建立'
  from public.trees t
 where not exists (select 1 from public.tree_custody c where c.tree_id = t.id);

-- ---------- 轉移碼 ----------
create table if not exists public.tree_transfers (
  id          uuid primary key default gen_random_uuid(),
  tree_id     uuid not null references public.trees(id) on delete cascade,
  from_owner  uuid not null references auth.users(id) on delete cascade,
  code        text not null unique,
  note        text,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '7 days',
  accepted_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  cancelled_at timestamptz
);
create index if not exists tree_transfers_tree_idx on public.tree_transfers (tree_id);
create index if not exists tree_transfers_from_idx on public.tree_transfers (from_owner);
create index if not exists tree_transfers_accepted_idx on public.tree_transfers (accepted_by);

-- 照片路徑索引：Storage 權限要用路徑反查照片屬於哪盆盆栽
create index if not exists photos_path_idx  on public.photos (path);
create index if not exists photos_thumb_idx on public.photos (thumb_path);

-- ---------- 總覽加上創作者人數 ----------
drop view if exists public.tree_overview;
create view public.tree_overview with (security_invoker = true) as
select
  t.*,
  s.name as species_name,
  s.category as species_category,
  (select count(*) from public.entries e where e.tree_id = t.id)          as entry_count,
  (select max(e.entry_date) from public.entries e where e.tree_id = t.id) as last_entry_date,
  (select p.thumb_path
     from public.photos p
     join public.entries e on e.id = p.entry_id
    where p.tree_id = t.id
    order by (p.angle = 'front') desc, e.entry_date desc, p.created_at desc
    limit 1)                                                               as cover_thumb,
  (select count(distinct c.owner_id) from public.tree_custody c where c.tree_id = t.id) as creator_count
from public.trees t
left join public.species s on s.id = t.species_id;
grant select on public.tree_overview to authenticated;

-- ============================================================
-- 權限（取代前面的 trees_own / entries_own / photos_own）
--   盆栽：目前的主人可讀寫；有其他創作者的紀錄時不能刪除（只能封存）
--   紀錄與照片：目前的主人看得到全部；只能新增／修改／刪除自己寫的
-- ============================================================
alter table public.profiles       enable row level security;
alter table public.tree_custody   enable row level security;
alter table public.tree_transfers enable row level security;

drop policy if exists trees_own    on public.trees;
drop policy if exists trees_read   on public.trees;
drop policy if exists trees_insert on public.trees;
drop policy if exists trees_update on public.trees;
drop policy if exists trees_delete on public.trees;
create policy trees_read on public.trees for select to authenticated
  using (owner_id = (select auth.uid()));
create policy trees_insert on public.trees for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and (species_id is null or exists (
      select 1 from public.species s
       where s.id = species_id and (s.owner_id is null or s.owner_id = (select auth.uid()))))
  );
create policy trees_update on public.trees for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and (species_id is null or exists (
      select 1 from public.species s
       where s.id = species_id and (s.owner_id is null or s.owner_id = (select auth.uid()))))
  );
-- 有其他創作者的紀錄就不能刪（用 security definer 函式判斷，避免和 entries 的權限互相引用造成遞迴）
create or replace function private.tree_has_other_authors(p_tree uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.entries e where e.tree_id = p_tree and e.owner_id <> auth.uid());
$$;
create policy trees_delete on public.trees for delete to authenticated
  using (owner_id = (select auth.uid()) and not private.tree_has_other_authors(id));
drop function if exists public.tree_has_other_authors(uuid);

drop policy if exists entries_own    on public.entries;
drop policy if exists entries_read   on public.entries;
drop policy if exists entries_insert on public.entries;
drop policy if exists entries_update on public.entries;
drop policy if exists entries_delete on public.entries;
create policy entries_read on public.entries for select to authenticated
  using (exists (select 1 from public.trees t where t.id = tree_id and t.owner_id = (select auth.uid())));
create policy entries_insert on public.entries for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and exists (select 1 from public.trees t where t.id = tree_id and t.owner_id = (select auth.uid()))
  );
create policy entries_update on public.entries for update to authenticated
  using (
    owner_id = (select auth.uid())
    and exists (select 1 from public.trees t where t.id = tree_id and t.owner_id = (select auth.uid()))
  )
  with check (
    owner_id = (select auth.uid())
    and exists (select 1 from public.trees t where t.id = tree_id and t.owner_id = (select auth.uid()))
  );
create policy entries_delete on public.entries for delete to authenticated
  using (
    owner_id = (select auth.uid())
    and exists (select 1 from public.trees t where t.id = tree_id and t.owner_id = (select auth.uid()))
  );

drop policy if exists photos_own    on public.photos;
drop policy if exists photos_read   on public.photos;
drop policy if exists photos_insert on public.photos;
drop policy if exists photos_update on public.photos;
drop policy if exists photos_delete on public.photos;
create policy photos_read on public.photos for select to authenticated
  using (exists (select 1 from public.trees t where t.id = tree_id and t.owner_id = (select auth.uid())));
create policy photos_insert on public.photos for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and exists (
      select 1 from public.entries e join public.trees t on t.id = e.tree_id
       where e.id = entry_id and e.tree_id = photos.tree_id
         and e.owner_id = (select auth.uid()) and t.owner_id = (select auth.uid()))
  );
create policy photos_update on public.photos for update to authenticated
  using (
    owner_id = (select auth.uid())
    and exists (select 1 from public.trees t where t.id = tree_id and t.owner_id = (select auth.uid()))
  )
  with check (owner_id = (select auth.uid()));
create policy photos_delete on public.photos for delete to authenticated
  using (
    owner_id = (select auth.uid())
    and exists (select 1 from public.trees t where t.id = tree_id and t.owner_id = (select auth.uid()))
  );

-- 創作者名稱：自己，以及自己盆栽的歷任創作者看得到
drop policy if exists profiles_read  on public.profiles;
drop policy if exists profiles_write on public.profiles;
drop policy if exists profiles_insert on public.profiles;
drop policy if exists profiles_update on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.tree_custody c join public.trees t on t.id = c.tree_id
       where c.owner_id = profiles.user_id and t.owner_id = (select auth.uid()))
  );
create policy profiles_insert on public.profiles for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy profiles_update on public.profiles for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- 傳承紀錄：目前的主人看得到整段歷史（只能由系統寫入）
drop policy if exists tree_custody_read on public.tree_custody;
create policy tree_custody_read on public.tree_custody for select to authenticated
  using (exists (select 1 from public.trees t where t.id = tree_id and t.owner_id = (select auth.uid())));

-- 轉移碼：只有發出的人看得到（建立、接收、取消都透過下面的函式）
drop policy if exists tree_transfers_read on public.tree_transfers;
create policy tree_transfers_read on public.tree_transfers for select to authenticated
  using (from_owner = (select auth.uid()));

grant select, insert, update on public.profiles to authenticated;
grant select on public.tree_custody, public.tree_transfers to authenticated;

-- Storage：自己資料夾的檔案，或屬於自己盆栽的照片（含前任創作者拍的）都看得到
drop policy if exists photos_bucket_select on storage.objects;
create policy photos_bucket_select on storage.objects for select to authenticated
  using (
    bucket_id = 'photos' and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or exists (
        select 1 from public.photos p join public.trees t on t.id = p.tree_id
         where (p.path = storage.objects.name or p.thumb_path = storage.objects.name)
           and t.owner_id = (select auth.uid()))
    )
  );

-- 已經轉移給別人的照片檔，原作者不能再刪除或覆蓋，保住新主人手上的傳承紀錄
create or replace function private.photo_file_locked(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.photos p join public.trees t on t.id = p.tree_id
     where (p.path = p_name or p.thumb_path = p_name) and t.owner_id <> auth.uid());
$$;
drop policy if exists photos_bucket_update on storage.objects;
drop policy if exists photos_bucket_delete on storage.objects;
create policy photos_bucket_update on storage.objects for update to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text
         and not private.photo_file_locked(name))
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy photos_bucket_delete on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text
         and not private.photo_file_locked(name));

-- ============================================================
-- 轉移函式
-- ============================================================
-- 產生轉移碼（同一盆盆栽之前沒用掉的轉移碼會作廢）
create or replace function public.create_transfer(p_tree uuid, p_note text default null) returns text
language plpgsql security definer set search_path = '' as $$
declare
  me constant uuid := auth.uid();
  alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  c text;
begin
  if me is null or not exists (select 1 from public.trees where id = p_tree and owner_id = me) then
    raise exception '只能轉移自己名下的盆栽';
  end if;
  update public.tree_transfers set cancelled_at = now()
   where tree_id = p_tree and accepted_at is null and cancelled_at is null;
  loop
    c := '';
    for i in 1..8 loop
      c := c || substr(alphabet, 1 + (get_byte(extensions.gen_random_bytes(1), 0) % length(alphabet)), 1);
    end loop;
    c := substr(c, 1, 4) || '-' || substr(c, 5, 4);
    exit when not exists (select 1 from public.tree_transfers where code = c);
  end loop;
  insert into public.tree_transfers (tree_id, from_owner, code, note)
  values (p_tree, me, c, nullif(trim(p_note), ''));
  return c;
end $$;

-- 作廢轉移碼
create or replace function public.cancel_transfer(p_tree uuid) returns void
language sql security definer set search_path = '' as $$
  update public.tree_transfers set cancelled_at = now()
   where tree_id = p_tree and from_owner = auth.uid() and accepted_at is null and cancelled_at is null;
$$;

-- 接收前預覽：輸入轉移碼後先看是哪一盆
create or replace function public.preview_transfer(p_code text) returns json
language sql stable security definer set search_path = '' as $$
  select json_build_object(
    'uid', t.uid, 'name', coalesce(nullif(trim(t.name), ''), s.name, '未命名盆栽'), 'species', s.name,
    'entries', (select count(*) from public.entries e where e.tree_id = t.id),
    'from', coalesce(nullif(trim(p.display_name), ''), '未命名創作者'),
    'note', tr.note, 'expires_at', tr.expires_at)
  from public.tree_transfers tr
  join public.trees t on t.id = tr.tree_id and t.owner_id = tr.from_owner
  left join public.species s on s.id = t.species_id
  left join public.profiles p on p.user_id = tr.from_owner
  where tr.code = upper(trim(p_code))
    and tr.accepted_at is null and tr.cancelled_at is null and tr.expires_at > now()
    and tr.from_owner <> auth.uid();
$$;

-- 接收：盆栽改到自己名下，傳承紀錄開始新的一段
create or replace function public.accept_transfer(p_code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me constant uuid := auth.uid();
  tr public.tree_transfers;
  sp public.species;
  new_sp uuid;
begin
  if me is null then raise exception '請先登入'; end if;
  select * into tr from public.tree_transfers
   where code = upper(trim(p_code)) and accepted_at is null and cancelled_at is null and expires_at > now()
   for update;
  if not found then raise exception '轉移碼無效或已過期'; end if;
  if tr.from_owner = me then raise exception '不能轉移給自己'; end if;
  if not exists (select 1 from public.trees where id = tr.tree_id and owner_id = tr.from_owner) then
    raise exception '這盆盆栽已經不在原創作者名下';
  end if;

  -- 原主人的自訂樹種，新主人看不到：複製一份到新主人名下
  select s.* into sp from public.trees t join public.species s on s.id = t.species_id where t.id = tr.tree_id;
  if found and sp.owner_id is not null then
    select id into new_sp from public.species where owner_id = me and name = sp.name limit 1;
    if new_sp is null then
      insert into public.species (name, category, owner_id, sort)
      values (sp.name, sp.category, me, sp.sort) returning id into new_sp;
    end if;
    update public.trees set species_id = new_sp where id = tr.tree_id;
  end if;

  update public.trees set owner_id = me, status = 'active' where id = tr.tree_id;
  update public.tree_custody set ended_at = now() where tree_id = tr.tree_id and ended_at is null;
  insert into public.tree_custody (tree_id, owner_id, note) values (tr.tree_id, me, coalesce(tr.note, '接收'));
  update public.tree_transfers set accepted_by = me, accepted_at = now() where id = tr.id;
  return tr.tree_id;
end $$;

revoke execute on function public.create_transfer(uuid, text), public.cancel_transfer(uuid),
  public.preview_transfer(text), public.accept_transfer(text) from public, anon;
grant execute on function public.create_transfer(uuid, text), public.cancel_transfer(uuid),
  public.preview_transfer(text), public.accept_transfer(text) to authenticated;

-- ============================================================
-- 問題反饋：使用者回報問題、提供建議；開發端（管理員）讀取、分析、回覆
--   · 使用者只能新增自己的反饋、看自己的反饋狀態與回覆（看不到內部分析）
--   · 管理員透過 admin_feedback_list／admin_feedback_update 看全部、改狀態、回覆
--   · 分析（analysis）由開發端直接寫入資料庫
--   加管理員（SQL Editor）：insert into private.app_admins (email) values ('你的 email');
-- ============================================================
create table if not exists private.app_admins (
  email      text primary key,
  created_at timestamptz not null default now()
);

create or replace function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from private.app_admins a join auth.users u on lower(u.email) = lower(a.email)
     where u.id = auth.uid());
$$;

create table if not exists public.feedback (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind            text not null check (kind in ('bug', 'idea', 'other')),  -- 問題回報／優化建議／其他
  message         text not null check (char_length(message) between 1 and 4000),
  screenshot_path text,          -- feedback bucket：{user_id}/{feedback_id}.jpg
  app_version     text,
  platform        text,          -- web／pwa／android 1.0.x
  user_agent      text,
  screen          text,
  page            text,          -- 回報前所在的頁面
  status          text not null default 'new' check (status in ('new', 'reviewing', 'planned', 'done', 'declined')),
  reply           text,          -- 給使用者看的回覆
  analysis        jsonb,         -- 內部分析：summary, category, impact, effort, priority, recommendation, reasoning, next_step
  analyzed_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists feedback_user_idx   on public.feedback (user_id, created_at desc);
create index if not exists feedback_status_idx on public.feedback (status, created_at desc);

drop trigger if exists feedback_touch on public.feedback;
create trigger feedback_touch before update on public.feedback
  for each row execute function public.touch_updated_at();

alter table public.feedback enable row level security;
drop policy if exists feedback_insert on public.feedback;
drop policy if exists feedback_read   on public.feedback;
create policy feedback_insert on public.feedback for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (screenshot_path is null or screenshot_path like (select auth.uid())::text || '/%')
  );
create policy feedback_read on public.feedback for select to authenticated
  using (user_id = (select auth.uid()));

-- 欄位權限：使用者不能自己設定狀態、回覆，也讀不到內部分析
revoke all on public.feedback from anon, authenticated;
grant insert (id, kind, message, screenshot_path, app_version, platform, user_agent, screen, page)
  on public.feedback to authenticated;
grant select (id, user_id, kind, message, screenshot_path, app_version, platform, status, reply, created_at, updated_at)
  on public.feedback to authenticated;

-- 截圖：私人 bucket，自己的資料夾可以上傳、讀取、刪除；管理員讀得到全部
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('feedback', 'feedback', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists feedback_bucket_select on storage.objects;
drop policy if exists feedback_bucket_insert on storage.objects;
drop policy if exists feedback_bucket_delete on storage.objects;
create policy feedback_bucket_select on storage.objects for select to authenticated
  using (bucket_id = 'feedback' and ((storage.foldername(name))[1] = (select auth.uid())::text or private.is_admin()));
create policy feedback_bucket_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'feedback' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy feedback_bucket_delete on storage.objects for delete to authenticated
  using (bucket_id = 'feedback' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- 管理員：我是不是管理員、看全部反饋（含分析與回報者）、改狀態與回覆
create or replace function public.am_i_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_admin();
$$;

create or replace function public.admin_feedback_list() returns setof json
language sql stable security definer set search_path = '' as $$
  select json_build_object(
    'id', f.id, 'kind', f.kind, 'message', f.message, 'screenshot_path', f.screenshot_path,
    'app_version', f.app_version, 'platform', f.platform, 'user_agent', f.user_agent,
    'screen', f.screen, 'page', f.page, 'status', f.status, 'reply', f.reply,
    'analysis', f.analysis, 'analyzed_at', f.analyzed_at, 'created_at', f.created_at,
    'email', u.email, 'name', p.display_name)
  from public.feedback f
  join auth.users u on u.id = f.user_id
  left join public.profiles p on p.user_id = f.user_id
  where private.is_admin()
  order by f.created_at desc;
$$;

create or replace function public.admin_feedback_update(p_id uuid, p_status text, p_reply text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then raise exception '沒有權限'; end if;
  update public.feedback set status = p_status, reply = nullif(trim(p_reply), '') where id = p_id;
  if not found then raise exception '找不到這筆反饋'; end if;
end $$;

revoke execute on function public.am_i_admin(), public.admin_feedback_list(),
  public.admin_feedback_update(uuid, text, text) from public, anon;
grant execute on function public.am_i_admin(), public.admin_feedback_list(),
  public.admin_feedback_update(uuid, text, text) to authenticated;

-- ============================================================
-- 提醒：紀錄裡的「下次預計」到期提醒
--   · next_date 是寫紀錄時的計畫，屬於紀錄內容（前任創作者的紀錄唯讀）
--   · 完成（next_done_at）、延後（next_snoozed_to）是目前主人的處理狀態，一律透過 set_reminder 設定
--     → 接收別人轉來的盆栽，前任留下的提醒也能完成或延後，但不會改到前任寫的內容
--   · 作者改了預計日期就當作新的計畫，完成與延後都清掉，重新提醒
-- ============================================================
alter table public.entries add column if not exists next_done_at    timestamptz;  -- 完成時間（空白＝還沒完成）
alter table public.entries add column if not exists next_snoozed_to date;         -- 延後到哪一天（空白＝照原訂日期）

create index if not exists entries_open_reminder_idx on public.entries (tree_id)
  where next_date is not null and next_done_at is null;

create or replace function private.entries_reminder_reset() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.next_date is distinct from old.next_date then
    new.next_done_at = null;
    new.next_snoozed_to = null;
  end if;
  return new;
end $$;
drop trigger if exists entries_reminder_reset on public.entries;
create trigger entries_reminder_reset before update on public.entries
  for each row execute function private.entries_reminder_reset();

-- 完成／復原／延後：盆栽目前的主人才能設定
--   完成 set_reminder(id, true)（延後日保留）；復原 set_reminder(id, false, 原本的延後日)；延後 set_reminder(id, false, '2026-10-01')
create or replace function public.set_reminder(p_entry uuid, p_done boolean, p_snooze date default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.entries e
     set next_done_at    = case when p_done then coalesce(e.next_done_at, now()) end,
         next_snoozed_to = case when p_done then e.next_snoozed_to else p_snooze end
   where e.id = p_entry
     and e.next_date is not null
     and exists (select 1 from public.trees t where t.id = e.tree_id and t.owner_id = auth.uid());
  if not found then raise exception '找不到這個提醒'; end if;
end $$;
revoke execute on function public.set_reminder(uuid, boolean, date) from public, anon;
grant execute on function public.set_reminder(uuid, boolean, date) to authenticated;

-- ---------- 總覽加上最近的提醒日期、未完成提醒數 ----------
drop view if exists public.tree_overview;
create view public.tree_overview with (security_invoker = true) as
select
  t.*,
  s.name as species_name,
  s.category as species_category,
  (select count(*) from public.entries e where e.tree_id = t.id)          as entry_count,
  (select max(e.entry_date) from public.entries e where e.tree_id = t.id) as last_entry_date,
  (select p.thumb_path
     from public.photos p
     join public.entries e on e.id = p.entry_id
    where p.tree_id = t.id
    order by (p.angle = 'front') desc, e.entry_date desc, p.created_at desc
    limit 1)                                                               as cover_thumb,
  (select count(distinct c.owner_id) from public.tree_custody c where c.tree_id = t.id) as creator_count,
  (select min(coalesce(e.next_snoozed_to, e.next_date)) from public.entries e
    where e.tree_id = t.id and e.next_date is not null and e.next_done_at is null) as next_due,
  (select count(*) from public.entries e
    where e.tree_id = t.id and e.next_date is not null and e.next_done_at is null) as open_reminders
from public.trees t
left join public.species s on s.id = t.species_id;
grant select on public.tree_overview to authenticated;

revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function private.tree_has_other_authors(uuid), private.photo_file_locked(text) to authenticated;
grant execute on function private.is_admin() to authenticated;
