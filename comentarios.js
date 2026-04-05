// ============================================
// SISTEMA DE COMENTARIOS "PREMIUM" CYBERPUNK v5.0
// (Incluye Hilos Visuales, Edición, Anti-Saltos, Emojis y Stickers)
// ============================================

let comentariosDb = null;
let comentariosAuth = null;
let comentariosCurrentUser = null;
let comentariosUnsubscribe = null;

window.stickerSeleccionadoParaEnviar = null;
window.respondiendoA = null;
window.lastPostedCommentId = null;

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

    setTimeout(() => {
        const textarea = document.getElementById('comentarioTexto');
        if (textarea) {
            textarea.addEventListener('keydown', function(e) {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault(); 
                    if(this.value.trim().length > 0 || window.stickerSeleccionadoParaEnviar) {
                        enviarComentarioTexto();
                    }
                }
            });
            
            textarea.addEventListener('input', function() {
                autoResizeTextarea(this);
                validarBotonPrincipal(this);
            });
        }

        const stickerBtn = document.querySelector('.sticker-btn');
        if (stickerBtn) {
            stickerBtn.innerHTML = '🖼️';
            stickerBtn.style.fontSize = '1.4rem';
        }
    }, 1000);

    // Cierra todos los menús de comentarios si se hace clic fuera
    document.addEventListener('click', () => closeAllCommentMenus());
}

function autoResizeTextarea(el) {
    el.style.height = 'auto';
    el.style.height = (el.scrollHeight) + 'px';
}

