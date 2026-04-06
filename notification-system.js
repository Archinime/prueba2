// notification-system.js
/* Sistema de notificaciones avanzado: Solo muestra lo nuevo. Lo visto se oculta automáticamente. Sincronización Local + Firebase */

let notificationQueue = []; // Cola de popups pendientes
let notificationsHistory = []; // Historial global
let isMenuOpen = false;
let repliesUnsubscribe = null; // Listener de respuestas

document.addEventListener('DOMContentLoaded', () => {
    loadHistoryFromStorage();
    
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
                // Sincroniza historial con la nube
                syncNotificationsWithCloud(user.uid);
                listenForReplies(user.uid);
            } else {
                if (repliesUnsubscribe) repliesUnsubscribe();
            }
        });
    }
});

// --- Funciones de almacenamiento ---
function loadHistoryFromStorage() {
    const stored = localStorage.getItem('archinime_notif_history');
    if (stored) {
        try { 
            notificationsHistory = JSON.parse(stored);
        } catch(e) { 
            notificationsHistory = [];
        }
    }
}

function saveHistoryToStorage() {
    localStorage.setItem('archinime_notif_history', JSON.stringify(notificationsHistory));
    updateBellBadge();

    // Sincronizar con la cuenta si el usuario inició sesión
    if (typeof auth !== 'undefined' && auth.currentUser && typeof db !== 'undefined') {
        db.collection('users').doc(auth.currentUser.uid).set({
            notifHistory: notificationsHistory
        }, { merge: true }).catch(e => console.error("Error guardando notificaciones en la nube", e));
    }
}

// --- Sincronización con la Nube ---
async function syncNotificationsWithCloud(uid) {
    try {
        const docRef = db.collection('users').doc(uid);
        const doc = await docRef.get();
        if (doc.exists && doc.data().notifHistory) {
            const cloudHistory = doc.data().notifHistory || [];
            
            // Fusionar local y nube (Priorizamos si ya fue visto o mostrado en cualquier dispositivo)
            let merged = [...notificationsHistory, ...cloudHistory];
            let uniqueMap = new Map();
            
            merged.forEach(n => {
                if (uniqueMap.has(n.notifId)) {
                    const existing = uniqueMap.get(n.notifId);
                    if (n.seen) existing.seen = true;
                    if (n.popupShown) existing.popupShown = true;
                    uniqueMap.set(n.notifId, existing);
                } else {
                    uniqueMap.set(n.notifId, n);
                }
            });
            
            notificationsHistory = Array.from(uniqueMap.values()).sort((a,b) => b.date - a.date).slice(0, 50);

            // Filtrar la cola de popups para quitar los que ya vimos en otro dispositivo
            let newQueue = [];
            notificationQueue.forEach(q => {
                const inHistory = notificationsHistory.find(n => n.notifId === q.notifId);
                // Si ya fue visto o su popup ya se mostró, lo sacamos de la cola
                if (inHistory && (inHistory.seen || inHistory.popupShown)) {
                    // Omitir, ya no se mostrará
                } else {
                    newQueue.push(q);
                }
            });
            notificationQueue = newQueue;
        }
        
        saveHistoryToStorage();
        renderNotificationList();
        updateBellBadge();
    } catch (e) {
        console.error("Error sincronizando notificaciones:", e);
    }
}

// --- Escuchar respuestas a comentarios ---
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
                            popupShown: true, // Las respuestas no usan popup
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
            console.error("Error escuchando respuestas:", error);
        });
}

// --- Detectar nuevos Animes / Actualizaciones ---
function checkForNewUpdates() {
    const updatedAnimes = animes.filter(a => a.lastUpdate && a.updateType && a.updateType !== "Ninguna" && !a.updateType.includes("ACTUALIZACIÓN"));
    updatedAnimes.sort((a, b) => b.lastUpdate - a.lastUpdate);

    let newItemsFound = [];
    let historyModified = false;

    updatedAnimes.forEach(anime => {
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
                popupShown: false // Aún no mostramos el popup
            };
            notificationsHistory.unshift(newNotif);
            newItemsFound.push(newNotif);
            historyModified = true;
        } else if (!exists.popupShown && !exists.seen) {
            // Si ya estaba en el historial pero falló al mostrarse la ventana antes
            newItemsFound.push(exists);
        }
    });

    if (newItemsFound.length > 0) {
        // Limitar a máximo 3 popups recientes para no abrumar la pantalla
        const newPopups = newItemsFound.slice(0, 3);
        
        // Marcamos INMEDIATAMENTE que ya se mostraron, así si recarga la página ya no salen
        newPopups.forEach(p => {
            const target = notificationsHistory.find(n => n.notifId === p.notifId);
            if (target) target.popupShown = true;
        });

        notificationQueue = notificationQueue.concat(newPopups);
        historyModified = true;
    }

    if (historyModified) {
        if (notificationsHistory.length > 50) notificationsHistory = notificationsHistory.slice(0, 50);
        saveHistoryToStorage();
    }
}

// --- Iniciar secuencia de Ventanas Emergentes (Popups) ---
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
            // Si el usuario cierra el popup, lo marcamos como visto para que desaparezca de la campana también
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

// --- Menú de Campana de Notificaciones ---
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

function renderNotificationList() {
    const listContainer = document.getElementById('notifList');
    if (!listContainer) return;
    
    listContainer.innerHTML = '';
    
    // FILTRO ESTRICTO: Solo mostramos las notificaciones que NO han sido vistas
    const unreadNotifications = notificationsHistory.filter(n => !n.seen);
    
    if (unreadNotifications.length === 0) {
        listContainer.innerHTML = `
            <div class="empty-notif" style="padding: 30px; text-align: center; color: #aaa;">
                <i class="fas fa-check-circle" style="font-size: 2.5rem; color: var(--neon-cyan); margin-bottom: 15px; display: block;"></i>
                ¡Todo al día!<br>No tienes notificaciones pendientes.
            </div>`;
        return;
    }

    const sortedHistory = [...unreadNotifications].sort((a, b) => b.date - a.date);
    
    // Limitamos a las 10 más nuevas
    sortedHistory.slice(0, 10).forEach(item => {
        const div = document.createElement('div');
        div.className = 'notif-item';
        div.style.transition = 'all 0.3s ease'; // Añadimos transición para el efecto de borrado
        
        let imgBoxClass = 'notif-img-box';
        if (item.type === 'RESPUESTA') imgBoxClass += ' rounded-avatar';
  
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
        let unreadIndicator = '<div style="position:absolute; left:8px; top:50%; transform:translateY(-50%); width:8px; height:8px; background:var(--neon-pink); border-radius:50%;"></div>';
        
        div.innerHTML = `
            ${unreadIndicator}
            <div class="${imgBoxClass}">
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
            markAsRead(item.notifId);
            
            // Animación para desaparecer al hacer clic
            div.style.opacity = '0';
            div.style.transform = 'translateX(20px)';
            
            setTimeout(() => {
                if (item.url) {
                    window.location.href = item.url;
                } else {
                    window.location.href = `anime-detail.html?id=${item.animeId}`;
                }
            }, 250);
        });
        
        listContainer.appendChild(div);
    });
}

function updateBellBadge() {
    // El contador se basa solo en lo que no has visto
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
    if (target && !target.seen) {
        target.seen = true;
        saveHistoryToStorage();
        updateBellBadge();
    }
}