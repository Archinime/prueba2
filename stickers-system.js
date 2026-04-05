// ============================================
// SISTEMA DE STICKERS (IMGBB + FIREBASE STORAGE)
// ============================================

let stickersDb = null;
let stickersAuth = null;
let stickersCurrentUser = null;
let userStickersCollection = [];

// 🔑 TU API KEY DE IMGBB (SOLO IMÁGENES)
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
    
    const validStickers = userStickersCollection.filter(url => url && typeof url === 'string' && url.trim() !== '');
    
    if (validStickers.length === 0) {
        container.innerHTML = '<div class="sticker-empty" style="color: var(--primary-color);">No tienes stickers. ¡Sube uno o roba de los comentarios!</div>';
        return;
    }

    let html = '';
    validStickers.forEach((url, index) => {
        const isVideo = url.match(/\.(mp4|webm)$/i);
        const tagMedia = isVideo 
            ? `<video src="${url}" class="sticker-img" autoplay loop muted playsinline onclick="seleccionarStickerParaEnviar('${url}')"></video>`
            : `<img src="${url}" class="sticker-img" loading="lazy" onclick="seleccionarStickerParaEnviar('${url}')">`;
            
        html += `
            <div class="sticker-item" style="border: 1px solid rgba(0, 255, 247, 0.2); box-shadow: 0 0 10px rgba(0,0,0,0.5);">
                ${tagMedia}
                <button class="sticker-delete-btn" onclick="eliminarSticker('${url}', event)" style="box-shadow: 0 0 8px #ff5555;">✖</button>
            </div>
        `;
    });
    container.innerHTML = html;
}

window.switchStickerTab = function(tabName) {
    document.querySelectorAll('.sticker-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.sticker-tab-content').forEach(c => c.classList.remove('active'));
    
    const btn = document.querySelector(`.sticker-tab[onclick="switchStickerTab('${tabName}')"]`);
    if (btn) btn.classList.add('active');
    
    const content = document.getElementById(`${tabName}StickersTab`);
    if (content) content.classList.add('active');
};

async function eliminarSticker(urlSticker, event) {
    event.stopPropagation();
    if (!confirm('¿Eliminar este sticker de tu colección?')) return;
    
    userStickersCollection = userStickersCollection.filter(url => url !== urlSticker);
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

    const previewContainer = document.getElementById('stickerPreview');
    const previewImg = document.getElementById('previewImage');
    const previewVid = document.getElementById('previewVideo');
    const isVideoFile = file.type.startsWith('video/');

    if (isVideoFile) {
        previewImg.style.display = 'none';
        previewVid.src = URL.createObjectURL(file);
        previewVid.style.display = 'inline-block';
    } else {
        previewVid.style.display = 'none';
        previewImg.src = URL.createObjectURL(file);
        previewImg.style.display = 'inline-block';
    }
    
    previewContainer.style.display = 'block';
    
    const btnSubir = document.querySelector('.upload-sticker-label');
    const oldText = btnSubir.innerHTML;
    btnSubir.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Subiendo (Puede tardar)...';
    btnSubir.style.pointerEvents = 'none';
    
    try {
        let finalUrl = "";
        
        if (isVideoFile) {
            // USAMOS FIREBASE STORAGE PARA LOS VIDEOS (EVITA ERRORES DE CORS)
            const storageRef = firebase.storage().ref();
            // Limpiamos el nombre para que no haya conflictos
            const cleanFileName = file.name.replace(/[^a-zA-Z0-9.]/g, '_');
            const fileName = `stickers_videos/${stickersCurrentUser.uid}_${Date.now()}_${cleanFileName}`;
            const videoRef = storageRef.child(fileName);
            
            const snapshot = await videoRef.put(file);
            finalUrl = await snapshot.ref.getDownloadURL();
            
        } else {
            // IMÁGENES CONTINUAN USANDO IMGBB PARA NO OCUPAR ESPACIO
            const formData = new FormData();
            formData.append('image', file);
            const response = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
                method: 'POST',
                body: formData
            });
            const data = await response.json();
            if (data.success) {
                finalUrl = data.data.url;
            } else {
                throw new Error(data.error.message || 'Error en ImgBB');
            }
        }

        await guardarStickerEnColeccion(finalUrl);
        
        previewContainer.style.display = 'none';
        input.value = '';
        showToastSticker('✅ Archivo subido y guardado exitosamente');
        switchStickerTab('mis');
        
    } catch (error) {
        console.error("Error de subida:", error);
        alert("Error al subir el archivo: " + error.message);
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
    
    const url = prompt("Pega el link (URL) directo de la imagen o video (.gif, .png, .jpg, .mp4, .webm):");
    if (!url) return;
    
    if (!url.match(/^https?:\/\/.+/)) {
        alert("Por favor, ingresa una URL válida que empiece con http:// o https://");
        return;
    }
    
    await guardarStickerEnColeccion(url);
    showToastSticker('✅ Archivo agregado');
    switchStickerTab('mis');
};

async function guardarStickerEnColeccion(url) {
    if (!userStickersCollection) {
        userStickersCollection = [...DEFAULT_STICKERS];
    }

    if (userStickersCollection.includes(url)) {
        showToastSticker('⚠️ Ya tienes esto en tu colección');
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

window.robarStickerSistema = async function(url) {
    if (!stickersCurrentUser) {
        openLoginModalFromStickers();
        return;
    }
    
    const cleanUrl = url.trim();
    
    try {
        const userRef = stickersDb.collection('users').doc(stickersCurrentUser.uid);
        const doc = await userRef.get();
        
        let dbStickers = [];
        if (doc.exists && doc.data().stickers) {
            dbStickers = doc.data().stickers;
        } else {
            dbStickers = [...DEFAULT_STICKERS];
        }

        if (dbStickers.includes(cleanUrl)) {
            showToastSticker('⚠️ Ya tienes este sticker en tu colección');
            return;
        }

        dbStickers.push(cleanUrl);
        const safeStickers = [...new Set(dbStickers)].filter(s => typeof s === 'string' && s.trim() !== '');
        
        await userRef.set({ stickers: safeStickers }, { merge: true });
        
        userStickersCollection = safeStickers;
        renderUserStickers();
        showToastSticker('✅ ¡Sticker robado y guardado!');

    } catch (e) {
        console.error("Error crítico al robar sticker:", e);
        alert("Error al guardar en la base de datos. Detalle técnico: " + e.message);
    }
};

function updateStickersUI() {
    if (!stickersCurrentUser) {
        const subirTab = document.getElementById('subirStickersTab');
        if (subirTab) {
            subirTab.innerHTML = `
                <div class="add-sticker-container">
                    <p class="add-sticker-desc">🔒 Inicia sesión para subir stickers y usar videos</p>
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
        toast.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#0f0f13;color:#00fff7;padding:12px 25px;border-radius:30px;z-index:1001;font-weight:bold;box-shadow:0 0 20px rgba(0,255,247,0.5); border: 1px solid #00fff7; transition: all 0.3s;';
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