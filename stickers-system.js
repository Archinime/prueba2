// ============================================
// SISTEMA DE STICKERS (CLOUDINARY + FIRESTORE ARRAY UNION)
// CORREGIDO: Subida funcional, preview, actualización inmediata
// ============================================

let stickersDb = null;
let stickersAuth = null;
let userStickersCollection = [];

// CONFIGURACIÓN DE CLOUDINARY
const CLOUDINARY_URL = 'https://api.cloudinary.com/v1_1/dbcqcai1q/upload';
const CLOUDINARY_PRESET = 'stickers_archinime';
const DEFAULT_STICKERS = [];

function initStickersSystem(db, auth) {
    stickersDb = db;
    stickersAuth = auth;

    const loadIfUserExists = (user) => {
        updateStickersUI();
        if (user) {
            loadUserStickers();
        } else {
            userStickersCollection = [];
            renderUserStickers();
        }
    };

    if (window.ArchinimeState) {
        ArchinimeState.on('currentUser', loadIfUserExists);
        const currentUser = ArchinimeState.get('currentUser');
        if (currentUser) {
            loadIfUserExists(currentUser);
        }
    } else {
        auth.onAuthStateChanged(loadIfUserExists);
    }
}

function getCurrentUser() {
    if (window.ArchinimeState) return ArchinimeState.get('currentUser');
    return null;
}

async function loadUserStickers() {
    const user = getCurrentUser();
    if (!user) return;

    try {
        const doc = await stickersDb.collection('userStickers').doc(user.uid).get();

        if (doc.exists && doc.data().stickers) {
            userStickersCollection = doc.data().stickers.filter(url => url && typeof url === 'string' && url.trim() !== '');
            if (userStickersCollection.length !== doc.data().stickers.length) {
                await stickersDb.collection('userStickers').doc(user.uid).set({
                    stickers: userStickersCollection
                }, { merge: true });
            }
        } else {
            userStickersCollection = [...DEFAULT_STICKERS];
            await stickersDb.collection('userStickers').doc(user.uid).set({
                stickers: userStickersCollection
            }, { merge: true });
        }
        renderUserStickers();
    } catch (e) {
        console.error("Error cargando stickers:", e);
        const container = document.getElementById('userStickersContainer');
        if (container) {
            container.innerHTML = '<div class="sticker-empty" style="color: #ff5555; font-weight: bold;">⚠️ Error al cargar tu colección. Intenta recargar.</div>';
        }
    }
}

function renderUserStickers() {
    const container = document.getElementById('userStickersContainer');
    if (!container) return;

    const validStickers = userStickersCollection.filter(url => url && typeof url === 'string' && url.trim() !== '');

    if (validStickers.length === 0) {
        container.innerHTML = `
            <div class="sticker-empty-modern">
                <div class="sticker-empty-icon"><i class="fas fa-sticky-note"></i></div>
                <div class="sticker-empty-title">SIN STICKERS</div>
                <div class="sticker-empty-desc">Sube imágenes o vídeos, o roba de otros comentarios.</div>
                <div class="sticker-empty-hint"><i class="fas fa-upload"></i> Ve a la pestaña "SUBIR"</div>
            </div>
        `;
        return;
    }

    let html = '';
    validStickers.forEach((url) => {
        const isVideo = url.match(/\.(mp4|webm)$/i);
        const tagMedia = isVideo 
            ? `<video src="${url}" class="sticker-img" autoplay loop muted playsinline onclick="seleccionarStickerParaEnviar('${url}')"></video>`
            : `<img src="${url}" class="sticker-img" loading="lazy" onclick="seleccionarStickerParaEnviar('${url}')">`;
            
        html += `
            <div class="sticker-item">
                ${tagMedia}
                <button class="sticker-delete-btn" onclick="eliminarSticker('${url}', event)">✖</button>
            </div>
        `;
    });
    container.innerHTML = html;
}

window.switchStickerTab = function(tabName) {
    document.querySelectorAll('.sticker-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.sticker-tab-content').forEach(c => c.classList.remove('active'));
    
    const btn = document.querySelector(`.sticker-tab[data-tab="${tabName}"]`);
    if (btn) btn.classList.add('active');
    
    const content = document.getElementById(`${tabName}StickersTab`);
    if (content) content.classList.add('active');
    
    // Si cambiamos a la pestaña "mis", recargar stickers por si acaso
    if (tabName === 'mis') {
        loadUserStickers();
    }
};

