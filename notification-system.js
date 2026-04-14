// notification-system.js - FIX: SCROLL Y LAYOUT MÓVIL OPTIMIZADO + POPUPS DE RESPUESTAS
// ACTUALIZADO: Usa ArchinimeState para el estado del usuario
let notificationQueue = [];
let notificationsHistory = [];
let isMenuOpen = false;
let repliesUnsubscribe = null;
let catalogoUnsubscribe = null;

// LÍMITE DE POPUPS: MÁXIMO 5 VENTANAS EMERGENTES POR SESIÓN
let popupsShownCount = 0;
const MAX_POPUPS = 5;
let firstVisitInitialized = false;

// BANDERA DE CARGA DE PÁGINA
let pageFullyLoaded = false;

// FIX: FUNCIÓN DE SCROLLBAR SIN SALTO PARA LA BARRA DE NAVEGACIÓN
if (typeof disableBodyScroll !== 'function') {
  window.disableBodyScroll = function() {
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.paddingRight = scrollbarWidth + 'px';
    document.body.classList.add('modal-open');
    document.documentElement.classList.add('modal-open');
  };
  window.enableBodyScroll = function() {
    document.body.style.paddingRight = '';
    document.body.classList.remove('modal-open');
    document.documentElement.classList.remove('modal-open');
  };
}

// Obtener usuario actual desde el estado central o fallback
function getCurrentUser() {
  if (window.ArchinimeState) return ArchinimeState.get('currentUser');
  return null;
}

document.addEventListener('DOMContentLoaded', async () => {
    console.log("🔔 Inicializando sistema de notificaciones...");
    loadHistoryFromStorage();
    
    const isFirstVisit = !localStorage.getItem('archinime_notif_first_visit');
    if (isFirstVisit && !firstVisitInitialized) {
        console.log("🎉 Primera visita. Se mostrarán máximo 5 popups (los más recientes).");
        firstVisitInitialized = true;
        await initFirstVisitNotifications();
        localStorage.setItem('archinime_notif_first_visit', 'true');
    } else {
        renderNotificationList();
        updateBellBadge();
    }

    listenForCatalogUpdates();

    // Suscribirse al estado central para cambios de usuario
    if (window.ArchinimeState) {
        ArchinimeState.on('currentUser', async user => {
            if (user) {
                await syncNotificationsWithCloud(user.uid);
                listenForReplies(user.uid);
            } else if (repliesUnsubscribe) {
                repliesUnsubscribe();
            }
        });
    } else if (typeof auth !== 'undefined') {
        // Fallback: usar auth directamente
        console.warn("ArchinimeState no encontrado, usando auth.onAuthStateChanged como fallback");
        auth.onAuthStateChanged(async user => {
            if (user) {
                await syncNotificationsWithCloud(user.uid);
                listenForReplies(user.uid);
            } else if (repliesUnsubscribe) repliesUnsubscribe();
        });
    }
});

// ========== PRIMERA VISITA: máximo 5 popups de los animes más recientes ==========
async function initFirstVisitNotifications() {
    // Marcar todas las notificaciones existentes como vistas
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
        // Obtener los 5 animes más recientes (ordenados por lastUpdate desc)
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

        if (notificationQueue.length > 0) {
            showNextPopup();
        }
    } catch (error) {
        console.error("❌ Error al obtener los últimos animes para primera visita:", error);
    }
}

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

    const user = getCurrentUser();
    if (user) {
        db.collection('users').doc(user.uid).set({
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
            let shouldShowPopup = false;
            
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
                    
                    // Extraer el texto original al que se responde (Requiere guardar este dato en BD)
                    let originalText = data.replyToText || data.textoOriginal || "";
                    let timestampMs = data.timestamp?.toMillis() || Date.now();
         
                    const newNotif = {
                        notifId, 
                        type: 'RESPUESTA', 
                        animeId: data.animeId,
                        title: `¡${data.userName} te respondió!`,
                        img: data.userAvatar || 'invitado.avif',
                        seasonCover: data.userAvatar || 'invitado.avif',
                        blockName: 'Foro',
                        epTitle: `"${cleanText.substring(0,60)}${cleanText.length>60?'...':''}"`,
                        originalText: originalText ? `"${originalText.substring(0,50)}${originalText.length>50?'...':''}"` : null,
                        date: timestampMs,
                        seen: false,
                        isFinal: false,
                        url: `video-player.html?anime=${data.animeId}&s=${data.season}&e=${data.episode}&targetComment=${docId}`
                    };
                    
                    notificationsHistory.unshift(newNotif);
                    hasNew = true;

                    // LÓGICA DE POPUPS PARA RESPUESTAS
                    let seenNotifIds = JSON.parse(localStorage.getItem('archinime_seen_notif_ids')) || [];
                    const isFirstVisitGlobal = !localStorage.getItem('archinime_notif_first_visit');
                    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);

                    if (!seenNotifIds.includes(notifId)) {
                        seenNotifIds.push(notifId);
                        if (seenNotifIds.length > 1000) seenNotifIds = seenNotifIds.slice(-1000);
                        localStorage.setItem('archinime_seen_notif_ids', JSON.stringify(seenNotifIds));

                        // Mostrar el popup si no es la primera visita, el comentario es reciente y no pasamos el límite
                        if (!isFirstVisitGlobal && timestampMs > thirtyDaysAgo && popupsShownCount < MAX_POPUPS && notificationQueue.length < MAX_POPUPS) {
                            notificationQueue.push(newNotif);
                            popupsShownCount++;
                            shouldShowPopup = true;
                        }
                    }
                }
            });

            if (hasNew) {
                notificationsHistory = notificationsHistory.slice(0, 50);
                saveHistoryToStorage();
                renderNotificationList();
                if (!isMenuOpen) updateBellBadge();
            }

            // Si hay popups nuevos en cola, arrancar la secuencia
            if (shouldShowPopup && notificationQueue.length === 1) {
                showNextPopup();
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
    
    const shouldEnqueuePopup = (!isFirstVisitGlobal && popupsShownCount < MAX_POPUPS && notificationQueue.length < MAX_POPUPS);

    if (shouldEnqueuePopup) {
        notificationQueue.push(newNotif);
        popupsShownCount++;
        console.log(`🔔 NUEVO POPUP #${popupsShownCount}: ${anime.title}`);
    } else {
        console.log(`🔔 NOTIFICACIÓN SIN POPUP (límite ${MAX_POPUPS} alcanzado): ${anime.title}`);
    }
    
    saveHistoryToStorage();
    renderNotificationList();
    updateBellBadge();

    if (shouldEnqueuePopup && notificationQueue.length === 1) {
        showNextPopup();
    }
}

