self.addEventListener("install", event => {
  event.waitUntil(
    caches.open("squat-tribe-v25").then(cache => {
      return cache.addAll([
        "./",
        "./index.html",
        "./styles.css",
        "./app.js",
        "./manifest.json"
      ]);
    })
  );
});

self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request).then(response => response || fetch(event.request))
  );
});
