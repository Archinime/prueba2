/* Archivo: script-index.js - Versión CORREGIDA & OPTIMIZADA */

// ======== VARIABLES GLOBALES ========
let animeDatabase = [];
let filteredAnimes = [];

// ======== FUNCIÓN PRINCIPAL DE RENDERIZADO ========
function render(list) {
    const grid = document.getElementById('grid');
    if (!grid) return;
    
    if (!list || list.length === 0) {
        grid.innerHTML = '';
        grid.style.display = 'none';
        document.getElementById('noResultsBox').style.display = 'flex';
        return;
    }

    grid.style.display = 'grid';
    document.getElementById('noResultsBox').style.display = 'none';
    
    // Optimización: usar fragment en lugar de reflow continuo
    const fragment = document.createDocumentFragment();
    
    list.forEach(anime => {
        const card = document.createElement('div');
        card.className = 'card';
        card.setAttribute('role', 'link');
        card.setAttribute('tabindex', '0');
        card.setAttribute('data-anime-id', anime.id || '');
        
        card.innerHTML = `
            <img src="${anime.img || ''}" alt="${anime.title || 'Anime'}" loading="lazy" decoding="async">
            <div class="info">
                <strong>${anime.title || 'Sin título'}</strong>
                <span>⭐ ${anime.rating ? (typeof anime.rating === 'number' ? anime.rating.toFixed(1) : anime.rating) : '—'}</span>
            </div>
        `;
        
        card.addEventListener('click', () => {
            window.location.href = `anime-detail.html?id=${anime.id}`;
        });
        
        card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                window.location.href = `anime-detail.html?id=${anime.id}`;
            }
        });
        
        fragment.appendChild(card);
    });
    
    grid.innerHTML = '';
    grid.appendChild(fragment);
}

// ======== FUNCIONES DE NORMALIZACIÓN Y BÚSQUEDA ========
function normalizeText(s) {
    try {
        return (s || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
    } catch(e) {
        return (s || '').toLowerCase().replace(/[\u0300-\u036f]/g, '');
    }
}

function matchQuery(anime, query) {
    if (!query) return true;
    
    const titles = [anime.title];
    if (anime.aliases && Array.isArray(anime.aliases)) {
        titles.push(...anime.aliases);
    }
    
    const queryNorm = normalizeText(query);
    return titles.some(title => normalizeText(title).includes(queryNorm));
}

function matchGenre(anime, genre) {
    if (!genre) return true;
    return anime.genres && Array.isArray(anime.genres) && anime.genres.includes(genre);
}

function matchDemographic(anime, demographic) {
    if (!demographic) return true;
    return anime.genres && Array.isArray(anime.genres) && anime.genres.includes(demographic);
}

function matchRating(anime, ratingCategory) {
    if (!ratingCategory) return true;
    
    const rating = parseFloat(anime.rating) || 0;
    
    if (ratingCategory === 'excellent') return rating >= 4.8;
    if (ratingCategory === 'good') return rating >= 4.6 && rating < 4.8;
    if (ratingCategory === 'regular') return rating < 4.6;
    
    return true;
}

// ======== FUNCIÓN DE FILTRADO PRINCIPAL ========
function filtro() {
    const searchInput = document.getElementById('search');
    const genreSelect = document.getElementById('genre-select');
    const demographicSelect = document.getElementById('demographic-select');
    const ratingSelect = document.getElementById('rating-select');
    
    const query = (searchInput ? searchInput.value.trim() : '').toLowerCase();
    const genre = genreSelect ? genreSelect.value : '';
    const demographic = demographicSelect ? demographicSelect.value : '';
    const ratingCat = ratingSelect ? ratingSelect.value : '';
    
    // Filtrar animes
    filteredAnimes = animeDatabase.filter(anime => 
        matchQuery(anime, query) && 
        matchGenre(anime, genre) && 
        matchDemographic(anime, demographic) && 
        matchRating(anime, ratingCat)
    );
    
    // Ordenar resultados
    if (query) {
        filteredAnimes.sort((a, b) => {
            const aTitle = normalizeText(a.title);
            const bTitle = normalizeText(b.title);
            
            const aMatch = aTitle.startsWith(normalizeText(query));
            const bMatch = bTitle.startsWith(normalizeText(query));
            
            if (aMatch !== bMatch) return aMatch ? -1 : 1;
            return aTitle.localeCompare(bTitle);
        });
    } else {
        filteredAnimes.sort((a, b) => {
            const aTitle = normalizeText(a.title);
            const bTitle = normalizeText(b.title);
            return aTitle.localeCompare(bTitle);
        });
    }
    
    render(filteredAnimes);
    updateTerminalStatus();
}

// ======== UTILIDADES ========
function updateTerminalStatus() {
    const terminalOut = document.getElementById('firstOut');
    if (!terminalOut) return;
    
    const searchVal = document.getElementById('search')?.value?.trim() || '';
    const genreVal = document.getElementById('genre-select')?.value || '';
    const demoVal = document.getElementById('demographic-select')?.value || '';
    const rateVal = document.getElementById('rating-select')?.value || '';

    let msgs = [];
    if (searchVal) msgs.push(`QUERY:"${searchVal.toUpperCase()}"`);
    if (genreVal) msgs.push(`GEN:${genreVal.toUpperCase()}`);
    if (demoVal) msgs.push(`DEMO:${demoVal.toUpperCase()}`);
    if (rateVal) msgs.push(`RANK:${rateVal.toUpperCase()}`);

    let finalMsg = "> FILTRANDO_MATRIZ // ";
    if (msgs.length === 0) {
        finalMsg = "> MOSTRANDO_TODO // LINK_STABLE // ANIMES: " + animeDatabase.length;
    } else {
        finalMsg += msgs.join(" | ") + " // RESULTADOS: " + filteredAnimes.length;
    }
    
    typeWriter(finalMsg, terminalOut);
}

function typeWriter(text, element) {
    if (!element) return;
    element.textContent = '';
    let i = 0;
    clearInterval(element._tw);
    element._tw = setInterval(() => {
        if(i < text.length) {
            element.textContent += text.charAt(i);
            i++;
        } else {
            clearInterval(element._tw);
        }
    }, 30);
}

function resetFilters() {
    const search = document.getElementById('search');
    const genre = document.getElementById('genre-select');
    const demographic = document.getElementById('demographic-select');
    const rating = document.getElementById('rating-select');
    
    if (search) search.value = '';
    if (genre) genre.value = '';
    if (demographic) demographic.value = '';
    if (rating) rating.value = '';
    
    filtro();
    if (search) search.focus();
}

function shuffleArray(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function debounce(fn, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            fn(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// ======== EVENT LISTENERS ========
const debouncedFiltro = debounce(filtro, 200);

document.addEventListener('DOMContentLoaded', () => {
    const search = document.getElementById('search');
    const genre = document.getElementById('genre-select');
    const demographic = document.getElementById('demographic-select');
    const rating = document.getElementById('rating-select');
    
    if (search) {
        search.addEventListener('input', debouncedFiltro);
        search.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                filtro();
            }
        });
    }
    
    if (genre) genre.addEventListener('change', filtro);
    if (demographic) demographic.addEventListener('change', filtro);
    if (rating) rating.addEventListener('change', filtro);
});

// ======== INICIALIZACIÓN PRINCIPAL ========
function initializeApp() {
    // Verificar si existe la variable global 'animes' desde index-data.js
    if (typeof animes !== 'undefined' && Array.isArray(animes)) {
        animeDatabase = animes;
        console.log(`✓ Base de datos cargada: ${animeDatabase.length} animes`);
    } else {
        console.error('⚠ Error: index-data.js no se cargó correctamente');
        animeDatabase = [];
    }
    
    // Mostrar animes iniciales (aleatorios)
    if (animeDatabase.length > 0) {
        const initialDisplay = shuffleArray(animeDatabase);
        render(initialDisplay);
        filteredAnimes = initialDisplay;
        updateTerminalStatus();
    } else {
        render([]);
    }
}

// Ejecutar inicialización cuando el DOM esté listo
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}

