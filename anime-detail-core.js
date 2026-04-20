// anime-detail-core.js - Versión Firestore optimizada (fluida)
// Obtiene datos desde la colección 'catalogo'
// OPTIMIZACIONES: requestIdleCallback, IntersectionObserver, debounce, caché local, etc.
// MANTIENE TODAS LAS FUNCIONALIDADES ORIGINALES

// ---------- CONFIGURACIÓN FIREBASE ----------
const firebaseConfig = {
  apiKey: "AIzaSyBpzYARIxaJijLbbL-2S6F9MWecbAbvK_I",
  authDomain: "login-admin-archinime.firebaseapp.com",
  projectId: "login-admin-archinime",
  storageBucket: "login-admin-archinime.firebasestorage.app",
  messagingSenderId: "938164660242",
  appId: "1:938164660242:web:648e0dce0e0d18dd78d0cb"
};
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// ---------- UTILIDADES DE RENDIMIENTO ----------
const idleCallback = window.requestIdleCallback || ((cb) => setTimeout(cb, 1));
const debounce = (fn, delay) => { let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); }; };

// ---------- ANUNCIOS ----------
let anuncioActual = null;
let cachedAdCard = null;

function inicializarAnuncio() {
  idleCallback(() => {
    if (typeof window.listaAnuncios !== 'undefined' && window.listaAnuncios.length > 0) {
      const randomIndex = Math.floor(Math.random() * window.listaAnuncios.length);
      anuncioActual = window.listaAnuncios[randomIndex];
      console.log('Anuncio cargado en detalle:', anuncioActual.id);
    } else {
      console.warn('No hay anuncios definidos');
    }
  });
}

function crearTarjetaAnuncio() {
  if (cachedAdCard) return cachedAdCard.cloneNode(true); // devolver clon para evitar reutilización problemática
  if (!anuncioActual) return null;
  
  const card = document.createElement('div');
  card.className = 'rec-card card-ad';
  card.style.cursor = 'default';
  
  const innerDiv = document.createElement('div');
  innerDiv.style.cssText = 'width:100%;height:100%;display:flex;align-items:center;justify-content:center;overflow:hidden;position:relative;';
  innerDiv.innerHTML = anuncioActual.codigo;
  
  // Re-ejecutar scripts
  innerDiv.querySelectorAll('script').forEach(oldScript => {
    const newScript = document.createElement('script');
    if (oldScript.src) {
      newScript.src = oldScript.src;
      newScript.async = true;
    } else {
      newScript.textContent = oldScript.textContent;
    }
    innerDiv.appendChild(newScript);
    oldScript.remove();
  });
  
  card.appendChild(innerDiv);
  cachedAdCard = card;
  return card.cloneNode(true);
}

// ---------- AUDIO CONTEXT (SONIDOS UI) ----------
let audioCtx = null;
function initAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
}
window._playUISound = function(type) {
  if (!audioCtx) {
    try { initAudio(); } catch(e) { return; }
  }
  if (audioCtx.state === 'closed') { audioCtx = null; initAudio(); }
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain); gain.connect(audioCtx.destination);
  const now = audioCtx.currentTime;
  if (type === 'hover') {
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.exponentialRampToValueAtTime(1200, now+0.05);
    gain.gain.setValueAtTime(0.02, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now+0.05);
    osc.start(now); osc.stop(now+0.05);
  } else if (type === 'click') {
    osc.type = 'square';
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.exponentialRampToValueAtTime(100, now+0.1);
    gain.gain.setValueAtTime(0.05, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now+0.1);
    osc.start(now); osc.stop(now+0.1);
  }
};
window.playUISound = window._playUISound;

// ---------- MÚSICA DE FONDO ----------
let currentAudio = null, playlist = [], currentTrackIndex = -1;
let userInteractedDetail = false;

