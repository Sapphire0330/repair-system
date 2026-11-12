// 報修登記：送出表單新增到 repair_requests，並顯示最近 20 筆。
// 只送出表單的五個欄位；id、created_at、status 由資料庫預設值產生。
(function () {
  "use strict";

  var TABLE = "repair_requests";
  var LIST_LIMIT = 20;
  var CATEGORIES = ["設備", "網路", "環境", "其他"];
  var URGENCIES = ["低", "中", "高"];
  // 與 supabase/schema.sql 的 CHECK 限制一致
  var MAX_LEN = { reporter_name: 50, location: 100, description: 1000 };
  var LABELS = {
    reporter_name: "報修人",
    location: "地點或部門",
    category: "類別",
    description: "問題說明",
    urgency: "緊急程度",
  };

  var form = document.getElementById("repair-form");
  var submitButton = document.getElementById("submit-button");
  var formMessage = document.getElementById("form-message");
  var listMessage = document.getElementById("list-message");
  var list = document.getElementById("request-list");
  var refreshButton = document.getElementById("refresh-button");
  var descCount = document.getElementById("description-count");

  var client = createClient();

  function createClient() {
    var cfg = window.APP_CONFIG || {};
    if (!window.supabase || typeof window.supabase.createClient !== "function") {
      return null;
    }
    if (!cfg.SUPABASE_URL || !cfg.SUPABASE_PUBLISHABLE_KEY) {
      return null;
    }
    return window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  // ---------- 訊息 ----------
  function showMessage(el, type, text) {
    el.className = "message " + type;
    el.textContent = text;
    el.hidden = false;
  }
  function hideMessage(el) {
    el.hidden = true;
    el.textContent = "";
  }

  // 把 Supabase 回傳的錯誤轉成看得懂的中文
  function describeError(error) {
    if (!error) return "發生未知錯誤，請稍後再試。";
    var code = error.code || "";
    var msg = (error.message || "").toLowerCase();
    if (code === "42501") return "沒有權限執行這個操作，請聯絡管理員確認資料庫權限設定。";
    if (code === "23514") return "資料不符合規定（例如選項不正確或文字太長），請檢查後再送出。";
    if (code === "23502") return "有必填欄位沒有填寫。";
    if (code === "42P01" || code === "PGRST205") return "找不到報修資料表，請確認資料庫已建立 repair_requests。";
    if (msg.indexOf("failed to fetch") !== -1 || msg.indexOf("network") !== -1) {
      return "無法連線到伺服器，請檢查網路後再試。";
    }
    return "發生錯誤：" + (error.message || code || "未知原因");
  }

  // ---------- 表單驗證 ----------
  function clearFieldErrors() {
    form.querySelectorAll(".field-error").forEach(function (el) { el.remove(); });
    form.querySelectorAll("[aria-invalid]").forEach(function (el) {
      el.removeAttribute("aria-invalid");
      el.removeAttribute("aria-describedby");
    });
  }

  function setFieldError(name, text) {
    var target = form.elements[name];
    var isRadio = target instanceof RadioNodeList;
    var container = isRadio ? target[0].closest("fieldset") : target.closest(".field");
    // 單選題把錯誤標在 fieldset 上，文字欄位標在輸入框上
    var holder = isRadio ? container : target;
    var id = "error-" + name;
    var p = document.createElement("p");
    p.className = "field-error";
    p.id = id;
    p.textContent = text;
    container.appendChild(p);
    holder.setAttribute("aria-invalid", "true");
    holder.setAttribute("aria-describedby", id);
  }

  function readForm() {
    var data = new FormData(form);
    return {
      reporter_name: String(data.get("reporter_name") || "").trim(),
      location: String(data.get("location") || "").trim(),
      category: String(data.get("category") || ""),
      description: String(data.get("description") || "").trim(),
      urgency: String(data.get("urgency") || ""),
    };
  }

  function validate(values) {
    var errors = [];
    ["reporter_name", "location", "description"].forEach(function (key) {
      var len = Array.from(values[key]).length;
      if (len === 0) {
        errors.push([key, "請填寫" + LABELS[key] + "。"]);
      } else if (len > MAX_LEN[key]) {
        errors.push([key, LABELS[key] + "最多 " + MAX_LEN[key] + " 字，目前 " + len + " 字。"]);
      }
    });
    if (CATEGORIES.indexOf(values.category) === -1) {
      errors.push(["category", "請選擇類別。"]);
    }
    if (URGENCIES.indexOf(values.urgency) === -1) {
      errors.push(["urgency", "請選擇緊急程度。"]);
    }
    return errors;
  }

  // ---------- 送出 ----------
  async function handleSubmit(event) {
    event.preventDefault();
    hideMessage(formMessage);
    clearFieldErrors();

    var values = readForm();
    var errors = validate(values);
    if (errors.length) {
      errors.forEach(function (e) { setFieldError(e[0], e[1]); });
      showMessage(formMessage, "error", "還有 " + errors.length + " 個欄位需要修正。");
      var first = form.elements[errors[0][0]];
      (first instanceof RadioNodeList ? first[0] : first).focus();
      return;
    }

    if (!navigator.onLine) {
      showMessage(formMessage, "error", "目前離線，無法送出報修。請連上網路後再按一次「送出報修」，已填的內容會保留。");
      return;
    }
    if (!client) {
      showMessage(formMessage, "error", "無法載入資料庫連線，請重新整理頁面後再試。");
      return;
    }

    submitButton.disabled = true;
    submitButton.textContent = "送出中…";
    try {
      // 不送 status：由資料庫預設為「待處理」
      var result = await client.from(TABLE).insert(values);
      if (result.error) {
        showMessage(formMessage, "error", "送出失敗：" + describeError(result.error));
        return;
      }
      form.reset();
      updateCounter();
      showMessage(formMessage, "ok", "已送出報修，謝謝！狀態為「待處理」。");
      loadList();
    } catch (err) {
      showMessage(formMessage, "error", "送出失敗：" + describeError(err));
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "送出報修";
    }
  }

  // ---------- 清單 ----------
  var timeFormat = new Intl.DateTimeFormat("zh-TW", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text; // 一律用 textContent，避免插入 HTML
    return node;
  }

  function renderList(rows) {
    list.replaceChildren();
    if (!rows.length) {
      showMessage(listMessage, "info", "目前還沒有報修資料。");
      return;
    }
    hideMessage(listMessage);
    rows.forEach(function (row) {
      var li = el("li", "request");
      var top = el("div", "request-top");
      top.appendChild(el("span", "tag", row.status));
      top.appendChild(el("span", "tag", row.category));
      top.appendChild(el("span", "tag urgency-" + row.urgency, "緊急：" + row.urgency));
      li.appendChild(top);
      li.appendChild(el("p", "request-desc", row.description));
      var when = row.created_at ? timeFormat.format(new Date(row.created_at)) : "";
      li.appendChild(el("p", "request-meta", row.reporter_name + "・" + row.location + "・" + when));
      list.appendChild(li);
    });
  }

  async function loadList() {
    if (!client) {
      showMessage(listMessage, "error", "無法載入資料庫連線，請重新整理頁面後再試。");
      return;
    }
    // 離線時不等待重試，直接提示；恢復連線時會自動重新載入
    if (!navigator.onLine) {
      showMessage(listMessage, "error", "目前離線，無法更新清單。連上網路後會自動重新載入。");
      return;
    }
    refreshButton.disabled = true;
    if (!list.children.length) showMessage(listMessage, "info", "載入中…");
    try {
      var result = await client
        .from(TABLE)
        .select("id, created_at, reporter_name, location, category, description, urgency, status")
        .order("created_at", { ascending: false })
        .limit(LIST_LIMIT);
      if (result.error) {
        showMessage(listMessage, "error", "清單載入失敗：" + describeError(result.error));
        return;
      }
      renderList(result.data || []);
    } catch (err) {
      showMessage(listMessage, "error", "清單載入失敗：" + describeError(err));
    } finally {
      refreshButton.disabled = false;
    }
  }

  function updateCounter() {
    descCount.textContent = Array.from(form.elements.description.value).length;
  }

  form.addEventListener("submit", handleSubmit);
  form.elements.description.addEventListener("input", updateCounter);
  refreshButton.addEventListener("click", loadList);
  loadList();

  // ---------- PWA ----------
  setupPwa();

  function setupPwa() {
    // 註冊 Service Worker（需 HTTPS 或 localhost）
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", function () {
        navigator.serviceWorker.register("sw.js").catch(function (err) {
          console.warn("Service Worker 註冊失敗", err);
        });
      });
    }

    // 離線提示；恢復連線時自動重新載入清單
    var offlineBanner = document.getElementById("offline-banner");
    function updateOnline() {
      offlineBanner.hidden = navigator.onLine;
    }
    window.addEventListener("offline", updateOnline);
    window.addEventListener("online", function () {
      updateOnline();
      loadList();
    });
    updateOnline();

    // 安裝提示
    var banner = document.getElementById("install-banner");
    var installText = document.getElementById("install-text");
    var installButton = document.getElementById("install-button");
    var dismissButton = document.getElementById("install-dismiss");
    var DISMISS_KEY = "repair-install-dismissed";
    var deferredPrompt = null;

    function isStandalone() {
      return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
    }
    function wasDismissed() {
      try { return localStorage.getItem(DISMISS_KEY) === "1"; } catch (_) { return false; }
    }
    if (isStandalone() || wasDismissed()) return;

    dismissButton.addEventListener("click", function () {
      banner.hidden = true;
      try { localStorage.setItem(DISMISS_KEY, "1"); } catch (_) { /* 無法記住也沒關係 */ }
    });

    // Android／電腦版 Chrome、Edge：瀏覽器判斷可安裝時，顯示「安裝」按鈕
    window.addEventListener("beforeinstallprompt", function (event) {
      event.preventDefault();
      deferredPrompt = event;
      installButton.hidden = false;
      banner.hidden = false;
    });
    installButton.addEventListener("click", async function () {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
      banner.hidden = true;
    });
    window.addEventListener("appinstalled", function () {
      banner.hidden = true;
    });

    // iPhone／iPad 的 Safari 沒有安裝按鈕，改顯示操作說明
    var ua = navigator.userAgent;
    var isIos = /iPhone|iPad|iPod/.test(ua) || (ua.indexOf("Macintosh") !== -1 && navigator.maxTouchPoints > 1);
    if (isIos) {
      installText.textContent = "安裝到主畫面：點 Safari 下方的「分享」按鈕，再選「加入主畫面」。";
      banner.hidden = false;
    }
  }
})();
