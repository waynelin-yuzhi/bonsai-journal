// ============================================================
// 在這裡填入 Supabase 專案資訊（後台 → Project Settings → API）
//   SUPABASE_URL：形如 https://abcdwxyz.supabase.co
//   SUPABASE_ANON_KEY：Publishable key（sb_publishable_…）或舊版 anon key
//   這把 key 可以公開，資料安全由資料庫的 RLS 權限規則把關。
// ============================================================
export const SUPABASE_URL = "https://YOUR-PROJECT.supabase.co";
export const SUPABASE_ANON_KEY = "YOUR-ANON-KEY";

export const isConfigured = () =>
  SUPABASE_URL.startsWith("https://") &&
  !SUPABASE_URL.includes("YOUR-PROJECT") &&
  SUPABASE_ANON_KEY.length > 20 &&
  !SUPABASE_ANON_KEY.includes("YOUR-ANON-KEY");
