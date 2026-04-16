// ============================================
// SISTEMA DE STICKERS (CATBOX + FIRESTORE)
// VERSIÓN FINAL CON USERHASH Y DEPURACIÓN
// ============================================

let stickersDb = null;
let stickersAuth = null;
let userStickersCollection = [];

const DEFAULT_STICKERS = [];

// 🔐 TU USERHASH DE CATBOX
const CATBOX_USERHASH = 'd825312c9594a0a1b16c12c50';
// Por si acaso, URL de la API (oficial)
const CATBOX_API_URL = 'https://catbox.moe/user/api.php';

// --- FUNCIÓN DE LIMPIEZA ---
function cleanStickerHTML(html) {
    if (typeof DOMPurify !== 'undefined') {
        return DOMPurify.sanitize(html, {
            ALLOWED_TAGS: ['img', 'div', 'span'],
            ALLOWED_ATTR: ['src', 'class', 'alt', 'onclick', 'data-url']
        });
    }
    return html;
}

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
        if (currentUser) loadIfUserExists(currentUser);
    } else {
        auth.onAuthStateChanged(loadIfUserExists);
    }
}

function getCurrentUser() {
    return window.ArchinimeState ? window.ArchinimeState.get('currentUser') : null;
}

async function loadUserStickers() {
    const user = getCurrentUser();
    if (!user) return;
    try {
        const doc = await stickersDb.collection('userStickers').doc(user.uid).get();
        if (doc.exists && doc.data().stickers) {
            userStickersCollection = doc.data().stickers.filter(url => url && typeof url === 'string' && url.trim() !== '');
            if (userStickersCollection.length !== doc.data().stickers.length) {
                await stickersDb.collection('userStickers').doc(user.uid).set({ stickers: userStickersCollection }, { merge: true });
            }
        } else {
            userStickersCollection = [...DEFAULT_STICKERS];
            await stickersDb.collection('userStickers').doc(user.uid).set({ stickers: userStickersCollection }, { merge: true });
        }
        renderUserStickers();
    } catch (e) {
        console.error("Error cargando stickers:", e);
        const container = document.getElementById('userStickersContainer');
        if (container) container.innerHTML = '<div class="sticker-empty" style="color:#ff5555;">⚠️ Error al cargar stickers. Recarga.</div>';
    }
}

