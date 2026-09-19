// KrishiSetu Service Worker for Background Notifications & Alerts (PWA Ready)
const CACHE_NAME = 'krishisetu-cache-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Handle Background Notification Click: Focus existing window or open new one
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const clickAction = event.notification.data && event.notification.data.url
    ? event.notification.data.url
    : '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url && client.url.includes(self.location.origin)) {
          // Reuse existing client and navigate to clickAction without creating duplicate client/session
          if ('navigate' in client && clickAction && client.url !== clickAction) {
            client.navigate(clickAction);
          }
          if (event.notification.data && event.notification.data.screen) {
            client.postMessage({
              type: 'NAVIGATE_SCREEN',
              screen: event.notification.data.screen,
              orderId: event.notification.data.orderId
            });
          }
          if ('focus' in client) {
            return client.focus();
          }
          return;
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(clickAction);
      }
    })
  );
});

// Handle push events if web push server is configured
self.addEventListener('push', (event) => {
  if (!event.data) return;
  try {
    const payload = event.data.json();
    const title = payload.title || 'KrishiSetu Alert';
    const options = {
      body: payload.body || payload.message || 'You have a new update.',
      icon: payload.icon || '/images/logo.png',
      badge: payload.badge || '/images/logo.png',
      tag: payload.tag || 'krishisetu-alert',
      data: payload.data || { url: '/' },
      vibrate: [100, 50, 100]
    };
    event.waitUntil(self.registration.showNotification(title, options));
  } catch (e) {
    const text = event.data.text();
    event.waitUntil(
      self.registration.showNotification('KrishiSetu Alert', {
        body: text,
        icon: '/images/logo.png',
        tag: 'krishisetu-push'
      })
    );
  }
});
