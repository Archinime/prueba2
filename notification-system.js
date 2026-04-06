/* notification-system.js - Notificaciones de animes y respuestas a comentarios (Firestore) */

let notificationQueue = [];
let notificationsHistory = [];
let isMenuOpen = false;
let repliesUnsubscribe = null;

document.addEventListener('DOMContentLoaded', () => {
    loadHistoryFromStorage();
    
    if (typeof animes !== 'undefined') {
        checkForNewUpdates();
    } else {
        console.warn('Sistema de Notificaciones: index-data.js no cargado.');
    }
    
    renderNotificationList();
    updateBellBadge();

    // === NUEVO: Conectar con Firebase con Try/Catch para evitar crasheos ===
    try {
        if (typeof firebase !== 'undefined' && typeof auth !== 'undefined' && typeof db !== 'undefined') {
            auth.onAuthStateChanged(user => {
                if (user) {
                    listenForReplies(user.uid);
                } else {
                    if (repliesUnsubscribe) repliesUnsubscribe();
                }
            });
        }
    } catch (err) {
        console.error("Error al iniciar Firebase en notificaciones (no afectará los popups):", err);
    }

    // BOTÓN TEMPORAL DE PRUEBAS (Borra esto cuando ya subas la página oficial)
    crearBotonDePrueba();
});

function listenForReplies(uid) {
    if (repliesUnsubscribe) repliesUnsubscribe();
    
    try {
        repliesUnsubscribe = db.collection('comments')
            .where('replyToUserId', '==', uid)
            .orderBy('timestamp', 'desc')
            .limit(10)
            .onSnapshot(snapshot => {
                let hasNew = false;
                
                snapshot.docChanges().forEach(change => {
                    if (change.type === 'added') {
                        const data = change.doc.data();
                        
                        if (data.userId === uid) return; // No notificar auto-respuestas

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
                            hasNew = true;
                            notificationQueue.push(newNotif);
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
                console.error("Error al escuchar respuestas en Firebase:", error);
            });
    } catch (err) {
        console.error("Fallo al conectar con la colección comments:", err);
    }
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
        notificationQueue = notificationQueue.concat(newItemsFound.slice(0, 5));
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
    
    const notifType = notif.type || "NUEVO";
    const indieMessage = notifType === 'RESPUESTA' ? "Alguien interactuó contigo en los comentarios." : "¡Ya disponible en la plataforma! Disfruta del estreno.";
    
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
    if (notifType.includes("ESTRENO")) badgeClass = "badge-estreno";
    else if (notifType.includes("PRÓXIMAMENTE")) badgeClass = "badge-prox";
    else if (notifType === "RESPUESTA") badgeClass = "badge-estreno";

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
                <div class="event-type-badge ${badgeClass}">${notifType}</div>
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
    if (customUrl && customUrl !== 'undefined' && customUrl !== '') {
        window.location.href = customUrl;
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
        
        const itemType = item.type || "NUEVO";
        let typeColor = "var(--neon-purple)";
        if (itemType.includes("ESTRENO")) typeColor = "var(--neon-pink)";
        else if (itemType.includes("PRÓXIMAMENTE")) typeColor = "var(--neon-yellow)";
        else if (itemType === "RESPUESTA") typeColor = "var(--neon-cyan)";
      
        let finalLabel = item.isFinal ? `<span class="tag-final">FINALIZADO</span>` : "";
        div.innerHTML = `
            <div class="notif-img-box">
                <img src="${item.seasonCover}" alt="cover">
            </div>
            <div class="notif-content">
                <div class="notif-header-line">
                     <span class="n-title">${item.title}</span>
                </div>
                <div class="n-type" style="color:${typeColor}">${itemType} ${finalLabel}</div>
                <div class="n-meta">${infoString}</div>
            </div>
        `;
        div.addEventListener('click', () => {
            if (item.url && item.url !== 'undefined' && item.url !== '') {
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

// === FUNCIÓN DE PRUEBA (Para forzar los popups) ===
function crearBotonDePrueba() {
    const btn = document.createElement('button');
    btn.innerHTML = '🛠️ Forzar Popups';
    btn.style.cssText = `
        position: fixed; bottom: 20px; left: 20px; z-index: 999999;
        padding: 12px 20px; background: #ff0055; color: white;
        border: none; border-radius: 8px; font-weight: bold; cursor: pointer;
        box-shadow: 0 0 15px rgba(255, 0, 85, 0.5); font-family: 'Poppins', sans-serif;
    `;
    
    btn.onclick = () => {
        // 1. Borramos el historial del navegador para que crea que eres un usuario nuevo
        localStorage.removeItem('archinime_notif_history');
        notificationsHistory = [];
        notificationQueue = [];
        
        // 2. Volvemos a leer la lista de animes
        checkForNewUpdates();
        
        // 3. Disparamos la secuencia gráfica
        showNextPopup();
        
        btn.innerHTML = '¡Revisando...!';
        setTimeout(() => btn.innerHTML = '🛠️ Forzar Popups', 2000);
    };
    document.body.appendChild(btn);
}