function renderUserStickers() {
    const container = document.getElementById('userStickersContainer');
    if (!container) return;
    const validStickers = userStickersCollection.filter(url => url && typeof url === 'string' && url.trim() !== '');
    if (validStickers.length === 0) {
        container.innerHTML = `
            <div class="sticker-empty-modern">
                <div class="sticker-empty-icon">🖼️</div>
                <div class="sticker-empty-title">SIN STICKERS</div>
                <div class="sticker-empty-desc">Sube imágenes o vídeos, o roba de otros comentarios.</div>
                <div class="sticker-empty-hint"><i class="fas fa-upload"></i> Ve a la pestaña "SUBIR"</div>
            </div>
        `;
        return;
    }
    
    let html = '';
    validStickers.forEach(url => {
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
    if (tabName === 'mis') loadUserStickers();
};

async function eliminarSticker(urlSticker, event) {
    event.stopPropagation();
    const user = getCurrentUser();
    if (!user) return;
    if (!confirm('¿Eliminar este sticker?')) return;
    try {
        const userRef = stickersDb.collection('userStickers').doc(user.uid);
        await userRef.update({ stickers: firebase.firestore.FieldValue.arrayRemove(urlSticker) });
        userStickersCollection = userStickersCollection.filter(url => url !== urlSticker);
        renderUserStickers();
        showToastSticker('🗑️ Sticker eliminado');
    } catch (e) {
        console.error(e);
        alert('Error al eliminar');
    }
}

// ========== SUBIDA A CATBOX CON MEJOR MANEJO DE ERRORES ==========
window.subirStickerDesdePC = async function(inputElement) {
    const user = getCurrentUser();
    if (!user) {
        openLoginModalFromStickers();
        inputElement.value = '';
        return;
    }

    const file = inputElement.files[0];
    if (!file) return;

    // Catbox permite hasta 200 MB, pero ponemos 50 MB para prudencia
    if (file.size > 50 * 1024 * 1024) {
        alert('El archivo es muy pesado. Máximo 50 MB.');
        inputElement.value = '';
        return;
    }

    // Preview local
    const previewContainer = document.getElementById('stickerPreview');
    const previewImg = document.getElementById('previewImage');
    const previewVid = document.getElementById('previewVideo');
    const isVideo = file.type.startsWith('video/');
    
    if (isVideo) {
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
    const originalText = btnSubir.innerHTML;
    btnSubir.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Subiendo a Catbox...';
    btnSubir.style.pointerEvents = 'none';
    
    try {
        const formData = new FormData();
        formData.append('reqtype', 'fileupload');
        formData.append('userhash', CATBOX_USERHASH);
        formData.append('fileToUpload', file);

        console.log('📤 Enviando archivo a Catbox:', file.name, file.size);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 segundos timeout

        const uploadRes = await fetch(CATBOX_API_URL, {
            method: 'POST',
            body: formData,
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);

        console.log('📡 Respuesta HTTP:', uploadRes.status);
        
        if (!uploadRes.ok) {
            throw new Error(`Error HTTP ${uploadRes.status}`);
        }

        const responseText = await uploadRes.text();
        console.log('📦 Respuesta de Catbox:', responseText);

        // Catbox devuelve la URL directa si todo fue bien, o un mensaje de error
        if (responseText && responseText.startsWith('http')) {
            await guardarStickerEnColeccion(responseText);
            
            previewContainer.style.display = 'none';
            inputElement.value = '';
            showToastSticker('✅ Sticker subido exitosamente');
            
            window.switchStickerTab('mis');
            await loadUserStickers();
        } else {
            // Posibles errores conocidos:
            // "No file uploaded" -> el archivo no se envió correctamente
            // "Invalid userhash" -> el userhash no es válido
            // "File too large" -> excede límite
            throw new Error(responseText || 'Error desconocido de Catbox');
        }
    } catch (error) {
        console.error('❌ Error en subida:', error);
        
        let mensaje = 'Error al subir el archivo. ';
        if (error.name === 'AbortError') {
            mensaje += 'La subida tardó demasiado. Intenta con un archivo más pequeño o verifica tu conexión.';
        } else if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
            mensaje += 'Problema de conexión con Catbox. Es posible que esté bloqueado por CORS. Intenta recargar la página.';
        } else if (error.message.includes('Invalid userhash')) {
            mensaje += 'El userhash de Catbox no es válido. Contacta al administrador.';
        } else if (error.message.includes('No file uploaded')) {
            mensaje += 'No se pudo enviar el archivo. Intenta de nuevo.';
        } else {
            mensaje += error.message;
        }
        
        alert(mensaje);
        previewContainer.style.display = 'none';
        inputElement.value = '';
    } finally {
        btnSubir.innerHTML = originalText;
        btnSubir.style.pointerEvents = 'auto';
    }
};

async function guardarStickerEnColeccion(url) {
    const user = getCurrentUser();
    if (!user) return;
    if (userStickersCollection.includes(url)) {
        showToastSticker('⚠️ Este sticker ya lo tienes');
        return;
    }
    try {
        const userRef = stickersDb.collection('userStickers').doc(user.uid);
        await userRef.set({ stickers: firebase.firestore.FieldValue.arrayUnion(url) }, { merge: true });
        userStickersCollection.push(url);
        renderUserStickers();
    } catch (e) {
        console.error('Error guardando URL:', e);
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
        await userRef.set({ stickers: firebase.firestore.FieldValue.arrayUnion(cleanUrl) }, { merge: true });
        if (!userStickersCollection.includes(cleanUrl)) {
            userStickersCollection.push(cleanUrl);
            renderUserStickers();
        }
        showToastSticker('✅ ¡Sticker robado y guardado!');
    } catch (e) {
        console.error('Error al robar sticker:', e);
        alert('Error al guardar: ' + e.message);
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

window.cargarStickersUsuario = loadUserStickers;