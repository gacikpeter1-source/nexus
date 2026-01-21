/**
 * Firebase Cloud Messaging Service Worker
 * Handles background notifications when app is not open
 */

// Import Firebase scripts
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

// Initialize Firebase in service worker
// NOTE: These values should match your .env.local file
firebase.initializeApp({
  apiKey: "AIzaSyBa0mr4mPXnJq966XvmZGEQbFuWaBbdPIQ",
  authDomain: "nexus-7f8f7.firebaseapp.com",
  projectId: "nexus-7f8f7",
  storageBucket: "nexus-7f8f7.firebasestorage.app",
  messagingSenderId: "103391575021",
  appId: "1:103391575021:web:c814b083b2e18fa01745e4",
  measurementId: "G-KKJL2BT0BH"
});

const messaging = firebase.messaging();

// Handle background messages (when app is closed/background)
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message:', payload);
  
  const notificationTitle = payload.notification?.title || 'Nexus Notification';
  const notificationOptions = {
    body: payload.notification?.body || 'You have a new notification',
    icon: '/apple-touch-icon.png',
    badge: '/favicon-96x96.png',
    data: payload.data || {},
    tag: payload.data?.type || 'general',
    requireInteraction: false,
    vibrate: [200, 100, 200],
  };

  return self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  console.log('[firebase-messaging-sw.js] Notification click received:', event.notification.data);
  
  event.notification.close();
  
  // Determine where to navigate based on notification data
  const data = event.notification.data || {};
  let urlToOpen = '/';
  
  if (data.actionUrl) {
    urlToOpen = data.actionUrl;
  } else if (data.eventId) {
    urlToOpen = `/calendar/events/${data.eventId}`;
  } else if (data.teamId && data.clubId) {
    urlToOpen = `/clubs/${data.clubId}/teams/${data.teamId}`;
  } else if (data.clubId) {
    urlToOpen = `/clubs/${data.clubId}`;
  }
  
  // Open or focus the app
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUninitialized: true })
      .then((windowClients) => {
        // Check if app is already open
        for (let client of windowClients) {
          if (client.url.includes(urlToOpen) && 'focus' in client) {
            return client.focus();
          }
        }
        
        // If not, open new window
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
  );
});

// Log when service worker is activated
self.addEventListener('activate', (event) => {
  console.log('[firebase-messaging-sw.js] Service worker activated');
});