function injectCommentsCSS() {
    if (document.getElementById('archinime-comments-css')) return;
    const style = document.createElement('style');
    style.id = 'archinime-comments-css';
    style.innerHTML = `
        :root {
            --neon-primary: #00fff7;
            --neon-secondary: #bc13fe;
            --neon-alert: #ff0055;
            --neon-warn: #ffaa00;
        }
    
        /* --- ESTILOS DE COMENTARIOS PADRES --- */
        .comentario-item { 
            position: relative;
            z-index: 1;
            animation: fadeIn 0.4s ease-out forwards;
            background: rgba(10, 12, 16, 0.7) !important;
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255,255,255,0.05);
            box-shadow: 0 4px 15px rgba(0,0,0,0.5);
            transition: all 0.3s ease;
            border-radius: 12px;
        }
        .comentario-item:hover {
            background: rgba(15, 18, 25, 0.9) !important;
            border-color: rgba(0, 243, 255, 0.2);
            box-shadow: 0 4px 20px rgba(0, 243, 255, 0.05);
        }

        /* --- NUEVO SISTEMA DE HILOS VISUALES (JERARQUÍA) --- */
        .comentario-item.is-reply {
            background: rgba(5, 5, 8, 0.4) !important;
            box-shadow: none;
            border: none;
            border-radius: 8px;
            /* La variable --branch-top se inyecta en el HTML según el nivel */
        }
        .comentario-item.is-reply:hover {
            background: rgba(15, 18, 25, 0.7) !important;
        }

        /* La rama horizontal "L" que apunta a la respuesta */
        .comentario-item.is-reply::before {
            content: '';
            position: absolute;
            left: -22px; /* Debe coincidir con el padding-left del replies-thread */
            top: var(--branch-top, 25px); 
            width: 22px;
            height: 2px;
            background: rgba(255, 255, 255, 0.1);
            transition: background 0.3s ease;
            border-radius: 2px 0 0 2px;
        }
        .comentario-item.is-reply:hover::before {
            background: var(--neon-primary);
            box-shadow: 0 0 8px rgba(0, 255, 247, 0.4);
        }

        /* Contenedor de la línea vertical que agrupa las respuestas */
        .replies-thread {
            position: relative;
            margin-left: 22px; /* Centrado con el avatar padre de 45px */
            padding-left: 22px;
            border-left: 2px solid rgba(255, 255, 255, 0.08);
            margin-top: 5px;
            margin-bottom: 5px;
            transition: border-color 0.3s ease;
        }
        /* Iluminar toda la ruta vertical al pasar el cursor por el hilo */
        .replies-thread:hover {
            border-left-color: rgba(0, 255, 247, 0.3);
        }

        /* Ajustes para sub-niveles (Nivel 2 en adelante) */
        .nested-reply .replies-thread {
            margin-left: 15px; /* Centrado con el avatar de 30px */
            padding-left: 15px;
        }
        .nested-reply .comentario-item.is-reply::before {
            left: -15px;
            width: 15px;
        }

        /* Iluminación de foco al responder */
        @keyframes replyPulse {
            0% { box-shadow: 0 0 0 rgba(0, 255, 247, 0); }
            50% { box-shadow: 0 0 20px rgba(0, 255, 247, 0.5); border: 1px solid var(--neon-primary) !important; }
            100% { box-shadow: 0 0 0 rgba(0, 255, 247, 0); }
        }
        .replying-active {
            animation: replyPulse 1.5s infinite;
            background: rgba(0, 255, 247, 0.05) !important;
            border-radius: 12px;
        }

        /* --- KEBAB MENU --- */
        .comment-options-container {
            position: absolute;
            top: 8px;
            right: 12px;
            z-index: 10;
        }
        .kebab-btn {
            background: transparent;
            border: none;
            color: #666;
            font-size: 1.1rem;
            cursor: pointer;
            width: 30px;
            height: 30px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: 0.2s;
        }
        .kebab-btn:hover {
            color: var(--neon-primary);
            background: rgba(0, 255, 247, 0.1);
            transform: scale(1.1);
        }
        
        .comment-dropdown {
            position: absolute;
            top: 100%;
            right: 0;
            margin-top: 5px;
            background: rgba(15, 15, 20, 0.98);
            backdrop-filter: blur(20px);
            border: 1px solid var(--neon-secondary);
            border-radius: 12px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.95), 0 0 20px rgba(188, 19, 254, 0.3);
            min-width: 150px;
            display: flex;
            flex-direction: column;
            opacity: 0;
            pointer-events: none;
            transform: translateY(-10px);
            transition: all 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            overflow: hidden;
            z-index: 100;
        }
        .comment-dropdown.show {
            opacity: 1;
            pointer-events: auto;
            transform: translateY(0);
        }
        
        .comment-dropdown-btn {
            background: transparent;
            border: none;
            color: #ddd;
            padding: 12px 15px;
            text-align: left;
            font-family: 'Poppins', sans-serif;
            font-size: 0.85rem;
            font-weight: 600;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 12px;
            transition: 0.2s;
            border-bottom: 1px solid rgba(255,255,255,0.05);
        }
        .comment-dropdown-btn:last-child { border-bottom: none; }
        .comment-dropdown-btn:hover { background: rgba(188, 19, 254, 0.15); color: #fff; padding-left: 20px; }
        .comment-dropdown-btn i { width: 16px; text-align: center; color: var(--neon-primary); }
        .comment-dropdown-btn.report-btn i { color: var(--neon-warn); }
        .comment-dropdown-btn.report-btn:hover { background: rgba(255, 170, 0, 0.15); color: #fff; }
        .comment-dropdown-btn.edit-btn i { color: var(--neon-primary); }
        .comment-dropdown-btn.edit-btn:hover { background: rgba(0, 255, 247, 0.15); color: #fff; }
        
        /* Botones de Control de Hilos */
        .toggle-respuestas-btn { background: transparent; border: none; color: var(--neon-primary); cursor: pointer; font-family: 'Poppins', sans-serif; font-weight: 600; font-size: 0.85rem; margin-bottom: 8px; margin-top: 4px; display: inline-flex; align-items: center; gap: 8px; transition: 0.2s; padding: 4px 10px; border-radius: 20px; opacity: 0.8; }
        .toggle-respuestas-btn:hover { background: rgba(0, 255, 247, 0.1); opacity: 1; }
        
        .show-more-replies-btn { background: transparent; border: 1px dashed rgba(188, 19, 254, 0.4); color: var(--neon-secondary); border-radius: 8px; padding: 8px; cursor: pointer; font-weight: 600; margin-top: 5px; transition: 0.2s; width: 100%; text-align: center; font-size: 0.85rem; }
        .show-more-replies-btn:hover { background: rgba(188, 19, 254, 0.1); border-style: solid; color: #fff; }
        
        /* Animaciones */
        @keyframes fadeInReplyBox { from { opacity: 0; transform: translateY(-10px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
        
        @keyframes slideInGlow {
            0% { opacity: 0; transform: translateY(-20px) scale(0.95); box-shadow: 0 0 0 transparent; }
            50% { box-shadow: 0 0 30px var(--neon-primary); transform: translateY(0) scale(1.02); }
            100% { opacity: 1; transform: translateY(0) scale(1); box-shadow: 0 0 0 transparent; }
        }
        .new-comment-fx { animation: slideInGlow 0.8s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards !important; z-index: 10; }
        
        .char-counter { font-size: 0.75rem; color: #888; text-align: right; margin-top: 5px; font-weight: 600; transition: color 0.3s; }
        .char-counter.limit { color: var(--neon-alert); }
        .btn-disabled { opacity: 0.5; cursor: not-allowed !important; filter: grayscale(1); }
        
        @media (max-width: 768px) {
            .replies-thread { margin-left: 19px; padding-left: 18px; }
            .nested-reply .replies-thread { margin-left: 14px; padding-left: 14px; }
            .comentario-item.is-reply::before { left: -18px; width: 18px; }
            .nested-reply .comentario-item.is-reply::before { left: -14px; width: 14px; }

            .comentario-item { padding: 12px !important; flex-direction: row !important; align-items: flex-start !important; gap: 10px !important; }
            .comentario-item.is-reply { padding: 8px 10px !important; }
            .comentario-avatar img { width: 38px !important; height: 38px !important; }
            .is-reply .comentario-avatar img { width: 28px !important; height: 28px !important; }
            .comment-options-container { right: 5px; top: 5px; }
        }
    `;
    document.head.appendChild(style);
}

// CONTROL GLOBAL PARA MENÚ DE 3 PUNTOS Y CORRECCIÓN DE Z-INDEX
window.toggleCommentMenu = function(id, event) {
    event.stopPropagation();
    const currentMenu = document.getElementById(`dropdown-${id}`);
    const parentItem = document.getElementById(`comment-${id}`);
    const isShowing = currentMenu.classList.contains('show');
    
    closeAllCommentMenus();
    if (!isShowing) {
        currentMenu.classList.add('show');
        if (parentItem) parentItem.style.zIndex = '50';
    }
};

