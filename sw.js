/* Guarda la app para que funcione sin internet. Sube la versión cuando cambies archivos. */
const VERSION = "misfinanzas-v1";
const ARCHIVOS = ["./", "./index.html", "./estilos.css", "./core.js", "./app.js", "./manifest.webmanifest",
  "./icon-192.png", "./icon-512.png", "./icon-maskable-512.png"];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
// Primero intenta internet (para recibir mejoras); si no hay, usa lo guardado.
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(fetch(e.request).then((r) => {
    const copia = r.clone();
    caches.open(VERSION).then((c) => c.put(e.request, copia));
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match("./index.html"))));
});
