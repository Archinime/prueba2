// notification-system.js - FIX: SELLO "FINALIZADO" EN POPUPS + LAYOUT OPTIMIZADO
// ACTUALIZADO: Usa ArchinimeState para el estado del usuario
let notificationQueue = []; [cite: 1]
let notificationsHistory = []; [cite: 2]
let isMenuOpen = false;
let repliesUnsubscribe = null;
let catalogoUnsubscribe = null; [cite: 2]

// LÍMITE DE POPUPS: MÁXIMO 5 VENTANAS EMERGENTES POR SESIÓN
let popupsShownCount = 0; [cite: 3]
const MAX_POPUPS = 5; [cite: 3]
let firstVisitInitialized = false; [cite: 4]

// BANDERA DE CARGA DE PÁGINA
let pageFullyLoaded = false;

// FIX: FUNCIÓN DE SCROLLBAR SIN SALTO PARA LA BARRA DE NAVEGACIÓN
if (typeof disableBodyScroll !== 'function') { [cite: 5]
  window.disableBodyScroll = function() {
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth; [cite: 5]
    document.body.style.paddingRight = scrollbarWidth + 'px'; [cite: 6]
    document.body.classList.add('modal-open');
    document.documentElement.classList.add('modal-open');
  };
  window.enableBodyScroll = function() {
    document.body.style.paddingRight = '';
    document.body.classList.remove('modal-open');
    document.documentElement.classList.remove('modal-open'); [cite: 6]
  }; [cite: 7]
}

// Obtener usuario actual desde el estado central o fallback
function getCurrentUser() {
  if (window.ArchinimeState) return ArchinimeState.get('currentUser'); [cite: 7]
  return null; [cite: 8]
}

document.addEventListener('DOMContentLoaded', async () => {
    console.log("🔔 Inicializando sistema de notificaciones...");
    loadHistoryFromStorage();
    
    const isFirstVisit = !localStorage.getItem('archinime_notif_first_visit');
    if (isFirstVisit && !firstVisitInitialized) {
        console.log("🎉 Primera visita. Se mostrarán máximo 5 popups (los más recientes).");
        firstVisitInitialized = true;
        await initFirstVisitNotifications();
        localStorage.setItem('archinime_notif_first_visit', 'true'); [cite: 8]
    } else {
        renderNotificationList();
        updateBellBadge(); [cite: 9]
    }

    listenForCatalogUpdates();

    // Suscribirse al estado central para cambios de usuario
    if (window.ArchinimeState) {
        ArchinimeState.on('currentUser', async user => {
            if (user) {
                await syncNotificationsWithCloud(user.uid);
                listenForReplies(user.uid); [cite: 9]
            } else if (repliesUnsubscribe) {
                repliesUnsubscribe(); [cite: 10]
            }
        }); [cite: 11]
    } else if (typeof auth !== 'undefined') {
        console.warn("ArchinimeState no encontrado, usando auth.onAuthStateChanged como fallback");
        auth.onAuthStateChanged(async user => {
            if (user) {
                await syncNotificationsWithCloud(user.uid);
                listenForReplies(user.uid);
            } else if (repliesUnsubscribe) repliesUnsubscribe();
        }); [cite: 12]
    }
});

