/* LabScan v12.3 — cache persistente de recursos OCR públicos. */
const CACHE_NAME = 'labscan-ocr-assets-v12.3';

function shouldCache(request) {
  if (request.method !== 'GET') return false;
  const url = new URL(request.url);
  const host = url.hostname;
  const href = url.href;

  if (host === 'cdn.jsdelivr.net' || host === 'esm.sh') return true;
  if (host.endsWith('bcebos.com')) return /paddle|ocr|onnx/i.test(href);
  if (host === 'huggingface.co' || host.endsWith('.huggingface.co')) return /paddle|ocr|onnx/i.test(href);
  return false;
}

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', event => {
  const request = event.request;
  if (!shouldCache(request)) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) return cached;

    const response = await fetch(request);
    if (response && (response.ok || response.type === 'opaque')) {
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  })());
});
