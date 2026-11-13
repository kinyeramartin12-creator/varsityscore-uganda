const CACHE_NAME = 'varsityscore-v1';

const APP_FILES = [
  '/',
  '/manifest.json',
  '/varsityscore-icon-192.png',
  '/varsityscore-icon-512.png',
  '/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(APP_FILES);
    })
  );

  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );

  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (
    request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/api/')
  ) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) =>
            cache.put('/', copy)
          );
          return response;
        })
        .catch(() => caches.match('/'))
    );
  }
});
// ========================================
// BACKGROUND PUSH NOTIFICATIONS
// ========================================

self.addEventListener('push', (event) => {
  let data = {
    title: 'VarsityScore Uganda',
    body: 'There is a new match update.',
    url: '/'
  }

  if (event.data) {
    try {
      data = {
        ...data,
        ...event.data.json()
      }
    } catch {
      data.body = event.data.text()
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/varsityscore-icon-192.png',
      badge: '/varsityscore-icon-192.png',
      tag: data.tag || 'varsityscore-match-update',
      data: {
        url: data.url || '/'
      }
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const targetUrl = new URL(
    event.notification.data?.url || '/',
    self.location.origin
  ).href

  event.waitUntil(
    clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === targetUrl && 'focus' in client) {
          return client.focus()
        }
      }

      return clients.openWindow(targetUrl)
    })
  )
})