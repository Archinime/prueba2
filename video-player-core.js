// video-player-core.js - Versión con catálogo local + Firestore
// ... (todas las cabeceras anteriores)
// MODIFICADO: En modo standalone, el botón "Abrir" ahora usa un intent:// en Android
//            para abrir el enlace en Chrome (navegador externo), y en iOS usa window.open.
//            Esto simula el comportamiento de los enlaces de YouTube que abren la app externa.

class VideoPlayer {
  constructor() {
    // ... (todo igual que antes hasta la sección createPixelDrainUI)
  }

  // ... (todos los métodos se mantienen iguales, solo modifico createPixelDrainUI)

  createPixelDrainUI(url) {
    // ... (todo igual hasta el forEach)

    domainUrls.forEach((proxyUrl, index) => {
      // ... (todo igual, solo modifico el evento openBtn)

      // ============================================================
      // BOTÓN "ABRIR" - Ahora abre en navegador externo (como YouTube)
      // ============================================================
      openBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const proxy = proxyUrl;
        if (!proxy) return;
        this.lastOpenedProxyUrl = proxy;

        // Detectar si estamos en modo standalone (PWA instalada)
        const isStandalone = this.isStandalone();

        // Detectar si es Android (para usar intent://)
        const isAndroid = /android/i.test(navigator.userAgent);
        // Detectar si es iOS (para usar window.open normal)
        const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);

        // Si está en standalone y es Android, usar intent:// para abrir en Chrome
        if (isStandalone && isAndroid) {
          try {
            // Crear un intent:// que abra la URL en Chrome
            // Formato: intent://URL#Intent;package=com.android.chrome;end;
            const intentUrl = `intent://${proxy.replace(/^https?:\/\//, '')}#Intent;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(proxy)};end;`;
            // También podemos intentar con scheme=android-app://
            // Pero intent:// es más fiable para abrir Chrome.
            // También podemos usar el esquema de navegador predeterminado.
            // Otra opción: window.open con target="_system" (no soportado en todos).
            // Probar primero con window.open normal, si falla, usar intent.
            const win = window.open(intentUrl, '_system');
            if (win) {
              win.focus();
              this.mostrarToast('🔗 Abriendo en Chrome...');
              return;
            }
          } catch (err) {
            console.warn('Error con intent://, usando fallback:', err);
          }
          // Fallback: window.open normal
          const win = window.open(proxy, '_blank');
          if (win) {
            win.focus();
            this.mostrarToast('🔗 Abriendo en navegador...');
            return;
          }
          // Si nada funciona, copiar enlace
          navigator.clipboard.writeText(proxy)
            .then(() => {
              alert('📋 Enlace copiado al portapapeles. Abre Chrome y pégalo.');
            })
            .catch(() => {
              const range = document.createRange();
              const tempDiv = document.createElement('div');
              tempDiv.textContent = proxy;
              tempDiv.style.position = 'fixed';
              tempDiv.style.opacity = '0';
              document.body.appendChild(tempDiv);
              range.selectNode(tempDiv);
              window.getSelection().removeAllRanges();
              window.getSelection().addRange(range);
              document.execCommand('copy');
              document.body.removeChild(tempDiv);
              alert('📋 Enlace copiado (método manual). Abre Chrome y pégalo.');
            });
          return;
        }

        // Si es standalone y iOS, usar window.open normal (abre Safari)
        if (isStandalone && isIOS) {
          try {
            const win = window.open(proxy, '_blank');
            if (win) {
              win.focus();
              this.mostrarToast('🔗 Abriendo en Safari...');
              return;
            }
          } catch (err) {
            console.warn('Error al abrir en iOS:', err);
          }
          // Fallback: copiar enlace
          navigator.clipboard.writeText(proxy)
            .then(() => {
              alert('📋 Enlace copiado al portapapeles. Abre Safari y pégalo.');
            })
            .catch(() => {
              const range = document.createRange();
              const tempDiv = document.createElement('div');
              tempDiv.textContent = proxy;
              tempDiv.style.position = 'fixed';
              tempDiv.style.opacity = '0';
              document.body.appendChild(tempDiv);
              range.selectNode(tempDiv);
              window.getSelection().removeAllRanges();
              window.getSelection().addRange(range);
              document.execCommand('copy');
              document.body.removeChild(tempDiv);
              alert('📋 Enlace copiado (método manual). Abre Safari y pégalo.');
            });
          return;
        }

        // === Comportamiento normal (navegador web, no standalone) ===
        this.blankTabOpened = true;
        try {
          const win = window.open('about:blank', '_blank');
          if (!win) {
            alert('⚠️ No se pudo abrir la pestaña en blanco.');
            this.blankTabOpened = false;
            return;
          }
          win.document.write(`
            <!DOCTYPE html>
            <html lang="es">
            <head>
              <meta charset="UTF-8" />
              <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
              <title>Pestaña en blanco - Proxy</title>
              <style>
                * { margin:0; padding:0; box-sizing:border-box; }
                body { background: #0b0b0b; font-family: system-ui, sans-serif; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 1.5rem; margin: 0; }
                .container { background: rgba(255,255,255,0.05); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); border-radius: 50px; padding: 2.5rem 2rem; max-width: 600px; width: 100%; border: 1px solid rgba(255,255,255,0.08); box-shadow: 0 30px 60px rgba(0,0,0,0.8); text-align: center; }
                h1 { font-size: 2.2rem; font-weight: 600; background: linear-gradient(135deg, #f7971e, #ffd200); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; margin-bottom: 0.5rem; }
                .sub { color: #ccc; font-size: 1.3rem; margin-bottom: 0.5rem; }
                .sub .arrow { display: inline-block; font-size: 2.5rem; margin-left: 4px; color: #ffd200; animation: bounceUp 1.5s infinite ease-in-out; line-height: 1; }
                @keyframes bounceUp { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
                .image-container { margin: 1.2rem auto; border-radius: 16px; overflow: hidden; border: 1px solid rgba(255,255,255,0.1); max-width: 70%; display: flex; justify-content: center; }
                .image-container img { width: 100%; height: auto; display: block; }
                .hint { color: #aaa; font-size: 1.2rem; line-height: 1.7; margin: 1rem 0; }
                .hint strong { color: #ffd200; }
                .btn-close { display: inline-block; margin-top: 1.2rem; padding: 0.9rem 2.5rem; background: rgba(255,255,255,0.08); color: #ddd; border: 1px solid rgba(255,255,255,0.1); border-radius: 60px; font-size: 1.2rem; font-weight: 600; cursor: pointer; transition: 0.2s; text-decoration: none; }
                .btn-close:hover { background: rgba(255,255,255,0.15); }
                .btn-close:active { transform: scale(0.96); }
                @media (max-width: 480px) {
                  body { padding: 1rem; }
                  .container { padding: 2rem 1.2rem; border-radius: 40px; }
                  h1 { font-size: 1.8rem; }
                  .sub { font-size: 1.1rem; }
                  .sub .arrow { font-size: 2rem; }
                  .image-container { max-width: 90%; }
                  .hint { font-size: 1rem; }
                  .btn-close { font-size: 1rem; padding: 0.8rem 2rem; }
                }
              </style>
            </head>
            <body>
              <div class="container">
                <h1>📋 Pestaña en blanco</h1>
                <p class="sub">Pega el enlace en la barra de direcciones (arriba) <span class="arrow">↑</span></p>
                <div class="image-container">
                  <img src="https://cdn.jsdelivr.net/gh/Archinime/Archivos-data@main/about.blank.avif" alt="Ejemplo de dónde pegar el enlace" />
                </div>
                <p class="hint">💡 Copia el enlace de la otra pestaña, <strong>pégalo en la barra de direcciones</strong> y presiona Enter.</p>
                <button class="btn-close" onclick="window.close()">✖ Cerrar esta pestaña</button>
              </div>
            </body>
            </html>
          `);
          win.document.close();
          win.focus();
        } catch (err) {
          alert('❌ Error al abrir la pestaña: ' + err.message);
          this.blankTabOpened = false;
        }
      });

      // ... (resto del código igual)
    });

    // ... (resto del método)
  }

  // ... (el resto de la clase se mantiene igual)
}

// ... (inicialización)