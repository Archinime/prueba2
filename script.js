// ============================================
// CONFIGURACIÓN FIRESTORE (solo auth y usuarios)
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
let cachedIndex = [];          // Ahora se carga desde catalogoArray (global)
let searchTimeout = null;
let previewTimeout = null;
let originalAnimeState = null;

let currentUserNick = "Usuario"; 
let currentUserAvatar = "Logo_Archinime.avif";
let currentUserEmail = "";
let currentUserUid = "";
let currentSearchMode = 'mine';

// ============================================
// AUTENTICACIÓN (GitHub) – SIN CAMBIOS
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

// (Funciones de perfil: showProfileSetup, closeProfileModal, etc., idénticas al original)

// ============================================
// CATÁLOGO LOCAL: carga índice desde catalogoArray
// ============================================
function loadIndexForSearch() {
    const loading = document.getElementById('loadingSearch');
    loading.style.display = 'block';
    try {
        // catalogoArray está definido en catalogo.js
        cachedIndex = catalogoArray.map(anime => ({
            id: anime.id,
            title: anime.title,
            img: anime.img,
            rating: anime.rating || 0,
            uploader: anime.uploader,
            uploaderImg: anime.uploaderImg,
            genres: anime.genres,
            isFinal: anime.isFinal
        }));
        // orden opcional
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
    searchTimeout = setTimeout(_performFilter, 300);
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
// CARGAR ANIME DESDE CATÁLOGO LOCAL
// ============================================
async function loadAnimeForEditing(id) {
    if(!confirm("¿Cargar anime? Se perderán los datos actuales del formulario.")) return;
    closeSearchModal();
    showToast("Descargando datos...", false);
    try {
        // Buscar en el arreglo local
        const animeData = catalogoArray.find(a => a.id == id);
        if (!animeData) throw new Error("Anime no encontrado en el catálogo local");
        
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
        
        // Poblar formulario (idéntico al original)
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

// ============================================
// GUARDAR: GENERAR Y DESCARGAR catalogo.js
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
    if(nuevoAnime.generos.length === 0) return showToast("Elige Géneros", true);
    if(nuevoAnime.estado !== 'PRÓXIMAMENTE ⏳') {
        if(nuevoAnime.temporadas.length === 0) return showToast("Agrega contenido", true);
    }
    
    if(!confirm(`¿Deseas compilar y descargar el catálogo actualizado con "${nuevoAnime.titulo}"?`)) return;
    document.getElementById('statusLog').innerHTML = "🚀 Iniciando...<br>";
    
    try {
        // Calcular nuevo ID
        let FINAL_ID = nuevoAnime.id;
        if (!isEditMode) {
            const maxId = catalogoArray.reduce((max, a) => Math.max(max, a.id), 0);
            FINAL_ID = maxId + 1;
            log(`✅ Nuevo ID: ${FINAL_ID}`);
        } else {
            log(`📝 Editando ID: ${FINAL_ID}`);
        }
        
        // Datos complementarios
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
        
        const finalGenres = [...nuevoAnime.generos];
        if(nuevoAnime.demografia) {
            const idx = finalGenres.indexOf(nuevoAnime.demografia);
            if(idx !== -1) finalGenres.splice(idx, 1);
            finalGenres.push(nuevoAnime.demografia);
        }
        
        // Construir objeto sin rating
        const animeToSave = {
            id: FINAL_ID,
            title: nuevoAnime.titulo,
            desc: nuevoAnime.sinopsis,
            img: nuevoAnime.portada,
            genres: finalGenres,
            lastUpdate: Date.now(),
            updateType: nuevoAnime.estado,
            latestSeasonCover: lastSeasonCover,
            latestBlockName: lastBlockName,
            latestEpTitle: lastEpTitle,
            isFinal: nuevoAnime.isFinal,
            music: nuevoAnime.musica,
            uploader: currentUserEmail,
            uploaderImg: currentUserAvatar || "Logo_Archinime.avif",
            seasons: nuevoAnime.temporadas.map(t => ({
                num: t.num,
                name: t.name,
                type: t.type,
                cover: t.cover,
                eps: t.eps.map(e => ({ title: e.title, link: e.link, link2: e.link2 }))
            }))
        };
        if(nuevoAnime.aliases.length > 0) animeToSave.aliases = nuevoAnime.aliases;
        
        // Actualizar arreglo local
        let newCatalog;
        if (isEditMode) {
            newCatalog = catalogoArray.map(a => a.id == FINAL_ID ? animeToSave : a);
        } else {
            newCatalog = [...catalogoArray, animeToSave];
        }
        // Ordenar (por último update descendente, como en la web)
        newCatalog.sort((a,b) => b.lastUpdate - a.lastUpdate);
        
        // Generar archivo
        const cabecera = `// ============================================================
// ARCHINIME - CATÁLOGO EXPORTADO DESDE CMS
// ============================================================
// Fecha de exportación: ${new Date().toLocaleString()}
// Total de animes: ${newCatalog.length}
// 
// ⚠️  Este archivo NO incluye ratings (se manejan en Firebase).
// ============================================================

`;
        const jsonString = JSON.stringify(newCatalog, null, 2);
        const contenidoJS = cabecera + `const catalogoArray = ${jsonString};\n\n`;
        
        // Descargar
        const blob = new Blob([contenidoJS], { type: 'application/javascript' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'catalogo.js';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        log("✨ ¡CATALOGO GENERADO! Descarga iniciada.");
        showToast("Archivo catalogo.js descargado. Reemplázalo en tu repositorio.", false);
        alert("✅ Se ha descargado el nuevo 'catalogo.js'.\nSustitúyelo en GitHub para actualizar la web.");
        highlightLogoutButton();
    } catch (e) {
        console.error(e);
        log(`❌ ERROR: ${e.message}`);
        showToast("Error crítico (ver log)", true);
    }
}

// ============================================
// ELIMINAR ANIME (actualización local + descarga)
// ============================================
async function deleteCurrentAnime(idToDelete) {
    if(currentUserEmail !== "archinime12@gmail.com") {
        alert("Acción no permitida.");
        return;
    }
    if(!confirm(`⚠️ PELIGRO ⚠️\n\n¿Eliminar anime ID: ${idToDelete}? Esta acción no se puede deshacer.`)) return;
    if(!confirm(`ÚLTIMA ADVERTENCIA.\n¿Confirmas el borrado del catálogo local?`)) return;

    try {
        // Eliminar del arreglo local
        const newCatalog = catalogoArray.filter(a => a.id != idToDelete);
        // Reordenar IDs (opcional) – aquí solo los ordenamos, no renumeramos
        newCatalog.sort((a,b) => a.id - b.id);
        
        // Generar archivo para descargar
        const cabecera = `// Archinime catálogo actualizado (sin anime ${idToDelete})\n\n`;
        const jsonString = JSON.stringify(newCatalog, null, 2);
        const contenidoJS = cabecera + `const catalogoArray = ${jsonString};\n`;
        
        const blob = new Blob([contenidoJS], { type: 'application/javascript' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'catalogo.js';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        log(`✅ Anime ID ${idToDelete} eliminado. Nuevo catálogo descargado.`);
        showToast("Catálogo actualizado descargado. Reemplázalo en GitHub.", false);
        alert("✅ Catálogo actualizado. Recuerda subir el nuevo archivo a GitHub.");
        exitEditMode();
    } catch(e) {
        console.error(e);
        log(`❌ ERROR: ${e.message}`);
        alert("Error durante la eliminación.");
    }
}

// ============================================
// (El resto de funciones: autenticación, perfil, UI… se mantienen igual)
// ... incluye showCMS, showLogin, signInWithGitHub, etc.
// ... incluye todas las funciones de construcción del formulario (injectStateSelect, addSeason, etc.)
// ... incluye generateData (sin cambios significativos)
// ... incluye exitEditMode, requestPreviewUpdate, etc.
// ============================================

// NOTA: Por brevedad, aquí no se repiten las más de 1000 líneas originales,
// pero todas deben conservarse. Solo se han modificado las funciones indicadas.