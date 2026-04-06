// notification-system.js
/* Sistema de notificaciones combinado: actualizaciones de animes (localStorage + Firestore Sync) + respuestas en tiempo real */

let notificationQueue = [];
let notificationsHistory = [];
let isMenuOpen = false;
let repliesUnsubscribe = null;
let isFirstTimeSetup = false; // Nueva bandera

document.addEventListener('DOMContentLoaded', () => {
    loadHistoryFromStorage();
    
    if (typeof animes !== 'undefined') {
        checkForNewUpdates();
    } else {
        console.warn('Sistema de Notificaciones: index-data.js no cargado.');
    }
    
    renderNotificationList();
    updateBellBadge();

    if (typeof firebase !== 'undefined' && typeof auth !== 'undefined' && typeof db !== 'undefined') {
        auth.onAuthStateChanged(user => {
            if (user) {
                syncNotificationsWithCloud(user.uid);
                listenForReplies(user.uid);
            } else {
                if (repliesUnsubscribe) repliesUnsubscribe();
            }
        });
    }
});

// --- Almacenamiento local ---
function loadHistoryFromStorage() {
    const stored = localStorage.getItem('archinime_notif_history');
    if (stored) {
        try { 
            notificationsHistory = JSON.parse(stored);
        } catch(e) { 
            notificationsHistory = [];
        }
    }
}

function saveHistoryToStorage() {
    localStorage.setItem('archinime_notif_history', JSON.stringify(notificationsHistory));
    
    let seenNotifIds = JSON.parse(localStorage.getItem('archinime_seen_notif_ids')) || [];
    updateBellBadge();
    
    if (typeof auth !== 'undefined' && auth.currentUser && typeof db !== 'undefined') {
        db.collection('users').doc(auth.currentUser.uid).set({
            notifHistory: notificationsHistory,
            seenNotifIds: seenNotifIds
        }, { merge: true }).catch(e => console.error("Error guardando notifs en la nube", e));
    }
}

// --- Sincronización con la nube ---
async function syncNotificationsWithCloud(uid) {
    try {
        const docRef = db.collection('users').doc(uid);
        const doc = await docRef.get();
        if (doc.exists) {
            const data = doc.data();
            if (data.seenNotifIds) {
                let localSeen = JSON.parse(localStorage.getItem('archinime_seen_notif_ids')) || [];
                let mergedSeen = Array.from(new Set([...localSeen, ...data.seenNotifIds]));
                if (mergedSeen.length > 1000) mergedSeen = mergedSeen.slice(-1000);
                localStorage.setItem('archinime_seen_notif_ids', JSON.stringify(mergedSeen));
            }
            if (data.notifHistory) {
                const cloudHistory = data.notifHistory || [];
                let localSeen = JSON.parse(localStorage.getItem('archinime_seen_notif_ids')) || [];
                let newQueue = [];
                notificationQueue.forEach(q => {
                    const inCloud = cloudHistory.find(c => c.notifId === q.notifId);
                    if (!inCloud && !localSeen.includes(q.notifId)) {
                        newQueue.push(q);
                    }
                });
                notificationQueue = newQueue;

                let merged = [...notificationsHistory, ...cloudHistory];
                let uniqueMap = new Map();
                merged.forEach(n => {
                    if (uniqueMap.has(n.notifId)) {
                        if (n.seen) uniqueMap.set(n.notifId, n);
                    } else {
                        uniqueMap.set(n.notifId, n);
                    }
                });
                notificationsHistory = Array.from(uniqueMap.values()).sort((a,b) => b.date - a.date).slice(0, 50);
            }
        }
        saveHistoryToStorage();
        renderNotificationList();
        updateBellBadge();
    } catch (e) {
        console.error("Error sincronizando notificaciones:", e);
    }
}

