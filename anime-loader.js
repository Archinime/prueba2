// ==================== anime-loader.js ====================
// Lógica de carga de animes, filtros, paginación, renderizado y selects personalizados

// Variables globales
let allAnimes = [];
let shuffledAnimes = [];
let currentShufflePage = 0;
const ITEMS_PER_PAGE = 20;
let firestoreRatings = new Map();
let currentFilters = { search: '', genre: '', demographic: '', rating: '' };
let isLoading = false;
let hasMore = true;
let debounceTimer = null;

// Elementos del DOM
const gridEl = document.getElementById('grid');
const searchInput = document.getElementById('search');
const genreSelect = document.getElementById('genre-select');
const demographicSelect = document.getElementById('demographic-select');
const ratingSelect = document.getElementById('rating-select');

// Funciones auxiliares
function normalizeText(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function getDisplayRating(anime) {
  const animeId = parseInt(anime.id);
  if (firestoreRatings.has(animeId)) {
    const ratingObj = firestoreRatings.get(animeId);
    if (ratingObj && typeof ratingObj.avg === 'number') return ratingObj.avg.toFixed(1);
  }
  if (anime.rating != null && typeof anime.rating === 'number' && !isNaN(anime.rating)) return anime.rating.toFixed(1);
  return '—';
}

function getNumericRating(anime) {
  const animeId = parseInt(anime.id);
  if (firestoreRatings.has(animeId)) {
    const avg = firestoreRatings.get(animeId).avg;
    if (typeof avg === 'number') return avg;
  }
  if (anime.rating != null && typeof anime.rating === 'number') return anime.rating;
  return 0;
}

function mostrarNoResultados() {
  if (!gridEl) return;
  gridEl.innerHTML = `<div class="cyber-no-results" style="grid-column:1/-1; display:flex; flex-direction:column; align-items:center; padding:60px; background:rgba(10,12,16,0.7); border:1px solid var(--neon-purple); border-radius:16px;">
    <i class="fas fa-satellite-dish" style="font-size:3rem; color:var(--neon-cyan);"></i><h2 style="font-family:Orbitron; margin:20px 0;">Sin Resultados</h2>
    <p>Prueba con otros filtros o busca por alias.</p><button onclick="resetearFiltros()" style="margin-top:20px; background:transparent; border:2px solid var(--neon-pink); color:#fff; padding:12px 30px; border-radius:8px; cursor:pointer;">Restaurar Radares</button>
  </div>`;
}

function resetearFiltros() {
  if (searchInput) searchInput.value = '';
  if (genreSelect) genreSelect.value = '';
  if (demographicSelect) demographicSelect.value = '';
  if (ratingSelect) ratingSelect.value = '';
  currentFilters = { search: '', genre: '', demographic: '', rating: '' };
  currentShufflePage = 0;
  cargarAnimesPaginado(true);
}

function renderAnimes(animes, append = true) {
  if (!gridEl) return;
  if (!append) gridEl.innerHTML = '';
  if (!animes.length && !append) { mostrarNoResultados(); return; }
  const frag = document.createDocumentFragment();
  animes.forEach(a => {
    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.id = a.id;
    card.setAttribute('onclick', `location='anime-detail.html?id=${a.id}'`);
    const rating = getDisplayRating(a);
    card.innerHTML = `<img src="${a.img}" alt="${a.title}" loading="lazy"><div class="info"><strong>${a.title}</strong><span class="rating-value">⭐ ${rating}</span></div>`;
    frag.appendChild(card);
  });
  gridEl.appendChild(frag);
  
  // Efecto tilt solo en dispositivos sin touch
  const isTouchDevice = (('ontouchstart' in window) || (navigator.maxTouchPoints > 0));
  document.querySelectorAll('.card:not([data-tilt-init])').forEach(c => {
    c.dataset.tiltInit = 'true';
    if (!isTouchDevice) {
      c.addEventListener('mousemove', (e) => {
        if (c.tiltRAF) cancelAnimationFrame(c.tiltRAF);
        c.tiltRAF = requestAnimationFrame(() => {
          const rect = c.getBoundingClientRect(), x = e.clientX - rect.left, y = e.clientY - rect.top;
          const rotX = ((y - rect.height/2) / (rect.height/2)) * -6, rotY = ((x - rect.width/2) / (rect.width/2)) * 6;
          c.style.transform = `perspective(1200px) rotateX(${rotX}deg) rotateY(${rotY}deg) scale(1.02)`;
        });
      });
      c.addEventListener('mouseleave', () => { if (c.tiltRAF) cancelAnimationFrame(c.tiltRAF); c.style.transform = ''; });
    }
  });
}

async function aplicarFiltros() {
  const hasActiveFilters = currentFilters.search || currentFilters.genre || currentFilters.demographic || currentFilters.rating;
  if (!hasActiveFilters) {
    cargarAnimesPaginado(true);
    return;
  }
  if (!gridEl) return;
  gridEl.innerHTML = '';
  isLoading = true;
  try {
    let query = db.collection('catalogo');
    if (currentFilters.genre) query = query.where('genres', 'array-contains', currentFilters.genre);
    query = query.orderBy('title');
    const snapshot = await query.limit(200).get();
    let animes = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    if (currentFilters.demographic) animes = animes.filter(a => a.genres && a.genres.includes(currentFilters.demographic));
    if (currentFilters.search) {
      const searchTermNormalized = normalizeText(currentFilters.search);
      animes = animes.filter(a => {
        const titles = [a.title, ...(a.aliases || [])];
        return titles.some(t => normalizeText(t).startsWith(searchTermNormalized));
      });
    }
    if (currentFilters.rating) {
      animes = animes.filter(a => {
        const r = getNumericRating(a);
        if (currentFilters.rating === 'excellent') return r >= 4.8;
        if (currentFilters.rating === 'good') return r >= 4.6 && r < 4.8;
        if (currentFilters.rating === 'regular') return r < 4.6;
        return true;
      });
    }
    renderAnimes(animes, false);
    if (animes.length === 0) mostrarNoResultados();
  } catch (e) {
    console.error('Error en filtros:', e);
    if (gridEl) gridEl.innerHTML = `<div class="error-message">Error: ${e.message}</div>`;
  } finally {
    isLoading = false;
  }
}

async function cargarAnimesPaginado(reset = true) {
  const hasActiveFilters = currentFilters.search || currentFilters.genre || currentFilters.demographic || currentFilters.rating;
  if (hasActiveFilters) return;
  if (isLoading) return;
  if (reset) {
    currentShufflePage = 0;
    if (gridEl) gridEl.innerHTML = '';
    hasMore = true;
  }
  if (!reset && !hasMore) return;
  isLoading = true;
  try {
    if (allAnimes.length === 0) {
      const snapshot = await db.collection('catalogo').orderBy('title').get();
      allAnimes = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      shuffledAnimes = [...allAnimes];
      for (let i = shuffledAnimes.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffledAnimes[i], shuffledAnimes[j]] = [shuffledAnimes[j], shuffledAnimes[i]];
      }
    }
    const start = currentShufflePage * ITEMS_PER_PAGE;
    const end = start + ITEMS_PER_PAGE;
    const pageAnimes = shuffledAnimes.slice(start, end);
    if (pageAnimes.length === 0) {
      hasMore = false;
      if (reset && allAnimes.length === 0) mostrarNoResultados();
      isLoading = false;
      return;
    }
    renderAnimes(pageAnimes, !reset);
    currentShufflePage++;
    if (end >= shuffledAnimes.length) hasMore = false;
  } catch (e) {
    console.error('Error en paginación aleatoria:', e);
    if (gridEl) gridEl.innerHTML = `<div class="error-message">Error al cargar: ${e.message}</div>`;
  } finally {
    isLoading = false;
  }
}

