self.addEventListener("install", event => {
  event.waitUntil(
    caches.open("squat-tribe-v26a").then(cache => {
      return cache.addAll([
        "./",
        "./index.html",
        "./styles.css",
        "./app.js",
        "./manifest.json",
        "./SS Back squat.png",
        "./SS Bulgarian squat.png",
        "./SS Front squat.png",
        "./SS Side step.png",
        "./SS Sumo squat.png"
      ]);
    })
  );
});

self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request).then(response => response || fetch(event.request))
  );
});
