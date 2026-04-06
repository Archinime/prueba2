/* =======================================================
   notification-system.js - ACTUALIZADO (Firebase + Popups)
   ======================================================= */

let notificationQueue = [];
let notificationsHistory = [];
let isMenuOpen = false;
let repliesUnsubscribe = null; // Conexión a Firebase

document.addEventListener('DOMContentLoaded', () => {
    loadHistoryFromStorage();
    
    // 1. Chequear actualizaciones de animes
    if (typeof animes !== 'undefined') {
        checkForNewUpdates();
    } else {
        console.warn('Sistema de Notificaciones: index-data.js no cargado.');
    }
    
    renderNotificationList();
    updateBellBadge();

    // 2. Conectar con Firebase para escuchar respuestas en tiempo real
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

// Función que es llamada desde tu index.html cuando termina el loader
window.startNotificationSequence = function() {
    setTimeout(() => {
        showNextNotification();
    }, 1000);
};

// Escucha respuestas en Firebase y lanza el popup instantáneo
function listenForReplies(uid) {
    if (repliesUnsubscribe) repliesUnsubscribe();

    repliesUnsubscribe = db.collection('comments')
        .where('replyToUserId', '==', uid)
        .orderBy('timestamp', 'desc')
        .limit(10)
        .onSnapshot(snapshot => {
            snapshot.docChanges().forEach(change => {
                if (change.type === "added") {
                    const data = change.doc.data();
                    if (!notificationsHistory.find(n => n.id === change.doc.id)) {
                        const newNotif = {
                            id: change.doc.id,
                            title: "Nueva respuesta",
                            type: "COMENTARIO 💬",
                            info: `${data.userName} respondió a tu comentario`,
                            seasonCover: data.userAvatar || 'Logo_Archinime.avif',
                            url: data.url || '#',
                            timestamp: data.timestamp?.toDate().getTime() || Date.now(),
                            seen: false
                        };
                        
                        notificationsHistory.unshift(newNotif);
                        notificationQueue.push(newNotif); // Añadir a la cola de popups
                        saveHistoryToStorage();
                        renderNotificationList();
                        showNextNotification(); // Lanzar popup
                    }
                }
            });
        });
}

function checkForNewUpdates() {
    const updatedAnimes = animes.filter(a => a.lastUpdate && a.updateType);
    updatedAnimes.sort((a, b) => b.lastUpdate - a.lastUpdate);

    updatedAnimes.forEach(anime => {
        if (anime.updateType.includes("ACTUALIZACIÓN")) return; 

        const notifId = `anime_${anime.id}_${anime.lastUpdate}`;
        const alreadyExists = notificationsHistory.some(n => n.id === notifId);

        if (!alreadyExists) {
            let infoString = "";
            if (anime.latestBlockName && anime.latestEpTitle) {
                infoString = `${anime.latestBlockName} - ${anime.latestEpTitle}`;
            } else if (anime.latestBlockName) {
                infoString = anime.latestBlockName;
            } else if (anime.latestEpTitle) {
                infoString = anime.latestEpTitle;
            }

            const newNotif = {
                id: notifId,
                animeId: anime.id,
                title: anime.title,
                type: anime.updateType,
                info: infoString,
                seasonCover: anime.latestSeasonCover || anime.img,
                isFinal: anime.isFinal,
                timestamp: anime.lastUpdate,
                seen: false
            };
            notificationsHistory.unshift(newNotif);
            notificationQueue.push(newNotif); // Añadir a la cola de popups
        }
    });
    saveHistoryToStorage();
}

// ==========================================
// LÓGICA DE VENTANAS EMERGENTES (POPUPS)
// ==========================================

function showNextNotification() {
    if (notificationQueue.length === 0) return;
    if (document.querySelector('.notification-popup')) return; // Ya hay un popup en pantalla

    const item = notificationQueue.shift();
    showNotificationPopup(item);
}

function showNotificationPopup(item) {
    const popup = document.createElement('div');
    popup.className = 'notification-popup';

    let typeColor = "#00f3ff"; // cyan por defecto
    if (item.type.includes("NUEVO")) typeColor = "#ff0055"; // pink
    else if (item.type.includes("ESTRENO")) typeColor = "#bc13fe"; // purple
    else if (item.type.includes("PRÓXIMAMENTE")) typeColor = "#f1c40f"; // yellow
    else if (item.type.includes("COMENTARIO")) typeColor = "#00ff88"; // green

    let finalLabel = item.isFinal ? `<span class="tag-final" style="font-size:0.6rem; background:#ff0055; color:#fff; padding:2px 4px; border-radius:3px; margin-left:5px;">FINALIZADO</span>` : "";

    popup.innerHTML = `
        <div class="notif-popup-content">
            <img src="${item.seasonCover}" class="notif-popup-img" alt="cover">
            <div class="notif-popup-text">
                <span class="notif-popup-type" style="color:${typeColor}">${item.type} ${finalLabel}</span>
                <span class="notif-popup-title">${item.title}</span>
                <span class="notif-popup-desc">${item.info || ''}</span>
            </div>
            <button class="notif-popup-close">&times;</button>
        </div>
        <div class="notif-progress-bar" style="background:${typeColor};"></div>
    `;

    document.body.appendChild(popup);

    // Redirigir al hacer clic en el popup (A VideoPlayer si es respuesta, o AnimeDetail si es anime)
    popup.addEventListener('click', (e) => {
        if (e.target.classList.contains('notif-popup-close')) return;
        if (item.url) window.location.href = item.url;
        else window.location.href = `anime-detail.html?id=${item.animeId}`;
    });

    // Botón de cerrar manual
    const closeBtn = popup.querySelector('.notif-popup-close');
    closeBtn.onclick = (e) => {
        e.stopPropagation();
        closePopup(popup);
    };

    // Auto-cerrar después de 5 segundos
    setTimeout(() => {
        closePopup(popup);
    }, 5000);
}

function closePopup(popup) {
    if (!popup || !popup.parentElement) return;
    popup.classList.add('fade-out');
    setTimeout(() => {
        if (popup.parentElement) popup.remove();
        showNextNotification(); // Llama al siguiente en la cola
    }, 500);
}

// ==========================================
// LÓGICA DE HISTORIAL Y CAMPANA
// ==========================================

function loadHistoryFromStorage() {
    const stored = localStorage.getItem('archinime_notif_history');
    if (stored) {
        try { notificationsHistory = JSON.parse(stored); } 
        catch (e) { notificationsHistory = []; }
    }
}

function saveHistoryToStorage() {
    localStorage.setItem('archinime_notif_history', JSON.stringify(notificationsHistory));
    updateBellBadge();
}

function renderNotificationList() {
    const listContainer = document.getElementById('notificationList');
    if (!listContainer) return;

    listContainer.innerHTML = '';
    if (notificationsHistory.length === 0) {
        listContainer.innerHTML = '<div class="empty-notif">No tienes notificaciones</div>';
        return;
    }

    notificationsHistory.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = `notification-item ${item.seen ? 'seen' : 'unseen'}`;
        
        let typeColor = "#00f3ff";
        if (item.type.includes("NUEVO")) typeColor = "#ff0055";
        else if (item.type.includes("ESTRENO")) typeColor = "#bc13fe";
        else if (item.type.includes("PRÓXIMAMENTE")) typeColor = "#f1c40f";
        else if (item.type.includes("COMENTARIO")) typeColor = "#00ff88";

        let finalLabel = item.isFinal ? `<span class="tag-final">FINALIZADO</span>` : "";

        div.innerHTML = `
            <div class="notif-img-box">
                <img src="${item.seasonCover}" alt="cover">
            </div>
            <div class="notif-content">
                <div class="notif-header-line">
                    <span class="n-title">${item.title}</span>
                    <button class="delete-notif-btn" title="Eliminar" onclick="deleteNotification(event, ${index})"><i class="fas fa-times"></i></button>
                </div>
                <div class="n-type" style="color:${typeColor}">${item.type} ${finalLabel}</div>
                <div class="n-meta">${item.info || ''}</div>
            </div>
        `;
        
        div.addEventListener('click', (e) => {
            if(e.target.closest('.delete-notif-btn')) return;
            item.seen = true;
            saveHistoryToStorage();
            if (item.url) window.location.href = item.url;
            else window.location.href = `anime-detail.html?id=${item.animeId}`;
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

function toggleNotificationMenu() {
    const menu = document.getElementById('notificationMenu');
    if (!menu) return;
    isMenuOpen = !isMenuOpen;
    if (isMenuOpen) {
        menu.classList.add('active');
        renderNotificationList(); 
    } else {
        menu.classList.remove('active');
        markAllAsSeen();
    }
}

document.addEventListener('click', (e) => {
    const menu = document.getElementById('notificationMenu');
    const btn = document.querySelector('.notif-bell-btn');
    if (isMenuOpen && menu && !menu.contains(e.target) && btn && !btn.contains(e.target)) {
        toggleNotificationMenu();
    }
});

function markAllAsSeen() {
    let changed = false;
    notificationsHistory.forEach(n => {
        if (!n.seen) { n.seen = true; changed = true; }
    });
    if (changed) saveHistoryToStorage();
}

window.markAsRead = function() {
    markAllAsSeen();
    renderNotificationList();
};

window.clearAllNotifications = function() {
    notificationsHistory = [];
    saveHistoryToStorage();
    renderNotificationList();
};

window.deleteNotification = function(event, index) {
    event.stopPropagation();
    notificationsHistory.splice(index, 1);
    saveHistoryToStorage();
    renderNotificationList();
};