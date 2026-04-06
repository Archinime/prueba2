/* Archivo: script-index.js */

/* ----------------------------
    Renderizado grid
    ---------------------------- */
function render(list) {
    const grid = document.getElementById('grid');
    if (!list || list.length === 0) {
        
        // Inyectamos un diseño Cyberpunk elegante para cuando no hay resultados
        if (!document.getElementById('archinime-no-results-css')) {
            const style = document.createElement('style');
            style.id = 'archinime-no-results-css';
            style.innerHTML = `
                .cyber-no-results {
                    grid-column: 1 / -1;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    padding: 60px 20px;
                    background: rgba(10, 12, 16, 0.7);
                    border: 1px solid var(--neon-purple);
                    border-radius: 16px;
                    box-shadow: 0 0 30px rgba(188, 19, 254, 0.15), inset 0 0 20px rgba(0, 243, 255, 0.05);
                    backdrop-filter: blur(10px);
                    text-align: center;
                    margin-top: 20px;
                    animation: fadeInCyber 0.5s ease forwards;
                }
                .cyber-no-results i {
                    font-size: 3.5rem;
                    color: var(--neon-cyan);
                    margin-bottom: 15px;
                    filter: drop-shadow(0 0 10px var(--neon-cyan));
                    animation: floatIcon 3s ease-in-out infinite;
                }
                .cyber-no-results h2 {
                    font-family: 'Orbitron', sans-serif;
                    font-size: 1.8rem;
                    color: #fff;
                    margin-bottom: 10px;
                    text-transform: uppercase;
                    letter-spacing: 2px;
                    text-shadow: 0 0 10px var(--neon-purple);
                }
                .cyber-no-results p {
                    color: #aaa;
                    font-size: 1rem;
                    margin-bottom: 25px;
                    max-width: 500px;
                    line-height: 1.5;
                }
                .btn-cyber-reset {
                    background: transparent;
                    border: 2px solid var(--neon-pink);
                    color: #fff;
                    font-family: 'Orbitron', sans-serif;
                    padding: 12px 30px;
                    font-size: 1rem;
                    border-radius: 8px;
                    cursor: pointer;
                    transition: all 0.3s ease;
                    box-shadow: 0 0 15px rgba(255, 0, 85, 0.3);
                }
                .btn-cyber-reset:hover {
                    background: var(--neon-pink);
                    box-shadow: 0 0 25px var(--neon-pink);
                    color: #fff;
                    transform: scale(1.05);
                }
                @keyframes fadeInCyber {
                    from { opacity: 0; transform: translateY(20px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                @keyframes floatIcon {
                    0%, 100% { transform: translateY(0); }
                    50% { transform: translateY(-10px); }
                }
            `;
            document.head.appendChild(style);
        }

        grid.innerHTML = `
        <div class="cyber-no-results">
            <i class="fas fa-satellite-dish"></i>
            <h2>Señal Perdida</h2>
            <p>No se encontraron registros en la base de datos que coincidan con tu búsqueda.<br>Verifica el nombre o intenta limpiando los filtros.</p>
            <button class="btn-cyber-reset" id="btn-reset">
                RESTAURAR RADARES
            </button>
        </div>
        `;
        
        const btn = document.getElementById('btn-reset');
        if (btn) btn.addEventListener('click', () => {
            document.getElementById('search').value = '';
            document.getElementById('genre-select').value = '';
            if (document.getElementById('demographic-select')) document.getElementById('demographic-select').value = '';
            document.getElementById('rating-select').value = '';
            filtro();
            document.getElementById('search').focus();
        });
        return;
    }

    grid.innerHTML = list.map(a => `
    <div class="card" onclick="location='anime-detail.html?id=${a.id}'" role="link" tabindex="0">
        <img src="${a.img}" alt="${a.title} portada" loading="lazy">
        <div class="rating-badge"><i class="fas fa-star"></i> ${a.rating}</div>
        <div class="card-content">
            <h3 class="card-title">${a.title}</h3>
            <div class="card-tags">
                ${a.demographic ? `<span class="tag demography-tag"><i class="fas fa-user-circle"></i> ${a.demographic}</span>` : ''}
                ${a.genres.slice(0,2).map(g => `<span class="tag genre-tag">${g}</span>`).join('')}
            </div>
            <div class="card-status ${a.status.toLowerCase()}">
                <div class="status-dot"></div>
                ${a.status}
            </div>
        </div>
    </div>
    `).join('');
}

/* ----------------------------
    Búsqueda y Filtros
    ---------------------------- */
function filtro() {
    const q = document.getElementById('search').value.toLowerCase();
    const g = document.getElementById('genre-select').value;
    const dEl = document.getElementById('demographic-select');
    const d = dEl ? dEl.value : '';
    const r = document.getElementById('rating-select').value;
    
    const res = animes.filter(a => {
        const mQ = a.title.toLowerCase().includes(q) || a.genres.some(gen => gen.toLowerCase().includes(q));
        const mG = g === "" || a.genres.includes(g);
        const mD = d === "" || a.demographic === d;
        let mR = true;
        if (r !== "") {
            const val = parseFloat(a.rating);
            if (r === "9") mR = val >= 9;
            else if (r === "8") mR = val >= 8 && val < 9;
            else if (r === "7") mR = val >= 7 && val < 8;
            else if (r === "0") mR = val < 7;
        }
        return mQ && mG && mD && mR;
    });
    render(res);
}

