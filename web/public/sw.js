const CACHE_PREFIX = "notes-md-";
// Bump this when the cached shell or cache strategy changes.
const CACHE_VERSION = "v1";
const SHELL_CACHE = `${CACHE_PREFIX}shell-${CACHE_VERSION}`;
const STATIC_CACHE = `${CACHE_PREFIX}static-${CACHE_VERSION}`;
const PAGE_CACHE = `${CACHE_PREFIX}pages-${CACHE_VERSION}`;
const OFFLINE_URL = "/offline.html";
const STATIC_ASSET_PATTERN = /\.(?:avif|css|eot|gif|ico|jpe?g|js|mjs|otf|png|svg|ttf|webp|woff2?)$/i;

function isAlwaysNetworkPath(pathname) {
  return (
    pathname === "/api" ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/data/")
  );
}

function isPrivatePagePath(pathname) {
  return (
    pathname === "/signin" ||
    pathname.startsWith("/signin/") ||
    pathname === "/work" ||
    pathname.startsWith("/work/")
  );
}

function isCacheableResponse(response) {
  const cacheControl = response.headers.get("Cache-Control") || "";
  return (
    response.ok &&
    response.type === "basic" &&
    !/\b(?:no-store|private)\b/i.test(cacheControl)
  );
}

function isStaticAssetRequest(request, url) {
  if (url.pathname.startsWith("/_next/static/")) {
    return true;
  }
  if (url.pathname === "/manifest.webmanifest") {
    return true;
  }
  return (
    STATIC_ASSET_PATTERN.test(url.pathname) &&
    ["font", "image", "script", "style"].includes(request.destination)
  );
}

function addStaticAssetReference(reference, baseUrl, assets) {
  const assetUrl = new URL(reference, baseUrl);
  if (
    assetUrl.origin === self.location.origin &&
    assetUrl.pathname.startsWith("/_next/static/")
  ) {
    assets.add(assetUrl.href);
  }
}

async function precachePersonalShell() {
  const response = await fetch("/personal", {
    cache: "reload",
    credentials: "omit",
  });
  if (!isCacheableResponse(response)) {
    return;
  }

  const html = await response.clone().text();
  const pageCache = await caches.open(PAGE_CACHE);
  await pageCache.put("/personal", response);

  const assets = new Set();
  for (const match of html.matchAll(/(?:src|href)=["']([^"']+)["']/gi)) {
    addStaticAssetReference(match[1], self.location.origin, assets);
  }

  const staticCache = await caches.open(STATIC_CACHE);
  const pending = [...assets];
  const cached = new Set();
  while (pending.length > 0) {
    const assetUrl = pending.pop();
    if (cached.has(assetUrl)) {
      continue;
    }
    cached.add(assetUrl);

    try {
      const assetResponse = await fetch(assetUrl, {
        cache: "reload",
        credentials: "omit",
      });
      if (!isCacheableResponse(assetResponse)) {
        continue;
      }

      const contentType = assetResponse.headers.get("Content-Type") || "";
      if (contentType.includes("text/css")) {
        const css = await assetResponse.clone().text();
        for (const match of css.matchAll(/url\((?:["']?)([^"')]+)(?:["']?)\)/gi)) {
          addStaticAssetReference(match[1], assetUrl, assets);
        }
      }
      await staticCache.put(assetUrl, assetResponse);
      for (const reference of assets) {
        if (!cached.has(reference) && !pending.includes(reference)) {
          pending.push(reference);
        }
      }
    } catch (error) {
      console.warn("Could not pre-cache an app-shell asset:", error);
    }
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) {
    return cached;
  }

  const response = await fetch(request);
  if (isCacheableResponse(response)) {
    const cache = await caches.open(STATIC_CACHE);
    await cache.put(request, response.clone());
  }
  return response;
}

async function staleWhileRevalidate(event) {
  const cached = await caches.match(event.request);
  const update = fetch(event.request).then(async (response) => {
    if (isCacheableResponse(response)) {
      const cache = await caches.open(STATIC_CACHE);
      await cache.put(event.request, response.clone());
    }
    return response;
  });

  if (cached) {
    event.waitUntil(update.then(() => undefined).catch(() => undefined));
    return cached;
  }
  return update;
}

async function networkFirstNavigation(request) {
  const url = new URL(request.url);
  const cacheableShell = url.pathname === "/personal" && url.search === "";

  try {
    const response = await fetch(request);
    if (cacheableShell && isCacheableResponse(response)) {
      const cache = await caches.open(PAGE_CACHE);
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    if (cacheableShell) {
      const cached = await caches.open(PAGE_CACHE).then((cache) => cache.match(request));
      if (cached) {
        return cached;
      }
    }

    const offline = await caches.open(SHELL_CACHE).then((cache) => cache.match(OFFLINE_URL));
    return offline || new Response("You are offline.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      await cache.addAll([
        OFFLINE_URL,
        "/favicon.svg",
        "/icons/icon-192.png",
        "/icons/icon-512.png",
        "/manifest.webmanifest",
      ]);

      try {
        // The Personal page is only an app shell; its note data stays in IndexedDB.
        await precachePersonalShell();
      } catch (error) {
        console.warn("Could not pre-cache the Personal app shell:", error);
      }

    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX))
            .filter((key) => ![SHELL_CACHE, STATIC_CACHE, PAGE_CACHE].includes(key))
            .map((key) => caches.delete(key)),
        ),
      ),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "CLEAR_PAGE_CACHE") {
    event.waitUntil(caches.delete(PAGE_CACHE));
  }
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || isAlwaysNetworkPath(url.pathname)) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (isPrivatePagePath(url.pathname)) {
    return;
  }

  if (!isStaticAssetRequest(request, url)) {
    return;
  }

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request));
  } else {
    event.respondWith(staleWhileRevalidate(event));
  }
});
