const CACHE_NAME = "alapar-v1";

const _PRECACHE_URLS = ["/", "/dashboard"];

const BUILD_CACHE = "alapar-build-v4";
const API_CACHE = "alapar-api-v4";
const HTML_CACHE = "alapar-html-v4";
const NETWORK_TIMEOUT_MS = 4000;

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

/**
 * A styled fallback shown when both the network and cache are unavailable.
 * Replaces the bare "Offline" string so users see a sensible screen instead of
 * raw text if the app ever goes unreachable (dev timeout, prod outage, etc.).
 */
function offlineResponse(request) {
  const isHtml = (request.headers.get("Accept") ?? "").includes("text/html");
  const body = isHtml
    ? "<!DOCTYPE html><html lang=\"es\"><head><meta charset=\"utf-8\">" +
      "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">" +
      "<title>Sin conexión — A la Par</title><style>" +
      ":root{color-scheme:dark}" +
      "body{display:flex;align-items:center;justify-content:center;" +
      "min-height:100vh;margin:0;background:#0f172a;color:#e2e8f0;" +
      "font-family:system-ui,-apple-system,sans-serif;text-align:center}" +
      ".card{max-width:24rem;padding:2rem}" +
      "h1{font-size:1.25rem;margin:0 0 .5rem}" +
      "p{color:#94a3b8;margin:0 0 1.5rem;line-height:1.5}" +
      "button{background:#3b82f6;color:#fff;border:0;border-radius:.5rem;" +
      "padding:.6rem 1.25rem;font-size:1rem;cursor:pointer}" +
      "</style></head><body><div class=\"card\">" +
      "<h1>No hay conexión</h1>" +
      "<p>No se pudo cargar esta página. Revisa tu conexión a internet e " +
      "inténtalo de nuevo.</p>" +
      "<button onclick=\"location.reload()\">Reintentar</button>" +
      "</div></body></html>"
    : "";
  return new Response(body, {
    status: 503,
    statusText: "Service Unavailable",
    headers: isHtml
      ? { "Content-Type": "text/html; charset=utf-8" }
      : { "Content-Type": "text/plain; charset=utf-8" },
  });
}

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
    return offlineResponse(request);
  }
}

async function networkFirst(request, cacheName) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error("network-timeout")),
      NETWORK_TIMEOUT_MS,
    );
  });
  try {
    const response = await Promise.race([fetch(request), timeout]);
    clearTimeout(timeoutId);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch {
    clearTimeout(timeoutId);
    fetch(request).then((res) => {
      if (res.ok) {
        caches.open(cacheName).then((c) => c.put(request, res)).catch(() => {});
      }
    }).catch(() => {});
    const cached = await caches.match(request);
    if (cached) return cached;
    if (request.headers.get("Accept")?.includes("text/html")) {
      const cache = await caches.open(HTML_CACHE);
      const fallback = await cache.match("/dashboard");
      if (fallback) return fallback;
    }
    return offlineResponse(request);
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
