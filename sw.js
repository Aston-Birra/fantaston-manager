
/* FANTASTON MANAGER - SERVICE WORKER */

const CACHE_NAME = "fantaston-static-v9";

const CORE_FILES = [
  "./index.html",
  "./manifest.webmanifest",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png"
];

// Installazione: salva i file essenziali
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(CORE_FILES);
    })
  );
});

// Attivazione: elimina le vecchie cache FANTASTON
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) => {
      return Promise.all(
        names
          .filter((name) =>
            name.startsWith("fantaston-static-") &&
            name !== CACHE_NAME
          )
          .map((name) => caches.delete(name))
      );
    })
  );
});

// Caricamento: prima la rete, poi la cache
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  const scopePath = new URL(self.registration.scope).pathname;

  // Mai intercettare richieste esterne o non GET
  if (request.method !== "GET") return;
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith(scopePath)) return;

  // Non memorizzare callback OAuth o configurazioni
  if (url.search) return;
  if (url.pathname.endsWith("/js/config.js")) return;

  // Gestisci solo pagine e risorse statiche
  const isPage = request.mode === "navigate";
  const isAsset = /\.(css|js|png|jpg|jpeg|webp|svg|ico|woff2?|webmanifest)$/i
    .test(url.pathname);

  if (!isPage && !isAsset) return;

  event.respondWith((async () => {
    try {
      const response = await fetch(request);

      if (response.ok && response.type === "basic") {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
      }

      return response;

    } catch (error) {
      const cached = await caches.match(request);
      if (cached) return cached;

      if (isPage) {
        const fallback = await caches.match(
          new URL("./index.html", self.registration.scope)
        );
        if (fallback) return fallback;
      }

      return Response.error();
    }
  })());
});
