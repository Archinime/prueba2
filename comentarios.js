// ============================================
// SISTEMA DE COMENTARIOS CON RESPUESTAS (ESTILO YOUTUBE) Y NOTIFICACIONES
// ============================================

let comentariosDb = null;
let comentariosAuth = null;
let comentariosCurrentUser = null;
let comentariosUnsubscribe = null;

window.stickerSeleccionadoParaEnviar = null;
window.respondiendoA = null;

function initComentariosSystem(db, auth) {
    comentariosDb = db;
    comentariosAuth = auth;
    
    // Inyectar CSS Mejorado y Responsivo automáticamente
    injectCommentsCSS();

    auth.onAuthStateChanged(async (user) => {
        comentariosCurrentUser = user;
        updateComentariosUI();
        
        if (window.comentariosAnimeId && window.comentariosSeason && window.comentariosEpisode) {
            setupComentariosRealtimeListener();
        }
    });

    setTimeout(() => {
        const textarea = document.getElementById('comentarioTexto');
        if (textarea) {
            textarea.addEventListener('keydown', function(e) {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault(); 
                    enviarComentarioTexto();
                }
            });
        }
    }, 1000);
}

function injectCommentsCSS() {
    if (document.getElementById('archinime-comments-css')) return;
    const style = document.createElement('style');
    style.id = 'archinime-comments-css';
    style.innerHTML = `
        .action-btn { background: none; border: none; font-size: 0.85rem; font-family: 'Poppins', sans-serif; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 6px; padding: 6px 14px; border-radius: 20px; transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1); }
        .action-btn.reply-btn { color: var(--primary-color, #00fff7); background: rgba(0, 255, 247, 0.05); border: 1px solid rgba(0, 255, 247, 0.2); }
        .action-btn.reply-btn:hover { background: rgba(0, 255, 247, 0.2); box-shadow: 0 0 15px rgba(0, 255, 247, 0.4); transform: translateY(-2px); color: #fff; }
        .action-btn.delete-btn { color: #ff5555; background: rgba(255, 85, 85, 0.05); border: 1px solid rgba(255, 85, 85, 0.2); }
        .action-btn.delete-btn:hover { background: rgba(255, 85, 85, 0.2); box-shadow: 0 0 15px rgba(255, 85, 85, 0.4); transform: translateY(-2px); color: #fff; }
        
        .respuestas-wrapper { margin-left: 65px; margin-top: -5px; margin-bottom: 25px; position: relative; }
        .respuestas-line { position: absolute; left: -32px; top: 0; bottom: 20px; width: 2px; background: rgba(0, 255, 247, 0.15); border-radius: 2px; transition: 0.3s; }
        .respuestas-wrapper:hover .respuestas-line { background: rgba(0, 255, 247, 0.5); box-shadow: 0 0 10px rgba(0, 255, 247, 0.6); }
        
        .toggle-respuestas-btn { background: transparent; border: none; color: var(--primary-color, #00fff7); cursor: pointer; font-family: 'Poppins', sans-serif; font-weight: 600; font-size: 0.95rem; margin-bottom: 12px; display: flex; align-items: center; gap: 8px; transition: 0.3s; padding: 5px 15px; border-radius: 20px; }
        .toggle-respuestas-btn:hover { background: rgba(0, 255, 247, 0.1); text-shadow: 0 0 8px rgba(0, 255, 247, 0.8); }
        
        .show-more-replies-btn { background: rgba(188, 19, 254, 0.1); border: 1px dashed rgba(188, 19, 254, 0.5); color: #bc13fe; border-radius: 12px; padding: 10px; cursor: pointer; font-weight: bold; margin-top: 5px; transition: 0.3s; width: 100%; text-align: center; }
        .show-more-replies-btn:hover { background: rgba(188, 19, 254, 0.2); box-shadow: 0 0 15px rgba(188, 19, 254, 0.4); color: #fff; transform: translateY(-2px); }

        .comentario-item { animation: fadeIn 0.5s ease-out forwards; }
        
        @media (max-width: 768px) {
            .respuestas-wrapper { margin-left: 20px; }
            .respuestas-line { left: -10px; width: 2px; }
            .comentario-item { padding: 15px !important; flex-direction: column; gap: 12px !important; }
            .comentario-item.is-reply { padding: 12px !important; }
            .comentario-avatar img { width: 45px !important; height: 45px !important; }
            .is-reply .comentario-avatar img { width: 35px !important; height: 35px !important; }
            .action-btn { padding: 5px 12px; font-size: 0.8rem; }
            .comentario-header { flex-direction: column; align-items: flex-start !important; }
        }
    `;
    document.head.appendChild(style);
}

