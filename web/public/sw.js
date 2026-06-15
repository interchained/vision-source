/* Vision service worker — self-unregistering.
 *
 * Earlier builds registered a stale-while-revalidate cache here. That caused
 * navigations after a deploy to fail with ChunkLoadError, because the cached
 * HTML shell referenced JS chunk hashes that no longer exist on the server.
 *
 * The app no longer registers a service worker. This stub exists only to tear
 * down any service worker (and its caches) left registered in browsers that
 * visited an older deploy, so those clients recover automatically.
 */
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      } catch (_e) {
        /* noop */
      }
      await self.registration.unregister();
      const clients = await self.clients.matchAll({ type: 'window' });
      for (const client of clients) client.navigate(client.url);
    })()
  );
});
