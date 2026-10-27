// PiklrPH Production Service Worker — sw.js
const CACHE_NAME = 'piklrph-cache-v1';

// Static Shell Assets & Core Module Files
const PRECACHE_ASSETS = [
  './',
  './app.html',
  './module2.html',
  './module3.html',
  './module4.html',
  './module5.html',
  './module6.html',
  './module7.html',
  './module8.html',
  './passport.html',
  './manifest.json',
  './logo.png',
  './offline.html'
];

// External Core CDN Libraries (Tailwind, Lucide, Fonts, Supabase)
const CDN_URLS = [
  'https://cdn.tailwindcss.com',
  'https://unpkg.com/lucide@latest',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&display=swap'
];

// 1. Install Event: Pre-cache local views & critical assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Cache local files first
      await cache.addAll(PRECACHE_ASSETS);
      // Attempt caching CDNs gracefully (avoiding install failure if network is flaky)
      for (const url of CDN_URLS) {
        try {
          await cache.add(new Request(url, { mode: 'cors' }));
        } catch (err) {
          console.warn('[SW] Optional CDN pre-cache skipped:', url);
        }
      }
    })
  );
  self.skipWaiting();
});

// 2. Activate Event: Clean up old versions
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      )
    )
  );
  self.clients.claim();
});

// 3. Fetch Event Strategy:
// - Supabase DB API calls -> Network-only (no stale state, bypass SW)
// - HTML Views / CSS / Scripts -> Stale-While-Revalidate with offline fallback
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Bypass database mutations and live Supabase queries
  if (url.hostname.includes('supabase.co')) {
    return; // Pass through to live network directly
  }

  // Handle HTML document navigations & iframe requests
  if (req.mode === 'navigate' || req.destination === 'document' || req.destination === 'iframe') {
    event.respondWith(
      fetch(req)
        .then((networkRes) => {
          const clone = networkRes.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          return networkRes;
        })
        .catch(async () => {
          const cachedRes = await caches.match(req);
          if (cachedRes) return cachedRes;
          // Fallback to offline screen if child page wasn't cached yet
          return caches.match('./offline.html');
        })
    );
    return;
  }

  // Handle Static Assets (Images, Tailwind, Fonts, JS files)
  event.respondWith(
    caches.match(req).then((cachedRes) => {
      if (cachedRes) {
        // Fetch fresh copy in background to update cache for next load
        fetch(req).then((networkRes) => {
          if (networkRes && networkRes.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(req, networkRes));
          }
        }).catch(() => {});
        return cachedRes;
      }

      return fetch(req)
        .then((networkRes) => {
          if (networkRes && networkRes.status === 200) {
            const clone = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return networkRes;
        })
        .catch(() => {
          // Fallback for missing images
          if (req.destination === 'image') {
            return caches.match('./logo.png');
          }
        });
    })
  );
});