function playTrack(idx) {
  if (!playlist.length) return;
  if (currentAudio) { 
    currentAudio.pause(); 
    currentAudio.onended = null; 
  }
  let track = playlist[idx];
  const fullUrl = track.startsWith('http') ? track : `musica/${track}`;
  currentAudio = new Audio(fullUrl);
  currentAudio.volume = 0.3;
  currentAudio.loop = false;
  currentAudio.onended = () => {
    currentTrackIndex = (currentTrackIndex + 1) % playlist.length;
    playTrack(currentTrackIndex);
  };

  const playPromise = currentAudio.play();
  if (playPromise !== undefined) {
    playPromise.catch(e => {
      console.log('Autoplay bloqueado en anime-detail, esperando interacción:', e);
      if (!userInteractedDetail) {
        const resumeOnce = () => {
          if (!userInteractedDetail) {
            userInteractedDetail = true;
            currentAudio.play().catch(err => console.warn('No se pudo reproducir después de interacción:', err));
            ['click', 'touchstart', 'keydown'].forEach(evt => {
              document.removeEventListener(evt, resumeOnce, { once: true });
            });
          }
        };
        ['click', 'touchstart', 'keydown'].forEach(evt => {
          document.addEventListener(evt, resumeOnce, { once: true });
        });
      }
    });
  }
}

function playMusicFromArray(musicArray) {
  if (!musicArray || musicArray.length === 0) return;
  playlist = musicArray;
  currentTrackIndex = Math.floor(Math.random() * playlist.length);
  playTrack(currentTrackIndex);
}

// ---------- ESTADO GLOBAL ----------
let currentUserId = null;
let currentAnimeId = null;
let animeData = null;
let animeRatingData = { avg: 0, count: 0 };
let currentUserRating = null;
const params = new URLSearchParams(location.search);
const animeId = params.get('id');
currentAnimeId = animeId;

// Cache para búsqueda rápida
let searchCache = [];
let searchCacheLoaded = false;

// ---------- TOAST ----------
let toastEl = null;
function showToast(msg, isError = false) {
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.id = 'toast';
    toastEl.className = 'toast';
    document.body.appendChild(toastEl);
  }
  toastEl.innerHTML = `<i class="fas ${isError ? 'fa-exclamation-triangle' : 'fa-check-circle'}"></i> ${msg}`;
  toastEl.style.display = 'block';
  setTimeout(() => toastEl.style.display = 'none', 3000);
}

// ---------- HISTORIAL DE VISUALIZACIÓN ----------
function getLocalKey(animeId, s, e) { return `watched_${animeId}_${s}_${e}`; }
async function markEpisodeWatched(animeId, s, e) {
  if (currentUserId) {
    const docRef = db.collection('watchHistory').doc(currentUserId);
    const doc = await docRef.get();
    let data = doc.exists ? doc.data() : {};
    if (!data[animeId]) data[animeId] = {};
    if (!data[animeId][s]) data[animeId][s] = [];
    if (!data[animeId][s].includes(e)) data[animeId][s].push(e);
    await docRef.set(data, { merge: true });
    showToast('Episodio marcado como visto');
  } else {
    localStorage.setItem(getLocalKey(animeId, s, e), 'true');
    showToast('Episodio marcado (local)');
  }
}
async function removeEpisodeWatched(animeId, s, e) {
  if (currentUserId) {
    const docRef = db.collection('watchHistory').doc(currentUserId);
    const doc = await docRef.get();
    if (doc.exists) {
      let data = doc.data();
      if (data[animeId]?.[s]) {
        data[animeId][s] = data[animeId][s].filter(n => n !== e);
        if (data[animeId][s].length === 0) delete data[animeId][s];
        if (Object.keys(data[animeId]).length === 0) delete data[animeId];
        await docRef.set(data);
        showToast('Episodio eliminado');
      }
    }
  } else {
    localStorage.removeItem(getLocalKey(animeId, s, e));
    showToast('Episodio eliminado (local)');
  }
}
async function loadWatchedEpisodes(animeId) {
  if (currentUserId) {
    const doc = await db.collection('watchHistory').doc(currentUserId).get();
    return doc.exists ? (doc.data()[animeId] || {}) : {};
  } else {
    const watched = {};
    for (let i=0; i<localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(`watched_${animeId}_`)) {
        const parts = key.split('_');
        const s = parseInt(parts[2]), e = parseInt(parts[3]);
        if (!watched[s]) watched[s] = [];
        watched[s].push(e);
      }
    }
    return watched;
  }
}

