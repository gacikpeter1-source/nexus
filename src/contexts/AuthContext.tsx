import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import {
  User as FirebaseUser,
  AuthCredential,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithCustomToken,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  linkWithCredential,
  fetchSignInMethodsForEmail,
  GoogleAuthProvider,
  FacebookAuthProvider,
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
  login: (email: string, password: string) => Promise<string | null>; // returns ID token for Remember Me
  loginWithProvider: (providerName: 'google' | 'facebook') => Promise<string | null>; // returns ID token for Remember Me
  loginWithRedirect: (providerName: 'google' | 'facebook') => Promise<void>; // navigates away; result arrives via pendingLinkError / onAuthStateChanged
  pendingLinkError: AccountLinkRequiredError | null; // set when a redirect sign-in comes back needing account linking
  clearPendingLinkError: () => void;
  linkPendingCredential: (email: string, password: string, pendingCredential: AuthCredential) => Promise<string | null>; // returns ID token for Remember Me
  register: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  resendVerificationEmail: () => Promise<void>;
}

// Thrown by loginWithProvider when Firebase's "one account per email" rule
// blocks a social sign-in because the email already belongs to an account
// created a different way (almost always email/password, here). Carries
// what's needed to complete linking once the user proves ownership of that
// existing account — see linkPendingCredential.
export interface AccountLinkRequiredError extends Error {
  code: 'auth/account-exists-with-different-credential';
  email: string;
  pendingCredential: AuthCredential;
  existingMethods: string[]; // e.g. ['password'], or ['google.com'] if a different provider got there first
}

