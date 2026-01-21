/**
 * Firebase Configuration
 * 
 * IMPORTANT: Replace these placeholder values with your actual Firebase config
 * from Firebase Console > Project Settings > Your apps > Web app
 */

import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';
import { getStorage, connectStorageEmulator } from 'firebase/storage';
import { getMessaging, isSupported } from 'firebase/messaging';

// Firebase configuration from environment variables
// Create .env.local file with your Firebase config:
// VITE_FIREBASE_API_KEY=your-api-key
// VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
// VITE_FIREBASE_PROJECT_ID=your-project-id
// VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
// VITE_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
// VITE_FIREBASE_APP_ID=your-app-id
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "placeholder-api-key",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "placeholder.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "placeholder-project",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "placeholder.appspot.com",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "123456789",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:123456789:web:placeholder",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-KKJL2BT0BH", // Optional
  vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY || "placeholder-vapid-key"
};

// Log warning if using placeholder config
if (firebaseConfig.apiKey === "placeholder-api-key") {
  console.warn(
    "⚠️ Firebase is using placeholder config.\n" +
    "📝 Create .env.local file with your Firebase credentials.\n" +
    "📚 See FIREBASE_SETUP.md for instructions."
  );
}

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase services
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app);
export const storage = getStorage(app);

// Initialize Firebase Cloud Messaging (only if supported in browser)
export const messaging = isSupported().then(yes => yes ? getMessaging(app) : null);

// Connect to emulators in development (optional)
if (import.meta.env.DEV && import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true') {
  connectAuthEmulator(auth, 'http://localhost:9099');
  connectFirestoreEmulator(db, 'localhost', 8080);
  connectFunctionsEmulator(functions, 'localhost', 5001);
  connectStorageEmulator(storage, 'localhost', 9199);
}

export default app;

