// banner-carousel.js
// Carrusel de banners con soporte para PC (mediaDesktop) y móvil (mediaMobile)
// Título y descripción opcionales

(function() {
  const STORAGE_KEY = 'archinime_banners';

  // Banners por defecto con la nueva estructura
  const DEFAULT_BANNERS = [
  {
    "title": "",
    "desc": "",
    "mediaDesktop": "https://files.catbox.moe/9snow9.mp4",
    "mediaMobile": "https://files.catbox.moe/9snow9.mp4",
    "link": "https://archinime.github.io/-Archinime-/anime-detail.html?id=2"
  },
  {
    "title": "Demon Slayer",
    "desc": "",
    "mediaDesktop": "https://files.catbox.moe/eqefiz.mp4",
    "mediaMobile": "https://files.catbox.moe/eqefiz.mp4",
    "link": "https://archinime.github.io/-Archinime-/anime-detail.html?id=10"
  },
  {
    "title": "Re:Zero",
    "desc": "⭐ 5 · Acción, Sobrenatural",
    "mediaDesktop": "https://files.catbox.moe/48rh4u.mp4",
    "mediaMobile": "https://files.catbox.moe/48rh4u.mp4",
    "link": "https://archinime.github.io/-Archinime-/anime-detail.html?id=4"
  }
];

  function isMobile() {
    return window.matchMedia('(max-width: 768px)').matches;
  }

  function getBanners() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed && parsed.length) {
          // Convertir banners antiguos (con propiedad 'media') al nuevo formato
          return parsed.map(b => {
            if (b.media && !b.mediaDesktop) {
              return {
                title: b.title || '',
                desc: b.desc || '',
                mediaDesktop: b.media,
                mediaMobile: b.media,
                link: b.link || '#'
              };
            }
            return b;
          });
        }
      } catch (e) {}
    }
    return DEFAULT_BANNERS;
  }

  const banners = getBanners();
  const carousel = document.getElementById('bannerCarousel');
  const dotsContainer = document.getElementById('bannerDots');
  let currentBanner = 0;
  let intervalId = null;

  function renderBanners() {
    carousel.querySelectorAll('.banner-slide').forEach(el => el.remove());
    dotsContainer.innerHTML = '';

    const isMobileDevice = isMobile();

    banners.forEach((b, i) => {
      // Elegir el medio según dispositivo
      const mediaUrl = isMobileDevice ? (b.mediaMobile || b.mediaDesktop) : b.mediaDesktop;
      if (!mediaUrl) return; // Si no hay medio, saltar

      const slide = document.createElement('div');
      slide.className = `banner-slide ${i === 0 ? 'active' : ''}`;

      // Determinar si es video (por extensión o presencia de youtube)
      const isVideo = mediaUrl && (mediaUrl.endsWith('.mp4') || mediaUrl.endsWith('.webm') || mediaUrl.includes('youtube.com') || mediaUrl.includes('youtu.be'));

      if (isVideo && !isMobileDevice) {
        // Solo reproducir video en PC
        slide.style.background = '#000';
        const videoEl = document.createElement('video');
        videoEl.src = mediaUrl;
        videoEl.autoplay = true;
        videoEl.muted = true;
        videoEl.loop = true;
        videoEl.playsInline = true;
        videoEl.style.position = 'absolute';
        videoEl.style.inset = '0';
        videoEl.style.width = '100%';
        videoEl.style.height = '100%';
        videoEl.style.objectFit = 'cover';
        videoEl.style.zIndex = '0';
        slide.appendChild(videoEl);
        const overlay = document.createElement('div');
        overlay.style.position = 'absolute';
        overlay.style.inset = '0';
        overlay.style.background = 'rgba(0,0,0,0.3)';
        overlay.style.zIndex = '1';
        slide.appendChild(overlay);
      } else {
        slide.style.backgroundImage = `url(${mediaUrl})`;
        slide.style.backgroundSize = 'cover';
        slide.style.backgroundPosition = 'center';
      }

      const hasTitle = b.title && b.title.trim() !== '';
      const hasDesc = b.desc && b.desc.trim() !== '';

      if (hasTitle || hasDesc) {
        const info = document.createElement('div');
        info.className = 'banner-info';
        info.style.position = 'relative';
        info.style.zIndex = '2';
        let html = '';
        if (hasTitle) html += `<h2>${b.title}</h2>`;
        if (hasDesc) html += `<p>${b.desc}</p>`;
        info.innerHTML = html;
        slide.appendChild(info);
      }

      if (b.link && b.link !== '#') {
        slide.style.cursor = 'pointer';
        slide.addEventListener('click', () => {
          window.open(b.link, '_blank');
        });
      }

      carousel.appendChild(slide);

      const dot = document.createElement('button');
      dot.className = `banner-dot ${i === 0 ? 'active' : ''}`;
      dot.addEventListener('click', () => goTo(i));
      dotsContainer.appendChild(dot);
    });
  }

  function goTo(index) {
    const slides = carousel.querySelectorAll('.banner-slide');
    const dots = dotsContainer.querySelectorAll('.banner-dot');
    slides.forEach((s, i) => s.classList.toggle('active', i === index));
    dots.forEach((d, i) => d.classList.toggle('active', i === index));
    currentBanner = index;
    resetInterval();
  }

  function nextBanner() {
    const total = banners.length;
    if (total === 0) return;
    goTo((currentBanner + 1) % total);
  }

  function resetInterval() {
    if (intervalId) clearInterval(intervalId);
    if (banners.length > 1) {
      intervalId = setInterval(nextBanner, 5000);
    }
  }

  renderBanners();
  resetInterval();

  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) {
      const newBanners = getBanners();
      if (JSON.stringify(newBanners) !== JSON.stringify(banners)) {
        banners.length = 0;
        banners.push(...newBanners);
        renderBanners();
        resetInterval();
      }
    }
  });

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const newIsMobile = isMobile();
      if (window._lastIsMobile === undefined) {
        window._lastIsMobile = newIsMobile;
      } else if (window._lastIsMobile !== newIsMobile) {
        window._lastIsMobile = newIsMobile;
        renderBanners();
        resetInterval();
      }
    }, 300);
  });
})();