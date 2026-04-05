// ============================================
// SISTEMA DE STICKERS (CLOUDINARY + FIRESTORE ARRAY UNION)
// ============================================

let stickersDb = null;
let stickersAuth = null;
let stickersCurrentUser = null;
let userStickersCollection = [];

// ⚙️ CONFIGURACIÓN DE CLOUDINARY
const CLOUDINARY_URL = 'https://api.cloudinary.com/v1_1/dbcqcai1q/upload';
const CLOUDINARY_PRESET = 'stickers_archinime';

// Stickers por defecto (Cuenta en 0)
const DEFAULT_STICKERS = [];

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
        const doc = await stickersDb.collection('userStickers').doc(stickersCurrentUser.uid).get();
        if (doc.exists && doc.data().stickers) {
            // SOLUCIÓN BUG "STICKERS FANTASMAS": Filtro súper agresivo para eliminar espacios en blanco, nulls o rutas rotas.
            userStickersCollection = doc.data().stickers.filter(url => url && typeof url === 'string' && url.trim() !== '');
            
            // Si después de limpiar el array quedó diferente a la base de datos original, actualizamos Firebase para limpiarlo permanentemente
            if(userStickersCollection.length !== doc.data().stickers.length) {
                await stickersDb.collection('userStickers').doc(stickersCurrentUser.uid).set({
                    stickers: userStickersCollection
                }, { merge: true });
            }
        } else {
            userStickersCollection = [...DEFAULT_STICKERS];
            await stickersDb.collection('userStickers').doc(stickersCurrentUser.uid).set({
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
    validStickers.forEach((url) => {
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
    
    try {
        const userRef = stickersDb.collection('userStickers').doc(stickersCurrentUser.uid);
        await userRef.update({
            stickers: firebase.firestore.FieldValue.arrayRemove(urlSticker)
        });
        
        userStickersCollection = userStickersCollection.filter(url => url !== urlSticker);
        renderUserStickers();
        showToastSticker('🗑️ Sticker eliminado');

    } catch (e) {
        console.error(e);
        alert("Error al eliminar el sticker de la base de datos.");
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
        const formData = new FormData();
        formData.append('file', file);
        formData.append('upload_preset', CLOUDINARY_PRESET);
        
        const response = await fetch(CLOUDINARY_URL, {
            method: 'POST',
            body: formData
        });
        const data = await response.json();
        
        if (data.secure_url) {
            await guardarStickerEnColeccion(data.secure_url);
            previewContainer.style.display = 'none';
            input.value = '';
            showToastSticker('✅ Archivo subido y guardado exitosamente');
            switchStickerTab('mis');
        } else {
            throw new Error(data.error ? data.error.message : 'Error desconocido al subir');
        }
        
    } catch (error) {
        console.error("Error de subida:", error);
        alert("Error al subir el archivo: Revisa tu conexión a internet o configuración.");
    } finally {
        btnSubir.innerHTML = oldText;
        btnSubir.style.pointerEvents = 'auto';
    }
}

async function guardarStickerEnColeccion(url) {
    if (!stickersCurrentUser) return;
    if (userStickersCollection.includes(url)) {
        showToastSticker('⚠️ Este sticker ya lo tienes');
        return;
    }

    try {
        const userRef = stickersDb.collection('userStickers').doc(stickersCurrentUser.uid);
        await userRef.set({
            stickers: firebase.firestore.FieldValue.arrayUnion(url)
        }, { merge: true });
        
        userStickersCollection.push(url);
        renderUserStickers();
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
    if (userStickersCollection.includes(cleanUrl)) {
        showToastSticker('⚠️ Este sticker ya lo tienes');
        return;
    }
    
    try {
        const userRef = stickersDb.collection('userStickers').doc(stickersCurrentUser.uid);
        await userRef.set({ 
            stickers: firebase.firestore.FieldValue.arrayUnion(cleanUrl) 
        }, { merge: true });
        
        if (!userStickersCollection.includes(cleanUrl)) {
            userStickersCollection.push(cleanUrl);
            renderUserStickers();
        }

        showToastSticker('✅ ¡Sticker robado y guardado permanentemente!');
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