export function isAccountLinkRequiredError(err: unknown): err is AccountLinkRequiredError {
  return !!err && typeof err === 'object' && (err as any).code === 'auth/account-exists-with-different-credential' && !!(err as any).pendingCredential;
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
  const [pendingLinkError, setPendingLinkError] = useState<AccountLinkRequiredError | null>(null);
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
        // Firebase found no stored auth state (e.g. iOS 18 cleared localStorage).
        // Try to restore the session from the HttpOnly server cookie (Remember Me).
        // If the cookie exists and is valid, sign in silently so the user stays logged in.
        fetch('/api/session/verify', { method: 'POST', credentials: 'include' })
          .then(async (resp) => {
            if (resp.ok) {
              const { customToken } = await resp.json();
              // signInWithCustomToken triggers onAuthStateChanged again with the user —
              // do NOT set user/loading here; the next callback invocation handles it.
              await signInWithCustomToken(auth, customToken);
            } else {
              setUser(null);
              setLoading(false);
            }
          })
          .catch(() => {
            // API unreachable (offline) or no cookie — fall through to login page
            setUser(null);
            setLoading(false);
          });
        // Do NOT call setUser(null)/setLoading(false) here — wait for the fetch above
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

  // Login user — returns the Firebase ID token so the caller can optionally
  // create a server-side session cookie for "Remember Me" persistence.
  const login = async (email: string, password: string): Promise<string | null> => {
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

      // Return ID token so Login.tsx can pass it to /api/session/create for Remember Me
      return userCredential.user.getIdToken();
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  };

  // Shared by the popup flow and the redirect-return handler: creates the
  // Firestore user profile on first sign-in (same shape as register()) since
  // a social account never goes through the email/password registration
  // form — its email is already verified by the provider, so emailVerified
  // starts true instead of requiring our own verification email.
  const applySocialSignIn = async (signedInUser: FirebaseUser): Promise<User | null> => {
    let userData = await loadUserData(signedInUser);

    if (!userData) {
      const newUser: Partial<User> = {
        id: signedInUser.uid,
        email: (signedInUser.email || '').toLowerCase(),
        displayName: signedInUser.displayName || signedInUser.email || '',
        role: 'user',
        clubIds: [],
        ownedClubIds: [],
        emailVerified: true,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };
      await setDoc(doc(db, 'users', signedInUser.uid), newUser);
      userData = await loadUserData(signedInUser);
    } else if (!userData.emailVerified) {
      // An existing account (created via email/password, never verified) that
      // now also signs in with a matching Google/Facebook email — the
      // provider has already proven ownership of that address.
      await setDoc(doc(db, 'users', signedInUser.uid), { emailVerified: true, updatedAt: Timestamp.now() }, { merge: true });
      userData = await loadUserData(signedInUser);
    }

    setUser(userData);
    return userData;
  };

  // Shared by the popup flow and the redirect-return handler: Firebase's
  // "one account per email" rule blocked this — the email is already tied to
  // an account created a different way (email/password, here). Extracts what
  // linkPendingCredential needs to finish linking once the caller has the
  // user re-authenticate with their existing method. Returns null if the
  // error isn't actually this case (caller should then just rethrow as-is).
  const buildAccountLinkError = async (
    error: any,
    providerName: 'google' | 'facebook'
  ): Promise<AccountLinkRequiredError | null> => {
    if (error?.code !== 'auth/account-exists-with-different-credential') return null;
    const pendingCredential = providerName === 'google'
      ? GoogleAuthProvider.credentialFromError(error)
      : FacebookAuthProvider.credentialFromError(error);
    const email = error.customData?.email as string | undefined;
    if (!pendingCredential || !email) return null;

    const existingMethods = await fetchSignInMethodsForEmail(auth, email).catch(() => []);
    const linkError = new Error('An account already exists with this email using a different sign-in method.') as AccountLinkRequiredError;
    linkError.code = 'auth/account-exists-with-different-credential';
    linkError.email = email;
    linkError.pendingCredential = pendingCredential;
    linkError.existingMethods = existingMethods;
    return linkError;
  };

  // Sign in with Google or Facebook via a popup. Facebook's own re-auth +
  // GDPR consent flow is a multi-step, comparatively slow process that
  // Firebase's popup-completion polling sometimes gives up on before it
  // finishes — misreporting a real, still-in-progress sign-in as
  // auth/popup-closed-by-user — so Facebook uses loginWithRedirect instead
  // (see below); this popup path is only actually used for Google.
  const loginWithProvider = async (providerName: 'google' | 'facebook'): Promise<string | null> => {
    try {
      const provider = providerName === 'google' ? new GoogleAuthProvider() : new FacebookAuthProvider();
      const userCredential = await signInWithPopup(auth, provider);
      await applySocialSignIn(userCredential.user);
      return userCredential.user.getIdToken();
    } catch (error: any) {
      const linkError = await buildAccountLinkError(error, providerName);
      if (linkError) throw linkError;
      console.error('Social login error:', error);
      throw error;
    }
  };

  // Sign in via a full-page redirect instead of a popup — see loginWithProvider's
  // comment for why Facebook needs this. Navigates the browser away; nothing
  // after the call runs in this page load. The result is picked up by the
  // getRedirectResult effect below once the browser returns.
  const loginWithRedirect = async (providerName: 'google' | 'facebook'): Promise<void> => {
    const provider = providerName === 'google' ? new GoogleAuthProvider() : new FacebookAuthProvider();
    await signInWithRedirect(auth, provider);
  };

  // Picks up the result of loginWithRedirect once the browser returns from
  // the provider. Resolves to null on every normal page load that wasn't a
  // redirect return, so this is safe to run unconditionally on mount.
  useEffect(() => {
    getRedirectResult(auth)
      .then(async (result) => {
        if (!result) return;
        await applySocialSignIn(result.user);

        // "Remember Me" — the checkbox that triggered this redirect lives on
        // a page that's since fully reloaded, so its state was passed via
        // sessionStorage rather than JS state (see Login.tsx).
        const rememberMe = sessionStorage.getItem('nexus_remember_me_redirect') === '1';
        sessionStorage.removeItem('nexus_remember_me_redirect');
        if (rememberMe) {
          try {
            const idToken = await result.user.getIdToken();
            await fetch('/api/session/create', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ idToken, rememberMe: true }),
            });
          } catch {
            // Cookie creation failed — not critical, Firebase auth already succeeded
          }
        }
      })
      .catch(async (error: any) => {
        // providerId on the error tells us which provider's redirect this was
        const providerName = error?.customData?._tokenResponse?.providerId?.includes('facebook') ? 'facebook' : 'google';
        const linkError = await buildAccountLinkError(error, providerName);
        if (linkError) {
          setPendingLinkError(linkError);
        } else if (error?.code && error.code !== 'auth/no-auth-event') {
          console.error('Redirect sign-in error:', error);
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Completes the linking flow started by an AccountLinkRequiredError: signs
  // in with the existing account's own password (proving ownership), then
  // attaches the social credential to it. From then on both the password and
  // that provider work interchangeably for the same account.
  const linkPendingCredential = async (
    email: string,
    password: string,
    pendingCredential: AuthCredential
  ): Promise<string | null> => {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    await linkWithCredential(userCredential.user, pendingCredential);
    await checkAndSyncEmailVerification(userCredential.user);

    const userData = await loadUserData(userCredential.user);
    if (!userData) {
      await signOut(auth);
      const err: any = new Error('Account profile not found');
      err.code = 'auth/profile-not-found';
      throw err;
    }

    setUser(userData);
    return userCredential.user.getIdToken();
  };

  // Logout user — also clears the server-side session cookie if one exists
  const logout = async () => {
    try {
      await signOut(auth);
      // Clear Remember Me cookie (fire-and-forget — don't block logout on this)
      fetch('/api/session/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
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
    loginWithProvider,
    loginWithRedirect,
    pendingLinkError,
    clearPendingLinkError: () => setPendingLinkError(null),
    linkPendingCredential,
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