window.closeAllCommentMenus = function() {
    document.querySelectorAll('.comment-dropdown').forEach(m => m.classList.remove('show'));
    document.querySelectorAll('.comentario-item').forEach(item => item.style.zIndex = '1');
};

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
            container.innerHTML = `<div class="empty-comments" style="color: var(--neon-primary); text-shadow: 0 0 10px rgba(0, 255, 247, 0.3);"><i class="fas fa-comment-dots" style="font-size: 3rem; margin-bottom: 15px; display: block; opacity: 0.3;"></i><p style="font-weight: bold; font-size: 1.1rem; color: #aaa;">Sin comentarios aún. ¡Sé el primero en romper el hielo!</p></div>`;
            return;
        }

        // GUARDAR ESTADO DE MENÚS ABIERTOS PARA EVITAR SALTOS DE PANTALLA
        const openContainers = new Set();
        document.querySelectorAll('.replies-thread').forEach(el => {
            if (el.style.display !== 'none') openContainers.add(el.id);
        });
        const openMoreReplies = new Set();
        document.querySelectorAll('[class^="hidden-reply-"]').forEach(el => {
            if (el.style.display === 'block') openMoreReplies.add(el.className.split(' ')[0]);
        });
  
        const docsReversed = [...snapshot.docs].reverse();
        const allComments = docsReversed.map(doc => ({ id: doc.id, ...doc.data() }));
        
        const commentMap = new Map();
        allComments.forEach(c => commentMap.set(c.id, { ...c, replies: [] }));
      
        const roots = [];
        allComments.forEach(c => {
            if (c.replyToId) {
                if (commentMap.has(c.replyToId)) {
                    commentMap.get(c.replyToId).replies.push(commentMap.get(c.id));
                }
            } else {
                roots.push(commentMap.get(c.id));
            }
        });

        function countAllReplies(node) {
            let count = node.replies.length;
            node.replies.forEach(r => count += countAllReplies(r));
            return count;
        }

        function renderNode(node, level = 0, isHiddenRoot = false, rootId = null) {
            let nodeHtml = '';
            const isNew = window.lastPostedCommentId === node.id;
            
            const hiddenStyle = isHiddenRoot ? 'display: none;' : '';
            const hiddenClass = isHiddenRoot ? `hidden-reply-${rootId}` : '';
            
            nodeHtml += `<div class="${hiddenClass}" style="${hiddenStyle}">`;
            nodeHtml += generarHtmlComentario(node, level > 0, isNew, level);

            if (node.replies && node.replies.length > 0) {
                node.replies.sort((a, b) => (a.timestamp?.toMillis() || 0) - (b.timestamp?.toMillis() || 0));
                
                // Botón y contenedor base de la ruta
                if (level === 0) {
                    const totalCount = countAllReplies(node);
                    const textoBtn = totalCount === 1 ? 'Ver 1 respuesta' : `Ver ${totalCount} respuestas`;
                    
                    nodeHtml += `<div style="margin-left: 22px;">
                                    <button class="toggle-respuestas-btn" onclick="toggleRespuestas('${node.id}')">
                                        <i class="fas fa-level-down-alt" id="icon-${node.id}" style="transform: rotate(-90deg);"></i> 
                                        <span id="text-${node.id}">${textoBtn}</span>
                                    </button>
                                 </div>`;
                    
                    nodeHtml += `<div class="replies-thread" id="container-${node.id}" style="display: none; flex-direction: column; gap: 6px;">`;
                    
                    node.replies.forEach((reply, index) => {
                        const isHidden = index >= 5;
                        nodeHtml += renderNode(reply, level + 1, isHidden, node.id);
                    });

                    if (node.replies.length > 5) {
                        const remaining = node.replies.length - 5;
                        nodeHtml += `<button id="showMore-${node.id}" class="show-more-replies-btn" onclick="showMoreReplies('${node.id}')">
                                    Cargar ${remaining} respuestas más...
                                 </button>`;
                    }

                    nodeHtml += `</div>`;
                } else {
                    // Si ya es Nivel 1 o superior, anidamos y marcamos para CSS .nested-reply
                    nodeHtml += `<div class="replies-thread nested-reply" style="display: flex; flex-direction: column; gap: 6px;">`;
                    node.replies.forEach((reply) => {
                        nodeHtml += renderNode(reply, level + 1, false, null);
                    });
                    nodeHtml += `</div>`;
                }
            }
            nodeHtml += `</div>`;
            return nodeHtml;
        }

        let html = '';
        roots.forEach(root => {
            html += renderNode(root, 0, false, null);
            html += `<div style="height: 12px;"></div>`; // Espacio entre hilos principales
        });
        
        container.innerHTML = html;

        // RESTAURAR ESTADO DE MENÚS ABIERTOS (Anti-Jump)
        openContainers.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.style.display = 'flex';
                const rootId = id.replace('container-', '');
                const icon = document.getElementById(`icon-${rootId}`);
                if (icon) icon.style.transform = 'rotate(0deg)';
            }
        });
        openMoreReplies.forEach(className => {
            document.querySelectorAll(`.${className}`).forEach(el => {
                el.style.display = 'block';
                el.style.animation = 'none'; 
            });
            const rootId = className.replace('hidden-reply-', '');
            const btn = document.getElementById(`showMore-${rootId}`);
            if (btn) btn.style.display = 'none';
        });

        window.lastPostedCommentId = null;
    }, (error) => console.error('Error en el onSnapshot de comentarios:', error));
}

