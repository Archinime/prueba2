// ============================================
// SISTEMA DE STICKERS (COMO WHATSAPP)
// TOTALMENTE INDEPENDIENTE
// ============================================

let stickersDb = null;
let stickersAuth = null;
let stickersCurrentUser = null;
let userStickersCollection = [];
let globalStickersList = [];

// Stickers por defecto
const DEFAULT_STICKERS = [
    "https://cdn.jsdelivr.net/npm/@sticker-js/stickers@1.0.0/assets/1.webp",
    "https://cdn.jsdelivr.net/npm/@sticker-js/stickers@1.0.0/assets/2.webp",
    "https://cdn.jsdelivr.net/npm/@sticker-js/stickers@1.0.0/assets/3.webp",
    "https://cdn.jsdelivr.net/npm/@sticker-js/stickers@1.0.0/assets/4.webp",
    "https://cdn.jsdelivr.net/npm/@sticker-js/stickers@1.0.0/assets/5.webp",
    "https://cdn.jsdelivr.net/npm/@sticker-js/stickers@1.0.0/assets/6.webp",
    "https://cdn.jsdelivr.net/npm/@sticker-js/stickers@1.0.0/assets/7.webp",
    "https://cdn.jsdelivr.net/npm/@sticker-js/stickers@1.0.0/assets/8.webp",
    "https://media.tenor.com/V0GiP2u6N1EAAAAi/anime-sticker.gif",
    "https://media.tenor.com/-7-O6S6tX-kAAAAi/anime-sticker.gif",
    "https://media.tenor.com/9Y1jV8qVXlQAAAAi/anime-sticker.gif",
    "https://media.tenor.com/4fq0JhXVpJQAAAAi/anime-sticker.gif"
];

// Inicializar sistema de stickers
function initStickersSystem(db, auth) {
    stickersDb = db;
    stickersAuth = auth;
    
    auth.onAuthStateChanged(async (user) => {
        stickersCurrentUser = user;
        if (user) {
            await loadUserStickers();
        }
        await loadGlobalStickers();
        updateStickersUI();
    });
}

// Cargar stickers del usuario
async function loadUserStickers() {
    if (!stickersCurrentUser) return;
    
    try {
        const docRef = stickersDb.collection('userStickers').doc(stickersCurrentUser.uid);
        const doc = await docRef.get();
        
        if (doc.exists) {
            userStickersCollection = doc.data().stickers || [];
        } else {
            userStickersCollection = [...DEFAULT_STICKERS];
            await stickersDb.collection('userStickers').doc(stickersCurrentUser.uid).set({
                stickers: userStickersCollection,
                userId: stickersCurrentUser.uid,
                userName: stickersCurrentUser.displayName || stickersCurrentUser.email.split('@')[0],
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
        renderUserStickers();
    } catch (error) {
        console.error('Error cargando stickers:', error);
        userStickersCollection = [...DEFAULT_STICKERS];
        renderUserStickers();
    }
}

// Cargar stickers globales (de todos los usuarios)
async function loadGlobalStickers() {
    try {
        const snapshot = await stickersDb.collection('userStickers').get();
        const stickerMap = new Map();
        
        snapshot.forEach(doc => {
            const data = doc.data();
            if (data.stickers && Array.isArray(data.stickers)) {
                data.stickers.forEach(sticker => {
                    if (!stickerMap.has(sticker)) {
                        stickerMap.set(sticker, {
                            url: sticker,
                            ownerId: doc.id,
                            ownerName: data.userName || 'Usuario'
                        });
                    }
                });
            }
        });
        
        globalStickersList = Array.from(stickerMap.values());
        renderGlobalStickers();
    } catch (error) {
        console.error('Error cargando stickers globales:', error);
        globalStickersList = [];
        renderGlobalStickers();
    }
}

// Renderizar mis stickers
function renderUserStickers() {
    const container = document.getElementById('userStickersContainer');
    if (!container) return;
    
    if (!userStickersCollection.length) {
        container.innerHTML = '<div class="sticker-empty">📭 No tienes stickers. ¡Roba algunos!</div>';
        return;
    }
    
    container.innerHTML = userStickersCollection.map((sticker, index) => `
        <div class="sticker-item" onclick="enviarStickerDesdeSistema(\`${sticker.replace(/`/g, '\\`')}\`)" title="Enviar sticker">
            <img src="${sticker}" class="sticker-img" loading="lazy" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22%3E%3Crect width=%22100%22 height=%22100%22 fill=%22%23333%22/%3E%3Ctext x=%2250%22 y=%2250%22 text-anchor=%22middle%22 dy=%22.3em%22 fill=%22%23fff%22%3E?%3C/text%3E%3C/svg%3E'">
            <button class="sticker-delete-btn" onclick="event.stopPropagation(); eliminarStickerPersonal(${index})" title="Eliminar sticker">✖</button>
        </div>
    `).join('');
}

// Renderizar stickers globales (para robar)
function renderGlobalStickers() {
    const container = document.getElementById('globalStickersContainer');
    if (!container) return;
    
    if (!globalStickersList.length) {
        container.innerHTML = '<div class="sticker-empty">🌍 No hay stickers de otros usuarios aún.</div>';
        return;
    }
    
    // Filtrar stickers que el usuario ya tiene
    const availableStickers = globalStickersList.filter(s => !userStickersCollection.includes(s.url));
    
    if (!availableStickers.length) {
        container.innerHTML = '<div class="sticker-empty">✨ Ya tienes todos los stickers disponibles!</div>';
        return;
    }
    
    container.innerHTML = availableStickers.map(sticker => `
        <div class="sticker-item global-sticker" onclick="robarStickerSistema(\`${sticker.url.replace(/`/g, '\\`')}\`)">
            <img src="${sticker.url}" class="sticker-img" loading="lazy" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22%3E%3Crect width=%22100%22 height=%22100%22 fill=%22%23333%22/%3E%3Ctext x=%2250%22 y=%2250%22 text-anchor=%22middle%22 dy=%22.3em%22 fill=%22%23fff%22%3E?%3C/text%3E%3C/svg%3E'">
            <div class="sticker-owner">👤 ${escapeHtmlSticker(sticker.ownerName)}</div>
            <div class="sticker-steal">🔽 Robar</div>
        </div>
    `).join('');
}

