// notification-system.js - VERSIÓN CON FIX DEFINITIVO DE DESPLAZAMIENTO LATERAL + POPUPS TRAS CARGA COMPLETA
let notificationQueue = [];
let notificationsHistory = [];
let isMenuOpen = false;
let repliesUnsubscribe = null;
let catalogoUnsubscribe = null;

let popupsShownCount = 0;
const MAX_POPUPS = 5;
let firstVisitInitialized = false;
let pageFullyLoaded = false;
let pendingPopupTimer = null;
let scrollbarWidth = null; // Para compensar el desplazamiento

// Calcular el ancho del scrollbar una vez
function getScrollbarWidth() {
    if (scrollbarWidth !== null) return scrollbarWidth;
    const div = document.createElement('div');
    div.style.overflow = 'scroll';
    div.style.position = 'absolute';
    div.style.top = '-9999px';
    div.style.width = '100px';
    div.style.height = '100px';
    document.body.appendChild(div);
    scrollbarWidth = div.offsetWidth - div.clientWidth;
    document.body.removeChild(div);
    return scrollbarWidth || 0;
}

// --- FIX definitivo para evitar desplazamiento lateral al abrir dropdowns/popups ---
// Añadimos un estilo global que mantenga el scrollbar visible y evite el salto
if (!document.getElementById('archinime-scroll-fix')) {
    const style = document.createElement('style');
    style.id = 'archinime-scroll-fix';
    style.textContent = `
        body.modal-open {
            overflow: hidden !important;
            position: relative !important;
            width: auto !important;
            top: auto !important;
            left: auto !important;
            right: auto !important;
            bottom: auto !important;
        }
        /* Evita que el contenido se mueva al desaparecer el scrollbar */
        html.modal-open {
            overflow: hidden !important;
            margin-right: 0 !important;
            padding-right: 0 !important;
        }
        /* Para popups y dropdowns, asegurar que no generen scroll horizontal */
        #eventModal, .notif-dropdown, .user-dropdown {
            overflow-x: hidden;
        }
    `;
    document.head.appendChild(style);
}

// Versión mejorada de disableBodyScroll que evita el salto lateral
if (typeof window.disableBodyScroll !== 'function') {
  window.disableBodyScroll = function() {
    const scrollY = window.scrollY;
    const scrollbarWidth = getScrollbarWidth();
    // Aplicar clase al html también
    document.documentElement.classList.add('modal-open');
    document.body.classList.add('modal-open');
    // Compensar el ancho del scrollbar para evitar el salto
    if (scrollbarWidth > 0) {
        document.body.style.paddingRight = scrollbarWidth + 'px';
        document.documentElement.style.paddingRight = scrollbarWidth + 'px';
    }
    // Fijar la posición del scroll
    document.body.style.top = `-${scrollY}px`;
    document.documentElement.style.top = `-${scrollY}px`;
  };
  
  window.enableBodyScroll = function() {
    const scrollY = parseInt(document.body.style.top || '0') * -1;
    document.documentElement.classList.remove('modal-open');
    document.body.classList.remove('modal-open');
    document.body.style.paddingRight = '';
    document.documentElement.style.paddingRight = '';
    document.body.style.top = '';
    document.documentElement.style.top = '';
    window.scrollTo(0, scrollY);
  };
}

// Esperar a que la página esté completamente cargada antes de iniciar popups
function waitForPageFullyLoaded(callback) {
    if (document.readyState === 'complete') {
        callback();
    } else {
        window.addEventListener('load', callback, { once: true });
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    console.log("🔔 Inicializando sistema de notificaciones...");
    loadHistoryFromStorage();
    
    const isFirstVisit = !localStorage.getItem('archinime_notif_first_visit');
    if (isFirstVisit && !firstVisitInitialized) {
        console.log("🎉 Primera visita. Se mostrarán máximo 5 popups (los más recientes) tras carga completa.");
        firstVisitInitialized = true;
        await initFirstVisitNotifications({ deferPopups: true });
        localStorage.setItem('archinime_notif_first_visit', 'true');
    } else {
        renderNotificationList();
        updateBellBadge();
    }

    listenForCatalogUpdates();

    if (typeof auth !== 'undefined') {
        auth.onAuthStateChanged(async user => {
            if (user) {
                await syncNotificationsWithCloud(user.uid);
                listenForReplies(user.uid);
            } else if (repliesUnsubscribe) repliesUnsubscribe();
        });
    }

    waitForPageFullyLoaded(() => {
        console.log("✅ Página completamente cargada. Iniciando popups pendientes...");
        pageFullyLoaded = true;
        if (pendingPopupTimer) clearTimeout(pendingPopupTimer);
        if (notificationQueue.length > 0 && !window._popupSequenceActive) {
            showNextPopup();
        }
    });
});