// ========== PRIMERA VISITA: máximo 5 popups de los animes más recientes ==========
async function initFirstVisitNotifications() {
    let anyChanged = false; [cite: 13]
    for (let notif of notificationsHistory) {
        if (!notif.seen) {
            notif.seen = true; [cite: 14]
            anyChanged = true; [cite: 15]
        }
    }
    if (anyChanged) {
        saveHistoryToStorage();
        renderNotificationList(); [cite: 15]
        updateBellBadge(); [cite: 16]
    }

    notificationQueue = [];
    popupsShownCount = 0; [cite: 16]
    try {
        const snapshot = await db.collection('catalogo')
            .orderBy('lastUpdate', 'desc')
            .limit(MAX_POPUPS)
            .get(); [cite: 17]
        const animes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })); [cite: 18]
        
        for (const anime of animes) {
            if (!anime.updateType || anime.updateType === 'Ninguna') continue; [cite: 19]
            let lastUpdateMs = anime.lastUpdate;
            if (anime.lastUpdate && typeof anime.lastUpdate.toMillis === 'function') {
                lastUpdateMs = anime.lastUpdate.toMillis(); [cite: 20]
            } else if (typeof anime.lastUpdate === 'number') {
                lastUpdateMs = anime.lastUpdate; [cite: 21]
            } else {
                lastUpdateMs = Date.now(); [cite: 22]
            }

            const notifId = `${anime.id}_${lastUpdateMs}`; [cite: 23]
            if (notificationsHistory.some(n => n.notifId === notifId)) continue; [cite: 24]

            const newNotif = {
                notifId,
                animeId: anime.id,
                title: anime.title,
                img: anime.img,
                seasonCover: anime.latestSeasonCover || anime.img, [cite: 24, 25]
                blockName: anime.latestBlockName || "", [cite: 25, 26]
                epTitle: anime.latestEpTitle || "Nuevo Contenido", [cite: 26, 27]
                type: anime.updateType,
                date: lastUpdateMs,
                seen: true,
                isFinal: anime.isFinal || false, [cite: 27, 28]
                popupShown: false
            };
            notificationsHistory.unshift(newNotif); [cite: 29]
            if (notificationsHistory.length > 50) notificationsHistory.pop();

            let seenNotifIds = JSON.parse(localStorage.getItem('archinime_seen_notif_ids')) || []; [cite: 29]
            if (!seenNotifIds.includes(notifId)) {
                seenNotifIds.push(notifId); [cite: 30]
                if (seenNotifIds.length > 1000) seenNotifIds = seenNotifIds.slice(-1000); [cite: 31]
                localStorage.setItem('archinime_seen_notif_ids', JSON.stringify(seenNotifIds));
            }

            if (popupsShownCount < MAX_POPUPS && notificationQueue.length < MAX_POPUPS) {
                notificationQueue.push(newNotif); [cite: 31]
                popupsShownCount++; [cite: 32]
            }
        }

        saveHistoryToStorage();
        renderNotificationList(); [cite: 32]
        updateBellBadge(); [cite: 33]

        if (notificationQueue.length > 0) {
            showNextPopup(); [cite: 33]
        }
    } catch (error) {
        console.error("❌ Error al obtener los últimos animes para primera visita:", error); [cite: 34]
    }
}

function loadHistoryFromStorage() {
    const stored = localStorage.getItem('archinime_notif_history'); [cite: 35]
    if (stored) {
        try { 
            notificationsHistory = JSON.parse(stored); [cite: 36]
            if (notificationsHistory.length > 50) notificationsHistory = notificationsHistory.slice(0, 50); [cite: 37]
        } catch(e) { notificationsHistory = []; } [cite: 38]
    }
}

function saveHistoryToStorage() {
    localStorage.setItem('archinime_notif_history', JSON.stringify(notificationsHistory));
    let seenNotifIds = JSON.parse(localStorage.getItem('archinime_seen_notif_ids')) || [];
    updateBellBadge();
    const user = getCurrentUser(); [cite: 38, 39]
    if (user) {
        db.collection('users').doc(user.uid).set({
            notifHistory: notificationsHistory,
            seenNotifIds: seenNotifIds
        }, { merge: true }).catch(e => console.error("Error guardando en nube", e)); [cite: 40]
    }
}