function getNeonColorByString(str) {
    const neonColors = ['#00fff7', '#ff0055', '#bc13fe', '#00ff33', '#ffff00', '#ffaa00', '#ff00aa', '#00aaff'];
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    return neonColors[Math.abs(hash) % neonColors.length];
}

function hexToRgbStr(hex) {
    let r = 0, g = 0, b = 0;
    if (hex.length === 7) {
        r = parseInt(hex.substring(1, 3), 16);
        g = parseInt(hex.substring(3, 5), 16);
        b = parseInt(hex.substring(5, 7), 16);
    }
    return `${r}, ${g}, ${b}`;
}

function setupComentariosRealtimeListener() {
    if (comentariosUnsubscribe) comentariosUnsubscribe();
    
    // Aumentamos el límite para asegurar que traemos tanto raíces como respuestas
    const commentsRef = comentariosDb.collection('comments')
        .where('animeId', '==', window.comentariosAnimeId)
        .where('season', '==', parseInt(window.comentariosSeason))
        .where('episode', '==', parseInt(window.comentariosEpisode))
        .orderBy('timestamp', 'desc') 
        .limit(100);

    comentariosUnsubscribe = commentsRef.onSnapshot((snapshot) => {
        const container = document.getElementById('comentariosList');
        
        if (snapshot.empty) {
            container.innerHTML = `<div class="empty-comments" style="color: var(--primary-color); text-shadow: 0 0 10px var(--primary-color);"><i class="fas fa-comment-dots" style="font-size: 3rem; margin-bottom: 15px; display: block; opacity: 0.5;"></i><p style="font-weight: bold; font-size: 1.1rem;">Sin comentarios aún. ¡Sé el primero en iniciar la conversación!</p></div>`;
            return;
        }
      
        // INVERTIMOS el array visualmente
        const docsReversed = [...snapshot.docs].reverse();
        const allComments = docsReversed.map(doc => ({ id: doc.id, ...doc.data() }));
        
        // --- CONSTRUCCIÓN DEL ÁRBOL DE COMENTARIOS ---
        const commentMap = new Map();
        allComments.forEach(c => commentMap.set(c.id, { ...c, replies: [] }));
        
        const roots = [];

        allComments.forEach(c => {
            if (c.replyToId && commentMap.has(c.replyToId)) {
                // Es una respuesta. Buscamos al padre principal para agruparlo estilo YouTube (1 solo nivel de indentación)
                let rootId = c.replyToId;
                while (commentMap.has(rootId) && commentMap.get(rootId).replyToId) {
                    rootId = commentMap.get(rootId).replyToId;
                }
                if (commentMap.has(rootId)) {
                    commentMap.get(rootId).replies.push(c);
                } else {
                    roots.push(commentMap.get(c.id)); // Fallback por si acaso
                }
            } else {
                // Es un comentario principal (raíz)
                roots.push(commentMap.get(c.id));
            }
        });

        // --- RENDERIZADO HTML ---
        let html = '';
        
        roots.forEach(root => {
            // Renderizamos el comentario principal
            html += generarHtmlComentario(root, false);

            // Renderizamos las respuestas (si tiene)
            if (root.replies && root.replies.length > 0) {
                // Ordenar respuestas por fecha (las más antiguas arriba)
                root.replies.sort((a, b) => (a.timestamp?.toMillis() || 0) - (b.timestamp?.toMillis() || 0));

                html += `<div class="respuestas-wrapper" id="respuestas-${root.id}">`;
                html += `<div class="respuestas-line"></div>`; // Línea conectora
                
                // Botón para desplegar
                const textoBtn = root.replies.length === 1 ? 'Ver 1 respuesta' : `Ver ${root.replies.length} respuestas`;
                html += `<button class="toggle-respuestas-btn" onclick="toggleRespuestas('${root.id}')">
                            <i class="fas fa-chevron-down" id="icon-${root.id}"></i> 
                            <span id="text-${root.id}">${textoBtn}</span>
                         </button>`;

                // Contenedor de respuestas (Oculto por defecto)
                html += `<div class="respuestas-container" id="container-${root.id}" style="display: none; flex-direction: column; gap: 12px;">`;

                root.replies.forEach((reply, index) => {
                    // Si hay más de 5, ocultamos el resto
                    const isHidden = index >= 5 ? 'display: none;' : '';
                    const hiddenClass = index >= 5 ? `hidden-reply-${root.id}` : '';
                    
                    html += `<div class="${hiddenClass}" style="${isHidden}">` + generarHtmlComentario(reply, true, root.id) + `</div>`;
                });

                // Botón "Mostrar más" si hay más de 5 respuestas
                if (root.replies.length > 5) {
                    const remaining = root.replies.length - 5;
                    html += `<button id="showMore-${root.id}" class="show-more-replies-btn" onclick="showMoreReplies('${root.id}')">
                                Mostrar ${remaining} respuestas más <i class="fas fa-level-down-alt"></i>
                             </button>`;
                }

                html += `</div></div>`; // Cierre container y wrapper
            }
        });
        
        container.innerHTML = html;
        
    }, (error) => console.error('Error en comentarios:', error));
}

