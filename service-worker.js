const CACHE_NAME = "vendora-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Leave Supabase and other external requests untouched.
  if (url.origin !== self.location.origin) return;

  // Always request the latest app content from the server.
  event.respondWith(fetch(event.request));
});
