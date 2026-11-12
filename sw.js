// 報修登記 PWA 的 Service Worker
// - 網頁本身的檔案：優先從網路取得最新版本，離線時改用快取，讓 App 仍能打開。
// - 固定版本的 supabase-js（CDN）：優先使用快取。
// - Supabase 資料（新增、清單）：一律直接連線，不快取，避免看到舊資料或重複送出。
// 修改快取的檔案清單時，請一併更新 CACHE_VERSION。
const CACHE_VERSION = "v1";
const CACHE_NAME = "repair-app-" + CACHE_VERSION;

const APP_SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./config.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
];
const SUPABASE_JS =
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/dist/umd/supabase.js";

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(APP_SHELL);
      // CDN 暫時連不上時不要讓安裝失敗，之後第一次使用時再快取
      try {
        await cache.add(new Request(SUPABASE_JS, { mode: "cors" }));
      } catch (_) { /* 略過 */ }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // 刪除舊版本的快取
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith("repair-app-") && k !== CACHE_NAME)
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    // 離線開啟任何頁面時，回傳首頁
    if (request.mode === "navigate") {
      const home = await cache.match("./index.html");
      if (home) return home;
    }
    throw err;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return; // 新增報修等寫入一律直接送出

  const url = new URL(request.url);
  if (url.href === SUPABASE_JS) {
    event.respondWith(cacheFirst(request));
    return;
  }
  // 只處理本網站範圍內的檔案；Supabase 等其他網站的請求交給瀏覽器
  if (url.origin === self.location.origin && url.pathname.startsWith(new URL(self.registration.scope).pathname)) {
    event.respondWith(networkFirst(request));
  }
});
