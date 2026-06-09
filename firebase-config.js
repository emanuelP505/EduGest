

// firebase-config.js



import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

const firebaseConfig = {
  apiKey: "AIzaSyBkOF8Az4NskBnGx1HyTY9wIfsFHC5aRjw",
     authDomain: "edugest-4bdc3.firebaseapp.com",
  projectId: "edugest-4bdc3",
  storageBucket: "edugest-4bdc3.firebasestorage.app",
  messagingSenderId: "1092615797287",
  appId: "1:1092615797287:web:177ab66d1134e04cb42c02",
  measurementId: "G-HD2H2CK0H6"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);