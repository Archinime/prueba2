// notification-system.js
/* Sistema de notificaciones optimizado para Firestore:
   - Escucha en tiempo real de nuevos animes/actualizaciones.
   - Renderizado con DocumentFragment y límite de 30 notificaciones visibles.
   - Uso de requestAnimationFrame para evitar bloqueos de UI.
   - Sincronización con Firestore y caché local.
   - Control de scroll del fondo al abrir popups.
*/

let notificationQueue = [];
let notificationsHistory = [];
let isMenuOpen = false;
let repliesUnsubscribe = null;
let catalogoUnsubscribe = null;

// Funciones para bloquear/desbloquear scroll (se definen en el scope global si no existen)
if (typeof disableBodyScroll !== 'function') {
  window.disableBodyScroll = function() {
    document.body.classList.add('modal-open');
    document.documentElement.classList.add('modal-open');
  };
  window.enableBodyScroll = function() {
    document.body.classList.remove('modal-open');
    document.documentElement.classList.remove('modal-open');
  };
}

document.addEventListener('DOMContentLoaded', () => {
    loadHistoryFromStorage();
    
    // Iniciar escucha de catálogo en Firestore
    listenForCatalogUpdates();
    
    // Render inicial con fragmento y límite
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
            // Limitar a 50 elementos para evitar sobrecarga
            if (notificationsHistory.length > 50) notificationsHistory = notificationsHistory.slice(0, 50);
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

// --- Escucha de catálogo en tiempo real (Firestore) ---
function listenForCatalogUpdates() {
    if (catalogoUnsubscribe) catalogoUnsubscribe();
    
    // Escuchar animes cuyo lastUpdate sea mayor a 7 días atrás
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    
    catalogoUnsubscribe = db.collection('catalogo')
        .where('lastUpdate', '>', sevenDaysAgo)
        .orderBy('lastUpdate', 'desc')
        .limit(30)
        .onSnapshot(snapshot => {
            snapshot.docChanges().forEach(change => {
                // Solo nos interesan documentos nuevos o modificados
                if (change.type === 'added' || change.type === 'modified') {
                    const anime = { id: change.doc.id, ...change.doc.data() };
                    // Solo procesar si tiene un tipo de actualización válido
                    if (anime.updateType && anime.updateType !== 'Ninguna') {
                        procesarActualizacionCatalogo(anime);
                    }
                }
            });
        }, error => {
            console.error('Error escuchando catálogo:', error);
            // Si el error es por falta de índice, mostrar ayuda en consola
            if (error.message.includes('index')) {
                console.warn('⚠️ Necesitas crear un índice en Firestore para orderBy("lastUpdate", "desc") con filtro where. Sigue el enlace:', error.message.match(/https:\/\/console\.firebase\.google\.com\/[^\s]+/)?.[0]);
            }
        });
}

function procesarActualizacionCatalogo(anime) {
    // Convertir lastUpdate a número si es Timestamp de Firestore
    let lastUpdateMs = anime.lastUpdate;
    if (anime.lastUpdate && typeof anime.lastUpdate.toMillis === 'function') {
        lastUpdateMs = anime.lastUpdate.toMillis();
    } else if (typeof anime.lastUpdate === 'number') {
        lastUpdateMs = anime.lastUpdate;
    } else {
        // Si es string, intentamos parsearlo (solo por si acaso)
        lastUpdateMs = Date.parse(anime.lastUpdate);
        if (isNaN(lastUpdateMs)) lastUpdateMs = Date.now();
    }
    
    // Solo notificar si la actualización es de los últimos 7 días
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    if (lastUpdateMs < sevenDaysAgo) return;
    
    const notifId = `${anime.id}_${lastUpdateMs}`;
    let seenNotifIds = JSON.parse(localStorage.getItem('archinime_seen_notif_ids')) || [];
    if (seenNotifIds.includes(notifId)) return;
    seenNotifIds.push(notifId);
    if (seenNotifIds.length > 1000) seenNotifIds = seenNotifIds.slice(-1000);
    localStorage.setItem('archinime_seen_notif_ids', JSON.stringify(seenNotifIds));
    
    if (notificationsHistory.some(n => n.notifId === notifId)) return;
    
    const newNotif = {
        notifId: notifId,
        animeId: anime.id,
        title: anime.title,
        img: anime.img,
        seasonCover: anime.latestSeasonCover || anime.img,
        blockName: anime.latestBlockName || "",
        epTitle: anime.latestEpTitle || "Nuevo Contenido",
        type: anime.updateType,
        date: lastUpdateMs,
        seen: false,
        isFinal: anime.isFinal || false,
        popupShown: true
    };
    
    notificationsHistory.unshift(newNotif);
    if (notificationsHistory.length > 50) notificationsHistory = notificationsHistory.slice(0, 50);
    notificationQueue.push(newNotif);
    saveHistoryToStorage();
    renderNotificationList();
    updateBellBadge();
    
    if (notificationQueue.length === 1) {
        showNextPopup();
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
    if (typeof disableBodyScroll === 'function') disableBodyScroll();
    setTimeout(() => modal.classList.add('show'), 50);
}

function closePopup() {
    const modal = document.getElementById('eventModal');
    if (modal) {
        modal.classList.remove('show');
        setTimeout(() => {
            modal.remove();
            const processed = notificationQueue.shift();
            if (processed && !processed.seen) {
                markAsRead(processed.notifId);
            }
            if (typeof enableBodyScroll === 'function') enableBodyScroll();
            showNextPopup();
        }, 300);
    }
}

function goToAnimeFromPopup(animeId, notifId) {
    if (!notificationsHistory.find(n => n.notifId === notifId)?.seen) {
        markAsRead(notifId);
    }
    notificationQueue = [];
    if (typeof enableBodyScroll === 'function') enableBodyScroll();
    window.location.href = `anime-detail.html?id=${animeId}`;
}

// --- Menú de notificaciones (campana) ---
function toggleNotifMenu() {
    const menu = document.getElementById('notifMenu');
    isMenuOpen = !isMenuOpen;
    if (isMenuOpen) {
        menu.classList.add('active');
        if (typeof disableBodyScroll === 'function') disableBodyScroll();
        renderNotificationList();
    } else {
        menu.classList.remove('active');
        if (typeof enableBodyScroll === 'function') enableBodyScroll();
    }
}

document.addEventListener('click', (e) => {
    const wrapper = document.querySelector('.notif-wrapper');
    const menu = document.getElementById('notifMenu');
    if (wrapper && !wrapper.contains(e.target) && isMenuOpen) {
        isMenuOpen = false;
        if(menu) menu.classList.remove('active');
        if (typeof enableBodyScroll === 'function') enableBodyScroll();
    }
});

// --- Renderizado optimizado de la lista de notificaciones ---
function renderNotificationList() {
    const listContainer = document.getElementById('notifList');
    if (!listContainer) return;
    
    requestAnimationFrame(() => {
        if (notificationsHistory.length === 0) {
            listContainer.innerHTML = '<div class="empty-notif"><i class="fas fa-satellite-dish"></i><br>Sin novedades por ahora.</div>';
            return;
        }

        const visibleCount = Math.min(notificationsHistory.length, 30);
        const sortedHistory = [...notificationsHistory].sort((a, b) => b.date - a.date).slice(0, visibleCount);
        const fragment = document.createDocumentFragment();
        
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
            
            const unreadDot = !item.seen ?
                '<div class="unread-dot" style="position: absolute; top: -4px; left: -4px; width: 12px; height: 12px; background: #ff0000; border-radius: 50%; box-shadow: 0 0 8px #ff0000; z-index: 20; border: 1px solid #fff;"></div>' : '';
            
            div.innerHTML = `
                <div style="position: relative; display: inline-block;">
                    ${unreadDot}
                    <div class="${imgBoxClass}">
                        <img src="${item.seasonCover}" alt="cover" loading="lazy">
                    </div>
                </div>
                <div class="notif-content">
                    <div class="notif-header-line">
                         <span class="n-title">${item.title}</span>
                    </div>
                    <div class="n-type" style="color:${typeColor}">${item.type} ${finalLabel}</div>
                    <div class="n-meta">${infoString}</div>
                </div>
            `;
            
            div.addEventListener('click', (e) => {
                if (!item.seen) {
                    markAsRead(item.notifId);
                    item.seen = true;
                    updateBellBadge();
                    const dot = div.querySelector('.unread-dot');
                    if (dot) dot.remove();
                }
                if (item.url) {
                    window.location.href = item.url;
                } else {
                    window.location.href = `anime-detail.html?id=${item.animeId}`;
                }
            });
            fragment.appendChild(div);
        });
        
        listContainer.innerHTML = '';
        listContainer.appendChild(fragment);
        
        if (notificationsHistory.length > 30) {
            const moreDiv = document.createElement('div');
            moreDiv.className = 'notif-item';
            moreDiv.style.justifyContent = 'center';
            moreDiv.style.opacity = '0.7';
            moreDiv.innerHTML = `<div style="text-align:center; width:100%;"><i class="fas fa-ellipsis-h"></i> ${notificationsHistory.length - 30} notificaciones antiguas</div>`;
            listContainer.appendChild(moreDiv);
        }
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
        renderNotificationList();
    }
}

window.toggleNotifMenu = toggleNotifMenu;
window.closePopup = closePopup;
window.goToAnimeFromPopup = goToAnimeFromPopup;