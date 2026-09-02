// ============================================
// CONFIGURACIÓN FIRESTORE
// ============================================
const firebaseConfig = {
    apiKey: "AIzaSyBpzYARIxaJijLbbL-2S6F9MWecbAbvK_I",
    authDomain: "login-admin-archinime.firebaseapp.com",
    projectId: "login-admin-archinime",
    storageBucket: "login-admin-archinime.firebasestorage.app",
    messagingSenderId: "938164660242",
    appId: "1:938164660242:web:648e0dce0e0d18dd78d0cb"
};

const ALLOWED_USERS = [
    "archinime12@gmail.com", 
    "alejandroarchi12@gmail.com",
    "lucioguapofeo@gmail.com",
];

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
auth.setPersistence(firebase.auth.Auth.Persistence.SESSION);

let isEditMode = false;
let currentEditingId = null;
let cachedIndex = [];
let searchTimeout = null;
let previewTimeout = null;
let originalAnimeState = null;

let currentUserNick = "Usuario"; 
let currentUserAvatar = "Logo_Archinime.avif";
let currentUserEmail = "";
let currentUserUid = "";
let currentSearchMode = 'mine';

// ============================================
// AUTENTICACIÓN (GitHub)
// ============================================
auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUserUid = user.uid;
        await checkAccess(user);
    } else {
        showLogin();
    }
});

function signInWithGitHub() {
    const provider = new firebase.auth.GithubAuthProvider();
    auth.setPersistence(firebase.auth.Auth.Persistence.SESSION)
        .then(() => auth.signInWithPopup(provider))
        .catch((error) => {
            console.error(error);
            const errEl = document.getElementById('errorText');
            if(errEl) errEl.innerText = error.message;
            const logErr = document.getElementById('loginError');
            if(logErr) logErr.style.display = 'block';
        });
}

async function checkAccess(user) {
    const email = user.email;
    currentUserEmail = email;
    currentUserUid = user.uid;
    const errText = document.getElementById('errorText');
    if(errText) errText.innerText = "Verificando base de datos...";
    const logErr = document.getElementById('loginError');
    if(logErr) logErr.style.display = 'none';
    
    try {
        const userDoc = await db.collection('users').doc(currentUserUid).get();
        if (userDoc.exists) {
            const userData = userDoc.data();
            currentUserNick = userData.nick;
            currentUserAvatar = userData.avatar || "Logo_Archinime.avif";
            showCMS();
        } 
        else if (ALLOWED_USERS.includes(email)) {
            currentUserNick = email === "archinime12@gmail.com" ? "Archinime" : email.split('@')[0];
            currentUserAvatar = user.photoURL || "Logo_Archinime.avif";
            await db.collection('users').doc(currentUserUid).set({
                nick: currentUserNick,
                avatar: currentUserAvatar,
                social: "",
                email: email
            });
            showCMS();
        }
        else {
            showProfileSetup();
        }
    } catch (e) {
        console.error("Error acceso:", e);
        if(errText) errText.innerText = "Error al verificar usuario.";
        if(logErr) logErr.style.display = 'block';
    }
}

function showProfileSetup() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('userHeader').style.display = 'none';
    document.getElementById('cmsContent').style.display = 'none';
    document.getElementById('profileSetupModal').style.display = 'flex';
    document.getElementById('modalTitle').innerText = "Bienvenido/a";
    document.getElementById('modalDesc').innerText = "Es tu primera vez aquí. Configura tu cuenta para continuar.";
    document.getElementById('btnSaveProfile').innerText = 'GUARDAR PERFIL';
    const btnCancel = document.getElementById('btnCancelProfile');
    if(btnCancel) btnCancel.style.display = 'none';
    
    const user = auth.currentUser;
    if(user) {
        document.getElementById('setupNick').value = "";
        if(user.photoURL) {
            document.getElementById('setupAvatar').value = user.photoURL;
            document.getElementById('setupAvatarPreview').src = user.photoURL;
        }
    }
}

function closeProfileModal() {
    document.getElementById('profileSetupModal').style.display = 'none';
}

function openProfileEditor() {
    document.getElementById('profileSetupModal').style.display = 'flex';
    document.getElementById('modalTitle').innerText = "Editar Perfil";
    document.getElementById('modalDesc').innerText = "Actualiza tu nombre o red social.";
    document.getElementById('btnSaveProfile').innerText = 'ACTUALIZAR DATOS';
    const btnCancel = document.getElementById('btnCancelProfile');
    if(btnCancel) btnCancel.style.display = 'block';
    
    db.collection('users').doc(currentUserUid).get().then(doc => {
        if(doc.exists) {
            const data = doc.data();
            document.getElementById('setupNick').value = data.nick;
            document.getElementById('setupAvatar').value = data.avatar;
            document.getElementById('setupAvatarPreview').src = data.avatar;
            document.getElementById('setupSocial').value = data.social || "";
        } else {
            document.getElementById('setupNick').value = currentUserNick;
            document.getElementById('setupAvatar').value = currentUserAvatar;
            document.getElementById('setupAvatarPreview').src = currentUserAvatar;
        }
    });
}

function updateProfilePreview(input) {
    const img = document.getElementById('setupAvatarPreview');
    if(input.value) img.src = input.value;
    else img.src = "Logo_Archinime.avif";
}

async function saveUserProfile() {
    const nick = document.getElementById('setupNick').value.trim();
    const avatar = document.getElementById('setupAvatar').value.trim();
    const social = document.getElementById('setupSocial').value.trim();
    const logEl = document.getElementById('profileLog');
    const btn = document.getElementById('btnSaveProfile');
    
    if(!nick) { alert("Debes elegir un nombre de usuario."); return; }
    if(!avatar) { alert("Debes colocar una URL de avatar."); return; }

    if (nick.toLowerCase().includes("archinime")) {
        if (currentUserEmail !== "archinime12@gmail.com") {
             alert("El nombre 'Archinime' está reservado y no puede ser utilizado.");
             return;
        }
    }

    const usersSnapshot = await db.collection('users').get();
    let isTaken = false;
    usersSnapshot.forEach(doc => {
        const data = doc.data();
        if (data.nick && data.nick.toLowerCase() === nick.toLowerCase() && doc.id !== currentUserUid) {
            isTaken = true;
        }
    });
    if (isTaken) {
        alert("Este nombre ya ha sido registrado, elige otro por favor.");
        return;
    }

    btn.disabled = true;
    logEl.innerText = "Guardando perfil en Firestore...";
    try {
        await db.collection('users').doc(currentUserUid).set({
            nick: nick,
            avatar: avatar,
            social: social,
            email: currentUserEmail
        }, { merge: true });
        currentUserNick = nick;
        currentUserAvatar = avatar;

        logEl.innerText = "¡Perfil actualizado! Entrando...";
        setTimeout(() => {
            document.getElementById('profileSetupModal').style.display = 'none';
            btn.disabled = false;
            logEl.innerText = "";
            showCMS();
        }, 1000);
    } catch(e) {
        console.error(e);
        logEl.innerText = "Error al guardar perfil.";
        btn.disabled = false;
    }
}

function showCMS() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('userHeader').style.display = 'flex';
    document.getElementById('cmsContent').style.display = 'grid';
    document.getElementById('userAvatarImg').src = currentUserAvatar;
    document.getElementById('userNameDisplay').innerText = currentUserNick;
    
    injectStateSelect();
    injectFinalBlock();
    injectAiringToggle();
}

function showLogin() {
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('userHeader').style.display = 'none';
    document.getElementById('cmsContent').style.display = 'none';
    document.getElementById('profileSetupModal').style.display = 'none';
}

function logout() {
    auth.signOut().then(() => location.reload());
}

// ============================================
// FUNCIONES DE INTERFAZ
// ============================================

