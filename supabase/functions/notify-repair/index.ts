// Supabase Edge Function：notify-repair
// repair_requests 新增資料時，由 Database Webhook 呼叫，用 Resend 寄出標題為「報修測試」的通知信。
// 所需設定（在 Supabase 的 Edge Functions → Secrets 設定，不要寫進程式碼）：
//   RESEND_API_KEY、NOTIFY_EMAIL、WEBHOOK_SECRET，選填 MAIL_FROM
// 處理邏輯寫成 createHandler，設定與 fetch 由外部傳入，方便在本機測試。

export const SUBJECT = "報修測試"; // 通知信標題一律固定

export interface NotifyEnv {
  RESEND_API_KEY?: string; // Resend 的 API 金鑰（機密，只存在 Supabase Secrets）
  NOTIFY_EMAIL?: string; // 收件信箱（存在 Supabase Secrets，不寫進程式碼）
  WEBHOOK_SECRET?: string; // Webhook 共用密碼，防止外人直接呼叫這個函式
  MAIL_FROM?: string; // 寄件人，未設定時使用 Resend 的測試寄件地址
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

// 只寄純文字信，使用者輸入的內容不會被當成 HTML 解讀
export function buildEmailText(r: RepairRecord): string {
  return [
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
    "",
    `編號：${r.id ?? ""}`,
    "",
    "（此信由報修登記系統自動寄出）",
  ].join("\n");
}

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
    if (!env.RESEND_API_KEY || !env.NOTIFY_EMAIL) {
      console.error("缺少 RESEND_API_KEY 或 NOTIFY_EMAIL 設定");
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

    // 4. 呼叫 Resend 寄信
    const res = await fetchFn("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "authorization": `Bearer ${env.RESEND_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: env.MAIL_FROM || "報修系統 <onboarding@resend.dev>",
        to: [env.NOTIFY_EMAIL],
        subject: SUBJECT,
        text: buildEmailText(payload.record),
      }),
    });

    if (!res.ok) {
      // 只記錄狀態碼與錯誤內容，不記錄金鑰
      console.error("寄信失敗", res.status, await res.text());
      return json(502, { error: "send failed" });
    }
    return json(200, { sent: true });
  };
}

// 啟動 Edge Function
Deno.serve(
  createHandler({
    RESEND_API_KEY: Deno.env.get("RESEND_API_KEY"),
    NOTIFY_EMAIL: Deno.env.get("NOTIFY_EMAIL"),
    WEBHOOK_SECRET: Deno.env.get("WEBHOOK_SECRET"),
    MAIL_FROM: Deno.env.get("MAIL_FROM"),
  }),
);
