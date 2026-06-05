// video-player-core.js - Versión con soporte para múltiples partes por capítulo
// Permite reproducción secuencial y descarga de todas las partes.
// Compatible con datos antiguos (link y link2)

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
    this.currentDownloadUrls = [];
    this.currentPlaylist = [];
    this.currentPartIndex = 0;
    this.currentEpisodeData = null;
    this.authReady = false;
    this.pendingMarks = [];
    this.videoElement = null;
    this.autoPlayNext = true;
    
    window.comentariosAnimeId = this.animeId;
    window.comentariosSeason = this.season;
    window.comentariosEpisode = this.episode;
    
    this.initFirebase();
    this.initUI();
    this.waitForCatalogAndLoad();
    this.setupAuthUI();
    this.setupAuthMigration();

    window.videoPlayerMethods = {
      toggleStickerPanel: () => this.toggleStickerPanel(),
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
  
  async waitForCatalogAndLoad() {
    if (typeof catalogoArray !== 'undefined') {
      this.loadEpisodeData();
      return;
    }
    console.log('⏳ Esperando catalogoArray...');
    const checkInterval = setInterval(() => {
      if (typeof catalogoArray !== 'undefined') {
        clearInterval(checkInterval);
        this.loadEpisodeData();
      }
    }, 50);
    setTimeout(() => {
      clearInterval(checkInterval);
      if (typeof catalogoArray === 'undefined') {
        console.error('❌ No se cargó catalogoArray');
        document.getElementById('epTitle').innerText = 'Error: Catálogo no disponible';
      }
    }, 5000);
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
    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
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
      this.authReady = true;
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
  
  async migrateLocalToFirestore(userId) {
    if (!userId) return;
    const watchedKeys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('watched_')) watchedKeys.push(key);
    }
    if (watchedKeys.length === 0) return;
    
    console.log(`🔄 Migrando ${watchedKeys.length} registros...`);
    const historyRef = this.db.collection('watchHistory').doc(userId);
    
    for (const key of watchedKeys) {
      const parts = key.split('_');
      if (parts.length < 4) continue;
      const animeId = parts[1];
      const seasonNum = parseInt(parts[2]);
      const episodeNum = parseInt(parts[3]);
      if (isNaN(seasonNum) || isNaN(episodeNum)) continue;
      
      try {
        const doc = await historyRef.get();
        let data = doc.exists ? doc.data() : {};
        if (!data[animeId]) data[animeId] = {};
        if (!data[animeId][seasonNum]) data[animeId][seasonNum] = [];
        if (!data[animeId][seasonNum].includes(episodeNum)) {
          data[animeId][seasonNum].push(episodeNum);
        }
        await historyRef.set(data, { merge: true });
        localStorage.removeItem(key);
      } catch (e) { console.warn(e); }
    }
    console.log('✅ Migración completada');
  }
  
  setupAuthMigration() {
    this.auth.onAuthStateChanged(async (user) => {
      if (user) {
        await this.migrateLocalToFirestore(user.uid);
        if (this.pendingMarks.length > 0) {
          for (const mark of this.pendingMarks) {
            await this.saveToFirestore(mark.animeId, mark.season, mark.episode, user.uid);
          }
          this.pendingMarks = [];
        }
      }
    });
  }
  
  async saveToFirestore(animeId, seasonNum, episodeNum, userId) {
    if (!userId) return false;
    try {
      const docRef = this.db.collection('watchHistory').doc(userId);
      const doc = await docRef.get();
      let data = doc.exists ? doc.data() : {};
      if (!data[animeId]) data[animeId] = {};
      if (!data[animeId][seasonNum]) data[animeId][seasonNum] = [];
      if (!data[animeId][seasonNum].includes(episodeNum)) {
        data[animeId][seasonNum].push(episodeNum);
        await docRef.set(data, { merge: true });
      }
      return true;
    } catch (e) { return false; }
  }
  
  async autoMarkAsWatched() {
    const aId = this.animeId;
    const sNum = parseInt(this.season);
    const eNum = parseInt(this.episode);
    if (!aId || isNaN(sNum) || isNaN(eNum)) return;
    
    const user = this.getCurrentUser();
    const localKey = `watched_${aId}_${sNum}_${eNum}`;
    
    if (user && user.uid) {
      const success = await this.saveToFirestore(aId, sNum, eNum, user.uid);
      if (success) {
        localStorage.removeItem(localKey);
        return;
      }
    }
    
    localStorage.setItem(localKey, 'true');
    if (!user && !this.authReady) {
      this.pendingMarks.push({ animeId: aId, season: sNum, episode: eNum });
    }
  }
  
  initUI() {
    const backLink = document.getElementById('backLink');
    if (backLink && this.animeId) backLink.href = `anime-detail.html?id=${this.animeId}`;
    
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
    
    const downloadBtn = document.getElementById('downloadBtn');
    if (downloadBtn) {
      downloadBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.handleDownloadClick();
      });
    }
    
    document.querySelectorAll('.sticker-tab').forEach(tab => {
      tab.addEventListener('click', () => this.switchStickerTab(tab.dataset.tab));
    });
  }
  
  formatEpisodeTitle(season, epNum, episodeData) {
    const seasonName = season.name || `Temporada ${season.num}`;
    const episodeTitle = episodeData.title || `Capítulo ${epNum}`;
    return `${seasonName} - ${episodeTitle}`;
  }
  
  async loadEpisodeData() {
    try {
      const anime = catalogoArray.find(a => a.id == this.animeId);
      if (!anime) {
        document.getElementById('epTitle').innerText = 'Anime no encontrado';
        return;
      }
      this.animeData = anime;
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
      
      this.currentEpisodeData = episodeData;
      const formattedTitle = this.formatEpisodeTitle(season, parseInt(this.episode), episodeData);
      document.title = `Ver ${formattedTitle} - Archinime`;
      document.getElementById('epTitle').innerText = formattedTitle;
      
      let linksArray = [];
      if (episodeData.links && Array.isArray(episodeData.links)) {
        linksArray = episodeData.links.filter(url => url && url.trim() !== '');
      } else {
        if (episodeData.link) linksArray.push(episodeData.link);
        if (episodeData.link2) linksArray.push(episodeData.link2);
      }
      
      this.currentPlaylist = [...linksArray];
      this.currentDownloadUrls = [...linksArray];
      this.currentPartIndex = 0;
      
      if (this.currentPlaylist.length > 0) {
        this.updateDownloadUrls(this.currentPlaylist);
        this.loadVideo(this.currentPlaylist[0]);
      } else {
        console.warn('No hay enlaces para este episodio');
        document.getElementById('epTitle').innerText += ' (sin enlaces)';
      }
      
      const serverContainer = document.getElementById('serverOptions');
      serverContainer.innerHTML = '';
      if (linksArray.length > 0) {
        linksArray.forEach((url, idx) => {
          const label = linksArray.length === 1 ? 'Latino' : `Parte ${idx+1}`;
          this.createServerButton(label, url, idx === 0);
        });
      } else {
        if (episodeData.link) this.createServerButton('Latino', episodeData.link, true);
        if (episodeData.link2) this.createServerButton('Opción 2', episodeData.link2, !episodeData.link);
      }
      
      this.setupNavigation();
      await this.autoMarkAsWatched();
    } catch (error) {
      console.error(error);
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
      this.currentPlaylist = [url];
      this.currentDownloadUrls = [url];
      this.currentPartIndex = 0;
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
      this.videoElement = video;
      
      if (this._onEndedHandler) {
        this.videoElement.removeEventListener('ended', this._onEndedHandler);
      }
      this._onEndedHandler = () => {
        if (this.autoPlayNext && this.currentPlaylist.length > 1) {
          this.currentPartIndex++;
          if (this.currentPartIndex < this.currentPlaylist.length) {
            const nextUrl = this.currentPlaylist[this.currentPartIndex];
            this.loadVideo(nextUrl);
            const btns = document.querySelectorAll('.opt-btn');
            if (btns[this.currentPartIndex]) {
              btns.forEach(b => b.classList.remove('active'));
              btns[this.currentPartIndex].classList.add('active');
            }
          }
        }
      };
      this.videoElement.addEventListener('ended', this._onEndedHandler);
    } else {
      const iframe = document.createElement('iframe');
      iframe.src = url;
      iframe.allow = 'autoplay; fullscreen';
      iframe.allowFullscreen = true;
      iframe.style.width = '100%';
      iframe.style.height = '100%';
      container.appendChild(iframe);
      this.videoElement = null;
    }
  }
  
  updateDownloadUrls(urls) {
    this.currentDownloadUrls = urls.map(url => this.generateDirectLink(url));
  }
  
  generateDirectLink(url) {
    if (!url) return "#";
    if (url.includes("drive.google.com")) {
      const match = url.match(/\/d\/(.+?)\//);
      if (match && match[1]) return `https://drive.usercontent.google.com/download?id=${match[1]}&export=download&authuser=0`;
      const altMatch = url.match(/id=([a-zA-Z0-9_-]+)/);
      if (altMatch && altMatch[1]) return `https://drive.usercontent.google.com/download?id=${altMatch[1]}&export=download&authuser=0`;
    }
    if (url.includes("dropbox.com") && url.includes("dl=0")) return url.replace('dl=0', 'dl=1');
    if (url.includes("ok.ru/")) {
      const match = url.match(/ok\.ru\/video(?:embed)?\/(\d+)/);
      if (match && match[1]) return `https://anydownloader.com/en/#url=https://ok.ru/video/${match[1]}`;
    }
    if (url.includes("odysee.com")) {
      let claimStr = url.split("/embed/")[1];
      if (claimStr) {
        if (claimStr.includes('/')) claimStr = claimStr.split('/').pop();
        claimStr = claimStr.replace(':', '/');
        return `https://odysee.com/$/download/${claimStr}`;
      }
      return url;
    }
    return url;
  }
  
  showProgressBar(partNumber = 1, totalParts = 1) {
    if (document.getElementById('customDownloadProgress')) return;
    const div = document.createElement('div');
    div.id = 'customDownloadProgress';
    div.innerHTML = `
      <div style="position:fixed; bottom:20px; left:20px; right:20px; z-index:9999; background:rgba(0,0,0,0.9); border-radius:16px; padding:16px; border:1px solid var(--primary-color); backdrop-filter:blur(8px); text-align:center; font-family:'Poppins',sans-serif;">
        <div style="margin-bottom:8px; color:#fff;">⬇ Descargando parte ${partNumber} de ${totalParts}... <span id="progressPercent">0</span>%</div>
        <div style="background:#222; border-radius:50px; overflow:hidden; height:10px;">
          <div id="progressBarFill" style="width:0%; height:100%; background:linear-gradient(90deg, #00f3ff, #bc13fe); transition:width 0.2s;"></div>
        </div>
        <div style="font-size:0.7rem; color:#aaa; margin-top:8px;">No cierres la página hasta que termine</div>
      </div>
    `;
    document.body.appendChild(div);
  }

  hideProgressBar() {
    const el = document.getElementById('customDownloadProgress');
    if (el) el.remove();
  }

  async forceDownload(url, filename) {
    this.showProgressBar(1, 1);
    const percentSpan = document.getElementById('progressPercent');
    const fillDiv = document.getElementById('progressBarFill');

    try {
      const response = await fetch(url, { mode: 'cors' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const contentLength = response.headers.get('content-length');
      const total = contentLength ? parseInt(contentLength, 10) : 0;
      let loaded = 0;

      const reader = response.body.getReader();
      const chunks = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        loaded += value.length;
        if (total) {
          const percent = Math.round((loaded / total) * 100);
          if (percentSpan) percentSpan.innerText = percent;
          if (fillDiv) fillDiv.style.width = percent + '%';
        } else {
          if (percentSpan) percentSpan.innerText = '...';
        }
      }
      const blob = new Blob(chunks, { type: response.headers.get('content-type') || 'video/mp4' });
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.warn(error);
      throw error;
    } finally {
      this.hideProgressBar();
    }
  }

  async handleDownloadClick() {
    const user = this.getCurrentUser();
    if (!user) {
      this.openLoginModal();
      return;
    }
    
    if (!this.currentDownloadUrls || this.currentDownloadUrls.length === 0) {
      alert('No hay enlaces de descarga disponibles para este episodio.');
      return;
    }
    
    const epTitleElem = document.getElementById('epTitle');
    let baseFilename = epTitleElem ? epTitleElem.innerText : 'video';
    baseFilename = baseFilename.replace(/[^a-z0-9ñáéíóúü \-_]/gi, '').replace(/\s+/g, '_');
    
    let success = true;
    for (let i = 0; i < this.currentDownloadUrls.length; i++) {
      const url = this.currentDownloadUrls[i];
      if (!url || url === '#') continue;
      
      const partNum = i + 1;
      const totalParts = this.currentDownloadUrls.length;
      let filename = totalParts === 1 ? `${baseFilename}.mp4` : `${baseFilename} - Parte ${partNum}.mp4`;
      
      this.showProgressBar(partNum, totalParts);
      try {
        await this.forceDownload(url, filename);
      } catch (err) {
        console.error(`Error descargando parte ${partNum}:`, err);
        alert(`Error al descargar la parte ${partNum}. Ver consola.`);
        success = false;
        break;
      } finally {
        this.hideProgressBar();
      }
    }
    
    if (success && this.currentDownloadUrls.length > 1) {
      alert('Todas las partes se han descargado correctamente.');
    }
  }
  
  isMobile() {
    return /android|webos|iphone|ipad|ipod|blackberry/i.test(navigator.userAgent.toLowerCase());
  }
  
  setupNavigation() {
    if (!this.animeData?.seasons) return;
    const flat = [];
    this.animeData.seasons.sort((a,b) => a.num - b.num).forEach(season => {
      season.eps?.forEach((ep, idx) => {
        const hasLinks = (ep.links && ep.links.length > 0) || ep.link || ep.link2;
        if (hasLinks) {
          flat.push({ s: season.num, e: idx + 1, seasonObj: season, episodeData: ep });
        }
      });
    });
    const idx = flat.findIndex(i => i.s === parseInt(this.season) && i.e === parseInt(this.episode));
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    
    if (idx > 0) {
      const prev = flat[idx-1];
      prevBtn.classList.remove('btn-hidden');
      prevBtn.href = `?anime=${this.animeId}&s=${prev.s}&e=${prev.e}`;
      prevBtn.setAttribute('title', this.formatEpisodeTitle(prev.seasonObj, prev.e, prev.episodeData));
    } else {
      prevBtn.classList.add('btn-hidden');
    }
    
    if (idx < flat.length - 1) {
      const next = flat[idx+1];
      nextBtn.classList.remove('btn-hidden');
      nextBtn.href = `?anime=${this.animeId}&s=${next.s}&e=${next.e}`;
      nextBtn.setAttribute('title', this.formatEpisodeTitle(next.seasonObj, next.e, next.episodeData));
    } else {
      nextBtn.classList.add('btn-hidden');
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
  closeAuthModal() { 
    document.getElementById('authModal').classList.remove('show'); 
    const errEl = document.getElementById('authError');
    if (errEl) errEl.innerText = '';
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
  
  toggleStickerPanel() {
    const panel = document.getElementById('stickerPanelFull');
    if (panel) {
      panel.classList.toggle('active');
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
    const textarea = document.getElementById('comentarioTexto');
    const btn = document.getElementById('enviarComentarioBtn');
    if (textarea && btn) {
      const hasContent = textarea.value.trim().length > 0 || window.stickerSeleccionadoParaEnviar;
      btn.disabled = !hasContent;
      btn.style.opacity = hasContent ? '1' : '0.5';
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
window.toggleStickerPanelSistema = () => window.videoPlayer?.toggleStickerPanel();