// ============================================
// SISTEMA DE COMENTARIOS MEJORADO (NEÓN CYBERPUNK)
// ============================================

let comentariosDb = null;
let comentariosAuth = null;
let comentariosCurrentUser = null;
let comentariosUnsubscribe = null;

// Variable global para guardar el sticker que se va a enviar
window.stickerSeleccionadoParaEnviar = null;

function initComentariosSystem(db, auth) {
    comentariosDb = db;
    comentariosAuth = auth;

    auth.onAuthStateChanged(async (user) => {
        comentariosCurrentUser = user;
        updateComentariosUI();
        
        if (window.comentariosAnimeId && window.comentariosSeason && window.comentariosEpisode) {
            setupComentariosRealtimeListener();
        }
    });

    // Enviar comentario con Enter (Shift+Enter para nueva línea)
    setTimeout(() => {
        const textarea = document.getElementById('comentarioTexto');
        if (textarea) {
            textarea.addEventListener('keydown', function(e) {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault(); 
                    enviarComentarioTexto();
                }
            });
        }
    }, 1000);
}

// === FUNCIONES PARA COLORES NEÓN ALEATORIOS POR USUARIO ===
function getNeonColorByString(str) {
    const neonColors = [
        '#00fff7', // Cyan
        '#ff0055', // Rosa neón
        '#bc13fe', // Morado brillante
        '#00ff33', // Verde tóxico
        '#ffff00', // Amarillo láser
        '#ffaa00', // Naranja fuego
        '#ff00aa', // Magenta
        '#00aaff'  // Azul eléctrico
    ];
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return neonColors[Math.abs(hash) % neonColors.length];
}

function hexToRgbStr(hex) {
    let r = 0, g = 0, b = 0;
    if (hex.length === 7) {
        r = parseInt(hex.substring(1, 3), 16);
        g = parseInt(hex.substring(3, 5), 16);
        b = parseInt(hex.substring(5, 7), 16);
    }
    return `${r}, ${g}, ${b}`;
}
// ==========================================================

function setupComentariosRealtimeListener() {
    if (comentariosUnsubscribe) {
        comentariosUnsubscribe();
    }
    
    const commentsRef = comentariosDb.collection('comments')
        .where('animeId', '==', window.comentariosAnimeId)
        .where('season', '==', parseInt(window.comentariosSeason))
        .where('episode', '==', parseInt(window.comentariosEpisode))
        .orderBy('timestamp', 'desc')
        .limit(50);

    comentariosUnsubscribe = commentsRef.onSnapshot((snapshot) => {
        const container = document.getElementById('comentariosList');
        
        if (snapshot.empty) {
            container.innerHTML = `<div class="empty-comments" style="color: var(--primary-color); text-shadow: 0 0 10px var(--primary-color);"><i class="fas fa-comment-dots" style="font-size: 2rem; margin-bottom: 10px; display: block;"></i><p>Sin comentarios aún. ¡Sé el primero!</p></div>`;
            return;
        }
        
        let html = '';
      
        snapshot.forEach(doc => {
            const c = doc.data();
            let fecha = 'Justo ahora';
            
            if (c.timestamp?.toDate) {
                fecha = obtenerTiempoRelativo(c.timestamp.toDate());
            }
            
            const isOwner = comentariosCurrentUser?.uid === c.userId;
            const avatar = c.userAvatar || 'invitado.avif';
            const userName = c.userName || 'Usuario';
            
            // Generar el color Neón basado en el ID o Nombre del usuario
            const neonColor = getNeonColorByString(c.userId || userName);
            const rgbColor = hexToRgbStr(neonColor);
            
            let contenidoHtml = procesarTextoComentario(c.texto || '');
           
            // Si el comentario contiene un sticker principal (retrocompatibilidad)
            if (c.esSticker && c.stickerUrl && !contenidoHtml.includes(c.stickerUrl)) {
                contenidoHtml += `
                    <div class="comentario-sticker-container" style="margin-top: 10px;">
                        <img src="${c.stickerUrl}" class="comentario-sticker" loading="lazy">
                    </div>
                `;
            }
            
            // HTML DEL COMENTARIO (NUEVO ESTILO CYBERPUNK NEGRO/NEÓN)
            html += `
                <div class="comentario-item" style="background: #050505; border: 1px solid rgba(${rgbColor}, 0.4); box-shadow: 0 5px 15px rgba(0,0,0,0.8), inset 0 0 20px rgba(${rgbColor}, 0.05); animation: fadeIn 0.4s ease-in-out; border-radius: 12px; margin-bottom: 15px; padding: 15px; display: flex; gap: 15px;">
                    <div class="comentario-avatar">
                        <img src="${avatar}" onerror="this.src='invitado.avif'" style="width: 45px; height: 45px; border-radius: 50%; object-fit: cover; border: 2px solid ${neonColor}; box-shadow: 0 0 12px rgba(${rgbColor}, 0.8);">
                    </div>
                    <div class="comentario-content" style="flex: 1; min-width: 0;">
                        <div class="comentario-header" style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px; border-bottom: 1px dashed rgba(${rgbColor}, 0.3); padding-bottom: 8px;">
                            <span class="comentario-user" style="color: ${neonColor}; text-shadow: 0 0 10px ${neonColor}; font-weight: 800; font-family: 'Orbitron', sans-serif; letter-spacing: 1px; font-size: 1rem;">${escapeHtmlComent(userName)}</span>
                            <span class="comentario-fecha" style="color: #888; font-size: 0.75rem;">${fecha}</span>
                            ${isOwner ? `<button class="comentario-delete" onclick="deleteComentario('${doc.id}')" title="Eliminar" style="margin-left: auto; background: rgba(255,85,85,0.1); border: 1px solid #ff5555; color: #ff5555; border-radius: 6px; padding: 2px 8px; cursor: pointer; transition: 0.2s; box-shadow: 0 0 5px rgba(255,85,85,0.5);">✖</button>` : ''}
                        </div>
                        <div class="comentario-texto" style="color: #ffffff; font-size: 0.95rem; line-height: 1.6; text-shadow: 0 1px 2px #000;">${contenidoHtml}</div>
                    </div>
                </div>
            `;
        });
        
        container.innerHTML = html;
    }, (error) => {
        console.error('Error en comentarios:', error);
    });
}

