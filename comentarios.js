// ============================================
// SISTEMA DE COMENTARIOS MEJORADO (NEÓN CYBERPUNK HD)
// ============================================

let comentariosDb = null;
let comentariosAuth = null;
let comentariosCurrentUser = null;
let comentariosUnsubscribe = null;

window.stickerSeleccionadoParaEnviar = null;

function initComentariosSystem(db, auth) {
    comentariosDb = db;
    comentariosAuth = auth;

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

function getNeonColorByString(str) {
    const neonColors = [
        '#00fff7', '#ff0055', '#bc13fe', '#00ff33', '#ffff00', '#ffaa00', '#ff00aa', '#00aaff'
    ];
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
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
    if (comentariosUnsubscribe) {
        comentariosUnsubscribe();
    }
    
    const commentsRef = comentariosDb.collection('comments')
        .where('animeId', '==', window.comentariosAnimeId)
        .where('season', '==', parseInt(window.comentariosSeason))
        .where('episode', '==', parseInt(window.comentariosEpisode))
        .orderBy('timestamp', 'desc')
        .limit(50);

    comentariosUnsubscribe = commentsRef.onSnapshot((snapshot) => {
        const container = document.getElementById('comentariosList');
        
        if (snapshot.empty) {
            container.innerHTML = `<div class="empty-comments" style="color: var(--primary-color); text-shadow: 0 0 10px var(--primary-color);"><i class="fas fa-comment-dots" style="font-size: 3rem; margin-bottom: 15px; display: block; opacity: 0.5;"></i><p style="font-weight: bold; font-size: 1.1rem;">Sin comentarios aún. ¡Sé el primero en la base de datos!</p></div>`;
            return;
        }
        
        let html = '';
      
        snapshot.forEach(doc => {
            const c = doc.data();
            let fecha = 'Justo ahora';
            
            if (c.timestamp?.toDate) {
                fecha = obtenerTiempoRelativo(c.timestamp.toDate());
            }
            
            const isOwner = comentariosCurrentUser?.uid === c.userId;
            const avatar = c.userAvatar || 'invitado.avif';
            const userName = c.userName || 'Usuario';
            
            const neonColor = getNeonColorByString(c.userId || userName);
            const rgbColor = hexToRgbStr(neonColor);
            
            let contenidoHtml = procesarTextoComentario(c.texto || '');

            if (c.esSticker && c.stickerUrl && !contenidoHtml.includes(c.stickerUrl)) {
                const isVideo = c.stickerUrl.match(/\.(mp4|webm)$/i);
                if (isVideo) {
                     contenidoHtml += `
                        <div class="comentario-sticker-container" style="margin-top: 10px; display: inline-block;">
                            <video src="${c.stickerUrl}" autoplay loop muted playsinline class="comentario-sticker" onclick="openStickerModal('${c.stickerUrl.replace(/'/g, "\\'")}')" style="max-width: 200px; max-height: 200px; border-radius: 12px; cursor: pointer; box-shadow: 0 8px 20px rgba(0,0,0,0.6); transition: transform 0.2s, box-shadow 0.2s;" onmouseover="this.style.transform='scale(1.08)'; this.style.boxShadow='0 10px 25px ${neonColor}80';" onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='0 8px 20px rgba(0,0,0,0.6)';" title="Clic para ver y robar"></video>
                        </div>
                    `;
                } else {
                     contenidoHtml += `
                        <div class="comentario-sticker-container" style="margin-top: 10px; display: inline-block;">
                            <img src="${c.stickerUrl}" class="comentario-sticker" loading="lazy" onclick="openStickerModal('${c.stickerUrl.replace(/'/g, "\\'")}')" style="max-width: 200px; max-height: 200px; border-radius: 12px; cursor: pointer; box-shadow: 0 8px 20px rgba(0,0,0,0.6); transition: transform 0.2s, box-shadow 0.2s;" onmouseover="this.style.transform='scale(1.08)'; this.style.boxShadow='0 10px 25px ${neonColor}80';" onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='0 8px 20px rgba(0,0,0,0.6)';" title="Clic para ver y robar">
                        </div>
                    `;
                }
            }
            
            // REDISEÑO VIP A LOS ITEMS DE LOS COMENTARIOS
            html += `
                <div class="comentario-item" style="background: linear-gradient(145deg, rgba(15,15,20,0.95), rgba(5,5,10,0.95)); border: 1px solid rgba(${rgbColor}, 0.3); box-shadow: 0 8px 20px rgba(0,0,0,0.6), inset 0 0 15px rgba(${rgbColor}, 0.08); animation: fadeIn 0.4s ease-out forwards; border-radius: 16px; margin-bottom: 15px; padding: 16px 20px; display: flex; gap: 15px; transition: transform 0.2s ease, box-shadow 0.2s ease;" onmouseover="this.style.transform='translateY(-3px)'; this.style.boxShadow='0 12px 25px rgba(0,0,0,0.8), inset 0 0 20px rgba(${rgbColor}, 0.15)';" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 8px 20px rgba(0,0,0,0.6), inset 0 0 15px rgba(${rgbColor}, 0.08)';">
            
                    <div class="comentario-avatar">
                        <img src="${avatar}" onerror="this.src='invitado.avif'" style="width: 50px; height: 50px; border-radius: 50%; object-fit: cover; border: 2px solid ${neonColor}; box-shadow: 0 0 15px rgba(${rgbColor}, 0.5);">
                    </div>
                   <div class="comentario-content" style="flex: 1; min-width: 0;">
   
                        <div class="comentario-header" style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px; border-bottom: 1px dashed rgba(${rgbColor}, 0.3); padding-bottom: 8px;">
                            <span class="comentario-user" style="color: #fff; text-shadow: 0 0 5px ${neonColor}, 0 0 15px ${neonColor}; font-weight: 900; font-family: 'Orbitron', sans-serif; letter-spacing: 1px; font-size: 1.1rem;">${escapeHtmlComent(userName)}</span>
                            <span class="comentario-fecha" style="color: #888; font-size: 0.8rem; font-weight: 600;">${fecha}</span>
                            ${isOwner ? `<button class="comentario-delete" onclick="deleteComentario('${doc.id}')" title="Eliminar" style="margin-left: auto; background: rgba(255,85,85,0.15); border: 1px solid #ff5555; color: #ff5555; border-radius: 8px; padding: 4px 10px; cursor: pointer; transition: 0.2s; font-weight: bold; box-shadow: 0 0 8px rgba(255,85,85,0.4);" onmouseover="this.style.background='#ff5555'; this.style.color='#fff';" onmouseout="this.style.background='rgba(255,85,85,0.15)'; this.style.color='#ff5555';">✖</button>` : ''}
                        </div>
                        <div class="comentario-texto" style="color: #eee; font-size: 1rem; line-height: 1.6; text-shadow: 0 1px 3px #000; letter-spacing: 0.3px;">${contenidoHtml}</div>
                    </div>
                </div>
            `;
        });
        
        container.innerHTML = html;
    }, (error) => {
        console.error('Error en comentarios:', error);
    });
}

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
    for (const [code, emoji] of Object.entries(emojisMap)) {
        html = html.split(code).join(emoji);
    }
    
    html = html.replace(/\n{2,}/g, '\n').replace(/\n/g, '<br>');

    const stickerRegex = /\[Sticker\]\(([^)]+)\)/g;
    html = html.replace(stickerRegex, (match, url) => {
        const isVideo = url.match(/\.(mp4|webm)$/i);
        if (isVideo) {
            return `
            <div class="comentario-sticker-container" style="margin-top: 10px; display: inline-block;">
                <video src="${url}" autoplay loop muted playsinline class="comentario-sticker" onclick="openStickerModal('${url.replace(/'/g, "\\'")}')" style="max-width: 200px; max-height: 200px; border-radius: 12px; cursor: pointer; box-shadow: 0 8px 20px rgba(0,0,0,0.6); transition: transform 0.2s; border: 1px solid rgba(0, 255, 247, 0.2);" onmouseover="this.style.transform='scale(1.08)'" onmouseout="this.style.transform='scale(1)'" title="Clic para ver y robar"></video>
            </div>
            `;
        } else {
             return `
            <div class="comentario-sticker-container" style="margin-top: 10px; display: inline-block;">
                <img src="${url}" class="comentario-sticker" loading="lazy" onclick="openStickerModal('${url.replace(/'/g, "\\'")}')" style="max-width: 200px; max-height: 200px; border-radius: 12px; cursor: pointer; box-shadow: 0 8px 20px rgba(0,0,0,0.6); transition: transform 0.2s; border: 1px solid rgba(0, 255, 247, 0.2);" onmouseover="this.style.transform='scale(1.08)'" onmouseout="this.style.transform='scale(1)'" title="Clic para ver y robar">
            </div>
            `;
        }
    });

    const palabras = html.split(/(\s+)/);
    for (let i = 0; i < palabras.length; i++) {
        let palabra = palabras[i];
        if (palabra.startsWith('http://') || palabra.startsWith('https://')) {
             if (palabra.match(/\.(jpg|jpeg|png|gif|webp|avif)(\?.*)?$/i) && !palabra.includes('class="comentario-sticker"')) {
                palabras[i] = `<img src="${palabra}" class="comentario-imagen" loading="lazy" style="max-width: 200px; border-radius: 8px; border: 1px solid rgba(0, 255, 247, 0.3); margin-top: 10px;">`;
            } else if (palabra.match(/\.(mp4|webm)(\?.*)?$/i) && !palabra.includes('class="comentario-sticker"')) {
                palabras[i] = `<video src="${palabra}" autoplay loop muted playsinline class="comentario-imagen" style="max-width: 200px; border-radius: 8px; border: 1px solid rgba(0, 255, 247, 0.3); margin-top: 10px;"></video>`;
            }
            else if (!palabra.includes('class="comentario-sticker"')) {
                palabras[i] = `<a href="${palabra}" target="_blank" rel="noopener noreferrer" class="comentario-link" style="color: #00fff7; text-shadow: 0 0 5px rgba(0,255,247,0.5);">${palabra}</a>`;
            }
        }
    }
    
    html = palabras.join('').replace(/^(<br>)+/, '').trim();
    return html;
}