async function eliminarSticker(urlSticker, event) {
    event.stopPropagation();
    const user = getCurrentUser();
    if (!user) return;
    if (!confirm('¿Eliminar este sticker de tu colección?')) return;

    try {
        const userRef = stickersDb.collection('userStickers').doc(user.uid);
        await userRef.update({
            stickers: firebase.firestore.FieldValue.arrayRemove(urlSticker)
        });

        userStickersCollection = userStickersCollection.filter(url => url !== urlSticker);
        renderUserStickers();
        showToastSticker('🗑️ Sticker eliminado');
    } catch (e) {
        console.error(e);
        alert("Error al eliminar el sticker. ¿Tienes permisos?");
    }
}

async function subirStickerDesdePC(input) {
    const user = getCurrentUser();
    if (!user) {
        openLoginModalFromStickers();
        return;
    }
    
    const file = input.files[0];
    if (!file) return;

    // Validar tamaño (2MB)
    if (file.size > 2 * 1024 * 1024) {
        alert('El archivo es muy pesado. Máximo 2 MB.');
        input.value = '';
        return;
    }

    // Mostrar preview del archivo seleccionado
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
    
    // Cambiar texto del botón de subida (el label)
    const btnSubir = document.querySelector('.upload-sticker-label');
    const oldText = btnSubir.innerHTML;
    btnSubir.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Subiendo...';
    btnSubir.style.pointerEvents = 'none';

    try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('upload_preset', CLOUDINARY_PRESET);

        const response = await fetch(CLOUDINARY_URL, {
            method: 'POST',
            body: formData
        });

        const data = await response.json();
        
        if (data.secure_url) {
            // Guardar en Firestore
            await guardarStickerEnColeccion(data.secure_url);
            // Limpiar preview y input
            previewContainer.style.display = 'none';
            input.value = '';
            showToastSticker('✅ Sticker subido y guardado');
            // Cambiar a la pestaña "mis" y recargar stickers
            switchStickerTab('mis');
            // Forzar recarga de la lista
            await loadUserStickers();
        } else {
            throw new Error(data.error ? data.error.message : 'Error desconocido al subir');
        }
        
    } catch (error) {
        console.error("Error de subida:", error);
        alert("Error al subir el archivo: " + error.message);
    } finally {
        btnSubir.innerHTML = oldText;
        btnSubir.style.pointerEvents = 'auto';
    }
}

async function guardarStickerEnColeccion(url) {
    const user = getCurrentUser();
    if (!user) return;

    if (userStickersCollection.includes(url)) {
        showToastSticker('⚠️ Este sticker ya lo tienes');
        return;
    }

    try {
        const userRef = stickersDb.collection('userStickers').doc(user.uid);
        await userRef.set({
            stickers: firebase.firestore.FieldValue.arrayUnion(url)
        }, { merge: true });

        // Actualizar colección local
        if (!userStickersCollection.includes(url)) {
            userStickersCollection.push(url);
        }
        renderUserStickers();
    } catch (e) {
        console.error("Error guardando URL:", e);
        throw e;
    }
}

window.robarStickerSistema = async function(url) {
    const user = getCurrentUser();
    if (!user) {
        openLoginModalFromStickers();
        return;
    }
    
    const cleanUrl = url.trim();

    if (userStickersCollection.includes(cleanUrl)) {
        showToastSticker('⚠️ Este sticker ya lo tienes');
        return;
    }
    
    try {
        const userRef = stickersDb.collection('userStickers').doc(user.uid);
        await userRef.set({ 
            stickers: firebase.firestore.FieldValue.arrayUnion(cleanUrl) 
        }, { merge: true });

        if (!userStickersCollection.includes(cleanUrl)) {
            userStickersCollection.push(cleanUrl);
            renderUserStickers();
        }

        showToastSticker('✅ ¡Sticker robado y guardado!');
    } catch (e) {
        console.error("Error al robar sticker:", e);
        alert("Error al guardar: " + e.message);
    }
};

function updateStickersUI() {
    const user = getCurrentUser();
    const subirTab = document.getElementById('subirStickersTab');
    const contentDiv = document.querySelector('#subirStickersTab .add-sticker-container');
    const loginPrompt = document.getElementById('subirStickerLoginPrompt');

    if (subirTab && contentDiv) {
        if (!user) {
            contentDiv.style.display = 'none';
            if (loginPrompt) loginPrompt.style.display = 'flex';
        } else {
            contentDiv.style.display = 'flex';
            if (loginPrompt) loginPrompt.style.display = 'none';
        }
    }
}

function showToastSticker(msg) {
    let toast = document.getElementById('toastSticker');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toastSticker';
        toast.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#0f0f13;color:#00fff7;padding:12px 25px;border-radius:30px;z-index:1001;font-weight:bold;box-shadow:0 0 20px rgba(0,255,247,0.5); border:1px solid #00fff7;';
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

// Exponer función global para que la use el HTML
window.cargarStickersUsuario = loadUserStickers;