async function syncNotificationsWithCloud(uid) {
    try {
        const doc = await db.collection('users').doc(uid).get(); [cite: 40, 41]
        let isNewUser = !doc.exists;

        if (doc.exists) {
            const data = doc.data(); [cite: 41, 42]
            if (data.seenNotifIds) {
                let localSeen = JSON.parse(localStorage.getItem('archinime_seen_notif_ids')) || []; [cite: 42, 43]
                let merged = Array.from(new Set([...localSeen, ...data.seenNotifIds])).slice(-1000);
                localStorage.setItem('archinime_seen_notif_ids', JSON.stringify(merged));
            }
            if (data.notifHistory) {
                let merged = [...notificationsHistory, ...data.notifHistory];
                let unique = new Map(); [cite: 44]
                merged.forEach(n => unique.set(n.notifId, n));
                notificationsHistory = Array.from(unique.values()).sort((a,b) => b.date - a.date).slice(0, 50); [cite: 45]
            }
        }

        if (isNewUser && notificationsHistory.length > 0) {
            let changed = false; [cite: 45, 46]
            for (let notif of notificationsHistory) {
                if (!notif.seen) {
                    notif.seen = true; [cite: 46]
                    changed = true; [cite: 47]
                }
            }
            if (changed) saveHistoryToStorage(); [cite: 47, 48]
        }

        saveHistoryToStorage();
        renderNotificationList();
        updateBellBadge(); [cite: 48]
    } catch (e) { console.error("Error sync notif:", e); } [cite: 49]
}

function listenForReplies(uid) {
    if (repliesUnsubscribe) repliesUnsubscribe();
    repliesUnsubscribe = db.collection('comments')
        .where('replyToUserId', '==', uid)
        .orderBy('timestamp', 'desc')
        .limit(20)
        .onSnapshot(async snapshot => { [cite: 49, 50]
            let hasNew = false;
            let shouldShowPopup = false;
            
            for (const change of snapshot.docChanges()) {
                if (change.type === 'added') {
                    const data = change.doc.data();
                    if (data.userId === uid) continue; [cite: 50, 51]
                    
                    const docId = change.doc.id;
                    const notifId = `reply_${docId}`;
                    if (notificationsHistory.some(n => n.notifId === notifId)) continue; [cite: 52]
                    
                    let rawText = data.texto || "";
                    let cleanText = rawText.replace(/\[Sticker\]\([^)]+\)/g, '🖼️ (Sticker)').trim(); [cite: 53]
                    if (!cleanText) cleanText = "🖼️ (Sticker)";
                    
                    let originalText = data.replyToText || data.textoOriginal || ""; [cite: 54]
                    if (!originalText && data.replyToId) {
                        try {
                            const parentDoc = await db.collection('comments').doc(data.replyToId).get(); [cite: 55]
                            if (parentDoc.exists) {
                                let pText = parentDoc.data().texto || ""; [cite: 56]
                                originalText = pText.replace(/\[Sticker\]\([^)]+\)/g, '🖼️ (Sticker)').trim();
                            }
                        } catch(e) { console.error("Error obteniendo comentario padre:", e); } [cite: 57]
                    }

                    let timestampMs = data.timestamp?.toMillis() || Date.now(); [cite: 58]
         
                    const newNotif = {
                        notifId, 
                        type: 'RESPUESTA', 
                        animeId: data.animeId,
                        title: `¡${data.userName} te respondió!`, [cite: 59]
                        img: data.userAvatar || 'invitado.avif', [cite: 60]
                        seasonCover: data.userAvatar || 'invitado.avif', [cite: 61]
                        blockName: 'Foro',
                        epTitle: `"${cleanText.substring(0,80)}${cleanText.length>80?'...':''}"`,
                        originalText: originalText ? `"${originalText.substring(0,60)}${originalText.length>60?'...':''}"` : `"Comentario original no disponible"`, [cite: 62]
                        date: timestampMs,
                        seen: false,
                        isFinal: false,
                        url: `video-player.html?anime=${data.animeId}&s=${data.season}&e=${data.episode}&targetComment=${docId}` [cite: 63]
                    };
                    notificationsHistory.unshift(newNotif); [cite: 64]
                    hasNew = true;

                    let seenNotifIds = JSON.parse(localStorage.getItem('archinime_seen_notif_ids')) || []; [cite: 65]
                    const isFirstVisitGlobal = !localStorage.getItem('archinime_notif_first_visit');
                    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000); [cite: 66]
                    if (!seenNotifIds.includes(notifId)) {
                        seenNotifIds.push(notifId); [cite: 67]
                        if (seenNotifIds.length > 1000) seenNotifIds = seenNotifIds.slice(-1000);
                        localStorage.setItem('archinime_seen_notif_ids', JSON.stringify(seenNotifIds));

                        if (!isFirstVisitGlobal && timestampMs > thirtyDaysAgo && popupsShownCount < MAX_POPUPS && notificationQueue.length < MAX_POPUPS) {
                            notificationQueue.push(newNotif); [cite: 68]
                            popupsShownCount++;
                            shouldShowPopup = true;
                        }
                    }
                }
            }
            
            if (hasNew) {
                notificationsHistory = notificationsHistory.slice(0, 50); [cite: 69]
                saveHistoryToStorage();
                renderNotificationList();
                if (!isMenuOpen) updateBellBadge();
            }

            if (shouldShowPopup && notificationQueue.length === 1) {
                showNextPopup(); [cite: 70]
            }
        }, error => console.error("Error replies:", error)); [cite: 71]
}