// Generador unificado de HTML para Comentarios y Respuestas
function generarHtmlComentario(c, isReply) {
    let fecha = 'Justo ahora';
    if (c.timestamp?.toDate) fecha = obtenerTiempoRelativo(c.timestamp.toDate());
    
    const isOwner = comentariosCurrentUser?.uid === c.userId;
    const avatar = c.userAvatar || 'invitado.avif';
    const userName = c.userName || 'Usuario';
    const neonColor = getNeonColorByString(c.userId || userName);
    const rgbColor = hexToRgbStr(neonColor);
    
    let contenidoHtml = procesarTextoComentario(c.texto || '');
    
    // Etiqueta de mención
    if (c.replyToUser) {
        contenidoHtml = `<span style="color: ${neonColor}; font-weight: 800; margin-right: 5px; background: rgba(${rgbColor}, 0.15); padding: 2px 8px; border-radius: 6px; border: 1px solid rgba(${rgbColor}, 0.3);">@${escapeHtmlComent(c.replyToUser)}</span> ` + contenidoHtml;
    }

    if (c.esSticker && c.stickerUrl && !contenidoHtml.includes(c.stickerUrl)) {
        const isVideo = c.stickerUrl.match(/\.(mp4|webm)$/i);
        const tagMedia = isVideo ? 'video autoplay loop muted playsinline' : 'img loading="lazy"';
        contenidoHtml += `
            <div class="comentario-sticker-container" style="margin-top: 15px; display: inline-block;">
                <${tagMedia} src="${c.stickerUrl}" class="comentario-sticker" onclick="openStickerModal('${c.stickerUrl.replace(/'/g, "\\'")}')" style="max-width: 180px; max-height: 180px; border-radius: 12px; cursor: pointer; box-shadow: 0 8px 20px rgba(0,0,0,0.6); transition: transform 0.3s, box-shadow 0.3s; border: 1px solid rgba(${rgbColor}, 0.3);"
                onmouseover="this.style.transform='scale(1.05)'; this.style.boxShadow='0 12px 30px ${neonColor}80';" onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='0 8px 20px rgba(0,0,0,0.6)';" title="Clic para ver y robar"></${isVideo ? 'video' : 'img'}>
            </div>
        `;
    }
    
    // Estilos dinámicos dependiendo si es raíz o respuesta
    const padding = isReply ? '18px' : '22px';
    const avatarSize = isReply ? '45px' : '55px';
    const titleSize = isReply ? '1.05rem' : '1.15rem';
    const bgStyle = isReply ? `background: rgba(10, 10, 15, 0.85); backdrop-filter: blur(5px);` : `background: linear-gradient(135deg, rgba(15,15,20,0.95) 0%, rgba(5,5,10,0.95) 100%);`;

    // AHORA CUALQUIERA PUEDE RESPONDER (incluso a sí mismo, quitado !isOwner)
    const replyBtn = comentariosCurrentUser ? `<button class="action-btn reply-btn" onclick="prepararRespuesta('${c.id}', '${escapeHtmlComent(userName)}', '${c.userId}')"><i class="fas fa-reply"></i> Responder</button>` : '';
    
    const deleteBtn = isOwner ? `<button class="action-btn delete-btn" onclick="deleteComentario('${c.id}')" title="Eliminar"><i class="fas fa-trash-alt"></i></button>` : '';

    return `
        <div class="comentario-item ${isReply ? 'is-reply' : ''}" id="comment-${c.id}" style="position: relative; overflow: hidden; ${bgStyle} border: 1px solid rgba(${rgbColor}, 0.3); box-shadow: 0 8px 25px rgba(0,0,0,0.6), inset 0 0 10px rgba(${rgbColor}, 0.05); border-radius: 16px; padding: ${padding}; margin-bottom: ${isReply ? '0' : '15px'}; display: flex; gap: 18px; transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);"
        onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 12px 35px rgba(0,0,0,0.8), inset 0 0 20px rgba(${rgbColor}, 0.15)'; this.style.borderColor='rgba(${rgbColor}, 0.8)';"
        onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 8px 25px rgba(0,0,0,0.6), inset 0 0 10px rgba(${rgbColor}, 0.05)'; this.style.borderColor='rgba(${rgbColor}, 0.3)';">
            <div style="position: absolute; top: 0; left: 0; width: 4px; height: 100%; background: ${neonColor}; box-shadow: 0 0 15px ${neonColor};"></div>
            <div class="comentario-avatar" style="z-index: 2; flex-shrink: 0;">
                <img src="${avatar}" onerror="this.src='invitado.avif'" style="width: ${avatarSize}; height: ${avatarSize}; border-radius: 50%; object-fit: cover; border: 2px solid ${neonColor}; box-shadow: 0 0 15px rgba(${rgbColor}, 0.6);">
            </div>
            <div class="comentario-content" style="flex: 1; min-width: 0; z-index: 2;">
                <div class="comentario-header" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; flex-wrap: wrap; gap: 10px;">
                    <div style="display: flex; align-items: baseline; gap: 12px;">
                        <span class="comentario-user" style="color: #fff; text-shadow: 0 0 5px ${neonColor}; font-weight: 900; font-family: 'Orbitron', sans-serif; letter-spacing: 1px; font-size: ${titleSize};">${escapeHtmlComent(userName)}</span>
                        <span class="comentario-fecha" style="color: #888; font-size: 0.85rem; font-weight: 600;">${fecha}</span>
                    </div>
                </div>
                <div class="comentario-texto" style="color: #eee; font-size: 1.05rem; line-height: 1.6; text-shadow: 0 1px 3px #000; letter-spacing: 0.3px;">${contenidoHtml}</div>
                <div style="display: flex; gap: 12px; margin-top: 15px;">
                    ${replyBtn}
                    ${deleteBtn}
                </div>
            </div>
        </div>
    `;
}

