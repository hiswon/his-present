// src/firebase.ts
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyCHeBnQDWGjL0t1hbAexa0LaPugUoVfu48",
  authDomain: "nextmalsm.firebaseapp.com",
  databaseURL: "https://nextmalsm-default-rtdb.firebaseio.com",
  projectId: "nextmalsm",
  storageBucket: "nextmalsm.firebasestorage.app",
  messagingSenderId: "863334383763",
  appId: "1:863334383763:web:9cf1226602b45e0a0d0d66",
  measurementId: "G-7Z09DLGCQ4"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);