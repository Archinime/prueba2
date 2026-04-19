// background-manager.js
const BG_STORAGE_KEY = 'archinime_selected_bg';
const DEFAULT_BG_ID = 'galaxia';

// Lista de fondos disponibles
const BG_OPTIONS = [
  { id: 'galaxia', name: '🌌 Galaxia', videoUrl: 'galaxia.mp4', posterUrl: 'galaxia-morado1.avif' },
  { id: 'cyber_city', name: '🏙️ Ciudad Cyberpunk', videoUrl: 'cyber_city.mp4', posterUrl: 'cyber_city.avif' },
  { id: 'neon_rain', name: '🌧️ Lluvia Neón', videoUrl: 'neon_rain.mp4', posterUrl: 'neon_rain.avif' },
  { id: 'matrix', name: '💚 Código Matrix', videoUrl: 'matrix_rain.mp4', posterUrl: 'matrix.avif' }
];

function applyBackground(videoUrl, posterUrl) {
  const bgVideo = document.getElementById('bg-video');
  if (!bgVideo) return;
  
  // Cambiar source
  const source = bgVideo.querySelector('source');
  if (source) {
    source.src = videoUrl;
  } else {
    // Si no hay tag <source>, lo creamos
    const newSource = document.createElement('source');
    newSource.src = videoUrl;
    newSource.type = 'video/mp4';
    bgVideo.appendChild(newSource);
  }
  
  if (posterUrl) bgVideo.poster = posterUrl;
  
  // Recargar y reproducir
  bgVideo.load();
  bgVideo.play().catch(e => console.log('Autoplay bloqueado', e));
}

function loadUserBackground() {
  const savedId = localStorage.getItem(BG_STORAGE_KEY);
  const selected = BG_OPTIONS.find(bg => bg.id === savedId) || BG_OPTIONS.find(bg => bg.id === DEFAULT_BG_ID);
  applyBackground(selected.videoUrl, selected.posterUrl);
}

function saveBackgroundPreference(bgId) {
  localStorage.setItem(BG_STORAGE_KEY, bgId);
  const selected = BG_OPTIONS.find(bg => bg.id === bgId);
  if (selected) applyBackground(selected.videoUrl, selected.posterUrl);
}

// Exponer funciones globalmente
window.BGManager = { loadUserBackground, saveBackgroundPreference, BG_OPTIONS };