// notification-system.js
/* Sistema de notificaciones combinado: actualizaciones de animes (localStorage) + respuestas en tiempo real (Firestore) */

let notificationQueue = []; 
let notificationsHistory = []; 
let isMenuOpen = false;
let repliesUnsubscribe = null; // Listener de respuestas en Firestore

document.addEventListener('DOMContentLoaded', () => {
    loadHistoryFromStorage();
    
    // Verificar si existe la base de datos de animes
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
                listenForReplies(user.uid);
            } else {
                if (repliesUnsubscribe) repliesUnsubscribe();
            }
        });
    }
});

// --- Funciones de almacenamiento local ---
function loadHistoryFromStorage() {
    const stored = localStorage.getItem('archinime_notif_history');
    if (stored) {
        try { notificationsHistory = JSON.parse(stored); }
        catch(e) { notificationsHistory = []; }
    }
}

function saveHistoryToStorage() {
    localStorage.setItem('archinime_notif_history', JSON.stringify(notificationsHistory));
    updateBellBadge();
}

// --- Escucha en tiempo real de respuestas a comentarios (Firestore) ---
function listenForReplies(uid) {
    if (repliesUnsubscribe) repliesUnsubscribe();

    repliesUnsubscribe = db.collection('comments')
        .where('replyToUserId', '==', uid)
        .orderBy('timestamp', 'desc')
        .limit(10)
        .onSnapshot(snapshot => {
            let hasNew = false;
            
            snapshot.docChanges().forEach(change => {
                if (change.type === 'added') {
                    const data = change.doc.data();
                    if (data.userId === uid) return; // No notificarse a sí mismo

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
                            url: `video-player.html?anime=${data.animeId}&s=${data.season}&e=${data.episode}`
                        };
                        
                        notificationsHistory.unshift(newNotif);
                        notificationQueue.push(newNotif);
                        hasNew = true;
                    }
                }
            });

            if (hasNew) {
                if (notificationsHistory.length > 50) notificationsHistory = notificationsHistory.slice(0, 50);
                saveHistoryToStorage();
                renderNotificationList();
                if (!isMenuOpen) updateBellBadge();
                if (notificationQueue.length > 0 && !document.getElementById('eventModal')) {
                    showNextPopup();
                }
            }
        }, error => {
            console.error("Error al escuchar respuestas:", error);
            if (error.message.includes('index')) {
                console.warn("⚠️ Se requiere un índice compuesto en Firestore para esta consulta. Crea el índice desde el enlace en la consola.");
            }
        });
}

// --- Detección de nuevos animes / actualizaciones (desde index-data.js) ---
function checkForNewUpdates() {
    const updatedAnimes = animes.filter(a => a.lastUpdate && a.updateType);
    updatedAnimes.sort((a, b) => b.lastUpdate - a.lastUpdate);

    let newItemsFound = [];
    updatedAnimes.forEach(anime => {
        if (anime.updateType.includes("ACTUALIZACIÓN")) return;
        if (anime.updateType === "Ninguna") return;

        const notifId = `${anime.id}_${anime.lastUpdate}`;
        const exists = notificationsHistory.find(n => n.notifId === notifId);
        
        if (!exists) {
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
                isFinal: anime.isFinal || false
            };
            notificationsHistory.unshift(newNotif);
            newItemsFound.push(newNotif);
        }
    });

    if (newItemsFound.length > 0) {
        if (notificationsHistory.length > 50) notificationsHistory = notificationsHistory.slice(0, 50);
        saveHistoryToStorage();
        notificationQueue = notificationQueue.concat(newItemsFound.slice(0, 5));
    }
}

// --- Iniciar secuencia de popups (se llama desde el loader) ---
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
    
    const indieMessage = notif.type === 'RESPUESTA' ? "Alguien interactuó contigo en los comentarios." : "¡Ya disponible en la plataforma! Disfruta del estreno.";
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
    else if (notif.type === "RESPUESTA") badgeClass = "badge-estreno";

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
                <button class="event-btn" onclick="goToAnimeFromPopup('${notif.animeId}', '${notif.notifId}', '${notif.url || ''}')">
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

function goToAnimeFromPopup(animeId, notifId, customUrl) {
    markAsRead(notifId);
    notificationQueue = [];
    if (customUrl && customUrl !== '') {
        window.location.href = customUrl;
    } else {
        window.location.href = `anime-detail.html?id=${animeId}`;
    }
}

// --- Menú de notificaciones (campana) ---
function toggleNotifMenu() {
    const menu = document.getElementById('notifMenu');
    isMenuOpen = !isMenuOpen;
    
    if (isMenuOpen) {
        menu.classList.add('active');
        renderNotificationList();
        const badge = document.getElementById('notifBadge');
        if(badge) badge.style.display = 'none';
        notificationsHistory.forEach(n => n.seen = true);
        saveHistoryToStorage();
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

        div.innerHTML = `
            <div class="notif-img-box">
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
    if (target) {
        target.seen = true;
        saveHistoryToStorage();
    }
}