/* notification-system.js - Notificaciones de Animes y Respuestas a Comentarios */

let notificationQueue = [];
let notificationsHistory = [];
let isMenuOpen = false;

// Variables para respuestas a comentarios
let personalNotifications = [];
let personalNotifsUnsubscribe = null;

document.addEventListener('DOMContentLoaded', () => {
    loadHistoryFromStorage();
    if (typeof animes !== 'undefined') {
        checkForNewUpdates();
    } else {
        console.warn('Sistema de Notificaciones: index-data.js no cargado.');
    }
    
    // Iniciar escucha de Firebase para notificaciones de respuestas si Firebase está listo
    if (typeof firebase !== 'undefined') {
        initPersonalNotifications();
    }
    
    renderNotificationList();
    updateBellBadge();
});

function initPersonalNotifications() {
    firebase.auth().onAuthStateChanged(user => {
        if (user) {
            const db = firebase.firestore();
            if (personalNotifsUnsubscribe) personalNotifsUnsubscribe();

            // Escuchamos las notificaciones específicas para este usuario
            personalNotifsUnsubscribe = db.collection('user_notifications')
                .where('targetUserId', '==', user.uid)
                .orderBy('timestamp', 'desc')
                .limit(20)
                .onSnapshot(snapshot => {
                    personalNotifications = [];
                    snapshot.forEach(doc => {
                        personalNotifications.push({ id: doc.id, ...doc.data() });
                    });
                    renderNotificationList();
                    updateBellBadge();
                });
        } else {
            personalNotifications = [];
            if (personalNotifsUnsubscribe) personalNotifsUnsubscribe();
            renderNotificationList();
            updateBellBadge();
        }
    });
}

function loadHistoryFromStorage() {
    const stored = localStorage.getItem('archinime_notif_history');
    if (stored) {
        try { notificationsHistory = JSON.parse(stored); } catch(e) { notificationsHistory = []; }
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
    if (notif.blockName && notif.blockName !== "Novedad") infoString += `<span style="color:var(--neon-cyan)">${notif.blockName}</span>`;
    if (notif.epTitle && notif.epTitle !== "Nuevo Contenido") {
        if (infoString !== "") infoString += " • ";
        infoString += `<span style="color:#fff">${notif.epTitle}</span>`;
    } else if (infoString === "") infoString = "Nuevo Contenido";

    let badgeClass = "badge-default";
    if (notif.type.includes("ESTRENO")) badgeClass = "badge-estreno";
    else if (notif.type.includes("PRÓXIMAMENTE")) badgeClass = "badge-prox";

    let finalImgHTML = notif.isFinal ? `<div class="final-stamp">FINALIZADO</div>` : '';

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
        renderNotificationList();
        
        // Marcar todas como vistas locales
        notificationsHistory.forEach(n => n.seen = true);
        saveHistoryToStorage();
        
        // Marcar notificaciones de Firestore como leídas
        if (personalNotifications.length > 0 && typeof firebase !== 'undefined') {
            const db = firebase.firestore();
            const batch = db.batch();
            personalNotifications.forEach(n => {
                if (!n.read) {
                    batch.update(db.collection('user_notifications').doc(n.id), { read: true });
                }
            });
            batch.commit();
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
    
    // Mezclamos el historial global con las notificaciones personales
    let allNotifs = [];
    
    // Mapear el historial del sistema
    notificationsHistory.forEach(item => {
        allNotifs.push({
            isPersonal: false,
            timestampVal: item.date,
            data: item
        });
    });

    // Mapear notificaciones personales
    personalNotifications.forEach(item => {
        allNotifs.push({
            isPersonal: true,
            timestampVal: item.timestamp ? item.timestamp.toMillis() : Date.now(),
            data: item
        });
    });

    // Ordenar todas combinadas por fecha más reciente
    allNotifs.sort((a, b) => b.timestampVal - a.timestampVal);

    if (allNotifs.length === 0) {
        listContainer.innerHTML = '<div class="empty-notif"><i class="fas fa-satellite-dish"></i><br>Sin novedades por ahora.</div>';
        return;
    }

    allNotifs.forEach(wrapper => {
        const div = document.createElement('div');
        div.className = 'notif-item';
        
        if (wrapper.isPersonal) {
            // NOTIFICACIÓN PERSONAL (RESPUESTA)
            const p = wrapper.data;
            const linkHref = `video-player.html?anime=${p.animeId}&s=${p.season}&e=${p.episode}`;
            
            div.style.background = p.read ? 'transparent' : 'rgba(0, 255, 247, 0.1)';
            div.innerHTML = `
                <div class="notif-img-box" style="border-radius: 50%; overflow: hidden; width: 50px; height: 50px;">
                    <img src="${p.fromUserAvatar || 'invitado.avif'}" alt="User Avatar">
                </div>
                <div class="notif-content">
                    <div class="notif-header-line">
                        <span class="n-title" style="color: var(--primary-color);">Te han respondido</span>
                    </div>
                    <div class="n-meta">
                        <strong style="color: #fff;">${p.fromUserName}</strong> te ha mencionado en un comentario.
                    </div>
                </div>
            `;
            div.addEventListener('click', () => { window.location.href = linkHref; });
            
        } else {
            // NOTIFICACIÓN DEL SISTEMA GLOBAL
            const item = wrapper.data;
            let infoString = "";
            if (item.blockName && item.blockName !== "Novedad") infoString += `<span class="n-block">${item.blockName}</span>`;
            if (item.epTitle && item.epTitle !== "Nuevo Contenido") {
                if (infoString !== "") infoString += " ";
                infoString += `<span class="n-ep-title">${item.epTitle}</span>`;
            } else if (infoString === "") infoString = `<span class="n-ep-title">Nuevo Contenido</span>`;
            
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
            div.addEventListener('click', () => { window.location.href = `anime-detail.html?id=${item.animeId}`; });
        }
        
        listContainer.appendChild(div);
    });
}

function updateBellBadge() {
    const unreadSystem = notificationsHistory.filter(n => !n.seen).length;
    const unreadPersonal = personalNotifications.filter(n => !n.read).length;
    
    const unreadTotal = unreadSystem + unreadPersonal;
    const badge = document.getElementById('notifBadge');
    
    if (badge) {
        if (unreadTotal > 0) {
            badge.style.display = 'block';
            badge.style.background = unreadPersonal > 0 ? 'var(--primary-color)' : 'var(--neon-pink)';
            badge.textContent = unreadTotal > 9 ? '+9' : unreadTotal;
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