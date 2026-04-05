/* notification-system.js - Actualizado para soportar respuestas a comentarios de Firebase */

let notificationQueue = [];
let notificationsHistory = []; // Notificaciones de estrenos
let userPersonalNotifications = []; // Notificaciones personales (respuestas)
let isMenuOpen = false;
let unsubscribeUserNotifs = null;

document.addEventListener('DOMContentLoaded', () => {
    if (typeof animes === 'undefined') {
        console.warn('Sistema de Notificaciones: index-data.js no cargado.');
        return;
    }
    loadHistoryFromStorage();
    checkForNewUpdates();
    renderNotificationList();
    updateBellBadge();
});

// NUEVO: Conectar a Firebase para leer notificaciones personales del usuario logueado
window.initUserNotifications = function(userId, db) {
    if (unsubscribeUserNotifs) unsubscribeUserNotifs();
    
    unsubscribeUserNotifs = db.collection('user_notifications')
        .where('receiverId', '==', userId)
        .orderBy('timestamp', 'desc')
        .limit(30)
        .onSnapshot(snap => {
            userPersonalNotifications = [];
            snap.forEach(doc => {
                userPersonalNotifications.push({ id: doc.id, ...doc.data() });
            });
            updateBellBadge();
            renderNotificationList();
        });
};

function loadHistoryFromStorage() {
    const stored = localStorage.getItem('archinime_notif_history');
    if (stored) {
        try { notificationsHistory = JSON.parse(stored);
        } catch(e) { notificationsHistory = []; }
    }
}

function saveHistoryToStorage() {
    localStorage.setItem('archinime_notif_history', JSON.stringify(notificationsHistory));
    updateBellBadge();
}

function checkForNewUpdates() {
    let updatedAnimes = animes.filter(a => a.lastUpdate && a.updateType && a.updateType !== 'Ninguna');
    updatedAnimes.sort((a, b) => b.lastUpdate - a.lastUpdate);
    const latestFive = updatedAnimes.slice(0, 5);
    
    let newItemsFound = [];
    latestFive.forEach(anime => {
        const notifId = `${anime.id}_${anime.lastUpdate}`;
        const alreadyExists = notificationsHistory.some(n => n.notifId === notifId);
        
        if (!alreadyExists) {
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
    
    if (notificationsHistory.length > 50) notificationsHistory = notificationsHistory.slice(0, 50);
    if (newItemsFound.length > 0) {
        saveHistoryToStorage();
        notificationQueue = newItemsFound.slice(0, 5);
    } else {
        notificationQueue = [];
    }
}

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

function toggleNotifMenu() {
    const menu = document.getElementById('notifMenu');
    isMenuOpen = !isMenuOpen;
    if (isMenuOpen) {
        menu.classList.add('active');
        // Marcar vistas del sistema al abrir menú
        notificationsHistory.forEach(n => n.seen = true);
        saveHistoryToStorage();
        
        // Marcar vistas las personales en Firebase
        if (typeof db !== 'undefined' && userPersonalNotifications.length > 0) {
            const batch = db.batch();
            userPersonalNotifications.forEach(n => {
                if (!n.seen) {
                    const ref = db.collection('user_notifications').doc(n.id);
                    batch.update(ref, { seen: true });
                }
            });
            batch.commit().catch(e => console.error("Error actualizando notif: ", e));
        }
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
    
    // COMBINAR LAS DOS FUENTES Y ORDENAR
    let allNotifs = [];
    notificationsHistory.forEach(n => allNotifs.push({ ...n, isSystem: true, sortDate: n.date }));
    userPersonalNotifications.forEach(r => allNotifs.push({ ...r, isSystem: false, sortDate: r.timestamp ? r.timestamp.toMillis() : Date.now() }));
    
    allNotifs.sort((a, b) => b.sortDate - a.sortDate);

    if (allNotifs.length === 0) {
        listContainer.innerHTML = '<div class="empty-notif"><i class="fas fa-satellite-dish"></i><br>Sin novedades por ahora.</div>';
        return;
    }
    
    allNotifs.forEach(item => {
        const div = document.createElement('div');
        div.className = 'notif-item';
        
        if (item.isSystem) {
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
                window.location.href = `anime-detail.html?id=${item.animeId}`;
            });
        } else {
            // RENDER DE RESPUESTA PERSONAL A COMENTARIO
            div.style.background = !item.seen ? 'rgba(0, 255, 247, 0.05)' : '';
            div.style.borderLeft = !item.seen ? '3px solid var(--neon-cyan)' : 'none';
            div.innerHTML = `
                <div class="notif-img-box" style="border-radius: 50%; width: 45px; height: 45px; border: 2px solid var(--neon-cyan);">
                    <img src="${item.senderAvatar}" alt="avatar">
                </div>
                <div class="notif-content" style="margin-left: 5px;">
                    <div class="notif-header-line">
                         <span class="n-title" style="color:var(--neon-cyan); font-weight:800;">@${item.senderName} te respondió:</span>
                    </div>
                    <div class="n-meta" style="color:#ddd; font-style:italic; line-height: 1.3;">"${item.text}"</div>
                </div>
            `;
            div.addEventListener('click', () => {
                window.location.href = `video-player.html?anime=${item.animeId}&s=${item.season}&e=${item.episode}`;
            });
        }
        
        listContainer.appendChild(div);
    });
}

function updateBellBadge() {
    const unreadSystem = notificationsHistory.filter(n => !n.seen).length;
    const unreadPersonal = userPersonalNotifications.filter(n => !n.seen).length;
    const totalUnread = unreadSystem + unreadPersonal;
    
    const badge = document.getElementById('notifBadge');
    if (badge) {
        if (totalUnread > 0) {
            badge.style.display = 'flex';
            badge.textContent = totalUnread > 9 ? '+9' : totalUnread;
            // Destacar de distinto color si es notificación personal (Ej. Cyan neón)
            if (unreadPersonal > 0) {
                badge.style.background = 'var(--neon-cyan)';
                badge.style.color = '#000';
                badge.style.boxShadow = '0 0 10px var(--neon-cyan)';
            } else {
                badge.style.background = 'var(--neon-pink)';
                badge.style.color = '#fff';
                badge.style.boxShadow = '0 0 10px var(--neon-pink)';
            }
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