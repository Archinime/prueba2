/* Archivo: script-index.js - Versión Optimizada */

/* ----------------------------
    Renderizado grid mejorado
    ---------------------------- */
function render(list) {
    const grid = document.getElementById('grid');
    if (!list || list.length === 0) {
        grid.innerHTML = `
        <div class="no-results" role="status" aria-live="polite">
        <div class="title shimmer">¡Ups!
        No se encontraron resultados que coincidan con la búsqueda.</div>
        <div class="subtitle">¿No lo encuentras?
        Puede que lo hayas escrito con un error o que todavía no lo haya subido.</div>
        <div class="sparkles"><button class="btn-reset" id="btn-reset">Entiendo</button></div>
        </div>
    `;
    const btn = document.getElementById('btn-reset');
        if (btn) btn.addEventListener('click', () => {
        document.getElementById('search').value = '';
        document.getElementById('genre-select').value = '';
        document.getElementById('demographic-select') && (document.getElementById('demographic-select').value = '');
        document.getElementById('rating-select').value = '';
        filtro();
        document.getElementById('search').focus();
        });
    return;
    }

    // Render sencillo optimizado
    grid.innerHTML = list.map(a => `
    <div class="card" onclick="location='anime-detail.html?id=${a.id}'" role="link" tabindex="0" data-anime-id="${a.id}">
        <img src="${a.img}" alt="${a.title}" loading="lazy" decoding="async">
        <div class="info"><strong>${a.title}</strong><span>⭐ ${a.rating ? (a.rating.toFixed? a.rating.toFixed(1): a.rating) : '—'}</span></div>
    </div>
    `).join('');
}

function updateResultsCount(count){ 
    const el = document.getElementById('results-count'); 
    if (el) el.textContent = count; 
}

function debounce(fn, wait){ 
    let t; 
    return (...a) => { 
        clearTimeout(t);
        t = setTimeout(() => fn(...a), wait); 
    }; 
}

const debouncedFiltro = debounce(filtro, 200);

function normalizeText(s){
    try {
        return (s||'').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
    } catch(e) {
        return (s||'').toLowerCase().replace(/[\u0300-\u036f]/g, '');
    }
}

function getBestTitleForSort(a){ 
    const titles = [a.title].concat(a.aliases || []);
    const norm = titles.map(t => normalizeText(t)); 
    norm.sort(); 
    return norm[0]; 
}

function filtro(){
    const qRaw = document.getElementById('search').value || '';
    const q = qRaw.trim(); 
    const qn = normalizeText(q);
    const g = document.getElementById('genre-select').value;
    const d = document.getElementById('demographic-select') ? document.getElementById('demographic-select').value : '';
    const cat = document.getElementById('rating-select').value;

    const filtrados = animes.filter(a => {
        const titles = [a.title].concat(a.aliases || []);
        const matchesText = !qn || titles.some(t => normalizeText(t).startsWith(qn));
        const byGenre = !g || (a.genres && a.genres.includes(g));
        const byDemo  = !d || (a.genres && a.genres.includes(d));
        let byRating = true;
        
        if (cat === 'excellent') byRating = a.rating >= 4.8;
        else if (cat === 'good') byRating = a.rating >= 4.6 && a.rating < 4.8;
        else if (cat === 'regular') byRating = a.rating < 4.6;
       
        return matchesText && byGenre && byDemo && byRating;
    });

    let resultList = filtrados.slice();
    
    if (qn) {
        resultList.sort((A, B) => {
            const titlesA = [A.title].concat(A.aliases || []).map(t => normalizeText(t));
            const titlesB = [B.title].concat(B.aliases || []).map(t => normalizeText(t));
            const aStarts = titlesA.some(t => t.startsWith(qn));
            const bStarts = titlesB.some(t => t.startsWith(qn));
            if (aStarts !== bStarts) return aStarts ? -1 : 1;
            const na = getBestTitleForSort(A); 
            const nb = getBestTitleForSort(B);
            return na < nb ? -1 : na > nb ? 1 : 0;
        });
    } else {
        resultList.sort((A, B) => normalizeText(A.title) < normalizeText(B.title) ? -1 : normalizeText(A.title) > normalizeText(B.title) ? 1 : 0);
    }

    render(resultList);
    updateResultsCount(resultList.length);
}

// inicial -> orden aleatorio en la grid
function shuffleArray(arr){ 
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--){ 
        const j = Math.floor(Math.random() * (i + 1)); 
        [a[i], a[j]] = [a[j], a[i]]; 
    } 
    return a; 
}

