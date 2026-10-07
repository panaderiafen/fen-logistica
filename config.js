// ═══════════════════════════════════════════════
//  fën · Órdenes B2B (logística) — configuración  v1.0.0
//  (i) La configuración web de Firebase no es secreta: solo dice cuál es el
//  proyecto (fen-b2b). Lo que protege los datos son las reglas de fen-b2b y
//  la cuenta de la persona (logistica/{uid}).
// ═══════════════════════════════════════════════
window.FEN_LOG = {
  VERSION: '1.1.0',
  // Proyecto fen-b2b (no es secreto: solo dice cuál es el proyecto)
  firebase: {
    apiKey: 'AIzaSyAXp78b1DrjbBZnWRWsjC0MkuPWBaUm32A',
    authDomain: 'fen-b2b.firebaseapp.com',
    projectId: 'fen-b2b',
    storageBucket: 'fen-b2b.firebasestorage.app',
    messagingSenderId: '8681232347',
    appId: '1:8681232347:web:b2c824d7df386dc7d4b9fe'
  },
  // Recetas que publica Producción (para pedir productos nuevos)
  RECETAS_CSV_URL: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRKvAbWUlwxbcCx54T3lfdMa8XxPD-F2lSE05-vMfdv_UpFVpDi6pbAJOpM7O6LBLmdfkz5804lzMYn/pub?gid=1370945279&single=true&output=csv',
  DIAS_LISTA: 14,     // la lista muestra las órdenes de estos días + todas las sin folio
  DATOS_EMPRESA: { direccion: 'Ainavillo 764, Concepción', telefono: '+56 9 4147 3683', correo: 'panaderiafen@gmail.com', web: 'WWW.PANADERIAFEN.CL · @PANADERIAFEN' }
};