// ========== PRIMERA VISITA: máximo 5 popups, diferidos ==========
async function initFirstVisitNotifications(options = {}) {
    const { deferPopups = true } = options;
    
    let anyChanged = false;
    for (let notif of notificationsHistory) {
        if (!notif.seen) {
            notif.seen = true;
            anyChanged = true;
        }
    }
    if (anyChanged) {
        saveHistoryToStorage();
        renderNotificationList();
        updateBellBadge();
    }

    notificationQueue = [];
    popupsShownCount = 0;

    try {
        const snapshot = await db.collection('catalogo')
            .orderBy('lastUpdate', 'desc')
            .limit(MAX_POPUPS)
            .get();
        
        const animes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        console.log(`📦 Primeros ${animes.length} animes más recientes para popups iniciales`);

        for (const anime of animes) {
            if (!anime.updateType || anime.updateType === 'Ninguna') continue;

            let lastUpdateMs = anime.lastUpdate;
            if (anime.lastUpdate && typeof anime.lastUpdate.toMillis === 'function') {
                lastUpdateMs = anime.lastUpdate.toMillis();
            } else if (typeof anime.lastUpdate === 'number') {
                lastUpdateMs = anime.lastUpdate;
            } else {
                lastUpdateMs = Date.now();
            }

            const notifId = `${anime.id}_${lastUpdateMs}`;
            if (notificationsHistory.some(n => n.notifId === notifId)) continue;

            const newNotif = {
                notifId,
                animeId: anime.id,
                title: anime.title,
                img: anime.img,
                seasonCover: anime.latestSeasonCover || anime.img,
                blockName: anime.latestBlockName || "",
                epTitle: anime.latestEpTitle || "Nuevo Contenido",
                type: anime.updateType,
                date: lastUpdateMs,
                seen: true,
                isFinal: anime.isFinal || false,
                popupShown: false
            };

            notificationsHistory.unshift(newNotif);
            if (notificationsHistory.length > 50) notificationsHistory.pop();

            let seenNotifIds = JSON.parse(localStorage.getItem('archinime_seen_notif_ids')) || [];
            if (!seenNotifIds.includes(notifId)) {
                seenNotifIds.push(notifId);
                if (seenNotifIds.length > 1000) seenNotifIds = seenNotifIds.slice(-1000);
                localStorage.setItem('archinime_seen_notif_ids', JSON.stringify(seenNotifIds));
            }

            if (popupsShownCount < MAX_POPUPS && notificationQueue.length < MAX_POPUPS) {
                notificationQueue.push(newNotif);
                popupsShownCount++;
                console.log(`➕ Popup #${popupsShownCount} encolado para: ${anime.title}`);
            }
        }

        saveHistoryToStorage();
        renderNotificationList();
        updateBellBadge();

        if (!deferPopups || pageFullyLoaded) {
            if (notificationQueue.length > 0) showNextPopup();
        } else {
            console.log("⏳ Diferiendo popups hasta que la página cargue completamente...");
            if (pendingPopupTimer) clearTimeout(pendingPopupTimer);
            pendingPopupTimer = setTimeout(() => {
                if (notificationQueue.length > 0 && pageFullyLoaded) showNextPopup();
            }, 500);
        }
    } catch (error) {
        console.error("❌ Error al obtener los últimos animes para primera visita:", error);
    }
}

// ========== FUNCIONES PRINCIPALES ==========
function loadHistoryFromStorage() {
    const stored = localStorage.getItem('archinime_notif_history');
    if (stored) {
        try { 
            notificationsHistory = JSON.parse(stored);
            if (notificationsHistory.length > 50) notificationsHistory = notificationsHistory.slice(0, 50);
        } catch(e) { notificationsHistory = []; }
    }
}

function saveHistoryToStorage() {
    localStorage.setItem('archinime_notif_history', JSON.stringify(notificationsHistory));
    let seenNotifIds = JSON.parse(localStorage.getItem('archinime_seen_notif_ids')) || [];
    updateBellBadge();
    if (auth.currentUser) {
        db.collection('users').doc(auth.currentUser.uid).set({
            notifHistory: notificationsHistory,
            seenNotifIds: seenNotifIds
        }, { merge: true }).catch(e => console.error("Error guardando en nube", e));
    }
}

