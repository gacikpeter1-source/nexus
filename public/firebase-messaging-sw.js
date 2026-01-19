// Firebase Cloud Messaging Service Worker
// Handles background notifications when app is closed

importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

// Initialize Firebase in service worker
// Note: These values must match your Firebase config
firebase.initializeApp({
  apiKey: "AIzaSyBa0mr4mPXnJq966XvmZGEQbFuWaBbdPIQ",
  authDomain: "nexus-7f8f7.firebaseapp.com",
  projectId: "nexus-7f8f7",
  storageBucket: "nexus-7f8f7.firebasestorage.app",
  messagingSenderId: "103391575021",
  appId: "1:103391575021:web:c814b083b2e18fa01745e4"
});

const messaging = firebase.messaging();

// Handle background messages (app closed/minimized)
messaging.onBackgroundMessage((payload) => {
  console.log('[SW] Background message received:', payload);
  
  const notificationTitle = payload.notification?.title || 'NEXUS Notification';
  const requiresResponse = payload.data?.requiresResponse === 'true';
  
  const notificationOptions = {
    body: payload.notification?.body || 'You have a new notification',
    icon: '/nexus-icon.svg',
    badge: '/favicon-96x96.png',
    tag: payload.data?.type || 'general',
    data: payload.data,
    
    // Interactive notifications (e.g., waitlist promotions)
    actions: requiresResponse ? [
      { action: 'accept', title: '✅ Accept' },
      { action: 'decline', title: '❌ Decline' }
    ] : [
      { action: 'view', title: 'View' },
      { action: 'dismiss', title: 'Dismiss' }
    ]
  };

  return self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  const data = event.notification.data || {};
  const action = event.action;
  
  if (action === 'dismiss') return;
  
  // Handle interactive response (accept/decline)
  if (action === 'accept' || action === 'decline') {
    event.waitUntil(
      clients.matchAll({ type: 'window' }).then(clientList => {
        // Send message to app
        if (clientList.length > 0) {
          clientList[0].postMessage({
            type: 'notification-response',
            action: action,
            eventId: data.eventId,
            notificationId: data.notificationId
          });
        }
        return clients.openWindow(data.click_action || '/');
      })
    );
    return;
  }
  
  // Determine URL based on notification type
  let url = '/';
  if (data.type === 'event_new' || data.type === 'event_modified' || data.type === 'event_reminder') {
    url = data.eventId ? `/calendar/events/${data.eventId}` : '/calendar';
  } else if (data.type === 'chat_message') {
    url = data.chatId ? `/chat/${data.chatId}` : '/chat';
  } else if (data.type === 'join_request' || data.type === 'request_approved') {
    url = data.clubId ? `/clubs/${data.clubId}` : '/clubs';
  } else if (data.click_action) {
    url = data.click_action;
  }
  
  // Open or focus app
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Focus existing window if already open
        for (const client of clientList) {
          if (client.url.includes(url) && 'focus' in client) {
            return client.focus();
          }
        }
        // Otherwise open new window
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
  );
});


