// ============================================
// SISTEMA DE COMENTARIOS PARA VIDEO-PLAYER
// CON SOPORTE PARA EMOJIS, GIFS Y STICKERS
// ============================================

let comentariosAuthReady = false;
let comentariosCurrentUser = null;
let comentariosDb = null;
let comentariosUnsubscribe = null;

// Inicializar sistema de comentarios
function initComentariosSystem(db, auth) {
    comentariosDb = db;
    
    auth.onAuthStateChanged(async (user) => {
        comentariosCurrentUser = user;
        comentariosAuthReady = true;
        
        updateComentariosUI();
        
        if (window.comentariosAnimeId && window.comentariosSeason && window.comentariosEpisode) {
            setupComentariosRealtimeListener(window.comentariosAnimeId, window.comentariosSeason, window.comentariosEpisode);
        }
    });
}

// Configurar escucha en tiempo real
function setupComentariosRealtimeListener(animeId, seasonNum, episodeNum) {
    if (comentariosUnsubscribe) {
        comentariosUnsubscribe();
        comentariosUnsubscribe = null;
    }
    
    if (!comentariosDb) return;
    
    const commentsRef = comentariosDb.collection('comments')
        .where('animeId', '==', animeId)
        .where('season', '==', parseInt(seasonNum))
        .where('episode', '==', parseInt(episodeNum))
        .orderBy('timestamp', 'desc');
    
    comentariosUnsubscribe = commentsRef.onSnapshot((snapshot) => {
        const commentsList = document.getElementById('comentariosList');
        
        if (snapshot.empty) {
            commentsList.innerHTML = `
                <div class="empty-comments">
                    <i class="fas fa-comment-dots"></i>
                    <p>Sin comentarios aún. ¡Sé el primero en comentar!</p>
                </div>
            `;
            return;
        }
        
        let html = '';
        snapshot.forEach(doc => {
            const c = doc.data();
            let fecha = 'Fecha desconocida';
            
            if (c.timestamp) {
                if (c.timestamp.toDate) {
                    const date = c.timestamp.toDate();
                    fecha = date.toLocaleString();
                } else if (c.timestamp.seconds) {
                    const date = new Date(c.timestamp.seconds * 1000);
                    fecha = date.toLocaleString();
                } else if (typeof c.timestamp === 'string') {
                    fecha = c.timestamp;
                }
            }
            
            const isOwner = comentariosCurrentUser && comentariosCurrentUser.uid === c.userId;
            const userAvatar = c.userAvatar || 'invitado.avif';
            const userName = c.userName || 'Usuario';
            // Procesar texto con emojis y stickers
            let textoProcesado = procesarTextoComentario(c.texto || '');
            
            html += `
                <div class="comentario-item" data-comment-id="${doc.id}">
                    <div class="comentario-avatar">
                        <img src="${userAvatar}" alt="${escapeHtmlComent(userName)}" onerror="this.src='invitado.avif'">
                    </div>
                    <div class="comentario-content">
                        <div class="comentario-header">
                            <span class="comentario-user">${escapeHtmlComent(userName)}</span>
                            <span class="comentario-fecha">${fecha}</span>
                            ${isOwner ? `<button class="comentario-delete" onclick="deleteComentario('${doc.id}')" title="Eliminar comentario"><i class="fas fa-trash-alt"></i></button>` : ''}
                        </div>
                        <div class="comentario-texto">${textoProcesado}</div>
                    </div>
                </div>
            `;
        });
        
        commentsList.innerHTML = html;
        
    }, (error) => {
        console.error('Error en listener de comentarios:', error);
        const commentsList = document.getElementById('comentariosList');
        if (commentsList) {
            commentsList.innerHTML = `
                <div class="empty-comments error">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>Error al cargar comentarios. ${error.message}</p>
                </div>
            `;
        }
    });
}

