// app-core.js
// Inicialización central de Firebase y estado del usuario
// ACTUALIZADO: Sistema de presencia y contador global

// ========== CONFIGURACIÓN DE FIREBASE ==========
const firebaseConfig = {
  apiKey: "AIzaSyBpzYARIxaJijLbbL-2S6F9MWecbAbvK_I",
  authDomain: "login-admin-archinime.firebaseapp.com",
  projectId: "login-admin-archinime",
  storageBucket: "login-admin-archinime.firebasestorage.app",
  messagingSenderId: "938164660242",
  appId: "1:938164660242:web:648e0dce0e0d18dd78d0cb"
};

// Inicializar Firebase solo si no está ya inicializado
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

// Establecer persistencia local para la sesión
firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL);

// Exportar instancias globales
const auth = firebase.auth();
const db = firebase.firestore();

// ========== ESTADO GLOBAL DEL USUARIO ==========
window.currentUser = null;

// Función para actualizar la UI en función del usuario
function updateUserUI(user) {
  window.currentUser = user;
  if (user) {
    if (window.syncNotificationsWithCloud) {
      requestIdleCallback(() => window.syncNotificationsWithCloud(user.uid));
    }
    if (window.listenForReplies) {
      requestIdleCallback(() => window.listenForReplies(user.uid));
    }
  }
  const event = new CustomEvent('userChanged', { detail: { user } });
  document.dispatchEvent(event);
}

// Escuchar cambios de autenticación
auth.onAuthStateChanged(user => {
  window.currentUser = user;
  if (window.ArchinimeState) {
    window.ArchinimeState.set('currentUser', user);
  }
  updateUserUI(user);
  if (user) {
    if (window.syncNotificationsWithCloud) {
      requestIdleCallback(() => window.syncNotificationsWithCloud(user.uid));
    }
    if (window.listenForReplies) {
      requestIdleCallback(() => window.listenForReplies(user.uid));
    }
  } else {
    if (window.repliesUnsubscribe) window.repliesUnsubscribe();
  }
});

// ========== FUNCIONES DE AUTENTICACIÓN ==========
window.loginWithEmail = async () => {
  const email = document.getElementById('loginEmail')?.value;
  const password = document.getElementById('loginPassword')?.value;
  if (!email || !password) {
    alert('Completa todos los campos');
    return;
  }
  try {
    await auth.signInWithEmailAndPassword(email, password);
    const modal = document.getElementById('authModal');
    if (modal) modal.classList.remove('show');
  } catch (error) {
    console.error('Error en login:', error);
    const errorEl = document.getElementById('authError');
    if (errorEl) errorEl.innerText = error.message;
    else alert(error.message);
  }
};

window.registerWithEmail = async () => {
  const email = document.getElementById('registerEmail')?.value;
  const password = document.getElementById('registerPassword')?.value;
  const confirm = document.getElementById('registerConfirm')?.value;
  if (!email || !password || !confirm) {
    alert('Completa todos los campos');
    return;
  }
  if (password !== confirm) {
    alert('Las contraseñas no coinciden');
    return;
  }
  try {
    await auth.createUserWithEmailAndPassword(email, password);
    const modal = document.getElementById('authModal');
    if (modal) modal.classList.remove('show');
  } catch (error) {
    console.error('Error en registro:', error);
    const errorEl = document.getElementById('authError');
    if (errorEl) errorEl.innerText = error.message;
    else alert(error.message);
  }
};

window.loginWithGoogle = async () => {
  const provider = new firebase.auth.GoogleAuthProvider();
  try {
    await auth.signInWithPopup(provider);
    const modal = document.getElementById('authModal');
    if (modal) modal.classList.remove('show');
  } catch (error) {
    console.error('Error con Google:', error);
    const errorEl = document.getElementById('authError');
    if (errorEl) errorEl.innerText = error.message;
    else alert(error.message);
  }
};

window.loginWithGitHub = async () => {
  const provider = new firebase.auth.GithubAuthProvider();
  try {
    await auth.signInWithPopup(provider);
    const modal = document.getElementById('authModal');
    if (modal) modal.classList.remove('show');
  } catch (error) {
    console.error('Error con GitHub:', error);
    const errorEl = document.getElementById('authError');
    if (errorEl) errorEl.innerText = error.message;
    else alert(error.message);
  }
};

window.logout = async () => {
  try {
    const user = auth.currentUser;
    if (user) {
      await db.collection('stats').doc('onlineCount').set({
        count: firebase.firestore.FieldValue.increment(-1)
      }, { merge: true });
      await db.collection('users').doc(user.uid).set({
        online: false,
        lastSeen: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    }
    await auth.signOut();
    location.reload();
  } catch (error) {
    console.error('Error al cerrar sesión:', error);
  }
};

window.showAuthModal = () => {
  const modal = document.getElementById('authModal');
  if (modal) modal.classList.add('show');
};

window.closeAuthModal = () => {
  const modal = document.getElementById('authModal');
  if (modal) modal.classList.remove('show');
  const errorEl = document.getElementById('authError');
  if (errorEl) errorEl.innerText = '';
};

// ========== PRESENCIA Y CONTADOR GLOBAL ==========
window.isCurrentUserAdmin = function() {
  const user = auth.currentUser;
  if (!user) return false;
  const admins = ['archinime12@gmail.com', 'alejandroarchi12@gmail.com', 'lucioguapofeo@gmail.com'];
  return admins.includes(user.email);
};

window.getOnlineCount = async function() {
  try {
    const doc = await db.collection('stats').doc('onlineCount').get();
    return doc.exists ? doc.data().count || 0 : 0;
  } catch { return 0; }
};

window.updateActiveCounter = async function(elementId) {
  const el = document.getElementById(elementId);
  if (el) el.innerText = await window.getOnlineCount();
};

window.getUserList = async function() {
  if (!window.isCurrentUserAdmin()) throw new Error('No autorizado');
  const snapshot = await db.collection('users').orderBy('lastSeen', 'desc').get();
  const users = [];
  snapshot.forEach(doc => users.push({ id: doc.id, ...doc.data() }));
  return users;
};

// Sobrescribir updateUserUI para incluir presencia
const originalUpdateUserUI = window.updateUserUI || function() {};
window.updateUserUI = function(user) {
  originalUpdateUserUI(user);
  if (user) {
    const userRef = db.collection('users').doc(user.uid);
    userRef.set({
      online: true,
      lastSeen: firebase.firestore.FieldValue.serverTimestamp(),
      displayName: user.displayName || user.email?.split('@')[0] || 'Usuario',
      email: user.email || '',
      photoURL: user.photoURL || '',
    }, { merge: true });

    userRef.onDisconnect().set({
      online: false,
      lastSeen: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    db.collection('stats').doc('onlineCount').set({
      count: firebase.firestore.FieldValue.increment(1)
    }, { merge: true }).catch(console.warn);
  }
};

// ========== INICIALIZACIÓN ADICIONAL ==========
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    console.log('✅ app-core.js cargado y listo');
    // Crear documento de contador si no existe
    db.collection('stats').doc('onlineCount').get().then(doc => {
      if (!doc.exists) db.collection('stats').doc('onlineCount').set({ count: 0 });
    }).catch(console.warn);
  });
} else {
  console.log('✅ app-core.js cargado y listo');
  db.collection('stats').doc('onlineCount').get().then(doc => {
    if (!doc.exists) db.collection('stats').doc('onlineCount').set({ count: 0 });
  }).catch(console.warn);
}