function generarHtmlComentario(c, isReply, isNew = false, level = 0) {
    let fecha = 'Justo ahora';
    if (c.timestamp?.toDate) fecha = obtenerTiempoRelativo(c.timestamp.toDate());
    
    const isOwner = comentariosCurrentUser?.uid === c.userId;
    const avatar = c.userAvatar || 'invitado.avif';
    const userName = c.userName || 'Usuario';
    const neonColor = getNeonColorByString(c.userId || userName);
    const rgbColor = hexToRgbStr(neonColor);
    
    let contenidoHtml = procesarTextoComentario(c.texto || '');
    let badgeEditado = c.editado ? '<span style="font-size:0.7rem; color:#888; font-style:italic; margin-left:6px;">(Editado)</span>' : '';

    if (c.replyToUser) {
        contenidoHtml = `<span style="color: #aaa; font-weight: 600; font-size: 0.85em; background: rgba(255,255,255,0.05); padding: 2px 8px; border-radius: 12px; margin-right: 6px; display: inline-flex; align-items: center; gap: 4px; border: 1px solid rgba(255,255,255,0.1); font-family: 'Poppins', sans-serif;"><i class="fas fa-reply" style="font-size:0.75em; color: var(--neon-primary);"></i> @${escapeHtmlComent(c.replyToUser)}</span> ` + contenidoHtml;
    }

    if (c.esSticker && c.stickerUrl && !contenidoHtml.includes(c.stickerUrl)) {
        const isVideo = c.stickerUrl.match(/\.(mp4|webm)$/i);
        const tagMedia = isVideo ? 'video autoplay loop muted playsinline' : 'img loading="lazy"';
        contenidoHtml += `
            <div class="comentario-sticker-container" style="margin-top: 12px; display: block; width: fit-content;">
                <${tagMedia} src="${c.stickerUrl}" class="comentario-sticker" onclick="openStickerModal('${c.stickerUrl.replace(/'/g, "\\'")}')" style="max-width: 140px; max-height: 140px; border-radius: 8px; cursor: pointer; border: 1px solid rgba(${rgbColor}, 0.2); transition: transform 0.2s;"
                onmouseover="this.style.transform='scale(1.05)';" onmouseout="this.style.transform='scale(1)';" title="Clic para ver/robar"></${isVideo ? 'video' : 'img'}>
            </div>
        `;
    }
    
    // Ajuste dinámico de UI según el nivel en el árbol
    const padding = level === 0 ? '16px' : (level === 1 ? '10px 14px' : '8px 12px');
    const avatarSize = level === 0 ? '45px' : (level === 1 ? '30px' : '24px');
    const titleSize = level === 0 ? '1rem' : (level === 1 ? '0.9rem' : '0.85rem');
    
    // Calcula dónde debe caer la rama horizontal (mitad exacta del padding + radio del avatar)
    const branchTop = level === 1 ? '25px' : '20px'; 
    
    const newFxClass = isNew ? 'new-comment-fx' : '';
    const borderTopColor = level === 0 ? `border-top: 2px solid ${neonColor};` : '';

    const replyMenuBtn = comentariosCurrentUser ?
        `<button class="comment-dropdown-btn" onclick="prepararRespuesta('${c.id}', '${escapeHtmlComent(userName)}', '${c.userId}'); closeAllCommentMenus();"><i class="fas fa-reply"></i> Responder</button>` : '';
    
    const editMenuBtn = isOwner ?
        `<button class="comment-dropdown-btn edit-btn" onclick="iniciarEdicion('${c.id}'); closeAllCommentMenus();"><i class="fas fa-edit"></i> Editar</button>` : '';
        
    const reportMenuBtn = `<button class="comment-dropdown-btn report-btn" onclick="reportarComentario('${c.id}'); closeAllCommentMenus();"><i class="fas fa-flag"></i> Reportar</button>`;
    
    const optionsMenu = `
        <div class="comment-options-container">
            <button class="kebab-btn" onclick="toggleCommentMenu('${c.id}', event)">
                <i class="fas fa-ellipsis-v"></i>
            </button>
            <div class="comment-dropdown" id="dropdown-${c.id}">
                ${replyMenuBtn}
                ${reportMenuBtn}
                ${editMenuBtn}
            </div>
        </div>
    `;

    return `
        <div class="comentario-item ${isReply ? 'is-reply' : ''} ${newFxClass}" id="comment-${c.id}" 
            ondblclick="prepararRespuesta('${c.id}', '${escapeHtmlComent(userName)}', '${c.userId}'); closeAllCommentMenus();"
            title="Doble clic para responder"
            style="--branch-top: ${branchTop}; border-radius: 12px; padding: ${padding}; display: flex; flex-direction: row; gap: 12px; ${borderTopColor}">
            
            ${optionsMenu}

            <div class="comentario-avatar" style="flex-shrink: 0; padding-top: 2px;">
                <img src="${avatar}" onerror="this.src='invitado.avif'" style="width: ${avatarSize}; height: ${avatarSize}; border-radius: 50%; object-fit: cover; border: 2px solid rgba(${rgbColor}, 0.5); box-shadow: 0 0 10px rgba(${rgbColor}, 0.2);">
            </div>
            
            <div class="comentario-content" style="flex: 1; min-width: 0; padding-right: 25px;">
                <div class="comentario-header" style="display: flex; align-items: baseline; justify-content: flex-start; margin-bottom: 4px; gap: 8px;">
                    <span class="comentario-user" style="color: #fff; text-shadow: 0 0 8px ${neonColor}; font-weight: 800; font-family: 'Orbitron', sans-serif; font-size: ${titleSize}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 80%;">${escapeHtmlComent(userName)}</span>
                    <span class="comentario-fecha" style="color: #888; font-size: 0.75rem; font-weight: 500;">${fecha}${badgeEditado}</span>
                </div>
                <div class="comentario-texto" data-raw="${encodeURIComponent(c.texto || '')}" style="color: #eee; font-size: 0.95rem; line-height: 1.5; word-wrap: break-word;">${contenidoHtml}</div>
            </div>
        </div>
    `;
}

