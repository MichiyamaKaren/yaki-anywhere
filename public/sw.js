const CACHE = "yaki-v20";
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
  "/src/lib/review-state.js",
  "/src/services/project-repository.js",
  "/src/services/project-persistence.js",
  "/src/services/web-project-storage.js",
  "/src/services/native-project-storage.js",
  "/src/features/project-manager.js",
  "/src/ui/workspace.js",
  "/src/ui/page-navigation.js",
  "/src/ui/sidebar.js",
  "/src/features/player.js",
  "/src/features/subtitle-editor.js",
  "/src/features/subtitle-list.js",
  "/src/features/timeline.js",
  "/src/features/audio-spectrum.js",
  "/src/workers/audio-spectrum.js",
  "/src/lib/spectrogram.js",
  "/assets/vendor/mediabunny.mjs",
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
