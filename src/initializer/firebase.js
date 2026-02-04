

// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBj5ffv-VNRqxkiaWKUhzY4FBKRkzp5rW4",
  authDomain: "hojaservice-3ab3d.firebaseapp.com",
  projectId: "hojaservice-3ab3d",
  storageBucket: "hojaservice-3ab3d.firebasestorage.app",
  messagingSenderId: "747179979894",
  appId: "1:747179979894:web:0a86e472eb8b34fb7e5b57",
  measurementId: "G-CP172JQXTD"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

// ✅ ESTA LINEA ES LA CLAVE
export const db = getFirestore(app);
export const auth = getAuth(app); 