function obtenerTiempoRelativo(fecha) {
    const ahora = new Date();
    const diffSegundos = Math.floor((ahora - fecha) / 1000);
    if (diffSegundos < 60) return 'Hace unos segundos';
    if (diffSegundos < 3600) return `Hace ${Math.floor(diffSegundos / 60)} min`;
    if (diffSegundos < 86400) return `Hace ${Math.floor(diffSegundos / 3600)} horas`;
    if (diffSegundos < 2592000) return `Hace ${Math.floor(diffSegundos / 86400)} días`;
    return fecha.toLocaleDateString();
}

function procesarTextoComentario(texto) {
    if (!texto) return '';
    let html = escapeHtmlComent(texto);

    const emojisMap = { ':D': '😃', ':)': '😊', ':(': '😢', ':P': '😛', ';)': '😉', '<3': '❤️' };
    for (const [code, emoji] of Object.entries(emojisMap)) {
        html = html.split(code).join(emoji);
    }
    
    // Extraer stickers y ponerles botón de robar estilizado
    const stickerRegex = /\[Sticker\]\(([^)]+)\)/g;
    html = html.replace(stickerRegex, (match, url) => `
        <div class="comentario-sticker-container" style="margin-top: 10px;">
            <img src="${url}" class="comentario-sticker" loading="lazy" style="max-width: 130px; border-radius: 10px; box-shadow: 0 4px 10px rgba(0,0,0,0.5);">
            <br>
            <button class="steal-sticker-btn" onclick="robarStickerSistema('${url.replace(/'/g, "\\'")}')" style="background: rgba(0, 255, 247, 0.1); border: 1px solid #00fff7; color: #00fff7; padding: 4px 12px; border-radius: 20px; font-size: 0.75rem; cursor: pointer; margin-top: 5px; box-shadow: 0 0 10px rgba(0, 255, 247, 0.2); transition: 0.3s; font-weight: 600;"><i class="fas fa-download"></i> Robar sticker</button>
        </div>
    `);

    const palabras = html.split(/(\s+)/);
    for (let i = 0; i < palabras.length; i++) {
        let palabra = palabras[i];
        if (palabra.startsWith('http://') || palabra.startsWith('https://')) {
            if (palabra.match(/\.(jpg|jpeg|png|gif|webp|avif)(\?.*)?$/i) && !palabra.includes('class="comentario-sticker"')) {
                palabras[i] = `<img src="${palabra}" class="comentario-imagen" loading="lazy" style="max-width: 200px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.2); margin-top: 5px;">`;
            } 
            else if (!palabra.includes('class="comentario-sticker"')) {
                palabras[i] = `<a href="${palabra}" target="_blank" rel="noopener noreferrer" class="comentario-link" style="color: #00fff7; text-shadow: 0 0 5px rgba(0,255,247,0.5);">${palabra}</a>`;
            }
        }
    }
    html = palabras.join('');
    return html.replace(/\n/g, '<br>');
}