// Procesar texto: convertir emojis, stickers y URLs de imágenes
function procesarTextoComentario(texto) {
    if (!texto) return '';
    
    let html = escapeHtmlComent(texto);
    
    // Convertir emojis comunes a emojis reales (soporte nativo)
    const emojisMap = {
        ':D': '😃',
        ':)': '😊',
        ':(': '😢',
        ':P': '😛',
        ':p': '😛',
        ';)': '😉',
        '<3': '❤️',
        '</3': '💔',
        ':v': '🤘',
        ':3': '😸',
        '>:(' : '😠',
        'O:)': '😇',
        ':*': '😘',
        ':-*': '😘'
    };
    
    for (const [emojiCode, emojiReal] of Object.entries(emojisMap)) {
        html = html.split(emojiCode).join(emojiReal);
    }
    
    // Convertir URLs de imágenes a etiquetas img
    const imageUrlRegex = /(https?:\/\/[^\s]+\.(?:jpg|jpeg|png|gif|webp|avif))/gi;
    html = html.replace(imageUrlRegex, (url) => {
        return `<img src="${url}" class="comentario-imagen" loading="lazy" onerror="this.style.display='none'">`;
    });
    
    // Convertir URLs de GIFs de GIPHY (formato especial)
    const giphyRegex = /(https?:\/\/media[0-9]?\.giphy\.com\/media\/[^\s]+)\/giphy\.gif/gi;
    html = html.replace(giphyRegex, (url) => {
        return `<img src="${url}" class="comentario-gif" loading="lazy">`;
    });
    
    // Convertir stickers de Telegram o similares
    const stickerRegex = /(https?:\/\/[^\s]+\.(?:webp|avif))/gi;
    html = html.replace(stickerRegex, (url) => {
        return `<img src="${url}" class="comentario-sticker" loading="lazy" onerror="this.style.display='none'">`;
    });
    
    // Convertir saltos de línea a <br>
    html = html.replace(/\n/g, '<br>');
    
    return html;
}

// Actualizar interfaz según estado de autenticación
function updateComentariosUI() {
    const loginMessage = document.getElementById('comentarioLoginMessage');
    const formContainer = document.getElementById('comentarioFormContainer');
    const textarea = document.getElementById('comentarioTexto');
    const submitBtn = document.getElementById('enviarComentarioBtn');
    
    if (!comentariosCurrentUser) {
        if (loginMessage) loginMessage.style.display = 'block';
        if (formContainer) formContainer.style.display = 'none';
        if (textarea) textarea.disabled = true;
        if (submitBtn) submitBtn.disabled = true;
    } else {
        if (loginMessage) loginMessage.style.display = 'none';
        if (formContainer) formContainer.style.display = 'block';
        if (textarea) textarea.disabled = false;
        if (submitBtn) submitBtn.disabled = false;
        
        const userAvatar = document.getElementById('comentarioUserAvatar');
        if (userAvatar) {
            userAvatar.src = comentariosCurrentUser.photoURL || 'invitado.avif';
        }
        const userName = document.getElementById('comentarioUserName');
        if (userName) {
            userName.innerText = comentariosCurrentUser.displayName || comentariosCurrentUser.email.split('@')[0];
        }
    }
}

// Panel de emojis/stickers
function toggleEmojiPanel() {
    const panel = document.getElementById('emojiPanel');
    if (panel) {
        panel.classList.toggle('active');
    }
}

function agregarEmoji(emoji) {
    const textarea = document.getElementById('comentarioTexto');
    if (textarea) {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const text = textarea.value;
        textarea.value = text.substring(0, start) + emoji + text.substring(end);
        textarea.focus();
        textarea.setSelectionRange(start + emoji.length, start + emoji.length);
    }
    toggleEmojiPanel();
}

function agregarSticker(url) {
    const textarea = document.getElementById('comentarioTexto');
    if (textarea) {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const text = textarea.value;
        const stickerMarkdown = `[Sticker](${url})`;
        textarea.value = text.substring(0, start) + stickerMarkdown + text.substring(end);
        textarea.focus();
    }
    toggleEmojiPanel();
}