// === SISTEMA DE POP-UP PARA VER STICKERS ===
window.openStickerModal = function(url) {
    let modal = document.getElementById('stickerViewModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'stickerViewModal';
        modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(5,5,5,0.9);backdrop-filter:blur(10px);z-index:100000;display:flex;flex-direction:column;align-items:center;justify-content:center;opacity:0;transition:opacity 0.3s; padding: 20px;';
        modal.innerHTML = `
            <div style="position:relative; text-align:center; max-width: 90vw;">
                <button onclick="closeStickerModal()" style="position:absolute;top:-45px;right:0;background:none;border:none;color:#fff;font-size:2.5rem;cursor:pointer;text-shadow:0 0 10px #ff0055; transition: 0.2s;" onmouseover="this.style.color='#ff0055'" onmouseout="this.style.color='#fff'">&times;</button>
                
                <img id="stickerModalImg" src="" style="display:none; max-width:100%;max-height:65vh;border-radius:15px;box-shadow:0 0 40px rgba(0,255,247,0.4); object-fit:contain; border: 1px solid rgba(0,255,247,0.3);">
                <video id="stickerModalVid" src="" autoplay loop muted playsinline style="display:none; max-width:100%;max-height:65vh;border-radius:15px;box-shadow:0 0 40px rgba(0,255,247,0.4); object-fit:contain; border: 1px solid rgba(0,255,247,0.3);"></video>
                
                <br>
                <button id="stickerModalStealBtn" style="margin-top:25px;background:linear-gradient(135deg, rgba(0,255,247,0.1), rgba(188,19,254,0.1));border:1px solid #00fff7;color:#fff;padding:12px 30px;border-radius:30px;font-size:1.1rem;cursor:pointer;font-weight:900;font-family:'Orbitron',sans-serif;box-shadow:0 0 20px rgba(0,255,247,0.4), inset 0 0 10px rgba(0,255,247,0.2);transition:all 0.3s;letter-spacing:1px;text-transform:uppercase;">
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
            document.getElementById('stickerModalVid').src = ''; // Cortar video al cerrar
        }, 300);
    }
};

async function enviarComentarioTexto() {
    if (!comentariosCurrentUser) {
        openLoginModalFromComent();
        return;
    }
    
    const texto = document.getElementById('comentarioTexto').value.trim();
    const stickerUrl = window.stickerSeleccionadoParaEnviar;

    if (!texto && !stickerUrl) {
        showToastComent('⚠️ No puedes enviar un comentario vacío');
        return;
    }
    
    const btn = document.getElementById('enviarComentarioBtn');
    btn.disabled = true;
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';
    
    let textoFinal = texto;
    if (stickerUrl) {
        textoFinal += (textoFinal ? '\n' : '') + `[Sticker](${stickerUrl})`;
    }
    
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
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });

        document.getElementById('comentarioTexto').value = '';
        quitarStickerPreview();
        showToastComent('✅ Comentario enviado con éxito');
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
};

window.quitarStickerPreview = function() {
    window.stickerSeleccionadoParaEnviar = null;
    document.getElementById('comentarioStickerPreview').style.display = 'none';
    document.getElementById('previewStickerImgObj').src = '';
    document.getElementById('previewStickerVidObj').src = '';
};

async function deleteComentario(commentId) {
    if (!confirm('¿Seguro que deseas eliminar este comentario?')) return;
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
    }
}

function showToastComent(msg) {
    let toast = document.getElementById('toastComent');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toastComent';
        toast.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#0f0f13;color:#00fff7;padding:12px 25px;border-radius:30px;z-index:1000;font-weight:bold;box-shadow:0 0 20px rgba(0,255,247,0.5); border: 1px solid #00fff7; transition: all 0.3s;';
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