// ============================================
// CONFIGURACIÓN FIREBASE (Firestore)
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
const db = firebase.firestore();  // <--- Firestore
auth.setPersistence(firebase.auth.Auth.Persistence.SESSION);

let globalUsersData = {};
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
    provider.addScope('repo'); // ya no se usa, pero se mantiene
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
        // Buscar perfil en Firestore (colección 'users', documento = uid)
        const userDoc = await db.collection('users').doc(currentUserUid).get();
        if (userDoc.exists) {
            const userData = userDoc.data();
            currentUserNick = userData.nick;
            currentUserAvatar = userData.avatar;
            showCMS();
        } 
        else if (ALLOWED_USERS.includes(email)) {
            // Usuario administrador sin perfil aún: crear perfil automático
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
            // Usuario no registrado: mostrar formulario de perfil
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

    // Verificar nombre único en Firestore (consulta a todos los usuarios)
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
// FUNCIONES DE INTERFAZ (igual que antes)
// ============================================
function injectStateSelect() { /* igual */ }
function injectFinalBlock() { /* igual */ }
// ... (todas las funciones de UI, addAlias, addMusic, addSeason, etc. se mantienen exactamente igual)
// Por brevedad no las reescribo aquí, pero debes copiarlas del script anterior.
// Asegúrate de incluir: addAlias, addMusic, updateAudioPreview, addSeason, moveSeason, removeSeasonBlock,
// updateAllBlockNames, handleSeasonTypeChange, renderChapters, requestPreviewUpdate, checkForChanges,
// updateWebPreview, checkCoverVisual, smartLinkConvert, autoCap, limitRating, validate, log, showToast,
// genresList, colorPalette, etc. Todo eso permanece idéntico.

// ============================================
// BÚSQUEDA Y CARGA DESDE FIRESTORE
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
function closeSearchModal() { document.getElementById('searchModal').style.display = 'none'; }
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
                rating: anime.rating,
                uploader: anime.uploader,
                uploaderImg: anime.uploaderImg,
                genres: anime.genres,
                isFinal: anime.isFinal
            });
        });
        cachedIndex.sort((a,b) => b.id - a.id); // más nuevos primero
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

// ============================================
// CARGAR ANIME PARA EDICIÓN (Firestore)
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

        // Llenar formulario
        document.getElementById('tituloAnime').value = animeData.title || "";
        document.getElementById('portadaAnime').value = animeData.img || "";
        document.getElementById('sinopsisAnime').value = animeData.desc || "";
        document.getElementById('aliasContainer').innerHTML = '';
        if(animeData.aliases) animeData.aliases.forEach(a => addAlias(a));
        
        // Géneros
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
        
        let r = animeData.rating || 0;
        const intPart = Math.floor(r);
        const decPart = Math.round((r - intPart) * 10);
        document.getElementById('ratingInt').value = intPart || "";
        document.getElementById('ratingDec').value = decPart;
        
        // Temporadas
        document.getElementById('seasonsContainer').innerHTML = '';
        if(animeData.seasons && Array.isArray(animeData.seasons)) {
            animeData.seasons.forEach(s => {
                addSeason({ name: s.name, cover: s.cover, eps: s.eps });
            });
        }
        
        // Música
        document.getElementById('musicContainer').innerHTML = '';
        if(animeData.music && Array.isArray(animeData.music)) {
            animeData.music.forEach(url => addMusic(url));
        }
        
        // Estado Final
        const toggle = document.getElementById('finalToggle');
        if(toggle) {
            toggle.checked = animeData.isFinal || false;
            toggle.dispatchEvent(new Event('change'));
        }
        
        // Estado del anime (updateType)
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
// GENERAR DATOS (igual que antes, pero ajustando nombres de campos)
// ============================================
function generateData() {
    const selectedGenres = [];
    document.querySelectorAll('#genresContainer input:checked').forEach(cb => selectedGenres.push(cb.value));
    const demoSelect = document.getElementById('demografiaAnime').value;
    const iVal = document.getElementById('ratingInt').value || "0";
    const dVal = document.getElementById('ratingDec').value || "0";
    const ratingVal = parseFloat(iVal + "." + dVal);
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
        rating: ratingVal,
        musica: [],
        temporadas: [],
        uploader: currentUserEmail, 
        uploaderAvatar: currentUserAvatar,
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
            const lat = row.querySelector('.c-link-lat').value.trim();
            const sub = row.querySelector('.c-link-sub').value.trim();
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

            if(sub || lat) {
                eps.push({ num: idx + 1, link: lat, link2: sub, title: detailTitle, playerTitle: playerTitle });
            }
        });
        if(eps.length > 0) {
            anime.temporadas.push({ num: globalOrder++, name: sName, type: sType, cover: card.querySelector('.s-img').value, eps: eps });
        }
    });
    return anime;
}

// ============================================
// SUBIR A FIRESTORE (GUARDAR)
// ============================================
async function subirAGithHub() {
    const btn = document.getElementById('btnSaveAction');
    if(btn.disabled) return showToast("Edición Bloqueada o Sin Cambios", true);
    if(!auth.currentUser) return showToast("Error de sesión", true);
    const nuevoAnime = generateData();
    if(!nuevoAnime.titulo) return showToast("Falta Título", true);
    if(!nuevoAnime.portada) return showToast("Falta Portada", true);
    if(!nuevoAnime.sinopsis) return showToast("Falta Sinopsis", true);
    if(!nuevoAnime.demografia) return showToast("Elige Demografía", true);
    if(nuevoAnime.rating < 1.0 || nuevoAnime.rating > 5.0) return showToast("Valoración inválida", true);
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
            rating: nuevoAnime.rating,
            uploader: nuevoAnime.uploader,
            uploaderImg: nuevoAnime.uploaderAvatar,
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
                cover: t.cover,
                eps: t.eps.map(e => ({ title: e.title, link: e.link, link2: e.link2 }))
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

// Inicializar
injectStateSelect();
injectFinalBlock();