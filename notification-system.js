/* notification-system.js - Versión mejorada sin notificaciones duplicadas */

let notificationQueue = [];
let notificationsHistory = [];
let isMenuOpen = false;

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
    const updatedAnimes = animes.filter(a => a.lastUpdate && a.updateType && a.updateType !== 'Ninguna');
    updatedAnimes.sort((a, b) => b.lastUpdate - a.lastUpdate);

    let newItemsFound = [];
    updatedAnimes.forEach(anime => {
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

    if (newItemsFound.length > 0) {
        if (notificationsHistory.length > 50) notificationsHistory = notificationsHistory.slice(0, 50);
        saveHistoryToStorage();
        notificationQueue = newItemsFound.slice(0, 5);
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
        renderNotificationList();
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