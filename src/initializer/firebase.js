import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBj5ffv-VNRqxkiaWKUhzY4FBKRkzp5rW4",
  authDomain: "hojaservice-3ab3d.firebaseapp.com",
  projectId: "hojaservice-3ab3d",
  storageBucket: "hojaservice-3ab3d.firebasestorage.app",
  messagingSenderId: "747179979894",
  appId: "1:747179979894:web:0a86e472eb8b34fb7e5b57",
  measurementId: "G-CP172JQXTD"
};

const app = initializeApp(firebaseConfig);
getAnalytics(app);

// Exporta las conexiones compartidas para autenticacion y Firestore.
export const db = getFirestore(app);
export const auth = getAuth(app);