function injectStateSelect() {
    if(document.getElementById('estadoAnime')) return;
    const genresContainer = document.getElementById('genresContainer');
    if(!genresContainer) return;

    const wrapper = document.createElement('div');
    wrapper.style.marginBottom = "25px";
    wrapper.innerHTML = `
        <h2><i class="fas fa-fire"></i> Estado del Anime</h2>
        <select id="estadoAnime" onchange="requestPreviewUpdate()">
            <option value="ESTRENO 🚨" selected>ESTRENO 🚨</option>
            <option value="NUEVO 🔥">NUEVO 🔥</option>
            <option value="PRÓXIMAMENTE ⏳">PRÓXIMAMENTE ⏳</option>
            <option value="Ninguna">Ninguna</option>
        </select>
    `;
    genresContainer.parentNode.insertBefore(wrapper, genresContainer);
    const sel = document.getElementById('estadoAnime');
    sel.style.width = "100%";
    sel.style.padding = "14px 16px";
    sel.style.background = "#181920";
    sel.style.border = "1px solid #2a2b35";
    sel.style.color = "white";
    sel.style.borderRadius = "12px";
    sel.style.fontSize = "16px";
    sel.style.appearance = "none";
    sel.style.backgroundImage = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%238b8d96'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E\")";
    sel.style.backgroundRepeat = "no-repeat";
    sel.style.backgroundPosition = "right 15px center";
    sel.style.backgroundSize = "16px";
}

// ---- Toggle "Finalizado" ----
function injectFinalBlock() {
    if(document.getElementById('finalToggle')) return;
    const musicContainer = document.getElementById('musicContainer');
    if(!musicContainer) return;
    const parent = musicContainer.parentNode;
    const musicHeader = musicContainer.previousElementSibling;
    const wrapper = document.createElement('div');
    wrapper.style.marginBottom = "25px";
    wrapper.style.padding = "20px";
    wrapper.style.background = "#131419";
    wrapper.style.borderRadius = "16px";
    wrapper.style.border = "1px solid #2a2b35";
    wrapper.style.display = "flex";
    wrapper.style.alignItems = "center";
    wrapper.style.justifyContent = "space-between";
    wrapper.innerHTML = `
        <div style="font-weight:700; color:#fff; display:flex; align-items:center; gap:10px;">
            <i class="fas fa-flag-checkered" style="color:var(--accent)"></i> MARCAR COMO FINAL
        </div>
        <label class="switch" style="margin:0; width:auto; background:none; border:none;">
            <input type="checkbox" id="finalToggle">
            <span class="slider round" style="position:relative; display:inline-block; width:50px; height:26px; background-color:#333; border-radius:34px; transition:.4s;">
                <span style="position:absolute; content:''; height:20px; width:20px; left:3px; bottom:3px; background-color:white; border-radius:50%; transition:.4s;" id="sliderCircle"></span>
            </span>
        </label>
    `;
    const checkbox = wrapper.querySelector('#finalToggle');
    checkbox.addEventListener('change', () => {
        syncToggles(true);
        requestPreviewUpdate();
    });
    if (musicHeader && musicHeader.tagName === 'H2') {
        parent.insertBefore(wrapper, musicHeader);
    } else {
        parent.insertBefore(wrapper, musicContainer);
    }
}

// ---- Toggle "En Emisión" ----
function injectAiringToggle() {
    if(document.getElementById('airingToggle')) return;
    const finalBlock = document.querySelector('#finalToggle')?.closest('div[style*="margin-bottom: 25px;"]');
    if(!finalBlock) return;

    const wrapper = document.createElement('div');
    wrapper.style.marginBottom = "25px";
    wrapper.style.padding = "20px";
    wrapper.style.background = "#131419";
    wrapper.style.borderRadius = "16px";
    wrapper.style.border = "1px solid #2a2b35";
    wrapper.style.display = "flex";
    wrapper.style.alignItems = "center";
    wrapper.style.justifyContent = "space-between";
    wrapper.innerHTML = `
        <div style="font-weight:700; color:#fff; display:flex; align-items:center; gap:10px;">
            <i class="fas fa-broadcast" style="color:#ffaa00;"></i> EN EMISIÓN
        </div>
        <label class="switch" style="margin:0; width:auto; background:none; border:none;">
            <input type="checkbox" id="airingToggle">
            <span class="slider round" style="position:relative; display:inline-block; width:50px; height:26px; background-color:#333; border-radius:34px; transition:.4s;">
                <span style="position:absolute; content:''; height:20px; width:20px; left:3px; bottom:3px; background-color:white; border-radius:50%; transition:.4s;" id="airingSliderCircle"></span>
            </span>
        </label>
    `;
    const checkbox = wrapper.querySelector('#airingToggle');
    checkbox.addEventListener('change', () => {
        syncToggles(true);
        requestPreviewUpdate();
    });
    finalBlock.parentNode.insertBefore(wrapper, finalBlock.nextSibling);
}

// ============================================
// FUNCIÓN CENTRAL DE SINCRONIZACIÓN DE TOGGLES (EXCLUSIVIDAD)
// ============================================
function syncToggles(applyExclusivity = true) {
    const finalCheckbox = document.getElementById('finalToggle');
    const airingCheckbox = document.getElementById('airingToggle');
    if (!finalCheckbox || !airingCheckbox) return;

    const finalSlider = finalCheckbox.closest('.switch')?.querySelector('.slider');
    const finalCircle = document.getElementById('sliderCircle');
    if (finalSlider) {
        finalSlider.style.backgroundColor = finalCheckbox.checked ? "#00f0ff" : "#333";
    }
    if (finalCircle) {
        finalCircle.style.transform = finalCheckbox.checked ? "translateX(24px)" : "translateX(0)";
    }

    const airingSlider = airingCheckbox.closest('.switch')?.querySelector('.slider');
    const airingCircle = document.getElementById('airingSliderCircle');
    if (airingSlider) {
        airingSlider.style.backgroundColor = airingCheckbox.checked ? "#ffaa00" : "#333";
    }
    if (airingCircle) {
        airingCircle.style.transform = airingCheckbox.checked ? "translateX(24px)" : "translateX(0)";
    }

    if (applyExclusivity) {
        if (finalCheckbox.checked && airingCheckbox.checked) {
            airingCheckbox.checked = false;
            if (airingSlider) {
                airingSlider.style.backgroundColor = "#333";
            }
            if (airingCircle) {
                airingCircle.style.transform = "translateX(0)";
            }
        }
    }
}

const genresList = [
    "Acción", "Animación", "Antihéroe", "Artes Marciales", "Aventura", "Cambio de género", "Ciencia ficción", "Cocina", "Comedia", 
    "Comedia oscura", "Coming-of-age", "Cosplay", "Crimen", "Cyberpunk", "Deducción Social", "Deportivo", 
    "Divulgación Científica", "Drama", "Ecchi", "Espionaje", "Escolar", "Fantasía", 
    "Fantasía oscura", "Familiar", "Gag", "Gore", "Harem", "Hentai", "Histórico", 
    "Horror", "Incesto", "Infantil", "Isekai", "Isekai Inverso", "Kaiju", "Mahō Shōjo", 
    "Mecha", "Militar", "Mitología", "Misterio", "Musical", "Nekketsu", "Parodia", 
    "Policial", "Post-apocalíptico", "Psicológico", "Reverse Harem", "Romance", "RPG", 
    "Slice of Life", "Sobrenatural", "Steampunk", "Superhéroes", "Survival", 
    "Survival Game", "Suspenso", "Tentáculos", "Terror", "Terror psicológico", "Thriller", 
    "Thriller psicológico", "Tokusatsu", "Tragedia", "Venganza", "VRMMO", "Yankī", "Yaoi", "Yuri"
];
const gContainer = document.getElementById('genresContainer');
genresList.forEach(g => {
    const label = document.createElement('label');
    label.innerHTML = `<input type="checkbox" value="${g}" onchange="requestPreviewUpdate()"> ${g}`;
    gContainer.appendChild(label);
});

function showToast(msg, isError = false) {
    const x = document.getElementById("toast");
    if(!x) return;
    x.innerHTML = isError ?
 `<i class="fas fa-times-circle" style="color:#ff4757"></i> ${msg}` : `<i class="fas fa-check-circle" style="color:var(--accent)"></i> ${msg}`;
    x.className = "show";
    x.style.borderColor = isError ? "#ff4757" : "var(--accent)";
    setTimeout(() => { x.className = x.className.replace("show", ""); }, 4000);
}

function autoCap(input) {
    if(input.value) input.value = input.value.charAt(0).toUpperCase() + input.value.slice(1);
}

function validate(input) {
    if(!input.value.trim()) input.style.borderColor = '#ff4757';
    else input.style.borderColor = '#2a2b35';
}

