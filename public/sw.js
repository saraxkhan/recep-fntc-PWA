// MediVoice Service Worker
// Strategy: Cache-first for static assets, network-first for API/SSR pages.

const CACHE_VERSION = 'mv-v1';
const STATIC_CACHE  = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

// Assets that should always be cached on install
const PRECACHE_URLS = [
  '/',
  '/offline',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
];

// Patterns that must never be served from cache
const NEVER_CACHE = [
  /\/api\//,          // API routes – must be live
  /supabase/,         // Supabase requests
  /anthropic/,        // AI gateway
  /chrome-extension/, // Browser internals
];

// ─── Install ──────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) =>
      cache.addAll(PRECACHE_URLS).catch((err) => {
        // Non-fatal: offline page may not exist yet during first deploy
        console.warn('[SW] Precache partial failure:', err);
      })
    ).then(() => self.skipWaiting())
  );
});

// ─── Activate ─────────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith('mv-') && key !== STATIC_CACHE && key !== RUNTIME_CACHE)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// ─── Fetch ────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignore non-GET and non-HTTP(S)
  if (request.method !== 'GET') return;
  if (!url.protocol.startsWith('http')) return;

  // Never cache these patterns
  if (NEVER_CACHE.some((re) => re.test(url.pathname + url.href))) return;

  // Navigation requests: network-first, fallback to offline page
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstWithOfflineFallback(request));
    return;
  }

  // Static assets (JS, CSS, images, fonts): cache-first
  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Everything else: network-first
  event.respondWith(networkFirst(request));
});

// ─── Strategies ───────────────────────────────────────────────────────────────

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Asset unavailable offline', { status: 503 });
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached ?? new Response('Unavailable offline', { status: 503 });
  }
}

async function networkFirstWithOfflineFallback(request) {
  try {
    const response = await fetch(request);
    // Cache successful navigations for later offline use
    if (response.ok) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Try cached version of the exact URL first
    const cached = await caches.match(request);
    if (cached) return cached;

    // Fall back to the dedicated offline page
    const offline = await caches.match('/offline');
    if (offline) return offline;

    // Last resort: inline offline response
    return new Response(offlineFallbackHTML(), {
      status: 503,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }
}

function isStaticAsset(url) {
  return (
    url.pathname.startsWith('/icons/') ||
    url.pathname.startsWith('/splash/') ||
    url.pathname.match(/\.(js|css|woff2?|ttf|otf|png|jpg|jpeg|svg|ico|webp)$/)
  );
}

function offlineFallbackHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>MediVoice – Offline</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{min-height:100dvh;display:flex;align-items:center;justify-content:center;
         background:#1e2a4a;color:#f0f4ff;font-family:system-ui,sans-serif;padding:1.5rem;text-align:center}
    .icon{width:72px;height:72px;background:#4a8eff1a;border-radius:16px;display:grid;
          place-items:center;margin:0 auto 1.5rem}
    svg{width:36px;height:36px;fill:none;stroke:#4a8eff;stroke-width:2;stroke-linecap:round}
    h1{font-size:1.5rem;font-weight:600;margin-bottom:.5rem}
    p{color:#a0aec0;font-size:.9rem;max-width:320px;margin:.5rem auto}
    button{margin-top:1.5rem;padding:.6rem 1.4rem;background:#4a8eff;color:#fff;
           border:none;border-radius:.5rem;font-size:.9rem;cursor:pointer}
    button:hover{background:#3a7eef}
  </style>
</head>
<body>
  <div>
    <div class="icon">
      <svg viewBox="0 0 24 24"><path d="M1 6l5 5M1 6l5-5M1 6h10a4 4 0 0 1 0 8h-1"/><circle cx="19" cy="17" r="3"/></svg>
    </div>
    <h1>You're offline</h1>
    <p>MediVoice needs a connection to reach the AI receptionist and booking system.</p>
    <p>Please check your network and try again.</p>
    <button onclick="location.reload()">Retry</button>
  </div>
</body>
</html>`;
}
