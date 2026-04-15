// ==================== app-core.js ====================
// Inicialización centralizada de Firebase, estado global y utilidades

// 1. CONFIGURACIÓN E INICIALIZACIÓN DE FIREBASE
const firebaseConfig = {
  apiKey: "AIzaSyBpzYARIxaJijLbbL-2S6F9MWecbAbvK_I",
  authDomain: "login-admin-archinime.firebaseapp.com",
  projectId: "login-admin-archinime",
  storageBucket: "login-admin-archinime.firebasestorage.app",
  messagingSenderId: "938164660242",
  appId: "1:938164660242:web:648e0dce0e0d18dd78d0cb"
};

// Evitamos inicializaciones duplicadas en otros archivos
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

// 2. EXPOSICIÓN GLOBAL DE INSTANCIAS (Para que los otros scripts no tengan que buscarlas)
window.auth = firebase.auth();
window.db = firebase.firestore();
window.providerGoogle = new firebase.auth.GoogleAuthProvider();
window.providerGitHub = new firebase.auth.GithubAuthProvider();

// Forzamos la persistencia local de la sesión
window.auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);

// Configuración de Cloudinary para avatares
const CLOUDINARY_URL = 'https://api.cloudinary.com/v1_1/dbcqcai1q/upload';
const CLOUDINARY_PRESET = 'stickers_archinime';

// 3. ESTADO GLOBAL DE USUARIO
window.currentUser = null;
let newAvatarUrl = null;
let lastProfileUpdate = 0;

// Función para obtener un color neón basado en un string (fallback)
function getNeonColorFallback(str) {
  const neonColors = ['#00fff7', '#ff0055', '#bc13fe', '#00ff33', '#ffff00', '#ffaa00', '#ff00aa', '#00aaff'];
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return neonColors[Math.abs(hash) % neonColors.length];
}

// Funciones de control de scroll
function disableBodyScroll() {
  const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
  document.body.style.paddingRight = scrollbarWidth + 'px';
  document.body.classList.add('modal-open');
  document.documentElement.classList.add('modal-open');
}

function enableBodyScroll() {
  document.body.style.paddingRight = '';
  document.body.classList.remove('modal-open');
  document.documentElement.classList.remove('modal-open');
}

// ==================== MODAL DE AUTENTICACIÓN ====================
window.showAuthModal = function() {
  const modal = document.getElementById('authModal');
  if (modal) modal.classList.add('show');
  disableBodyScroll();
};

window.closeAuthModal = function() {
  const modal = document.getElementById('authModal');
  if (modal) modal.classList.remove('show');
  enableBodyScroll();
  const errorDiv = document.getElementById('authError');
  if (errorDiv) errorDiv.innerText = '';
};

window.loginWithEmail = async function() {
  const email = document.getElementById('loginEmail').value;
  const pass = document.getElementById('loginPassword').value;
  try { await window.auth.signInWithEmailAndPassword(email, pass); closeAuthModal(); } 
  catch (err) { document.getElementById('authError').innerText = err.message; }
};

window.registerWithEmail = async function() {
  const email = document.getElementById('registerEmail').value;
  const pass = document.getElementById('registerPassword').value;
  const confirm = document.getElementById('registerConfirm').value;
  if (pass !== confirm) {
    document.getElementById('authError').innerText = 'Las contraseñas no coinciden';
    return;
  }
  try { await window.auth.createUserWithEmailAndPassword(email, pass); closeAuthModal(); } 
  catch (err) { document.getElementById('authError').innerText = err.message; }
};

window.loginWithGoogle = async function() {
  try { await window.auth.signInWithPopup(window.providerGoogle); closeAuthModal(); } 
  catch (err) { document.getElementById('authError').innerText = err.message; }
};

window.loginWithGitHub = async function() {
  try { await window.auth.signInWithPopup(window.providerGitHub); closeAuthModal(); } 
  catch (err) { document.getElementById('authError').innerText = err.message; }
};

window.logoutUser = function() {
  window.auth.signOut().then(() => location.reload());
};