function debouncedAplicarFiltros() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => aplicarFiltros(), 300);
}

// Eventos de filtros
if (searchInput) searchInput.addEventListener('input', e => { currentFilters.search = e.target.value; debouncedAplicarFiltros(); });
if (genreSelect) genreSelect.addEventListener('change', e => { currentFilters.genre = e.target.value; aplicarFiltros(); });
if (demographicSelect) demographicSelect.addEventListener('change', e => { currentFilters.demographic = e.target.value; aplicarFiltros(); });
if (ratingSelect) ratingSelect.addEventListener('change', e => { currentFilters.rating = e.target.value; aplicarFiltros(); });

// Scroll infinito
window.addEventListener('scroll', () => {
  const hasActiveFilters = currentFilters.search || currentFilters.genre || currentFilters.demographic || currentFilters.rating;
  if (!hasActiveFilters && !isLoading && hasMore && window.innerHeight + window.scrollY >= document.body.offsetHeight - 500) {
    cargarAnimesPaginado(false);
  }
});

// Exponer funciones globales
window.resetearFiltros = resetearFiltros;
window.cargarAnimesPaginado = cargarAnimesPaginado;
window.aplicarFiltros = aplicarFiltros;

// Inicializar datos de ratings y catálogo
async function initData() {
  try {
    const ratingsSnapshot = await db.collection('animeRatings').get();
    ratingsSnapshot.forEach(doc => {
      const data = doc.data();
      if (typeof data.avg === 'number') firestoreRatings.set(parseInt(doc.id), { avg: data.avg, count: data.count || 0 });
    });
    const animesSnapshot = await db.collection('catalogo').orderBy('title').limit(50).get();
    allAnimes = animesSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    shuffledAnimes = [...allAnimes];
    for (let i = shuffledAnimes.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffledAnimes[i], shuffledAnimes[j]] = [shuffledAnimes[j], shuffledAnimes[i]];
    }
    const firstPage = shuffledAnimes.slice(0, ITEMS_PER_PAGE);
    renderAnimes(firstPage, false);
    window.allAnimes = allAnimes; // Para que el script de carga lo detecte
  } catch (e) {
    console.warn('Error inicial:', e);
  }
}