function listenForCatalogUpdates() {
    if (catalogoUnsubscribe) catalogoUnsubscribe();
    catalogoUnsubscribe = db.collection('catalogo')
        .orderBy('lastUpdate', 'desc')
        .limit(50)
        .onSnapshot(snapshot => {
            snapshot.docChanges().forEach(change => {
                if (change.type === 'added' || change.type === 'modified') {
                    const anime = { id: change.doc.id, ...change.doc.data() }; [cite: 72]
                    if (anime.updateType && anime.updateType !== 'Ninguna') {
                        procesarActualizacionCatalogo(anime);
                    }
                }
            }); [cite: 73]
        }, error => console.error('❌ Error escuchando catálogo:', error)); [cite: 74]
}

function procesarActualizacionCatalogo(anime) {
    let lastUpdateMs = anime.lastUpdate; [cite: 75]
    if (anime.lastUpdate && typeof anime.lastUpdate.toMillis === 'function') {
        lastUpdateMs = anime.lastUpdate.toMillis(); [cite: 76]
    } else if (typeof anime.lastUpdate === 'number') {
        lastUpdateMs = anime.lastUpdate; [cite: 77]
    } else {
        lastUpdateMs = Date.now(); [cite: 78]
    }
    
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000); [cite: 79]
    if (lastUpdateMs < thirtyDaysAgo) return;
    
    const notifId = `${anime.id}_${lastUpdateMs}`;
    let seenNotifIds = JSON.parse(localStorage.getItem('archinime_seen_notif_ids')) || [];
    if (seenNotifIds.includes(notifId)) return; [cite: 80]
    
    const isFirstVisitGlobal = !localStorage.getItem('archinime_notif_first_visit');
    const markAsSeen = isFirstVisitGlobal;
    
    seenNotifIds.push(notifId);
    if (seenNotifIds.length > 1000) seenNotifIds = seenNotifIds.slice(-1000);
    localStorage.setItem('archinime_seen_notif_ids', JSON.stringify(seenNotifIds)); [cite: 81]
    if (notificationsHistory.some(n => n.notifId === notifId)) return;
    
    const newNotif = {
        notifId, animeId: anime.id, title: anime.title, img: anime.img,
        seasonCover: anime.latestSeasonCover || anime.img, [cite: 82]
        blockName: anime.latestBlockName || "", [cite: 83]
        epTitle: anime.latestEpTitle || "Nuevo Contenido", [cite: 84]
        type: anime.updateType,
        date: lastUpdateMs,
        seen: markAsSeen,
        isFinal: anime.isFinal || false, [cite: 85]
        popupShown: false
    };
    
    notificationsHistory.unshift(newNotif); [cite: 86]
    if (notificationsHistory.length > 50) notificationsHistory = notificationsHistory.slice(0, 50);
    
    const shouldEnqueuePopup = (!isFirstVisitGlobal && popupsShownCount < MAX_POPUPS && notificationQueue.length < MAX_POPUPS); [cite: 87]
    if (shouldEnqueuePopup) {
        notificationQueue.push(newNotif);
        popupsShownCount++; [cite: 88]
    }
    
    saveHistoryToStorage();
    renderNotificationList();
    updateBellBadge(); [cite: 89, 90]
    if (shouldEnqueuePopup && notificationQueue.length === 1) {
        showNextPopup(); [cite: 91]
    }
}