// ============================================
// LÓGICA DE EDICIÓN DE COMENTARIO
// ============================================
window.iniciarEdicion = function(commentId) {
    const textContainer = document.querySelector(`#comment-${commentId} .comentario-texto`);
    if (!textContainer || textContainer.classList.contains('editing')) return;
    
    const rawText = decodeURIComponent(textContainer.getAttribute('data-raw') || '');
    
    textContainer.setAttribute('data-original-html', textContainer.innerHTML);
    textContainer.classList.add('editing');
    
    const plainText = rawText.replace(/\[Sticker\]\([^)]+\)/g, '').trim();

    textContainer.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:8px; margin-top:8px;">
            <textarea id="edit-input-${commentId}" style="width: 100%; background: rgba(5,5,10,0.6); border: 1px solid var(--neon-primary); border-radius: 8px; padding: 10px; color: white; font-family: 'Poppins', sans-serif; resize: vertical; min-height: 60px; outline:none;" onfocus="this.style.boxShadow='0 0 10px rgba(0,255,247,0.3)'" onblur="this.style.boxShadow='none'">${escapeHtmlComent(plainText)}</textarea>
            <div style="display:flex; gap:8px; justify-content: flex-end;">
                <button onclick="cancelarEdicion('${commentId}')" style="background: transparent; border: 1px solid #888; color: #aaa; padding: 6px 16px; border-radius: 20px; cursor: pointer; font-size: 0.8rem; font-weight: bold; transition:0.2s;" onmouseover="this.style.color='#fff'; this.style.borderColor='#fff'" onmouseout="this.style.color='#aaa'; this.style.borderColor='#888'">Cancelar</button>
                <button onclick="guardarEdicion('${commentId}')" style="background: var(--neon-primary); border: none; color: black; padding: 6px 16px; border-radius: 20px; cursor: pointer; font-weight: bold; font-size: 0.8rem; transition:0.2s;" onmouseover="this.style.background='#fff'" onmouseout="this.style.background='var(--neon-primary)'">Guardar</button>
            </div>
        </div>
    `;
};

window.cancelarEdicion = function(commentId) {
    const textContainer = document.querySelector(`#comment-${commentId} .comentario-texto`);
    if (!textContainer) return;
    textContainer.innerHTML = textContainer.getAttribute('data-original-html');
    textContainer.classList.remove('editing');
};

window.guardarEdicion = async function(commentId) {
    const input = document.getElementById(`edit-input-${commentId}`);
    if (!input) return;
    const nuevoTexto = input.value.trim();

    try {
        const docRef = comentariosDb.collection('comments').doc(commentId);
        const doc = await docRef.get();
        if(doc.exists) {
            const data = doc.data();
            let textoFinal = nuevoTexto;
            
            if (data.esSticker && data.stickerUrl) {
                textoFinal += (nuevoTexto ? '\n' : '') + `[Sticker](${data.stickerUrl})`;
            }
            
            await docRef.update({
                texto: textoFinal,
                editado: true
            });
            showToastComent('✏️ Comentario actualizado');
        }
    } catch (error) {
        console.error(error);
        alert("Error al editar el comentario: " + error.message);
    }
};