// ---------- RENDERIZADO DE TEMPORADAS ----------
window.reloadSeason = async function(details, animeId, seasonIdx) {
  if (!details?.open) return;
  const list = details.querySelector('.video-list');
  if (list) { list.innerHTML = ''; await toggleSeason(details, animeId, seasonIdx); }
};

window.toggleSeason = async function(details, animeId, seasonIdx) {
  if (!details.open) return;
  playUISound('click');
  const list = details.querySelector('.video-list');
  if (list.children.length) return;
  const loading = details.querySelector(`#loading-${seasonIdx}`);
  if (loading) loading.style.display = 'block';
  const season = animeData.seasons[seasonIdx];
  if (!season || !season.eps) {
    if (loading) loading.style.display = 'none';
    return;
  }
  const episodes = season.eps;
  const seasonNum = season.num;
  const watched = await loadWatchedEpisodes(animeId);
  
  // Optimización: Usar IntersectionObserver para cargar episodios bajo demanda
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const btn = entry.target;
        const epNum = parseInt(btn.dataset.ep);
        const ep = episodes[epNum-1];
        if (!btn.dataset.loaded) {
          // Rellenar contenido del botón si aún no está
          const isWatched = watched[seasonNum]?.includes(epNum);
          btn.classList.add('ep-btn');
          if (isWatched) btn.classList.add('watched');
          btn.innerHTML = `
            <button class="ep-action-btn">${isWatched ? '<i class="fas fa-trash-alt"></i>' : '<i class="fas fa-check-circle"></i>'}</button>
            <span>▶ ${ep.title || `Episodio ${epNum}`}</span>
            ${isWatched ? '<div class="watched-tag"><i class="fas fa-check"></i> VISTO</div>' : ''}
          `;
          btn.href = `video-player.html?anime=${animeId}&s=${seasonNum}&e=${epNum}`;
          btn.onclick = null; // se maneja con href
          btn.querySelector('.ep-action-btn').onclick = async (e) => {
            e.preventDefault(); e.stopPropagation();
            if (isWatched) await removeEpisodeWatched(animeId, seasonNum, epNum);
            else await markEpisodeWatched(animeId, seasonNum, epNum);
            await reloadSeason(details, animeId, seasonIdx);
          };
          btn.dataset.loaded = 'true';
        }
        observer.unobserve(btn);
      }
    });
  }, { rootMargin: '100px' });

  const frag = document.createDocumentFragment();
  for (let i = 0; i < episodes.length; i++) {
    const ep = episodes[i];
    const epNum = i+1;
    const btn = document.createElement('a');
    btn.className = 'ep-btn-placeholder'; // estilo básico mientras carga
    btn.style.cssText = 'display:block; height:60px; background:rgba(0,0,0,0.2); border-radius:12px;';
    btn.dataset.ep = epNum;
    btn.setAttribute('aria-label', `Episodio ${epNum}`);
    btn.onmouseenter = () => playUISound('hover');
    frag.appendChild(btn);
    observer.observe(btn);
  }
  list.appendChild(frag);
  if (loading) loading.style.display = 'none';
};

// ---------- VOTACIONES ----------
async function loadAnimeRating(animeId) {
  const cacheKey = `rating_${animeId}`;
  const cached = sessionStorage.getItem(cacheKey);
  if (cached) {
    animeRatingData = JSON.parse(cached);
    updateRatingDisplay();
    updateRatingLabel(animeRatingData.avg);
    return;
  }
  try {
    const doc = await db.collection('animeRatings').doc(String(animeId)).get();
    if (doc.exists) {
      animeRatingData = doc.data();
    } else {
      animeRatingData = { avg: 0, count: 0 };
    }
    sessionStorage.setItem(cacheKey, JSON.stringify(animeRatingData));
    updateRatingDisplay();
    updateRatingLabel(animeRatingData.avg);
  } catch (error) {
    console.error("Error al cargar animeRating:", error);
    animeRatingData = { avg: 0, count: 0 };
    updateRatingDisplay();
    updateRatingLabel(0);
  }
}