if (typeof animes !== 'undefined') {
    render(shuffleArray(animes));
    updateResultsCount(animes.length);
} else {
    console.error("Error: No se encontró la lista 'animes'. Revisa que index-data.js esté bien vinculado.");
}

document.getElementById('search').addEventListener('input', debouncedFiltro);
document.getElementById('search').addEventListener('keydown', (e) => { 
    if (e.key === 'Enter'){ 
        e.preventDefault(); 
        filtro(); 
    } 
});
['genre-select','rating-select','demographic-select'].forEach(id => { 
    const el = document.getElementById(id); 
    if (el) el.addEventListener('change', filtro); 
});

/* ----------------------------
    Helpers de rendimiento optimizados
    ---------------------------- */
function getPerformanceHints() {
    let cores = navigator.hardwareConcurrency || 4;
    let deviceMem = navigator.deviceMemory || 4;
    let prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let processingScale = 1.0;
    
    if (cores >= 8 && deviceMem >= 8) processingScale = 1.0;
    else if (cores >= 4 && deviceMem >= 4) processingScale = 0.85;
    else if (cores >= 2 && deviceMem >= 2) processingScale = 0.6;
    else processingScale = 0.45;
    
    if (prefersReducedMotion) processingScale = Math.min(processingScale, 0.55);
    
    return { cores, deviceMem, processingScale, prefersReducedMotion };
}

window.addEventListener('DOMContentLoaded', () => {
    const video = document.getElementById('bg-video');
    const overlay = document.getElementById('overlay');
    const hints = getPerformanceHints();

    if (hints.processingScale < 0.55 || hints.prefersReducedMotion) {
        try { 
            video.pause(); 
            video.style.display = 'none'; 
            overlay.style.opacity = '1'; 
        } catch(e){}
    } else {
        try { 
            video.preload = video.getAttribute('preload') || 'metadata'; 
        } catch(e){ 
            console.warn(e); 
        }
        video.muted = true; 
        video.playsInline = true;
        
        const revealVideo = () => { 
            video.style.opacity = '1'; 
            overlay.style.opacity = '0'; 
        };
        
        overlay.addEventListener('transitionend', (ev) => { 
            if (ev.propertyName === 'opacity' && getComputedStyle(overlay).opacity === '0') 
                overlay.style.display = 'none'; 
        });
        
        video.addEventListener('playing', () => { revealVideo(); }, { once: true });
        video.addEventListener('canplaythrough', () => { video.play().catch(()=>{}); }, { once: true });
        video.addEventListener('loadeddata', () => { video.play().catch(()=>{}); }, { once: true });
    }
});

/* ----------------------------
   Lógica de Música optimizada
   ---------------------------- */
window.addEventListener('DOMContentLoaded', () => {
    const audio = document.getElementById('bg-music');
    const hints = getPerformanceHints();
    
    if (typeof musicList === 'undefined' || musicList.length === 0) return;

    let currentMusicIndex = Math.floor(Math.random() * musicList.length);

    function playByIndex(idx) {
        currentMusicIndex = ((idx % musicList.length) + musicList.length) % musicList.length;
        audio.src = musicList[currentMusicIndex];
        audio.load();
        audio.volume = 0.75;
        
        if (hints.processingScale >= 0.6) {
            audio.play().catch(() => { 
                document.addEventListener('click', () => { 
                    audio.play().catch(() => {}); 
                }, { once: true }); 
            });
        }
    }

    audio.addEventListener('ended', () => { 
        currentMusicIndex = currentMusicIndex + 1; 
        playByIndex(currentMusicIndex); 
    });
    
    playByIndex(currentMusicIndex);
});

function openInNewTab(url){ 
    try { 
        const w = window.open(url, '_blank'); 
        if (w) w.focus();
    } catch(e){}  
}

/* ----------------------------
     Chroma + FG logic optimizado
     ---------------------------- */
const fgContainer = document.getElementById('fgContainer');
const fgCanvas = document.getElementById('fgCanvas');
const fgVideo = document.getElementById('fgVideo');
const bgVideo = document.getElementById('bg-video');
const bgMusic = document.getElementById('bg-music');
const ctx = fgCanvas.getContext ? fgCanvas.getContext('2d', { alpha: true }) : null;