async function enviarComentarioTexto() {
    if (!comentariosCurrentUser) {
        openLoginModalFromComent();
        return;
    }
    
    const texto = document.getElementById('comentarioTexto').value.trim();
    const stickerUrl = window.stickerSeleccionadoParaEnviar;

    if (!texto && !stickerUrl) {
        showToastComent('⚠️ No puedes enviar un comentario vacío');
        return;
    }
    
    const btn = document.getElementById('enviarComentarioBtn');
    btn.disabled = true;
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';
    
    let textoFinal = texto;
    if (stickerUrl) {
        // Agrega el sticker al final del texto
        textoFinal += (textoFinal ? '\n' : '') + `[Sticker](${stickerUrl})`;
    }
    
    try {
        await comentariosDb.collection('comments').add({
            animeId: window.comentariosAnimeId,
            season: parseInt(window.comentariosSeason),
            episode: parseInt(window.comentariosEpisode),
            userId: comentariosCurrentUser.uid,
            userName: comentariosCurrentUser.displayName || comentariosCurrentUser.email.split('@')[0],
            userAvatar: comentariosCurrentUser.photoURL || 'invitado.avif',
            texto: textoFinal,
            esSticker: !!stickerUrl,
            stickerUrl: stickerUrl || null,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Limpiar todo después de enviar
        document.getElementById('comentarioTexto').value = '';
        quitarStickerPreview();
        showToastComent('✅ Comentario enviado');
    } catch (error) {
        alert('Error: ' + error.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

// Manda el sticker al preview en vez de enviarlo directo
window.seleccionarStickerParaEnviar = function(url) {
    window.stickerSeleccionadoParaEnviar = url;
    const previewContainer = document.getElementById('comentarioStickerPreview');
    const previewImg = document.getElementById('previewStickerImgObj');
    
    previewImg.src = url;
    previewContainer.style.display = 'inline-block';

    // Cierra el panel de stickers para que veas el input
    const panel = document.getElementById('stickerPanelFull');
    if (panel) panel.classList.remove('active');
};

window.quitarStickerPreview = function() {
    window.stickerSeleccionadoParaEnviar = null;
    document.getElementById('comentarioStickerPreview').style.display = 'none';
    document.getElementById('previewStickerImgObj').src = '';
};

async function deleteComentario(commentId) {
    if (!confirm('¿Seguro que deseas eliminar este comentario?')) return;
    try {
        await comentariosDb.collection('comments').doc(commentId).delete();
        showToastComent('🗑️ Comentario eliminado');
    } catch (error) {
        alert('Error al eliminar: ' + error.message);
    }
}

function updateComentariosUI() {
    const loginMsg = document.getElementById('comentarioLoginMessage');
    const formContainer = document.getElementById('comentarioFormContainer');

    if (!comentariosCurrentUser) {
        if (loginMsg) loginMsg.style.display = 'block';
        if (formContainer) formContainer.style.display = 'none';
    } else {
        if (loginMsg) loginMsg.style.display = 'none';
        if (formContainer) formContainer.style.display = 'block';

        const avatar = document.getElementById('comentarioUserAvatar');
        if (avatar) avatar.src = comentariosCurrentUser.photoURL || 'invitado.avif';
        const name = document.getElementById('comentarioUserName');
        if (name) name.innerText = comentariosCurrentUser.displayName || comentariosCurrentUser.email.split('@')[0];
    }
}

function toggleEmojiPanelSistema() {
    const panel = document.getElementById('emojiPanel');
    if (panel) {
        panel.classList.toggle('active');
        const stickerPanel = document.getElementById('stickerPanelFull');
        if (stickerPanel) stickerPanel.classList.remove('active');
    }
}

function toggleStickerPanelSistema() {
    const panel = document.getElementById('stickerPanelFull');
    if (panel) {
        panel.classList.toggle('active');
        const emojiPanel = document.getElementById('emojiPanel');
        if (emojiPanel) emojiPanel.classList.remove('active');
    }
}

function agregarEmojiAlTexto(emoji) {
    const textarea = document.getElementById('comentarioTexto');
    if (textarea) {
        const start = textarea.selectionStart;
        const text = textarea.value;
        textarea.value = text.substring(0, start) + emoji + text.substring(start);
        textarea.focus();
    }
}

function showToastComent(msg) {
    let toast = document.getElementById('toastComent');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toastComent';
        toast.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#0f0f13;color:#00fff7;padding:12px 25px;border-radius:30px;z-index:1000;font-weight:bold;box-shadow:0 0 20px rgba(0,255,247,0.5); border: 1px solid #00fff7; transition: all 0.3s;';
        document.body.appendChild(toast);
    }
    toast.innerHTML = msg;
    toast.style.display = 'block';
    setTimeout(() => toast.style.display = 'none', 2500);
}

function openLoginModalFromComent() {
    const modal = document.getElementById('authModal');
    if (modal) modal.classList.add('show');
}

function escapeHtmlComent(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}