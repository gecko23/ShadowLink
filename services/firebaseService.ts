import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, User } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc } from 'firebase/firestore';

// !!! IMPORTANT: REPLACE WITH YOUR FIREBASE PROJECT CONFIG !!!
// You can get this from the Firebase Console -> Project Settings -> General -> Your Apps
const firebaseConfig = {
  apiKey: "YOUR_API_KEY_HERE",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
};

let app: any;
let auth: any;
let db: any;
let isInitialized = false;

// Initialize Firebase safely
const initFirebase = () => {
  if (isInitialized) return;
  
  // Check if config is still placeholder
  if (firebaseConfig.apiKey === "YOUR_API_KEY_HERE") {
    console.warn("Firebase Config missing. Update services/firebaseService.ts");
    return;
  }

  try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    isInitialized = true;
  } catch (e) {
    console.error("Firebase Init Failed:", e);
  }
};

export const signInToCloud = async (): Promise<User | null> => {
  initFirebase();
  if (!auth) throw new Error("Firebase not configured");

  try {
    const userCredential = await signInAnonymously(auth);
    return userCredential.user;
  } catch (error) {
    console.error("Cloud Auth Error:", error);
    throw error;
  }
};

export const getCurrentUser = (): User | null => {
  initFirebase();
  return auth?.currentUser || null;
};

export const syncUpToCloud = async (userId: string) => {
  initFirebase();
  if (!db || !userId) throw new Error("Database not connected");

  // Gather all encrypted local data
  // We DO NOT decrypt here. We upload the ciphertext directly to ensure privacy.
  const backupPayload = {
    profile: localStorage.getItem('shadowlink_profile'),
    contacts: localStorage.getItem('shadowlink_contacts'),
    history: localStorage.getItem('shadowlink_history'),
    // Note: We generally do NOT sync the salt, as that would allow anyone with the password to decrypt on the server if compromised.
    // The user must remember their password/salt or manually transfer it.
    // HOWEVER, for a simple user experience where they just want to sync between devices using a password,
    // we can sync the salt. 
    salt: localStorage.getItem('shadowlink_salt'),
    lastUpdated: Date.now()
  };

  try {
    await setDoc(doc(db, "users", userId), {
        encryptedData: JSON.stringify(backupPayload)
    });
    return true;
  } catch (e) {
    console.error("Cloud Upload Failed:", e);
    throw e;
  }
};

export const syncDownFromCloud = async (userId: string) => {
  initFirebase();
  if (!db || !userId) throw new Error("Database not connected");

  try {
    const docRef = doc(db, "users", userId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const data = docSnap.data();
      const payload = JSON.parse(data.encryptedData);

      // Restore to LocalStorage
      // Warning: This overwrites local data
      if (payload.profile) localStorage.setItem('shadowlink_profile', payload.profile);
      if (payload.contacts) localStorage.setItem('shadowlink_contacts', payload.contacts);
      if (payload.history) localStorage.setItem('shadowlink_history', payload.history);
      if (payload.salt) localStorage.setItem('shadowlink_salt', payload.salt);
      
      return true;
    } else {
      throw new Error("No cloud backup found for this ID");
    }
  } catch (e) {
    console.error("Cloud Download Failed:", e);
    throw e;
  }
};