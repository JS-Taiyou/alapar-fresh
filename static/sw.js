const CACHE_NAME = "alapar-v1";

const _PRECACHE_URLS = ["/", "/dashboard"];

const BUILD_CACHE = "alapar-build-v3";
const API_CACHE = "alapar-api-v3";
const HTML_CACHE = "alapar-html-v3";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((n) =>
            n !== CACHE_NAME && n !== BUILD_CACHE && n !== API_CACHE &&
            n !== HTML_CACHE
          )
          .map((n) => caches.delete(n)),
      )
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  const sameOrigin = url.origin === self.location.origin;

  if (!sameOrigin) return;

  if (event.request.method !== "GET") return;

  if (isBuildAsset(url.pathname)) {
    event.respondWith(cacheFirst(event.request, BUILD_CACHE));
    return;
  }

  if (url.pathname.startsWith("/api/")) {
    event.respondWith(networkFirst(event.request, API_CACHE));
    return;
  }

  event.respondWith(networkFirst(event.request, HTML_CACHE));
});

function isBuildAsset(pathname) {
  return pathname.startsWith("/_frsh/") ||
    pathname.endsWith(".js") ||
    pathname.endsWith(".css") ||
    pathname.endsWith(".woff2") ||
    pathname.endsWith(".woff") ||
    pathname.endsWith(".svg") ||
    pathname.endsWith(".png") ||
    pathname.endsWith(".ico");
}

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch {
    return new Response("Offline", { status: 503 });
  }
}

async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (request.headers.get("Accept")?.includes("text/html")) {
      const cache = await caches.open(HTML_CACHE);
      const fallback = await cache.match("/dashboard");
      if (fallback) return fallback;
    }
    return new Response("Offline", { status: 503 });
  }
}

self.addEventListener("push", (event) => {
  const data = event.data?.json() ?? {};
  const title = data.title ?? "A la Par";
  const options = {
    body: data.body ?? "Tienes una nueva notificación",
    icon: "/logo.svg",
    badge: "/logo.svg",
    data: {
      registryId: data.registryId ?? "",
      url: data.url ?? "/dashboard",
    },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url ?? "/dashboard";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(
      (clients) => {
        for (const client of clients) {
          if (client.url.includes("/dashboard") && "focus" in client) {
            client.postMessage({ type: "navigate", url: targetUrl });
            return client.focus();
          }
        }
        return self.clients.openWindow(targetUrl);
      },
    ),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "CACHE_URLS") {
    const urls = event.data.urls ?? [];
    event.waitUntil(
      caches.open(HTML_CACHE).then((cache) => cache.addAll(urls)),
    );
  }
});