// Inicialización de selects personalizados (para móvil y desktop)
function initCustomSelects() {
  const selects = ['genre-select', 'demographic-select', 'rating-select'];
  const isMobile = window.matchMedia('(max-width: 768px)').matches;
  function updateTriggerText(trigger, selectEl) {
    if (trigger && selectEl) trigger.textContent = selectEl.options[selectEl.selectedIndex]?.textContent || selectEl.options[0].textContent;
  }
  selects.forEach(id => {
    const select = document.getElementById(id);
    if (!select) return;
    const trigger = document.createElement('div');
    trigger.className = 'custom-select-trigger';
    updateTriggerText(trigger, select);
    select.parentNode.insertBefore(trigger, select);
    trigger.addEventListener('click', () => {
      if (isMobile) {
        const overlay = document.createElement('div');
        overlay.className = 'select-popup-overlay';
        const popup = document.createElement('div');
        popup.className = 'select-popup';
        const header = document.createElement('div');
        header.className = 'select-popup-header';
        header.textContent = select.getAttribute('aria-label') || 'Seleccionar';
        popup.appendChild(header);
        Array.from(select.options).forEach(opt => {
          const optDiv = document.createElement('div');
          optDiv.className = 'select-popup-option';
          if (opt.value === select.value) optDiv.classList.add('selected');
          optDiv.textContent = opt.textContent;
          optDiv.addEventListener('click', () => {
            select.value = opt.value;
            select.dispatchEvent(new Event('change'));
            updateTriggerText(trigger, select);
            overlay.classList.remove('active');
            enableBodyScroll();
            setTimeout(() => overlay.remove(), 300);
          });
          popup.appendChild(optDiv);
        });
        overlay.appendChild(popup);
        document.body.appendChild(overlay);
        overlay.addEventListener('click', e => { if (e.target === overlay) { overlay.classList.remove('active'); enableBodyScroll(); setTimeout(() => overlay.remove(), 300); } });
        disableBodyScroll();
        setTimeout(() => overlay.classList.add('active'), 10);
      } else {
        const existing = document.querySelector('.custom-select-dropdown');
        if (existing) existing.remove();
        const rect = trigger.getBoundingClientRect();
        const dropdown = document.createElement('div');
        dropdown.className = 'custom-select-dropdown';
        dropdown.style.top = (rect.bottom + window.scrollY) + 'px';
        dropdown.style.left = (rect.left + window.scrollX) + 'px';
        dropdown.style.minWidth = rect.width + 'px';
        Array.from(select.options).forEach(opt => {
          const optDiv = document.createElement('div');
          optDiv.className = 'custom-select-option';
          optDiv.textContent = opt.textContent;
          if (opt.value === select.value) { optDiv.style.background = 'rgba(0, 243, 255, 0.15)'; optDiv.style.color = 'var(--neon-cyan)'; }
          optDiv.addEventListener('click', () => {
            select.value = opt.value;
            select.dispatchEvent(new Event('change'));
            updateTriggerText(trigger, select);
            dropdown.remove();
          });
          dropdown.appendChild(optDiv);
        });
        document.body.appendChild(dropdown);
        const closeDropdown = e => { if (!dropdown.contains(e.target) && e.target !== trigger) { dropdown.remove(); document.removeEventListener('click', closeDropdown); document.removeEventListener('scroll', closeDropdown); } };
        setTimeout(() => { document.addEventListener('click', closeDropdown); document.addEventListener('scroll', closeDropdown, { passive: true }); }, 10);
      }
    });
  });
}

// Iniciar carga de datos y selects personalizados
initData();
initCustomSelects();

window.initCustomSelects = initCustomSelects;