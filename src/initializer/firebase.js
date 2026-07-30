import { deleteApp, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { initializeFirestore } from "firebase/firestore";

export const firebaseConfig = {
  apiKey: "AIzaSyBj5ffv-VNRqxkiaWKUhzY4FBKRkzp5rW4",
  authDomain: "hojaservice-3ab3d.firebaseapp.com",
  projectId: "hojaservice-3ab3d",
  storageBucket: "hojaservice-3ab3d.firebasestorage.app",
  messagingSenderId: "747179979894",
  appId: "1:747179979894:web:0a86e472eb8b34fb7e5b57",
  measurementId: "G-CP172JQXTD"
};

const app = initializeApp(firebaseConfig);

const isLocalDevHost =
  typeof window !== "undefined" &&
  ["localhost", "127.0.0.1"].includes(window.location.hostname);

const firestoreSettings = {
  ignoreUndefinedProperties: true,
  useFetchStreams: false,
  ...(isLocalDevHost
    ? {
        experimentalForceLongPolling: true,
      }
    : {
        experimentalAutoDetectLongPolling: true,
      }),
};

// Exporta las conexiones compartidas para autenticacion y Firestore.
export const db = initializeFirestore(app, firestoreSettings);
export const auth = getAuth(app);

export function createSecondaryAuthClient() {
  const name = `secondary-auth-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const secondaryApp = initializeApp(firebaseConfig, name);
  const secondaryAuth = getAuth(secondaryApp);

  return {
    app: secondaryApp,
    auth: secondaryAuth,
    dispose: async () => {
      await deleteApp(secondaryApp).catch(() => {});
    },
  };
}