window.startNotificationSequence = () => {
    pageFullyLoaded = true;
    showNextPopup(); [cite: 92]
};

function showNextPopup() {
    if (!pageFullyLoaded) return;
    if (notificationQueue.length) createPopupHTML(notificationQueue[0]); [cite: 93]
}

// CORRECCIÓN AQUÍ: Función createPopupHTML corregida para mostrar "FINALIZADO"
function createPopupHTML(notif) {
    const existing = document.getElementById('eventModal');
    if (existing) existing.remove();
    const modal = document.createElement('div');
    modal.id = 'eventModal'; [cite: 94]

    if (notif.type === 'RESPUESTA') {
        modal.innerHTML = `
            <div class="event-card" style="border: 1px solid var(--neon-cyan); box-shadow: 0 10px 40px rgba(0, 243, 255, 0.15); background: #0a0a0f; overflow: hidden; border-radius: 20px; max-width: 420px; width: 90%;">
              <button class="event-close" onclick="closePopup()" aria-label="Cerrar" style="background: rgba(0,0,0,0.5); border: 1px solid var(--neon-cyan); color: var(--neon-cyan); top: 15px; right: 15px; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; z-index: 10;"><i class="fas fa-times"></i></button>
              <div style="background: linear-gradient(135deg, rgba(0,243,255,0.1) 0%, transparent 100%); padding: 25px 20px 15px; border-bottom: 1px solid rgba(0, 243, 255, 0.15); display: flex; align-items: center; gap: 15px; position: relative;">
                <div style="position: relative; flex-shrink: 0;">
                    <img src="${notif.img}" alt="Avatar Usuario" style="width: 60px; height: 60px; border-radius: 50%; object-fit: cover; border: 2px solid var(--neon-cyan); box-shadow: 0 0 15px rgba(0,243,255,0.4);">
                    <div style="position: absolute; bottom: -2px; right: -2px; background: #0a0a0f; border-radius: 50%; padding: 4px; border: 1px solid var(--neon-cyan); display: flex; align-items: center; justify-content: center; width: 22px; height: 22px;">
                        <i class="fas fa-reply" style="color: var(--neon-cyan); font-size: 0.65rem;"></i>
                    </div>
                </div>
                <div style="flex: 1; text-align: left; padding-right: 20px; overflow: hidden;">
                    <div style="color: var(--neon-cyan); font-family: 'Orbitron', sans-serif; font-size: 0.7rem; font-weight: 800; letter-spacing: 1px; margin-bottom: 3px;">NUEVA RESPUESTA</div>
                    <h2 style="font-size: 1.05rem; color: #fff; margin: 0; font-weight: 700; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${notif.title}</h2>
                </div>
              </div>
              <div style="padding: 20px; text-align: left;">
                <div style="background: rgba(255,255,255,0.03); border-left: 3px solid rgba(255,255,255,0.15); padding: 12px 15px; border-radius: 0 8px 8px 0; margin-bottom: 15px; position: relative;">
                    <i class="fas fa-quote-left" style="position: absolute; top: 10px; right: 15px; font-size: 1.2rem; color: rgba(255,255,255,0.03);"></i>
                    <div style="font-size: 0.7rem; color: rgba(255,255,255,0.5); margin-bottom: 6px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Tu comentario</div>
                    <span style="font-size: 0.85rem; color: #aaa; font-style: italic; display: block; padding-right: 20px; line-height: 1.4;">${notif.originalText}</span>
                </div>
                <div style="background: rgba(0, 243, 255, 0.05); border: 1px solid rgba(0, 243, 255, 0.15); padding: 15px; border-radius: 12px; margin-bottom: 20px;">
                    <p style="color: #fff; font-size: 0.95rem; margin: 0; line-height: 1.5; word-wrap: break-word;">${notif.epTitle}</p>
                </div>
                <button class="event-btn" style="background: var(--neon-cyan); color: #000; box-shadow: 0 0 15px rgba(0, 243, 255, 0.3); border-radius: 10px; font-size: 0.85rem; padding: 12px; width: 100%; border: none; font-weight: 800; font-family: 'Orbitron', sans-serif; cursor: pointer; transition: 0.2s; display: flex; align-items: center; justify-content: center; gap: 8px;" onclick="goToAnimeFromPopup('${notif.animeId}', '${notif.notifId}')"><i class="fas fa-comments"></i> VER CONVERSACIÓN</button>
              </div>
            </div>`; [cite: 95, 118]
    } else {
        let infoString = "";
        if (notif.blockName && notif.blockName !== "Novedad") infoString += `<span style="color:var(--neon-cyan)">${notif.blockName}</span>`;
        if (notif.epTitle && notif.epTitle !== "Nuevo Contenido") infoString += (infoString?" • ":"") + `<span style="color:#fff">${notif.epTitle}</span>`;
        else if (!infoString) infoString = "Nuevo Contenido";
        
        let badgeColor = "#bc13fe";
        if (notif.type.includes("ESTRENO")) badgeColor = "#ff0055";
        else if (notif.type.includes("PRÓXIMAMENTE")) badgeColor = "#f1c40f";
  
        modal.innerHTML = `
            <div class="event-card">
              <button class="event-close" onclick="closePopup()" aria-label="Cerrar"><i class="fas fa-times"></i></button>
              <div class="event-visuals">
                <div class="visual-bg" style="background-image: url('${notif.img}');"></div>
                <div class="covers-container">
                    <img src="${notif.img}" class="cover-back" alt="Poster">
                    <img src="${notif.seasonCover}" class="cover-front" alt="Season">
                </div>
                <div class="event-type-badge" style="background: ${badgeColor}; box-shadow: 0 0 15px ${badgeColor};">${notif.type}</div>
                ${notif.isFinal ? '<div class="final-stamp">FINALIZADO</div>' : ''} 
              </div>
              <div class="event-info">
                <h2 class="event-title">${notif.title}</h2>
                <div class="event-meta">${infoString}</div>
                <p class="event-desc">¡Ya disponible en la plataforma! Disfruta del estreno.</p>
                <button class="event-btn" onclick="goToAnimeFromPopup('${notif.animeId}', '${notif.notifId}')"><i class="fas fa-play"></i> VER AHORA</button>
              </div>
            </div>`; [cite: 120, 122]
    }

    document.body.appendChild(modal);
    if (typeof disableBodyScroll === 'function') disableBodyScroll();
    setTimeout(() => modal.classList.add('show'), 50);
}