// Funciones para el Acordeón y "Mostrar Más" de Respuestas
window.toggleRespuestas = function(rootId) {
    const container = document.getElementById(`container-${rootId}`);
    const icon = document.getElementById(`icon-${rootId}`);
    
    if (container.style.display === 'none') {
        container.style.display = 'flex';
        icon.classList.remove('fa-chevron-down');
        icon.classList.add('fa-chevron-up');
    } else {
        container.style.display = 'none';
        icon.classList.remove('fa-chevron-up');
        icon.classList.add('fa-chevron-down');
    }
};

window.showMoreReplies = function(rootId) {
    const hiddenReplies = document.querySelectorAll(`.hidden-reply-${rootId}`);
    hiddenReplies.forEach(el => {
        el.style.display = 'block';
        el.style.animation = 'fadeIn 0.5s ease-out forwards';
    });
    const btn = document.getElementById(`showMore-${rootId}`);
    if(btn) btn.style.display = 'none';
};

// ... RESTO DEL CÓDIGO INTACTO ...

function obtenerTiempoRelativo(fecha) {
    const ahora = new Date();
    const diffSegundos = Math.floor((ahora - fecha) / 1000);
    if (diffSegundos < 60) return 'Hace unos segundos';
    if (diffSegundos < 3600) return `Hace ${Math.floor(diffSegundos / 60)} min`;
    if (diffSegundos < 86400) return `Hace ${Math.floor(diffSegundos / 3600)} horas`;
    if (diffSegundos < 2592000) return `Hace ${Math.floor(diffSegundos / 86400)} días`;
    return fecha.toLocaleDateString();
}

