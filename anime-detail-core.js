// anime-detail-core.js - Versión Firestore (búsqueda por prefijo + alias)
// Obtiene datos desde la colección 'catalogo'
// CORREGIDO: Error "Missing or insufficient permissions" al escribir en animeRatings sin autenticación
// ACTUALIZADO: Usa ArchinimeState para el estado del usuario

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

// ---------- AUDIO CONTEXT (SONIDOS UI) ----------
let audioCtx = null;
function initAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
}
window._playUISound = function(type) {
  initAudio();
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

// ---------- MÚSICA DE FONDO (musica-data.js) ----------
let currentAudio = null, playlist = [], currentTrackIndex = -1;
function playTrack(idx) {
  if (currentAudio) { currentAudio.pause(); currentAudio.onended = null; }
  currentAudio = new Audio(playlist[idx]);
  currentAudio.volume = 0.3;
  currentAudio.loop = false;
  currentAudio.onended = () => {
    currentTrackIndex = (currentTrackIndex + 1) % playlist.length;
    playTrack(currentTrackIndex);
  };
  currentAudio.play().catch(e=>console.log);
}
document.addEventListener('click', () => {
  if (typeof audioPlaylists !== 'undefined' && !currentAudio) {
    const id = new URLSearchParams(location.search).get('id');
    if (audioPlaylists[id]?.length) {
      playlist = audioPlaylists[id];
      currentTrackIndex = Math.floor(Math.random() * playlist.length);
      playTrack(currentTrackIndex);
    }
  }
}, { once: true });

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
let searchCache = []; // { id, title, img, aliases }

// ---------- TOAST ----------
function showToast(msg, isError = false) {
  let toast = document.getElementById('toast');
  if (!toast) { toast = document.createElement('div'); toast.id = 'toast'; toast.className = 'toast'; document.body.appendChild(toast); }
  toast.innerHTML = `<i class="fas ${isError ? 'fa-exclamation-triangle' : 'fa-check-circle'}"></i> ${msg}`;
  toast.style.display = 'block';
  setTimeout(() => toast.style.display = 'none', 3000);
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
  const total = episodes.length;
  const seasonNum = season.num;
  const watched = await loadWatchedEpisodes(animeId);
  let processed = 0;
  const CHUNK = 30;

  function chunk() {
    const frag = document.createDocumentFragment();
    const end = Math.min(processed+CHUNK, total);
    for (let i=processed; i<end; i++) {
      const ep = episodes[i];
      const epNum = i+1;
      const isWatched = watched[seasonNum]?.includes(epNum);
      const btn = document.createElement('a');
      btn.href = `video-player.html?anime=${animeId}&s=${seasonNum}&e=${epNum}`;
      btn.className = 'ep-btn' + (isWatched ? ' watched' : '');
      btn.onmouseenter = () => playUISound('hover');
      
      const action = document.createElement('button');
      action.className = 'ep-action-btn';
      action.innerHTML = isWatched ? '<i class="fas fa-trash-alt"></i>' : '<i class="fas fa-check-circle"></i>';
      action.onclick = async (e) => {
        e.preventDefault(); e.stopPropagation();
        if (isWatched) await removeEpisodeWatched(animeId, seasonNum, epNum);
        else await markEpisodeWatched(animeId, seasonNum, epNum);
        await reloadSeason(details, animeId, seasonIdx);
      };
      btn.appendChild(action);
      
      const span = document.createElement('span');
      span.textContent = `▶ ${ep.title || `Episodio ${epNum}`}`;
      btn.appendChild(span);
      if (isWatched) {
        const tag = document.createElement('div');
        tag.className = 'watched-tag';
        tag.innerHTML = '<i class="fas fa-check"></i> VISTO';
        btn.appendChild(tag);
      }
      frag.appendChild(btn);
    }
    list.appendChild(frag);
    processed += CHUNK;
    if (processed < total) requestAnimationFrame(chunk);
    else if (loading) loading.style.display = 'none';
  }
  requestAnimationFrame(chunk);
};

// ---------- VOTACIONES (CORREGIDO: SIN ESCRITURA PARA USUARIOS NO AUTENTICADOS) ----------
async function loadAnimeRating(animeId) {
  try {
    const doc = await db.collection('animeRatings').doc(String(animeId)).get();
    if (doc.exists) {
      animeRatingData = doc.data();
    } else {
      // Solo leer el rating del documento del anime, pero NUNCA escribir si el usuario no está autenticado
      if (animeData?.rating != null) {
        animeRatingData = { avg: animeData.rating, count: 1 };
        // SOLO escribir en Firestore si el usuario está autenticado (evita error de permisos)
        if (currentUserId) {
          try {
            await db.collection('animeRatings').doc(String(animeId)).set({
              avg: animeData.rating,
              count: 1,
              updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
          } catch (writeError) {
            console.warn("No se pudo escribir el rating inicial (probablemente falta autenticación):", writeError);
            // No lanzamos el error, solo mostramos el rating localmente
          }
        }
      }
    }
    updateRatingDisplay();
    updateRatingLabel(animeRatingData.avg);
  } catch (error) {
    console.error("Error al cargar animeRating:", error);
    // Si falla la lectura, no rompemos la página, solo mostramos el rating del documento anime si existe
    if (animeData?.rating != null) {
      animeRatingData = { avg: animeData.rating, count: 1 };
      updateRatingDisplay();
      updateRatingLabel(animeRatingData.avg);
    }
  }
}
function updateRatingDisplay() {
  const avgSpan = document.getElementById('averageRatingDisplay');
  const countSpan = document.getElementById('voteCountDisplay');
  if (avgSpan) avgSpan.textContent = (animeRatingData.avg || 0).toFixed(1);
  if (countSpan) countSpan.textContent = `(${animeRatingData.count || 0} ${animeRatingData.count === 1 ? 'voto' : 'votos'})`;
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
function renderStars(currentValue = 0) {
  const container = document.getElementById('starRatingWidget');
  if (!container) return;
  container.innerHTML = '';
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
    container.appendChild(star);
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
      let newAvg = animeRatingData.avg || 0;
      let newCount = animeRatingData.count || 0;

      if (oldValue !== null && oldValue === newVal) {
        if (newCount > 1) {
          newAvg = (newAvg * newCount - oldValue) / (newCount - 1);
          newCount--;
        } else {
          newAvg = 0; newCount = 0;
        }
        t.delete(userRef);
        if (newCount === 0) {
          t.delete(ratingRef);
          animeRatingData = { avg: 0, count: 0 };
          currentUserRating = null;
        } else {
          t.set(ratingRef, { avg: newAvg, count: newCount, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
          animeRatingData = { avg: newAvg, count: newCount };
          currentUserRating = null;
        }
        document.getElementById('ratingMessage').innerHTML = '<i class="fas fa-info-circle"></i> Has eliminado tu voto.';
      } else {
        if (oldValue !== null) {
          newAvg = (newAvg * newCount - oldValue + newVal) / newCount;
        } else {
          newAvg = (newAvg * newCount + newVal) / (newCount + 1);
          newCount++;
        }
        t.set(ratingRef, { avg: newAvg, count: newCount, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
        t.set(userRef, { value: newVal, timestamp: firebase.firestore.FieldValue.serverTimestamp() });
        animeRatingData = { avg: newAvg, count: newCount };
        currentUserRating = newVal;
        document.getElementById('ratingMessage').innerHTML = '<i class="fas fa-check-circle"></i> ¡Gracias por tu voto!';
      }
    });
    updateRatingDisplay();
    renderStars(currentUserRating || 0);
    setTimeout(() => {
      const msg = document.getElementById('ratingMessage');
      if (msg.innerHTML.includes('Gracias') || msg.innerHTML.includes('eliminado')) msg.innerHTML = '';
    }, 3000);
  } catch(e) {
    console.error(e);
    document.getElementById('ratingMessage').innerHTML = '<i class="fas fa-times-circle"></i> Error al procesar el voto.';
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
    const random = docs.sort(() => 0.5 - Math.random()).slice(0, 12);
    if (!random.length) {
      grid.innerHTML = '<p style="color:#666;">Sin recomendaciones</p>';
      return;
    }
    grid.innerHTML = random.map(a => `
      <div class="rec-card" onclick="playUISound('click'); location.href='anime-detail.html?id=${a.id}'" onmouseenter="playUISound('hover')">
        <img src="${a.img}" alt="${a.title}" loading="lazy">
        <p>${a.title}</p>
      </div>
    `).join('');
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
  const ratingDisplay = (animeData.rating != null) ? animeData.rating.toFixed(1) : '--';
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
          <span id="averageRatingDisplay">${ratingDisplay}</span>
          <span id="voteCountDisplay">(0 votos)</span>
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

  renderStars(0);
  await renderRecommendations(animeId);
  await loadAnimeRating(animeId);
  
  if (currentUserId) {
    await loadUserRating(animeId, currentUserId);
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
    console.log(`📦 Caché de búsqueda cargada: ${searchCache.length} animes`);
  } catch(e) {
    console.error('Error cargando caché de búsqueda:', e);
  }
}

// ---------- BÚSQUEDA RÁPIDA (prefijo + alias, en cliente) ----------
function initSearch() {
  const searchInput = document.getElementById('quick-search');
  let floatingDropdown = null;
  let isScrolling = false;

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
      floatingDropdown.style.right = '5%';
    } else {
      floatingDropdown.style.width = rect.width + 'px';
    }
  }
  function showDropdown(results) {
    if (!floatingDropdown) createFloatingDropdown();
    if (!results.length) { floatingDropdown.style.display = 'none'; return; }
    floatingDropdown.innerHTML = results.map(item => `
      <div class="search-item" data-id="${item.id}">
        <img src="${item.img}" loading="lazy">
        <div class="search-item-info">
          <span class="search-item-title">${item.title}</span>
        </div>
      </div>
    `).join('');
    floatingDropdown.querySelectorAll('.search-item').forEach(el => {
      el.addEventListener('click', () => { window.location.href = `anime-detail.html?id=${el.dataset.id}`; });
      el.addEventListener('mouseenter', () => playUISound('hover'));
    });
    updateDropdownPosition();
    floatingDropdown.style.display = 'block';
  }
  function hideDropdown() { if (floatingDropdown) floatingDropdown.style.display = 'none'; }

  searchInput.addEventListener('input', function() {
    const q = this.value.trim().toLowerCase();
    if (!q) { hideDropdown(); return; }
    
    const matches = searchCache.filter(item => {
      if (item.id === currentAnimeId) return false;
      const titlesToCheck = [item.title, ...(item.aliases || [])];
      return titlesToCheck.some(t => t.toLowerCase().startsWith(q));
    }).slice(0, 10);
    
    showDropdown(matches);
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
    if (!searchInput.contains(e.target) && !floatingDropdown?.contains(e.target)) hideDropdown();
  });
  searchInput.addEventListener('focus', () => { if (searchInput.value.trim()) searchInput.dispatchEvent(new Event('input')); });
}

// ---------- AUTENTICACIÓN (usando ArchinimeState) ----------
function initAuthListener() {
  if (window.ArchinimeState) {
    // Usar el estado central
    ArchinimeState.on('currentUser', async (user) => {
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
    });
  } else {
    // Fallback: usar auth directamente si state.js no está cargado
    console.warn("ArchinimeState no encontrado, usando auth.onAuthStateChanged como fallback");
    auth.onAuthStateChanged(async (user) => {
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
    });
  }
}

// ---------- INICIALIZACIÓN (CORREGIDO: manejo de errores de permisos) ----------
(async function init() {
  await loadSearchCache();
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
      errorMsg = 'No tienes permisos para ver este anime. Por favor, inicia sesión o contacta al administrador.';
    }
    document.getElementById('contenido').innerHTML = `<h2 style='text-align:center;padding:50px;color:red;'>Error al cargar el anime: ${errorMsg}</h2>`;
  }
})();