function log(msg) {
    const el = document.getElementById('statusLog');
    if(!el) return;
    el.style.display = 'block';
    el.innerHTML += `> ${msg}<br>`;
    el.scrollTop = el.scrollHeight;
}

// ========== Función: Extraer URL de un iframe ==========
function extractUrlFromIframe(value) {
    if (!value || typeof value !== 'string') return null;
    const iframeRegex = /<iframe[^>]*src=["']([^"']+)["'][^>]*>/i;
    const match = value.match(iframeRegex);
    if (match && match[1]) {
        return match[1];
    }
    return null;
}

// ============================================================
// FUNCIÓN smartLinkConvert ACTUALIZADA (nuevas reglas hubu.cloud y doodstream)
// ============================================================
function smartLinkConvert(input) {
    let val = input.value.trim();
    let changed = false;

    const extractedUrl = extractUrlFromIframe(val);
    if (extractedUrl) {
        input.value = extractedUrl;
        val = extractedUrl;
        changed = true;
        showToast("✅ Iframe convertido a enlace directo", false);
    }

    if (val.includes('http://10.22.7.119:8080')) {
        input.value = val.replace('http://10.22.7.119:8080', 'https://fsb-latest-gdv3.onrender.com');
        changed = true;
        showToast("Link local convertido a Render");
    }
    if (val.includes('dropbox.com') && val.endsWith('&dl=0')) {
        input.value = val.replace('&dl=0', '&raw=1');
        changed = true;
        showToast("Link Dropbox convertido a &raw=1");
    }
    const driveRegex = /(https:\/\/drive\.google\.com\/file\/d\/[^\/]+)\/(?:view|preview)(?:\?.*)?/;
    if (driveRegex.test(val) && !val.endsWith('/preview')) {
        const match = val.match(driveRegex);
        if (match && match[1]) {
            input.value = match[1] + '/preview';
            changed = true;
            showToast("Link Drive convertido a /preview");
        }
    }
    if (/ok\.ru\/video\//i.test(val)) {
        input.value = val.replace(/ok\.ru\/video\//i, 'ok.ru/videoembed/');
        changed = true;
        showToast("Link ok.ru convertido a /videoembed/");
    }
    if (val.includes('odysee.com/') && !val.includes('odysee.com/$/embed/')) {
        input.value = val.replace(/odysee\.com\//i, 'odysee.com/$/embed/');
        changed = true;
        showToast("Link Odysee convertido a Embed");
    }
    if (val.includes('mp4upload.com') && !val.includes('embed')) {
        const parts = val.split('/');
        const code = parts[parts.length - 1].split('?')[0];
        if (code && code.length > 0) {
            const newUrl = `https://www.mp4upload.com/embed-${code}.html`;
            input.value = newUrl;
            changed = true;
            showToast("Link mp4upload convertido a embed");
        }
    }

    // ---------- NUEVAS CONVERSIONES ----------
    // 1. hubu.cloud -> ww1.hubu.cloud/file/
    if (val.includes('hubu.cloud') && !val.includes('ww1.hubu.cloud')) {
        // Reemplazar el dominio base: https://hubu.cloud/... -> https://ww1.hubu.cloud/file/...
        const newVal = val.replace(/https?:\/\/hubu\.cloud\//i, 'https://ww1.hubu.cloud/file/');
        if (newVal !== val) {
            input.value = newVal;
            changed = true;
            showToast("Link hubu.cloud convertido a ww1.hubu.cloud/file/");
        }
    }

    // 2. playmogo.com/d/ -> playmogo.com/e/
    if (val.includes('playmogo.com/d/')) {
        const newVal = val.replace(/playmogo\.com\/d\//i, 'playmogo.com/e/');
        if (newVal !== val) {
            input.value = newVal;
            changed = true;
            showToast("Link doodstream convertido a /e/");
        }
    }

    if(changed) {
        if(input.id === 'portadaAnime') {
            checkCoverVisual(input);
        } else if (input.classList.contains('m-url')) {
            updateAudioPreview(input);
        }
        requestPreviewUpdate();
    }
}

function checkCoverVisual(input) {
    const img = document.getElementById('mainCoverPreview');
    const display = document.getElementById('dimDisplay');
    if(!img || !display) return;
    const val = input.value.trim();
    if(val === "") {
        img.style.display = 'none';
        display.innerText = "";
        requestPreviewUpdate();
        return;
    }
    img.src = val;
    img.style.display = 'block';
    display.innerText = "Verificando...";
    img.onload = function() { 
        const w = this.naturalWidth;
        const h = this.naturalHeight;
        const allowed = [{w: 1000, h: 1500}, {w: 1400, h: 2100}, {w: 2000, h: 3000}, {w: 2090, h: 3135}, {w: 3412, h: 5120}];
        const isValid = allowed.some(d => d.w === w && d.h === h);
        if (isValid) {
            display.innerHTML = `<span style="color:#00ffbf"><i class="fas fa-check"></i> Válido: ${w}x${h}px</span>`;
            input.style.borderColor = '#00ffbf';
            requestPreviewUpdate(); 
        } else {
            display.innerHTML = `<span style="color:#ff4757"><i class="fas fa-times"></i> Inválido: ${w}x${h}px.</span>`;
            input.style.borderColor = '#ff4757';
        }
    };
    img.onerror = function() { 
        display.innerText = "URL inválida";
        img.style.display='none'; 
        input.style.borderColor = '#ff4757';
    };
}

function addAlias(value = "") {
    const container = document.getElementById('aliasContainer');
    const div = document.createElement('div');
    div.className = 'dynamic-item';
    div.innerHTML = `
        <input type="text" class="alias-input" placeholder="Alias..." value="${value}" oninput="requestPreviewUpdate()">
        <button class="btn-mini-del" onclick="this.parentElement.remove(); requestPreviewUpdate()"><i class="fas fa-times"></i></button>
    `;
    container.appendChild(div);
    requestPreviewUpdate();
}

function addMusic(url = "") {
    const container = document.getElementById('musicContainer');
    const div = document.createElement('div');
    div.className = 'dynamic-item';
    div.innerHTML = `
        <div class="audio-preview-box">
            <input type="text" class="m-url" value="${url}" placeholder="Audio (mp3...)" oninput="updateAudioPreview(this); requestPreviewUpdate()" onblur="smartLinkConvert(this)">
            <audio controls preload="none"></audio>
            <div class="audio-status-text"></div>
        </div>
        <button class="btn-mini-del" onclick="this.parentElement.remove(); requestPreviewUpdate()" style="height:auto; aspect-ratio:1/1"><i class="fas fa-trash"></i></button>
    `;
    container.appendChild(div);
    if(url) updateAudioPreview(div.querySelector('.m-url'));
    requestPreviewUpdate();
}

function updateAudioPreview(input) {
    const parent = input.parentElement;
    const audioEl = parent.querySelector('audio');
    const statusEl = parent.querySelector('.audio-status-text');
    if (!input.value.trim()) {
        statusEl.innerHTML = '';
        return;
    }
    statusEl.innerHTML = '<span style="color:#facc15"><i class="fas fa-circle-notch fa-spin"></i> Cargando...</span>';
    audioEl.src = input.value;
    audioEl.load();
    audioEl.onloadeddata = () => { statusEl.innerHTML = '<span style="color:#00ffbf"><i class="fas fa-check"></i> Válido</span>'; };
    audioEl.onerror = () => { statusEl.innerHTML = '<span style="color:#ff4757"><i class="fas fa-triangle-exclamation"></i> Error</span>'; };
}

const colorPalette = ['#00f0ff', '#8c52ff', '#ff0055', '#00ff9d', '#ffeb3b', '#ff9100', '#2979ff', '#e040fb'];

// ============================================================
// FUNCIÓN addSeason MODIFICADA: Se agregó "ONA" y se permite múltiples capítulos en Película
// ============================================================
function addSeason(data = null) {
    const container = document.getElementById('seasonsContainer');
    const div = document.createElement('div');
    div.className = 'season-card';
    const count = document.querySelectorAll('.season-card').length;
    const color = colorPalette[count % colorPalette.length];
    div.style.cssText = `border-left: 4px solid ${color};
 background: linear-gradient(120deg, ${color}11 0%, rgba(19, 20, 25, 0.9) 35%);`;
    div.innerHTML = `
        <div class="card-controls">
            <button class="btn-move" onclick="moveSeason(this, -1)" title="Mover Atrás/Arriba"><i class="fas fa-arrow-up"></i></button>
            <button class="btn-move" onclick="moveSeason(this, 1)" title="Mover Adelante/Abajo"><i class="fas fa-arrow-down"></i></button>
            <button class="btn-del-section" onclick="removeSeasonBlock(this)"><i class="fas fa-trash"></i> ELIMINAR</button>
        </div>
        <div class="row-flex">
            <div class="col-flex">
                <label>Tipo</label>
                <select class="s-type" onchange="handleSeasonTypeChange(this)">
                    <option value="" disabled ${!data ? 'selected' : ''}>Seleccionar...</option>
                    <option value="Temporada">Temporada</option>
                    <option value="Pelicula">Película</option>
                    <option value="OVA">OVA</option>
                    <option value="ONA">ONA</option>
                    <option value="Especial">Especial</option>
                    <option value="Spin-Off">Spin-Off</option>
                    <option value="Tráiler">Tráiler</option>
                </select>
            </div>
            <div class="col-flex">
                 <label>Nombre Bloque</label>
                 <input type="text" class="s-name" placeholder="Nombre (opcional)" oninput="requestPreviewUpdate()">
            </div>
        </div>
        <label>Poster Bloque</label>
        <input type="text" class="s-img" placeholder="https://..." oninput="requestPreviewUpdate()" onblur="smartLinkConvert(this)">
        <div class="row-flex">
            <div class="col-flex">
                <label>Cant. Capítulos</label>
                <input type="number" class="s-count" min="1" onchange="renderChapters(this); checkAutoState();">
            </div>
            <div class="col-flex">
                <label>Numeración</label>
                <select class="s-start-index" onchange="renderChapters(this)">
                    <option value="1" selected>Desde Cap 1</option>
                    <option value="0">Desde Cap 0</option>
                </select>
            </div>
        </div>
        <div class="chapters-grid" style="margin-top:20px;"></div>
    `;
    container.appendChild(div);

    if(data) {
        let selectedType = data.type;
        if (!selectedType) {
            if(data.name.startsWith('Temporada')) selectedType = 'Temporada';
            else if(data.name.startsWith('Película')) selectedType = 'Pelicula';
            else if(data.name.startsWith('OVA')) selectedType = 'OVA';
            else if(data.name.startsWith('ONA')) selectedType = 'ONA';
            else if(data.name.startsWith('Especial')) selectedType = 'Especial';
            else if(data.name.startsWith('Tráiler')) selectedType = 'Tráiler';
            else selectedType = 'Spin-Off';
        }
        const typeSel = div.querySelector('.s-type');
        typeSel.value = selectedType;
        const nameInp = div.querySelector('.s-name');
        nameInp.value = data.name;
        div.querySelector('.s-img').value = data.cover;
        handleSeasonTypeChange(typeSel);
        
        const startSel = div.querySelector('.s-start-index');
        if(data.eps && data.eps.length > 0) {
            const firstTitle = data.eps[0].title || "";
            if(firstTitle.includes(" 0") || firstTitle.includes("Capítulo 0")) startSel.value = "0";
            else startSel.value = "1";
        }
        const countInp = div.querySelector('.s-count');
        countInp.value = data.eps.length;
        renderChapters(countInp, data.eps);
    }
    updateAllBlockNames();
    requestPreviewUpdate();
    checkAutoState();
}

// ---- handleSeasonTypeChange (modificado: Película ya no deshabilita el contador) ----
function handleSeasonTypeChange(select) {
    const card = select.closest('.season-card');
    const countInput = card.querySelector('.s-count');
    // Ya no deshabilitamos el contador para Película
    countInput.disabled = false;
    updateAllBlockNames();
    if(countInput.value) renderChapters(countInput);
    checkAutoState();
    requestPreviewUpdate();
}

function checkAutoState() {
    const stateSel = document.getElementById('estadoAnime');
    if(!stateSel) return;
    let totalCaps = 0;
    document.querySelectorAll('.s-count').forEach(inp => {
        const val = parseInt(inp.value);
        if(!isNaN(val) && !inp.disabled) totalCaps += val;
        if(inp.disabled) totalCaps += 1;
    });
    if (stateSel.value !== 'PRÓXIMAMENTE ⏳' && stateSel.value !== 'Ninguna') {
        if (totalCaps === 1) stateSel.value = "ESTRENO 🚨";
        else if (totalCaps > 1) stateSel.value = "NUEVO 🔥";
    }
}

function moveSeason(btn, direction) {
    const card = btn.closest('.season-card');
    const container = document.getElementById('seasonsContainer');
    if (direction === -1) {
        if (card.previousElementSibling) container.insertBefore(card, card.previousElementSibling);
    } else {
        if (card.nextElementSibling) container.insertBefore(card, card.nextElementSibling.nextElementSibling);
    }
    updateAllBlockNames();
    document.querySelectorAll('.season-card').forEach((c, idx) => {
        const color = colorPalette[idx % colorPalette.length];
        c.style.borderLeftColor = color;
        c.style.background = `linear-gradient(120deg, ${color}11 0%, rgba(19, 20, 25, 0.9) 35%)`;
    });
    requestPreviewUpdate();
}

function removeSeasonBlock(btn) {
    btn.closest('.season-card').remove();
    updateAllBlockNames();
    checkAutoState();
    requestPreviewUpdate();
    document.querySelectorAll('.season-card').forEach((card, idx) => {
        const color = colorPalette[idx % colorPalette.length];
        card.style.borderLeftColor = color;
        card.style.background = `linear-gradient(120deg, ${color}11 0%, rgba(19, 20, 25, 0.9) 35%)`;
    });
}

// ============================================================
// FUNCIÓN updateAllBlockNames (agregado soporte para ONA)
// ============================================================
function updateAllBlockNames() {
    const cards = document.querySelectorAll('.season-card');
    let tempCount = 0, movieCount = 0, ovaCount = 0, onaCount = 0, specialCount = 0, spinOffCount = 0, trailerCount = 0;
    cards.forEach(card => {
        const typeSelect = card.querySelector('.s-type');
        const nameInput = card.querySelector('.s-name');
        const type = typeSelect.value;
        if (!type) return;

        if (nameInput.value.trim() === "") {
            if (type === 'Temporada') { tempCount++; nameInput.value = `Temporada ${tempCount}`; }
            else if (type === 'Pelicula') { movieCount++; nameInput.value = `Película ${movieCount}`; }
            else if (type === 'OVA') { ovaCount++; nameInput.value = `OVA ${ovaCount}`; }
            else if (type === 'ONA') { onaCount++; nameInput.value = `ONA ${onaCount}`; }
            else if (type === 'Especial') { specialCount++; nameInput.value = `Especial ${specialCount}`; }
            else if (type === 'Spin-Off') { spinOffCount++; nameInput.value = `Spin-Off ${spinOffCount}`; }
            else if (type === 'Tráiler') { trailerCount++; nameInput.value = `Tráiler ${trailerCount}`; }
        } else {
            if (type === 'Temporada') tempCount++;
            else if (type === 'Pelicula') movieCount++;
            else if (type === 'OVA') ovaCount++;
            else if (type === 'ONA') onaCount++;
            else if (type === 'Especial') specialCount++;
            else if (type === 'Spin-Off') spinOffCount++;
            else if (type === 'Tráiler') trailerCount++;
        }
    });
}

// ============================================
// NUEVA FUNCIÓN AUXILIAR PARA ESCAPAR HTML
// ============================================
function escapeHtml(str) {
    if(!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if(m === '&') return '&amp;';
        if(m === '<') return '&lt;';
        if(m === '>') return '&gt;';
        return m;
    }).replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, function(c) {
        return c;
    });
}

// ============================================
// NUEVA FUNCIÓN PARA AGREGAR PARTE A UN CAPÍTULO (MÚLTIPLES PARTES) - AHORA SOPORTA 4 OPCIONES
// ============================================
window.addPartToChapter = function(btn, type) {
    const row = btn.closest('.chapter-row');
    let container;
    let inputClass;
    let placeholderBase;
    switch(type) {
        case 'lat':
            container = row.querySelector('.latino-parts-container');
            inputClass = 'c-link-lat-part';
            placeholderBase = 'Parte (Latino)';
            break;
        case 'sub':
            container = row.querySelector('.sub-parts-container');
            inputClass = 'c-link-sub-part';
            placeholderBase = 'Parte (Opción 2)';
            break;
        case 'op3':
            container = row.querySelector('.op3-parts-container');
            inputClass = 'c-link-op3-part';
            placeholderBase = 'Parte (Opción 3)';
            break;
        case 'op4':
            container = row.querySelector('.op4-parts-container');
            inputClass = 'c-link-op4-part';
            placeholderBase = 'Parte (Opción 4)';
            break;
        default:
            return;
    }
    const partCount = container.children.length + 1;
    const div = document.createElement('div');
    div.className = 'part-input-group';
    div.style.display = 'flex';
    div.style.gap = '5px';
    div.style.marginBottom = '5px';
    div.innerHTML = `
        <input type="text" class="${inputClass}" placeholder="${placeholderBase} ${partCount}" oninput="requestPreviewUpdate()" onblur="smartLinkConvert(this)" style="flex:1">
        <button type="button" class="btn-mini-del" onclick="this.parentElement.remove(); requestPreviewUpdate()" style="width:auto; padding:0 10px;">✖</button>
    `;
    container.appendChild(div);
    requestPreviewUpdate();
};

// ============================================
// FUNCIÓN RENDER CHAPTERS (MODIFICADA PARA MÚLTIPLES PARTES Y TIPOS) - AHORA CON 4 OPCIONES
// ============================================
function renderChapters(input, existingEps = []) {
    const card = input.closest('.season-card');
    const typeSelect = card.querySelector('.s-type');
    const type = typeSelect ? typeSelect.value : "";
    const countInput = card.querySelector('.s-count');
    const count = parseInt(countInput.value);
    const startSel = card.querySelector('.s-start-index');
    const startNum = startSel ? parseInt(startSel.value) : 1;
    const list = card.querySelector('.chapters-grid');
    
    let currentData = [];
    if(existingEps.length === 0) {
        card.querySelectorAll('.chapter-row').forEach(row => {
            const latParts = [];
            row.querySelectorAll('.c-link-lat-part').forEach(inp => latParts.push(inp.value));
            const subParts = [];
            row.querySelectorAll('.c-link-sub-part').forEach(inp => subParts.push(inp.value));
            const op3Parts = [];
            row.querySelectorAll('.c-link-op3-part').forEach(inp => op3Parts.push(inp.value));
            const op4Parts = [];
            row.querySelectorAll('.c-link-op4-part').forEach(inp => op4Parts.push(inp.value));
            currentData.push({
                lat: latParts,
                sub: subParts,
                op3: op3Parts,
                op4: op4Parts,
                title: row.querySelector('.c-title-ov').value
            });
        });
    }
    list.innerHTML = '';
    if(isNaN(count) || count < 1) return;
    
    for(let i=0; i<count; i++) {
        const row = document.createElement('div');
        row.className = 'chapter-row';
        let latParts = [], subParts = [], op3Parts = [], op4Parts = [], customTitle = '';
        if(existingEps[i]) {
            latParts = Array.isArray(existingEps[i].link) ? existingEps[i].link : (existingEps[i].link ? [existingEps[i].link] : []);
            subParts = Array.isArray(existingEps[i].link2) ? existingEps[i].link2 : (existingEps[i].link2 ? [existingEps[i].link2] : []);
            op3Parts = Array.isArray(existingEps[i].link3) ? existingEps[i].link3 : (existingEps[i].link3 ? [existingEps[i].link3] : []);
            op4Parts = Array.isArray(existingEps[i].link4) ? existingEps[i].link4 : (existingEps[i].link4 ? [existingEps[i].link4] : []);
            if(!['Temporada', 'Spin-Off'].includes(type)) customTitle = existingEps[i].title;
        } else if(currentData[i]) {
            latParts = currentData[i].lat || [];
            subParts = currentData[i].sub || [];
            op3Parts = currentData[i].op3 || [];
            op4Parts = currentData[i].op4 || [];
            customTitle = currentData[i].title;
        }
        let currentNum = startNum + i;
        // Para Temporada y Spin-Off el título es automático
        let titleInputDisabled = (type === 'Temporada' || type === 'Spin-Off') ? "disabled" : "";
        let titlePlaceholder = titleInputDisabled ? `Capítulo ${currentNum}` : "Nombre (ej: El viaje...)";
        if(titleInputDisabled) customTitle = `Capítulo ${currentNum}`;
        
        // Funciones auxiliares para generar HTML de partes
        function buildPartsHtml(parts, inputClass, placeholderBase) {
            if(parts.length === 0) {
                return `<div class="part-input-group"><input type="text" class="${inputClass}" placeholder="${placeholderBase} 1" oninput="requestPreviewUpdate()" onblur="smartLinkConvert(this)" style="flex:1"></div>`;
            } else {
                let html = '';
                parts.forEach((part, idx) => {
                    html += `<div class="part-input-group" style="display:flex; gap:5px; margin-bottom:5px;">
                        <input type="text" class="${inputClass}" value="${escapeHtml(part)}" placeholder="${placeholderBase} ${idx+1}" oninput="requestPreviewUpdate()" onblur="smartLinkConvert(this)" style="flex:1">
                        <button type="button" class="btn-mini-del" onclick="this.parentElement.remove(); requestPreviewUpdate()" style="width:auto; padding:0 10px;">✖</button>
                    </div>`;
                });
                return html;
            }
        }

        let latPartsHtml = buildPartsHtml(latParts, 'c-link-lat-part', 'Parte (Latino)');
        let subPartsHtml = buildPartsHtml(subParts, 'c-link-sub-part', 'Parte (Opción 2)');
        let op3PartsHtml = buildPartsHtml(op3Parts, 'c-link-op3-part', 'Parte (Opción 3)');
        let op4PartsHtml = buildPartsHtml(op4Parts, 'c-link-op4-part', 'Parte (Opción 4)');
        
        row.innerHTML = `
            <div class="chapter-header"><span class="chapter-num">CAPÍTULO ${currentNum}</span></div>
            <div style="margin-bottom:10px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                    <strong style="color:#00f0ff;">🎬 Latino (múltiples partes)</strong>
                    <button type="button" class="btn-mini-del" onclick="addPartToChapter(this, 'lat')" style="width:auto; padding:4px 12px;">+ Agregar parte</button>
                </div>
                <div class="latino-parts-container">${latPartsHtml}</div>
            </div>
            <div style="margin-bottom:10px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                    <strong style="color:#ff00cc;">📀 Opción 2 (múltiples partes)</strong>
                    <button type="button" class="btn-mini-del" onclick="addPartToChapter(this, 'sub')" style="width:auto; padding:4px 12px;">+ Agregar parte</button>
                </div>
                <div class="sub-parts-container">${subPartsHtml}</div>
            </div>
            <div style="margin-bottom:10px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                    <strong style="color:#ffaa00;">🔶 Opción 3 (múltiples partes)</strong>
                    <button type="button" class="btn-mini-del" onclick="addPartToChapter(this, 'op3')" style="width:auto; padding:4px 12px;">+ Agregar parte</button>
                </div>
                <div class="op3-parts-container">${op3PartsHtml}</div>
            </div>
            <div style="margin-bottom:10px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                    <strong style="color:#00ff9d;">🟢 Opción 4 (múltiples partes)</strong>
                    <button type="button" class="btn-mini-del" onclick="addPartToChapter(this, 'op4')" style="width:auto; padding:4px 12px;">+ Agregar parte</button>
                </div>
                <div class="op4-parts-container">${op4PartsHtml}</div>
            </div>
            <input type="text" class="c-title-ov" value="${escapeHtml(customTitle)}" ${titleInputDisabled} placeholder="${titlePlaceholder}" oninput="requestPreviewUpdate()" style="margin-top:5px; font-size:0.9em; border-color:#333; background:#111;">
        `;
        list.appendChild(row);
    }
    requestPreviewUpdate();
}

function requestPreviewUpdate() {
    if (!previewTimeout) {
        previewTimeout = requestAnimationFrame(() => {
            updateWebPreview();
            checkForChanges();
            previewTimeout = null;
        });
    }
}

function checkForChanges() {
    if (!isEditMode) return;
    const btn = document.getElementById('btnSaveAction');
    if (!originalAnimeState) return;
    const currentState = JSON.stringify(generateData());
    if (currentState !== originalAnimeState) {
        if (btn.disabled && !btn.innerHTML.includes("BLOQUEADA")) {
             btn.disabled = false;
             btn.style.opacity = "1";
             btn.innerHTML = '<i class="fas fa-cloud-arrow-up"></i> GUARDAR CAMBIOS';
        }
    } else {
        if (!btn.innerHTML.includes("BLOQUEADA")) {
            btn.disabled = true;
            btn.style.opacity = "0.5";
            btn.innerHTML = '<i class="fas fa-check"></i> Sin cambios pendientes';
        }
    }
}

// ---- VISTA PREVIA (actualizada para isAiring y Tráiler) ----
function updateWebPreview() {
    const titleEl = document.getElementById('webTitle');
    const titleVal = document.getElementById('tituloAnime').value;
    if(titleEl) titleEl.innerText = titleVal || 'Título';
    const coverUrl = document.getElementById('portadaAnime').value;
    const webCover = document.getElementById('webCover');
    if(coverUrl && webCover) webCover.src = coverUrl;
    const prevId = document.getElementById('previewId');
    if(prevId) prevId.innerText = isEditMode ? currentEditingId : "###";
    const demo = document.getElementById('demografiaAnime').value;
    const wDemo = document.getElementById('webDemography');
    if(wDemo) wDemo.innerText = demo ? demo.toUpperCase() : 'DEMO';
    const aliases = [];
    document.querySelectorAll('.alias-input').forEach(i => { if(i.value.trim()) aliases.push(i.value.trim()) });
    const prevAlias = document.getElementById('previewAliasesList');
    if(prevAlias) prevAlias.innerText = aliases.length > 0 ? aliases.join(', ') : "";
    const tagsContainer = document.getElementById('webTags');
    if(tagsContainer) {
        tagsContainer.innerHTML = '';
        document.querySelectorAll('#genresContainer input:checked').forEach(cb => {
            let s = document.createElement('span');
            s.style.cssText = "font-size:0.65em; padding:3px 8px; border-radius:4px; background:rgba(255,255,255,0.1); color:#ccc;";
            s.innerText = cb.value;
            tagsContainer.appendChild(s);
        });
    }

    // Mostrar badge de emisión en vista previa
    const airingToggle = document.getElementById('airingToggle');
    const airingBadge = document.getElementById('webAiringBadge');
    if (airingBadge) {
        if (airingToggle && airingToggle.checked) {
            airingBadge.style.display = 'inline-block';
            airingBadge.innerText = '🔴 EN EMISIÓN';
        } else {
            airingBadge.style.display = 'none';
        }
    }

    const grid = document.getElementById('webSeasonsGrid');
    if(grid) {
        grid.innerHTML = '';
        document.querySelectorAll('.season-card').forEach(card => {
            const img = card.querySelector('.s-img').value;
            const name = card.querySelector('.s-name').value;
            const type = card.querySelector('.s-type').value;
            const count = card.querySelector('.s-count').value || 0;
            if(name) {
                const div = document.createElement('div');
                div.className = 'preview-s-item';
                let label = '';
                if (type === 'Pelicula') {
                    label = `Película`;
                } else if (['Temporada', 'Spin-Off', 'Tráiler'].includes(type)) {
                    label = `${count} Caps`;
                } else {
                    label = (count > 1 ? `${count} ${type}s` : `${count} ${type}`);
                }
                div.innerHTML = `<img src="${img || 'https://via.placeholder.com/150'}"><div class="preview-s-count">${label}</div><div class="preview-s-title">${name}</div>`;
                grid.appendChild(div);
            }
        });
    }
}

// ============================================
// BÚSQUEDA Y CARGA (FIRESTORE)
// ============================================
async function openSearchModal() {
    document.getElementById('searchModal').style.display = 'flex';
    document.getElementById('searchInput').value = "";
    document.getElementById('searchResults').innerHTML = "";
    switchSearchTab('mine');
    await loadIndexForSearch();
    filterSearch();
}

function handleModalClick(event) {
    if (event.target.id === 'searchModal') closeSearchModal();
}

function closeSearchModal() { 
    document.getElementById('searchModal').style.display = 'none';
}

function switchSearchTab(mode) {
    currentSearchMode = mode;
    document.getElementById('tabMine').className = mode === 'mine' ? 'tab-btn active' : 'tab-btn';
    document.getElementById('tabGeneral').className = mode === 'general' ? 'tab-btn active' : 'tab-btn';
    if(cachedIndex.length > 0) filterSearch();
}

async function loadIndexForSearch() {
    const loading = document.getElementById('loadingSearch');
    loading.style.display = 'block';
    try {
        const snapshot = await db.collection('catalogo').get();
        cachedIndex = [];
        snapshot.forEach(doc => {
            const anime = doc.data();
            cachedIndex.push({
                id: anime.id,
                title: anime.title,
                img: anime.img,
                rating: anime.rating || 0,
                uploader: anime.uploader,
                uploaderImg: anime.uploaderImg,
                genres: anime.genres,
                isFinal: anime.isFinal,
                isAiring: anime.isAiring || false
            });
        });
        cachedIndex.sort((a,b) => b.id - a.id);
        filterSearch();
    } catch(e) {
        console.error(e);
        document.getElementById('searchResults').innerHTML = `<div style="color:red; text-align:center">Error: ${e.message}</div>`;
    } finally {
        loading.style.display = 'none';
    }
}

function filterSearch() {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => _performFilter(), 300);
}

function _performFilter() {
    const query = document.getElementById('searchInput').value.toLowerCase();
    const results = document.getElementById('searchResults');
    results.innerHTML = '';
    const filtered = cachedIndex.filter(a => {
        const matchesText = a.title.toLowerCase().includes(query);
        if (currentSearchMode === 'mine') { 
            return matchesText && (a.uploader === currentUserEmail); 
        } else { 
            return matchesText; 
        }
    }).slice(0, 1000);
    filtered.forEach(anime => {
        const div = document.createElement('div');
        div.className = 's-result-item';
        div.onclick = () => loadAnimeForEditing(anime.id);
        let extraInfo = "";
        let uploaderImg = anime.uploaderImg || "Logo_Archinime.avif";
        if (currentSearchMode === 'general') { 
            extraInfo = ` | Subido por: <img src="${uploaderImg}" style="width:16px; height:16px; border-radius:50%; vertical-align:middle; margin:0 4px; object-fit:cover; border:1px solid #555;"> <span style="color:var(--primary)">${anime.uploader || "Desconocido"}</span>`; 
        }
        div.innerHTML = `
            <img src="${anime.img}" class="s-result-img" onerror="this.src='https://via.placeholder.com/50'">
            <div>
                <div style="font-weight:bold; color:#fff;">${anime.title}</div>
                <div style="color:#777; font-size:0.8em">ID: ${anime.id}${extraInfo}</div>
            </div>
        `;
        results.appendChild(div);
    });
    if(filtered.length === 0) {
        let emptyMsg = currentSearchMode === 'mine' ? `No se encontraron animes subidos por <b>${currentUserNick}</b>.` : "No se encontraron resultados.";
        results.innerHTML = `<div style="padding:20px; color:#777; text-align:center"><i class="fas fa-folder-open" style="font-size:2em; margin-bottom:10px;"></i><br>${emptyMsg}</div>`;
    }
}

// ---- Cargar anime para edición (incluye sincronización de toggles y ahora soporta link3 y link4) ----
async function loadAnimeForEditing(id) {
    if(!confirm("¿Cargar anime? Se perderán los datos actuales del formulario.")) return;
    closeSearchModal();
    showToast("Descargando datos...", false);
    try {
        const docRef = db.collection('catalogo').doc(id.toString());
        const docSnap = await docRef.get();
        if(!docSnap.exists) throw new Error("Anime no encontrado en Firestore");
        const animeData = docSnap.data();
        isEditMode = true;
        currentEditingId = id;
        const editModeBar = document.getElementById('editModeBar');
        if(editModeBar) editModeBar.style.display = 'block';
        const existingDelBtn = document.getElementById('btnDeleteAnime');
        if(existingDelBtn) existingDelBtn.remove();
        if(currentUserEmail === "archinime12@gmail.com") {
             const delBtn = document.createElement('button');
             delBtn.id = 'btnDeleteAnime';
             delBtn.innerText = "🗑 ELIMINAR ANIME";
             delBtn.style.cssText = "background: #ff4757; color: white; border: none; padding: 4px 10px; border-radius: 4px; margin-top: 5px; margin-left:10px; cursor: pointer; font-weight:bold;";
             delBtn.onclick = () => deleteCurrentAnime(id);
             editModeBar.appendChild(delBtn);
        }
        document.getElementById('editIdDisplay').innerText = id;
        document.getElementById('btnActionText').innerText = "GUARDAR CAMBIOS";
        const isSuperAdmin = ALLOWED_USERS.includes(currentUserEmail);
        const isOwner = (animeData.uploader === currentUserEmail) || isSuperAdmin;
        const saveBtn = document.getElementById('btnSaveAction');
        if (!isOwner) {
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<i class="fas fa-lock"></i> EDICIÓN BLOQUEADA (Solo Lectura)';
            showToast("Modo Lectura: No eres el autor de este anime", true);
        } else {
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<i class="fas fa-check"></i> Sin cambios pendientes';
            saveBtn.style.opacity = '0.5';
        }
        document.getElementById('tituloAnime').value = animeData.title || "";
        document.getElementById('portadaAnime').value = animeData.img || "";
        document.getElementById('sinopsisAnime').value = animeData.desc || "";
        document.getElementById('aliasContainer').innerHTML = '';
        if(animeData.aliases) animeData.aliases.forEach(a => addAlias(a));
        if(animeData.genres && animeData.genres.length) {
            let loadedGenres = [...animeData.genres];
            const demoOptions = ["Josei", "Kodomo", "Seijin", "Seinen", "Shōjo", "Shōnen"];
            const foundDemo = loadedGenres.find(g => demoOptions.includes(g));
            if(foundDemo) {
                document.getElementById('demografiaAnime').value = foundDemo;
                loadedGenres = loadedGenres.filter(g => g !== foundDemo);
            }
            document.querySelectorAll('#genresContainer input').forEach(cb => {
                cb.checked = loadedGenres.includes(cb.value);
            });
        }
        document.getElementById('seasonsContainer').innerHTML = '';
        if(animeData.seasons && Array.isArray(animeData.seasons)) {
            animeData.seasons.forEach(s => {
                addSeason({ name: s.name, cover: s.cover, eps: s.eps, type: s.type });
            });
        }
        document.getElementById('musicContainer').innerHTML = '';
        if(animeData.music && Array.isArray(animeData.music)) {
            animeData.music.forEach(url => addMusic(url));
        }
        
        // Cargar estados de toggles
        const toggleFinal = document.getElementById('finalToggle');
        const toggleAiring = document.getElementById('airingToggle');
        if (toggleFinal) {
            toggleFinal.checked = animeData.isFinal || false;
        }
        if (toggleAiring) {
            toggleAiring.checked = animeData.isAiring || false;
        }
        syncToggles(true);
        
        const estadoSelect = document.getElementById('estadoAnime');
        if(estadoSelect && animeData.updateType) {
            estadoSelect.value = animeData.updateType;
        }
        checkCoverVisual(document.getElementById('portadaAnime'));
        requestPreviewUpdate();
        originalAnimeState = JSON.stringify(generateData());
        checkAutoState();
        showToast("¡Datos cargados correctamente!");
    } catch(e) {
        console.error(e);
        showToast("Error cargando: " + e.message, true);
        exitEditMode();
    }
}

async function deleteCurrentAnime(idToDelete) {
    if(currentUserEmail !== "archinime12@gmail.com") { alert("Acción no permitida."); return; }
    if(!confirm(`⚠️ PELIGRO ⚠️\n\n¿Eliminar anime ID: ${idToDelete}?`)) return;
    if(!confirm(`ÚLTIMA ADVERTENCIA.\n¿Confirmar borrado?`)) return;
    showToast("Iniciando borrado...", false);
    try {
        await db.collection('catalogo').doc(idToDelete.toString()).delete();
        log("✅ ¡ELIMINADO DE FIRESTORE!");
        alert("✅ Anime eliminado correctamente.");
        exitEditMode();
    } catch(e) {
        console.error(e);
        log(`❌ ERROR FATAL: ${e.message}`);
        alert("Error crítico durante el borrado.");
    }
}

function exitEditMode() {
    isEditMode = false;
    currentEditingId = null;
    originalAnimeState = null;
    document.getElementById('editModeBar').style.display = 'none';
    document.getElementById('btnActionText').innerText = "COMPILAR Y SUBIR";
    const saveBtn = document.getElementById('btnSaveAction');
    saveBtn.disabled = false;
    saveBtn.style.opacity = '1';
    location.reload();
}

// ============================================
// GENERAR DATOS (MODIFICADO PARA MÚLTIPLES PARTES, TRÁILER, isAiring, ONA y ahora link3 y link4)
// ============================================
function generateData() {
    const selectedGenres = [];
    document.querySelectorAll('#genresContainer input:checked').forEach(cb => selectedGenres.push(cb.value));
    const demoSelect = document.getElementById('demografiaAnime').value;
    const aliasList = [];
    document.querySelectorAll('.alias-input').forEach(i => { if(i.value.trim()) aliasList.push(i.value.trim()) });
    let selectedState = "ESTRENO 🚨";
    const stEl = document.getElementById('estadoAnime');
    if(stEl) selectedState = stEl.value;
    let isFinal = false;
    const finalTog = document.getElementById('finalToggle');
    if(finalTog) isFinal = finalTog.checked;
    let isAiring = false;
    const airingTog = document.getElementById('airingToggle');
    if(airingTog) isAiring = airingTog.checked;
    
    // Seguridad extra: si ambos están activos, priorizar isFinal y desactivar isAiring
    if (isFinal && isAiring) {
        isAiring = false;
        if (airingTog) airingTog.checked = false;
        setTimeout(() => syncToggles(true), 0);
    }
    
    const anime = {
        id: isEditMode ? currentEditingId : 0, 
        titulo: document.getElementById('tituloAnime').value.trim(),
        aliases: aliasList,
        portada: document.getElementById('portadaAnime').value.trim(),
        sinopsis: document.getElementById('sinopsisAnime').value.trim(),
        demografia: demoSelect, 
        generos: selectedGenres,
        rating: 0,
        musica: [],
        temporadas: [],
        uploader: currentUserEmail, 
        uploaderAvatar: currentUserAvatar || "Logo_Archinime.avif",
        estado: selectedState,
        isFinal: isFinal,
        isAiring: isAiring
    };
    document.querySelectorAll('#musicContainer .m-url').forEach(i => { if(i.value) anime.musica.push(i.value.trim()); });
    let globalOrder = 1, seasonCountVP = 0, ovaCountVP = 0, onaCountVP = 0, movieCountVP = 0, specialCountVP = 0, spinOffCount = 0, trailerCount = 0;
    document.querySelectorAll('.season-card').forEach(card => {
        const eps = [];
        const sName = card.querySelector('.s-name').value;
        const sType = card.querySelector('.s-type').value;
        const startSel = card.querySelector('.s-start-index');
        const startNum = startSel ? parseInt(startSel.value) : 1;
        if(sType === 'Temporada') seasonCountVP++;
        if(sType === 'OVA') ovaCountVP++;
        if(sType === 'ONA') onaCountVP++;
        if(sType === 'Pelicula') movieCountVP++;
        if(sType === 'Especial') specialCountVP++;
        if(sType === 'Spin-Off') spinOffCount++;
        if(sType === 'Tráiler') trailerCount++;
        card.querySelectorAll('.chapter-row').forEach((row, idx) => {
            const latParts = [];
            row.querySelectorAll('.c-link-lat-part').forEach(inp => {
                const val = inp.value.trim();
                if(val) latParts.push(val);
            });
            const subParts = [];
            row.querySelectorAll('.c-link-sub-part').forEach(inp => {
                const val = inp.value.trim();
                if(val) subParts.push(val);
            });
            const op3Parts = [];
            row.querySelectorAll('.c-link-op3-part').forEach(inp => {
                const val = inp.value.trim();
                if(val) op3Parts.push(val);
            });
            const op4Parts = [];
            row.querySelectorAll('.c-link-op4-part').forEach(inp => {
                const val = inp.value.trim();
                if(val) op4Parts.push(val);
            });
            
            let customTitleInput = row.querySelector('.c-title-ov').value.trim();
            let playerTitle = "", detailTitle = ""; 
            let currentEpNum = startNum + idx;
            if (sType === 'Temporada') {
                detailTitle = `Capítulo ${currentEpNum}`;
                playerTitle = `${anime.titulo} T${seasonCountVP} Cap ${currentEpNum}`;
            } else if (sType === 'Spin-Off') {
                detailTitle = `Capítulo ${currentEpNum}`;
                playerTitle = `${anime.titulo} ${sName} Cap ${currentEpNum}`;
            } else if (sType === 'Tráiler') {
                detailTitle = customTitleInput || `Tráiler ${trailerCount} - ${currentEpNum}`;
                playerTitle = `${anime.titulo} ${sName} ${detailTitle}`;
            } else if (sType === 'OVA') {
                detailTitle = customTitleInput || sName;
                playerTitle = `${anime.titulo} ${sName}`;
            } else if (sType === 'ONA') {
                detailTitle = customTitleInput || sName;
                playerTitle = `${anime.titulo} ${sName}`;
            } else if (sType === 'Pelicula') {
                detailTitle = customTitleInput || sName;
                playerTitle = `${anime.titulo} ${sName}`;
            } else if (sType === 'Especial') {
                detailTitle = customTitleInput || sName;
                playerTitle = `${anime.titulo} ${sName}`;
            }
            // Solo agregamos el capítulo si al menos una opción tiene partes
            if(latParts.length || subParts.length || op3Parts.length || op4Parts.length) {
                eps.push({ 
                    num: idx + 1, 
                    link: latParts, 
                    link2: subParts, 
                    link3: op3Parts, 
                    link4: op4Parts, 
                    title: detailTitle, 
                    playerTitle: playerTitle 
                });
            }
        });
        if(eps.length > 0) {
            anime.temporadas.push({ num: globalOrder++, name: sName, type: sType, cover: card.querySelector('.s-img').value, eps: eps });
        }
    });
    return anime;
}

function highlightLogoutButton() {
    const headerBtns = document.querySelectorAll('#userHeader button');
    const logoutBtn = Array.from(headerBtns).find(btn => btn.getAttribute('onclick') === 'logout()');
    if (logoutBtn) {
        logoutBtn.style.transition = 'all 0.5s ease';
        logoutBtn.style.border = '2px solid #00f0ff';
        logoutBtn.style.boxShadow = '0 0 20px #00f0ff, inset 0 0 10px #00f0ff';
        logoutBtn.style.color = '#00f0ff';
        logoutBtn.style.transform = 'scale(1.2)';
        let visible = true;
        setInterval(() => {
            logoutBtn.style.opacity = visible ? '0.5' : '1';
            visible = !visible;
        }, 500);
        const tip = document.createElement('div');
        tip.innerHTML = "⬇ CLIC AQUÍ ⬇";
        tip.style.position = 'absolute';
        tip.style.top = '50px';
        tip.style.right = '10px';
        tip.style.background = '#00f0ff';
        tip.style.color = '#000';
        tip.style.padding = '5px 10px';
        tip.style.borderRadius = '5px';
        tip.style.fontWeight = 'bold';
        tip.style.zIndex = '9999';
        tip.style.pointerEvents = 'none';
        document.body.appendChild(tip);
    }
}

async function subirAGithHub() {
    const btn = document.getElementById('btnSaveAction');
    if(btn.disabled) return showToast("Edición Bloqueada o Sin Cambios", true);
    if(!auth.currentUser) return showToast("Error de sesión", true);
    const nuevoAnime = generateData();
    if(!nuevoAnime.titulo) return showToast("Falta Título", true);
    if(!nuevoAnime.portada) return showToast("Falta Portada", true);
    if(!nuevoAnime.sinopsis) return showToast("Falta Sinopsis", true);
    if(!nuevoAnime.demografia) return showToast("Elige Demografía", true);
    if(nuevoAnime.generos.length === 0) return showToast("Elige Géneros", true);
    if(nuevoAnime.estado !== 'PRÓXIMAMENTE ⏳') {
        if(nuevoAnime.temporadas.length === 0) return showToast("Agrega contenido", true);
    }
    if(!confirm(`¿Deseas compilar y subir los datos de "${nuevoAnime.titulo}"?`)) return;
    document.getElementById('statusLog').innerHTML = "🚀 Iniciando...<br>";
    try {
        let FINAL_ID = nuevoAnime.id;
        let UPDATE_LABEL = nuevoAnime.estado;
        if (!isEditMode) {
            log("1/3 Calculando ID...");
            const snapshot = await db.collection('catalogo').get();
            let maxId = 0;
            snapshot.forEach(doc => {
                const data = doc.data();
                if(data.id && data.id > maxId) maxId = data.id;
            });
            FINAL_ID = maxId + 1;
            log(`✅ Nuevo ID: ${FINAL_ID}`);
        } else {
            log(`📝 Editando ID: ${FINAL_ID}`);
        }
        let lastSeasonCover = nuevoAnime.portada;
        let lastBlockName = "Novedad";
        let lastEpTitle = "Nuevo Contenido";
        if (nuevoAnime.temporadas && nuevoAnime.temporadas.length > 0) {
            const lastSeason = nuevoAnime.temporadas[nuevoAnime.temporadas.length - 1];
            if (lastSeason.cover) lastSeasonCover = lastSeason.cover;
            if (lastSeason.name) lastBlockName = lastSeason.name;
            if (lastSeason.eps && lastSeason.eps.length > 0) {
                const lastEp = lastSeason.eps[lastSeason.eps.length - 1];
                if (lastEp.title) lastEpTitle = lastEp.title;
            }
        }
        log("2/3 Preparando objeto para Firestore...");
        const finalGenres = [...nuevoAnime.generos];
        if(nuevoAnime.demografia) {
            const idx = finalGenres.indexOf(nuevoAnime.demografia);
            if(idx !== -1) finalGenres.splice(idx, 1);
            finalGenres.push(nuevoAnime.demografia);
        }
        const animeData = {
            id: FINAL_ID,
            title: nuevoAnime.titulo,
            desc: nuevoAnime.sinopsis,
            img: nuevoAnime.portada,
            rating: 0,
            uploader: nuevoAnime.uploader,
            uploaderImg: nuevoAnime.uploaderAvatar || "Logo_Archinime.avif",
            genres: finalGenres,
            lastUpdate: firebase.firestore.FieldValue.serverTimestamp(),
            updateType: UPDATE_LABEL,
            latestSeasonCover: lastSeasonCover,
            latestBlockName: lastBlockName,
            latestEpTitle: lastEpTitle,
            isFinal: nuevoAnime.isFinal,
            isAiring: nuevoAnime.isAiring,
            music: nuevoAnime.musica,
            seasons: nuevoAnime.temporadas.map(t => ({
                num: t.num,
                name: t.name,
                type: t.type,
                cover: t.cover,
                eps: t.eps.map(e => ({ 
                    title: e.title, 
                    link: e.link, 
                    link2: e.link2,
                    link3: e.link3,
                    link4: e.link4
                }))
            }))
        };
        if(nuevoAnime.aliases.length > 0) animeData.aliases = nuevoAnime.aliases;
        log("3/3 Guardando en Firestore...");
        await db.collection('catalogo').doc(FINAL_ID.toString()).set(animeData);
        log("✨ ¡EXITO! DATOS SUBIDOS A FIRESTORE");
        showToast("¡Datos subidos! Ya puedes cerrar sesión o seguir editando.", false);
        alert("✅ Cambios guardados correctamente en Firestore.\n\nPresiona el botón de 'CERRAR SESIÓN' si deseas refrescar la vista.");
        highlightLogoutButton();
    } catch (e) {
        console.error(e);
        log(`❌ ERROR: ${e.message}`);
        showToast("Error crítico (ver log)", true);
    }
}

// Inicializar la inyección
injectStateSelect();
injectFinalBlock();
injectAiringToggle();