// ======== MÚSICA DE FONDO OPTIMIZADA ========
window.addEventListener('DOMContentLoaded', () => {
    const audio = document.getElementById('bg-music');
    if (!audio) return;
    
    if (typeof musicList === 'undefined' || !Array.isArray(musicList) || musicList.length === 0) {
        console.log('⚠ No music list available');
        return;
    }

    let currentMusicIndex = Math.floor(Math.random() * musicList.length);

    function playByIndex(idx) {
        currentMusicIndex = ((idx % musicList.length) + musicList.length) % musicList.length;
        audio.src = musicList[currentMusicIndex];
        audio.load();
        audio.volume = 0.3;
        
        audio.play().catch(() => {
            document.addEventListener('click', () => {
                audio.play().catch(() => {});
            }, { once: true });
        });
    }

    audio.addEventListener('ended', () => {
        playByIndex(currentMusicIndex + 1);
    });
    
    playByIndex(currentMusicIndex);
});

// ======== VIDEO DE FONDO OPTIMIZADO ========
window.addEventListener('load', () => {
    const bgVideo = document.getElementById('bg-video');
    if (!bgVideo) return;
    
    bgVideo.muted = true;
    bgVideo.playsInline = true;
    
    const playVideo = () => {
        bgVideo.play().catch(() => {
            console.log('⚠ Autoplay blocked');
        });
    };
    
    bgVideo.addEventListener('canplaythrough', playVideo, { once: true });
    bgVideo.addEventListener('loadeddata', playVideo, { once: true });
    
    // Fallback si video no se carga
    setTimeout(() => {
        if (!bgVideo.paused || bgVideo.currentTime === 0) {
            bgVideo.play().catch(() => {});
        }
    }, 2000);
});

// ======== MANEJO GLOBAL ========
window.filtro = filtro;
window.resetFilters = resetFilters;