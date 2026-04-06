// notification-system.js
/* Sistema de notificaciones combinado: actualizaciones de animes (localStorage + Firestore Sync) + respuestas en tiempo real */

let notificationQueue = [];
// Solo para animes (popups) pendientes de mostrar
let notificationsHistory = [];
// Todas las notificaciones (animes + respuestas)
let isMenuOpen = false;
let repliesUnsubscribe = null;
// Listener de respuestas en Firestore

document.addEventListener('DOMContentLoaded', () => {
    loadHistoryFromStorage();
    
    if (typeof animes !== 'undefined') {
        checkForNewUpdates();
    } else {
        console.warn('Sistema de Notificaciones: index-data.js no cargado.');
    }
    
    renderNotificationList();
    updateBellBadge();

    // Conectar a Firebase si está disponible
    if (typeof firebase !== 'undefined' && typeof auth !== 'undefined' && typeof db !== 'undefined') {
        auth.onAuthStateChanged(user => {
            if (user) {
                // Sincroniza las notificaciones cruzadas con la cuenta
                syncNotificationsWithCloud(user.uid);
                listenForReplies(user.uid);
            } else {
                if (repliesUnsubscribe) repliesUnsubscribe();
            }
        });
    }
});

// --- Funciones de almacenamiento ---
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
    // Guardar en la nube si hay cuenta activa
    if (typeof auth !== 'undefined' && auth.currentUser && typeof db !== 'undefined') {
        db.collection('users').doc(auth.currentUser.uid).set({
            notifHistory: notificationsHistory,
            seenNotifIds: seenNotifIds
        }, { merge: true }).catch(e => console.error("Error guardando notifs en la nube", e));
    }
}

// --- Sincronización con la Nube ---
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

// --- Escucha de respuestas (Firestore) ---
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

// --- Detección de nuevos animes ---
function checkForNewUpdates() {
    const updatedAnimes = animes.filter(a => a.lastUpdate && a.updateType);
    updatedAnimes.sort((a, b) => b.lastUpdate - a.lastUpdate);

    let seenNotifIds = JSON.parse(localStorage.getItem('archinime_seen_notif_ids')) || [];
    let newItemsFound = [];
    let hasChanges = false;
    
    // MAGIA: Si el array está vacío, significa que es un usuario nuevo.
    const isFirstVisit = seenNotifIds.length === 0;

    updatedAnimes.forEach((anime, index) => {
        if (anime.updateType.includes("ACTUALIZACIÓN")) return;
        if (anime.updateType === "Ninguna") return;

        const notifId = `${anime.id}_${anime.lastUpdate}`;
        
        if (!seenNotifIds.includes(notifId)) {
            seenNotifIds.push(notifId);
            hasChanges = true;

            const existsInHistory = notificationsHistory.some(n => n.notifId === notifId);
            
            if (!existsInHistory) {
                // Si es un usuario nuevo y el anime no está en el top 5, lo marcamos como "leído" para no inflar la campanita
                const treatAsOld = isFirstVisit && index >= 5;

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
                    seen: treatAsOld, // Si es viejo para el nuevo usuario, se marca como leído (true)
                    isFinal: anime.isFinal || false,
                    popupShown: true 
                };
             
                notificationsHistory.push(newNotif);
                
                // Solo guardamos en cola de popups los que NO han sido marcados como leídos por defecto
                if (!treatAsOld) {
                    newItemsFound.push(newNotif);
                }
            }
        }
    });
    
    if (hasChanges) {
        if (seenNotifIds.length > 1000) seenNotifIds = seenNotifIds.slice(-1000);
        localStorage.setItem('archinime_seen_notif_ids', JSON.stringify(seenNotifIds));
        
        // Ordenamos las notificaciones del más reciente al más antiguo
        notificationsHistory.sort((a, b) => b.date - a.date);
        if (notificationsHistory.length > 50) notificationsHistory = notificationsHistory.slice(0, 50);
        saveHistoryToStorage();
    }
    
    if (newItemsFound.length > 0) {
        const newPopups = newItemsFound.slice(0, 5);
        notificationQueue = notificationQueue.concat(newPopups);
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
            if (processed) markAsRead(processed.notifId);
            showNextPopup();
        }, 300);
    }
}

function goToAnimeFromPopup(animeId, notifId) {
    markAsRead(notifId);
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
        // Aseguramos que la posición sea relativa para colocar el punto rojo en la esquina
        div.style.position = 'relative'; 
        
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
        // EL PUNTO ROJO: Ahora en la esquina superior izquierda
        let unreadIndicator = !item.seen ? '<div style="position:absolute; left:10px; top:12px; width:10px; height:10px; background:var(--neon-pink); border-radius:50%; box-shadow: 0 0 8px var(--neon-pink); z-index: 10;"></div>' : '';
        
        div.innerHTML = `
            ${unreadIndicator}
            <div class="${imgBoxClass}">
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
                const indicator = div.querySelector('div[style*="position:absolute"]');
                if (indicator) indicator.remove();
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
            badge.style.display = 'block';
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
    }
}