window.startNotificationSequence = () => {
    pageFullyLoaded = true;
    showNextPopup();
};

function showNextPopup() {
    if (!pageFullyLoaded) return;
    if (notificationQueue.length) createPopupHTML(notificationQueue[0]);
}

function createPopupHTML(notif) {
    const existing = document.getElementById('eventModal');
    if (existing) existing.remove();
    const modal = document.createElement('div');
    modal.id = 'eventModal';

    // RENDERIZADO CONDICIONAL: RESPUESTA VS ANIME
    if (notif.type === 'RESPUESTA') {
        modal.innerHTML = `
            <div class="event-card" style="border: 1px solid var(--neon-cyan); box-shadow: 0 0 50px rgba(0, 243, 255, 0.2);">
              <button class="event-close" onclick="closePopup()" aria-label="Cerrar"><i class="fas fa-times"></i></button>
              
              <div class="event-visuals" style="height: 160px; background: radial-gradient(circle, rgba(0,243,255,0.15) 0%, #000 80%); display: flex; align-items: center; justify-content: center;">
                <div class="visual-bg" style="background-image: url('${notif.img}'); opacity: 0.2; filter: blur(20px);"></div>
                
                <div class="covers-container" style="align-items: center; justify-content: center; width: 100%; padding-bottom: 0;">
                    <img src="${notif.img}" alt="Avatar Usuario" style="width: 100px; height: 100px; border-radius: 50%; border: 3px solid var(--neon-cyan); object-fit: cover; box-shadow: 0 0 25px var(--neon-cyan); transform: none; position: relative; z-index: 5;">
                </div>
                <div class="event-type-badge" style="background: var(--neon-cyan); color: #000; box-shadow: 0 0 15px var(--neon-cyan); left: 50%; transform: translateX(-50%); top: 15px;"><i class="fas fa-reply"></i> NUEVA RESPUESTA</div>
              </div>
              
              <div class="event-info" style="padding: 20px 25px; text-align: left;">
                <h2 class="event-title" style="font-size: 1.1rem; text-align: center; color: var(--neon-cyan); margin-bottom: 15px;">${notif.title}</h2>
                
                <div style="background: rgba(255,255,255,0.03); border-left: 3px solid #555; padding: 12px; border-radius: 0 8px 8px 0; margin-bottom: 15px; position: relative;">
                    <i class="fas fa-quote-left" style="position: absolute; top: 8px; right: 12px; font-size: 1.5rem; color: rgba(255,255,255,0.05);"></i>
                    <span style="font-size: 0.8rem; color: #888; font-style: italic; display: block; padding-right: 20px;">
                        ${notif.originalText ? notif.originalText : "Respuesta a tu comentario..."}
                    </span>
                </div>

                <p class="event-desc" style="color: #fff; font-size: 0.95rem; font-style: normal; margin-bottom: 25px; text-align: center;">
                    ${notif.epTitle}
                </p>
                
                <button class="event-btn" style="background: var(--neon-cyan); color: #000; box-shadow: 0 0 20px rgba(0, 243, 255, 0.4);" onclick="goToAnimeFromPopup('${notif.animeId}', '${notif.notifId}')"><i class="fas fa-comments"></i> VER CONVERSACIÓN</button>
              </div>
            </div>`;
    } else {
        // DISEÑO ESTÁNDAR PARA ACTUALIZACIONES DE ANIME
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
        showNextPopup();
    }, 300);
}

function goToAnimeFromPopup(animeId, notifId) {
    const targetNotif = notificationsHistory.find(n => n.notifId === notifId);
    if (targetNotif && !targetNotif.seen) markAsRead(notifId);
    
    notificationQueue = [];
    if (typeof enableBodyScroll === 'function') enableBodyScroll();
    
    // Si la notificación contiene una URL exacta (ej. comentarios), se utiliza esa
    if (targetNotif && targetNotif.url) {
        window.location.href = targetNotif.url;
    } else {
        window.location.href = `anime-detail.html?id=${animeId}`;
    }
}

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
                ${window.innerWidth <= 768 ? 'margin-right: 35px;' : ''}
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