function updateRatingDisplay() {
  const avgSpan = document.getElementById('averageRatingDisplay');
  const countSpan = document.getElementById('voteCountDisplay');
  if (avgSpan) avgSpan.textContent = (animeRatingData.count > 0) ? animeRatingData.avg.toFixed(1) : '--';
  if (countSpan) countSpan.textContent = (animeRatingData.count === 0) ? '(Sin votos)' : `(${animeRatingData.count} ${animeRatingData.count === 1 ? 'voto' : 'votos'})`;
  updateRatingLabel(animeRatingData.avg);
}

function updateRatingLabel(avg) {
  const labelSpan = document.getElementById('ratingLabel');
  if (!labelSpan) return;
  let text = 'Valoración media:';
  let color = '#ccc';
  if (avg >= 1 && avg <= 2.9) { text = '⭐ Valoración baja'; color = '#ff8888'; }
  else if (avg >= 3 && avg <= 4.0) { text = '👍 Valoración media'; color = '#ffcc88'; }
  else if (avg >= 4.1 && avg <= 5) { text = '🔥 Valoración alta'; color = '#ffaa44'; }
  labelSpan.innerHTML = text;
  labelSpan.style.color = color;
}

let starContainer = null;
function renderStars(currentValue = 0) {
  if (!starContainer) starContainer = document.getElementById('starRatingWidget');
  if (!starContainer) return;
  starContainer.innerHTML = '';
  for (let i=1; i<=5; i++) {
    const star = document.createElement('i');
    star.className = 'fas fa-star star';
    if (currentValue >= i) star.classList.add('selected');
    star.setAttribute('data-value', i);
    if (!currentUserId) {
      star.classList.add('disabled');
    } else {
      star.addEventListener('mouseenter', () => highlightStars(i));
      star.addEventListener('mouseleave', () => resetStars(currentUserRating || 0));
      star.addEventListener('click', () => voteAnime(i));
    }
    starContainer.appendChild(star);
  }
}

function highlightStars(val) {
  document.querySelectorAll('#starRatingWidget .star').forEach((s, idx) => {
    if (idx < val) s.classList.add('hover'); else s.classList.remove('hover');
  });
}

function resetStars(val) {
  document.querySelectorAll('#starRatingWidget .star').forEach((s, idx) => {
    s.classList.remove('hover');
    if (idx < val) s.classList.add('selected'); else s.classList.remove('selected');
  });
}

