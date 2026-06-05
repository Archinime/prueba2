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
    const slider = wrapper.querySelector('.slider');
    const circle = wrapper.querySelector('#sliderCircle');
    checkbox.addEventListener('change', () => {
        if(checkbox.checked) {
            slider.style.backgroundColor = "#00f0ff";
            circle.style.transform = "translateX(24px)";
        } else {
            slider.style.backgroundColor = "#333";
            circle.style.transform = "translateX(0)";
        }
        requestPreviewUpdate();
    });
    if (musicHeader && musicHeader.tagName === 'H2') {
        parent.insertBefore(wrapper, musicHeader);
    } else {
        parent.insertBefore(wrapper, musicContainer);
    }
}

const genresList = [
    "Acción", "Animación", "Artes Marciales", "Aventura", "Ciencia ficción", "Cocina", "Comedia", 
    "Comedia oscura", "Coming-of-age", "Cosplay", "Crimen", "Cyberpunk", "Deducción Social", "Deportivo", 
    "Divulgación Científica", "Drama", "Ecchi", "Espionaje", "Escolar", "Fantasía", 
    "Fantasía oscura", "Familiar", "Gag", "Gore", "Harem", "Hentai", "Histórico", 
    "Horror", "Incesto", "Infantil", "Isekai", "Isekai Inverso", "Kaiju", "Mahō Shōjo", 
    "Mecha", "Militar", "Mitología", "Misterio", "Musical", "Nekketsu", "Parodia", 
    "Policial", "Post-apocalíptico", "Psicológico", "Reverse Harem", "Romance", "RPG", 
    "Slice of Life", "Sobrenatural", "Steampunk", "Superhéroes", "Survival", 
    "Survival Game", "Suspenso", "Tentáculos", "Terror", "Terror psicológico", "Thriller", 
    "Thriller psicológico", "Tokusatsu", "Tragedia", "VRMMO", "Yankī", "Yaoi", "Yuri"
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

function extractUrlFromIframe(value) {
    if (!value || typeof value !== 'string') return null;
    const iframeRegex = /<iframe[^>]*src=["']([^"']+)["'][^>]*>/i;
    const match = value.match(iframeRegex);
    if (match && match[1]) return match[1];
    return null;
}

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
                    <option value="Especial">Especial</option>
                    <option value="Spin-Off">Spin-Off</option>
                </select>
            </div>
            <div class="col-flex">
                 <label>Nombre Bloque</label>
                 <input type="text" class="s-name" placeholder="Auto" disabled oninput="requestPreviewUpdate()">
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
            else if(data.name.startsWith('Especial')) selectedType = 'Especial';
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

function updateAllBlockNames() {
    const cards = document.querySelectorAll('.season-card');
    let tempCount = 0, movieCount = 0, ovaCount = 0, specialCount = 0, spinOffCount = 0;
    cards.forEach(card => {
        const typeSelect = card.querySelector('.s-type');
        const nameInput = card.querySelector('.s-name');
        const type = typeSelect.value;
        if (!type) return;
        nameInput.disabled = (type !== 'Spin-Off');
        if (nameInput.disabled || nameInput.value.trim() === "") {
             if (type === 'Temporada') { tempCount++; nameInput.value = `Temporada ${tempCount}`; }
             else if (type === 'Pelicula') { movieCount++; nameInput.value = `Película ${movieCount}`; }
             else if (type === 'OVA') { ovaCount++; nameInput.value = `OVA ${ovaCount}`; }
             else if (type === 'Especial') { specialCount++; nameInput.value = `Especial ${specialCount}`; }
             else if (type === 'Spin-Off') { spinOffCount++; if (!nameInput.value) nameInput.value = `Spin-Off ${spinOffCount}`; }
        } else {
             if (type === 'Temporada') tempCount++;
             else if (type === 'Pelicula') movieCount++;
             else if (type === 'OVA') ovaCount++;
             else if (type === 'Especial') specialCount++;
             else if (type === 'Spin-Off') spinOffCount++;
        }
    });
}

function handleSeasonTypeChange(select) {
    const card = select.closest('.season-card');
    const countInput = card.querySelector('.s-count');
    const type = select.value;
    if (['Pelicula', 'OVA', 'Especial'].includes(type)) {
        countInput.value = 1;
        countInput.disabled = true;
    } else {
        countInput.disabled = false;
    }
    updateAllBlockNames();
    if(countInput.value) renderChapters(countInput);
    checkAutoState();
    requestPreviewUpdate();
}

// ============================================
// NUEVA FUNCIÓN: Renderizar capítulos con múltiples enlaces (partes)
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
    
    // Guardar datos actuales si no se pasan existingEps
    let currentData = [];
    if(existingEps.length === 0) {
        card.querySelectorAll('.chapter-row').forEach(row => {
            // Extraer lista de enlaces de esta fila
            const links = [];
            row.querySelectorAll('.part-link-input').forEach(inp => {
                if(inp.value.trim()) links.push(inp.value.trim());
            });
            currentData.push({
                links: links,
                title: row.querySelector('.c-title-ov').value
            });
        });
    }
    
    list.innerHTML = '';
    if(isNaN(count) || count < 1) return;
    
    for(let i = 0; i < count; i++) {
        const row = document.createElement('div');
        row.className = 'chapter-row';
        let existingLinks = [];
        let customTitle = '';
        if(existingEps[i]) {
            // Soporte para nuevo formato (links array) o legacy (link, link2)
            if(existingEps[i].links && Array.isArray(existingEps[i].links)) {
                existingLinks = [...existingEps[i].links];
            } else {
                if(existingEps[i].link) existingLinks.push(existingEps[i].link);
                if(existingEps[i].link2) existingLinks.push(existingEps[i].link2);
            }
            customTitle = existingEps[i].title || '';
        } else if(currentData[i]) {
            existingLinks = currentData[i].links || [];
            customTitle = currentData[i].title;
        }
        
        let currentNum = startNum + i;
        let titleInputDisabled = ['Temporada', 'Spin-Off'].includes(type) ? "disabled" : "";
        let titlePlaceholder = titleInputDisabled ? `Capítulo ${currentNum}` : "Nombre (ej: El viaje...)";
        if(titleInputDisabled && !customTitle) customTitle = `Capítulo ${currentNum}`;
        
        row.innerHTML = `
            <div class="chapter-header">
                <span class="chapter-num">CAPÍTULO ${currentNum}</span>
                <button type="button" class="btn-mini-del" style="width:auto; padding:0 10px; background:var(--accent); color:#000;" onclick="addPartToChapter(this)">+ Añadir parte</button>
            </div>
            <div class="parts-list" style="margin-bottom:10px;"></div>
            <input type="text" class="c-title-ov" value="${escapeHtml(customTitle)}" ${titleInputDisabled} placeholder="${titlePlaceholder}" oninput="requestPreviewUpdate()" style="margin-top:10px; font-size:0.9em; border-color:#333; background:#111;">
        `;
        const partsContainer = row.querySelector('.parts-list');
        // Añadir campos para cada parte
        if(existingLinks.length === 0) existingLinks.push(''); // Al menos un campo vacío
        existingLinks.forEach((linkVal, idx) => {
            addPartInput(partsContainer, linkVal, idx);
        });
        list.appendChild(row);
    }
    requestPreviewUpdate();
}

