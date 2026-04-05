// ============================================
// SISTEMA DE COMENTARIOS "PREMIUM" CON RESPUESTAS Y NOTIFICACIONES
// Archivo: comentarios.js
// ============================================

let comentariosDb = null;
let comentariosAuth = null;
let comentariosCurrentUser = null;
let comentariosUnsubscribe = null;

window.stickerSeleccionadoParaEnviar = null;
window.respondiendoA = null;

/**
 * Inicializa el sistema de comentarios.
 */
function initComentariosSystem(db, auth) {
    comentariosDb = db;
    comentariosAuth = auth;
    injectCommentsCSS();
    
    auth.onAuthStateChanged(async (user) => {
        comentariosCurrentUser = user;
        updateComentariosUI();
        
        if (window.comentariosAnimeId && window.comentariosSeason && window.comentariosEpisode) {
            setupComentariosRealtimeListener();
        }
    });

    // Configuración "Premium" para la caja principal (Auto-resize y atajos)
    setTimeout(() => {
        const textarea = document.getElementById('comentarioTexto');
        if (textarea) {
            // Atajo de Enter
            textarea.addEventListener('keydown', function(e) {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault(); 
                    if(this.value.trim().length > 0 || window.stickerSeleccionadoParaEnviar) {
                        enviarComentarioTexto();
                    }
                }
            });
            // Auto-expandir y habilitar botón
            textarea.addEventListener('input', function() {
                autoResizeTextarea(this);
                validarBotonPrincipal(this);
            });
        }
    }, 1000);
}

/**
 * Utilidad para hacer que los textareas crezcan según el contenido
 */
function autoResizeTextarea(el) {
    el.style.height = 'auto';
    el.style.height = (el.scrollHeight) + 'px';
}

/**
 * Inyecta los estilos CSS optimizados (Cero Blur para máximo rendimiento)
 */