async function voteAnime(newVal) {
  if (!currentUserId) {
    document.getElementById('ratingMessage').innerHTML = '<i class="fas fa-exclamation-triangle"></i> Inicia sesión para votar.';
    return;
  }
  const ratingRef = db.collection('animeRatings').doc(String(currentAnimeId));
  const userRef = ratingRef.collection('userRatings').doc(currentUserId);
  
  try {
    await db.runTransaction(async (t) => {
      const ratingDoc = await t.get(ratingRef);
      const userDoc = await t.get(userRef);
      
      let oldValue = userDoc.exists ? userDoc.data().value : null;
      let newAvg, newCount;
      
      if (ratingDoc.exists) {
        const currentAvg = ratingDoc.data().avg;
        const currentCount = ratingDoc.data().count;
        
        if (oldValue !== null && oldValue === newVal) {
          if (currentCount > 1) {
            newAvg = (currentAvg * currentCount - oldValue) / (currentCount - 1);
            newCount = currentCount - 1;
          } else {
            newAvg = 0;
            newCount = 0;
          }
        } else {
          if (oldValue !== null) {
            newAvg = (currentAvg * currentCount - oldValue + newVal) / currentCount;
            newCount = currentCount;
          } else {
            newAvg = (currentAvg * currentCount + newVal) / (currentCount + 1);
            newCount = currentCount + 1;
          }
        }
      } else {
        if (oldValue !== null && oldValue === newVal) {
          newAvg = 0;
          newCount = 0;
        } else {
          newAvg = newVal;
          newCount = 1;
        }
      }
      
      if (newCount === 0) {
        t.set(ratingRef, {
          avg: 0,
          count: 0,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        t.delete(userRef);
        animeRatingData = { avg: 0, count: 0 };
        currentUserRating = null;
        document.getElementById('ratingMessage').innerHTML = '<i class="fas fa-info-circle"></i> Has eliminado tu voto.';
      } else {
        t.set(ratingRef, {
          avg: newAvg,
          count: newCount,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        t.set(userRef, {
          value: newVal,
          timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        animeRatingData = { avg: newAvg, count: newCount };
        currentUserRating = newVal;
        document.getElementById('ratingMessage').innerHTML = '<i class="fas fa-check-circle"></i> ¡Gracias por tu voto!';
      }
    });
    
    sessionStorage.setItem(`rating_${currentAnimeId}`, JSON.stringify(animeRatingData));
    updateRatingDisplay();
    renderStars(currentUserRating || 0);
    setTimeout(() => {
      const msg = document.getElementById('ratingMessage');
      if (msg && (msg.innerHTML.includes('Gracias') || msg.innerHTML.includes('eliminado'))) {
        msg.innerHTML = '';
      }
    }, 3000);
    
  } catch (error) {
    console.error("Error en voteAnime:", error);
    let errorMsg = "Error al procesar el voto.";
    if (error.code === "permission-denied") errorMsg = "Permiso denegado.";
    else if (error.message) errorMsg = `Error: ${error.message}`;
    document.getElementById('ratingMessage').innerHTML = `<i class="fas fa-times-circle"></i> ${errorMsg}`;
  }
}

async function loadUserRating(animeId, userId) {
  if (!userId) return;
  try {
    const doc = await db.collection('animeRatings').doc(String(animeId)).collection('userRatings').doc(userId).get();
    currentUserRating = doc.exists ? doc.data().value : null;
    renderStars(currentUserRating || 0);
  } catch(e) {
    console.warn("Error al cargar voto del usuario:", e);
  }
}

// ---------- RENDER PRINCIPAL ----------
async function renderRecommendations(currentId) {
  const grid = document.getElementById('rec-grid');
  try {
    const snapshot = await db.collection('catalogo')
      .where(firebase.firestore.FieldPath.documentId(), '!=', currentId)
      .limit(50)
      .get();
    const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const random = docs.sort(() => 0.5 - Math.random()).slice(0, 11);
    
    if (!random.length) {
      grid.innerHTML = '<p style="color:#666;">Sin recomendaciones</p>';
      return;
    }

    const shouldInsertAd = anuncioActual !== null && random.length >= 5;
    let adPosition = -1;
    if (shouldInsertAd) {
      const minPos = 4, maxPos = random.length - 1;
      adPosition = Math.floor(Math.random() * (maxPos - minPos + 1)) + minPos;
    }

    const frag = document.createDocumentFragment();
    for (let i = 0; i < random.length; i++) {
      if (shouldInsertAd && i === adPosition) {
        const adCard = crearTarjetaAnuncio();
        if (adCard) frag.appendChild(adCard);
      }
      const a = random[i];
      const card = document.createElement('div');
      card.className = 'rec-card';
      card.setAttribute('onclick', `playUISound('click'); location.href='anime-detail.html?id=${a.id}'`);
      card.setAttribute('onmouseenter', `playUISound('hover')`);
      card.innerHTML = `<img src="${a.img}" alt="${a.title}" loading="lazy"><p>${a.title}</p>`;
      frag.appendChild(card);
    }
    grid.innerHTML = '';
    grid.appendChild(frag);
  } catch(e) {
    console.error('Error cargando recomendaciones:', e);
    grid.innerHTML = '<p style="color:#666;">Error al cargar recomendaciones</p>';
  }
}

async function renderMainContent() {
  const container = document.getElementById('contenido');
  if (!animeData) {
    container.innerHTML = "<h2 style='text-align:center;padding:50px;'>Anime no encontrado</h2>";
    return;
  }
  document.title = `${animeData.title || 'Anime'} - Archinime OS`;

  const genres = animeData.genres || [];
  const genreHtml = genres.map(g => `<span class="genre-chip">${escapeHtml(g)}</span>`).join('');
  const desc = animeData.desc || 'Sin descripción disponible.';

  let html = `
    <div class="anime-cover"><img src="${animeData.img || ''}" alt="cover" loading="lazy"></div>
    <h1>${animeData.title || ''}</h1>
    <div class="genres-wrap">${genreHtml || '<span class="genre-chip">Sin géneros</span>'}</div>
    <p class="desc">${desc}</p>
    <div class="rating-section">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:15px;">
        <div class="rating-stats">
          <span id="ratingLabel">Valoración media:</span>
          <span id="averageRatingDisplay">--</span>
          <span id="voteCountDisplay">(Sin votos)</span>
        </div>
        <div id="starRatingWidget" style="display:flex; gap:8px;"></div>
      </div>
      <div id="ratingMessage"></div>
    </div>
  `;

  if (animeData.seasons && Array.isArray(animeData.seasons)) {
    animeData.seasons.forEach((s, idx) => {
      if (!s) return;
      html += `
        <details data-season-index="${idx}" data-anime-id="${animeId}">
          <summary>${s.name || 'Temporada ' + (s.num || idx+1)}</summary>
          <div class="season-content">
            ${s.cover ? `<img src="${s.cover}" style="width:100%; border-radius:12px; margin-bottom:15px;" loading="lazy">` : ''}
            <div class="video-list" id="list-${idx}"></div>
            <div id="loading-${idx}" style="display:none; text-align:center; padding:10px;">Cargando...</div>
          </div>
        </details>
      `;
    });
  }
  container.innerHTML = html;
  starContainer = document.getElementById('starRatingWidget');

  // Cargar datos en paralelo
  await Promise.all([
    renderRecommendations(animeId),
    loadAnimeRating(animeId),
    currentUserId ? loadUserRating(animeId, currentUserId) : Promise.resolve()
  ]);
  renderStars(currentUserRating || 0);

  // Música
  const musicList = animeData.music || [];
  if (musicList.length) {
    sessionStorage.setItem('musicList', JSON.stringify(musicList));
    playMusicFromArray(musicList);
  }

  document.querySelectorAll('details').forEach(d => {
    if (d.hasAttribute('data-listener')) return;
    d.setAttribute('data-listener', 'true');
    const aid = d.dataset.animeId;
    const idx = d.dataset.seasonIndex;
    if (aid && idx) d.ontoggle = () => toggleSeason(d, aid, parseInt(idx));
  });
}

// ---------- CARGAR CACHÉ DE BÚSQUEDA ----------
async function loadSearchCache() {
  if (searchCacheLoaded) return;
  try {
    const snapshot = await db.collection('catalogo').get();
    searchCache = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        title: data.title || '',
        img: data.img || '',
        aliases: data.aliases || []
      };
    });
    searchCacheLoaded = true;
    console.log(`📦 Caché de búsqueda: ${searchCache.length} animes`);
  } catch(e) {
    console.error('Error cargando caché de búsqueda:', e);
  }
}

// ---------- BÚSQUEDA RÁPIDA OPTIMIZADA ----------
function initSearch() {
  const searchInput = document.getElementById('quick-search');
  let floatingDropdown = null;
  let isScrolling = false;
  let currentQuery = '';

  function createFloatingDropdown() {
    if (floatingDropdown) floatingDropdown.remove();
    floatingDropdown = document.createElement('div');
    floatingDropdown.className = 'floating-dropdown';
    document.body.appendChild(floatingDropdown);
    return floatingDropdown;
  }

  function updateDropdownPosition() {
    if (!floatingDropdown || floatingDropdown.style.display === 'none') return;
    const rect = searchInput.getBoundingClientRect();
    let top = rect.bottom + window.scrollY + 5;
    let left = rect.left + window.scrollX;
    const dropdownWidth = floatingDropdown.offsetWidth;
    const viewportWidth = window.innerWidth;
    if (left + dropdownWidth > viewportWidth - 10) left = viewportWidth - dropdownWidth - 10;
    if (left < 10) left = 10;
    floatingDropdown.style.top = top + 'px';
    floatingDropdown.style.left = left + 'px';
    if (window.innerWidth <= 768) {
      floatingDropdown.style.width = '90%';
      floatingDropdown.style.left = '5%';
    } else {
      floatingDropdown.style.width = rect.width + 'px';
    }
  }

  const performSearch = debounce(() => {
    const q = currentQuery;
    if (!q) { if (floatingDropdown) floatingDropdown.style.display = 'none'; return; }
    
    const matches = searchCache.filter(item => {
      if (item.id === currentAnimeId) return false;
      const titlesToCheck = [item.title, ...(item.aliases || [])];
      return titlesToCheck.some(t => t.toLowerCase().startsWith(q));
    }).slice(0, 10);
    
    if (!floatingDropdown) createFloatingDropdown();
    if (!matches.length) {
      floatingDropdown.style.display = 'none';
      return;
    }
    floatingDropdown.innerHTML = matches.map(item => `
      <div class="search-item" data-id="${item.id}">
        <img src="${item.img}" loading="lazy">
        <div class="search-item-info"><span class="search-item-title">${item.title}</span></div>
      </div>
    `).join('');
    floatingDropdown.querySelectorAll('.search-item').forEach(el => {
      el.addEventListener('click', () => { window.location.href = `anime-detail.html?id=${el.dataset.id}`; });
      el.addEventListener('mouseenter', () => playUISound('hover'));
    });
    updateDropdownPosition();
    floatingDropdown.style.display = 'block';
  }, 200);

  searchInput.addEventListener('input', function() {
    currentQuery = this.value.trim().toLowerCase();
    performSearch();
  });

  const scrollHandler = () => {
    if (!isScrolling) {
      window.requestAnimationFrame(() => { updateDropdownPosition(); isScrolling = false; });
      isScrolling = true;
    }
  };
  window.addEventListener('resize', scrollHandler, { passive: true });
  window.addEventListener('scroll', scrollHandler, { passive: true });
  document.addEventListener('click', (e) => {
    if (!searchInput.contains(e.target) && !floatingDropdown?.contains(e.target)) {
      if (floatingDropdown) floatingDropdown.style.display = 'none';
    }
  });
  searchInput.addEventListener('focus', () => { if (currentQuery) performSearch(); });
}

// ---------- AUTENTICACIÓN ----------
function initAuthListener() {
  const handleUser = async (user) => {
    const previousUserId = currentUserId;
    currentUserId = user ? user.uid : null;
    
    if (currentAnimeId && animeData) {
      if (currentUserId && !previousUserId) {
        await loadUserRating(currentAnimeId, currentUserId);
      }
      if (!currentUserId && previousUserId) {
        currentUserRating = null;
        renderStars(0);
      }
      
      const details = document.querySelectorAll('details');
      for (let d of details) {
        if (d.open) {
          const aid = d.dataset.animeId;
          const sidx = d.dataset.seasonIndex;
          if (aid && sidx) await reloadSeason(d, aid, parseInt(sidx));
        }
      }
    }
  };

  if (window.ArchinimeState) {
    ArchinimeState.on('currentUser', handleUser);
  } else {
    auth.onAuthStateChanged(handleUser);
  }
}

// ---------- INICIALIZACIÓN ----------
(async function init() {
  // Carga temprana del caché de búsqueda en idle
  idleCallback(() => loadSearchCache());
  inicializarAnuncio();
  initAuthListener();

  if (!animeId) {
    document.getElementById('contenido').innerHTML = "<h2 style='text-align:center;padding:50px;'>ID de anime no proporcionado</h2>";
    return;
  }
  try {
    const doc = await db.collection('catalogo').doc(animeId).get();
    if (!doc.exists) {
      document.getElementById('contenido').innerHTML = "<h2 style='text-align:center;padding:50px;'>Anime no encontrado</h2>";
      return;
    }
    animeData = { id: doc.id, ...doc.data() };
    await renderMainContent();
    initSearch();
    document.getElementById('share-detail')?.addEventListener('click', () => {
      playUISound('click');
      navigator.clipboard.writeText(location.href);
      showToast('Enlace copiado');
    });
  } catch(e) {
    console.error('Error crítico cargando anime:', e);
    let errorMsg = e.message;
    if (errorMsg.includes('permission') || errorMsg.includes('Missing or insufficient permissions')) {
      errorMsg = 'No tienes permisos para ver este anime.';
    }
    document.getElementById('contenido').innerHTML = `<h2 style='text-align:center;padding:50px;color:red;'>Error al cargar el anime: ${errorMsg}</h2>`;
  }
})();