// Función auxiliar para escapar HTML
function escapeHtml(str) {
    if(!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if(m === '&') return '&amp;';
        if(m === '<') return '&lt;';
        if(m === '>') return '&gt;';
        return m;
    });
}

// Añadir un campo de enlace (parte) a un contenedor
function addPartInput(container, value = '', index = null) {
    const div = document.createElement('div');
    div.className = 'dynamic-item';
    div.style.marginBottom = '8px';
    const partNumber = container.children.length + 1;
    div.innerHTML = `
        <input type="text" class="part-link-input" placeholder="🔗 URL Parte ${partNumber}" value="${escapeHtml(value)}" oninput="requestPreviewUpdate()" onblur="smartLinkConvert(this)" style="flex:1;">
        <button class="btn-mini-del" onclick="this.parentElement.remove(); requestPreviewUpdate()" style="height:auto;"><i class="fas fa-times"></i></button>
    `;
    container.appendChild(div);
}

// Función global para añadir parte a un capítulo (llamada desde el botón)
window.addPartToChapter = function(btn) {
    const chapterRow = btn.closest('.chapter-row');
    const partsContainer = chapterRow.querySelector('.parts-list');
    if(partsContainer) {
        addPartInput(partsContainer, '');
        requestPreviewUpdate();
    }
};

// ============================================
// MODIFICACIÓN DE generateData para capturar múltiples enlaces
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
        isFinal: isFinal
    };
    document.querySelectorAll('#musicContainer .m-url').forEach(i => { if(i.value) anime.musica.push(i.value.trim()); });
    let globalOrder = 1, seasonCountVP = 0, ovaCountVP = 0, movieCountVP = 0, specialCountVP = 0, spinOffCount = 0;
    document.querySelectorAll('.season-card').forEach(card => {
        const eps = [];
        const sName = card.querySelector('.s-name').value;
        const sType = card.querySelector('.s-type').value;
        const startSel = card.querySelector('.s-start-index');
        const startNum = startSel ? parseInt(startSel.value) : 1;
        if(sType === 'Temporada') seasonCountVP++;
        if(sType === 'OVA') ovaCountVP++;
        if(sType === 'Pelicula') movieCountVP++;
        if(sType === 'Especial') specialCountVP++;
        
        card.querySelectorAll('.chapter-row').forEach((row, idx) => {
            // Obtener todos los enlaces de las partes
            const links = [];
            row.querySelectorAll('.part-link-input').forEach(inp => {
                const val = inp.value.trim();
                if(val) links.push(val);
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
            } else if (sType === 'OVA') {
                detailTitle = customTitleInput || sName;
                playerTitle = `${anime.titulo} OVA ${ovaCountVP}` + (customTitleInput ? ` "${customTitleInput}"` : "");
            } else if (sType === 'Pelicula') {
                detailTitle = customTitleInput || sName;
                playerTitle = `${anime.titulo} Película ${movieCountVP}` + (customTitleInput ? `: ${customTitleInput}` : "");
            } else if (sType === 'Especial') {
                detailTitle = customTitleInput || sName;
                playerTitle = `${anime.titulo} Especial ${specialCountVP}` + (customTitleInput ? `: ${customTitleInput}` : "");
            }
            if(links.length > 0) {
                eps.push({ 
                    num: idx + 1, 
                    links: links,          // NUEVO: array de enlaces
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

// ============================================
// MODIFICACIÓN de loadAnimeForEditing para cargar múltiples enlaces
// ============================================
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
        const toggle = document.getElementById('finalToggle');
        if(toggle) {
            toggle.checked = animeData.isFinal || false;
            toggle.dispatchEvent(new Event('change'));
        }
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
            music: nuevoAnime.musica,
            seasons: nuevoAnime.temporadas.map(t => ({
                num: t.num,
                name: t.name,
                type: t.type,
                cover: t.cover,
                eps: t.eps.map(e => ({ 
                    title: e.title, 
                    links: e.links   // GUARDAR ARRAY DE ENLACES
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