let off = document.createElement('canvas');
let offCtx = off.getContext ? off.getContext('2d') : null;
let chromaIntervalId = null;
let chromaFps = 24;
let usingChroma = true;
let visibilityPaused = false;
let currentVideoObj = null;
let lastObjectUrl = null;
let isAnimatingExplosion = false;
let scheduledTimer = null;

function pickRandomVideo(excludeId){
    if (typeof videoList === 'undefined' || videoList.length === 0) return null;
    if (videoList.length === 1) return videoList[0];
    const candidates = videoList.filter(v => v.id !== excludeId);
    if (candidates.length === 0) return videoList[Math.floor(Math.random() * videoList.length)];
    return candidates[Math.floor(Math.random() * candidates.length)];
}

function placeRandomSide(infoObj){
    const side = Math.random() < 0.5 ? 'left' : 'right';
    const margin = window.matchMedia('(max-width:767px)').matches ? '12px' : '20px';
    if (side === 'left') { 
        fgContainer.style.left = margin; 
        fgContainer.style.right = ''; 
    } else { 
        fgContainer.style.right = margin; 
        fgContainer.style.left = ''; 
    }
}

function drawProcessedToScreen(){
    if (!ctx || !fgCanvas) return;
    const cw = fgCanvas.clientWidth || parseInt(fgCanvas.style.width) || fgCanvas.width;
    const ch = fgCanvas.clientHeight || parseInt(fgCanvas.style.height) || fgCanvas.height;
    const vw = off.width || 1;
    const vh = off.height || 1;
    ctx.clearRect(0, 0, cw, ch);
    if (vw === 0 || vh === 0 || cw === 0 || ch === 0) return;
    const scale = Math.min(cw / vw, ch / vh);
    const dw = Math.round(vw * scale);
    const dh = Math.round(vh * scale);
    const dx = Math.round((cw - dw) / 2);
    const dy = Math.round((ch - dh) / 2);
    ctx.drawImage(off, 0, 0, vw, vh, dx, dy, dw, dh);
}

function adjustContainerToVideo(video, infoObj){
    const vw = video.videoWidth || 16;
    const vh = video.videoHeight || 9;
    const hints = getPerformanceHints();
    let maxW = Math.min(window.innerWidth * 0.32, 360);
    let maxH = Math.min(window.innerHeight * 0.4, 640);
    
    if (window.matchMedia('(max-width:767px)').matches) {
        if (infoObj && infoObj.id === 'rem') {
            maxW = Math.min(window.innerWidth * 0.30, 180);
            maxH = Math.min(window.innerHeight * 0.30, 200);
        } else if (infoObj && infoObj.id === 'hola') {
            maxW = Math.min(window.innerWidth * 0.62, 380);
            maxH = Math.min(window.innerHeight * 0.62, 520);
        } else {
            maxW = Math.min(window.innerWidth * 0.45, 260);
            maxH = Math.min(window.innerHeight * 0.45, 420);
        }
    } else {
        maxW = Math.min(window.innerWidth * 0.32, 360);
        maxH = Math.min(window.innerHeight * 0.4, 640);
    }

    const displayScale = Math.min(maxW / vw, maxH / vh, 1.0);
    const displayW = Math.max(120, Math.round(vw * displayScale));
    const displayH = Math.max(80, Math.round(vh * displayScale));
    fgContainer.style.width = displayW + 'px';
    fgContainer.style.height = displayH + 'px';

    const dpr = Math.max(1, window.devicePixelRatio || 1);
    fgCanvas.width = Math.round(displayW * dpr);
    fgCanvas.height = Math.round(displayH * dpr);
    fgCanvas.style.width = displayW + 'px';
    fgCanvas.style.height = displayH + 'px';
    
    if (ctx && typeof ctx.setTransform === 'function') {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    const capHigh = 1280;
    const capMed = 720;
    const hintsScale = hints.processingScale;
    const chosenCap = hintsScale >= 0.85 ? capHigh : hintsScale >= 0.6 ? capMed : 480;

    const sourceW = vw;
    const sourceH = vh;
    const sourceRatio = sourceW / sourceH || (16/9);

    let offW = Math.min(sourceW, chosenCap);
    let offH = Math.round(offW / sourceRatio);
    
    if (offH > chosenCap) {
        offH = chosenCap;
        offW = Math.round(offH * sourceRatio);
    }
    
    off.width = Math.max(16, offW);
    off.height = Math.max(16, offH);

    resizeFire