window.reportarComentario = function(id) {
    if(!comentariosCurrentUser) {
        openLoginModalFromComent();
        return;
    }
    showToastComent('🚩 Comentario reportado. Un moderador lo revisará.');
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
        <div class="comentario-sticker-container" style="margin-top: 8px; display: block; width: fit-content;">
            <${tag} src="${url}" class="comentario-sticker" onclick="openStickerModal('${url.replace(/'/g, "\\'")}')" style="max-width: 140px; max-height: 140px; border-radius: 8px; cursor: pointer; border: 1px solid rgba(0, 255, 247, 0.2); transition: transform 0.2s;" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'" title="Ver/Robar Sticker"></${isVideo ? 'video' : 'img'}>
        </div>`;
    });

    const palabras = html.split(/(\s+)/);
    for (let i = 0; i < palabras.length; i++) {
        let palabra = palabras[i];
        if (palabra.startsWith('http://') || palabra.startsWith('https://')) {
            if (palabra.match(/\.(jpg|jpeg|png|gif|webp|avif)(\?.*)?$/i) && !palabra.includes('class="comentario-sticker"')) {
                palabras[i] = `<img src="${palabra}" class="comentario-imagen" loading="lazy" style="max-width: 200px; border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.1); margin-top: 8px; display: block;">`;
            } else if (palabra.match(/\.(mp4|webm)(\?.*)?$/i) && !palabra.includes('class="comentario-sticker"')) {
                palabras[i] = `<video src="${palabra}" autoplay loop muted playsinline class="comentario-imagen" style="max-width: 200px; border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.1); margin-top: 8px; display: block;"></video>`;
            } else if (!palabra.includes('class="comentario-sticker"')) {
                palabras[i] = `<a href="${palabra}" target="_blank" rel="noopener noreferrer" class="comentario-link" style="color: var(--neon-primary); text-decoration: none; transition: opacity 0.2s;">${palabra}</a>`;
            }
        }
    }
    return palabras.join('').replace(/^(<br>)+/, '').trim();
}

// ============================================
// LÓGICA PARA MOVER PANELES GLOBALES
// ============================================
window.restaurarPanelesGlobales = function() {
    const originalContainer = document.getElementById('comentarioFormContainer');
    const actionsDiv = originalContainer ? originalContainer.querySelector('.comentario-actions') : null;
    
    const previewEl = document.getElementById('comentarioStickerPreview');
    const emojiEl = document.getElementById('emojiPanel');
    const stickerEl = document.getElementById('stickerPanelFull');
    
    if (originalContainer && actionsDiv) {
        if(previewEl) originalContainer.insertBefore(previewEl, actionsDiv);
        if(emojiEl) originalContainer.insertBefore(emojiEl, actionsDiv);
        if(stickerEl) originalContainer.insertBefore(stickerEl, actionsDiv);
    }
    
    if(emojiEl) emojiEl.classList.remove('active');
    if(stickerEl) stickerEl.classList.remove('active');
};

window.prepararRespuesta = function(commentId, userName, userId) {
    if (!comentariosCurrentUser) return openLoginModalFromComent();
    
    cancelarRespuesta(true);
    window.respondiendoA = { id: commentId, userName, userId };
    
    const commentEl = document.getElementById(`comment-${commentId}`);
    if (!commentEl) return;
    
    commentEl.classList.add('replying-active');
    
    const replyBox = document.createElement('div');
    replyBox.id = `dynamicReplyBox-${commentId}`;
    replyBox.style.cssText = "margin-top: 8px; margin-bottom: 20px; padding: 12px; background: rgba(20, 20, 25, 0.9); border-radius: 12px; display: flex; flex-direction: column; gap: 8px; animation: fadeInReplyBox 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275); margin-left: 20px; border: 1px solid var(--neon-secondary); box-shadow: 0 0 15px rgba(188, 19, 254, 0.1);";
    
    replyBox.innerHTML = `
        <div style="color:#888; font-size:0.8rem; display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
            <span>Respondiendo a <b style="color:var(--neon-primary)">@${escapeHtmlComent(userName)}</b></span>
            <button onclick="cancelarRespuesta()" style="background:none; border:none; color:#666; cursor:pointer; font-size: 1rem; transition: 0.2s;" onmouseover="this.style.color='#ff5555'" onmouseout="this.style.color='#666'" title="Cancelar"><i class="fas fa-times"></i></button>
        </div>
        <div style="display: flex; gap: 10px; align-items: flex-start;">
            <img src="${comentariosCurrentUser?.photoURL || 'invitado.avif'}" style="width:30px; height:30px; border-radius:50%; object-fit:cover; border: 1px solid var(--neon-primary);">
            <div style="flex: 1; display: flex; flex-direction: column;">
                <textarea id="dynamicReplyText-${commentId}" placeholder="Añade una respuesta pública..." maxlength="500" style="width: 100%; background: transparent; border: none; border-bottom: 1px solid rgba(255,255,255,0.1); padding: 4px 0; color: white; font-family: 'Poppins', sans-serif; font-size: 0.9rem; resize: none; min-height: 25px; outline: none; transition: border-color 0.3s; overflow:hidden;" onfocus="this.style.borderBottomColor='var(--neon-primary)';" onblur="this.style.borderBottomColor='rgba(255,255,255,0.1)';"></textarea>
                
                <div style="display: flex; gap: 8px; margin-top: 8px; align-items: center;">
                    <button type="button" class="emoji-btn" onclick="toggleEmojiPanelSistema()" style="background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px; padding: 4px 10px; cursor: pointer; color: white; transition: 0.2s;" onmouseover="this.style.borderColor='var(--neon-primary)'; this.style.color='var(--neon-primary)';" onmouseout="this.style.borderColor='rgba(255,255,255,0.1)'; this.style.color='white';">😊</button>
                    <button type="button" class="sticker-btn" onclick="toggleStickerPanelSistema()" style="background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px; padding: 4px 10px; cursor: pointer; color: white; font-size: 1.1rem; transition: 0.2s;" onmouseover="this.style.borderColor='var(--neon-primary)'; this.style.color='var(--neon-primary)';" onmouseout="this.style.borderColor='rgba(255,255,255,0.1)'; this.style.color='white';">🖼️</button>
                </div>

                <div id="dynamicPanelsDest-${commentId}" style="width: 100%; margin-top: 10px;"></div>

                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px;">
                    <span id="dynamicCharCount-${commentId}" class="char-counter">0/500</span>
                    <button id="btnEnviarRespuesta-${commentId}" onclick="enviarRespuestaDinamica()" class="btn-disabled" style="background: var(--neon-primary); border: none; color: #000; font-weight: 700; padding: 6px 16px; border-radius: 20px; font-size: 0.85rem; cursor: pointer; transition: 0.2s; box-shadow: 0 0 10px rgba(0, 243, 255, 0.4);"><i class="fas fa-paper-plane" style="margin-right: 4px;"></i> Responder</button>
                </div>
            </div>
        </div>
    `;
    
    commentEl.parentNode.insertBefore(replyBox, commentEl.nextSibling);
    
    const panelDest = document.getElementById(`dynamicPanelsDest-${commentId}`);
    const previewEl = document.getElementById('comentarioStickerPreview');
    const emojiEl = document.getElementById('emojiPanel');
    const stickerEl = document.getElementById('stickerPanelFull');

    if (panelDest) {
        if(previewEl) panelDest.appendChild(previewEl);
        if(emojiEl) panelDest.appendChild(emojiEl);
        if(stickerEl) panelDest.appendChild(stickerEl);
    }
    
    if(emojiEl) emojiEl.classList.remove('active');
    if(stickerEl) stickerEl.classList.remove('active');
    
    const textArea = document.getElementById(`dynamicReplyText-${commentId}`);
    const btnEnviar = document.getElementById(`btnEnviarRespuesta-${commentId}`);
    const charCount = document.getElementById(`dynamicCharCount-${commentId}`);
    
    if(textArea) {
        textArea.focus();
        
        textArea.addEventListener('input', function() {
            autoResizeTextarea(this);
            const len = this.value.length;
            charCount.innerText = len + '/500';
            if(len >= 500) charCount.classList.add('limit');
            else charCount.classList.remove('limit');
            
            validarBotonPrincipal(this);
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

window.cancelarRespuesta = function(forzarSync = false) {
    const replyContext = window.respondiendoA;
    let box = replyContext ? document.getElementById(`dynamicReplyBox-${replyContext.id}`) : document.querySelector('[id^="dynamicReplyBox-"]');

    window.respondiendoA = null;
    document.querySelectorAll('.replying-active').forEach(el => el.classList.remove('replying-active'));

    restaurarPanelesGlobales();
    quitarStickerPreview();

    if (box) {
        if (forzarSync) {
            box.remove();
        } else {
            box.id = 'removing-' + Date.now();
            box.style.opacity = '0';
            box.style.transform = 'translateY(-10px)';
            setTimeout(() => { if(box.parentNode) box.remove() }, 200);
        }
    }
};

window.openStickerModal = function(url) {
    let modal = document.getElementById('stickerViewModal');
    
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'stickerViewModal';
        modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(5,5,5,0.95);backdrop-filter: blur(5px);z-index:100000;display:flex;flex-direction:column;align-items:center;justify-content:center;opacity:0;transition:opacity 0.2s;padding: 20px;';
        modal.innerHTML = `
            <div style="position:relative; text-align:center; max-width: 90vw;">
                <button onclick="closeStickerModal()" style="position:absolute;top:-40px;right:-10px;background:none;border:none;color:#fff;font-size:2rem;cursor:pointer; transition: 0.2s;" onmouseover="this.style.color='#ff0055'; transform='scale(1.1)';" onmouseout="this.style.color='#fff'; transform='scale(1)';">&times;</button>
                <img id="stickerModalImg" src="" style="display:none; max-width:100%;max-height:65vh;border-radius:12px; object-fit:contain; border: 1px solid rgba(0,255,247,0.3); box-shadow: 0 0 30px rgba(0, 255, 247, 0.2);">
                <video id="stickerModalVid" src="" autoplay loop muted playsinline style="display:none; max-width:100%;max-height:65vh;border-radius:12px; object-fit:contain; border: 1px solid rgba(0,255,247,0.3); box-shadow: 0 0 30px rgba(0, 255, 247, 0.2);"></video>
                <br>
                <button id="stickerModalStealBtn" style="margin-top:20px;background:rgba(0, 255, 247, 0.1);border:1px solid #00fff7;color:#fff;padding:10px 25px;border-radius:30px;font-size:1rem;cursor:pointer;font-weight:700;font-family:'Poppins',sans-serif;transition:all 0.2s;">
                    🖼️ Robar Sticker
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

