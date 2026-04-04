// ============================================
// SISTEMA DE COMENTARIOS PARA VIDEO-PLAYER
// ============================================

let comentariosAuthReady = false;
let comentariosCurrentUser = null;
let comentariosDb = null;

// Inicializar sistema de comentarios
function initComentariosSystem(db, auth) {
    comentariosDb = db;
    
    auth.onAuthStateChanged(async (user) => {
        comentariosCurrentUser = user;
        comentariosAuthReady = true;
        
        // Actualizar UI de comentarios
        updateComentariosUI();
        
        // Cargar comentarios si ya tenemos el anime/season/episode
        if (window.comentariosAnimeId && window.comentariosSeason && window.comentariosEpisode) {
            await loadComentarios(window.comentariosAnimeId, window.comentariosSeason, window.comentariosEpisode);
        }
    });
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
        
        // Actualizar avatar del usuario en el formulario
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

// Cargar comentarios desde Firestore
async function loadComentarios(animeId, seasonNum, episodeNum) {
    if (!comentariosDb) return;
    
    const commentsRef = comentariosDb.collection('comments')
        .where('animeId', '==', animeId)
        .where('season', '==', parseInt(seasonNum))
        .where('episode', '==', parseInt(episodeNum))
        .orderBy('timestamp', 'desc');
    
    try {
        const snapshot = await commentsRef.get();
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
            const fecha = c.timestamp ? new Date(c.timestamp.toDate()).toLocaleString() : 'Fecha desconocida';
            const isOwner = comentariosCurrentUser && comentariosCurrentUser.uid === c.userId;
            
            html += `
                <div class="comentario-item" data-comment-id="${doc.id}">
                    <div class="comentario-avatar">
                        <img src="${c.userAvatar || 'invitado.avif'}" alt="${escapeHtmlComent(c.userName)}">
                    </div>
                    <div class="comentario-content">
                        <div class="comentario-header">
                            <span class="comentario-user">${escapeHtmlComent(c.userName)}</span>
                            <span class="comentario-fecha">${fecha}</span>
                            ${isOwner ? `<button class="comentario-delete" onclick="deleteComentario('${doc.id}')" title="Eliminar comentario"><i class="fas fa-trash-alt"></i></button>` : ''}
                        </div>
                        <div class="comentario-texto">${escapeHtmlComent(c.texto).replace(/\n/g, '<br>')}</div>
                    </div>
                </div>
            `;
        });
        
        commentsList.innerHTML = html;
        
    } catch (error) {
        console.error('Error cargando comentarios:', error);
        const commentsList = document.getElementById('comentariosList');
        commentsList.innerHTML = `
            <div class="empty-comments error">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Error al cargar comentarios. Intenta de nuevo.</p>
            </div>
        `;
    }
}

// Enviar comentario
async function enviarComentario() {
    if (!comentariosCurrentUser) {
        alert('Debes iniciar sesión para comentar');
        return;
    }
    
    const texto = document.getElementById('comentarioTexto').value.trim();
    if (!texto) {
        alert('Escribe un comentario antes de enviar');
        return;
    }
    
    if (texto.length > 500) {
        alert('El comentario no puede exceder los 500 caracteres');
        return;
    }
    
    const submitBtn = document.getElementById('enviarComentarioBtn');
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
        
        // Limpiar textarea
        document.getElementById('comentarioTexto').value = '';
        
        // Recargar comentarios
        await loadComentarios(window.comentariosAnimeId, window.comentariosSeason, window.comentariosEpisode);
        
        // Mostrar notificación
        showToastComent('Comentario enviado con éxito');
        
    } catch (error) {
        console.error('Error enviando comentario:', error);
        alert('Error al enviar comentario: ' + error.message);
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Enviar comentario';
    }
}

// Eliminar comentario
async function deleteComentario(commentId) {
    if (!comentariosCurrentUser) return;
    
    if (!confirm('¿Eliminar este comentario?')) return;
    
    try {
        // Verificar que el usuario es el dueño
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
        
        // Recargar comentarios
        await loadComentarios(window.comentariosAnimeId, window.comentariosSeason, window.comentariosEpisode);
        showToastComent('Comentario eliminado');
        
    } catch (error) {
        console.error('Error eliminando comentario:', error);
        alert('Error al eliminar comentario');
    }
}

// Función auxiliar para escapar HTML
function escapeHtmlComent(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Toast para comentarios
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

// Función para abrir modal de login desde comentarios
function openLoginModalFromComent() {
    // Buscar y mostrar el modal de autenticación
    const authModal = document.getElementById('authModal');
    if (authModal) {
        authModal.classList.add('show');
    } else {
        alert('Inicia sesión para comentar');
    }
}