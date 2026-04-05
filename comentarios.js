// ============================================
// SISTEMA DE COMENTARIOS MEJORADO
// ============================================

let comentariosDb = null;
let comentariosAuth = null;
let comentariosCurrentUser = null;
let comentariosUnsubscribe = null;

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

    // Añadir listener para enviar comentario con Enter (Shift+Enter para nueva línea)
    setTimeout(() => {
        const textarea = document.getElementById('comentarioTexto');
        if (textarea) {
            textarea.addEventListener('keydown', function(e) {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault(); // Evita el salto de línea
                    enviarComentarioTexto();
                }
            });
        }
    }, 1000);
}

function setupComentariosRealtimeListener() {
    if (comentariosUnsubscribe) {
        comentariosUnsubscribe();
    }
    
    // MEJORA: Se agrega limit(50) para no saturar las lecturas en la base de datos
    const commentsRef = comentariosDb.collection('comments')
        .where('animeId', '==', window.comentariosAnimeId)
        .where('season', '==', parseInt(window.comentariosSeason))
        .where('episode', '==', parseInt(window.comentariosEpisode))
        .orderBy('timestamp', 'desc')
        .limit(50); 
        
    comentariosUnsubscribe = commentsRef.onSnapshot((snapshot) => {
        const container = document.getElementById('comentariosList');
        
        if (snapshot.empty) {
            container.innerHTML = `<div class="empty-comments"><i class="fas fa-comment-dots"></i><p>Sin comentarios aún. ¡Sé el primero!</p></div>`;
            return;
        }
        
        let html = '';
      
        snapshot.forEach(doc => {
            const c = doc.data();
            let fecha = 'Justo ahora';
            
            // MEJORA: Formato de tiempo relativo
            if (c.timestamp?.toDate) {
                fecha = obtenerTiempoRelativo(c.timestamp.toDate());
            }
            
            const isOwner = comentariosCurrentUser?.uid === c.userId;
            const avatar = c.userAvatar || 'invitado.avif';
            const userName = c.userName || 'Usuario';
            
            let contenidoHtml = '';
            if (c.esSticker && c.stickerUrl) {
                contenidoHtml = `
                    <div class="comentario-sticker-container">
                        <img src="${c.stickerUrl}" class="comentario-sticker" loading="lazy" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22%3E%3Crect width=%22100%22 height=%22100%22 fill=%22%23333%22/%3E%3Ctext x=%2250%22 y=%2250%22 text-anchor=%22middle%22 dy=%22.3em%22 fill=%22%23fff%22%3E?%3C/text%3E%3C/svg%3E'">
                        <button class="steal-sticker-btn" onclick="robarStickerSistema('${c.stickerUrl.replace(/'/g, "\\'")}')">🔽 Robar sticker</button>
                    </div>
                `;
            } else {
                contenidoHtml = procesarTextoComentario(c.texto || '');
            }
            
            html += `
                <div class="comentario-item" style="animation: fadeIn 0.3s ease-in-out;">
                    <div class="comentario-avatar"><img src="${avatar}" onerror="this.src='invitado.avif'"></div>
                    <div class="comentario-content" style="flex: 1; min-width: 0;">
                        <div class="comentario-header">
                            <span class="comentario-user">${escapeHtmlComent(userName)}</span>
                            <span class="comentario-fecha">${fecha}</span>
                            ${isOwner ? `<button class="comentario-delete" onclick="deleteComentario('${doc.id}')" title="Eliminar comentario">✖</button>` : ''}
                        </div>
                        <div class="comentario-texto">${contenidoHtml}</div>
                    </div>
                </div>
            `;
        });
        
        container.innerHTML = html;
    }, (error) => {
        console.error('Error en comentarios:', error);
    });
}

// Función auxiliar para tiempo relativo
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

    // Emojis básicos
    const emojisMap = { ':D': '😃', ':)': '😊', ':(': '😢', ':P': '😛', ';)': '😉', '<3': '❤️' };
    for (const [code, emoji] of Object.entries(emojisMap)) {
        html = html.split(code).join(emoji);
    }
    
    // Procesar Stickers en formato texto
    const stickerRegex = /\[Sticker\]\(([^)]+)\)/g;
    html = html.replace(stickerRegex, (match, url) => `<img src="${url}" class="comentario-sticker" loading="lazy">`);
    
    // MEJORA: Convertir URLs en enlaces clickeables o imágenes
    const palabras = html.split(/(\s+)/);
    for (let i = 0; i < palabras.length; i++) {
        let palabra = palabras[i];
        if (palabra.startsWith('http://') || palabra.startsWith('https://')) {
            // Si es imagen, la renderiza
            if (palabra.match(/\.(jpg|jpeg|png|gif|webp|avif)(\?.*)?$/i)) {
                palabras[i] = `<img src="${palabra}" class="comentario-imagen" loading="lazy">`;
            } 
            // Si no es imagen (y no es parte del código del sticker), la hace clickeable
            else if (!palabra.includes('class="comentario-sticker"')) {
                palabras[i] = `<a href="${palabra}" target="_blank" rel="noopener noreferrer" class="comentario-link">${palabra}</a>`;
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
    if (!texto) {
        showToastComent('⚠️ No puedes enviar un comentario vacío');
        return;
    }
    
    const btn = document.getElementById('enviarComentarioBtn');
    btn.disabled = true;
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';
    
    try {
        await comentariosDb.collection('comments').add({
            animeId: window.comentariosAnimeId,
            season: parseInt(window.comentariosSeason),
            episode: parseInt(window.comentariosEpisode),
            userId: comentariosCurrentUser.uid,
            userName: comentariosCurrentUser.displayName || comentariosCurrentUser.email.split('@')[0],
            userAvatar: comentariosCurrentUser.photoURL || 'invitado.avif',
            texto: texto,
            esSticker: false,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        document.getElementById('comentarioTexto').value = '';
        showToastComent('✅ Comentario enviado');
    } catch (error) {
        alert('Error: ' + error.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

window.enviarStickerAlComentario = async function(stickerUrl) {
    if (!comentariosCurrentUser) {
        openLoginModalFromComent();
        return;
    }
    
    const btn = document.getElementById('enviarComentarioBtn');
    btn.disabled = true;
    
    try {
        await comentariosDb.collection('comments').add({
            animeId: window.comentariosAnimeId,
            season: parseInt(window.comentariosSeason),
            episode: parseInt(window.comentariosEpisode),
            userId: comentariosCurrentUser.uid,
            userName: comentariosCurrentUser.displayName || comentariosCurrentUser.email.split('@')[0],
            userAvatar: comentariosCurrentUser.photoURL || 'invitado.avif',
            texto: `[Sticker](${stickerUrl})`,
            esSticker: true,
            stickerUrl: stickerUrl,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        showToastComent('✅ Sticker enviado');
        toggleStickerPanelSistema();
    } catch (error) {
        alert('Error: ' + error.message);
    } finally {
        btn.disabled = false;
    }
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

function agregarEmojiAlTexto(emoji) {
    const textarea = document.getElementById('comentarioTexto');
    if (textarea) {
        const start = textarea.selectionStart;
        const text = textarea.value;
        textarea.value = text.substring(0, start) + emoji + text.substring(start);
        textarea.focus();
    }
    toggleEmojiPanelSistema();
}

function showToastComent(msg) {
    let toast = document.getElementById('toastComent');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toastComent';
        toast.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#00fff7;color:#000;padding:8px 20px;border-radius:20px;z-index:1000;font-weight:bold;box-shadow:0 4px 15px rgba(0,255,247,0.3);';
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