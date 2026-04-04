// ============================================
// SISTEMA DE STICKERS CON IMGUR (CLIENT ID PÚBLICO)
// ============================================

let stickersDb = null;
let stickersAuth = null;
let stickersCurrentUser = null;
let userStickersCollection = [];
let globalStickersList = [];

// Client ID público funcional (puedes usarlo en producción)
const IMGUR_CLIENT_ID = '546c25a59c58ad7';

// Stickers por defecto
const DEFAULT_STICKERS = [
    "https://cdn.jsdelivr.net/npm/@sticker-js/stickers@1.0.0/assets/1.webp",
    "https://cdn.jsdelivr.net/npm/@sticker-js/stickers@1.0.0/assets/2.webp",
    "https://cdn.jsdelivr.net/npm/@sticker-js/stickers@1.0.0/assets/3.webp",
    "https://cdn.jsdelivr.net/npm/@sticker-js/stickers@1.0.0/assets/4.webp",
    "https://media.tenor.com/V0GiP2u6N1EAAAAi/anime-sticker.gif",
    "https://media.tenor.com/-7-O6S6tX-kAAAAi/anime-sticker.gif"
];

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

async function loadUserStickers() {
    if (!stickersCurrentUser) return;
    
    try {
        const docRef = stickersDb.collection('userStickers').doc(stickersCurrentUser.uid);
        const doc = await docRef.get();
        
        if (doc.exists) {
            userStickersCollection = doc.data().stickers || [];
        } else {
            userStickersCollection = [...DEFAULT_STICKERS];
            await saveUserStickers();
        }
        renderUserStickers();
    } catch (error) {
        console.error('Error cargando stickers:', error);
        userStickersCollection = [...DEFAULT_STICKERS];
        renderUserStickers();
    }
}

async function saveUserStickers() {
    if (!stickersCurrentUser) return;
    
    await stickersDb.collection('userStickers').doc(stickersCurrentUser.uid).set({
        stickers: userStickersCollection,
        userId: stickersCurrentUser.uid,
        userName: stickersCurrentUser.displayName || stickersCurrentUser.email.split('@')[0],
        userAvatar: stickersCurrentUser.photoURL || '',
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
}

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
                            ownerName: data.userName || 'Usuario',
                            ownerAvatar: data.userAvatar || ''
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

// ============================================
// SUBIR STICKER A IMGUR (CLIENT ID PÚBLICO)
// ============================================
async function subirStickerAImgur(file) {
    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!validTypes.includes(file.type)) {
        throw new Error('Formato no soportado. Usa JPG, PNG, GIF o WEBP');
    }
    
    if (file.size > 5 * 1024 * 1024) {
        throw new Error('La imagen debe ser menor a 5MB');
    }
    
    const formData = new FormData();
    formData.append('image', file);

    const response = await fetch('https://api.imgur.com/3/image', {
        method: 'POST',
        headers: {
            'Authorization': `Client-ID ${IMGUR_CLIENT_ID}`
        },
        body: formData
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.data?.error || 'Error al subir a Imgur');
    }

    const data = await response.json();
    return data.data.link; // URL pública del sticker
}

async function subirStickerDesdePC(fileInput) {
    if (!stickersCurrentUser) {
        showToastSticker('🔒 Inicia sesión para subir stickers');
        return;
    }

    const file = fileInput.files[0];
    if (!file) return;

    if (userStickersCollection.length >= 50) {
        alert('📦 Límite de 50 stickers alcanzado');
        fileInput.value = '';
        return;
    }

    // Preview
    const previewDiv = document.getElementById('stickerPreview');
    const previewImg = document.getElementById('previewImage');
    const reader = new FileReader();
    reader.onload = function(e) {
        previewImg.src = e.target.result;
        previewDiv.style.display = 'block';
    };
    reader.readAsDataURL(file);

    // UI de carga
    const btn = document.querySelector('#subirStickerTab .add-sticker-btn');
    const originalText = btn ? btn.innerHTML : 'Subir';
    if (btn) {
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Subiendo a Imgur...';
        btn.disabled = true;
    }

    try {
        const imgurUrl = await subirStickerAImgur(file);
        userStickersCollection.push(imgurUrl);
        await saveUserStickers();
        renderUserStickers();
        await loadGlobalStickers();
        showToastSticker('✅ Sticker subido a Imgur con éxito!');
        
        setTimeout(() => {
            previewDiv.style.display = 'none';
            previewImg.src = '';
        }, 2000);
    } catch (error) {
        console.error(error);
        alert('Error: ' + error.message);
    } finally {
        if (btn) {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
        fileInput.value = '';
    }
}

async function agregarStickerPorURL() {
    if (!stickersCurrentUser) {
        showToastSticker('🔒 Inicia sesión para agregar stickers');
        return;
    }
    
    const url = prompt('📷 Pega la URL del sticker (jpg, png, gif, webp, avif):');
    if (!url) return;
    
    if (!url.match(/\.(jpg|jpeg|png|gif|webp|avif)(\?.*)?$/i) && !url.includes('tenor.com') && !url.includes('giphy.com')) {
        alert('❌ URL no válida');
        return;
    }
    
    if (userStickersCollection.length >= 50) {
        alert('📦 Límite de 50 stickers alcanzado');
        return;
    }
    
    if (userStickersCollection.includes(url)) {
        alert('Ya tienes este sticker');
        return;
    }
    
    userStickersCollection.push(url);
    await saveUserStickers();
    renderUserStickers();
    await loadGlobalStickers();
    showToastSticker('✅ Sticker agregado por URL');
}

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
    
    userStickersCollection.push(stickerUrl);
    await saveUserStickers();
    renderUserStickers();
    await loadGlobalStickers();
    showToastSticker('✨ Sticker robado con éxito!');
}

async function eliminarStickerPersonal(index) {
    if (!stickersCurrentUser) return;
    
    if (confirm('¿Eliminar este sticker de tu colección?')) {
        userStickersCollection.splice(index, 1);
        await saveUserStickers();
        renderUserStickers();
        showToastSticker('Sticker eliminado');
    }
}

async function enviarStickerSistema(stickerUrl) {
    if (typeof window.enviarStickerAlComentario === 'function') {
        await window.enviarStickerAlComentario(stickerUrl);
        toggleStickerPanelSistema();
    } else {
        showToastSticker('Error: Sistema de comentarios no disponible');
    }
}

function renderUserStickers() {
    const container = document.getElementById('userStickersContainer');
    if (!container) return;
    
    if (!userStickersCollection.length) {
        container.innerHTML = '<div class="sticker-empty">📭 No tienes stickers. ¡Sube uno o roba de otros!</div>';
        return;
    }
    
    container.innerHTML = userStickersCollection.map((sticker, index) => `
        <div class="sticker-item" onclick="enviarStickerSistema(\`${sticker.replace(/`/g, '\\`')}\`)" title="Enviar sticker">
            <img src="${sticker}" class="sticker-img" loading="lazy" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22%3E%3Crect width=%22100%22 height=%22100%22 fill=%22%23333%22/%3E%3Ctext x=%2250%22 y=%2250%22 text-anchor=%22middle%22 dy=%22.3em%22 fill=%22%23fff%22%3E?%3C/text%3E%3C/svg%3E'">
            <button class="sticker-delete-btn" onclick="event.stopPropagation(); eliminarStickerPersonal(${index})" title="Eliminar sticker">✖</button>
        </div>
    `).join('');
}