async function syncNotificationsWithCloud(uid) {
    try {
        const doc = await db.collection('users').doc(uid).get();
        let isNewUser = !doc.exists;

        if (doc.exists) {
            const data = doc.data();
            if (data.seenNotifIds) {
                let localSeen = JSON.parse(localStorage.getItem('archinime_seen_notif_ids')) || [];
                let merged = Array.from(new Set([...localSeen, ...data.seenNotifIds])).slice(-1000);
                localStorage.setItem('archinime_seen_notif_ids', JSON.stringify(merged));
            }
            if (data.notifHistory) {
                let merged = [...notificationsHistory, ...data.notifHistory];
                let unique = new Map();
                merged.forEach(n => unique.set(n.notifId, n));
                notificationsHistory = Array.from(unique.values()).sort((a,b) => b.date - a.date).slice(0, 50);
            }
        }

        if (isNewUser && notificationsHistory.length > 0) {
            console.log("🆕 Usuario nuevo en la nube. Marcando notificaciones existentes como vistas.");
            let changed = false;
            for (let notif of notificationsHistory) {
                if (!notif.seen) {
                    notif.seen = true;
                    changed = true;
                }
            }
            if (changed) saveHistoryToStorage();
        }

        saveHistoryToStorage();
        renderNotificationList();
        updateBellBadge();
    } catch (e) { console.error("Error sync notif:", e); }
}

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
                    if (notificationsHistory.some(n => n.notifId === notifId)) return;
                    let rawText = data.texto || "";
                    let cleanText = rawText.replace(/\[Sticker\]\([^)]+\)/g, '🖼️ (Sticker)').trim();
                    if (!cleanText) cleanText = "🖼️ (Sticker)";
                    notificationsHistory.unshift({
                        notifId, type: 'RESPUESTA', animeId: data.animeId,
                        title: `¡${data.userName} te respondió!`,
                        img: data.userAvatar || 'invitado.avif',
                        seasonCover: data.userAvatar || 'invitado.avif',
                        blockName: 'Foro',
                        epTitle: `"${cleanText.substring(0,35)}${cleanText.length>35?'...':''}"`,
                        date: data.timestamp?.toMillis() || Date.now(),
                        seen: false,
                        isFinal: false,
                        url: `video-player.html?anime=${data.animeId}&s=${data.season}&e=${data.episode}&targetComment=${docId}`
                    });
                    hasNew = true;
                }
            });
            if (hasNew) {
                notificationsHistory = notificationsHistory.slice(0, 50);
                saveHistoryToStorage();
                renderNotificationList();
                if (!isMenuOpen) updateBellBadge();
            }
        }, error => console.error("Error replies:", error));
}

function listenForCatalogUpdates() {
    if (catalogoUnsubscribe) catalogoUnsubscribe();
    catalogoUnsubscribe = db.collection('catalogo')
        .orderBy('lastUpdate', 'desc')
        .limit(50)
        .onSnapshot(snapshot => {
            snapshot.docChanges().forEach(change => {
                if (change.type === 'added' || change.type === 'modified') {
                    const anime = { id: change.doc.id, ...change.doc.data() };
                    if (anime.updateType && anime.updateType !== 'Ninguna') {
                        procesarActualizacionCatalogo(anime);
                    }
                }
            });
        }, error => console.error('❌ Error escuchando catálogo:', error));
}

function procesarActualizacionCatalogo(anime) {
    console.log(`🔔 Procesando anime: ${anime.title}`);
    
    let lastUpdateMs = anime.lastUpdate;
    if (anime.lastUpdate && typeof anime.lastUpdate.toMillis === 'function') {
        lastUpdateMs = anime.lastUpdate.toMillis();
    } else if (typeof anime.lastUpdate === 'number') {
        lastUpdateMs = anime.lastUpdate;
    } else {
        lastUpdateMs = Date.now();
    }
    
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    if (lastUpdateMs < thirtyDaysAgo) return;
    
    const notifId = `${anime.id}_${lastUpdateMs}`;
    let seenNotifIds = JSON.parse(localStorage.getItem('archinime_seen_notif_ids')) || [];
    if (seenNotifIds.includes(notifId)) return;
    
    const isFirstVisitGlobal = !localStorage.getItem('archinime_notif_first_visit');
    const markAsSeen = isFirstVisitGlobal;
    
    seenNotifIds.push(notifId);
    if (seenNotifIds.length > 1000) seenNotifIds = seenNotifIds.slice(-1000);
    localStorage.setItem('archinime_seen_notif_ids', JSON.stringify(seenNotifIds));
    
    if (notificationsHistory.some(n => n.notifId === notifId)) return;
    
    const newNotif = {
        notifId, animeId: anime.id, title: anime.title, img: anime.img,
        seasonCover: anime.latestSeasonCover || anime.img,
        blockName: anime.latestBlockName || "",
        epTitle: anime.latestEpTitle || "Nuevo Contenido",
        type: anime.updateType,
        date: lastUpdateMs,
        seen: markAsSeen,
        isFinal: anime.isFinal || false,
        popupShown: false
    };
    
    notificationsHistory.unshift(newNotif);
    if (notificationsHistory.length > 50) notificationsHistory = notificationsHistory.slice(0, 50);
    
    const shouldEnqueuePopup = (!isFirstVisitGlobal && popupsShownCount < MAX_POPUPS && notificationQueue.length < MAX_POPUPS && pageFullyLoaded);
    
    if (shouldEnqueuePopup) {
        notificationQueue.push(newNotif);
        popupsShownCount++;
        console.log(`🔔 NUEVO POPUP #${popupsShownCount}: ${anime.title}`);
    } else {
        console.log(`🔔 NOTIFICACIÓN SIN POPUP (límite ${MAX_POPUPS} alcanzado o página no cargada): ${anime.title}`);
    }
    
    saveHistoryToStorage();
    renderNotificationList();
    updateBellBadge();
    
    if (shouldEnqueuePopup && notificationQueue.length === 1) {
        showNextPopup();
    }
}