function procesarTextoComentario(texto) {
    if (!texto) return '';
    let html = escapeHtmlComent(texto.trim());
    const emojisMap = { ':D': '😃', ':)': '😊', ':(': '😢', ':P': '😛', ';)': '😉', '<3': '❤️' };
    for (const [code, emoji] of Object.entries(emojisMap)) html = html.split(code).join(emoji);
    html = html.replace(/\n{2,}/g, '\n').replace(/\n/g, '<br>');
    const stickerRegex = /\[Sticker\]\(([^)]+)\)/g;
    html = html.replace(stickerRegex, (match, url) => {
        const isVideo = url.match(/\.(mp4|webm)$/i);
        const tag = isVideo ? 'video autoplay loop muted playsinline' : 'img loading="lazy"';
        return `
        <div class="comentario-sticker-container" style="margin-top: 15px; display: inline-block;">
            <${tag} src="${url}" class="comentario-sticker" onclick="openStickerModal('${url.replace(/'/g, "\\'")}')" style="max-width: 180px; max-height: 180px; border-radius: 12px; cursor: pointer; box-shadow: 0 8px 20px rgba(0,0,0,0.6); transition: transform 0.3s; border: 1px solid rgba(0, 255, 247, 0.3);" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'" title="Clic para ver y robar"></${isVideo ? 'video' : 'img'}>
        </div>`;
    });
    const palabras = html.split(/(\s+)/);
    for (let i = 0; i < palabras.length; i++) {
        let palabra = palabras[i];
        if (palabra.startsWith('http://') || palabra.startsWith('https://')) {
            if (palabra.match(/\.(jpg|jpeg|png|gif|webp|avif)(\?.*)?$/i) && !palabra.includes('class="comentario-sticker"')) {
                palabras[i] = `<img src="${palabra}" class="comentario-imagen" loading="lazy" style="max-width: 200px; border-radius: 8px; border: 1px solid rgba(0, 255, 247, 0.3); margin-top: 15px; box-shadow: 0 5px 15px rgba(0,0,0,0.5);">`;
            } else if (palabra.match(/\.(mp4|webm)(\?.*)?$/i) && !palabra.includes('class="comentario-sticker"')) {
                palabras[i] = `<video src="${palabra}" autoplay loop muted playsinline class="comentario-imagen" style="max-width: 200px; border-radius: 8px; border: 1px solid rgba(0, 255, 247, 0.3); margin-top: 15px; box-shadow: 0 5px 15px rgba(0,0,0,0.5);"></video>`;
            } else if (!palabra.includes('class="comentario-sticker"')) {
                palabras[i] = `<a href="${palabra}" target="_blank" rel="noopener noreferrer" class="comentario-link" style="color: #00fff7; text-decoration: underline; text-shadow: 0 0 5px rgba(0,255,247,0.5);">${palabra}</a>`;
            }
        }
    }
    return palabras.join('').replace(/^(<br>)+/, '').trim();
}

