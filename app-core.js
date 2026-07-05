// app-core.js
// Inicialización central de Firebase, estado del usuario, presencia y admin

// ========== CONFIGURACIÓN DE FIREBASE ==========
const firebaseConfig = {
  apiKey: "AIzaSyBpzYARIxaJijLbbL-2S6F9MWecbAbvK_I",
  authDomain: "login-admin-archinime.firebaseapp.com",
  projectId: "login-admin-archinime",
  storageBucket: "login-admin-archinime.firebasestorage.app",
  messagingSenderId: "938164660242",
  appId: "1:938164660242:web:648e0dce0e0d18dd78d0cb"
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL);

const auth = firebase.auth();
const db = firebase.firestore();
window.db = db;
window.auth = auth;

// ========== FUNCIONES DE AUTENTICACIÓN (compatibles con el modal) ==========
window.loginWithEmail = async () => {
  const email = document.getElementById('loginEmail')?.value;
  const password = document.getElementById('loginPassword')?.value;
  if (!email || !password) return alert('Completa todos los campos');
  try {
    await auth.signInWithEmailAndPassword(email, password);
    const modal = document.getElementById('authModal');
    if (modal) modal.classList.remove('show');
  } catch (error) {
    const errorEl = document.getElementById('authError');
    if (errorEl) errorEl.innerText = error.message;
    else alert(error.message);
  }
};

window.registerWithEmail = async () => {
  const email = document.getElementById('registerEmail')?.value;
  const password = document.getElementById('registerPassword')?.value;
  const confirm = document.getElementById('registerConfirm')?.value;
  if (!email || !password || !confirm) return alert('Completa todos los campos');
  if (password !== confirm) return alert('Las contraseñas no coinciden');
  try {
    await auth.createUserWithEmailAndPassword(email, password);
    const modal = document.getElementById('authModal');
    if (modal) modal.classList.remove('show');
  } catch (error) {
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
    const errorEl = document.getElementById('authError');
    if (errorEl) errorEl.innerText = error.message;
    else alert(error.message);
  }
};

window.logout = async () => {
  try {
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
window.initPresence = function(user) {
  if (!user) return;
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
};

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

// Cierre de sesión con decremento del contador
window.logoutWithPresence = async function() {
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

// ========== INICIALIZACIÓN ==========
document.addEventListener('DOMContentLoaded', () => {
  // Crear documento de contador si no existe
  db.collection('stats').doc('onlineCount').get().then(doc => {
    if (!doc.exists) db.collection('stats').doc('onlineCount').set({ count: 0 });
  }).catch(console.warn);
  console.log('✅ app-core.js cargado');
});

// Escuchar cambios de autenticación para actualizar presencia
auth.onAuthStateChanged(user => {
  if (user) {
    window.initPresence(user);
  }
});