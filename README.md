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