window.prepararRespuesta = function(commentId, userName, userId) {
    window.respondiendoA = { id: commentId, userName, userId };
    let banner = document.getElementById('replyInfoBanner');
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'replyInfoBanner';
        banner.style.cssText = "margin-bottom: 15px; display: flex; align-items: center; justify-content: space-between; background: rgba(0,255,247,0.1); padding: 10px 20px; border-radius: 12px; border-left: 4px solid var(--primary-color); backdrop-filter: blur(5px); animation: fadeIn 0.3s ease-out;";
        const formContainer = document.querySelector('.comentario-input-wrapper');
        formContainer.parentNode.insertBefore(banner, formContainer);
    }
    
    banner.innerHTML = `<span style="color:var(--primary-color); font-size:0.95rem; font-weight: bold;"><i class="fas fa-reply"></i> Respondiendo a <b>@${escapeHtmlComent(userName)}</b></span> 
    <button onclick="cancelarRespuesta()" style="background:rgba(255,85,85,0.2); border:1px solid #ff5555; color:#ff5555; border-radius: 50%; width: 28px; height: 28px; cursor:pointer; font-size: 0.9rem; transition: 0.3s;" onmouseover="this.style.background='#ff5555'; this.style.color='#fff';" onmouseout="this.style.background='rgba(255,85,85,0.2)'; this.style.color='#ff5555';" title="Cancelar respuesta"><i class="fas fa-times"></i></button>`;
    banner.style.display = 'flex';
    
    document.getElementById('comentarioTexto').focus();
};

window.cancelarRespuesta = function() {
    window.respondiendoA = null;
    const banner = document.getElementById('replyInfoBanner');
    if (banner) banner.style.display = 'none';
};

window.openStickerModal = function(url) {
    let modal = document.getElementById('stickerViewModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'stickerViewModal';
        modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(5,5,5,0.95);backdrop-filter:blur(15px);z-index:100000;display:flex;flex-direction:column;align-items:center;justify-content:center;opacity:0;transition:opacity 0.3s; padding: 20px;';
        modal.innerHTML = `
            <div style="position:relative; text-align:center; max-width: 90vw;">
                <button onclick="closeStickerModal()" style="position:absolute;top:-50px;right:-10px;background:none;border:none;color:#fff;font-size:2.5rem;cursor:pointer;text-shadow:0 0 15px #ff0055; transition: 0.2s;" onmouseover="this.style.color='#ff0055'; transform='scale(1.2)';" onmouseout="this.style.color='#fff'; transform='scale(1)';">&times;</button>
                <img id="stickerModalImg" src="" style="display:none; max-width:100%;max-height:65vh;border-radius:20px;box-shadow:0 0 50px rgba(0,255,247,0.5); object-fit:contain; border: 2px solid rgba(0,255,247,0.4);">
                <video id="stickerModalVid" src="" autoplay loop muted playsinline style="display:none; max-width:100%;max-height:65vh;border-radius:20px;box-shadow:0 0 50px rgba(0,255,247,0.5); object-fit:contain; border: 2px solid rgba(0,255,247,0.4);"></video>
                <br>
                <button id="stickerModalStealBtn" style="margin-top:30px;background:linear-gradient(135deg, rgba(0,255,247,0.1), rgba(188,19,254,0.2));border:1px solid #00fff7;color:#fff;padding:15px 35px;border-radius:30px;font-size:1.15rem;cursor:pointer;font-weight:900;font-family:'Orbitron',sans-serif;box-shadow:0 0 25px rgba(0,255,247,0.4), inset 0 0 15px rgba(0,255,247,0.2);transition:all 0.3s;letter-spacing:1px;text-transform:uppercase;">
                    <i class="fas fa-mask" style="color: #00fff7;"></i> Robar Sticker
                </button>
            </div>
        `;
        document.body.appendChild(modal);
    }
    
    const isVideo = url.match(/\.(mp4|webm)$/i);
    const imgEl = document.getElementById('stickerModalImg');
    const vidEl = document.getElementById('stickerModalVid');
    
    if (isVideo) {
        imgEl.style.display = 'none'; vidEl.src = url;
        vidEl.style.display = 'inline-block';
    } else {
        vidEl.style.display = 'none'; imgEl.src = url;
        imgEl.style.display = 'inline-block';
    }
    
    document.getElementById('stickerModalStealBtn').onclick = function() {
        if(typeof window.robarStickerSistema === 'function') {
            window.robarStickerSistema(url);
            closeStickerModal();
        } else alert("El sistema no ha cargado. Inicia sesión primero.");
    };
    
    modal.style.display = 'flex';
    setTimeout(() => modal.style.opacity = '1', 10);
};

