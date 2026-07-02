// ملف إعداد Firebase المشترك بين جميع الصفحات
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyD6RHtfm6OFMF2DLnICNRdPdzZbHtIDGW8",
  authDomain: "ali2-6ae8d.firebaseapp.com",
  projectId: "ali2-6ae8d",
  storageBucket: "ali2-6ae8d.firebasestorage.app",
  messagingSenderId: "336998535201",
  appId: "1:336998535201:web:6155c74c7357f743531360"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