function closePopup() {
    const modal = document.getElementById('eventModal');
    if (!modal) return;
    modal.classList.remove('show');
    setTimeout(() => {
        modal.remove();
        notificationQueue.shift();
        if (typeof enableBodyScroll === 'function') enableBodyScroll();
        showNextPopup(); [cite: 123]
    }, 300);
}

function goToAnimeFromPopup(animeId, notifId) {
    const targetNotif = notificationsHistory.find(n => n.notifId === notifId);
    if (targetNotif && !targetNotif.seen) markAsRead(notifId); [cite: 124]
    notificationQueue = [];
    if (typeof enableBodyScroll === 'function') enableBodyScroll();
    if (targetNotif && targetNotif.url) {
        window.location.href = targetNotif.url; [cite: 126]
    } else {
        window.location.href = `anime-detail.html?id=${animeId}`; [cite: 127]
    }
}

function toggleNotifMenu() {
    const menu = document.getElementById('notifMenu');
    isMenuOpen = !isMenuOpen; [cite: 128]
    if (isMenuOpen) {
        menu.classList.add('active');
        renderNotificationList(); [cite: 129]
    } else {
        menu.classList.remove('active'); [cite: 130]
    }
}

document.addEventListener('click', (e) => {
    const wrapper = document.querySelector('.notif-wrapper');
    const menu = document.getElementById('notifMenu');
    if (wrapper && !wrapper.contains(e.target) && isMenuOpen) {
        isMenuOpen = false;
        if(menu) menu.classList.remove('active');
    }
});