// --- Escucha respuestas en tiempo real ---
function listenForReplies(uid) {
    if (repliesUnsubscribe) repliesUnsubscribe();
    repliesUnsubscribe = db.collection('comments')
        .where('replyToUserId', '==', uid)
        .orderBy('timestamp', 'desc')
        .limit(20)
        .onSnapshot(snapshot => {
            let hasNew = false;
            snapshot.docChanges().forEach(change => {
                if (change.type === 'added') {
                    const data = change.doc.data();
                    if (data.userId === uid) return;
                    const docId = change.doc.id;
                    const notifId = `reply_${docId}`;
                    const alreadyExists = notificationsHistory.some(n => n.notifId === notifId);
                    if (!alreadyExists) {
                        let rawText = data.texto || "";
                        let cleanText = rawText.replace(/\[Sticker\]\([^)]+\)/g, '🖼️ (Sticker)').trim();
                        if (cleanText.length === 0) cleanText = "🖼️ (Sticker)";
                        const newNotif = {
                            notifId: notifId,
                            type: 'RESPUESTA',
                            animeId: data.animeId,
                            title: `¡${data.userName} te respondió!`,
                            img: data.userAvatar || 'invitado.avif',
                            seasonCover: data.userAvatar || 'invitado.avif',
                            blockName: 'Foro',
                            epTitle: `"${cleanText.substring(0, 35)}${cleanText.length > 35 ? '...' : ''}"`,
                            date: data.timestamp ? data.timestamp.toMillis() : Date.now(),
                            seen: false,
                            isFinal: false,
                            url: `video-player.html?anime=${data.animeId}&s=${data.season}&e=${data.episode}&targetComment=${docId}`
                        };
                        notificationsHistory.unshift(newNotif);
                        hasNew = true;
                    }
                }
            });
            if (hasNew) {
                if (notificationsHistory.length > 50) notificationsHistory = notificationsHistory.slice(0, 50);
                saveHistoryToStorage();
                renderNotificationList();
                if (!isMenuOpen) updateBellBadge();
            }
        }, error => {
            console.error("Error al escuchar respuestas:", error);
        });
}

// --- Detección de nuevos animes / actualizaciones (MODIFICADO para usuarios nuevos) ---
function checkForNewUpdates() {
    const updatedAnimes = animes.filter(a => a.lastUpdate && a.updateType);
    updatedAnimes.sort((a, b) => b.lastUpdate - a.lastUpdate);

    let seenNotifIds = JSON.parse(localStorage.getItem('archinime_seen_notif_ids')) || [];
    let hasChanges = false;
    
    // Detectar si es la primera vez (sin historial y sin IDs vistos)
    const isFirstVisit = (notificationsHistory.length === 0 && seenNotifIds.length === 0);
    
    // Para primera visita: solo mostraremos los últimos 5 como popups, todo lo demás se marca como visto
    if (isFirstVisit) {
        console.log("Primera visita del usuario: marcando notificaciones antiguas como leídas");
        const newNotifsToAdd = [];
        const popupsToQueue = [];
        
        // Tomar los últimos 5 más recientes para popups
        const latestFive = updatedAnimes.slice(0, 5);
        const rest = updatedAnimes.slice(5);
        
        // Procesar los últimos 5 (popups)
        latestFive.forEach(anime => {
            const notifId = `${anime.id}_${anime.lastUpdate}`;
            if (!seenNotifIds.includes(notifId)) {
                seenNotifIds.push(notifId);
                hasChanges = true;
                const newNotif = {
                    notifId: notifId,
                    animeId: anime.id,
                    title: anime.title,
                    img: anime.img,
                    seasonCover: anime.latestSeasonCover || anime.img,
                    blockName: anime.latestBlockName || "",
                    epTitle: anime.latestEpTitle || "Nuevo Contenido",
                    type: anime.updateType,
                    date: anime.lastUpdate,
                    seen: true,      // IMPORTANTE: ya se considera visto para el badge
                    isFinal: anime.isFinal || false,
                    popupShown: true
                };
                newNotifsToAdd.push(newNotif);
                popupsToQueue.push(newNotif);
            }
        });
        
        // Procesar el resto (más antiguos) -> solo se agregan al historial como vistos
        rest.forEach(anime => {
            const notifId = `${anime.id}_${anime.lastUpdate}`;
            if (!seenNotifIds.includes(notifId)) {
                seenNotifIds.push(notifId);
                hasChanges = true;
                const newNotif = {
                    notifId: notifId,
                    animeId: anime.id,
                    title: anime.title,
                    img: anime.img,
                    seasonCover: anime.latestSeasonCover || anime.img,
                    blockName: anime.latestBlockName || "",
                    epTitle: anime.latestEpTitle || "Nuevo Contenido",
                    type: anime.updateType,
                    date: anime.lastUpdate,
                    seen: true,
                    isFinal: anime.isFinal || false,
                    popupShown: false
                };
                newNotifsToAdd.push(newNotif);
            }
        });
        
        if (newNotifsToAdd.length > 0) {
            notificationsHistory = [...newNotifsToAdd, ...notificationsHistory];
            if (notificationsHistory.length > 50) notificationsHistory = notificationsHistory.slice(0, 50);
            saveHistoryToStorage();
            // Agregar a la cola de popups solo los últimos 5
            notificationQueue = notificationQueue.concat(popupsToQueue.slice(0, 5));
        }
    } 
    else {
        // Lógica normal para usuarios ya existentes (solo los realmente nuevos)
        updatedAnimes.forEach(anime => {
            if (anime.updateType.includes("ACTUALIZACIÓN")) return;
            if (anime.updateType === "Ninguna") return;
            const notifId = `${anime.id}_${anime.lastUpdate}`;
            if (!seenNotifIds.includes(notifId)) {
                seenNotifIds.push(notifId);
                hasChanges = true;
                const existsInHistory = notificationsHistory.some(n => n.notifId === notifId);
                if (!existsInHistory) {
                    const newNotif = {
                        notifId: notifId,
                        animeId: anime.id,
                        title: anime.title,
                        img: anime.img,
                        seasonCover: anime.latestSeasonCover || anime.img,
                        blockName: anime.latestBlockName || "",
                        epTitle: anime.latestEpTitle || "Nuevo Contenido",
                        type: anime.updateType,
                        date: anime.lastUpdate,
                        seen: false,
                        isFinal: anime.isFinal || false,
                        popupShown: true
                    };
                    notificationsHistory.unshift(newNotif);
                    notificationQueue.push(newNotif);
                }
            }
        });
        
        if (hasChanges) {
            if (notificationsHistory.length > 50) notificationsHistory = notificationsHistory.slice(0, 50);
            saveHistoryToStorage();
        }
    }
    
    // Guardar IDs vistos
    if (hasChanges) {
        if (seenNotifIds.length > 1000) seenNotifIds = seenNotifIds.slice(-1000);
        localStorage.setItem('archinime_seen_notif_ids', JSON.stringify(seenNotifIds));
    }
}

