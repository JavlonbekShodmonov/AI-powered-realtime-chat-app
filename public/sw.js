// Service Worker for Push Notifications

console.log('🔧 Service Worker loaded');

self.addEventListener('install', (event) => {
  console.log('📦 Service Worker installing...');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('✅ Service Worker activated');
  event.waitUntil(clients.claim());
});

self.addEventListener('push', (event) => {
  console.log('🔔 Push notification received!', event);
  
  let data = {};
  
  try {
    if (event.data) {
      data = event.data.json();
      console.log('   📦 Push data:', data);
    }
  } catch (e) {
    console.error('   ❌ Error parsing push data:', e);
    data = {
      title: 'New Notification',
      body: 'You have a new notification'
    };
  }
  
  const options = {
    body: data.body || 'New notification',
    icon: data.icon || '/favicon.avif',
    badge: '/favicon.avif',
    data: data.data || {},
    vibrate: [200, 100, 200],
    tag: data.data?.appointmentId || 'notification-' + Date.now(),
    requireInteraction: false,
    silent: false,
  };

  console.log('   📢 Showing notification:', data.title, options);

  event.waitUntil(
    self.registration.showNotification(data.title || 'Notification', options)
      .then(() => {
        console.log('   ✅ Notification shown successfully');
      })
      .catch((err) => {
        console.error('   ❌ Error showing notification:', err);
      })
  );
});

self.addEventListener('notificationclick', (event) => {
  console.log('👆 Notification clicked:', event.notification.tag);
  
  event.notification.close();
  
  const urlToOpen = event.notification.data?.url || '/';
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        // Check if there's already a window open
        for (let client of windowClients) {
          if (client.url === urlToOpen && 'focus' in client) {
            return client.focus();
          }
        }
        // If not, open a new window
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
  );
});

self.addEventListener('notificationclose', (event) => {
  console.log('❌ Notification closed:', event.notification.tag);
});