window.startNotificationSequence = () => {
    if (pageFullyLoaded && notificationQueue.length > 0 && !window._popupSequenceActive) {
        showNextPopup();
    }
};

function showNextPopup() {
    if (!pageFullyLoaded) {
        console.log("⏳ Página aún no cargada, esperando para mostrar popup...");
        return;
    }
    if (window._popupSequenceActive) return;
    if (notificationQueue.length) {
        window._popupSequenceActive = true;
        createPopupHTML(notificationQueue[0]);
    } else {
        window._popupSequenceActive = false;
    }
}

function createPopupHTML(notif) {
    const existing = document.getElementById('eventModal');
    if (existing) existing.remove();
    const modal = document.createElement('div');
    modal.id = 'eventModal';
    let infoString = "";
    if (notif.blockName && notif.blockName !== "Novedad") infoString += `<span style="color:var(--neon-cyan)">${notif.blockName}</span>`;
    if (notif.epTitle && notif.epTitle !== "Nuevo Contenido") infoString += (infoString?" • ":"") + `<span style="color:#fff">${notif.epTitle}</span>`;
    else if (!infoString) infoString = "Nuevo Contenido";
    let badgeColor = "#bc13fe";
    if (notif.type.includes("ESTRENO")) badgeColor = "#ff0055";
    else if (notif.type.includes("PRÓXIMAMENTE")) badgeColor = "#f1c40f";
    modal.innerHTML = `
        <div class="event-card"><button class="event-close" onclick="closePopup()" aria-label="Cerrar"><i class="fas fa-times"></i></button>
          <div class="event-visuals"><div class="visual-bg" style="background-image: url('${notif.img}');"></div>
            <div class="covers-container"><img src="${notif.img}" class="cover-back" alt="Poster"><img src="${notif.seasonCover}" class="cover-front" alt="Season"></div>
            <div class="event-type-badge" style="background: ${badgeColor}; box-shadow: 0 0 15px ${badgeColor};">${notif.type}</div>${notif.isFinal ? '<div class="final-stamp">FINALIZADO</div>' : ''}
          </div>
          <div class="event-info"><h2 class="event-title">${notif.title}</h2><div class="event-meta">${infoString}</div>
            <p class="event-desc">¡Ya disponible en la plataforma! Disfruta del estreno.</p>
            <button class="event-btn" onclick="goToAnimeFromPopup('${notif.animeId}', '${notif.notifId}')"><i class="fas fa-play"></i> VER AHORA</button>
          </div>
        </div>`;
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
        window._popupSequenceActive = false;
        if (notificationQueue.length > 0) {
            setTimeout(() => {
                if (pageFullyLoaded) showNextPopup();
            }, 400);
        } else {
            window._popupSequenceActive = false;
        }
    }, 300);
}

function goToAnimeFromPopup(animeId, notifId) {
    if (!notificationsHistory.find(n => n.notifId === notifId)?.seen) markAsRead(notifId);
    notificationQueue = [];
    window._popupSequenceActive = false;
    if (typeof enableBodyScroll === 'function') enableBodyScroll();
    window.location.href = `anime-detail.html?id=${animeId}`;
}

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

function markAllAsRead() {
    let changed = false;
    for (let notif of notificationsHistory) {
        if (!notif.seen) {
            notif.seen = true;
            changed = true;
        }
    }
    if (changed) {
        saveHistoryToStorage();
        renderNotificationList();
        updateBellBadge();
        console.log("✅ Todas las notificaciones marcadas como vistas.");
    }
}

