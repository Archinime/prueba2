// app-core.js
// Inicializar Firebase solo cuando sea necesario o después de carga
const firebaseConfig = { ... };
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Estado global del usuario
window.currentUser = null;

// Escuchar cambios de autenticación
auth.onAuthStateChanged(user => {
  window.currentUser = user;
  updateUserUI(user);
  if (user) {
    // Solo ahora sincronizar notificaciones en la nube (usando requestIdleCallback)
    if (window.syncNotificationsWithCloud) {
      requestIdleCallback(() => window.syncNotificationsWithCloud(user.uid));
    }
    if (window.listenForReplies) {
      requestIdleCallback(() => window.listenForReplies(user.uid));
    }
  } else {
    // Limpiar suscripciones
  }
});

// Funciones de login/registro (conexión a los botones del modal)
window.loginWithEmail = async () => { ... };
// etc.