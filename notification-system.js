// notification-system.js - VERSIÓN SIN ÍNDICE (filtro en cliente)
let notificationQueue = [];
let notificationsHistory = [];
let isMenuOpen = false;
let repliesUnsubscribe = null;
let catalogoUnsubscribe = null;

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
    console.log("🔔 Inicializando sistema de notificaciones...");
    loadHistoryFromStorage();
    listenForCatalogUpdates(); // Escucha sin where, solo orderBy
    renderNotificationList();
    updateBellBadge();

    if (typeof auth !== 'undefined') {
        auth.onAuthStateChanged(user => {
            if (user) {
                syncNotificationsWithCloud(user.uid);
                listenForReplies(user.uid);
            } else if (repliesUnsubscribe) repliesUnsubscribe();
        });
    }
});

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
                        seen: false, isFinal: false,
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

// --- Escucha SIN where, solo orderBy (no necesita índice compuesto) ---
function listenForCatalogUpdates() {
    if (catalogoUnsubscribe) catalogoUnsubscribe();
    
    console.log("📡 Iniciando escucha de catálogo (sin filtro where)...");
    // Solo orderBy, sin where - esto funciona sin índice compuesto
    catalogoUnsubscribe = db.collection('catalogo')
        .orderBy('lastUpdate', 'desc')
        .limit(50)
        .onSnapshot(snapshot => {
            console.log(`📡 [Notif] Se detectaron ${snapshot.docChanges().length} cambios en catálogo`);
            snapshot.docChanges().forEach(change => {
                if (change.type === 'added' || change.type === 'modified') {
                    const anime = { id: change.doc.id, ...change.doc.data() };
                    console.log(`📦 Anime recibido: ${anime.title} - updateType: ${anime.updateType} - lastUpdate:`, anime.lastUpdate);
                    if (anime.updateType && anime.updateType !== 'Ninguna') {
                        procesarActualizacionCatalogo(anime);
                    } else {
                        console.log(`⏭️ Ignorado: updateType = ${anime.updateType}`);
                    }
                }
            });
        }, error => {
            console.error('❌ Error escuchando catálogo:', error);
        });
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
    
    // Filtro de 30 días en cliente (opcional, puedes comentarlo para que salgan todas)
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    if (lastUpdateMs < thirtyDaysAgo) {
        console.log(`⏭️ ${anime.title} tiene lastUpdate > 30 días (${new Date(lastUpdateMs).toLocaleDateString()}), se omite.`);
        return;
    }
    
    const notifId = `${anime.id}_${lastUpdateMs}`;
    let seenNotifIds = JSON.parse(localStorage.getItem('archinime_seen_notif_ids')) || [];
    if (seenNotifIds.includes(notifId)) {
        console.log(`⏭️ ${anime.title} ya fue notificado (ID: ${notifId})`);
        return;
    }
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
    
    console.log(`🔔 NUEVA NOTIFICACIÓN: ${anime.title} - ${anime.updateType}`);
    if (notificationQueue.length === 1) showNextPopup();
}

window.startNotificationSequence = () => showNextPopup();

function showNextPopup() {
    if (notificationQueue.length) createPopupHTML(notificationQueue[0]);
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
        const processed = notificationQueue.shift();
        if (processed && !processed.seen) markAsRead(processed.notifId);
        if (typeof enableBodyScroll === 'function') enableBodyScroll();
        showNextPopup();
    }, 300);
}

function goToAnimeFromPopup(animeId, notifId) {
    if (!notificationsHistory.find(n => n.notifId === notifId)?.seen) markAsRead(notifId);
    notificationQueue = [];
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

function renderNotificationList() {
    const container = document.getElementById('notifList');
    if (!container) return;
    requestAnimationFrame(() => {
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