// Robar sticker de otro usuario
async function robarStickerSistema(stickerUrl) {
    if (!stickersCurrentUser) {
        showToastSticker('🔒 Inicia sesión para robar stickers');
        return;
    }
    
    if (userStickersCollection.includes(stickerUrl)) {
        showToastSticker('Ya tienes este sticker');
        return;
    }
    
    if (userStickersCollection.length >= 50) {
        showToastSticker('Límite de 50 stickers alcanzado');
        return;
    }
    
    try {
        userStickersCollection.push(stickerUrl);
        await stickersDb.collection('userStickers').doc(stickersCurrentUser.uid).set({
            stickers: userStickersCollection,
            userId: stickersCurrentUser.uid,
            userName: stickersCurrentUser.displayName || stickersCurrentUser.email.split('@')[0],
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        renderUserStickers();
        await loadGlobalStickers();
        showToastSticker('✨ Sticker robado con éxito!');
    } catch (error) {
        console.error('Error robando sticker:', error);
        showToastSticker('Error al robar sticker');
    }
}

// Eliminar sticker propio
async function eliminarStickerPersonal(index) {
    if (!stickersCurrentUser) return;
    
    if (confirm('¿Eliminar este sticker de tu colección?')) {
        userStickersCollection.splice(index, 1);
        try {
            await stickersDb.collection('userStickers').doc(stickersCurrentUser.uid).set({
                stickers: userStickersCollection,
                userId: stickersCurrentUser.uid,
                userName: stickersCurrentUser.displayName || stickersCurrentUser.email.split('@')[0],
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            renderUserStickers();
            showToastSticker('Sticker eliminado');
        } catch (error) {
            console.error('Error:', error);
            showToastSticker('Error al eliminar');
        }
    }
}

// Agregar sticker personalizado por URL
async function agregarStickerPersonalizado() {
    if (!stickersCurrentUser) {
        showToastSticker('Inicia sesión para agregar stickers');
        return;
    }
    
    const url = prompt('📷 Pega la URL del sticker (jpg, png, gif, webp, avif):');
    if (!url) return;
    
    // Validar URL
    if (!url.match(/\.(jpg|jpeg|png|gif|webp|avif)(\?.*)?$/i) && !url.includes('tenor.com')) {
        alert('❌ URL no válida. Usa .jpg, .png, .gif, .webp o .avif');
        return;
    }
    
    if (userStickersCollection.length >= 50) {
        alert('Límite de 50 stickers alcanzado');
        return;
    }
    
    if (userStickersCollection.includes(url)) {
        alert('Ya tienes este sticker');
        return;
    }
    
    userStickersCollection.push(url);
    try {
        await stickersDb.collection('userStickers').doc(stickersCurrentUser.uid).set({
            stickers: userStickersCollection,
            userId: stickersCurrentUser.uid,
            userName: stickersCurrentUser.displayName || stickersCurrentUser.email.split('@')[0],
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        renderUserStickers();
        await loadGlobalStickers();
        showToastSticker('✅ Sticker agregado');
    } catch (error) {
        console.error('Error:', error);
        showToastSticker('Error al agregar');
    }
}

// Función para enviar sticker (será llamada desde el sistema de comentarios)
async function enviarStickerDesdeSistema(stickerUrl) {
    // Esta función se conecta con comentarios.js
    if (typeof window.enviarStickerAlComentario === 'function') {
        await window.enviarStickerAlComentario(stickerUrl);
    } else {
        console.error('Sistema de comentarios no disponible');
        showToastSticker('Error: Sistema de comentarios no disponible');
    }
}

// Cambiar pestañas de stickers
function switchStickerTab(tab) {
    const tabs = document.querySelectorAll('.sticker-tab');
    const contents = document.querySelectorAll('.sticker-tab-content');
    
    tabs.forEach(t => t.classList.remove('active'));
    contents.forEach(c => c.classList.remove('active'));
    
    if (tab === 'mis') {
        tabs[0]?.classList.add('active');
        document.getElementById('misStickersTab')?.classList.add('active');
        renderUserStickers();
    } else if (tab === 'global') {
        tabs[1]?.classList.add('active');
        document.getElementById('globalStickersTab')?.classList.add('active');
        loadGlobalStickers();
    } else if (tab === 'subir') {
        tabs[2]?.classList.add('active');
        document.getElementById('subirStickerTab')?.classList.add('active');
    }
}

// Alternar panel de stickers
function toggleStickerPanelSistema() {
    const panel = document.getElementById('stickerPanelFull');
    if (panel) {
        panel.classList.toggle('active');
        const emojiPanel = document.getElementById('emojiPanel');
        if (emojiPanel) emojiPanel.classList.remove('active');
        if (panel.classList.contains('active')) {
            renderUserStickers();
            loadGlobalStickers();
        }
    }
}

// Actualizar UI según autenticación
function updateStickersUI() {
    const addStickerSection = document.getElementById('subirStickerTab');
    if (addStickerSection && !stickersCurrentUser) {
        addStickerSection.innerHTML = `
            <div class="add-sticker-container">
                <p class="add-sticker-desc">🔒 Inicia sesión para agregar stickers</p>
                <button class="add-sticker-btn" onclick="openLoginModalFromStickers()">
                    <i class="fas fa-sign-in-alt"></i> Iniciar sesión
                </button>
            </div>
        `;
    }
}

// Toast para stickers
function showToastSticker(msg) {
    let toast = document.getElementById('toastSticker');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toastSticker';
        toast.style.position = 'fixed';
        toast.style.bottom = '80px';
        toast.style.left = '50%';
        toast.style.transform = 'translateX(-50%)';
        toast.style.backgroundColor = '#00fff7';
        toast.style.color = '#000';
        toast.style.padding = '8px 20px';
        toast.style.borderRadius = '20px';
        toast.style.zIndex = '1001';
        toast.style.fontWeight = 'bold';
        toast.style.fontSize = '0.9rem';
        document.body.appendChild(toast);
    }
    toast.innerHTML = msg;
    toast.style.display = 'block';
    setTimeout(() => toast.style.display = 'none', 2500);
}

function openLoginModalFromStickers() {
    const modal = document.getElementById('authModal');
    if (modal) modal.classList.add('show');
}

function escapeHtmlSticker(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}