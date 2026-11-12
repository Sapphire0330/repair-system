-- =====================================================================
-- 報修登記系統：Supabase 資料表與存取規則
-- ---------------------------------------------------------------------
-- 用途：建立 repair_requests 資料表，並以三層機制限制存取：
--   1. GRANT：資料表層級權限（anon 只能讀取與新增指定欄位）
--   2. RLS ：資料列安全（任何人可讀；新增時狀態只能是「待處理」）
--   3. CHECK：欄位值與文字長度限制
-- 本示範規則：任何人可以新增、讀取清單，不能修改或刪除。
-- 執行方式：在 Supabase 的 SQL Editor 貼上整份檔案後執行。
-- 注意：本檔案尚未在任何資料庫上執行或測試過。
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 建立資料表與 CHECK 限制
-- ---------------------------------------------------------------------
-- id 與 created_at 由資料庫自動產生，前端不需要也不能填寫。
-- 文字長度上限（姓名 50、地點 100、說明 1000 字）是本設計暫定值，
-- 需求筆記並未規定，請確認後再調整。
-- btrim() 去除前後空白後才計算長度，避免只填空白字元就通過。
create table if not exists public.repair_requests (
  -- 主鍵：系統自動產生的 UUID
  id            uuid        primary key default gen_random_uuid(),

  -- 登記時間：系統自動產生，含時區
  created_at    timestamptz not null default now(),

  -- 報修人姓名：必填，1～50 字
  reporter_name text        not null
    constraint repair_requests_reporter_name_len
      check (char_length(btrim(reporter_name)) between 1 and 50),

  -- 地點或部門：必填，1～100 字
  location      text        not null
    constraint repair_requests_location_len
      check (char_length(btrim(location)) between 1 and 100),

  -- 類別：只能是 設備／網路／環境／其他
  category      text        not null
    constraint repair_requests_category_valid
      check (category in ('設備', '網路', '環境', '其他')),

  -- 問題說明：必填，1～1000 字
  description   text        not null
    constraint repair_requests_description_len
      check (char_length(btrim(description)) between 1 and 1000),

  -- 緊急程度：只能是 低／中／高，預設「中」
  urgency       text        not null default '中'
    constraint repair_requests_urgency_valid
      check (urgency in ('低', '中', '高')),

  -- 處理狀態：只能是 待處理／處理中／已完成，預設「待處理」
  status        text        not null default '待處理'
    constraint repair_requests_status_valid
      check (status in ('待處理', '處理中', '已完成'))
);

comment on table  public.repair_requests               is '報修登記資料（示範用，內容應為虛構資料）';
comment on column public.repair_requests.id            is '主鍵，系統自動產生';
comment on column public.repair_requests.created_at    is '登記時間，系統自動產生';
comment on column public.repair_requests.reporter_name is '報修人姓名';
comment on column public.repair_requests.location      is '地點或部門';
comment on column public.repair_requests.category      is '類別：設備、網路、環境、其他';
comment on column public.repair_requests.description   is '問題說明';
comment on column public.repair_requests.urgency       is '緊急程度：低、中、高（預設中）';
comment on column public.repair_requests.status        is '處理狀態：待處理、處理中、已完成（預設待處理）';

-- 清單依登記時間由新到舊排序時使用的索引
create index if not exists repair_requests_created_at_idx
  on public.repair_requests (created_at desc);

-- ---------------------------------------------------------------------
-- 第 1 層：GRANT 資料表權限
-- ---------------------------------------------------------------------
-- 先收回所有角色既有的權限，確保從「全部禁止」開始，
-- 包括已登入角色 authenticated（本示範不做登入，不開放給它）。
revoke all on table public.repair_requests from public, anon, authenticated;

-- anon 需要能使用 public schema 才能存取其中的資料表。
grant usage on schema public to anon;

-- 讀取：anon 可以讀取所有欄位，用來顯示清單。
grant select on table public.repair_requests to anon;

-- 新增：只開放表單需要填寫的五個欄位。
-- id、created_at、status 不開放，一律使用資料庫預設值，
-- 因此前端無法自訂登記時間，也無法直接送出非「待處理」的狀態。
grant insert (reporter_name, location, category, description, urgency)
  on table public.repair_requests to anon;

-- 不授予 update、delete、truncate、references、trigger：
-- anon 無法修改或刪除任何資料。

-- ---------------------------------------------------------------------
-- 第 2 層：RLS 資料列安全
-- ---------------------------------------------------------------------
-- 啟用 RLS 後，沒有對應 policy 的操作一律被拒絕。
alter table public.repair_requests enable row level security;

-- 重新執行本檔時先移除舊的同名規則，避免重複建立失敗。
drop policy if exists "任何人可讀取報修清單" on public.repair_requests;
drop policy if exists "任何人可新增待處理的報修" on public.repair_requests;

-- 讀取規則：任何人（anon）都可以讀取全部報修資料。
create policy "任何人可讀取報修清單"
  on public.repair_requests
  for select
  to anon
  using (true);

-- 新增規則：任何人（anon）都可以新增，但狀態必須是「待處理」。
-- 即使日後有人誤把 status 欄位的 insert 權限開放出去，這條規則仍會擋下。
create policy "任何人可新增待處理的報修"
  on public.repair_requests
  for insert
  to anon
  with check (status = '待處理');

-- 沒有建立 update、delete 規則：在 RLS 下這兩種操作一律被拒絕。

commit;
