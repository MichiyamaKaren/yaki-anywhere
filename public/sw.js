const CACHE = "yaki-v13";
const APP_FILES = [
  "/",
  "/src/styles/app.css",
  "/src/app.js",
  "/src/lib/subtitles.js",
  "/src/lib/native-files.js",
  "/src/lib/dom.js",
  "/src/state/project-store.js",
  "/src/services/project-storage.js",
  "/src/services/project-files.js",
  "/src/ui/workspace.js",
  "/src/features/player.js",
  "/src/features/subtitle-editor.js",
  "/src/features/subtitle-list.js",
  "/src/features/timeline.js",
  "/assets/icons/icon.svg",
  "/assets/icons/icon-192.png",
  "/assets/icons/icon-512.png",
  "/manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_FILES)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (
    event.request.method === "GET" &&
    new URL(event.request.url).origin === self.location.origin
  ) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request)),
    );
  }
});