// Enviar comentario
async function enviarComentario() {
    if (!comentariosCurrentUser) {
        openLoginModalFromComent();
        return;
    }
    
    let texto = document.getElementById('comentarioTexto').value.trim();
    if (!texto) {
        alert('Escribe un comentario antes de enviar');
        return;
    }
    
    if (texto.length > 500) {
        alert('El comentario no puede exceder los 500 caracteres');
        return;
    }
    
    const submitBtn = document.getElementById('enviarComentarioBtn');
    const originalText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';
    
    try {
        const commentData = {
            animeId: window.comentariosAnimeId,
            season: parseInt(window.comentariosSeason),
            episode: parseInt(window.comentariosEpisode),
            userId: comentariosCurrentUser.uid,
            userName: comentariosCurrentUser.displayName || comentariosCurrentUser.email.split('@')[0],
            userAvatar: comentariosCurrentUser.photoURL || 'invitado.avif',
            texto: texto,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        await comentariosDb.collection('comments').add(commentData);
        
        document.getElementById('comentarioTexto').value = '';
        showToastComent('Comentario enviado con éxito');
        
    } catch (error) {
        console.error('Error enviando comentario:', error);
        alert('Error al enviar comentario: ' + error.message);
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
    }
}

// Eliminar comentario
async function deleteComentario(commentId) {
    if (!comentariosCurrentUser) return;
    
    if (!confirm('¿Eliminar este comentario?')) return;
    
    try {
        const docRef = comentariosDb.collection('comments').doc(commentId);
        const doc = await docRef.get();
        
        if (!doc.exists) {
            alert('El comentario ya no existe');
            return;
        }
        
        if (doc.data().userId !== comentariosCurrentUser.uid) {
            alert('No puedes eliminar comentarios de otros usuarios');
            return;
        }
        
        await docRef.delete();
        showToastComent('Comentario eliminado');
        
    } catch (error) {
        console.error('Error eliminando comentario:', error);
        alert('Error al eliminar comentario: ' + error.message);
    }
}

function escapeHtmlComent(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showToastComent(msg) {
    let toast = document.getElementById('toastComent');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toastComent';
        toast.style.position = 'fixed';
        toast.style.bottom = '100px';
        toast.style.left = '50%';
        toast.style.transform = 'translateX(-50%)';
        toast.style.backgroundColor = '#00fff7';
        toast.style.color = '#000';
        toast.style.padding = '8px 20px';
        toast.style.borderRadius = '20px';
        toast.style.zIndex = '1000';
        toast.style.fontWeight = 'bold';
        toast.style.fontSize = '0.9rem';
        toast.style.boxShadow = '0 0 15px rgba(0, 255, 247, 0.5)';
        document.body.appendChild(toast);
    }
    toast.innerHTML = `<i class="fas fa-check-circle"></i> ${msg}`;
    toast.style.display = 'block';
    setTimeout(() => toast.style.display = 'none', 3000);
}

// Función mejorada para abrir modal de login (con registro)
function openLoginModalFromComent() {
    const authModal = document.getElementById('authModal');
    if (authModal) {
        authModal.classList.add('show');
        // Asegurar que se muestre el formulario de login por defecto
        const loginTab = document.querySelector('.auth-tab[data-tab="login"]');
        const registerTab = document.querySelector('.auth-tab[data-tab="register"]');
        const loginForm = document.getElementById('authLoginForm');
        const registerForm = document.getElementById('authRegisterForm');
        
        if (loginTab && registerTab && loginForm && registerForm) {
            loginTab.classList.add('active');
            registerTab.classList.remove('active');
            loginForm.style.display = 'flex';
            registerForm.style.display = 'none';
        }
    } else {
        alert('Inicia sesión o regístrate para comentar');
    }
}