document.getElementById('search').addEventListener('input', filtro);
document.getElementById('genre-select').addEventListener('change', filtro);
if(document.getElementById('demographic-select')){
    document.getElementById('demographic-select').addEventListener('change', filtro);
}
document.getElementById('rating-select').addEventListener('change', filtro);

/* ----------------------------
    Menú Móvil
    ---------------------------- */
const menuToggle = document.querySelector('.menu-toggle');
const navLinks = document.querySelector('.nav-links');
menuToggle.addEventListener('click', () => {
    navLinks.classList.toggle('active');
    const i = menuToggle.querySelector('i');
    i.classList.toggle('fa-bars');
    i.classList.toggle('fa-times');
});

/* ----------------------------
    Animación y Loader (Background Video)
    ---------------------------- */
const loader = document.getElementById('loader');
const fgContainer = document.getElementById('fg-container');
const fgCanvas = document.getElementById('fg-canvas');
const fgVideo = document.getElementById('fg-video');
const fgCtx = fgCanvas.getContext('2d');
const bgVideo = document.getElementById('bg-video');

const videos = [
    { src: 'https://res.cloudinary.com/dbcqcai1q/video/upload/v1739818318/1_t9dksd.mp4',
      start: 5.0, duration: 2.0 },
    { src: 'https://res.cloudinary.com/dbcqcai1q/video/upload/v1739818335/2_txyrlm.mp4',
      start: 0.1, duration: 3.5 },
    { src: 'https://res.cloudinary.com/dbcqcai1q/video/upload/v1739818359/3_h1qgct.mp4',
      start: 11.5, duration: 3.0 },
    { src: 'https://res.cloudinary.com/dbcqcai1q/video/upload/v1739818355/4_tzf0h8.mp4',
      start: 2.3, duration: 3.0 },
    { src: 'https://res.cloudinary.com/dbcqcai1q/video/upload/v1739818386/5_szg9t1.mp4',
      start: 22.0, duration: 4.0 },
    { src: 'https://res.cloudinary.com/dbcqcai1q/video/upload/v1739818400/6_ntv3in.mp4',
      start: 10.0, duration: 3.0 },
    { src: 'https://res.cloudinary.com/dbcqcai1q/video/upload/v1739818417/7_f56yig.mp4',
      start: 4.0, duration: 3.0 }
];

function pickRandomVideo(excludeSrc) {
    const arr = videos.filter(v => v.src !== excludeSrc);
    if (arr.length === 0) return videos[0];
    return arr[Math.floor(Math.random() * arr.length)];
}

function playVideoClip(vInfo) {
    fgVideo.src = vInfo.src;
    fgVideo.currentTime = vInfo.start;
    fgVideo.play().then(() => {
        fgContainer.style.display = 'block';
        fgCanvas.style.display = 'block';
        fgVideo.style.display = 'block';
        requestAnimationFrame(drawFrame);
        setTimeout(() => {
            const next = pickRandomVideo(vInfo.src);
            playVideoClip(next);
        }, vInfo.duration * 1000);
    }).catch(e => {
        console.warn("Autoplay fg blocked", e);
        const next = pickRandomVideo(vInfo.src);
        setTimeout(() => playVideoClip(next), 1000);
    });
}

function drawFrame() {
    if (!fgVideo.paused && !fgVideo.ended) {
        fgCtx.drawImage(fgVideo, 0, 0, fgCanvas.width, fgCanvas.height);
    }
    requestAnimationFrame(drawFrame);
}

