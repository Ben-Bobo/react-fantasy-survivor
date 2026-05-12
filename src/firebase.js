import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyC0qo5-HSXRcsL9UJ_VTHmRkdNW6f__1r0",
  authDomain: "survivor50-fantasy-c6314.firebaseapp.com",
  projectId: "survivor50-fantasy-c6314",
  storageBucket: "survivor50-fantasy-c6314.firebasestorage.app",
  messagingSenderId: "305887960513",
  appId: "1:305887960513:web:86cfa597f8e09ec4eca340"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);