// ==================== SINCRONIZACIÓN DE UI Y ESTADO ====================
function updateUserUI(user) {
  // Aquí hacemos la variable accesible globalmente para comentarios.js y stickers.js
  window.currentUser = user;
  
  // Compatibilidad con tu state.js si existe
  if (window.ArchinimeState) {
    window.ArchinimeState.set('currentUser', user);
  }

  // Disparamos un evento para avisar a otros scripts que la sesión ya cargó
  document.dispatchEvent(new CustomEvent('archinimeSessionReady', { detail: { user } }));

  const avatarBtn = document.getElementById('userAvatarBtn');
  const dropdownAvatar = document.getElementById('dropdownAvatar');
  const dropdownName = document.getElementById('dropdownName');
  const loginItem = document.getElementById('loginBtnItem');

  if (!avatarBtn || !dropdownAvatar || !dropdownName || !loginItem) return;

  if (user) {
    const photoURL = user.photoURL || 'invitado.avif';
    avatarBtn.src = photoURL;
    dropdownAvatar.src = photoURL;
    dropdownName.innerText = user.displayName || user.email.split('@')[0];
    loginItem.innerHTML = '<i class="fas fa-sign-out-alt"></i> Cerrar sesión';
    loginItem.onclick = logoutUser;

    window.db.collection('users').doc(user.uid).get().then(doc => {
      let color = (doc.exists && doc.data().customColor) ? doc.data().customColor : getNeonColorFallback(user.uid || user.displayName || user.email);
      avatarBtn.style.borderColor = color;
      avatarBtn.style.boxShadow = `0 0 15px ${color}`;
      dropdownAvatar.style.borderColor = color;
      dropdownAvatar.style.boxShadow = `0 0 15px ${color}`;
      dropdownName.style.color = color;
      dropdownName.style.textShadow = `0 0 8px ${color}`;
    });
  } else {
    avatarBtn.src = 'invitado.avif';
    dropdownAvatar.src = 'invitado.avif';
    dropdownName.innerText = 'Invitado';
    loginItem.innerHTML = '<i class="fas fa-sign-in-alt"></i> Iniciar sesión';
    loginItem.onclick = showAuthModal;
    avatarBtn.style.borderColor = 'var(--neon-cyan)';
    avatarBtn.style.boxShadow = 'none';
    dropdownAvatar.style.borderColor = 'var(--neon-cyan)';
    dropdownAvatar.style.boxShadow = 'none';
    dropdownName.style.color = 'var(--neon-cyan)';
    dropdownName.style.textShadow = 'none';
  }

  // === CONEXIÓN CON SISTEMAS SECUNDARIOS ===
  // Verificamos si las funciones de los otros archivos existen y las inicializamos
  if (typeof initComentariosSystem === 'function') {
      initComentariosSystem(window.db, window.auth);
  }
  
  if (typeof initStickersSystem === 'function') {
      initStickersSystem(window.db, window.auth);
  }

  // Si tienes el reproductor, también le avisamos
  if (window.videoPlayer) {
      window.videoPlayer.auth = window.auth;
      window.videoPlayer.db = window.db;
  }
}

// Observador principal de estado de autenticación
window.auth.onAuthStateChanged(updateUserUI);

// ==================== MODAL DE PERFIL Y EDICIÓN ====================
window.showProfileModal = function() {
  if (!window.currentUser) {
    showAuthModal();
    const errorDiv = document.getElementById('authError');
    if (errorDiv) errorDiv.innerText = "⚠️ Inicia sesión para configurar tu perfil.";
    return;
  }
  const profileAvatar = document.getElementById('profileAvatar');
  const profileUid = document.getElementById('profileUid');
  const profileDisplayName = document.getElementById('profileDisplayName');
  const profileNameColor = document.getElementById('profileNameColor');

  if (profileAvatar) profileAvatar.src = window.currentUser.photoURL || 'invitado.avif';
  newAvatarUrl = window.currentUser.photoURL;
  if (profileUid) profileUid.value = window.currentUser.uid;
  if (profileDisplayName) profileDisplayName.value = window.currentUser.displayName || window.currentUser.email.split('@')[0];

  window.db.collection('users').doc(window.currentUser.uid).get().then(doc => {
    let color = (doc.exists && doc.data().customColor) ? doc.data().customColor : getNeonColorFallback(window.currentUser.uid || window.currentUser.displayName || window.currentUser.email);
    if (profileNameColor) profileNameColor.value = color;
    if (doc.exists && doc.data().lastProfileUpdate) lastProfileUpdate = doc.data().lastProfileUpdate.toMillis();
  });

  const modal = document.getElementById('profileModal');
  if (modal) modal.classList.add('show');
  disableBodyScroll();
};

window.closeProfileModal = function() {
  const modal = document.getElementById('profileModal');
  if (modal) modal.classList.remove('show');
  enableBodyScroll();
};

window.copiarUID = function() {
  const uidInput = document.getElementById('profileUid');
  if (uidInput && uidInput.value) {
    navigator.clipboard.writeText(uidInput.value);
    const statusMsg = document.getElementById('profileStatusMsg');
    if (statusMsg) {
      statusMsg.style.color = '#00fff7';
      statusMsg.innerText = '¡ID copiado al portapapeles!';
      setTimeout(() => { if(statusMsg.innerText.includes('copiado')) statusMsg.innerText = ''; }, 3000);
    }
  }
};