document.addEventListener('DOMContentLoaded', () => {
    render(animes);

    window.addEventListener('load', () => {
      bgVideo.play().catch(e => {
        console.warn('Autoplay bloqueado para bg-video', e);
        document.body.addEventListener('click', () => bgVideo.play(), { once: true });
      });
      
      const forcePlayVideo = () => {
        if(bgVideo.paused) {
           bgVideo.play().catch(e => console.warn(e));
        }
        document.body.removeEventListener('click', forcePlayVideo);
        document.body.removeEventListener('touchstart', forcePlayVideo);
      };
      document.body.addEventListener('click', forcePlayVideo);
      document.body.addEventListener('touchstart', forcePlayVideo);
      
      const isFirstVisit = !sessionStorage.getItem('archinime_loaded');
      const delay = isFirstVisit ? 1400 : 50;
      setTimeout(() => {
        loader.style.opacity = '0';
        setTimeout(() => {
          loader.style.visibility = 'hidden';
          sessionStorage.setItem('archinime_loaded', 'true');
          if (window.startNotificationSequence) window.startNotificationSequence();
        }, 400);
      }, delay);
    });

    const gridObserver = new MutationObserver(() => {
      document.querySelectorAll('.card').forEach(card => {
        if (card.dataset.tiltInit) return;
        card.dataset.tiltInit = 'true';
        card.addEventListener('mousemove', (e) => {
          const rect = card.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;
          const rotateX = ((y - rect.height/2) / rect.height/2) * -8;
          const rotateY = ((x - rect.width/2) / rect.width/2) * 8;
          card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(1.05)`;
        });
        card.addEventListener('mouseleave', () => {
          card.style.transform = 'perspective(1000px) rotateX(0) rotateY(0) scale(1)';
        });
      });
    });
    gridObserver.observe(document.getElementById('grid'), { childList: true });
    gridObserver.takeRecords();
    document.querySelectorAll('.card').forEach(card => {
        card.dataset.tiltInit = 'true';
        card.addEventListener('mousemove', (e) => {
          const rect = card.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;
          const rotateX = ((y - rect.height/2) / rect.height/2) * -8;
          const rotateY = ((x - rect.width/2) / rect.width/2) * 8;
          card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(1.05)`;
        });
        card.addEventListener('mouseleave', () => {
          card.style.transform = 'perspective(1000px) rotateX(0) rotateY(0) scale(1)';
        });
    });
});

/* ----------------------------
    Menús Selects para Móviles (Popups)
    ---------------------------- */
(function(){
    const SELECT_IDS = ['genre-select', 'demographic-select', 'rating-select'];
    let activePopup = null;
    let resizeListener = null;
    let scrollListener = null;

    function mobileQ() { return window.innerWidth <= 768; }

    function closePopup() {
        if (!activePopup) return;
        activePopup.remove();
        activePopup = null;
        if(resizeListener) { window.removeEventListener('resize', resizeListener); resizeListener = null; }
        if(scrollListener) { window.removeEventListener('scroll', scrollListener, true); scrollListener = null; }
    }

    function createPopupFor(selectEl) {
        selectEl.addEventListener('mousedown', function(e) {
            if (mobileQ()) {
                e.preventDefault();
                openPopup(selectEl);
            }
        });
        selectEl.addEventListener('touchstart', function(e) {
            if (mobileQ()) {
                e.preventDefault();
                openPopup(selectEl);
            }
        }, {passive: false});
    }

    function openPopup(selectEl) {
        if (activePopup) closePopup();
        const popup = document.createElement('div');
        popup.className = 'mobile-select-popup';
        
        let titleText = '';
        if(selectEl.id === 'genre-select') titleText = 'GÉNERO';
        else if(selectEl.id === 'demographic-select') titleText = 'DEMOGRAFÍA';
        else if(selectEl.id === 'rating-select') titleText = 'CALIFICACIÓN';
        
        const header = document.createElement('div');
        header.className = 'mobile-select-header';
        header.innerHTML = `<span>${titleText}</span><button>&times;</button>`;
        header.querySelector('button').addEventListener('click', closePopup);
        popup.appendChild(header);

        const list = document.createElement('div');
        list.className = 'mobile-select-list';
        Array.from(selectEl.options).forEach(opt => {
            const item = document.createElement('div');
            item.className = 'mobile-select-item';
            if (opt.value === selectEl.value) item.classList.add('selected');
            item.textContent = opt.text;
            item.addEventListener('click', () => {
                selectEl.value = opt.value;
                selectEl.dispatchEvent(new Event('change'));
                closePopup();
            });
            list.appendChild(item);
        });
        popup.appendChild(list);

        document.body.appendChild(popup);
        activePopup = popup;

        const rect = selectEl.getBoundingClientRect();
        popup.style.top = (rect.bottom + window.scrollY + 5) + 'px';
        popup.style.left = rect.left + 'px';
        popup.style.width = rect.width + 'px';

        const outsideListener = function(ev) {
            if (activePopup.contains(ev.target) || selectEl.contains(ev.target)) return;
            closePopup();
        };
        document.addEventListener('pointerdown', outsideListener, true);
        resizeListener = () => closePopup();
        window.addEventListener('resize', resizeListener);
        
        scrollListener = function scrollHandler(ev) {
            if (!activePopup) return;
            if (activePopup.contains(ev.target) || ev.target === selectEl) return;
            closePopup();
        };
        window.addEventListener('scroll', scrollListener, true);
    }

    function init() {
        try {
            SELECT_IDS.forEach(id => {
                const el = document.getElementById(id);
                if(el) createPopupFor(el);
            });
        } catch(e) {
            console.warn('mobileSelectPopups init error', e);
        }
    }

    window.addEventListener('resize', function(){
        if (!mobileQ()) closePopup();
    }, { passive:true });
    
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
    window._closeMobileSelectPopup = closePopup;
})();

function init(){
    fgContainer.style.display = 'none';
    fgCanvas.style.display = 'none'; fgVideo.style.display = 'none';
    const first = pickRandomVideo(null);
    if (!first) return;
    playVideoClip(first);
}

init();