window.closeStickerModal = function() {
    let modal = document.getElementById('stickerViewModal');
    if (modal) {
        modal.style.opacity = '0';
        setTimeout(() => { modal.style.display = 'none'; document.getElementById('stickerModalVid').src = ''; }, 300);
    }
};

async function enviarComentarioTexto() {
    if (!comentariosCurrentUser) return openLoginModalFromComent();
    
    const texto = document.getElementById('comentarioTexto').value.trim();
    const stickerUrl = window.stickerSeleccionadoParaEnviar;
    if (!texto && !stickerUrl) return showToastComent('⚠️ No puedes enviar un comentario vacío');
    
    const btn = document.getElementById('enviarComentarioBtn');
    btn.disabled = true;
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';
    
    let textoFinal = texto + (stickerUrl ? ((texto ? '\n' : '') + `[Sticker](${stickerUrl})`) : '');
    
    try {
        await comentariosDb.collection('comments').add({
            animeId: window.comentariosAnimeId,
            season: parseInt(window.comentariosSeason),
            episode: parseInt(window.comentariosEpisode),
            userId: comentariosCurrentUser.uid,
            userName: comentariosCurrentUser.displayName || comentariosCurrentUser.email.split('@')[0],
            userAvatar: comentariosCurrentUser.photoURL || 'invitado.avif',
            texto: textoFinal,
            esSticker: !!stickerUrl,
            stickerUrl: stickerUrl || null,
            replyToId: window.respondiendoA ? window.respondiendoA.id : null,
            replyToUser: window.respondiendoA ? window.respondiendoA.userName : null,
            replyToUserId: window.respondiendoA ? window.respondiendoA.userId : null,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });

        // NOTIFICACIÓN AL USUARIO (Solo si no te estás respondiendo a ti mismo)
        if (window.respondiendoA && window.respondiendoA.userId !== comentariosCurrentUser.uid) {
            await comentariosDb.collection('user_notifications').add({
                targetUserId: window.respondiendoA.userId,
                fromUserName: comentariosCurrentUser.displayName || comentariosCurrentUser.email.split('@')[0],
                fromUserAvatar: comentariosCurrentUser.photoURL || 'invitado.avif',
                animeId: window.comentariosAnimeId,
                season: window.comentariosSeason,
                episode: window.comentariosEpisode,
                type: 'REPLY',
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                read: false
            });
        }

        document.getElementById('comentarioTexto').value = '';
        quitarStickerPreview();
        cancelarRespuesta();
        showToastComent('✅ Comentario publicado');
    } catch (error) {
        alert('Error: ' + error.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

window.seleccionarStickerParaEnviar = function(url) {
    window.stickerSeleccionadoParaEnviar = url;
    const previewContainer = document.getElementById('comentarioStickerPreview');
    const previewImg = document.getElementById('previewStickerImgObj');
    const previewVid = document.getElementById('previewStickerVidObj');
    
    if (url.match(/\.(mp4|webm)$/i)) {
        previewImg.style.display = 'none'; previewVid.src = url;
        previewVid.style.display = 'inline-block';
    } else {
        previewVid.style.display = 'none'; previewImg.src = url;
        previewImg.style.display = 'inline-block';
    }
    
    previewContainer.style.display = 'inline-block';
    const panel = document.getElementById('stickerPanelFull');
    if (panel) panel.classList.remove('active');
};

window.quitarStickerPreview = function() {
    window.stickerSeleccionadoParaEnviar = null;
    document.getElementById('comentarioStickerPreview').style.display = 'none';
    document.getElementById('previewStickerImgObj').src = '';
    document.getElementById('previewStickerVidObj').src = '';
};

async function deleteComentario(commentId) {
    if (!confirm('¿Seguro que deseas eliminar este comentario? También se eliminarán las respuestas directas si las tuviera.')) return;
    try {
        await comentariosDb.collection('comments').doc(commentId).delete();
        showToastComent('🗑️ Comentario eliminado');
    } catch (error) { alert('Error al eliminar: ' + error.message); }
}

function updateComentariosUI() {
    const loginMsg = document.getElementById('comentarioLoginMessage');
    const formContainer = document.getElementById('comentarioFormContainer');
    if (!comentariosCurrentUser) {
        if (loginMsg) loginMsg.style.display = 'block';
        if (formContainer) formContainer.style.display = 'none';
    } else {
        if (loginMsg) loginMsg.style.display = 'none';
        if (formContainer) formContainer.style.display = 'block';
        const avatar = document.getElementById('comentarioUserAvatar');
        if (avatar) avatar.src = comentariosCurrentUser.photoURL || 'invitado.avif';
        const name = document.getElementById('comentarioUserName');
        if (name) name.innerText = comentariosCurrentUser.displayName || comentariosCurrentUser.email.split('@')[0];
    }
}

function toggleEmojiPanelSistema() {
    const panel = document.getElementById('emojiPanel');
    if (panel) {
        panel.classList.toggle('active');
        const stickerPanel = document.getElementById('stickerPanelFull');
        if (stickerPanel) stickerPanel.classList.remove('active');
    }
}

function toggleStickerPanelSistema() {
    const panel = document.getElementById('stickerPanelFull');
    if (panel) {
        panel.classList.toggle('active');
        const emojiPanel = document.getElementById('emojiPanel');
        if (emojiPanel) emojiPanel.classList.remove('active');
    }
}

function agregarEmojiAlTexto(emoji) {
    const textarea = document.getElementById('comentarioTexto');
    if (textarea) {
        const start = textarea.selectionStart; const text = textarea.value;
        textarea.value = text.substring(0, start) + emoji + text.substring(start);
        textarea.focus();
    }
}

function showToastComent(msg) {
    let toast = document.getElementById('toastComent');
    if (!toast) {
        toast = document.createElement('div'); toast.id = 'toastComent';
        toast.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#0f0f13;color:#00fff7;padding:12px 25px;border-radius:30px;z-index:1000;font-weight:bold;box-shadow:0 0 20px rgba(0,255,247,0.5); border: 1px solid #00fff7; transition: all 0.3s;';
        document.body.appendChild(toast);
    }
    toast.innerHTML = msg; toast.style.display = 'block';
    setTimeout(() => toast.style.display = 'none', 2500);
}

function openLoginModalFromComent() { const modal = document.getElementById('authModal'); if (modal) modal.classList.add('show'); }
function escapeHtmlComent(text) { const div = document.createElement('div'); div.textContent = text; return div.innerHTML; }