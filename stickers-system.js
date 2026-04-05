// ============================================
// SISTEMA DE STICKERS CON IMGBB (GRATIS, CON CORS)
// ============================================

let stickersDb = null;
let stickersAuth = null;
let stickersCurrentUser = null;
let userStickersCollection = [];

// 🔑 TU API KEY DE IMGBB
const IMGBB_API_KEY = 'c4c143b7bacc58fc3cc5ce5c66282d4e';

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

    auth.onAuthStateChanged(user => {
        stickersCurrentUser = user;
        updateStickersUI();
        if (user) {
            loadUserStickers();
        } else {
            userStickersCollection = [];
            renderUserStickers();
        }
    });
}

async function loadUserStickers() {
    if (!stickersCurrentUser) return;
    try {
        const doc = await stickersDb.collection('users').doc(stickersCurrentUser.uid).get();
        if (doc.exists && doc.data().stickers) {
            userStickersCollection = doc.data().stickers;
        } else {
            userStickersCollection = [...DEFAULT_STICKERS];
            await stickersDb.collection('users').doc(stickersCurrentUser.uid).set({
                stickers: userStickersCollection
            }, { merge: true });
        }
        renderUserStickers();
    } catch (e) {
        console.error("Error cargando stickers:", e);
    }
}

function renderUserStickers() {
    const container = document.getElementById('userStickersContainer');
    if (!container) return;

    // CORRECCIÓN: Filtra cualquier espacio vacío, nulo o dañado
    const validStickers = userStickersCollection.filter(url => url && typeof url === 'string' && url.trim() !== '');

    if (validStickers.length === 0) {
        container.innerHTML = '<div class="sticker-empty">No tienes stickers. ¡Sube uno o roba de los comentarios!</div>';
        return;
    }

    let html = '';
    // Mapeamos sobre el array original para mantener el índice correcto al eliminar
    userStickersCollection.forEach((url, index) => {
        if (!url || typeof url !== 'string' || url.trim() === '') return; // Ignora los vacíos en el loop
        
        html += `
            <div class="sticker-item">
                <img src="${url}" class="sticker-img" loading="lazy" onclick="seleccionarStickerParaEnviar('${url}')">
                <button class="sticker-delete-btn" onclick="eliminarSticker(${index}, event)">✖</button>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

window.switchStickerTab = function(tabName) {
    document.querySelectorAll('.sticker-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.sticker-tab-content').forEach(c => c.classList.remove('active'));
    
    // Tab active
    const btn = document.querySelector(`.sticker-tab[onclick="switchStickerTab('${tabName}')"]`);
    if (btn) btn.classList.add('active');
    
    // Content active
    const content = document.getElementById(`${tabName}StickersTab`);
    if (content) content.classList.add('active');
};

async function eliminarSticker(index, event) {
    event.stopPropagation(); // Evita que se seleccione el sticker para enviar
    if (!confirm('¿Eliminar este sticker de tu colección?')) return;
    
    userStickersCollection.splice(index, 1);
    renderUserStickers();
    
    try {
        await stickersDb.collection('users').doc(stickersCurrentUser.uid).set({
            stickers: userStickersCollection
        }, { merge: true });
        showToastSticker('🗑️ Sticker eliminado');
    } catch (e) {
        console.error(e);
        alert("Error al eliminar");
    }
}

async function subirStickerDesdePC(input) {
    if (!stickersCurrentUser) {
        openLoginModalFromStickers();
        return;
    }
    
    const file = input.files[0];
    if (!file) return;

    if (file.size > 50 * 1024 * 1024) {
        alert('El archivo es muy pesado. Máximo 50MB.');
        return;
    }

    const preview = document.getElementById('previewImage');
    const previewContainer = document.getElementById('stickerPreview');
    preview.src = URL.createObjectURL(file);
    previewContainer.style.display = 'block';

    const btnSubir = document.querySelector('.upload-sticker-label');
    const oldText = btnSubir.innerHTML;
    btnSubir.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Subiendo...';
    btnSubir.style.pointerEvents = 'none';

    try {
        const formData = new FormData();
        formData.append('image', file);

        const response = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (data.success) {
            const fileUrl = data.data.url;
            await guardarStickerEnColeccion(fileUrl);
            
            previewContainer.style.display = 'none';
            input.value = '';
            showToastSticker('✅ Sticker subido y guardado');
            switchStickerTab('mis');
        } else {
            throw new Error(data.error.message || 'Error desconocido en ImgBB');
        }
    } catch (error) {
        console.error("Error al subir a ImgBB:", error);
        alert("Error al subir la imagen: " + error.message);
    } finally {
        btnSubir.innerHTML = oldText;
        btnSubir.style.pointerEvents = 'auto';
    }
}

window.agregarStickerPorURL = async function() {
    if (!stickersCurrentUser) {
        openLoginModalFromStickers();
        return;
    }
    
    const url = prompt("Pega el link (URL) directo de la imagen (.gif, .png, .jpg):");
    if (!url) return;
    
    if (!url.match(/^https?:\/\/.+/)) {
        alert("Por favor, ingresa una URL válida que empiece con http:// o https://");
        return;
    }
    
    await guardarStickerEnColeccion(url);
    showToastSticker('✅ Sticker agregado');
    switchStickerTab('mis');
};

async function guardarStickerEnColeccion(url) {
    if (userStickersCollection.includes(url)) {
        showToastSticker('⚠️ Ya tienes este sticker');
        return;
    }
    
    userStickersCollection.push(url);
    renderUserStickers();
    
    try {
        await stickersDb.collection('users').doc(stickersCurrentUser.uid).set({
            stickers: userStickersCollection
        }, { merge: true });
    } catch (e) {
        console.error("Error guardando URL en Firebase:", e);
    }
}

// CORRECCIÓN: Roba y guarda directamente en los stickers del usuario
window.robarStickerSistema = async function(url) {
    if (!stickersCurrentUser) {
        openLoginModalFromStickers();
        return;
    }
    
    if (userStickersCollection.includes(url)) {
        showToastSticker('⚠️ Ya tienes este sticker en tu colección');
        return;
    }
    
    userStickersCollection.push(url);
    renderUserStickers();
    
    try {
        await stickersDb.collection('users').doc(stickersCurrentUser.uid).set({
            stickers: userStickersCollection
        }, { merge: true });
        
        showToastSticker('✅ ¡Sticker robado y guardado en Mis Stickers!');
    } catch (e) {
        console.error("Error al robar sticker:", e);
        alert("Error al guardar el sticker.");
    }
};

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

window.openLoginModalFromStickers = function() {
    const modal = document.getElementById('authModal');
    if (modal) modal.classList.add('show');
};