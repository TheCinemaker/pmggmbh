// A gyorsítótár egyedi neve. Ha frissíteni akarjuk, ezt a nevet kell megváltoztatni.
const CACHE_NAME = 'pmg-oralap-cache-v2';

// Azok a fájlok, amiket az app "telepítésekor" azonnal elmentünk.
const URLS_TO_CACHE = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/icons/apple-touch-icon.png',
  '/icons/favicon.ico',
  '/icons/favicon.svg'
];

// 1. Telepítési esemény: Amikor a Service Worker először települ.
self.addEventListener('install', (event) => {
  // Megvárjuk, amíg a gyorsítótár nyitva van, és az összes fájl elmentődött.
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Service Worker: Cache megnyitva');
        return cache.addAll(URLS_TO_CACHE);
      })
  );
});

// 2. Aktiválási esemény: A régi, felesleges gyorsítótárak törlése.
// Ez akkor fut le, ha pl. a CACHE_NAME megváltozik egy új verzió miatt.
self.addEventListener('activate', (event) => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('Service Worker: Régi cache törlése:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// 3. Lekérési esemény (Fetch): A legfontosabb rész.
// Minden egyes hálózati kérést (kép, script, API hívás) elfog.
self.addEventListener('fetch', (event) => {
  // Csak a GET kéréseket gyorsítótárazzuk. A POST kéréseket (feltöltés, login) érintetlenül hagyjuk.
  if (event.request.method !== 'GET') {
    return;
  }
  
  event.respondWith(
    // Megpróbáljuk megkeresni a kérést a gyorsítótárban.
    caches.match(event.request)
      .then((response) => {
        // Ha megvan a gyorsítótárban, azt adjuk vissza. Ez szupergyors.
        if (response) {
          return response;
        }

        // Ha nincs meg, akkor lekérjük a hálózatról...
        return fetch(event.request).then(
          (networkResponse) => {
            // ...és ha sikeres volt a letöltés, elmentjük a gyorsítótárba a jövőre nézve.
            if (networkResponse && networkResponse.status === 200) {
              const responseToCache = networkResponse.clone();
              caches.open(CACHE_NAME)
                .then((cache) => {
                  cache.put(event.request, responseToCache);
                });
            }
            return networkResponse;
          }
        );
      })
  );
});
