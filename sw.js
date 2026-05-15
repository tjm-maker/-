// Service Worker for CET6 Daily PWA
const CACHE_NAME = "cet6-daily-v1";

// 核心资源：离线时必须可用
const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./styles/main.css",
  "./js/app.js",
  "./js/core/storage.js",
  "./js/core/session.js",
  "./js/core/story.js",
  "./js/core/cloud.js",
  "./js/core/tts.js",
  "./js/core/books.js",
  "./js/core/wordai.js",
  "./js/data/words.js",
  "./js/views/learn.js",
  "./js/views/story.js",
  "./js/views/review.js",
  "./js/views/stats.js",
  "./js/views/vocab.js",
  "./js/views/settings.js",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

// Install: 预缓存核心资源
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS);
    }).then(() => self.skipWaiting())
  );
});

// Activate: 清理旧缓存
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: 缓存优先策略（核心资源），网络优先（API 请求）
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // API 请求（supabase、AI）：网络优先，不缓存
  if (url.hostname !== location.hostname || url.pathname.includes("/v1/")) {
    event.respondWith(fetch(event.request));
    return;
  }

  // 大词库文件（懒加载）：缓存优先 + 网络更新
  if (url.pathname.includes("cet6-full.js")) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) => {
        return cache.match(event.request).then((cached) => {
          const fetchPromise = fetch(event.request).then((response) => {
            if (response.ok) cache.put(event.request, response.clone());
            return response;
          }).catch(() => cached);
          return cached || fetchPromise;
        });
      })
    );
    return;
  }

  // 核心资源：缓存优先
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        // 缓存成功的同源请求
        if (response.ok && url.origin === location.origin) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      });
    }).catch(() => {
      // 离线 fallback：返回首页
      if (event.request.mode === "navigate") {
        return caches.match("./index.html");
      }
    })
  );
});
