// video-player-core.js
// Lógica completa del reproductor optimizada

class VideoPlayer {
  constructor() {
    this.DB = typeof players !== 'undefined' ? players : {};
    this.params = new URLSearchParams(location.search);
    this.animeId = this.params.get('anime');
    this.season = this.params.get('s');
    this.episode = this.params.get('e');
    
    this.auth = null;
    this.db = null;
    this.storage = null;
    this.currentUser = null;
    
    this.emojiList = ['😀','😃','😄','😁','😆','😅','😂','🤣','😊','😇','🙂','🙃','😉','😌','😍','🥰','😘','😗','😙','😚','😋','😛','😝','😜','🤪','🤨','🧐','🤓','😎','🤩','🥳','😏','😒','😞','😔','😟','😕','🙁','☹️','😣','😖','😫','😩','🥺','😢','😭','😤','😠','😡','🤬','🤯','😳','🥵','🥶','😱','😨','😰','😥','😓','🤗','🤔','🤭','🤫','🤥','😶','😐','😑','😬','🙄','😯','😦','😧','😮','😲','🥱','😴','💤','💩','👻','💀','👽','🤖','🎃','😺','😸','😹','😻','😼','😽','🙀','😿','😾','❤️','🧡','💛','💚','💙','💜','🖤','🤍','💔','💖','💗','💓','💕','💞','🔥','✨','⭐','🌟','💫','💥','💢','💦','💧','🎉','🎊','🎈'];
    
    this.initFirebase();
    this.initUI();
    this.loadEpisodeData();
    this.setupAuthUI();
  }
  
  initFirebase() {
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
    
    this.auth = firebase.auth();
    this.db = firebase.firestore();
    this.storage = firebase.storage();
    
    this.auth.onAuthStateChanged(user => {
      this.currentUser = user;
      this.updateCommentFormVisibility();
      if (typeof initComentariosSystem === 'function') {
        initComentariosSystem(this.db, this.auth);
      }
      if (typeof initStickersSystem === 'function') {
        initStickersSystem(this.db, this.auth);
      }
    });
  }
  