function injectCommentsCSS() {
    if (document.getElementById('archinime-comments-css')) return;
    const style = document.createElement('style');
    style.id = 'archinime-comments-css';
    style.innerHTML = `
        /* Botones de acción Premium */
        .action-btn { background: transparent; border: none; font-size: 0.85rem; font-family: 'Poppins', sans-serif; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 8px; transition: all 0.2s ease; color: #888; }
        .action-btn.reply-btn:hover { color: var(--primary-color, #00fff7); background: rgba(0, 255, 247, 0.1); transform: translateY(-1px); }
        .action-btn.delete-btn:hover { color: #ff5555; background: rgba(255, 85, 85, 0.1); transform: translateY(-1px); }
        
        /* Árbol de respuestas elegante */
        .respuestas-wrapper { margin-left: 55px; margin-top: 8px; margin-bottom: 20px; position: relative; }
        .respuestas-line { position: absolute; left: -26px; top: 0; bottom: 25px; width: 2px; background: rgba(255, 255, 255, 0.08); border-radius: 2px; transition: 0.3s; }
        .respuestas-wrapper:hover .respuestas-line { background: rgba(0, 255, 247, 0.4); box-shadow: 0 0 8px rgba(0, 255, 247, 0.2); }
        
        /* Botones de ver respuestas */
        .toggle-respuestas-btn { background: transparent; border: none; color: var(--primary-color, #00fff7); cursor: pointer; font-family: 'Poppins', sans-serif; font-weight: 600; font-size: 0.9rem; margin-bottom: 12px; display: inline-flex; align-items: center; gap: 8px; transition: 0.2s; padding: 4px 10px; border-radius: 20px; opacity: 0.8; }
        .toggle-respuestas-btn:hover { background: rgba(0, 255, 247, 0.1); opacity: 1; }
        .show-more-replies-btn { background: transparent; border: 1px dashed rgba(188, 19, 254, 0.4); color: #bc13fe; border-radius: 8px; padding: 8px; cursor: pointer; font-weight: 600; margin-top: 5px; transition: 0.2s; width: 100%; text-align: center; font-size: 0.85rem; }
        .show-more-replies-btn:hover { background: rgba(188, 19, 254, 0.1); border-style: solid; color: #fff; }
        
        /* Animaciones base */
        .comentario-item { animation: fadeIn 0.4s ease-out forwards; }
        @keyframes fadeInReplyBox { from { opacity: 0; transform: translateY(-10px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
        
        /* Utilidades de texto */
        .char-counter { font-size: 0.75rem; color: #888; text-align: right; margin-top: 5px; font-weight: 600; transition: color 0.3s; }
        .char-counter.limit { color: #ff5555; }
        .btn-disabled { opacity: 0.5; cursor: not-allowed !important; filter: grayscale(1); }
        
        /* Responsivo - ALINEACIÓN MÓVIL CORREGIDA */
        @media (max-width: 768px) {
            .respuestas-wrapper { margin-left: 48px; }
            .respuestas-line { left: -22px; }
            .comentario-item { padding: 12px !important; flex-direction: row !important; align-items: flex-start !important; gap: 10px !important; }
            .comentario-item.is-reply { padding: 10px !important; }
            .comentario-avatar img { width: 38px !important; height: 38px !important; }
            .is-reply .comentario-avatar img { width: 30px !important; height: 30px !important; }
            .action-btn { padding: 6px 10px; font-size: 0.8rem; }
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

/**
 * Configura el listener en tiempo real de Firebase para los comentarios.
 */
function setupComentariosRealtimeListener() {
    if (comentariosUnsubscribe) comentariosUnsubscribe();
    
    const commentsRef = comentariosDb.collection('comments')
        .where('animeId', '==', window.comentariosAnimeId)
        .where('season', '==', parseInt(window.comentariosSeason))
        .where('episode', '==', parseInt(window.comentariosEpisode))
        .orderBy('timestamp', 'desc') 
        .limit(100);

    comentariosUnsubscribe = commentsRef.onSnapshot((snapshot) => {
        const container = document.getElementById('comentariosList');
        if (!container) return;
        
        if (snapshot.empty) {
            container.innerHTML = `<div class="empty-comments" style="color: var(--primary-color); text-shadow: 0 0 10px rgba(0, 255, 247, 0.3);"><i class="fas fa-comment-dots" style="font-size: 3rem; margin-bottom: 15px; display: block; opacity: 0.3;"></i><p style="font-weight: bold; font-size: 1.1rem; color: #aaa;">Sin comentarios aún. ¡Sé el primero en romper el hielo!</p></div>`;
            return;
        }
  
        const docsReversed = [...snapshot.docs].reverse();
        const allComments = docsReversed.map(doc => ({ id: doc.id, ...doc.data() }));
        
        const commentMap = new Map();
        allComments.forEach(c => commentMap.set(c.id, { ...c, replies: [] }));
      
        const roots = [];
     
        allComments.forEach(c => {
            if (c.replyToId && commentMap.has(c.replyToId)) {
                let rootId = c.replyToId;
                while (commentMap.has(rootId) && commentMap.get(rootId).replyToId) {
                  rootId = commentMap.get(rootId).replyToId;
                }
                if (commentMap.has(rootId)) {
                    commentMap.get(rootId).replies.push(c);
                } else {
                    roots.push(commentMap.get(c.id));
                }
            } else {
                roots.push(commentMap.get(c.id));
            }
        });

        let html = '';
        roots.forEach(root => {
            html += generarHtmlComentario(root, false);

            if (root.replies && root.replies.length > 0) {
                root.replies.sort((a, b) => (a.timestamp?.toMillis() || 0) - (b.timestamp?.toMillis() || 0));

                html += `<div class="respuestas-wrapper" id="respuestas-${root.id}">`;
                html += `<div class="respuestas-line"></div>`; 
                
                const textoBtn = root.replies.length === 1 ? 'Ver 1 respuesta' : `Ver ${root.replies.length} respuestas`;
                html += `<button class="toggle-respuestas-btn" onclick="toggleRespuestas('${root.id}')">
                            <i class="fas fa-level-down-alt" id="icon-${root.id}" style="transform: rotate(-90deg);"></i> 
                            <span id="text-${root.id}">${textoBtn}</span>
                         </button>`;

                html += `<div class="respuestas-container" id="container-${root.id}" style="display: none; flex-direction: column; gap: 8px;">`;
                root.replies.forEach((reply, index) => {
                    const isHidden = index >= 5 ? 'display: none;' : '';
                    const hiddenClass = index >= 5 ? `hidden-reply-${root.id}` : '';
                    html += `<div class="${hiddenClass}" style="${isHidden}">` + generarHtmlComentario(reply, true, root.id) + `</div>`;
                });
                
                if (root.replies.length > 5) {
                    const remaining = root.replies.length - 5;
                    html += `<button id="showMore-${root.id}" class="show-more-replies-btn" onclick="showMoreReplies('${root.id}')">
                                Cargar ${remaining} respuestas más...
                             </button>`;
                }

                html += `</div></div>`;
            }
        });
        
        container.innerHTML = html;
    }, (error) => console.error('Error en el onSnapshot de comentarios:', error));
}

function generarHtmlComentario(c, isReply) {
    let fecha = 'Justo ahora';
    if (c.timestamp?.toDate) fecha = obtenerTiempoRelativo(c.timestamp.toDate());
    
    const isOwner = comentariosCurrentUser?.uid === c.userId;
    const avatar = c.userAvatar || 'invitado.avif';
    const userName = c.userName || 'Usuario';
    const neonColor = getNeonColorByString(c.userId || userName);
    const rgbColor = hexToRgbStr(neonColor);
    let contenidoHtml = procesarTextoComentario(c.texto || '');
    
    if (c.replyToUser) {
        contenidoHtml = `<span style="color: ${neonColor}; font-weight: 700; margin-right: 5px; font-size: 0.95em;">@${escapeHtmlComent(c.replyToUser)}</span> ` + contenidoHtml;
    }

    if (c.esSticker && c.stickerUrl && !contenidoHtml.includes(c.stickerUrl)) {
        const isVideo = c.stickerUrl.match(/\.(mp4|webm)$/i);
        const tagMedia = isVideo ? 'video autoplay loop muted playsinline' : 'img loading="lazy"';
        contenidoHtml += `
            <div class="comentario-sticker-container" style="margin-top: 12px; display: inline-block;">
                <${tagMedia} src="${c.stickerUrl}" class="comentario-sticker" onclick="openStickerModal('${c.stickerUrl.replace(/'/g, "\\'")}')" style="max-width: 140px; max-height: 140px; border-radius: 8px; cursor: pointer; border: 1px solid rgba(${rgbColor}, 0.2); transition: transform 0.2s;"
                onmouseover="this.style.transform='scale(1.05)';" onmouseout="this.style.transform='scale(1)';" title="Clic para ver/robar"></${isVideo ? 'video' : 'img'}>
            </div>
        `;
    }
    
    const padding = isReply ? '10px 14px' : '16px';
    const avatarSize = isReply ? '30px' : '45px';
    const titleSize = isReply ? '0.9rem' : '1rem';
    
    // Fondos limpios y profesionales
    const bgStyle = isReply ? `background: transparent;` : `background: rgba(20, 20, 25, 0.4);`;
    const borderStyle = isReply ? `border: none;` : `border: 1px solid rgba(255,255,255,0.03);`;
    
    const replyBtn = comentariosCurrentUser ?
        `<button class="action-btn reply-btn" onclick="prepararRespuesta('${c.id}', '${escapeHtmlComent(userName)}', '${c.userId}')"><i class="fas fa-reply"></i> Responder</button>` : '';
    const deleteBtn = isOwner ?
        `<button class="action-btn delete-btn" onclick="deleteComentario('${c.id}')" title="Eliminar"><i class="fas fa-trash-alt"></i></button>` : '';
    
    return `
        <div class="comentario-item ${isReply ? 'is-reply' : ''}" id="comment-${c.id}" style="position: relative; overflow: visible; ${bgStyle} ${borderStyle} border-radius: 12px; padding: ${padding}; margin-bottom: ${isReply ? '0' : '12px'}; display: flex; flex-direction: row; gap: 12px; transition: background 0.3s;"
        onmouseover="if(!${isReply}) this.style.background='rgba(30, 30, 35, 0.6)';" onmouseout="if(!${isReply}) this.style.background='rgba(20, 20, 25, 0.4)';">
            
            <div class="comentario-avatar" style="flex-shrink: 0; padding-top: 2px;">
                <img src="${avatar}" onerror="this.src='invitado.avif'" style="width: ${avatarSize}; height: ${avatarSize}; border-radius: 50%; object-fit: cover; border: 2px solid rgba(${rgbColor}, 0.5);">
            </div>
            
            <div class="comentario-content" style="flex: 1; min-width: 0;">
                <div class="comentario-header" style="display: flex; align-items: baseline; justify-content: flex-start; margin-bottom: 4px; gap: 8px;">
                    <span class="comentario-user" style="color: #fff; font-weight: 700; font-family: 'Poppins', sans-serif; font-size: ${titleSize}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 70%;">${escapeHtmlComent(userName)}</span>
                    <span class="comentario-fecha" style="color: #666; font-size: 0.75rem; font-weight: 500;">${fecha}</span>
                </div>
                
                <div class="comentario-texto" style="color: #ccc; font-size: 0.95rem; line-height: 1.5; word-wrap: break-word;">${contenidoHtml}</div>
                
                <div style="display: flex; gap: 5px; margin-top: 8px;">
                    ${replyBtn}
                    ${deleteBtn}
                </div>
            </div>
        </div>
    `;
}

window.toggleRespuestas = function(rootId) {
    const container = document.getElementById(`container-${rootId}`);
    const icon = document.getElementById(`icon-${rootId}`);
    if(!container || !icon) return;
    
    if (container.style.display === 'none') {
        container.style.display = 'flex';
        icon.style.transform = 'rotate(0deg)';
    } else {
        container.style.display = 'none';
        icon.style.transform = 'rotate(-90deg)';
    }
};

window.showMoreReplies = function(rootId) {
    const hiddenReplies = document.querySelectorAll(`.hidden-reply-${rootId}`);
    hiddenReplies.forEach(el => {
        el.style.display = 'block';
        el.style.animation = 'fadeIn 0.4s ease-out forwards';
    });
    const btn = document.getElementById(`showMore-${rootId}`);
    if(btn) btn.style.display = 'none';
};

function obtenerTiempoRelativo(fecha) {
    const ahora = new Date();
    const diffSegundos = Math.floor((ahora - fecha) / 1000);
    if (diffSegundos < 60) return 'Hace un momento';
    if (diffSegundos < 3600) return `Hace ${Math.floor(diffSegundos / 60)} min`;
    if (diffSegundos < 86400) return `Hace ${Math.floor(diffSegundos / 3600)} h`;
    if (diffSegundos < 2592000) return `Hace ${Math.floor(diffSegundos / 86400)} d`;
    return fecha.toLocaleDateString();
}

function procesarTextoComentario(texto) {
    if (!texto) return '';
    let html = escapeHtmlComent(texto.trim());
    const emojisMap = { ':D': '😃', ':)': '😊', ':(': '😢', ':P': '😛', ';)': '😉', '<3': '❤️' };
    for (const [code, emoji] of Object.entries(emojisMap)) {
        html = html.split(code).join(emoji);
    }
    
    html = html.replace(/\n{2,}/g, '\n').replace(/\n/g, '<br>');
    
    const stickerRegex = /\[Sticker\]\(([^)]+)\)/g;
    html = html.replace(stickerRegex, (match, url) => {
        const isVideo = url.match(/\.(mp4|webm)$/i);
        const tag = isVideo ? 'video autoplay loop muted playsinline' : 'img loading="lazy"';
        return `
        <div class="comentario-sticker-container" style="margin-top: 8px; display: inline-block;">
            <${tag} src="${url}" class="comentario-sticker" onclick="openStickerModal('${url.replace(/'/g, "\\'")}')" style="max-width: 140px; max-height: 140px; border-radius: 8px; cursor: pointer; border: 1px solid rgba(0, 255, 247, 0.2); transition: transform 0.2s;" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'" title="Ver/Robar Sticker"></${isVideo ? 'video' : 'img'}>
        </div>`;
    });

    const palabras = html.split(/(\s+)/);
    for (let i = 0; i < palabras.length; i++) {
        let palabra = palabras[i];
        if (palabra.startsWith('http://') || palabra.startsWith('https://')) {
            if (palabra.match(/\.(jpg|jpeg|png|gif|webp|avif)(\?.*)?$/i) && !palabra.includes('class="comentario-sticker"')) {
                palabras[i] = `<img src="${palabra}" class="comentario-imagen" loading="lazy" style="max-width: 200px; border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.1); margin-top: 8px;">`;
            } else if (palabra.match(/\.(mp4|webm)(\?.*)?$/i) && !palabra.includes('class="comentario-sticker"')) {
                palabras[i] = `<video src="${palabra}" autoplay loop muted playsinline class="comentario-imagen" style="max-width: 200px; border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.1); margin-top: 8px;"></video>`;
            } else if (!palabra.includes('class="comentario-sticker"')) {
                palabras[i] = `<a href="${palabra}" target="_blank" rel="noopener noreferrer" class="comentario-link" style="color: var(--primary-color); text-decoration: none; transition: opacity 0.2s;">${palabra}</a>`;
            }
        }
    }
    return palabras.join('').replace(/^(<br>)+/, '').trim();
}

/**
 * SISTEMA PREMIUM PARA RESPONDER (YouTube Style Mejorado)
 */
window.prepararRespuesta = function(commentId, userName, userId) {
    cancelarRespuesta();
    window.respondiendoA = { id: commentId, userName, userId };

    const commentEl = document.getElementById(`comment-${commentId}`);
    if (!commentEl) return;

    // Crear la caja de respuesta dinámica con UI Premium
    const replyBox = document.createElement('div');
    replyBox.id = 'dynamicReplyBox';
    replyBox.style.cssText = "margin-top: 8px; margin-bottom: 20px; padding: 12px; background: rgba(20, 20, 25, 0.8); border-radius: 12px; display: flex; flex-direction: column; gap: 8px; animation: fadeInReplyBox 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275); margin-left: 55px; border: 1px solid rgba(0, 255, 247, 0.2);";
    
    replyBox.innerHTML = `
        <div style="color:#888; font-size:0.8rem; display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
            <span>Respondiendo a <b style="color:var(--primary-color)">@${escapeHtmlComent(userName)}</b></span>
            <button onclick="cancelarRespuesta()" style="background:none; border:none; color:#666; cursor:pointer; font-size: 1rem; transition: 0.2s;" onmouseover="this.style.color='#ff5555'" onmouseout="this.style.color='#666'" title="Cancelar"><i class="fas fa-times"></i></button>
        </div>
        <div style="display: flex; gap: 10px; align-items: flex-start;">
            <img src="${comentariosCurrentUser?.photoURL || 'invitado.avif'}" style="width:30px; height:30px; border-radius:50%; object-fit:cover;">
            <div style="flex: 1; display: flex; flex-direction: column;">
                <textarea id="dynamicReplyText" placeholder="Añade una respuesta pública..." maxlength="500" style="width: 100%; background: transparent; border: none; border-bottom: 1px solid rgba(255,255,255,0.1); padding: 4px 0; color: white; font-family: 'Poppins', sans-serif; font-size: 0.9rem; resize: none; min-height: 25px; outline: none; transition: border-color 0.3s; overflow:hidden;" onfocus="this.style.borderBottomColor='var(--primary-color)';" onblur="this.style.borderBottomColor='rgba(255,255,255,0.1)';"></textarea>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px;">
                    <span id="dynamicCharCount" class="char-counter">0/500</span>
                    <button id="btnEnviarRespuesta" onclick="enviarRespuestaDinamica()" class="btn-disabled" style="background: var(--primary-color); border: none; color: #000; font-weight: 700; padding: 6px 16px; border-radius: 20px; font-size: 0.85rem; cursor: pointer; transition: 0.2s;"><i class="fas fa-paper-plane" style="margin-right: 4px;"></i> Responder</button>
                </div>
            </div>
        </div>
    `;
    commentEl.parentNode.insertBefore(replyBox, commentEl.nextSibling);

    const textArea = document.getElementById('dynamicReplyText');
    const btnEnviar = document.getElementById('btnEnviarRespuesta');
    const charCount = document.getElementById('dynamicCharCount');

    if(textArea) {
        textArea.focus();
        textArea.addEventListener('input', function() {
            autoResizeTextarea(this);
            const len = this.value.length;
            charCount.innerText = len + '/500';
            if(len >= 500) charCount.classList.add('limit');
            else charCount.classList.remove('limit');
            
            if(this.value.trim().length > 0) {
                btnEnviar.classList.remove('btn-disabled');
            } else {
                btnEnviar.classList.add('btn-disabled');
            }
        });
        textArea.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if(!btnEnviar.classList.contains('btn-disabled')) {
                    enviarRespuestaDinamica();
                }
            }
        });
    }
};

window.cancelarRespuesta = function() {
    window.respondiendoA = null;
    const box = document.getElementById('dynamicReplyBox');
    if (box) {
        box.style.opacity = '0';
        box.style.transform = 'translateY(-10px)';
        setTimeout(() => box.remove(), 200);
    }
};

window.openStickerModal = function(url) {
    let modal = document.getElementById('stickerViewModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'stickerViewModal';
        modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(5,5,5,0.95);z-index:100000;display:flex;flex-direction:column;align-items:center;justify-content:center;opacity:0;transition:opacity 0.2s; padding: 20px;';
        modal.innerHTML = `
            <div style="position:relative; text-align:center; max-width: 90vw;">
                <button onclick="closeStickerModal()" style="position:absolute;top:-40px;right:-10px;background:none;border:none;color:#fff;font-size:2rem;cursor:pointer; transition: 0.2s;" onmouseover="this.style.color='#ff0055'; transform='scale(1.1)';" onmouseout="this.style.color='#fff'; transform='scale(1)';">&times;</button>
                <img id="stickerModalImg" src="" style="display:none; max-width:100%;max-height:65vh;border-radius:12px; object-fit:contain; border: 1px solid rgba(0,255,247,0.3);">
                <video id="stickerModalVid" src="" autoplay loop muted playsinline style="display:none; max-width:100%;max-height:65vh;border-radius:12px; object-fit:contain; border: 1px solid rgba(0,255,247,0.3);"></video>
                <br>
                <button id="stickerModalStealBtn" style="margin-top:20px;background:rgba(0, 255, 247, 0.1);border:1px solid #00fff7;color:#fff;padding:10px 25px;border-radius:30px;font-size:1rem;cursor:pointer;font-weight:700;font-family:'Poppins',sans-serif;transition:all 0.2s;">
                    <i class="fas fa-mask" style="color: #00fff7; margin-right:5px;"></i> Robar Sticker
                </button>
            </div>
        `;
        document.body.appendChild(modal);
    }
    
    const isVideo = url.match(/\.(mp4|webm)$/i);
    const imgEl = document.getElementById('stickerModalImg');
    const vidEl = document.getElementById('stickerModalVid');
    
    if (isVideo) {
        imgEl.style.display = 'none'; 
        vidEl.src = url;
        vidEl.style.display = 'inline-block';
    } else {
        vidEl.style.display = 'none'; 
        imgEl.src = url;
        imgEl.style.display = 'inline-block';
    }
    
    document.getElementById('stickerModalStealBtn').onclick = function() {
        if(typeof window.robarStickerSistema === 'function') {
            window.robarStickerSistema(url);
            closeStickerModal();
        } else {
            alert("El sistema no ha cargado. Inicia sesión primero.");
        }
    };
    
    modal.style.display = 'flex';
    setTimeout(() => modal.style.opacity = '1', 10);
};

window.closeStickerModal = function() {
    let modal = document.getElementById('stickerViewModal');
    if (modal) {
        modal.style.opacity = '0';
        setTimeout(() => { 
            modal.style.display = 'none'; 
            const vid = document.getElementById('stickerModalVid');
            if(vid) vid.src = ''; 
        }, 200);
    }
};

/**
 * Función auxiliar para validar si el botón de la caja principal debe activarse
 */
window.validarBotonPrincipal = function(textarea) {
    const btn = document.getElementById('enviarComentarioBtn');
    if(!btn) return;
    
    const tieneTexto = textarea.value.trim().length > 0;
    const tieneSticker = window.stickerSeleccionadoParaEnviar != null;
    if(tieneTexto || tieneSticker) {
        btn.classList.remove('btn-disabled');
        btn.style.opacity = '1';
        btn.style.cursor = 'pointer';
    } else {
        btn.classList.add('btn-disabled');
        btn.style.opacity = '0.5';
        btn.style.cursor = 'not-allowed';
    }
};

/**
 * Envío del comentario Principal
 */
async function enviarComentarioTexto() {
    if (!comentariosCurrentUser) return openLoginModalFromComent();
    const textoInput = document.getElementById('comentarioTexto');
    if (!textoInput) return;

    const texto = textoInput.value.trim();
    const stickerUrl = window.stickerSeleccionadoParaEnviar;
    
    const btn = document.getElementById('enviarComentarioBtn');
    if (btn && btn.classList.contains('btn-disabled')) return; // Bloqueo de seguridad

    if (btn) {
        btn.disabled = true;
        btn.dataset.original = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';
    }
    
    let textoFinal = texto + (stickerUrl ? ((texto ? '\n' : '') + `[Sticker](${stickerUrl})`) : '');
    textoInput.value = '';
    textoInput.style.height = 'auto'; // Reset height
    quitarStickerPreview();
    validarBotonPrincipal(textoInput); // Deshabilitar botón de nuevo

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
            replyToId: null,
            replyToUser: null,
            replyToUserId: null,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });

        showToastComent('✅ Comentario publicado');
    } catch (error) {
        console.error('Error enviando comentario:', error);
        alert('Error: ' + error.message);
        if (textoInput) textoInput.value = texto;
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = btn.dataset.original;
        }
    }
}

/**
 * Función para enviar las respuestas desde la caja secundaria
 */
window.enviarRespuestaDinamica = async function() {
    if (!comentariosCurrentUser) return openLoginModalFromComent();
    const textoInput = document.getElementById('dynamicReplyText');
    if (!textoInput) return;

    const texto = textoInput.value.trim();
    if (!texto) return; // Bloqueo si está vacío

    const replyContext = window.respondiendoA ? { ...window.respondiendoA } : null;
    if (!replyContext) return;

    const btn = document.getElementById('btnEnviarRespuesta');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    }
    textoInput.disabled = true;
    try {
        await comentariosDb.collection('comments').add({
            animeId: window.comentariosAnimeId,
            season: parseInt(window.comentariosSeason),
            episode: parseInt(window.comentariosEpisode),
            userId: comentariosCurrentUser.uid,
            userName: comentariosCurrentUser.displayName || comentariosCurrentUser.email.split('@')[0],
            userAvatar: comentariosCurrentUser.photoURL || 'invitado.avif',
            texto: texto,
            esSticker: false,
            stickerUrl: null,
            replyToId: replyContext.id,
            replyToUser: replyContext.userName,
            replyToUserId: replyContext.userId,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Notificación
        if (replyContext.userId !== comentariosCurrentUser.uid) {
            await comentariosDb.collection('user_notifications').add({
                targetUserId: replyContext.userId,
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

        showToastComent('✅ Respuesta publicada');
        cancelarRespuesta();
    } catch (error) {
        console.error('Error enviando respuesta:', error);
        alert('Error: ' + error.message);
        textoInput.disabled = false;
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-paper-plane"></i> Responder';
        }
    }
}

window.seleccionarStickerParaEnviar = function(url) {
    window.stickerSeleccionadoParaEnviar = url;
    const previewContainer = document.getElementById('comentarioStickerPreview');
    const previewImg = document.getElementById('previewStickerImgObj');
    const previewVid = document.getElementById('previewStickerVidObj');
    
    if (!previewContainer || !previewImg || !previewVid) return;
    if (url.match(/\.(mp4|webm)$/i)) {
        previewImg.style.display = 'none'; 
        previewVid.src = url;
        previewVid.style.display = 'inline-block';
    } else {
        previewVid.style.display = 'none'; 
        previewImg.src = url;
        previewImg.style.display = 'inline-block';
    }
    
    previewContainer.style.display = 'inline-block';
    const panel = document.getElementById('stickerPanelFull');
    if (panel) panel.classList.remove('active');
    // Validar el botón al elegir sticker
    validarBotonPrincipal(document.getElementById('comentarioTexto'));
};

window.quitarStickerPreview = function() {
    window.stickerSeleccionadoParaEnviar = null;
    const previewContainer = document.getElementById('comentarioStickerPreview');
    const previewImg = document.getElementById('previewStickerImgObj');
    const previewVid = document.getElementById('previewStickerVidObj');
    
    if(previewContainer) previewContainer.style.display = 'none';
    if(previewImg) previewImg.src = '';
    if(previewVid) previewVid.src = '';
    // Validar el botón al quitar sticker
    validarBotonPrincipal(document.getElementById('comentarioTexto'));
};

async function deleteComentario(commentId) {
    if (!confirm('¿Seguro que deseas eliminar este comentario? También se eliminarán las respuestas directas si las tuviera.')) return;
    try {
        await comentariosDb.collection('comments').doc(commentId).delete();
        showToastComent('🗑️ Comentario eliminado');
    } catch (error) { 
        alert('Error al eliminar: ' + error.message);
    }
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
        
        // Arrancar con el botón validado (generalmente deshabilitado si está vacío)
        validarBotonPrincipal(document.getElementById('comentarioTexto'));
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
        const start = textarea.selectionStart; 
        const text = textarea.value;
        textarea.value = text.substring(0, start) + emoji + text.substring(start);
        textarea.focus();
        
        // Simular evento input para el auto-resize y validación
        textarea.dispatchEvent(new Event('input'));
    }
}

function showToastComent(msg) {
    let toast = document.getElementById('toastComent');
    if (!toast) {
        toast = document.createElement('div'); 
        toast.id = 'toastComent';
        toast.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#0f0f13;color:#00fff7;padding:12px 25px;border-radius:30px;z-index:1000;font-weight:bold; border: 1px solid #00fff7; transition: all 0.3s;';
        document.body.appendChild(toast);
    }
    toast.innerHTML = msg; 
    toast.style.display = 'block';
    setTimeout(() => toast.style.display = 'none', 2500);
}

function openLoginModalFromComent() { 
    const modal = document.getElementById('authModal'); 
    if (modal) modal.classList.add('show');
}

function escapeHtmlComent(text) { 
    const div = document.createElement('div'); 
    div.textContent = text;
    return div.innerHTML; 
}