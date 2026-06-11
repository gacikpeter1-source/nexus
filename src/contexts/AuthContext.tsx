import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import {
  User as FirebaseUser,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
} from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot, Timestamp } from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import type { User } from '../types';
import { sendVerificationEmail, checkAndSyncEmailVerification } from '../services/firebase/emailVerification';

interface AuthContextType {
  user: User | null;
  firebaseUser: FirebaseUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  resendVerificationEmail: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Load user data from Firestore
  const loadUserData = async (firebaseUser: FirebaseUser): Promise<User | null> => {
    try {
      const userDocRef = doc(db, 'users', firebaseUser.uid);
      const userDoc = await getDoc(userDocRef);

      if (userDoc.exists()) {
        return {
          id: firebaseUser.uid,
          ...userDoc.data(),
        } as User;
      }
      return null;
    } catch (error) {
      console.error('Error loading user data:', error);
      return null;
    }
  };

  // Listen to auth state changes and keep user doc in sync via real-time listener.
  // This ensures role/isParent/childIds changes made by trainers/admins propagate
  // immediately to the logged-in user without requiring a page refresh.
  useEffect(() => {
    let unsubUserDoc: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, (firebaseUser) => {
      setFirebaseUser(firebaseUser);

      // Clean up previous user doc listener whenever auth state changes
      if (unsubUserDoc) {
        unsubUserDoc();
        unsubUserDoc = null;
      }

      if (firebaseUser) {
        unsubUserDoc = onSnapshot(
          doc(db, 'users', firebaseUser.uid),
          (snap) => {
            if (snap.exists()) {
              setUser({ id: firebaseUser.uid, ...snap.data() } as User);
            }
            // Do NOT call setUser(null) here — Firestore can return a stale "not found"
            // on iOS when the tab resumes from background and the cache hasn't refreshed.
            // Session lifecycle (null user) is managed exclusively by onAuthStateChanged.
            setLoading(false);
          },
          (err) => {
            console.error('Error listening to user data:', err);
            // Snapshot errored (empty Firestore cache on PWA cold start, or network hiccup).
            // IMPORTANT: setLoading(false) must only be called AFTER we have a user value,
            // otherwise ProtectedRoute sees loading=false + firebaseUser + user=null and
            // calls logout() — logging the user out even though their auth token is valid.
            getDoc(doc(db, 'users', firebaseUser.uid))
              .then(snap => {
                if (snap.exists()) setUser({ id: firebaseUser.uid, ...snap.data() } as User);
                setLoading(false);
              })
              .catch(() => {
                // Firestore unreachable but the Firebase Auth token IS valid.
                // Build a minimal user from the auth token so the app stays open.
                // The onSnapshot listener will retry and fill in full data when online.
                setUser({
                  id: firebaseUser.uid,
                  email: firebaseUser.email || '',
                  displayName: firebaseUser.displayName || '',
                  role: 'user',
                  clubIds: [],
                  ownedClubIds: [],
                  emailVerified: firebaseUser.emailVerified,
                  createdAt: '',
                  updatedAt: '',
                } as unknown as User);
                setLoading(false);
              });
            // Do NOT call setLoading(false) here — wait for getDoc above to complete.
          }
        );
      } else {
        setUser(null);
        setLoading(false);
      }
    });

    return () => {
      unsubAuth();
      if (unsubUserDoc) unsubUserDoc();
    };
  }, []);

  // Register new user
  const register = async (email: string, password: string, displayName: string) => {
    try {
      // Create Firebase Auth user
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const firebaseUser = userCredential.user;

      // Update display name
      await updateProfile(firebaseUser, { displayName });

      // Send email verification
      await sendVerificationEmail(firebaseUser);

      // Create Firestore user document
      const newUser: Partial<User> = {
        id: firebaseUser.uid,
        email: email.toLowerCase(),
        displayName,
        role: 'user',
        clubIds: [],
        ownedClubIds: [],
        emailVerified: false,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      await setDoc(doc(db, 'users', firebaseUser.uid), newUser);

      // Load the new user data
      const userData = await loadUserData(firebaseUser);
      setUser(userData);
    } catch (error) {
      console.error('Registration error:', error);
      throw error;
    }
  };

  // Login user
  const login = async (email: string, password: string) => {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);

      // Check and sync email verification status
      await checkAndSyncEmailVerification(userCredential.user);

      const userData = await loadUserData(userCredential.user);

      // Firebase Auth account exists but Firestore profile was deleted (e.g. by admin).
      // Sign out to prevent an infinite loading spinner and surface a clear error.
      if (!userData) {
        await signOut(auth);
        const err: any = new Error('Account profile not found');
        err.code = 'auth/profile-not-found';
        throw err;
      }

      setUser(userData);
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  };

  // Logout user
  const logout = async () => {
    try {
      await signOut(auth);
      setUser(null);
      setFirebaseUser(null);
    } catch (error) {
      console.error('Logout error:', error);
      throw error;
    }
  };

  // Refresh user data from Firestore
  const refreshUser = async () => {
    if (firebaseUser) {
      // Check verification status before refreshing
      await checkAndSyncEmailVerification(firebaseUser);
      const userData = await loadUserData(firebaseUser);
      setUser(userData);
    }
  };

  // Resend verification email
  const resendVerificationEmail = async () => {
    if (!firebaseUser) {
      throw new Error('No user logged in');
    }
    
    await sendVerificationEmail(firebaseUser);
  };

  const value: AuthContextType = {
    user,
    firebaseUser,
    loading,
    login,
    register,
    logout,
    refreshUser,
    resendVerificationEmail,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}


