// Supabase 連線設定
// 這裡只能放「公開」的 publishable key；它本來就會出現在瀏覽器中，可以上傳。
// 絕對不要放 secret 金鑰或 service-role 金鑰。
// 資料的安全由資料庫的權限（GRANT）與資料列安全（RLS）把關，見 supabase/schema.sql。
window.APP_CONFIG = {
  SUPABASE_URL: "https://tvmiaxrwqdtengukdxgj.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_2SgLgDAOD92cvLPaflI9lw_ianGeoCR",
};
