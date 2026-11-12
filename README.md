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

## 新報修 LINE 通知
`repair_requests` 每新增一筆，Supabase 會呼叫 Edge Function `notify-repair`，透過 LINE Messaging API 推播一則文字訊息給指定的 LINE 使用者，第一行固定為「【報修測試】」。

程式：`supabase/functions/notify-repair/index.ts`。LINE 權杖、使用者 ID 與 Webhook 密碼都存在 Supabase 的 Secrets，**不寫進儲存庫**。

LINE Notify 已於 2025 年 3 月停止服務，因此改用 LINE 官方帳號的 Messaging API。免費方案每月推播則數有上限。

設定步驟（都在網頁上操作）：
1. **LINE 官方帳號與 Messaging API**：在 [LINE Developers](https://developers.line.biz/console/) 建立 Provider 與 Messaging API Channel（過程中會建立 LINE 官方帳號，並在 LINE Official Account Manager 啟用 Messaging API）。
2. **取得兩個值**：
   - Channel 的 Basic settings 頁面最下方的 **Your user ID**（`U` 開頭）
   - Messaging API 頁面最下方的 **Channel access token (long-lived)**，按 Issue 產生
3. **加好友**：用手機 LINE 掃 Messaging API 頁面上的 QR code，把官方帳號加為好友，否則收不到推播。
4. **Supabase → Edge Functions → Secrets**，新增：
   - `LINE_CHANNEL_ACCESS_TOKEN`：第 2 步的 Channel access token
   - `LINE_USER_ID`：第 2 步的 Your user ID
   - `WEBHOOK_SECRET`：自己產生的一長串隨機文字（例如 32 個以上英數字）
5. **Supabase → Edge Functions → Deploy a new function → Via Editor**：
   函式名稱填 `notify-repair`，貼上 `index.ts` 的內容。
   部署後到函式的 Details，**關閉「Enforce JWT verification」**（改由 `WEBHOOK_SECRET` 驗證）。
6. **Supabase → Database → Webhooks → Create a new hook**：
   - Table：`repair_requests`；Events：只勾 `Insert`
   - Type：`Supabase Edge Functions`；Function：`notify-repair`；Method：`POST`
   - HTTP Headers 新增：`x-webhook-secret` = 第 4 步的 `WEBHOOK_SECRET`
7. 從網頁送出一筆報修，確認 LINE 收到訊息；沒收到時到 Edge Functions → `notify-repair` → Logs 查看錯誤。
