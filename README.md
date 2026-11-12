# 報修登記系統
提供報修新增表單與全部報修清單，方便登記及查看設備、網路、環境等問題。
雲端任務測試
- [報修欄位表（Excel）](文件/報修欄位表.xlsx)

## 網頁前端
- 檔案：`index.html`、`style.css`、`app.js`、`config.js`（純 HTML/CSS/JavaScript，以 CDN 載入 supabase-js v2）。
- 資料表與存取規則：`supabase/schema.sql`，需先在 Supabase 執行才能新增與讀取資料。
- `config.js` 只放 Supabase 網址與 publishable key（公開金鑰），不得放 secret 金鑰。
- 發佈網址（GitHub Pages）：https://sapphire0330.github.io/repair-system/

本機預覽（在儲存庫根目錄執行，再用瀏覽器開 http://localhost:8000/ ）：

```bash
python3 -m http.server 8000
```

## 新報修 Email 通知
`repair_requests` 每新增一筆，Supabase 會呼叫 Edge Function `notify-repair`，透過 [Resend](https://resend.com) 寄出標題為「報修測試」的純文字通知信。

程式：`supabase/functions/notify-repair/index.ts`。收件信箱與所有金鑰都存在 Supabase 的 Secrets，**不寫進儲存庫**。

設定步驟（都在網頁上操作）：
1. **Resend**：用要收通知的信箱註冊 Resend，建立一把 API Key。
   未驗證自有網域前，Resend 只能從 `onboarding@resend.dev` 寄信給註冊帳號本人的信箱。
2. **Supabase → Edge Functions → Secrets**，新增：
   - `RESEND_API_KEY`：上一步的 API Key
   - `NOTIFY_EMAIL`：收通知的信箱
   - `WEBHOOK_SECRET`：自己產生的一長串隨機文字（例如 32 個以上英數字）
   - `MAIL_FROM`（選填）：驗證自有網域後的寄件人，例如 `報修系統 <notify@你的網域>`
3. **Supabase → Edge Functions → Deploy a new function → Via Editor**：
   函式名稱填 `notify-repair`，貼上 `index.ts` 的內容。
   部署後到函式的 Details，**關閉「Enforce JWT verification」**（改由 `WEBHOOK_SECRET` 驗證）。
4. **Supabase → Database → Webhooks → Create a new hook**：
   - Table：`repair_requests`；Events：只勾 `Insert`
   - Type：`Supabase Edge Functions`；Function：`notify-repair`；Method：`POST`
   - HTTP Headers 新增：`x-webhook-secret` = 第 2 步的 `WEBHOOK_SECRET`
5. 從網頁送出一筆報修，確認收到信；沒收到時到 Edge Functions → `notify-repair` → Logs 查看錯誤。
