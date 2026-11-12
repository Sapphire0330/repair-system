// Supabase Edge Function：notify-repair
// repair_requests 新增資料時，由 Database Webhook 呼叫，用 LINE Messaging API 推播通知，
// 訊息第一行固定為「【報修測試】」。
// 所需設定（在 Supabase 的 Edge Functions → Secrets 設定，不要寫進程式碼）：
//   LINE_CHANNEL_ACCESS_TOKEN、LINE_USER_ID、WEBHOOK_SECRET
// 處理邏輯寫成 createHandler，設定與 fetch 由外部傳入，方便在本機測試。

export const TITLE = "【報修測試】"; // 通知訊息標題一律固定
const LINE_PUSH_URL = "https://api.line.me/v2/bot/message/push";
const MAX_TEXT = 5000; // LINE 文字訊息上限

export interface NotifyEnv {
  LINE_CHANNEL_ACCESS_TOKEN?: string; // LINE 頻道存取權杖（機密，只存在 Supabase Secrets）
  LINE_USER_ID?: string; // 收通知的 LINE 使用者 ID（U 開頭，存在 Supabase Secrets）
  WEBHOOK_SECRET?: string; // Webhook 共用密碼，防止外人直接呼叫這個函式
}

export interface RepairRecord {
  id?: string;
  created_at?: string;
  reporter_name?: string;
  location?: string;
  category?: string;
  description?: string;
  urgency?: string;
  status?: string;
}

// 固定時間比較，避免從回應時間猜出密碼
function safeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  }
  return diff === 0;
}

function formatTime(iso?: string): string {
  if (!iso) return "（未提供）";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d) + "（台灣時間）";
}

// 組出 LINE 文字訊息（純文字，超過上限時截斷）
export function buildMessageText(r: RepairRecord): string {
  const text = [
    TITLE,
    "有一筆新的報修：",
    "",
    `報修人：${r.reporter_name ?? ""}`,
    `地點或部門：${r.location ?? ""}`,
    `類別：${r.category ?? ""}`,
    `緊急程度：${r.urgency ?? ""}`,
    `處理狀態：${r.status ?? ""}`,
    `登記時間：${formatTime(r.created_at)}`,
    "",
    "問題說明：",
    r.description ?? "",
  ].join("\n");
  const chars = Array.from(text);
  return chars.length > MAX_TEXT ? chars.slice(0, MAX_TEXT - 1).join("") + "…" : text;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export function createHandler(env: NotifyEnv, fetchFn: typeof fetch = fetch) {
  return async (req: Request): Promise<Response> => {
    if (req.method !== "POST") return json(405, { error: "method not allowed" });

    // 1. 檢查 Webhook 密碼：沒設定或不符都拒絕
    const provided = req.headers.get("x-webhook-secret") ?? "";
    if (!env.WEBHOOK_SECRET || !safeEqual(provided, env.WEBHOOK_SECRET)) {
      return json(401, { error: "unauthorized" });
    }

    // 2. 檢查必要設定
    if (!env.LINE_CHANNEL_ACCESS_TOKEN || !env.LINE_USER_ID) {
      console.error("缺少 LINE_CHANNEL_ACCESS_TOKEN 或 LINE_USER_ID 設定");
      return json(500, { error: "missing configuration" });
    }

    // 3. 解析 Webhook 內容，只處理 repair_requests 的新增
    let payload: { type?: string; table?: string; record?: RepairRecord };
    try {
      payload = await req.json();
    } catch {
      return json(400, { error: "invalid json" });
    }
    if (payload.type !== "INSERT" || payload.table !== "repair_requests" || !payload.record) {
      return json(200, { skipped: true });
    }

    // 4. 呼叫 LINE 推播
    const headers: Record<string, string> = {
      "authorization": `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`,
      "content-type": "application/json",
    };
    // 用報修編號當重試鍵：Webhook 重送同一筆時，LINE 不會重複推播
    const id = payload.record.id ?? "";
    if (UUID_RE.test(id)) headers["x-line-retry-key"] = id;

    const res = await fetchFn(LINE_PUSH_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({
        to: env.LINE_USER_ID,
        messages: [{ type: "text", text: buildMessageText(payload.record) }],
      }),
    });

    // 409 代表同一個重試鍵已經推播過，視為成功
    if (res.status === 409) return json(200, { sent: true, duplicate: true });
    if (!res.ok) {
      // 只記錄狀態碼與錯誤內容，不記錄權杖
      console.error("LINE 推播失敗", res.status, await res.text());
      return json(502, { error: "send failed" });
    }
    return json(200, { sent: true });
  };
}

// 啟動 Edge Function
Deno.serve(
  createHandler({
    LINE_CHANNEL_ACCESS_TOKEN: Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN"),
    LINE_USER_ID: Deno.env.get("LINE_USER_ID"),
    WEBHOOK_SECRET: Deno.env.get("WEBHOOK_SECRET"),
  }),
);
