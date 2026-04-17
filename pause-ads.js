// pause-ads.js - Sistema de publicidad en pausa para Archinime
// Muestra 6 banners en una cuadrícula 2x3 después de 3s de pausa, durante 10s.

(function() {
  'use strict';

  // ========== LISTA DE 6 BANNERS (proporcionados por el usuario) ==========
  const listaBannersPausa = [
    {
      id: 'banner1',
      codigo: `<script>atOptions={'key':'1904483365c7a7ab9f83e49d32b7d237','format':'iframe','height':60,'width':468,'params':{}};<\/script><script src="https://www.highperformanceformat.com/1904483365c7a7ab9f83e49d32b7d237/invoke.js"><\/script>`
    },
    {
      id: 'banner2',
      codigo: `<script>atOptions={'key':'49281ce83eb56f120e34ad617cfd6996','format':'iframe','height':300,'width':160,'params':{}};<\/script><script src="https://www.highperformanceformat.com/49281ce83eb56f120e34ad617cfd6996/invoke.js"><\/script>`
    },
    {
      id: 'banner3',
      codigo: `<script>atOptions={'key':'6ecb40404fef8f9daf755244f9c4d753','format':'iframe','height':50,'width':320,'params':{}};<\/script><script src="https://www.highperformanceformat.com/6ecb40404fef8f9daf755244f9c4d753/invoke.js"><\/script>`
    },
    {
      id: 'banner4',
      codigo: `<script>atOptions={'key':'1f072201cddab551b2b65315f6c1643e','format':'iframe','height':90,'width':728,'params':{}};<\/script><script src="https://www.highperformanceformat.com/1f072201cddab551b2b65315f6c1643e/invoke.js"><\/script>`
    },
    {
      id: 'banner5',
      codigo: `<script>atOptions={'key':'c80e9060ab41f7adc2b2ccc358ef6c65','format':'iframe','height':250,'width':300,'params':{}};<\/script><script src="https://www.highperformanceformat.com/c80e9060ab41f7adc2b2ccc358ef6c65/invoke.js"><\/script>`
    },
    {
      id: 'banner6',
      codigo: `<script>atOptions={'key':'190984de4e16fc6eded87c1cb7a9bc83','format':'iframe','height':600,'width':160,'params':{}};<\/script><script src="https://www.highperformanceformat.com/190984de4e16fc6eded87c1cb7a9bc83/invoke.js"><\/script>`
    }
  ];

  // ========== ESTADO DEL SISTEMA ==========
  let currentVideo = null;                // Elemento <video> actual
  let adContainer = null;                 // Contenedor principal del anuncio
  let adGrid = null;                      // Grid donde se inyectan los banners
  let delayTimer = null;                  // Timer de 3 segundos
  let autoHideTimer = null;               // Timer de 10 segundos
  let isAdVisible = false;                // Estado actual del banner
  let bannersLoaded = false;              // Si ya se inyectaron los scripts

  // ========== FUNCIONES AUXILIARES ==========
  
  // Crea el contenedor del anuncio si no existe
  function createAdContainer() {
    if (adContainer) return;

    const playerWrapper = document.querySelector('.player-wrapper');
    if (!playerWrapper) return;

    // Contenedor principal (absoluto, cubre todo el reproductor)
    adContainer = document.createElement('div');
    adContainer.id = 'pauseAdContainer';
    adContainer.className = 'pause-ad-container';
    adContainer.style.display = 'none';
    
    // Etiqueta "Publicidad"
    const label = document.createElement('div');
    label.className = 'pause-ad-label';
    label.innerHTML = '<i class="fas fa-ad"></i> Publicidad';
    adContainer.appendChild(label);
    
    // Grid 2x3 para los 6 banners
    adGrid = document.createElement('div');
    adGrid.className = 'pause-ad-grid';
    adContainer.appendChild(adGrid);
    
    playerWrapper.appendChild(adContainer);
  }

  // Limpia los timers activos
  function clearAllTimers() {
    if (delayTimer) {
      clearTimeout(delayTimer);
      delayTimer = null;
    }
    if (autoHideTimer) {
      clearTimeout(autoHideTimer);
      autoHideTimer = null;
    }
  }

  // Oculta el contenedor y limpia timers
  function hideAdContainer() {
    if (adContainer) {
      adContainer.style.display = 'none';
    }
    isAdVisible = false;
    clearAllTimers();
  }

  // Muestra el contenedor e inicia el timer de auto-ocultamiento (10s)
  function showAdContainer() {
    if (!adContainer) createAdContainer();
    if (!adContainer) return;
    
    // Cargar banners solo la primera vez
    if (!bannersLoaded) {
      loadBannersIntoGrid();
      bannersLoaded = true;
    }
    
    adContainer.style.display = 'flex';
    isAdVisible = true;
    
    // Programar ocultamiento automático después de 10 segundos
    autoHideTimer = setTimeout(() => {
      hideAdContainer();
    }, 10000); // 10 segundos
  }

  // Inyecta los 6 banners en el grid, ejecutando scripts correctamente
  function loadBannersIntoGrid() {
    if (!adGrid) return;
    
    adGrid.innerHTML = '';
    
    listaBannersPausa.forEach(banner => {
      const cell = document.createElement('div');
      cell.className = 'pause-ad-cell';
      
      // Insertar HTML del banner
      cell.innerHTML = banner.codigo;
      
      // Ejecutar scripts (necesario para que los anuncios funcionen)
      const scripts = cell.querySelectorAll('script');
      scripts.forEach(oldScript => {
        const newScript = document.createElement('script');
        // Copiar atributos
        if (oldScript.src) {
          newScript.src = oldScript.src;
          newScript.async = true;
        } else {
          newScript.textContent = oldScript.textContent;
        }
        // Reemplazar
        oldScript.parentNode.replaceChild(newScript, oldScript);
      });
      
      adGrid.appendChild(cell);
    });
  }

  // Reinicia el ciclo: si el video está pausado, programa el delay de 3s
  function scheduleAdIfPaused() {
    if (!currentVideo) return;
    
    // Solo si el video está pausado y no estamos ya mostrando el anuncio
    if (currentVideo.paused && !isAdVisible) {
      clearAllTimers(); // Cancelar cualquier timer previo
      
      delayTimer = setTimeout(() => {
        // Verificar nuevamente que sigue pausado (por si reanudó en el ínterin)
        if (currentVideo && currentVideo.paused) {
          showAdContainer();
        }
        delayTimer = null;
      }, 3000); // 3 segundos de retraso
    }
  }

  // ========== MANEJO DE EVENTOS DEL VIDEO ==========
  function onVideoPause() {
    scheduleAdIfPaused();
  }

  function onVideoPlay() {
    // Si el video se reanuda, ocultar anuncio inmediatamente y cancelar timers
    hideAdContainer();
  }

  function onVideoEnded() {
    // Al terminar el video, también ocultamos
    hideAdContainer();
  }

  // ========== API PÚBLICA ==========
  window.PauseAds = {
    /**
     * Inicializa el sistema de anuncios en pausa para un elemento <video>.
     * @param {HTMLVideoElement} video - El elemento de video a monitorizar.
     */
    init: function(video) {
      if (!video || video.tagName !== 'VIDEO') {
        console.warn('PauseAds: Se requiere un elemento <video>');
        return;
      }
      
      // Limpiar listeners del video anterior
      if (currentVideo) {
        currentVideo.removeEventListener('pause', onVideoPause);
        currentVideo.removeEventListener('play', onVideoPlay);
        currentVideo.removeEventListener('ended', onVideoEnded);
        hideAdContainer();
      }
      
      currentVideo = video;
      
      // Agregar nuevos listeners
      currentVideo.addEventListener('pause', onVideoPause);
      currentVideo.addEventListener('play', onVideoPlay);
      currentVideo.addEventListener('ended', onVideoEnded);
      
      // Crear el contenedor (pero oculto)
      createAdContainer();
    },
    
    /**
     * Oculta manualmente el anuncio (útil al cambiar de episodio).
     */
    hide: function() {
      hideAdContainer();
    }
  };

})();