window.validarBotonPrincipal = function(textarea) {
    if(!textarea) return;

    const isReplyBox = textarea.id.startsWith('dynamicReplyText');
    const btnId = isReplyBox && window.respondiendoA ? `btnEnviarRespuesta-${window.respondiendoA.id}` : 'enviarComentarioBtn';
    const btn = document.getElementById(btnId);
    
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

async function enviarComentarioTexto() {
    if (!comentariosCurrentUser) return openLoginModalFromComent();
    const textoInput = document.getElementById('comentarioTexto');
    if (!textoInput) return;
    
    const texto = textoInput.value.trim();
    const stickerUrl = window.stickerSeleccionadoParaEnviar;
    
    const btn = document.getElementById('enviarComentarioBtn');
    if (btn && btn.classList.contains('btn-disabled')) return;
    
    if (btn) {
        btn.disabled = true;
        btn.dataset.original = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';
    }
    
    let textoFinal = texto + (stickerUrl ? ((texto ? '\n' : '') + `[Sticker](${stickerUrl})`) : '');
    
    textoInput.value = '';
    textoInput.style.height = 'auto';
    quitarStickerPreview();
    validarBotonPrincipal(textoInput);

    try {
        const docRef = await comentariosDb.collection('comments').add({
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
        
        window.lastPostedCommentId = docRef.id;
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

window.enviarRespuestaDinamica = async function() {
    if (!comentariosCurrentUser) return openLoginModalFromComent();
    
    const replyContext = window.respondiendoA ? { ...window.respondiendoA } : null;
    if (!replyContext) return;

    const textoInput = document.getElementById(`dynamicReplyText-${replyContext.id}`);
    if (!textoInput) return;
    
    const texto = textoInput.value.trim();
    const stickerUrl = window.stickerSeleccionadoParaEnviar;

    if (!texto && !stickerUrl) return;

    const btn = document.getElementById(`btnEnviarRespuesta-${replyContext.id}`);
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    }
    textoInput.disabled = true;
    
    let textoFinal = texto + (stickerUrl ? ((texto ? '\n' : '') + `[Sticker](${stickerUrl})`) : '');
    
    quitarStickerPreview();

    try {
        const docRef = await comentariosDb.collection('comments').add({
            animeId: window.comentariosAnimeId,
            season: parseInt(window.comentariosSeason),
            episode: parseInt(window.comentariosEpisode),
            userId: comentariosCurrentUser.uid,
            userName: comentariosCurrentUser.displayName || comentariosCurrentUser.email.split('@')[0],
            userAvatar: comentariosCurrentUser.photoURL || 'invitado.avif',
            texto: textoFinal,
            esSticker: !!stickerUrl,
            stickerUrl: stickerUrl || null,
            replyToId: replyContext.id,
            replyToUser: replyContext.userName,
            replyToUserId: replyContext.userId,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        window.lastPostedCommentId = docRef.id;
        
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
    
    previewContainer.style.display = 'block';
    const panel = document.getElementById('stickerPanelFull');
    if (panel) panel.classList.remove('active');
    
    const targetTextareaId = window.respondiendoA ? `dynamicReplyText-${window.respondiendoA.id}` : 'comentarioTexto';
    const targetTextarea = document.getElementById(targetTextareaId);
    if(targetTextarea) validarBotonPrincipal(targetTextarea);
};

window.quitarStickerPreview = function() {
    window.stickerSeleccionadoParaEnviar = null;
    
    const previewContainer = document.getElementById('comentarioStickerPreview');
    const previewImg = document.getElementById('previewStickerImgObj');
    const previewVid = document.getElementById('previewStickerVidObj');
    
    if(previewContainer) previewContainer.style.display = 'none';
    if(previewImg) previewImg.src = '';
    if(previewVid) previewVid.src = '';
    
    const targetTextareaId = window.respondiendoA ? `dynamicReplyText-${window.respondiendoA.id}` : 'comentarioTexto';
    const targetTextarea = document.getElementById(targetTextareaId);
    if(targetTextarea) validarBotonPrincipal(targetTextarea);
};

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
    const targetTextareaId = window.respondiendoA ? `dynamicReplyText-${window.respondiendoA.id}` : 'comentarioTexto';
    const textarea = document.getElementById(targetTextareaId);
    
    if (textarea) {
        const start = textarea.selectionStart;
        const text = textarea.value;
        
        textarea.value = text.substring(0, start) + emoji + text.substring(start);
        textarea.focus();
        textarea.dispatchEvent(new Event('input'));
    }
}

function showToastComent(msg) {
    let toast = document.getElementById('toastComent');
    
    if (!toast) {
        toast = document.createElement('div'); 
        toast.id = 'toastComent';
        toast.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:rgba(15, 15, 20, 0.95);backdrop-filter: blur(10px);color:var(--neon-primary);padding:12px 25px;border-radius:30px;z-index:10000;font-weight:bold;border: 1px solid var(--neon-primary);box-shadow: 0 0 20px rgba(0, 243, 255, 0.3); transition: all 0.3s;';
        document.body.appendChild(toast);
    }
    toast.innerHTML = msg; 
    toast.style.display = 'block';
    setTimeout(() => toast.style.display = 'none', 3000);
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