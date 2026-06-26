// banner-carousel.js
// Carrusel de banners con almacenamiento local y actualización en caliente

(function() {
  const STORAGE_KEY = 'archinime_banners';
  const DEFAULT_BANNERS = [
    { 
      title: "", 
      desc: "", 
      media: "https://files.catbox.moe/axewct.mp4", 
      link: "https://archinime.github.io/-Archinime-/anime-detail.html?id=2" 
    },
    { 
      title: "Demon Slayer", 
      desc: "", 
      media: "https://files.catbox.moe/eqefiz.mp4", 
      link: "https://archinime.github.io/-Archinime-/anime-detail.html?id=10" 
    },
    { 
      title: "Solo Leveling", 
      desc: "⭐ 5 · Acción, Sobrenatural", 
      media: "https://files.catbox.moe/bt5abl.mp4", 
      link: "https://archinime.github.io/-Archinime-/anime-detail.html?id=67" 
    }
  ];

  function getBanners() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed && parsed.length) return parsed;
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

    banners.forEach((b, i) => {
      const slide = document.createElement('div');
      slide.className = `banner-slide ${i === 0 ? 'active' : ''}`;
      const isVideo = b.media && (b.media.endsWith('.mp4') || b.media.endsWith('.webm') || b.media.includes('youtube.com') || b.media.includes('youtu.be'));
      if (isVideo) {
        slide.style.background = '#000';
        const videoEl = document.createElement('video');
        videoEl.src = b.media;
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
        overlay.style.background = 'rgba(0,0,0,0.4)';
        overlay.style.zIndex = '1';
        slide.appendChild(overlay);
      } else {
        slide.style.backgroundImage = `url(${b.media})`;
        slide.style.backgroundSize = 'cover';
        slide.style.backgroundPosition = 'center';
      }
      const info = document.createElement('div');
      info.className = 'banner-info';
      info.style.position = 'relative';
      info.style.zIndex = '2';
      info.innerHTML = `
        <h2>${b.title}</h2>
        <p>${b.desc || ''}</p>
      `;
      slide.appendChild(info);

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
    goTo((currentBanner + 1) % total);
  }

  function resetInterval() {
    if (intervalId) clearInterval(intervalId);
    intervalId = setInterval(nextBanner, 5000);
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
})();