// --- Iniciar secuencia de popups ---
window.startNotificationSequence = function() {
    showNextPopup();
};

function showNextPopup() {
    if (notificationQueue.length === 0) return;
    const notif = notificationQueue[0];
    createPopupHTML(notif);
}

function createPopupHTML(notif) {
    const existing = document.getElementById('eventModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'eventModal';
    const indieMessage = "¡Ya disponible en la plataforma! Disfruta del estreno.";
    let infoString = "";
    if (notif.blockName && notif.blockName !== "Novedad") {
        infoString += `<span style="color:var(--neon-cyan)">${notif.blockName}</span>`;
    }
    if (notif.epTitle && notif.epTitle !== "Nuevo Contenido") {
        if (infoString !== "") infoString += " • ";
        infoString += `<span style="color:#fff">${notif.epTitle}</span>`;
    } else if (infoString === "") {
        infoString = "Nuevo Contenido";
    }

    let badgeClass = "badge-default";
    if (notif.type.includes("ESTRENO")) badgeClass = "badge-estreno";
    else if (notif.type.includes("PRÓXIMAMENTE")) badgeClass = "badge-prox";
    
    let finalImgHTML = '';
    if (notif.isFinal) {
        finalImgHTML = `<div class="final-stamp">FINALIZADO</div>`;
    }

    modal.innerHTML = `
        <div class="event-card">
            <button class="event-close" onclick="closePopup()" aria-label="Cerrar">
                <i class="fas fa-times"></i>
            </button>
            <div class="event-visuals">
                <div class="visual-bg" style="background-image: url('${notif.img}');"></div>
                <div class="covers-container">
                    <img src="${notif.img}" class="cover-back" alt="Poster">
                    <img src="${notif.seasonCover}" class="cover-front" alt="Season">
                </div>
                <div class="event-type-badge ${badgeClass}">${notif.type}</div>
                ${finalImgHTML}
            </div>
            <div class="event-info">
                <h2 class="event-title">${notif.title}</h2>
                <div class="event-meta">${infoString}</div>
                <p class="event-desc">${indieMessage}</p>
                <button class="event-btn" onclick="goToAnimeFromPopup('${notif.animeId}', '${notif.notifId}')">
                    <i class="fas fa-play"></i> VER AHORA
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    setTimeout(() => modal.classList.add('show'), 50);
}

function closePopup() {
    const modal = document.getElementById('eventModal');
    if (modal) {
        modal.classList.remove('show');
        setTimeout(() => {
            modal.remove();
            const processed = notificationQueue.shift();
            // Solo marcar como leído si aún no lo estaba (para no duplicar)
            if (processed && !processed.seen) {
                markAsRead(processed.notifId);
            }
            showNextPopup();
        }, 300);
    }
}

function goToAnimeFromPopup(animeId, notifId) {
    if (!notificationsHistory.find(n => n.notifId === notifId)?.seen) {
        markAsRead(notifId);
    }
    notificationQueue = [];
    window.location.href = `anime-detail.html?id=${animeId}`;
}

// --- Menú de notificaciones (campana) ---
function toggleNotifMenu() {
    const menu = document.getElementById('notifMenu');
    isMenuOpen = !isMenuOpen;
    if (isMenuOpen) {
        menu.classList.add('active');
        renderNotificationList();
    } else {
        menu.classList.remove('active');
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

// --- Renderizado de la lista de notificaciones con el punto en la esquina de la imagen ---
function renderNotificationList() {
    const listContainer = document.getElementById('notifList');
    if (!listContainer) return;
    
    listContainer.innerHTML = '';
    if (notificationsHistory.length === 0) {
        listContainer.innerHTML = '<div class="empty-notif"><i class="fas fa-satellite-dish"></i><br>Sin novedades por ahora.</div>';
        return;
    }

    const sortedHistory = [...notificationsHistory].sort((a, b) => b.date - a.date);
    sortedHistory.forEach(item => {
        const div = document.createElement('div');
        div.className = 'notif-item';
        
        let imgBoxClass = 'notif-img-box';
        if (item.type === 'RESPUESTA') {
            imgBoxClass += ' rounded-avatar';
        }
  
        let infoString = "";
        if (item.blockName && item.blockName !== "Novedad") {
            infoString += `<span class="n-block">${item.blockName}</span>`;
        }
        if (item.epTitle && item.epTitle !== "Nuevo Contenido") {
            if (infoString !== "") infoString += " ";
            infoString += `<span class="n-ep-title">${item.epTitle}</span>`;
        } else if (infoString === "") {
            infoString = `<span class="n-ep-title">Nuevo Contenido</span>`;
        }

        let typeColor = "var(--neon-purple)";
        if (item.type.includes("ESTRENO")) typeColor = "var(--neon-pink)";
        else if (item.type.includes("PRÓXIMAMENTE")) typeColor = "var(--neon-yellow)";
        else if (item.type === "RESPUESTA") typeColor = "var(--neon-cyan)";

        let finalLabel = item.isFinal ? `<span class="tag-final">FINALIZADO</span>` : "";
        
        // NUEVO: punto rojo dentro del contenedor de la imagen, esquina superior izquierda
        const unreadDot = !item.seen ? '<div class="unread-dot" style="position: absolute; top: -4px; left: -4px; width: 12px; height: 12px; background: var(--neon-pink); border-radius: 50%; box-shadow: 0 0 4px var(--neon-pink); z-index: 5; border: 1px solid rgba(0,0,0,0.3);"></div>' : '';
        
        div.innerHTML = `
            <div class="${imgBoxClass}" style="position: relative;">
                ${unreadDot}
                <img src="${item.seasonCover}" alt="cover">
            </div>
            <div class="notif-content">
                <div class="notif-header-line">
                    <span class="n-title">${item.title}</span>
                </div>
                <div class="n-type" style="color:${typeColor}">${item.type} ${finalLabel}</div>
                <div class="n-meta">${infoString}</div>
            </div>
        `;
        
        div.addEventListener('click', () => {
            if (!item.seen) {
                markAsRead(item.notifId);
                item.seen = true;
                updateBellBadge();
                // Refrescar visualmente el punto
                const imgBox = div.querySelector('.notif-img-box');
                if (imgBox) {
                    const dot = imgBox.querySelector('.unread-dot');
                    if (dot) dot.remove();
                }
            }
            if (item.url) {
                window.location.href = item.url;
            } else {
                window.location.href = `anime-detail.html?id=${item.animeId}`;
            }
        });
        listContainer.appendChild(div);
    });
}

function updateBellBadge() {
    const unread = notificationsHistory.filter(n => !n.seen).length;
    const badge = document.getElementById('notifBadge');
    if (badge) {
        if (unread > 0) {
            badge.style.display = 'flex';
            badge.textContent = unread > 9 ? '+9' : unread;
        } else {
            badge.style.display = 'none';
        }
    }
}

function markAsRead(notifId) {
    const target = notificationsHistory.find(n => n.notifId === notifId);
    if (target && !target.seen) {
        target.seen = true;
        saveHistoryToStorage();
        updateBellBadge();
        renderNotificationList(); // para refrescar la lista y eliminar el punto visual
    }
}