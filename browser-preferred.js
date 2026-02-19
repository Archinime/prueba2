/* browser-preferred.js
   Purpose: intentar abrir Chrome (Chromium family) cuando sea apropiado,
   y ofrecer una UX clara para Safari/iOS. No borra nada y es seguro.
   Autor: generado para Archinime
*/

(function () {
  'use strict';

  // Configuración
  const PREFERRED = {
    name: 'chromium',
    displayName: 'Chrome / Chromium',
    androidPackage: 'com.android.chrome', // paquete intent para Chrome
  };

  // IDs únicos para no colisionar
  const MODAL_ID = 'archinime-browser-modal-v1';

  // --- Detección simple ---
  function ua() { return navigator.userAgent || navigator.vendor || window.opera || ''; }
  function isIos() { return /iphone|ipad|ipod/i.test(ua()); }
  function isAndroid() { return /android/i.test(ua()); }
  function isChromiumBased() {
    // detect Chrome / Chromium / Edge (Chromium) / Brave (Chromium)
    // On iOS all browsers are WebKit — treat separately
    if (isIos()) return false;
    return /Chrome\/|Chromium\/|Edg\/|OPR\/|Brave\//i.test(ua());
  }
  function isSafari() {
    // Safari on macOS or iOS (but on iOS other browsers still report WebKit)
    const u = ua();
    const isSafariUA = /Safari\//i.test(u) && !/Chrome\/|Chromium\/|Edg\/|OPR\/|Brave\//i.test(u);
    return isSafariUA;
  }
  function isStandalone() {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
           (window.navigator.standalone === true);
  }

  // --- Utilidades para abrir navegador preferido ---
  function openChromeIntent(href) {
    // Android intent: works when Chrome installed. If not installed, Android may offer Play Store.
    try {
      // Build an intent URL that targets Chrome package
      // intent://<host><path>#Intent;scheme=https;package=com.android.chrome;end
      const noProto = href.replace(/^https?:\/\//i, '');
      const intentUrl = 'intent://' + noProto + '#Intent;scheme=https;package=' + encodeURIComponent(PREFERRED.androidPackage) + ';end';
      window.location.href = intentUrl;
      // give it a short moment; if it fails user stays on page and sees the modal fallback
    } catch (e) {
      console.warn('openChromeIntent error', e);
    }
  }

  function openChromeSchemeDesktop(href) {
    // Try googlechrome:// for desktop (may be blocked in some browsers)
    try {
      const noProto = href.replace(/^https?:\/\//i, '');
      window.location.href = 'googlechrome://' + noProto;
    } catch (e) {
      console.warn('openChromeSchemeDesktop error', e);
    }
  }

  // --- Modal/banner UI (non-intrusive) ---
  function createModal() {
    if (document.getElementById(MODAL_ID)) return; // ya existe

    const modal = document.createElement('div');
    modal.id = MODAL_ID;
    modal.innerHTML = `
      <style>
        #${MODAL_ID} { position: fixed; left: 12px; right: 12px; bottom: 18px; z-index: 20000;
          display: flex; justify-content: center; pointer-events: auto; }
        #${MODAL_ID} .card { width: 100%; max-width: 820px; background: rgba(10,10,12,0.95);
          color: #fff; border-radius: 12px; box-shadow: 0 8px 30px rgba(0,0,0,0.6);
          border: 1px solid rgba(255,255,255,0.04); padding: 12px 14px; display:flex; gap:12px; align-items:center;
          font-family: 'Poppins', sans-serif; }
        #${MODAL_ID} .left { flex: 1; min-width: 0; }
        #${MODAL_ID} .title { font-weight:700; margin-bottom:6px; font-size:14px; color:#00f3ff; }
        #${MODAL_ID} .desc { font-size:13px; color:#d7d7d7; line-height:1.2; margin-bottom:6px; }
        #${MODAL_ID} .actions { display:flex; gap:8px; flex-wrap:wrap; }
        #${MODAL_ID} .btn { background: rgba(255,255,255,0.06); color:#fff; padding:8px 12px; border-radius:8px; border:1px solid rgba(255,255,255,0.06); cursor:pointer; font-weight:700; font-size:13px; }
        #${MODAL_ID} .btn.primary { background: linear-gradient(90deg,#00f3ff,#0066ff); color:#000; border:none; }
        #${MODAL_ID} .btn.ghost { background: transparent; border:1px solid rgba(255,255,255,0.08); color:#ccc; }
        #${MODAL_ID} .close { margin-left: auto; background: transparent; border: none; color: #bbb; font-weight:700; cursor:pointer; }
        @media (max-width:600px) {
          #${MODAL_ID} { left: 8px; right: 8px; bottom: 12px; }
          #${MODAL_ID} .card { padding:10px; gap:8px; }
        }
      </style>
      <div class="card" role="dialog" aria-labelledby="${MODAL_ID}-title">
        <div class="left">
          <div id="${MODAL_ID}-title" class="title">Mejor experiencia: ${PREFERRED.displayName}</div>
          <div class="desc" id="${MODAL_ID}-desc">Para la mejor experiencia en móviles/TV (PWA, vídeo y anuncios user-initiated) recomendamos abrir este sitio en ${PREFERRED.displayName} o Safari en iPhone. ¿Quieres abrirlo ahora?</div>
          <div class="actions" id="${MODAL_ID}-actions"></div>
        </div>
        <button class="close" id="${MODAL_ID}-close" aria-label="Cerrar">✕</button>
      </div>
    `;
    document.body.appendChild(modal);

    // Buttons container
    const actions = document.getElementById(`${MODAL_ID}-actions`);
    const closeBtn = document.getElementById(`${MODAL_ID}-close`);
    closeBtn.addEventListener('click', () => { modal.style.display = 'none'; });

    // Buttons added dynamically por device detection (see showModalForDevice)
    return modal;
  }

  function showModalForDevice(info) {
    const modal = document.getElementById(MODAL_ID) || createModal();
    modal.style.display = 'flex';
    const actions = document.getElementById(`${MODAL_ID}-actions`);
    actions.innerHTML = '';

    // Helper to create buttons
    function addBtn(text, cls, cb) {
      const b = document.createElement('button');
      b.className = 'btn ' + (cls || '');
      b.innerText = text;
      b.addEventListener('click', cb);
      actions.appendChild(b);
      return b;
    }

    const href = window.location.href;

    if (info.isAndroid && !info.isChromium) {
      addBtn('Abrir en Chrome (Android)', 'primary', () => {
        // user gesture -> attempt to open Chrome via intent
        openChromeIntent(href);
        // hide modal after attempt
        modal.style.display = 'none';
      });
      addBtn('Continuar aquí', 'ghost', () => { modal.style.display = 'none'; });
    } else if (!info.isIos && !info.isChromium) {
      // Desktop non-chromium (Firefox, Safari on mac) - try googlechrome://
      addBtn('Abrir en Chrome (si está instalado)', 'primary', () => {
        openChromeSchemeDesktop(href);
        modal.style.display = 'none';
      });
      addBtn('Continuar aquí', 'ghost', () => { modal.style.display = 'none'; });
    } else if (info.isIos && !info.isSafari) {
      // iOS: other browsers (Chrome on iOS are webkit-based) - we cannot force open Safari
      addBtn('Instrucciones para abrir en Safari', 'primary', () => {
        showIosInstructions();
      });
      addBtn('Continuar aquí', 'ghost', () => { modal.style.display = 'none'; });
    } else {
      // Already on preferred browser (Chromium or Safari) -> no modal
      modal.style.display = 'none';
    }
  }

  function showIosInstructions() {
    // Small modal / alert with steps (cannot auto-open Safari)
    const steps = [
      'Toca el botón de compartir (ícono ⤴︎) en la parte inferior / superior del navegador.',
      'Selecciona "Abrir en Safari" o "Abrir en..." y elige Safari.',
      'O copia la URL y pégala en Safari.'
    ];
    // Use simple alert / or nicer modal if you prefer
    alert('Cómo abrir en Safari:\\n\\n' + steps.map((s,i)=> (i+1)+'. '+s).join('\\n'));
  }

  // --- Main logic: when to show/attempt ---
  function runAutoPrefer() {
    // No action if standalone (PWA) — user already has app-like experience
    if (isStandalone()) return;

    const info = {
      isIos: isIos(),
      isAndroid: isAndroid(),
      isChromium: isChromiumBased(),
      isSafari: isSafari()
    };

    // If already Chromium-based or Safari (on mac/iOS), nothing to do
    if (info.isChromium || info.isSafari) return; // best case: leave as is

    // Create modal and show tailored options
    createModal();
    // Wait a fraction so page load isn't interrupted (non-intrusive)
    setTimeout(() => showModalForDevice(info), 900);
  }

  // Run on DOMContentLoaded to ensure it doesn't clobber your existing scripts.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runAutoPrefer);
  } else {
    runAutoPrefer();
  }

  // Expose a safe global to manually trigger if needed
  window.ArchinimeBrowserPrefer = {
    show: function(){ runAutoPrefer(); },
    isChromiumBased: isChromiumBased,
    isSafari: isSafari,
    isIos: isIos,
    isAndroid: isAndroid
  };

})();