// Subir avatar a Cloudinary
document.addEventListener('change', function(e) {
  if (e.target && e.target.id === 'profileAvatarInput') {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { alert('La imagen es muy pesada. Máximo 2 MB.'); e.target.value = ''; return; }
    const btnLabel = document.querySelector('#profileModal .profile-upload-btn');
    if (btnLabel) btnLabel.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Subiendo...';
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', CLOUDINARY_PRESET);
    
    fetch(CLOUDINARY_URL, { method: 'POST', body: formData })
      .then(res => res.json())
      .then(data => {
        if (data.secure_url) {
          newAvatarUrl = data.secure_url;
          const profileAvatar = document.getElementById('profileAvatar');
          if (profileAvatar) profileAvatar.src = newAvatarUrl;
        }
      })
      .catch(() => alert("Error subiendo la imagen."))
      .finally(() => { if (btnLabel) btnLabel.innerHTML = '<i class="fas fa-upload"></i> Subir nuevo avatar'; });
  }
});

window.guardarCambiosPerfil = async function() {
  if (!window.currentUser) return;
  const saveBtn = document.getElementById('profileSaveBtn');
  const statusMsg = document.getElementById('profileStatusMsg');
  const newName = document.getElementById('profileDisplayName')?.value.trim();
  const newColor = document.getElementById('profileNameColor')?.value;

  if (!newName) { 
      if(statusMsg) { statusMsg.style.color = '#ff0055'; statusMsg.innerText = 'El nombre no puede estar vacío.'; } 
      return; 
  }
  
  const isAdmin = window.currentUser.email === 'archinime12@gmail.com';
  const now = Date.now();
  const fiveDaysMs = 5 * 24 * 60 * 60 * 1000;

  if (!isAdmin && lastProfileUpdate > 0 && (now - lastProfileUpdate < fiveDaysMs)) {
    const daysLeft = Math.ceil((fiveDaysMs - (now - lastProfileUpdate)) / (1000 * 60 * 60 * 24));
    if(statusMsg) { statusMsg.style.color = '#ff0055'; statusMsg.innerText = `⏳ Has cambiado tu perfil recientemente. Vuelve a intentarlo en ${daysLeft} días.`; }
    return;
  }
  
  if (saveBtn) { saveBtn.disabled = true; saveBtn.innerText = 'GUARDANDO...'; }
  if(statusMsg) statusMsg.innerText = '';
  
  try {
    await window.currentUser.updateProfile({ displayName: newName, photoURL: newAvatarUrl });
    await window.db.collection('users').doc(window.currentUser.uid).set({
      customColor: newColor,
      lastProfileUpdate: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    if(statusMsg) { statusMsg.style.color = '#fff'; statusMsg.innerText = 'Actualizando comentarios históricos...'; }
    
    const commentsRef = window.db.collection('comments').where('userId', '==', window.currentUser.uid);
    const snapshot = await commentsRef.get();
    const batch = window.db.batch();
    snapshot.forEach(doc => {
      batch.update(doc.ref, { userName: newName, userAvatar: newAvatarUrl, customColor: newColor });
    });
    if (snapshot.size > 0) await batch.commit();
    
    lastProfileUpdate = Date.now();
    if(statusMsg) { statusMsg.style.color = '#00fff7'; statusMsg.innerText = '¡Cambios guardados exitosamente!'; }
    updateUserUI(window.currentUser); // Refrescar visuales localmente
  } catch (err) {
    console.error(err);
    if(statusMsg) { statusMsg.style.color = '#ff0055'; statusMsg.innerText = 'Error al guardar los cambios.'; }
  } finally {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.innerText = 'GUARDAR CAMBIOS'; }
  }
};

// Pestañas del modal de autenticación
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const target = tab.getAttribute('data-tab');
      const loginForm = document.getElementById('authLoginForm');
      const registerForm = document.getElementById('authRegisterForm');
      if (target === 'login') {
        if (loginForm) loginForm.style.display = 'flex';
        if (registerForm) registerForm.style.display = 'none';
      } else {
        if (loginForm) loginForm.style.display = 'none';
        if (registerForm) registerForm.style.display = 'flex';
      }
    });
  });

  // Eventos del menú de usuario
  const profileDropdownBtn = document.getElementById('profileDropdownBtn');
  if (profileDropdownBtn) {
    profileDropdownBtn.addEventListener('click', (e) => { e.stopPropagation(); showProfileModal(); });
  }
  const userAvatarBtn = document.getElementById('userAvatarBtn');
  const userDropdown = document.getElementById('userDropdown');
  if (userAvatarBtn && userDropdown) {
    userAvatarBtn.addEventListener('click', e => { e.stopPropagation(); userDropdown.classList.toggle('active'); });
    document.addEventListener('click', e => { if (!userAvatarBtn.contains(e.target) && !userDropdown.contains(e.target)) userDropdown.classList.remove('active'); });
  }
});