function renderGlobalStickers() {
    const container = document.getElementById('globalStickersContainer');
    if (!container) return;
    
    const availableStickers = globalStickersList.filter(s => !userStickersCollection.includes(s.url));
    
    if (!availableStickers.length) {
        container.innerHTML = '<div class="sticker-empty">✨ No hay stickers nuevos para robar</div>';
        return;
    }
    
    container.innerHTML = availableStickers.map(sticker => `
        <div class="sticker-item global-sticker" onclick="robarStickerSistema(\`${sticker.url.replace(/`/g, '\\`')}\`)" title="Robar sticker de ${sticker.ownerName}">
            <img src="${sticker.url}" class="sticker-img" loading="lazy" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22%3E%3Crect width=%22100%22 height=%22100%22 fill=%22%23333%22/%3E%3Ctext x=%2250%22 y=%2250%22 text-anchor=%22middle%22 dy=%22.3em%22 fill=%22%23fff%22%3E?%3C/text%3E%3C/svg%3E'">
            <div class="sticker-owner">👤 ${escapeHtmlSticker(sticker.ownerName)}</div>
            <div class="sticker-steal">🔽 Robar</div>
        </div>
    `).join('');
}

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

function updateStickersUI() {
    if (!stickersCurrentUser) {
        const subirTab = document.getElementById('subirStickerTab');
        if (subirTab) {
            subirTab.innerHTML = `
                <div class="add-sticker-container">
                    <p class="add-sticker-desc">🔒 Inicia sesión para subir stickers</p>
                    <button class="add-sticker-btn" onclick="openLoginModalFromStickers()">
                        <i class="fas fa-sign-in-alt"></i> Iniciar sesión
                    </button>
                </div>
            `;
        }
    }
}

function showToastSticker(msg) {
    let toast = document.getElementById('toastSticker');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toastSticker';
        toast.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#00fff7;color:#000;padding:8px 20px;border-radius:20px;z-index:1001;font-weight:bold';
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