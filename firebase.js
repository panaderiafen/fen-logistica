// fën · Órdenes B2B — conexión con Firebase (proyecto fen-b2b). Todo lo de Firebase entra por aquí.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, setPersistence, browserLocalPersistence } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, getDoc, getDocs, query, where, onSnapshot, runTransaction, addDoc, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const app = initializeApp(window.FEN_LOG.firebase, 'fen-logistica');
export const auth = getAuth(app);
// Guarda lo leído en el equipo: al abrir de nuevo, la lista aparece al tiro y solo baja lo que cambió
let db0;
try { db0 = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) }); }
catch (e) { db0 = initializeFirestore(app, {}); }
export const db = db0;
export { onAuthStateChanged, signInWithEmailAndPassword, signOut, setPersistence, browserLocalPersistence,
  collection, doc, getDoc, getDocs, query, where, onSnapshot, runTransaction, addDoc, serverTimestamp };