function renderNotificationList() {
    const container = document.getElementById('notifList');
    if (!container) return;
    requestAnimationFrame(() => {
        const header = document.querySelector('#notifMenu .notif-header');
        if (header && !header.querySelector('.mark-all-btn')) {
            const btn = document.createElement('button');
            btn.className = 'mark-all-btn';
            btn.innerHTML = '<i class="fas fa-check-double"></i> Marcar todo';
            btn.title = 'Marcar todas las notificaciones como vistas';
            btn.onclick = (e) => {
                e.stopPropagation();
                markAllAsRead();
            };
            btn.style.cssText = `
                background: rgba(0,243,255,0.1);
                border: 1px solid var(--neon-cyan);
                color: var(--neon-cyan);
                border-radius: 20px;
                padding: 4px 12px;
                font-size: 0.7rem;
                font-family: 'Orbitron', sans-serif;
                cursor: pointer;
                transition: all 0.2s;
                margin-left: 10px;
            `;
            btn.onmouseenter = () => { btn.style.background = 'rgba(0,243,255,0.3)'; btn.style.transform = 'scale(1.02)'; };
            btn.onmouseleave = () => { btn.style.background = 'rgba(0,243,255,0.1)'; btn.style.transform = 'scale(1)'; };
            header.appendChild(btn);
        }

        if (!notificationsHistory.length) {
            container.innerHTML = '<div class="empty-notif"><i class="fas fa-satellite-dish"></i><br>Sin novedades por ahora.</div>';
            return;
        }
        const visible = notificationsHistory.slice(0, 30);
        const fragment = document.createDocumentFragment();
        visible.forEach(item => {
            const div = document.createElement('div');
            div.className = 'notif-item';
            let imgClass = 'notif-img-box';
            if (item.type === 'RESPUESTA') imgClass += ' rounded-avatar';
            let infoString = "";
            if (item.blockName && item.blockName !== "Novedad") infoString += `<span class="n-block">${item.blockName}</span>`;
            if (item.epTitle && item.epTitle !== "Nuevo Contenido") infoString += (infoString?" ":"") + `<span class="n-ep-title">${item.epTitle}</span>`;
            else if (!infoString) infoString = `<span class="n-ep-title">Nuevo Contenido</span>`;
            let typeColor = "var(--neon-purple)";
            if (item.type.includes("ESTRENO")) typeColor = "var(--neon-pink)";
            else if (item.type.includes("PRÓXIMAMENTE")) typeColor = "var(--neon-yellow)";
            else if (item.type === "RESPUESTA") typeColor = "var(--neon-cyan)";
            div.innerHTML = `<div style="position:relative; display:inline-block;">${!item.seen?'<div class="unread-dot" style="position:absolute; top:-4px; left:-4px; width:12px; height:12px; background:#ff0000; border-radius:50%; box-shadow:0 0 8px #ff0000; z-index:20; border:1px solid #fff;"></div>':''}<div class="${imgClass}"><img src="${item.seasonCover}" alt="cover" loading="lazy"></div></div>
                <div class="notif-content"><div class="notif-header-line"><span class="n-title">${item.title}</span></div><div class="n-type" style="color:${typeColor}">${item.type} ${item.isFinal?'<span class="tag-final">FINALIZADO</span>':''}</div><div class="n-meta">${infoString}</div></div>`;
            div.addEventListener('click', () => {
                if (!item.seen) { markAsRead(item.notifId); item.seen = true; updateBellBadge(); div.querySelector('.unread-dot')?.remove(); }
                location.href = item.url || `anime-detail.html?id=${item.animeId}`;
            });
            fragment.appendChild(div);
        });
        container.innerHTML = '';
        container.appendChild(fragment);
        if (notificationsHistory.length > 30) {
            const more = document.createElement('div');
            more.className = 'notif-item';
            more.style.justifyContent = 'center';
            more.style.opacity = '0.7';
            more.innerHTML = `<div style="text-align:center;"><i class="fas fa-ellipsis-h"></i> ${notificationsHistory.length-30} notificaciones antiguas</div>`;
            container.appendChild(more);
        }
    });
}

function updateBellBadge() {
    const unread = notificationsHistory.filter(n => !n.seen).length;
    const badge = document.getElementById('notifBadge');
    if (badge) {
        badge.style.display = unread ? 'flex' : 'none';
        if (unread) badge.textContent = unread > 9 ? '+9' : unread;
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
window.markAllAsRead = markAllAsRead;