function markAllAsRead() {
    let changed = false; [cite: 132]
    for (let notif of notificationsHistory) {
        if (!notif.seen) {
            notif.seen = true;
            changed = true; [cite: 133]
        }
    }
    if (changed) {
        saveHistoryToStorage();
        renderNotificationList();
        updateBellBadge(); [cite: 134]
    }
}

function renderNotificationList() {
    const container = document.getElementById('notifList'); [cite: 135]
    if (!container) return;
    requestAnimationFrame(() => {
        const header = document.querySelector('#notifMenu .notif-header');
        if (header && !header.querySelector('.mark-all-btn')) {
            const btn = document.createElement('button');
            btn.className = 'mark-all-btn';
            btn.innerHTML = '<i class="fas fa-check-double"></i> Marcar todo';
            btn.onclick = (e) => { e.stopPropagation(); markAllAsRead(); }; [cite: 136]
            header.appendChild(btn);
        }

        if (!notificationsHistory.length) {
            container.innerHTML = '<div class="empty-notif"><i class="fas fa-satellite-dish"></i><br>Sin novedades por ahora.</div>'; [cite: 142]
            return;
        }
        const visible = notificationsHistory.slice(0, 30);
        const fragment = document.createDocumentFragment(); [cite: 143]
        visible.forEach(item => {
            const div = document.createElement('div');
            div.className = 'notif-item';
            let infoString = "";
            if (item.blockName && item.blockName !== "Novedad") infoString += `<span class="n-block">${item.blockName}</span>`; [cite: 144]
            if (item.epTitle && item.epTitle !== "Nuevo Contenido") infoString += (infoString?" ":"") + `<span class="n-ep-title">${item.epTitle}</span>`;
            
            let typeColor = "var(--neon-purple)";
            if (item.type.includes("ESTRENO")) typeColor = "var(--neon-pink)";
            else if (item.type.includes("PRÓXIMAMENTE")) typeColor = "var(--neon-yellow)";
            else if (item.type === "RESPUESTA") typeColor = "var(--neon-cyan)"; [cite: 145]
            
            div.innerHTML = `<div style="position:relative; display:inline-block;">${!item.seen?'<div class="unread-dot"></div>':''}<div class="notif-img-box"><img src="${item.seasonCover}" alt="cover"></div></div>
                <div class="notif-content"><div class="notif-header-line"><span class="n-title">${item.title}</span></div><div class="n-type" style="color:${typeColor}">${item.type} ${item.isFinal?'<span class="tag-final">FINALIZADO</span>':''}</div><div class="n-meta">${infoString}</div></div>`; [cite: 147]
            div.addEventListener('click', () => {
                if (!item.seen) { markAsRead(item.notifId); item.seen = true; }
                location.href = item.url || `anime-detail.html?id=${item.animeId}`; [cite: 148]
            });
            fragment.appendChild(div);
        });
        container.innerHTML = '';
        container.appendChild(fragment); [cite: 149]
    });
}

function updateBellBadge() {
    const unread = notificationsHistory.filter(n => !n.seen).length; [cite: 151]
    const badge = document.getElementById('notifBadge');
    if (badge) {
        badge.style.display = unread ? 'flex' : 'none'; [cite: 152]
        if (unread) badge.textContent = unread > 9 ? '+9' : unread; [cite: 153]
    }
}

function markAsRead(notifId) {
    const target = notificationsHistory.find(n => n.notifId === notifId); [cite: 154]
    if (target && !target.seen) {
        target.seen = true;
        saveHistoryToStorage();
        updateBellBadge();
        renderNotificationList(); [cite: 155]
    }
}

window.toggleNotifMenu = toggleNotifMenu;
window.closePopup = closePopup;
window.goToAnimeFromPopup = goToAnimeFromPopup;
window.markAllAsRead = markAllAsRead;