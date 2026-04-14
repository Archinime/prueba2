// video-player-core.js - Versión Firestore + Estado central
// Obtiene los enlaces desde la colección 'catalogo'

class VideoPlayer {
  constructor() {
    this.params = new URLSearchParams(location.search);
    this.animeId = this.params.get('anime');
    this.season = this.params.get('s');
    this.episode = this.params.get('e');
    
    this.auth = null;
    this.db = null;
    this.storage = null;
    this.animeData = null;
    
    this.emojiList = ['😀','😃','😄','😁','😆','😅','😂','🤣','😊','😇','🙂','🙃','😉','😌','😍','🥰','😘','😗','😙','😚','😋','😛','😝','😜','🤪','🤨','🧐','🤓','😎','🤩','🥳','😏','😒','😞','😔','😟','😕','🙁','☹️','😣','😖','😫','😩','🥺','😢','😭','😤','😠','😡','🤬','🤯','😳','🥵','🥶','😱','😨','😰','😥','😓','🤗','🤔','🤭','🤫','🤥','😶','😐','😑','😬','🙄','😯','😦','😧','😮','😲','🥱','😴','💤','💩','👻','💀','👽','🤖','🎃','😺','😸','😹','😻','😼','😽','🙀','😿','😾','❤️','🧡','💛','💚','💙','💜','🖤','🤍','💔','💖','💗','💓','💕','💞','🔥','✨','⭐','🌟','💫','💥','💢','💦','💧','🎉','🎊','🎈'];
    
    window.comentariosAnimeId = this.animeId;
    window.comentariosSeason = this.season;
    window.comentariosEpisode = this.episode;
    
    this.initFirebase();
    this.initUI();
    this.loadEpisodeData();
    this.setupAuthUI();

    // EXPONEMOS LOS MÉTODOS, INCLUYENDO getCurrentUser
    window.videoPlayerMethods = {
      getCurrentUser: () => this.getCurrentUser(), 
      toggleEmojiPanel: () => this.toggleEmojiPanel(),
      toggleStickerPanel: () => this.toggleStickerPanel(),
      insertEmoji: (e) => this.insertEmoji(e),
      enviarComentario: () => this.enviarComentario(),
      quitarStickerPreview: () => this.quitarStickerPreview(),
      openLoginModal: () => this.openLoginModal(),
      closeAuthModal: () => this.closeAuthModal(),
      loginWithEmail: () => this.loginWithEmail(),
      registerWithEmail: () => this.registerWithEmail(),
      loginWithGoogle: () => this.loginWithGoogle(),
      loginWithGitHub: () => this.loginWithGitHub(),
      switchStickerTab: (tab) => this.switchStickerTab(tab)
    };

    window.videoPlayer = window.videoPlayerMethods;
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
      if (window.ArchinimeState) {
        window.ArchinimeState.set('currentUser', user);
      } else {
        this.currentUser = user;
      }
      this.updateCommentFormVisibility();
      
      if (typeof initComentariosSystem === 'function') {
        initComentariosSystem(this.db, this.auth);
      }
      
      if (typeof initStickersSystem === 'function') {
        initStickersSystem(this.db, this.auth);
      }
    });
  }
  
  getCurrentUser() {
    if (window.ArchinimeState) return window.ArchinimeState.get('currentUser');
    return this.currentUser;
  }
  
  initUI() {
    const backLink = document.getElementById('backLink');
    if (backLink && this.animeId) {
      backLink.href = `anime-detail.html?id=${this.animeId}`;
    }
    
    const emojiPanel = document.getElementById('emojiPanel');
    if (emojiPanel) {
      emojiPanel.innerHTML = this.emojiList.map(e => 
        `<div class="emoji-option" onclick="window.videoPlayer?.insertEmoji('${e}')">${e}</div>`
      ).join('');
    }
    
    const textarea = document.getElementById('comentarioTexto');
    if (textarea) {
      textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.enviarComentario();
        }
      });
      textarea.addEventListener('input', () => this.validateSendButton());
    }
    
    document.querySelectorAll('.sticker-tab').forEach(tab => {
      tab.addEventListener('click', () => this.switchStickerTab(tab.dataset.tab));
    });
  }
  
  async loadEpisodeData() {
    try {
      const docRef = this.db.collection('catalogo').doc(this.animeId);
      const doc = await docRef.get();
      if (!doc.exists) {
        document.getElementById('epTitle').innerText = 'Anime no encontrado';
        return;
      }
      this.animeData = doc.data();
      const seasons = this.animeData.seasons || [];
      const season = seasons.find(s => s.num === parseInt(this.season));
      if (!season) {
        document.getElementById('epTitle').innerText = 'Temporada no encontrada';
        return;
      }
      const epIndex = parseInt(this.episode) - 1;
      const episodeData = season.eps?.[epIndex];
      if (!episodeData) {
        document.getElementById('epTitle').innerText = 'Episodio no encontrado';
        return;
      }
      
      document.title = `Ver ${episodeData.title || `Episodio ${this.episode}`} - Archinime`;
      document.getElementById('epTitle').innerText = episodeData.title || `Episodio ${this.episode}`;
      
      const initialLink = episodeData.link || episodeData.link2;
      this.updateDownloadButton(initialLink);
      this.loadVideo(initialLink);

      const serverContainer = document.getElementById('serverOptions');
      serverContainer.innerHTML = '';
      if (episodeData.link) this.createServerButton('Latino', episodeData.link, true);
      if (episodeData.link2) this.createServerButton('Opción 2', episodeData.link2, !episodeData.link);
      
      this.setupNavigation();
      this.autoMarkAsWatched();

    } catch (error) {
      console.error('Error cargando episodio:', error);
      document.getElementById('epTitle').innerText = 'Error al cargar el episodio';
    }
  }
  
  createServerButton(label, url, isActive) {
    const container = document.getElementById('serverOptions');
    const btn = document.createElement('button');
    const isFirst = container.children.length === 0;

    btn.className = 'opt-btn' + ((isActive || isFirst) ? ' active' : '');
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
    if (!this.animeData?.seasons) return;
    const flat = [];
    this.animeData.seasons.sort((a,b) => a.num - b.num).forEach(season => {
      season.eps?.forEach((ep, idx) => {
        if (ep.link || ep.link2) {
          flat.push({ s: season.num, e: idx + 1 });
        }
      });
    });

    const idx = flat.findIndex(i => i.s === parseInt(this.season) && i.e === parseInt(this.episode));
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
    const user = this.getCurrentUser();

    if (user) {
      try {
        const docRef = this.db.collection('watchHistory').doc(user.uid);
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
      } catch (e) { console.warn('Error al marcar como visto:', e); }
    } else {
      localStorage.setItem(`watched_${aId}_${sNum}_${eNum}`, 'true');
    }
  }
  
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
  
  openLoginModal() { document.getElementById('authModal').classList.add('show'); }
  closeAuthModal() { document.getElementById('authModal').classList.remove('show'); document.getElementById('authError').innerText = ''; }
  
  async loginWithEmail() {
    const email = document.getElementById('loginEmail').value;
    const pass = document.getElementById('loginPassword').value;
    try { await this.auth.signInWithEmailAndPassword(email, pass); this.closeAuthModal(); }
    catch (e) { document.getElementById('authError').innerText = e.message; }
  }
  
  async registerWithEmail() {
    const email = document.getElementById('registerEmail').value;
    const pass = document.getElementById('registerPassword').value;
    const confirm = document.getElementById('registerConfirm').value;
    if (pass !== confirm) { document.getElementById('authError').innerText = 'Las contraseñas no coinciden'; return; }
    try { await this.auth.createUserWithEmailAndPassword(email, pass); this.closeAuthModal(); }
    catch (e) { document.getElementById('authError').innerText = e.message; }
  }
  
  async loginWithGoogle() {
    const provider = new firebase.auth.GoogleAuthProvider();
    try { await this.auth.signInWithPopup(provider); this.closeAuthModal(); }
    catch (e) { document.getElementById('authError').innerText = e.message; }
  }
  
  async loginWithGitHub() {
    const provider = new firebase.auth.GithubAuthProvider();
    try { await this.auth.signInWithPopup(provider); this.closeAuthModal(); }
    catch (e) { document.getElementById('authError').innerText = e.message; }
  }
  
  updateCommentFormVisibility() {
    const user = this.getCurrentUser();
    const loginMsg = document.getElementById('comentarioLoginMessage');
    const form = document.getElementById('comentarioFormContainer');
    const avatar = document.getElementById('comentarioUserAvatar');
    const nameSpan = document.getElementById('comentarioUserName');

    if (user) {
      if (loginMsg) loginMsg.style.display = 'none';
      if (form) {
        form.style.display = 'block';
        if (avatar) avatar.src = user.photoURL || 'invitado.avif';
        if (nameSpan) nameSpan.innerText = user.displayName || user.email?.split('@')[0] || 'Usuario';
      }
    } else {
      if (loginMsg) loginMsg.style.display = 'block';
      if (form) form.style.display = 'none';
    }
  }
  
  toggleEmojiPanel() { 
    const panel = document.getElementById('emojiPanel');
    if (panel) {
      panel.classList.toggle('active'); 
      document.getElementById('stickerPanelFull')?.classList.remove('active');
    }
  }
  
  insertEmoji(emoji) { 
    let ta = document.getElementById('comentarioTexto');
    if (window.respondiendoA) {
        ta = document.getElementById(`dynamicReplyText-${window.respondiendoA.id}`);
    }

    if(ta){
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      ta.value = ta.value.substring(0, start) + emoji + ta.value.substring(end);
      ta.focus(); 
      ta.dispatchEvent(new Event('input'));
      this.validateSendButton();
    }
  }
  
  toggleStickerPanel() {
    const panel = document.getElementById('stickerPanelFull');
    if (panel) {
      panel.classList.toggle('active');
      document.getElementById('emojiPanel')?.classList.remove('active');
      if (panel.classList.contains('active') && typeof cargarStickersUsuario === 'function') {
        cargarStickersUsuario();
      }
    }
  }
  
  switchStickerTab(tabId) {
    if (typeof window.switchStickerTab === 'function') {
      window.switchStickerTab(tabId);
    } else {
      document.querySelectorAll('.sticker-tab').forEach(t => t.classList.remove('active'));
      document.querySelector(`.sticker-tab[data-tab="${tabId}"]`)?.classList.add('active');
      document.querySelectorAll('.sticker-tab-content').forEach(c => c.classList.remove('active'));
      document.getElementById(tabId === 'mis' ? 'misStickersTab' : 'subirStickersTab')?.classList.add('active');
    }
  }

  validateSendButton() {
    let textarea = document.getElementById('comentarioTexto');
    let btn = document.getElementById('enviarComentarioBtn');
    
    if (window.respondiendoA) {
        textarea = document.getElementById(`dynamicReplyText-${window.respondiendoA.id}`);
        btn = document.getElementById(`btnEnviarRespuesta-${window.respondiendoA.id}`);
    }

    if (textarea && btn) {
      const hasContent = textarea.value.trim().length > 0 || window.stickerSeleccionadoParaEnviar;
      
      if (hasContent) {
          btn.disabled = false;
          btn.classList.remove('btn-disabled');
          btn.style.opacity = '1';
          btn.style.cursor = 'pointer';
      } else {
          btn.disabled = true;
          btn.classList.add('btn-disabled');
          btn.style.opacity = '0.5';
          btn.style.cursor = 'not-allowed';
      }
    }
  }
  
  enviarComentario() { 
    if (typeof enviarComentarioTexto === 'function') enviarComentarioTexto();
  }
  
  quitarStickerPreview() { 
    if (typeof quitarStickerPreview === 'function') { quitarStickerPreview(); } 
    this.validateSendButton();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new VideoPlayer());
} else {
  new VideoPlayer();
}

window.openLoginModalFromComent = () => window.videoPlayer?.openLoginModal();
window.toggleEmojiPanelSistema = () => window.videoPlayer?.toggleEmojiPanel();
window.toggleStickerPanelSistema = () => window.videoPlayer?.toggleStickerPanel();
window.agregarEmojiAlTexto = (emoji) => window.videoPlayer?.insertEmoji(emoji);