  initUI() {
    // Back link
    const backLink = document.getElementById('backLink');
    if (backLink && this.animeId) {
      backLink.href = `anime-detail.html?id=${this.animeId}`;
    }
    
    // Panel de emojis
    const emojiPanel = document.getElementById('emojiPanel');
    if (emojiPanel) {
      emojiPanel.innerHTML = this.emojiList.map(e => 
        `<div class="emoji-option" onclick="window.videoPlayer?.insertEmoji('${e}')">${e}</div>`
      ).join('');
    }
    
    // Enviar con Enter
    const textarea = document.getElementById('comentarioTexto');
    if (textarea) {
      textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.enviarComentario();
        }
      });
    }
    
    // Tabs de stickers
    document.querySelectorAll('.sticker-tab').forEach(tab => {
      tab.addEventListener('click', () => this.switchStickerTab(tab.dataset.tab));
    });
    
    // Upload de sticker
    const fileInput = document.getElementById('stickerFileInput');
    if (fileInput) {
      fileInput.addEventListener('change', (e) => this.uploadSticker(e.target.files[0]));
    }
  }
  
  loadEpisodeData() {
    const epData = this.DB[this.animeId]?.[this.season]?.[this.episode];
    if (!epData) {
      document.getElementById('epTitle').innerText = 'Episodio no encontrado';
      return;
    }
    
    document.title = `Ver ${epData.title} - Archinime`;
    document.getElementById('epTitle').innerText = epData.title;
    
    const initialLink = epData.link || epData.link2;
    this.updateDownloadButton(initialLink);
    this.loadVideo(initialLink);
    
    // Servidores
    const serverContainer = document.getElementById('serverOptions');
    serverContainer.innerHTML = '';
    if (epData.link) this.createServerButton('Latino', epData.link, true);
    if (epData.link2) this.createServerButton('Opción 2', epData.link2, !epData.link);
    
    this.setupNavigation();
    this.autoMarkAsWatched();
  }
  
  createServerButton(label, url, isActive) {
    const container = document.getElementById('serverOptions');
    const btn = document.createElement('button');
    btn.className = 'opt-btn' + (isActive ? ' active' : '');
    btn.innerText = label;
    btn.onclick = () => {
      document.querySelectorAll('.opt-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      this.updateDownloadButton(url);
      this.loadVideo(url);
    };
    container.appendChild(btn);
  }
  
  loadVideo(url) {
    const container = document.getElementById('mediaContainer');
    container.innerHTML = '';
    if (!url) return;
    
    const isVideoFile = /\.(mp4|webm|ogg|mov|m3u8)$/i.test(url);
    if (isVideoFile && !url.includes('drive.google.com')) {
      const video = document.createElement('video');
      video.src = url;
      video.controls = true;
      video.style.width = '100%';
      video.style.height = '100%';
      container.appendChild(video);
    } else {
      const iframe = document.createElement('iframe');
      iframe.src = url;
      iframe.allow = 'autoplay; fullscreen';
      iframe.allowFullscreen = true;
      iframe.style.width = '100%';
      iframe.style.height = '100%';
      container.appendChild(iframe);
    }
  }
  
  updateDownloadButton(url) {
    const btn = document.getElementById('downloadBtn');
    const directLink = this.generateDirectLink(url);
    btn.href = directLink;
    if (this.isMobile()) btn.target = '_blank';
  }
  
  generateDirectLink(url) {
    if (!url) return '#';
    if (url.includes('drive.google.com')) {
      const match = url.match(/\/d\/(.+?)\//);
      if (match) return `https://drive.usercontent.google.com/download?id=${match[1]}&export=download`;
    }
    if (url.includes('dropbox.com') && url.includes('dl=0')) {
      return url.replace('dl=0', 'dl=1');
    }
    return url;
  }
  
  isMobile() {
    return /android|webos|iphone|ipad|ipod|blackberry/i.test(navigator.userAgent.toLowerCase());
  }
  
  setupNavigation() {
    if (!this.DB[this.animeId]) return;
    
    const flat = [];
    Object.keys(this.DB[this.animeId]).sort((a,b) => Number(a)-Number(b)).forEach(sKey => {
      Object.keys(this.DB[this.animeId][sKey]).sort((a,b) => Number(a)-Number(b)).forEach(eKey => {
        flat.push({ s: sKey, e: eKey });
      });
    });
    
    const idx = flat.findIndex(i => i.s === this.season && i.e === this.episode);
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    
    if (idx > 0) {
      prevBtn.classList.remove('btn-hidden');
      prevBtn.href = `?anime=${this.animeId}&s=${flat[idx-1].s}&e=${flat[idx-1].e}`;
    }
    if (idx < flat.length - 1) {
      nextBtn.classList.remove('btn-hidden');
      nextBtn.href = `?anime=${this.animeId}&s=${flat[idx+1].s}&e=${flat[idx+1].e}`;
    }
  }
  
  async autoMarkAsWatched() {
    const aId = this.animeId;
    const sNum = parseInt(this.season);
    const eNum = parseInt(this.episode);
    if (!aId || isNaN(sNum) || isNaN(eNum)) return;
    
    if (this.currentUser) {
      try {
        const docRef = this.db.collection('watchHistory').doc(this.currentUser.uid);
        const doc = await docRef.get();
        let data = doc.exists ? doc.data() : {};
        let animeData = data[aId] || {};
        let seasonData = animeData[sNum] || [];
        if (!seasonData.includes(eNum)) {
          seasonData.push(eNum);
          animeData[sNum] = seasonData;
          data[aId] = animeData;
          await docRef.set(data, { merge: true });
        }
      } catch (e) {
        console.warn('Error al marcar como visto:', e);
      }
    } else {
      localStorage.setItem(`watched_${aId}_${sNum}_${eNum}`, 'true');
    }
  }
  
  // ===== UI DE AUTENTICACIÓN =====
  setupAuthUI() {
    document.querySelectorAll('.auth-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const tabName = tab.dataset.tab;
        document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById('authLoginForm').style.display = tabName === 'login' ? 'flex' : 'none';
        document.getElementById('authRegisterForm').style.display = tabName === 'register' ? 'flex' : 'none';
      });
    });
  }
  
  openLoginModal() {
    document.getElementById('authModal').classList.add('show');
  }
  
  closeAuthModal() {
    document.getElementById('authModal').classList.remove('show');
    document.getElementById('authError').innerText = '';
  }
  
  async loginWithEmail() {
    const email = document.getElementById('loginEmail').value;
    const pass = document.getElementById('loginPassword').value;
    try {
      await this.auth.signInWithEmailAndPassword(email, pass);
      this.closeAuthModal();
    } catch (e) {
      document.getElementById('authError').innerText = e.message;
    }
  }
  
  async registerWithEmail() {
    const email = document.getElementById('registerEmail').value;
    const pass = document.getElementById('registerPassword').value;
    const confirm = document.getElementById('registerConfirm').value;
    if (pass !== confirm) {
      document.getElementById('authError').innerText = 'Las contraseñas no coinciden';
      return;
    }
    try {
      await this.auth.createUserWithEmailAndPassword(email, pass);
      this.closeAuthModal();
    } catch (e) {
      document.getElementById('authError').innerText = e.message;
    }
  }
  
  async loginWithGoogle() {
    const provider = new firebase.auth.GoogleAuthProvider();
    try {
      await this.auth.signInWithPopup(provider);
      this.closeAuthModal();
    } catch (e) {
      document.getElementById('authError').innerText = e.message;
    }
  }
  
  async loginWithGitHub() {
    const provider = new firebase.auth.GithubAuthProvider();
    try {
      await this.auth.signInWithPopup(provider);
      this.closeAuthModal();
    } catch (e) {
      document.getElementById('authError').innerText = e.message;
    }
  }
  
  // ===== COMENTARIOS =====
  updateCommentFormVisibility() {
    const loginMsg = document.getElementById('comentarioLoginMessage');
    const form = document.getElementById('comentarioFormContainer');
    const avatar = document.getElementById('comentarioUserAvatar');
    const nameSpan = document.getElementById('comentarioUserName');
    
    if (this.currentUser) {
      if (loginMsg) loginMsg.style.display = 'none';
      if (form) {
        form.style.display = 'block';
        if (avatar) avatar.src = this.currentUser.photoURL || 'invitado.avif';
        if (nameSpan) nameSpan.innerText = this.currentUser.displayName || this.currentUser.email?.split('@')[0] || 'Usuario';
      }
    } else {
      if (loginMsg) loginMsg.style.display = 'block';
      if (form) form.style.display = 'none';
    }
  }
  
  toggleEmojiPanel() {
    const panel = document.getElementById('emojiPanel');
    panel.classList.toggle('active');
  }
  
  insertEmoji(emoji) {
    const textarea = document.getElementById('comentarioTexto');
    textarea.value += emoji;
    textarea.focus();
  }
  
  toggleStickerPanel() {
    const panel = document.getElementById('stickerPanelFull');
    panel.classList.toggle('active');
    if (panel.classList.contains('active') && typeof cargarStickersUsuario === 'function') {
      cargarStickersUsuario();
    }
  }
  
  switchStickerTab(tabId) {
    document.querySelectorAll('.sticker-tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`.sticker-tab[data-tab="${tabId}"]`).classList.add('active');
    document.querySelectorAll('.sticker-tab-content').forEach(c => c.classList.remove('active'));
    document.getElementById(tabId === 'mis' ? 'misStickersTab' : 'subirStickersTab').classList.add('active');
  }
  
  async uploadSticker(file) {
    if (!file) return;
    if (!this.currentUser) {
      alert('Inicia sesión para subir stickers');
      return;
    }
    // Lógica de subida (delegada a stickers-system.js si existe)
    if (typeof subirStickerPersonalizado === 'function') {
      await subirStickerPersonalizado(file, this.currentUser.uid);
    }
  }
  
  enviarComentario() {
    if (typeof enviarComentarioTexto === 'function') {
      enviarComentarioTexto();
    } else {
      alert('Sistema de comentarios no disponible');
    }
  }
}

// Inicializar cuando todo esté listo
window.addEventListener('load', () => {
  window.videoPlayer = new VideoPlayer();
  
  // Exponer funciones globales que usan los onclick
  window.openLoginModalFromComent = () => window.videoPlayer?.openLoginModal();
});