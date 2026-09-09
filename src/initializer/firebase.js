import { deleteApp, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { initializeFirestore } from "firebase/firestore";

export const firebaseConfig = {
  apiKey: "AIzaSyAejG1aDFn_5zqM3hePPW6m0uzqUH0X0_4",
  authDomain: "cajalibre-b4ca5.firebaseapp.com",
  projectId: "cajalibre-b4ca5",
  storageBucket: "cajalibre-b4ca5.firebasestorage.app",
  messagingSenderId: "1039326139431",
  appId: "1:1039326139431:web:f7cf205be9cf03a703aa02",
  measurementId: "G-T2VV42Z408"
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
